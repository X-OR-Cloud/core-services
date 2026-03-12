import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext, ConfigKey } from '@hydrabyte/shared';
import { Configuration } from './configuration.schema';
import {
  CreateConfigurationDto,
  UpdateConfigurationDto,
} from './configuration.dto';
import { CONFIG_METADATA, ConfigKeyMetadata } from './constants';

/**
 * Configuration Service
 *
 * Manages system configuration key-value pairs.
 * V2: Simplified design with strict RBAC (organization.owner only).
 */
@Injectable()
export class ConfigurationService extends BaseService<Configuration> {
  constructor(
    @InjectModel(Configuration.name)
    private readonly configModel: Model<Configuration>
  ) {
    super(configModel as any);
  }

  /**
   * Find all configurations
   * Returns list WITHOUT values (metadata only)
   */
  async findAll(
    options: FindManyOptions,
    context: RequestContext
  ): Promise<FindManyResult<Configuration>> {
    const findResult = await super.findAll(options, context);

    // Build statistics
    const statistics: any = {
      total: findResult.pagination.total,
    };

    findResult.statistics = statistics;
    return findResult;
  }

  /**
   * Find configuration by key
   * Returns WITH value
   */
  async findByKey(
    key: ConfigKey,
    context: RequestContext
  ): Promise<Configuration | null> {
    // BaseService.findOne uses RBAC
    const filter = {
      key,
      isDeleted: false,
      'owner.orgId': context.orgId,
    };
    const config = await this.configModel.findOne(filter).exec();
    if (!config) {
      return null;
    }

    return config;
  }

  /**
   * Create or update configuration
   * Upsert operation: if key exists, update it; otherwise create new
   */
  async createOrUpdate(
    dto: CreateConfigurationDto,
    context: RequestContext
  ): Promise<Configuration> {
    // Validate against metadata
    this.validateConfiguration(dto.key, dto.value);

    // Check if configuration already exists
    const existing = await this.configModel
      .findOne({
        key: dto.key,
        isDeleted: false,
        'owner.orgId': context.orgId,
      })
      .exec();

    if (existing) {
      // Update existing using updateOne
      const updateData: any = {
        value: dto.value,
        updatedBy: context,
        updatedAt: new Date(),
      };
      if (dto.notes !== undefined) {
        updateData.notes = dto.notes;
      }

      await this.configModel.updateOne(
        { _id: existing._id },
        { $set: updateData }
      );

      this.logger.log('Configuration updated', {
        key: dto.key,
        updatedBy: context,
      });

      // Fetch updated document
      const updated = await this.configModel.findById(existing._id).exec();
      return updated as Configuration;
    } else {
      // Create new
      const created = await super.create(
        {
          ...dto,
        } as any,
        context
      );

      this.logger.log('Configuration created', {
        key: dto.key,
        createdBy: context,
      });

      return created as Configuration;
    }
  }

  /**
   * Update configuration by key
   */
  async updateByKey(
    key: ConfigKey,
    dto: UpdateConfigurationDto,
    context: RequestContext
  ): Promise<Configuration> {
    const config = await this.findByKey(key, context);

    if (!config) {
      throw new NotFoundException(`Configuration with key '${key}' not found`);
    }

    // Build update data
    const updateData: any = {
      updatedBy: context.userId,
      updatedAt: new Date(),
    };

    // Validate value if provided
    if (dto.value !== undefined) {
      this.validateConfiguration(key, dto.value);
      updateData.value = dto.value;
    }

    if (dto.notes !== undefined) {
      updateData.notes = dto.notes;
    }

    // Update using updateOne
    await this.configModel.updateOne(
      { _id: (config as any)._id },
      { $set: updateData }
    );

    this.logger.log('Configuration updated', {
      key,
      updatedBy: context.userId,
    });

    // Fetch updated document
    const updated = await this.configModel.findById((config as any)._id).exec();
    return updated as Configuration;
  }

  /**
   * Delete configuration by key (soft delete)
   */
  async deleteByKey(key: ConfigKey, context: RequestContext): Promise<void> {
    const config = await this.findByKey(key, context);

    if (!config) {
      throw new NotFoundException(`Configuration with key '${key}' not found`);
    }

    // Soft delete using updateOne
    await this.configModel.updateOne(
      { _id: (config as any)._id },
      {
        $set: {
          deletedAt: new Date(),
          updatedBy: context.userId,
        },
      }
    );

    this.logger.log('Configuration deleted', {
      key,
      deletedBy: context.userId,
    });
  }

  /**
   * Get all configuration metadata
   * Public endpoint - no auth required
   */
  getAllMetadata(): ConfigKeyMetadata[] {
    return Object.values(CONFIG_METADATA);
  }

