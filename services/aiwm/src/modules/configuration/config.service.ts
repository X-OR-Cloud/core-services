import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigKey } from '@hydrabyte/shared';
import { Configuration } from './configuration.schema';
import { CONFIG_METADATA } from './constants';

/**
 * Config Service (Internal Consumption)
 *
 * Provides cached access to configuration values for internal services.
 * This service is designed for use by other services within the application.
 *
 * Features:
 * - In-memory caching for fast access
 * - Type-safe config retrieval
 * - Automatic type parsing (string, number, boolean)
 * - Default value support
 * - Hot reload capability
 *
 * Usage:
 * ```typescript
 * const endpoint = await this.configService.get(ConfigKey.S3_ENDPOINT);
 * const port = await this.configService.get<number>(ConfigKey.SMTP_PORT);
 * const useSSL = await this.configService.getOrDefault(ConfigKey.S3_USE_SSL, 'true');
 * ```
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

  /**
   * Initialize cache on module startup
   */
  async onModuleInit() {
    try {
      await this.initializeCache();
      this.logger.log(
        `Configuration cache initialized with ${this.cache.size} keys`
      );
    } catch (error) {
      this.logger.error('Failed to initialize configuration cache', error);
    }
  }

  /**
   * Get configuration value by key
   * Returns parsed value based on metadata type
   */
  async get<T = string>(key: ConfigKey): Promise<T | null> {
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }

    // If cache not initialized, try to fetch from DB
    if (!this.cacheInitialized) {
      await this.initializeCache();
    }

    // Check cache again after initialization
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }

    return null;
  }

  /**
   * Get configuration with default fallback
   */
  async getOrDefault<T = string>(key: ConfigKey, defaultValue: T): Promise<T> {
    const value = await this.get<T>(key);
    return value !== null ? value : defaultValue;
  }

  /**
   * Get all active configurations as object
   * Useful for bulk retrieval
   */
  async getAll(): Promise<Record<string, any>> {
    if (!this.cacheInitialized) {
      await this.initializeCache();
    }

    const result: Record<string, any> = {};
    this.cache.forEach((value, key) => {
      result[key] = value;
    });

    return result;
  }

  /**
   * Check if configuration key exists and is active
   */
  async has(key: ConfigKey): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Get configuration value as string
   */
  async getString(key: ConfigKey): Promise<string | null> {
    return this.get<string>(key);
  }

  /**
   * Get configuration value as number
   */
  async getNumber(key: ConfigKey): Promise<number | null> {
    const value = await this.get<string>(key);
    if (value === null) return null;
    const parsed = Number(value);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Get configuration value as boolean
   */
  async getBoolean(key: ConfigKey): Promise<boolean | null> {
    const value = await this.get<string>(key);
    if (value === null) return null;
    return value === 'true' || value === '1';
  }

  /**
   * Hot reload cache for specific key
   * Call this after updating a configuration value
   */
  async reloadKey(key: ConfigKey): Promise<void> {
    this.cache.delete(key);

    const config = await this.configModel
      .findOne({
        key,
        isDeleted: false,
      })
      .exec();

    if (config) {
      const parsedValue = this.parseValue(key, config.value);
      this.cache.set(key, parsedValue);
      this.logger.debug(`Cache reloaded for key: ${key}`);
    } else {
      this.logger.debug(`Key not found or inactive: ${key}`);
    }
  }

  /**
   * Hot reload entire cache
   * Call this to refresh all configuration values
   */
  async reloadCache(): Promise<void> {
    this.cache.clear();
    await this.initializeCache();
    this.logger.log(
      `Configuration cache reloaded with ${this.cache.size} keys`
    );
  }

  /**
   * Clear cache (for testing or maintenance)
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheInitialized = false;
    this.logger.log('Configuration cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    initialized: boolean;
    keys: string[];
  } {
    return {
      size: this.cache.size,
      initialized: this.cacheInitialized,
      keys: Array.from(this.cache.keys()),
    };
  }

  // =======================================================================
  // Private Helper Methods
  // =======================================================================

  /**
   * Initialize cache by loading all active configurations
   */
  private async initializeCache(): Promise<void> {
    try {
      const configs = await this.configModel
        .find({
          isDeleted: false,
        })
        .exec();

      this.cache.clear();

      // Load empty-value records first, non-empty last — so non-empty values win on duplicate keys
      const sorted = [...configs].sort((a, b) => {
        const aEmpty = !a.value || a.value.trim() === '';
        const bEmpty = !b.value || b.value.trim() === '';
        if (aEmpty && !bEmpty) return -1;
        if (!aEmpty && bEmpty) return 1;
        return 0;
      });

      for (const config of sorted) {
        const parsedValue = this.parseValue(
          config.key as ConfigKey,
          config.value
        );
        this.cache.set(config.key, parsedValue);
      }

      this.cacheInitialized = true;
    } catch (error) {
      this.logger.error('Failed to initialize cache', error);
      throw error;
    }
  }

  /**
   * Parse value based on metadata data type
   */
  private parseValue(key: ConfigKey, value: string): any {
    const metadata = CONFIG_METADATA[key];

    if (!metadata) {
      // If metadata not found, return as string
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
