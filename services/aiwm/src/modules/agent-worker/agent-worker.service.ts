import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { ConfigKey } from '@hydrabyte/shared';
import {
  AgentWorkerCmdEvent,
  InstructionUpdatedEvent,
  REDIS_CHANNEL_AGENT_WORKER_CMD,
  REDIS_CHANNEL_INSTRUCTION_UPDATED,
  redisConfig,
} from '../../config/redis.config';
import { Agent, AgentDocument } from '../agent/agent.schema';
import { AgentService } from '../agent/agent.service';
import { ActionService } from '../action/action.service';
import { ConfigService } from '../configuration/config.service';
import { FileService } from '../file/file.service';
import { AgentRunner } from './agent-runner';
import { AgentLockService } from './agent-lock.service';
import { CbmKnowledgeService } from './cbm-knowledge.service';

/** Hash the fields that actually affect runner behavior */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function agentConfigHash(agent: any): string {
  const key = JSON.stringify({
    instructionId: agent.instructionId,
    deploymentId: agent.deploymentId,
    settings: agent.settings,
    allowedToolIds: agent.allowedToolIds,
    allowedFunctions: agent.allowedFunctions,
  });
  return createHash('md5').update(key).digest('hex');
}

const HEALTH_CHECK_INTERVAL_MS = 30_000;

/**
 * AgentWorkerService — orchestrates all hosted agent runners.
 *
 * Scaling strategy (Option B — Redis distributed lock):
 * - On startup, each `agt` instance tries to acquire a lock per agent.
 * - Only the instance that wins the lock spawns the runner for that agent.
 * - Locks are renewed every 15s (TTL 45s) to prevent expiry while alive.
 * - On instance crash/shutdown, locks expire → other instances pick them up
 *   on the next health check cycle.
 */
