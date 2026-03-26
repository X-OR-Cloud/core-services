import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigKey } from '@hydrabyte/shared';
import { Configuration } from './configuration.schema';
import { CONFIG_METADATA } from './constants';

const GLOBAL_PREFIX = '__global__';

/**
 * Config Service (Internal Consumption)
 *
 * Provides cached access to configuration values for internal services.
 * Supports multi-tenant with two-tier cache:
 *   - Tier 1: org-specific  → key: `<orgId>:<configKey>`
 *   - Tier 2: global        → key: `__global__:<configKey>`
 *
 * Lookup order: org-specific → global → hardcoded default
 */
@Injectable()
export class ConfigService implements OnModuleInit {
  private readonly logger = new Logger(ConfigService.name);
  private cache: Map<string, any> = new Map();
  private cacheInitialized = false;

  constructor(
    @InjectModel(Configuration.name)
    private readonly configModel: Model<Configuration>
  ) {}

  async onModuleInit() {
    try {
      await this.initializeCache();
      this.logger.log(
        `Configuration cache initialized with ${this.cache.size} entries`
      );
    } catch (error) {
      this.logger.error('Failed to initialize configuration cache', error);
    }
  }

  /**
   * Get configuration value by key, with org-specific → global fallback.
   */
  async get<T = string>(key: ConfigKey, orgId?: string): Promise<T | null> {
    if (!this.cacheInitialized) {
      await this.initializeCache();
    }

    // Tier 1: org-specific
    if (orgId) {
      const orgCacheKey = `${orgId}:${key}`;
      if (this.cache.has(orgCacheKey)) {
        return this.cache.get(orgCacheKey) as T;
      }
    }

    // Tier 2: global
    const globalCacheKey = `${GLOBAL_PREFIX}:${key}`;
    if (this.cache.has(globalCacheKey)) {
      return this.cache.get(globalCacheKey) as T;
    }

    return null;
  }

  /**
   * Get configuration with default fallback.
   */
  async getOrDefault<T = string>(key: ConfigKey, orgId: string | undefined, defaultValue: T): Promise<T> {
    const value = await this.get<T>(key, orgId);
    return value !== null ? value : defaultValue;
  }

  /**
   * Get all active configurations as object (merged: global overridden by org)
   */
  async getAll(orgId?: string): Promise<Record<string, any>> {
    if (!this.cacheInitialized) {
      await this.initializeCache();
    }

    const result: Record<string, any> = {};

    // First pass: global values
    for (const [cacheKey, value] of this.cache.entries()) {
      if (cacheKey.startsWith(`${GLOBAL_PREFIX}:`)) {
        const configKey = cacheKey.slice(GLOBAL_PREFIX.length + 1);
        result[configKey] = value;
      }
    }

    // Second pass: org-specific overrides
    if (orgId) {
      for (const [cacheKey, value] of this.cache.entries()) {
        if (cacheKey.startsWith(`${orgId}:`)) {
          const configKey = cacheKey.slice(orgId.length + 1);
          result[configKey] = value;
        }
      }
    }

    return result;
  }

  async has(key: ConfigKey, orgId?: string): Promise<boolean> {
    const value = await this.get(key, orgId);
    return value !== null;
  }

  async getString(key: ConfigKey, orgId?: string): Promise<string | null> {
    return this.get<string>(key, orgId);
  }

  async getNumber(key: ConfigKey, orgId?: string): Promise<number | null> {
    const value = await this.get<string>(key, orgId);
    if (value === null) return null;
    const parsed = Number(value);
    return isNaN(parsed) ? null : parsed;
  }

  async getBoolean(key: ConfigKey, orgId?: string): Promise<boolean | null> {
    const value = await this.get<string>(key, orgId);
    if (value === null) return null;
    return value === 'true' || value === '1';
  }

  /**
   * Hot reload cache for specific key (both global and all orgs).
   */
  async reloadKey(key: ConfigKey): Promise<void> {
    // Remove all cached entries for this key
    for (const cacheKey of Array.from(this.cache.keys())) {
      if (cacheKey.endsWith(`:${key}`)) {
        this.cache.delete(cacheKey);
      }
    }

    const configs = await this.configModel
      .find({ key, isDeleted: false, value: { $nin: [null, ''] } })
      .exec();

    for (const config of configs) {
      const parsedValue = this.parseValue(key, config.value);
      const cacheKey = config.scope === 'global'
        ? `${GLOBAL_PREFIX}:${key}`
        : `${config.owner?.orgId}:${key}`;
      this.cache.set(cacheKey, parsedValue);
    }

    this.logger.debug(`Cache reloaded for key: ${key}`);
  }

  async reloadCache(): Promise<void> {
    this.cache.clear();
    await this.initializeCache();
    this.logger.log(
      `Configuration cache reloaded with ${this.cache.size} entries`
    );
  }

  clearCache(): void {
    this.cache.clear();
    this.cacheInitialized = false;
    this.logger.log('Configuration cache cleared');
  }

  getCacheStats(): { size: number; initialized: boolean; keys: string[] } {
    return {
      size: this.cache.size,
      initialized: this.cacheInitialized,
      keys: Array.from(this.cache.keys()),
    };
  }

  // =======================================================================
  // Private Helper Methods
  // =======================================================================

  private async initializeCache(): Promise<void> {
    try {
      const configs = await this.configModel
        .find({
          isDeleted: false,
          value: { $nin: [null, ''] },
        })
        .exec();

      this.cache.clear();

      for (const config of configs) {
        const parsedValue = this.parseValue(
          config.key as ConfigKey,
          config.value
        );
        const cacheKey = config.scope === 'global'
          ? `${GLOBAL_PREFIX}:${config.key}`
          : `${config.owner?.orgId}:${config.key}`;
        this.cache.set(cacheKey, parsedValue);
      }

      this.cacheInitialized = true;
    } catch (error) {
      this.logger.error('Failed to initialize cache', error);
      throw error;
    }
  }

  private parseValue(key: ConfigKey, value: string): any {
    const metadata = CONFIG_METADATA[key];

    if (!metadata) {
      return value;
    }

    switch (metadata.dataType) {
      case 'number':
        const num = Number(value);
        return isNaN(num) ? value : num;

      case 'boolean':
        return value === 'true' || value === '1';

      case 'url':
      case 'email':
      case 'string':
      default:
        return value;
    }
  }
}