  /**
   * Get metadata for specific key
   * Public endpoint - no auth required
   */
  getMetadataByKey(key: ConfigKey): ConfigKeyMetadata {
    const metadata = CONFIG_METADATA[key];
    if (!metadata) {
      throw new NotFoundException(`Metadata for key '${key}' not found`);
    }
    return metadata;
  }

  /**
   * Initialize all configuration keys with empty values
   * Only creates keys that don't exist yet (no overwrite)
   *
   * @returns Summary of initialization (created vs skipped)
   */
  async initializeAll(context: RequestContext): Promise<{
    total: number;
    created: number;
    skipped: number;
    createdKeys: string[];
    skippedKeys: string[];
  }> {
    const allKeys = Object.values(ConfigKey);
    const createdKeys: string[] = [];
    const skippedKeys: string[] = [];

    for (const key of allKeys) {
      try {
        // Check if key already exists
        const existing = await this.configModel
          .findOne({
            key,
            isDeleted: false,
            'owner.orgId': context.orgId,
          })
          .exec();
        this.logger.debug('Checking existing configuration', { key, orgId: context.orgId, existing: existing });
        if (existing) {
          skippedKeys.push(key);
          continue;
        }

        // Create new configuration with empty value
        // Skip validation for empty string initialization
        const newConfig = new this.configModel({
          key,
          value: '', // Empty string
          owner: {
            orgId: context.orgId,
            userId: context.userId,
            groupId: context.groupId || '',
            agentId: context.agentId || '',
            appId: context.appId || '',
          },
          createdBy: context.userId,
          updatedBy: context.userId,
        });

        const createResult = await newConfig.save({ validateBeforeSave: false });
        this.logger.debug('Creating new configuration', { key, orgId: context.orgId, createResult });
        createdKeys.push(key);
      } catch (error: any) {
        // Handle duplicate key error gracefully (E11000)
        if (error.code === 11000) {
          // Key already exists, skip it
          skippedKeys.push(key);
          this.logger.debug('Configuration key already exists, skipping', {
            key,
            orgId: context.orgId,
          });
        } else {
          // Re-throw other errors
          throw error;
        }
      }
    }

    this.logger.log('Configuration initialization completed', {
      total: allKeys.length,
      created: createdKeys.length,
      skipped: skippedKeys.length,
      orgId: context.orgId,
      userId: context.userId,
    });

    return {
      total: allKeys.length,
      created: createdKeys.length,
      skipped: skippedKeys.length,
      createdKeys,
      skippedKeys,
    };
  }

  /**
   * Validate configuration value against metadata rules
   */
  private validateConfiguration(key: ConfigKey, value: string): void {
    const metadata = CONFIG_METADATA[key];

    if (!metadata) {
      throw new BadRequestException(`Invalid configuration key: ${key}`);
    }

    // Type validation
    switch (metadata.dataType) {
      case 'number':
        if (isNaN(Number(value))) {
          throw new BadRequestException(`Value for '${key}' must be a number`);
        }
        if (
          metadata.validation?.min &&
          Number(value) < metadata.validation.min
        ) {
          throw new BadRequestException(
            `Value for '${key}' must be at least ${metadata.validation.min}`
          );
        }
        if (
          metadata.validation?.max &&
          Number(value) > metadata.validation.max
        ) {
          throw new BadRequestException(
            `Value for '${key}' must be at most ${metadata.validation.max}`
          );
        }
        break;

      case 'boolean':
        if (!['true', 'false', '1', '0'].includes(value.toLowerCase())) {
          throw new BadRequestException(
            `Value for '${key}' must be true/false or 1/0`
          );
        }
        break;

      case 'url':
        try {
          new URL(value);
        } catch {
          throw new BadRequestException(
            `Value for '${key}' must be a valid URL`
          );
        }
        break;

      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          throw new BadRequestException(
            `Value for '${key}' must be a valid email`
          );
        }
        break;
    }

    // Pattern validation
    if (metadata.validation?.pattern) {
      const regex = new RegExp(metadata.validation.pattern);
      if (!regex.test(value)) {
        throw new BadRequestException(
          `Value for '${key}' does not match required pattern`
        );
      }
    }

    // Length validation
    if (
      metadata.validation?.minLength &&
      value.length < metadata.validation.minLength
    ) {
      throw new BadRequestException(
        `Value for '${key}' must be at least ${metadata.validation.minLength} characters`
      );
    }

    if (
      metadata.validation?.maxLength &&
      value.length > metadata.validation.maxLength
    ) {
      throw new BadRequestException(
        `Value for '${key}' must be at most ${metadata.validation.maxLength} characters`
      );
    }

    // Enum validation
    if (
      metadata.validation?.enum &&
      !metadata.validation.enum.includes(value)
    ) {
      throw new BadRequestException(
        `Value for '${key}' must be one of: ${metadata.validation.enum.join(
          ', '
        )}`
      );
    }
  }
}