@Injectable()
export class AgentWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentWorkerService.name);
  private readonly runners = new Map<string, AgentRunner>();
  private readonly runnerConfigHash = new Map<string, string>();
  private healthCheckTimer: NodeJS.Timeout | null = null;

  /** Shared Redis client for publish/set/get — shared across all runners */
  private redisPub: Redis | null = null;
  /** Dedicated Redis subscriber for instruction-updated events. */
  private redisSub: Redis | null = null;
  /** Dedicated Redis subscriber for on-demand worker commands (e.g. restart). */
  private redisCmdSub: Redis | null = null;
  /** Track in-flight on-demand restarts to dedup overlapping requests. */
  private readonly restartingSet = new Set<string>();
  /** Map of agentId → dedicated Redis client for BLPOP (blocking, one per runner) */
  private readonly redisBlockingMap = new Map<string, Redis>();
  private readonly agentIdFilter: string[];

  constructor(
    @InjectModel(Agent.name) private readonly agentModel: Model<AgentDocument>,
    private readonly lockService: AgentLockService,
    private readonly agentService: AgentService,
    private readonly actionService: ActionService,
    private readonly configService: ConfigService,
    private readonly fileService: FileService,
    private readonly cbmKnowledgeService: CbmKnowledgeService,
  ) {
    this.agentIdFilter = process.env.AGENT_IDS
      ? process.env.AGENT_IDS.split(',').filter(Boolean)
      : [];
  }

  async onModuleInit() {
    this.redisPub = new Redis(redisConfig);
    await this.lockService.connect();
    await this.spawnAgents();
    this.startHealthCheck();
    await this.startInstructionSubscriber();
    await this.startWorkerCmdSubscriber();
  }

  async onModuleDestroy() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    for (const [agentId, runner] of this.runners.entries()) {
      await runner.stopAsync();
      await this.lockService.release(agentId);
      this.redisBlockingMap.get(agentId)?.disconnect();
      this.redisBlockingMap.delete(agentId);
    }
    this.runners.clear();
    this.redisSub?.disconnect();
    this.redisSub = null;
    this.redisCmdSub?.disconnect();
    this.redisCmdSub = null;
    this.redisPub?.disconnect();
    this.redisPub = null;
    this.logger.log('All agent runners stopped');
  }

  private async spawnAgents() {
    const query: any = { type: 'assistant', isDeleted: { $ne: true } };
    if (this.agentIdFilter.length) {
      query._id = { $in: this.agentIdFilter };
    }

    const agents = await this.agentModel.find(query).select('+secret').lean();

    if (!agents.length) {
      this.logger.warn('No assistant agents found.');
      return;
    }

    this.logger.log(`Found ${agents.length} assistant agent(s). Competing for locks...`);

    await Promise.allSettled(
      agents.map((agent) => this.trySpawnRunner(agent as unknown as AgentDocument)),
    );

    this.logger.log(
      `Spawned ${this.runners.size}/${agents.length} runner(s) on this instance.`,
    );
  }

  /**
   * Try to acquire lock for an agent, then spawn runner if successful.
   * Silently skips if another instance already owns the lock.
   */
  private async trySpawnRunner(agent: AgentDocument) {
    const agentId = (agent as any)._id.toString();
    const acquired = await this.lockService.tryAcquire(agentId);

    if (!acquired) {
      this.logger.log(`Skipping agent ${agent.name} (${agentId}) — owned by another instance`);
      return;
    }

    await this.spawnRunner(agent);
  }

  private async spawnRunner(agent: AgentDocument) {
    const agentId = (agent as any)._id.toString();

    try {
      // connectInternal: in-process call, no secret needed, no HTTP round-trip through LB
      const connectResp = await this.agentService.connectInternal(agentId);

      const { accessToken, instruction, deployment, settings, mcpServers, allowedFunctions, ragEnabled, ragCollections, agentCode } = connectResp;

      this.logger.debug(
        `connectResp for ${agentId}: deployment=${JSON.stringify(deployment)}, mcpServers=${JSON.stringify(Object.keys(mcpServers || {}))}, allowedFunctions=${allowedFunctions?.length ?? 0}`,
      );

      const browserApiUrl = await this.configService.getString(ConfigKey.PINCHTAB_API_URL);
      const aiwmApiBaseUrl = await this.configService.getOrDefault(ConfigKey.AIWM_BASE_API_URL, undefined, 'http://localhost:3003');

      // Each runner needs its own blocking Redis connection for BLPOP
      const redisBlocking = new Redis(redisConfig);
      this.redisBlockingMap.set(agentId, redisBlocking);

      const runner = new AgentRunner({
        agentId,
        agentName: agent.name,
        accessToken,
        instruction,
        deployment,
        settings: settings || agent.settings || {},
        mcpServers: mcpServers || {},
        allowedFunctions: allowedFunctions || [],
        redisBlocking,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        redisPub: this.redisPub!,
        agentType: (agent.type as 'assistant' | 'engineer') ?? 'assistant',
        apiBaseUrl: aiwmApiBaseUrl,
        browserApiUrl: browserApiUrl ?? undefined,
        sendFileInternal: async (conversationId, filePath, caption) => {
          try {
            const { readFile } = await import('fs/promises');
            const buf = await readFile(filePath);
            const base64 = buf.toString('base64');
            const ext = filePath.split('.').pop() ?? 'bin';
            const mimeType = ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
            this.logger.debug(`[browser] sendFile conv=${conversationId} file=${filePath}`);
            // Publish via runner's Redis — runner exposes publishMessage for this purpose
            this.runners.get(agentId)?.publishMessage(conversationId, {
              type: 'file',
              content: caption,
              file: { data: base64, mimeType, filename: filePath.split('/').pop() ?? 'file' },
            });
          } catch (err) {
            this.logger.warn(`sendFileInternal failed: ${(err as Error).message}`);
          }
        },
        uploadFileInternal: (base64, filename, mimeType) =>
          this.fileService.uploadBase64(base64, filename, mimeType, agent.owner?.orgId).then((r) => r.fileUrl),
        connectInternal: (id) => this.agentService.connectInternal(id),
        heartbeatInternal: (id, status) =>
          this.agentService.heartbeat(id, { status }, accessToken),
        getHistoryInternal: async (conversationId: string) => {
          const systemContext = { userId: agentId, roles: [], orgId: '', groupId: '', agentId, appId: '' };
          const actions = await this.actionService.getLastActions(conversationId, 40, systemContext as any);
          return actions
            .filter((a: any) => {
              const role = a.actor?.role;
              return (role === 'user' || role === 'agent') && a.type === 'message';
            })
            .map((a: any) => ({
              role: a.actor?.role === 'agent' ? 'assistant' : 'user',
              content: a.content,
            }));
        },
        addLogInternal: (id, level, message, data) =>
          this.agentService.addLog(id, { level, message, data }).then(() => undefined),
        ragEnabled: ragEnabled ?? false,
        ragCollections: ragCollections ?? [],
        searchKnowledgeInternal: (collectionId, query, topK, minScore) =>
          this.cbmKnowledgeService.search(collectionId, query, topK, minScore, accessToken),
        agentCode: agentCode ?? undefined,
      });

      runner.start();
      this.runners.set(agentId, runner);
      this.runnerConfigHash.set(agentId, agentConfigHash(agent));
      this.logger.log(`Runner started: ${agent.name} (${agentId})`);
      await this.agentService.addLog(agentId, {
        level: 'info',
        message: 'Runner spawned',
        data: {
          deployment: deployment?.id,
          model: deployment?.model,
          mcpServers: Object.keys(mcpServers || {}),
          allowedFunctions: (allowedFunctions || []).length,
        },
      });
    } catch (err: unknown) {
      this.logger.error(`Failed to spawn runner for ${agent.name} (${agentId}): ${(err as Error).message}`);
      // Release lock so another instance can pick it up
      await this.lockService.release(agentId);
    }
  }

  /**
   * Health check — runs every 30s:
   * 1. Reconnect stale runners owned by this instance.
   * 2. Try to claim any unlocked agents (e.g. after another instance crashes).
   */
  private startHealthCheck() {
    this.healthCheckTimer = setInterval(async () => {
      // 1. Restart runners whose agent config changed and are idle
      await this.restartUpdatedAgents();

      // 2. Try to claim agents not yet owned by any instance
      await this.claimUnlockedAgents();
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Tear down a runner's in-memory state and Redis BLPOP connection.
   * Caller is responsible for awaiting the runner stop and respawning if needed.
   */
  private async teardownRunner(agentId: string, runner: AgentRunner): Promise<void> {
    await runner.stopAsync();
    this.redisBlockingMap.get(agentId)?.disconnect();
    this.redisBlockingMap.delete(agentId);
    this.runners.delete(agentId);
    this.runnerConfigHash.delete(agentId);
  }

  /**
   * Check if any running agent has been updated (updatedAt changed).
   * Restarts the runner only if the agent is currently idle.
   */
  private async restartUpdatedAgents() {
    if (!this.runners.size) return;

    const agentIds = [...this.runners.keys()];
    const agents = await this.agentModel
      .find({ _id: { $in: agentIds }, isDeleted: { $ne: true } })
      .lean()
      .catch(() => []);

    for (const agent of agents) {
      const agentId = (agent._id as { toString(): string }).toString();
      const runner = this.runners.get(agentId);
      if (!runner) continue;

      const knownHash = this.runnerConfigHash.get(agentId);
      const currentHash = agentConfigHash(agent);

      if (knownHash === currentHash) continue;

      if (runner.isBusy) {
        this.logger.log(`Agent ${agent.name} (${agentId}) config changed but is busy — will restart on next cycle`);
        continue;
      }

      this.logger.log(`Agent ${agent.name} (${agentId}) config changed, restarting runner...`);
      await this.agentService.addLog(agentId, { level: 'info', message: 'Runner restarted — config changed' });
      await this.teardownRunner(agentId, runner);
      await this.spawnRunner(agent as unknown as AgentDocument);
    }
  }

  /**
   * Subscribe to broadcast worker commands (e.g. on-demand restart).
   * Every `agt` instance listens; only the one currently holding the lock for
   * the targeted agent will act on the message.
   */
  private async startWorkerCmdSubscriber() {
    this.redisCmdSub = new Redis(redisConfig);
    try {
      await this.redisCmdSub.subscribe(REDIS_CHANNEL_AGENT_WORKER_CMD);
    } catch (err) {
      this.logger.error(`Failed to subscribe to ${REDIS_CHANNEL_AGENT_WORKER_CMD}: ${(err as Error).message}`);
      return;
    }

    this.redisCmdSub.on('message', (channel, raw) => {
      if (channel !== REDIS_CHANNEL_AGENT_WORKER_CMD) return;
      this.handleWorkerCmd(raw).catch((err: Error) =>
        this.logger.error(`handleWorkerCmd error: ${err.message}`, err.stack),
      );
    });

    this.logger.log(`Subscribed to ${REDIS_CHANNEL_AGENT_WORKER_CMD}`);
  }

  private async handleWorkerCmd(raw: string) {
    let event: AgentWorkerCmdEvent;
    try {
      event = JSON.parse(raw);
    } catch (err) {
      this.logger.warn(`Invalid agent-worker-cmd payload: ${(err as Error).message}`);
      return;
    }
    if (event?.type !== 'restart' || !event.agentId) return;

    const { agentId, requestedBy, reason } = event;
    if (!this.runners.has(agentId)) return; // not owned by this instance
    if (this.restartingSet.has(agentId)) {
      this.logger.debug(`[restart] dedup — already restarting ${agentId}`);
      return;
    }

    await this.restartRunnerOnDemand(agentId, requestedBy, reason);
  }

  /**
   * On-demand restart: abort in-flight work, tear down, re-fetch agent, respawn.
   * Unlike `restartUpdatedAgents`, this does NOT defer when the runner is busy —
   * `restart` semantics require an immediate hard reset with the latest DB config.
   */
  private async restartRunnerOnDemand(
    agentId: string,
    requestedBy: string,
    reason?: string,
  ): Promise<void> {
    this.restartingSet.add(agentId);
    try {
      const runner = this.runners.get(agentId);
      if (!runner) return;

      this.logger.log(`[restart] tearing down runner ${agentId} (requestedBy=${requestedBy})`);
      runner.abortAll(reason ?? 'restart');
      await this.teardownRunner(agentId, runner);

      const agent = await this.agentModel
        .findOne({ _id: agentId, isDeleted: { $ne: true } })
        .select('+secret')
        .lean()
        .catch(() => null);
      if (!agent) {
        this.logger.warn(`[restart] agent ${agentId} not found after teardown`);
        await this.lockService.release(agentId);
        return;
      }

      // Re-acquire the lock — between teardown and respawn another instance
      // could theoretically have claimed it. If we lost it, leave it alone.
      const reacquired = await this.lockService.tryAcquire(agentId);
      if (!reacquired) {
        this.logger.log(`[restart] lock no longer owned by this instance, skipping respawn`);
        return;
      }

      await this.spawnRunner(agent as unknown as AgentDocument);
      await this.agentService.addLog(agentId, {
        level: 'info',
        message: 'Runner restarted on-demand',
        data: { requestedBy, reason },
      });
    } catch (err) {
      this.logger.error(`[restart] failed for ${agentId}: ${(err as Error).message}`, (err as Error).stack);
    } finally {
      this.restartingSet.delete(agentId);
    }
  }

  /**
   * Query all assistant agents and try to claim any that are not locked.
   * Handles: new agents created after startup, or instance crashed releasing locks.
   */
  private async claimUnlockedAgents() {
    const query: any = { type: 'assistant', isDeleted: { $ne: true } };
    if (this.agentIdFilter.length) {
      query._id = { $in: this.agentIdFilter };
    }

    const agents = await this.agentModel.find(query).select('+secret').lean().catch(() => []);

    for (const agent of agents) {
      const agentId = (agent as any)._id.toString();
      if (this.runners.has(agentId)) continue; // Already running on this instance

      const acquired = await this.lockService.tryAcquire(agentId);
      if (acquired) {
        this.logger.log(`Claimed unlocked agent: ${agent.name} (${agentId})`);
        await this.agentService.addLog(agentId, { level: 'info', message: 'Runner claimed after unlock (failover or new agent)' });
        await this.spawnRunner(agent as unknown as AgentDocument);
      }
    }
  }

  /**
   * Subscribe to instruction-updated events and trigger runner reload for any
   * runner on this instance whose agent uses the updated instruction.
   */
  private async startInstructionSubscriber() {
    this.redisSub = new Redis(redisConfig);
    try {
      await this.redisSub.subscribe(REDIS_CHANNEL_INSTRUCTION_UPDATED);
    } catch (err) {
      this.logger.error(`Failed to subscribe to ${REDIS_CHANNEL_INSTRUCTION_UPDATED}: ${(err as Error).message}`);
      return;
    }

    this.redisSub.on('message', (channel, raw) => {
      if (channel !== REDIS_CHANNEL_INSTRUCTION_UPDATED) return;
      this.handleInstructionUpdated(raw).catch((err: Error) =>
        this.logger.error(`handleInstructionUpdated error: ${err.message}`, err.stack),
      );
    });

    this.logger.log(`Subscribed to ${REDIS_CHANNEL_INSTRUCTION_UPDATED}`);
  }

  private async handleInstructionUpdated(raw: string) {
    if (!this.runners.size) return;

    let event: InstructionUpdatedEvent;
    try {
      event = JSON.parse(raw);
    } catch (err) {
      this.logger.warn(`Invalid instruction-updated payload: ${(err as Error).message}`);
      return;
    }
    if (!event?.instructionId) return;

    const ownedAgentIds = [...this.runners.keys()];
    const agents = await this.agentModel
      .find({ _id: { $in: ownedAgentIds }, instructionId: event.instructionId, isDeleted: { $ne: true } })
      .select('_id')
      .lean()
      .catch(() => []);

    if (!agents.length) return;

    for (const agent of agents) {
      const agentId = (agent._id as { toString(): string }).toString();
      const runner = this.runners.get(agentId);
      if (!runner) continue;
      this.logger.log(`[instruction-updated] reloading agent ${agentId} (instructionId=${event.instructionId})`);
      await this.agentService.addLog(agentId, {
        level: 'info',
        message: 'Runner reload triggered — instruction updated',
        data: { instructionId: event.instructionId, updatedAt: event.updatedAt },
      });
      runner.triggerReload('event').catch((err: Error) =>
        this.logger.error(`triggerReload error for ${agentId}: ${err.message}`, err.stack),
      );
    }
  }
}
