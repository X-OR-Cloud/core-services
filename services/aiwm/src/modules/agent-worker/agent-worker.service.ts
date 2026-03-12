import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { Agent, AgentDocument } from '../agent/agent.schema';
import { AgentService } from '../agent/agent.service';
import { AgentRunner } from './agent-runner';
import { AgentLockService } from './agent-lock.service';

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

  private readonly wsChatUrl: string;
  private readonly agentIdFilter: string[];

  constructor(
    @InjectModel(Agent.name) private readonly agentModel: Model<AgentDocument>,
    private readonly lockService: AgentLockService,
    private readonly agentService: AgentService,
  ) {
    this.wsChatUrl = process.env.WS_CHAT_URL || 'http://localhost:3003';
    this.agentIdFilter = process.env.AGENT_IDS
      ? process.env.AGENT_IDS.split(',').filter(Boolean)
      : [];
  }

  async onModuleInit() {
    await this.lockService.connect();
    await this.spawnAgents();
    this.startHealthCheck();
  }

  async onModuleDestroy() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    for (const [agentId, runner] of this.runners.entries()) {
      runner.stop();
      await this.lockService.release(agentId);
    }
    this.runners.clear();
    this.logger.log('All agent runners stopped');
  }

  private async spawnAgents() {
    const query: any = { type: 'hosted', isDeleted: { $ne: true } };
    if (this.agentIdFilter.length) {
      query._id = { $in: this.agentIdFilter };
    }

    const agents = await this.agentModel.find(query).select('+secret').lean();

    if (!agents.length) {
      this.logger.warn('No hosted agents found.');
      return;
    }

    this.logger.log(`Found ${agents.length} hosted agent(s). Competing for locks...`);

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

      const { accessToken, instruction, deployment, settings, mcpServers, allowedFunctions } = connectResp;

      this.logger.debug(
        `connectResp for ${agentId}: deployment=${JSON.stringify(deployment)}, mcpServers=${JSON.stringify(Object.keys(mcpServers || {}))}, allowedFunctions=${allowedFunctions?.length ?? 0}`,
      );

      const runner = new AgentRunner({
        agentId,
        agentName: agent.name,
        accessToken,
        instruction,
        deployment,
        settings: settings || agent.settings || {},
        mcpServers: mcpServers || {},
        allowedFunctions: allowedFunctions || [],
        wsChatUrl: this.wsChatUrl,
        connectInternal: (id) => this.agentService.connectInternal(id),
        heartbeatInternal: (id, status) =>
          this.agentService.heartbeat(id, { status }, accessToken).then((_r) => _r as unknown as void),
      });

      runner.start();
      this.runners.set(agentId, runner);
      this.runnerConfigHash.set(agentId, agentConfigHash(agent));
      this.logger.log(`Runner started: ${agent.name} (${agentId})`);
    } catch (err) {
      this.logger.error(`Failed to spawn runner for ${agent.name} (${agentId}): ${err.message}`);
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
      // 1. Reconnect disconnected runners
      for (const [agentId, runner] of this.runners.entries()) {
        if (!runner.isConnected) {
          this.logger.warn(`Runner disconnected for ${agentId}, reconnecting...`);
          runner.reconnect();
        }
      }

      // 2. Restart runners whose agent config changed (updatedAt differs) and are idle
      await this.restartUpdatedAgents();

      // 3. Try to claim agents not yet owned by any instance
      await this.claimUnlockedAgents();
    }, HEALTH_CHECK_INTERVAL_MS);
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
      runner.stop();
      this.runners.delete(agentId);
      this.runnerConfigHash.delete(agentId);
      await this.spawnRunner(agent as unknown as AgentDocument);
    }
  }

  /**
   * Query all hosted agents and try to claim any that are not locked.
   * Handles: new agents created after startup, or instance crashed releasing locks.
   */
  private async claimUnlockedAgents() {
    const query: any = { type: 'hosted', isDeleted: { $ne: true } };
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
        await this.spawnRunner(agent as unknown as AgentDocument);
      }
    }
  }
}
