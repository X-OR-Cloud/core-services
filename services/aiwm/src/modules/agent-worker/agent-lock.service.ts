import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { redisConfig } from '../../config/redis.config';

const LOCK_PREFIX = 'agt:lock:';
const LOCK_TTL_MS = 45_000; // 45s — longer than health check interval (30s)
const RENEW_INTERVAL_MS = 15_000; // Renew every 15s

/**
 * AgentLockService — Redis distributed lock for hosted agent runners.
 *
 * Ensures each agent is owned by exactly one `agt` process instance,
 * enabling safe horizontal scaling without duplicate responses.
 *
 * Lock lifecycle:
 * - acquire(agentId) → SET NX PX (atomic)
 * - renewAll()       → called by health check to extend TTL
 * - release(agentId) → DEL on shutdown
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
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
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
}
