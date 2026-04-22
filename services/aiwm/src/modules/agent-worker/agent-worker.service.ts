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

/** Extract numRunners from agent settings (default 1) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNumRunners(agent: any): number {
  const n = Number(agent?.settings?.['assistant_numRunners'] ?? 1);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

const HEALTH_CHECK_INTERVAL_MS = 30_000;

/**
 * AgentWorkerService — orchestrates all hosted agent runners.
 *
 * Multi-runner scaling (Phase 3):
 * - Each agent can have N runners (assistant_numRunners setting, default 1).
 * - All runners for an agent share the same Redis List queue (chat:task:{agentId}).
 * - Ordering per conversation is guaranteed by a conversation-level distributed lock
 *   (agt:conv:{conversationId}) acquired inside each runner before processing.
 * - runners Map key: "{agentId}:{index}" — allows multiple runners per agent.
 * - Runner registry (agt:runners:{agentId} Redis Set) tracks active runners across
 *   all instances for observability.
 *
 * Backward compat: numRunners=1 behaves identically to the old single-runner mode,
 * except the agent-level exclusive lock is no longer used (registry replaces it).
 */
@Injectable()
export class AgentWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentWorkerService.name);

  /**
   * Key: runnerId = "{agentId}:{index}"
   * Allows multiple runners per agent.
   */
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
  /** Map of runnerId → dedicated Redis client for BLPOP (blocking, one per runner) */
  private readonly redisBlockingMap = new Map<string, Redis>();
  private readonly agentIdFilter: string[];
  private readonly agentIdIgnore: string[];

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
    this.agentIdIgnore = process.env.AGENT_IGNORE_IDS
      ? process.env.AGENT_IGNORE_IDS.split(',').filter(Boolean)
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
    for (const [runnerId, runner] of this.runners.entries()) {
      const agentId = runnerIdToAgentId(runnerId);
      await runner.stopAsync();
      await this.lockService.unregisterRunner(agentId, runnerId);
      this.redisBlockingMap.get(runnerId)?.disconnect();
      this.redisBlockingMap.delete(runnerId);
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
    if (this.agentIdIgnore.length) {
      query._id = { ...(query._id ?? {}), $nin: this.agentIdIgnore };
    }

    const agents = await this.agentModel.find(query).select('+secret').lean();

    if (!agents.length) {
      this.logger.warn('No assistant agents found.');
      return;
    }

    const numRunnersList = agents.map((a) => getNumRunners(a));
    const totalRunners = numRunnersList.reduce((s, n) => s + n, 0);
    this.logger.log(`Found ${agents.length} assistant agent(s), spawning ${totalRunners} runner(s) total...`);

    await Promise.allSettled(
      agents.flatMap((agent, i) =>
        Array.from({ length: numRunnersList[i] }, (_, idx) =>
          this.spawnRunner(agent as unknown as AgentDocument, idx),
        ),
      ),
    );

    this.logger.log(`Spawned ${this.runners.size} runner(s) on this instance.`);
  }

  private async spawnRunner(agent: AgentDocument, runnerIndex: number) {
    const agentId = (agent as any)._id.toString();
    const runnerId = `${agentId}:${runnerIndex}`;

    try {
      const connectResp = await this.agentService.connectInternal(agentId);
      const { accessToken, instruction, deployment, settings, mcpServers, allowedFunctions, ragEnabled, ragCollections, agentCode } = connectResp;

      this.logger.debug(
        `connectResp for ${agentId} runner[${runnerIndex}]: deployment=${JSON.stringify(deployment)}, mcpServers=${JSON.stringify(Object.keys(mcpServers || {}))}, allowedFunctions=${allowedFunctions?.length ?? 0}`,
      );

      const browserApiUrl = await this.configService.getString(ConfigKey.PINCHTAB_API_URL);
      const aiwmApiBaseUrl = await this.configService.getOrDefault(ConfigKey.AIWM_BASE_API_URL, undefined, 'http://localhost:3003');

      const redisBlocking = new Redis(redisConfig);
      this.redisBlockingMap.set(runnerId, redisBlocking);

      const runner = new AgentRunner({
        agentId,
        runnerId,
        agentName: `${agent.name}[${runnerIndex}]`,
        accessToken,
        instruction,
        deployment,
        settings: settings || agent.settings || {},
        mcpServers: mcpServers || {},
        allowedFunctions: allowedFunctions || [],
        redisBlocking,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        redisPub: this.redisPub!,
        lockService: this.lockService,
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
            this.runners.get(runnerId)?.publishMessage(conversationId, {
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
      this.runners.set(runnerId, runner);
      this.runnerConfigHash.set(runnerId, agentConfigHash(agent));
      await this.lockService.registerRunner(agentId, runnerId);

      this.logger.log(`Runner started: ${agent.name}[${runnerIndex}] (${runnerId})`);
      await this.agentService.addLog(agentId, {
        level: 'info',
        message: `Runner[${runnerIndex}] spawned`,
        data: {
          runnerId,
          deployment: deployment?.id,
          model: deployment?.model,
          mcpServers: Object.keys(mcpServers || {}),
          allowedFunctions: (allowedFunctions || []).length,
        },
      });
    } catch (err: unknown) {
      this.logger.error(`Failed to spawn runner ${runnerId}: ${(err as Error).message}`);
    }
  }

  /**
   * Health check — runs every 30s:
   * 1. Restart runners whose agent config changed and are idle.
   * 2. Spawn runners for agents that have no runners on this instance.
   * 3. Proactively refresh access tokens that expire within 1 hour.
   */
  private startHealthCheck() {
    this.healthCheckTimer = setInterval(async () => {
      await this.restartUpdatedAgents();
      await this.claimUnlockedAgents();
      await this.refreshExpiredTokens();
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private async refreshExpiredTokens() {
    if (!this.runners.size) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const refreshThresholdSec = 60 * 60;

    for (const [runnerId, runner] of this.runners.entries()) {
      const exp = runner.getAccessTokenExpiry();
      if (exp === null) continue;

      const remainingSec = exp - nowSec;
      if (remainingSec > refreshThresholdSec) continue;

      this.logger.log(
        `[token-refresh] runner ${runnerId} token expires in ${Math.round(remainingSec / 60)}m — triggering reload`,
      );
      runner.triggerReload('health').catch((err: Error) =>
        this.logger.error(`[token-refresh] reload failed for ${runnerId}: ${err.message}`),
      );
    }
  }

  private async teardownRunner(runnerId: string, runner: AgentRunner): Promise<void> {
    const agentId = runnerIdToAgentId(runnerId);
    await runner.stopAsync();
    await this.lockService.unregisterRunner(agentId, runnerId);
    this.redisBlockingMap.get(runnerId)?.disconnect();
    this.redisBlockingMap.delete(runnerId);
    this.runners.delete(runnerId);
    this.runnerConfigHash.delete(runnerId);
  }

  private async restartUpdatedAgents() {
    if (!this.runners.size) return;

    // Collect unique agentIds owned by this instance
    const agentIds = [...new Set([...this.runners.keys()].map(runnerIdToAgentId))];
    const agents = await this.agentModel
      .find({ _id: { $in: agentIds }, isDeleted: { $ne: true } })
      .lean()
      .catch(() => []);

    for (const agent of agents) {
      const agentId = (agent._id as { toString(): string }).toString();
      const currentHash = agentConfigHash(agent);
      const numRunners = getNumRunners(agent);

      // Find all runners for this agent on this instance
      const agentRunners = [...this.runners.entries()].filter(
        ([rid]) => runnerIdToAgentId(rid) === agentId,
      );

      const configChanged = agentRunners.some(
        ([rid]) => this.runnerConfigHash.get(rid) !== currentHash,
      );
      if (!configChanged && agentRunners.length === numRunners) continue;

      const anyBusy = agentRunners.some(([, r]) => r.isBusy);
      if (anyBusy) {
        this.logger.log(`Agent ${agent.name} (${agentId}) config changed but has busy runners — will restart on next cycle`);
        continue;
      }

      this.logger.log(`Agent ${agent.name} (${agentId}) config changed or numRunners changed (${agentRunners.length}→${numRunners}), restarting runners...`);
      await this.agentService.addLog(agentId, { level: 'info', message: 'Runners restarted — config changed' });

      // Tear down all existing runners for this agent
      for (const [rid, runner] of agentRunners) {
        await this.teardownRunner(rid, runner);
      }

      // Respawn with new config and possibly new numRunners
      for (let i = 0; i < numRunners; i++) {
        await this.spawnRunner(agent as unknown as AgentDocument, i);
      }
    }
  }

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

    // Check if this instance owns any runners for this agent
    const agentRunnerIds = [...this.runners.keys()].filter(
      (rid) => runnerIdToAgentId(rid) === agentId,
    );
    if (!agentRunnerIds.length) return;

    if (this.restartingSet.has(agentId)) {
      this.logger.debug(`[restart] dedup — already restarting ${agentId}`);
      return;
    }

    await this.restartRunnerOnDemand(agentId, requestedBy, reason);
  }

  private async restartRunnerOnDemand(
    agentId: string,
    requestedBy: string,
    reason?: string,
  ): Promise<void> {
    this.restartingSet.add(agentId);
    try {
      const agentRunners = [...this.runners.entries()].filter(
        ([rid]) => runnerIdToAgentId(rid) === agentId,
      );
      if (!agentRunners.length) return;

      this.logger.log(`[restart] tearing down ${agentRunners.length} runner(s) for agent ${agentId} (requestedBy=${requestedBy})`);

      for (const [, runner] of agentRunners) {
        runner.abortAll(reason ?? 'restart');
      }
      for (const [rid, runner] of agentRunners) {
        await this.teardownRunner(rid, runner);
      }

      const agent = await this.agentModel
        .findOne({ _id: agentId, isDeleted: { $ne: true } })
        .select('+secret')
        .lean()
        .catch(() => null);
      if (!agent) {
        this.logger.warn(`[restart] agent ${agentId} not found after teardown`);
        return;
      }

      const numRunners = getNumRunners(agent);
      for (let i = 0; i < numRunners; i++) {
        await this.spawnRunner(agent as unknown as AgentDocument, i);
      }

      await this.agentService.addLog(agentId, {
        level: 'info',
        message: 'Runners restarted on-demand',
        data: { requestedBy, reason, numRunners },
      });
    } catch (err) {
      this.logger.error(`[restart] failed for ${agentId}: ${(err as Error).message}`, (err as Error).stack);
    } finally {
      this.restartingSet.delete(agentId);
    }
  }

  /**
   * Spawn runners for agents that have no runners on this instance yet.
   * Handles: new agents created after startup, or brand new instances joining.
   */
  private async claimUnlockedAgents() {
    const query: any = { type: 'assistant', isDeleted: { $ne: true } };
    if (this.agentIdFilter.length) {
      query._id = { $in: this.agentIdFilter };
    }
    if (this.agentIdIgnore.length) {
      query._id = { ...(query._id ?? {}), $nin: this.agentIdIgnore };
    }

    const agents = await this.agentModel.find(query).select('+secret').lean().catch(() => []);

    for (const agent of agents) {
      const agentId = (agent as any)._id.toString();
      const hasRunners = [...this.runners.keys()].some(
        (rid) => runnerIdToAgentId(rid) === agentId,
      );
      if (hasRunners) continue;

      this.logger.log(`Spawning runners for agent: ${agent.name} (${agentId})`);
      await this.agentService.addLog(agentId, { level: 'info', message: 'Runners spawned (new agent or instance joined)' });

      const numRunners = getNumRunners(agent);
      for (let i = 0; i < numRunners; i++) {
        await this.spawnRunner(agent as unknown as AgentDocument, i);
      }
    }
  }

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

    const ownedAgentIds = [...new Set([...this.runners.keys()].map(runnerIdToAgentId))];
    const agents = await this.agentModel
      .find({ _id: { $in: ownedAgentIds }, instructionId: event.instructionId, isDeleted: { $ne: true } })
      .select('_id')
      .lean()
      .catch(() => []);

    if (!agents.length) return;

    for (const agent of agents) {
      const agentId = (agent._id as { toString(): string }).toString();
      // Trigger reload on all runners for this agent
      for (const [rid, runner] of this.runners.entries()) {
        if (runnerIdToAgentId(rid) !== agentId) continue;
        this.logger.log(`[instruction-updated] reloading runner ${rid} (instructionId=${event.instructionId})`);
        await this.agentService.addLog(agentId, {
          level: 'info',
          message: 'Runner reload triggered — instruction updated',
          data: { runnerId: rid, instructionId: event.instructionId, updatedAt: event.updatedAt },
        });
        runner.triggerReload('event').catch((err: Error) =>
          this.logger.error(`triggerReload error for ${rid}: ${err.message}`, err.stack),
        );
      }
    }
  }
}

/** Extract agentId from runnerId ("{agentId}:{index}") */
function runnerIdToAgentId(runnerId: string): string {
  const lastColon = runnerId.lastIndexOf(':');
  return lastColon === -1 ? runnerId : runnerId.slice(0, lastColon);
}
