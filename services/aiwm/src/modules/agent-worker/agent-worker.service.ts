import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { Agent, AgentDocument } from '../agent/agent.schema';
import { AgentRunner } from './agent-runner';
import { AgentLockService } from './agent-lock.service';

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
  private healthCheckTimer: NodeJS.Timeout | null = null;

  private readonly wsChatUrl: string;
  private readonly mcpServerUrl: string;
  private readonly agentIdFilter: string[];

  constructor(
    @InjectModel(Agent.name) private readonly agentModel: Model<AgentDocument>,
    private readonly lockService: AgentLockService,
  ) {
    this.wsChatUrl = process.env.WS_CHAT_URL || 'http://localhost:3003';
    this.mcpServerUrl = process.env.MCP_SERVER_URL || 'http://localhost:3355';
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
      const connectResp = await axios.post(
        `${this.wsChatUrl}/agents/${agentId}/connect`,
        { secret: (agent as any).secret },
      );

      const { accessToken, instruction, deployment, settings } = connectResp.data;

      const runner = new AgentRunner({
        agentId,
        agentName: agent.name,
        accessToken,
        instruction,
        deployment,
        settings: settings || agent.settings || {},
        wsChatUrl: this.wsChatUrl,
        mcpServerUrl: this.mcpServerUrl,
      });

      runner.start();
      this.runners.set(agentId, runner);
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

      // 2. Try to claim agents not yet owned by any instance
      await this.claimUnlockedAgents();
    }, HEALTH_CHECK_INTERVAL_MS);
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
