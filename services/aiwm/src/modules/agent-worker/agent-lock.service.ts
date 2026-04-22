import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { redisConfig } from '../../config/redis.config';

const LOCK_PREFIX = 'agt:lock:';
const LOCK_TTL_MS = 45_000; // 45s — longer than health check interval (30s)
const RENEW_INTERVAL_MS = 15_000; // Renew every 15s

const CONV_LOCK_PREFIX = 'agt:conv:';
const CONV_LOCK_TTL_MS = 60_000; // 60s — auto-expire if runner crashes mid-LLM-call
const RUNNER_SET_PREFIX = 'agt:runners:';

/**
 * AgentLockService — Redis distributed locks and runner registry for agent workers.
 *
 * Agent lock (kept for backward compat — single-runner mode):
 * - tryAcquire / release / renewAll  (agt:lock:{agentId})
 *
 * Conversation lock (multi-runner mode — ensures ordering per conversation):
 * - tryAcquireConv / renewConv / releaseConv  (agt:conv:{conversationId})
 *
 * Runner registry (replaces agent lock in multi-runner mode):
 * - registerRunner / unregisterRunner / getRunnerCount  (agt:runners:{agentId})
 */
@Injectable()
export class AgentLockService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentLockService.name);
  private readonly redis: Redis;
  private readonly instanceId: string;
  private readonly ownedLocks = new Set<string>();
  private renewTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.redis = new Redis({
      ...redisConfig,
      lazyConnect: true,
    });
    // Unique identifier per process instance
    this.instanceId = `${process.pid}-${Date.now()}`;
  }

  async connect() {
    await this.redis.connect();
    this.startRenewLoop();
    this.logger.log(`Lock service ready | instanceId=${this.instanceId}`);
  }

  async onModuleDestroy() {
    this.stopRenewLoop();
    await this.releaseAll();
    this.redis.disconnect();
  }

  /**
   * Try to acquire lock for an agent.
   * Returns true if this instance now owns the lock.
   * Returns false if another instance already owns it.
   */
  async tryAcquire(agentId: string): Promise<boolean> {
    const key = LOCK_PREFIX + agentId;
    const result = await this.redis.set(
      key,
      this.instanceId,
      'PX', LOCK_TTL_MS,
      'NX',
    );
    if (result === 'OK') {
      this.ownedLocks.add(agentId);
      this.logger.debug(`Lock acquired: ${agentId}`);
      return true;
    }
    const owner = await this.redis.get(key);
    this.logger.debug(`Lock busy: ${agentId} owned by ${owner}`);
    return false;
  }

  /**
   * Release lock for a specific agent (on runner stop or error).
   * Only deletes if this instance owns the lock (Lua script for atomicity).
   */
  async release(agentId: string): Promise<void> {
    const key = LOCK_PREFIX + agentId;
    // Lua: delete only if value matches our instanceId
    await this.redis.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
      1,
      key,
      this.instanceId,
    );
    this.ownedLocks.delete(agentId);
    this.logger.debug(`Lock released: ${agentId}`);
  }

  /**
   * Renew TTL for all locks owned by this instance.
   * Called periodically to prevent expiry while instance is alive.
   */
  private async renewAll(): Promise<void> {
    for (const agentId of this.ownedLocks) {
      const key = LOCK_PREFIX + agentId;
      // Only renew if we still own it
      const owner = await this.redis.get(key);
      if (owner === this.instanceId) {
        await this.redis.pexpire(key, LOCK_TTL_MS);
      } else {
        // Lost the lock (e.g. Redis restart) — remove from owned set
        this.logger.warn(`Lost lock for agent ${agentId}, removing from owned set`);
        this.ownedLocks.delete(agentId);
      }
    }
  }

  private async releaseAll(): Promise<void> {
    const agentIds = [...this.ownedLocks];
    await Promise.allSettled(agentIds.map((id) => this.release(id)));
    this.logger.log(`Released ${agentIds.length} lock(s) on shutdown`);
  }

  private startRenewLoop() {
    this.renewTimer = setInterval(() => {
      this.renewAll().catch((err) =>
        this.logger.error(`Lock renew error: ${err.message}`),
      );
    }, RENEW_INTERVAL_MS);
  }

  private stopRenewLoop() {
    if (this.renewTimer) {
      clearInterval(this.renewTimer);
      this.renewTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Conversation-level lock — used in multi-runner mode to ensure ordering
  // ---------------------------------------------------------------------------

  /**
   * Try to acquire a conversation lock so only one runner processes it at a time.
   * TTL = 60s — auto-expires if runner crashes mid-LLM-call.
   */
  async tryAcquireConv(conversationId: string, runnerId: string): Promise<boolean> {
    const key = CONV_LOCK_PREFIX + conversationId;
    const result = await this.redis.set(key, runnerId, 'PX', CONV_LOCK_TTL_MS, 'NX');
    return result === 'OK';
  }

  /**
   * Extend the TTL of a conversation lock — call in onStepFinish to prevent
   * expiry during long-running multi-step LLM calls.
   */
  async renewConv(conversationId: string, runnerId: string): Promise<void> {
    const key = CONV_LOCK_PREFIX + conversationId;
    // Only renew if this runner still owns it
    const owner = await this.redis.get(key);
    if (owner === runnerId) {
      await this.redis.pexpire(key, CONV_LOCK_TTL_MS);
    }
  }

  /**
   * Release a conversation lock. Uses Lua for atomicity — only deletes if
   * this runner is still the owner (guards against crash-then-recover races).
   */
  async releaseConv(conversationId: string, runnerId: string): Promise<void> {
    const key = CONV_LOCK_PREFIX + conversationId;
    await this.redis.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
      1,
      key,
      runnerId,
    );
  }

  // ---------------------------------------------------------------------------
  // Runner registry — tracks all active runners per agent across instances
  // ---------------------------------------------------------------------------

  /** Register a runner as active for an agent. */
  async registerRunner(agentId: string, runnerId: string): Promise<void> {
    await this.redis.sadd(RUNNER_SET_PREFIX + agentId, runnerId);
  }

  /** Unregister a runner when it stops. */
  async unregisterRunner(agentId: string, runnerId: string): Promise<void> {
    await this.redis.srem(RUNNER_SET_PREFIX + agentId, runnerId);
  }

  /** Return total active runner count across all instances for an agent. */
  async getRunnerCount(agentId: string): Promise<number> {
    return this.redis.scard(RUNNER_SET_PREFIX + agentId);
  }
}
