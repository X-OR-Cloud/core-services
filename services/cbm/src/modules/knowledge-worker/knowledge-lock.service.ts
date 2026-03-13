import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { redisConfig } from '../../config/redis.config';

const LOCK_PREFIX = 'kb:lock:file:';
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes per OVERVIEW spec
const RENEW_INTERVAL_MS = 60 * 1000; // Renew every 1 minute

/**
 * KnowledgeLockService — Redis distributed lock for KB file indexing.
 *
 * Ensures each file is processed by exactly one worker instance.
 * Pattern mirrors AgentLockService from AIWM.
 *
 * Lock key: kb:lock:file:{fileId}
 * TTL: 5 minutes, renewed every 1 minute while processing
 */
@Injectable()
export class KnowledgeLockService implements OnModuleDestroy {
  private readonly logger = new Logger(KnowledgeLockService.name);
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
    this.instanceId = `kb-${process.pid}-${Date.now()}`;
  }

  async connect(): Promise<void> {
    await this.redis.connect();
    this.startRenewLoop();
    this.logger.log(`KB Lock service ready | instanceId=${this.instanceId}`);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopRenewLoop();
    await this.releaseAll();
    this.redis.disconnect();
  }

  /**
   * Try to acquire lock for a file.
   * Returns true if this instance now owns the lock.
   */
  async tryAcquire(fileId: string): Promise<boolean> {
    const key = LOCK_PREFIX + fileId;
    const result = await this.redis.set(
      key,
      this.instanceId,
      'PX',
      LOCK_TTL_MS,
      'NX',
    );
    if (result === 'OK') {
      this.ownedLocks.add(fileId);
      this.logger.debug(`KB Lock acquired: ${fileId}`);
      return true;
    }
    return false;
  }

  /**
   * Release lock for a specific file.
   * Only deletes if this instance owns the lock (Lua atomicity).
   */
  async release(fileId: string): Promise<void> {
    const key = LOCK_PREFIX + fileId;
    await this.redis.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
      1,
      key,
      this.instanceId,
    );
    this.ownedLocks.delete(fileId);
    this.logger.debug(`KB Lock released: ${fileId}`);
  }

  private async renewAll(): Promise<void> {
    for (const fileId of this.ownedLocks) {
      const key = LOCK_PREFIX + fileId;
      const owner = await this.redis.get(key);
      if (owner === this.instanceId) {
        await this.redis.pexpire(key, LOCK_TTL_MS);
      } else {
        this.logger.warn(`Lost KB lock for file ${fileId}`);
        this.ownedLocks.delete(fileId);
      }
    }
  }

  private async releaseAll(): Promise<void> {
    const fileIds = [...this.ownedLocks];
    await Promise.allSettled(fileIds.map((id) => this.release(id)));
    this.logger.log(`Released ${fileIds.length} KB lock(s) on shutdown`);
  }

  private startRenewLoop(): void {
    this.renewTimer = setInterval(() => {
      this.renewAll().catch((err) =>
        this.logger.error(`KB lock renew error: ${err.message}`),
      );
    }, RENEW_INTERVAL_MS);
  }

  private stopRenewLoop(): void {
    if (this.renewTimer) {
      clearInterval(this.renewTimer);
      this.renewTimer = null;
    }
  }
}
