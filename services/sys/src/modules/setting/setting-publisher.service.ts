import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { ConfigKey } from '@hydrabyte/shared';
import { SettingScope } from './setting.schema';

/**
 * Redis pub/sub channels for setting invalidation.
 *
 * Subscribers (lib `@hydrabyte/sys-client`) listen to these channels to drop
 * cached entries when sys mutates a setting.
 *
 * Ref: docs/sys/PROPOSAL.md §4.6
 */
export const SYS_SETTING_INVALIDATE_CHANNEL = 'sys:setting:invalidate';
export const SYS_METADATA_INVALIDATE_CHANNEL = 'sys:metadata:invalidate';

export interface SettingInvalidatePayload {
  key: ConfigKey;
  scope: SettingScope;
  orgId: string | null; // null when scope=global
  sensitive: boolean;
  updatedAt: string; // ISO timestamp — clients use this to compute pubsub_lag metric
}

export interface MetadataInvalidatePayload {
  reason: string;
  updatedAt: string;
}

/**
 * Publishes invalidation events for setting and metadata changes.
 *
 * Failures are logged but never thrown — the underlying setting write
 * already succeeded; missing pub/sub will be caught by client TTL fallback.
 */
@Injectable()
export class SettingPublisherService {
  private readonly logger = new Logger(SettingPublisherService.name);

  constructor(@InjectRedis() private readonly redis: Redis) {}

  async publishSettingInvalidate(payload: Omit<SettingInvalidatePayload, 'updatedAt'>): Promise<void> {
    const fullPayload: SettingInvalidatePayload = {
      ...payload,
      updatedAt: new Date().toISOString(),
    };
    try {
      const subs = await this.redis.publish(
        SYS_SETTING_INVALIDATE_CHANNEL,
        JSON.stringify(fullPayload),
      );
      this.logger.debug('Published setting invalidate', {
        key: fullPayload.key,
        scope: fullPayload.scope,
        subscribers: subs,
      });
    } catch (error: any) {
      this.logger.error('Failed to publish setting invalidate', {
        key: fullPayload.key,
        scope: fullPayload.scope,
        error: error.message,
      });
    }
  }

  async publishMetadataInvalidate(reason = 'metadata-updated'): Promise<void> {
    const payload: MetadataInvalidatePayload = {
      reason,
      updatedAt: new Date().toISOString(),
    };
    try {
      await this.redis.publish(
        SYS_METADATA_INVALIDATE_CHANNEL,
        JSON.stringify(payload),
      );
      this.logger.debug('Published metadata invalidate', { reason });
    } catch (error: any) {
      this.logger.error('Failed to publish metadata invalidate', {
        reason,
        error: error.message,
      });
    }
  }
}
