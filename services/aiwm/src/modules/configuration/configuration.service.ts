import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext, ConfigKey, PredefinedRole } from '@hydrabyte/shared';
import { Configuration } from './configuration.schema';
import {
  CreateConfigurationDto,
  UpdateConfigurationDto,
  InitializeConfigurationsDto,
} from './configuration.dto';
import { CONFIG_METADATA, ConfigKeyMetadata } from './constants';
import { IamOrgService } from './iam-org.service';

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
    private readonly configModel: Model<Configuration>,
    private readonly iamOrgService: IamOrgService,
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
   * Find configuration by key for a given org (org-specific first, then global fallback)
   * Returns WITH value
   */
  async findByKey(
    key: ConfigKey,
    context: RequestContext
  ): Promise<Configuration | null> {
    // Try org-specific first
    const orgConfig = await this.configModel.findOne({
      key,
      scope: 'org',
      isDeleted: false,
      'owner.orgId': context.orgId,
    }).exec();

    if (orgConfig) return orgConfig;

    // Fallback to global
    const globalConfig = await this.configModel.findOne({
      key,
      scope: 'global',
      isDeleted: false,
    }).exec();

    return globalConfig;
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

    const scope = dto.scope ?? 'org';

    // Check if configuration already exists
    const existing = await this.configModel
      .findOne({
        key: dto.key,
        scope,
        isDeleted: false,
        'owner.orgId': scope === 'global' ? '' : context.orgId,
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
          scope,
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
   * Initialize all configuration keys with empty values.
   * Only creates keys that don't exist yet (no overwrite).
   *
   * Role rules:
   * - universe.owner + scope=global   → seed global configs (owner.orgId = '')
   * - universe.owner + scope=organization + orgId → seed for specified org (validate org active)
   * - universe.owner + scope=organization (no orgId) → seed for caller's orgId
   * - organization.owner + scope=organization → seed for caller's orgId (orgId in body ignored)
   * - organization.owner + scope=global → ForbiddenException
   * - other roles → ForbiddenException
   */
  async initializeAll(
    dto: InitializeConfigurationsDto,
    context: RequestContext,
  ): Promise<{ total: number; created: number; skipped: number }> {
    const isUniverseOwner = context.roles?.includes(PredefinedRole.UniverseOwner);
    const isOrgOwner = context.roles?.includes(PredefinedRole.OrganizationOwner);

    if (!isUniverseOwner && !isOrgOwner) {
      throw new ForbiddenException('Only universe.owner or organization.owner can initialize configurations');
    }

    if (dto.scope === 'global' && !isUniverseOwner) {
      throw new ForbiddenException('Only universe.owner can initialize global configurations');
    }

    // Resolve target orgId and DB scope
    let targetOrgId: string;
    let dbScope: 'global' | 'org';

    if (dto.scope === 'global') {
      targetOrgId = '';
      dbScope = 'global';
    } else {
      dbScope = 'org';

      if (isUniverseOwner && dto.orgId) {
        // universe.owner specified a target org — validate it
        const org = await this.iamOrgService.findActiveOrg(dto.orgId);
        if (!org) {
          throw new BadRequestException(`Organization '${dto.orgId}' not found or is inactive`);
        }
        targetOrgId = dto.orgId;
      } else {
        // organization.owner, or universe.owner without orgId — use caller's orgId
        if (!context.orgId) {
          throw new BadRequestException('Could not determine target organization');
        }
        targetOrgId = context.orgId;
      }
    }

    const allKeys = Object.values(ConfigKey);

    // Bulk-check existing keys in one query
    const existingDocs = await this.configModel
      .find({
        key: { $in: allKeys },
        scope: dbScope,
        isDeleted: false,
        'owner.orgId': targetOrgId,
      })
      .select('key')
      .lean()
      .exec();

    const existingKeySet = new Set(existingDocs.map((d: any) => d.key));
    const keysToCreate = allKeys.filter((k) => !existingKeySet.has(k));
    const skipped = allKeys.length - keysToCreate.length;

    if (keysToCreate.length === 0) {
      this.logger.log('All configuration keys already exist, nothing to create', {
        scope: dbScope,
        orgId: targetOrgId,
      });
      return { total: allKeys.length, created: 0, skipped };
    }

    // Bulk-insert missing keys
    const docs = keysToCreate.map((key) => ({
      key,
      value: '',
      scope: dbScope,
      isDeleted: false,
      owner: {
        orgId: targetOrgId,
        userId: context.userId,
        groupId: context.groupId || '',
        agentId: context.agentId || '',
        appId: context.appId || '',
      },
      createdBy: context.userId,
      updatedBy: context.userId,
    }));

    let created = 0;
    let extraSkipped = 0;

    try {
      const result = await this.configModel.insertMany(docs, { ordered: false });
      created = result.length;
    } catch (error: any) {
      // insertMany with ordered:false may partially succeed and throw BulkWriteError
      if (error.name === 'MongoBulkWriteError' || error.code === 11000) {
        created = error.result?.nInserted ?? error.insertedDocs?.length ?? 0;
        extraSkipped = keysToCreate.length - created;
      } else {
        throw error;
      }
    }

    this.logger.log('Configuration initialization completed', {
      scope: dbScope,
      orgId: targetOrgId,
      total: allKeys.length,
      created,
      skipped: skipped + extraSkipped,
    });

    return { total: allKeys.length, created, skipped: skipped + extraSkipped };
  }

  /**
   * Internal initialization — bypasses role check.
   * Used by SetupService during system bootstrap.
   */
  async initializeAllInternal(params: {
    scope: 'global' | 'org';
    orgId: string;
  }): Promise<{ total: number; created: number; skipped: number }> {
    const dbScope = params.scope;
    const targetOrgId = dbScope === 'global' ? '' : params.orgId;

    const allKeys = Object.values(ConfigKey);

    const existingDocs = await this.configModel
      .find({
        key: { $in: allKeys },
        scope: dbScope,
        isDeleted: false,
        'owner.orgId': targetOrgId,
      })
      .select('key')
      .lean()
      .exec();

    const existingKeySet = new Set(existingDocs.map((d: any) => d.key));
    const keysToCreate = allKeys.filter((k) => !existingKeySet.has(k));
    const skipped = allKeys.length - keysToCreate.length;

    if (keysToCreate.length === 0) {
      return { total: allKeys.length, created: 0, skipped };
    }

    const docs = keysToCreate.map((key) => ({
      key,
      value: '',
      scope: dbScope,
      isDeleted: false,
      owner: { orgId: targetOrgId, userId: '', groupId: '', agentId: '', appId: '' },
      createdBy: '',
      updatedBy: '',
    }));

    let created = 0;
    let extraSkipped = 0;

    try {
      const result = await this.configModel.insertMany(docs, { ordered: false });
      created = result.length;
    } catch (error: any) {
      if (error.name === 'MongoBulkWriteError' || error.code === 11000) {
        created = error.result?.nInserted ?? error.insertedDocs?.length ?? 0;
        extraSkipped = keysToCreate.length - created;
      } else {
        throw error;
      }
    }

    return { total: allKeys.length, created, skipped: skipped + extraSkipped };
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
