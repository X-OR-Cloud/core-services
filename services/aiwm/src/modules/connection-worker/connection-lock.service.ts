import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { buildRedisConfig } from '../../config/redis.config';

const LOCK_PREFIX = 'con:lock:';
const LOCK_TTL_MS = 45_000;
const RENEW_INTERVAL_MS = 15_000;

/**
 * ConnectionLockService — Redis distributed lock for connection runners.
 *
 * Ensures each connection is owned by exactly one `con` process instance,
 * enabling safe horizontal scaling for Discord/Telegram bot clients.
 *
 * Lock lifecycle:
 * - tryAcquire(connectionId) → SET NX PX (atomic)
 * - renewAll()               → called every 15s to extend TTL
 * - release(connectionId)    → Lua DEL only if owner, on runner stop / shutdown
 */
@Injectable()
export class ConnectionLockService implements OnModuleDestroy {
  private readonly logger = new Logger(ConnectionLockService.name);
  private readonly redis: Redis;
  private readonly _instanceId: string;
  private readonly ownedLocks = new Set<string>();
  private renewTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.redis = new Redis({ ...buildRedisConfig(), lazyConnect: true });
    this._instanceId = `${process.pid}-${Date.now()}`;
  }

  get instanceId(): string {
    return this._instanceId;
  }

  async connect() {
    await this.redis.connect();
    this.startRenewLoop();
    this.logger.log(`Connection lock service ready | instanceId=${this._instanceId}`);
  }

  async onModuleDestroy() {
    this.stopRenewLoop();
    await this.releaseAll();
    this.redis.disconnect();
  }

  ownsLock(connectionId: string): boolean {
    return this.ownedLocks.has(connectionId);
  }

  async tryAcquire(connectionId: string): Promise<boolean> {
    const key = LOCK_PREFIX + connectionId;
    const result = await this.redis.set(key, this._instanceId, 'PX', LOCK_TTL_MS, 'NX');
    if (result === 'OK') {
      this.ownedLocks.add(connectionId);
      this.logger.debug(`Lock acquired: ${connectionId}`);
      return true;
    }
    const owner = await this.redis.get(key);
    this.logger.debug(`Lock busy: ${connectionId} owned by ${owner}`);
    return false;
  }

  async release(connectionId: string): Promise<void> {
    const key = LOCK_PREFIX + connectionId;
    await this.redis.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
      1, key, this._instanceId,
    );
    this.ownedLocks.delete(connectionId);
    this.logger.debug(`Lock released: ${connectionId}`);
  }

  private async renewAll(): Promise<void> {
    for (const connectionId of this.ownedLocks) {
      const key = LOCK_PREFIX + connectionId;
      const owner = await this.redis.get(key);
      if (owner === this._instanceId) {
        await this.redis.pexpire(key, LOCK_TTL_MS);
      } else {
        this.logger.warn(`Lost lock for connection ${connectionId}, removing from owned set`);
        this.ownedLocks.delete(connectionId);
      }
    }
  }

  private async releaseAll(): Promise<void> {
    const ids = [...this.ownedLocks];
    await Promise.allSettled(ids.map((id) => this.release(id)));
    this.logger.log(`Released ${ids.length} lock(s) on shutdown`);
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
