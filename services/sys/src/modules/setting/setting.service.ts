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
import { Setting, SettingScope } from './setting.schema';
import {
  CreateSettingDto,
  UpdateSettingDto,
  InitializeSettingsDto,
} from './setting.dto';
import { SETTING_METADATA, SettingKeyMetadata } from './constants';
import { SettingPublisherService } from './setting-publisher.service';

/**
 * Setting Service
 *
 * CRUD + RBAC + validation cho settings.
 * Ref: docs/sys/PROPOSAL.md §4
 */
@Injectable()
export class SettingService extends BaseService<Setting> {
  constructor(
    @InjectModel(Setting.name)
    private readonly settingModel: Model<Setting>,
    private readonly publisher: SettingPublisherService,
  ) {
    super(settingModel as any);
  }

  // =========================================================================
  // Read operations
  // =========================================================================

  /**
   * List all settings (metadata only — values masked for sensitive, included for non-sensitive in detail).
   */
  async findAll(
    options: FindManyOptions,
    context: RequestContext,
  ): Promise<FindManyResult<Setting>> {
    const result = await super.findAll(options, context);
    result.statistics = { total: result.pagination.total };
    return result;
  }

  /**
   * Find setting by key with org → global fallback.
   * Returns the raw document (caller decides whether to mask value).
   */
  async findByKey(key: ConfigKey, context: RequestContext): Promise<Setting | null> {
    // Try org-specific first
    const orgConfig = await this.settingModel
      .findOne({
        key,
        scope: 'org',
        isDeleted: false,
        'owner.orgId': context.orgId,
      })
      .exec();
    if (orgConfig) return orgConfig;

    // Fallback to global
    return this.settingModel
      .findOne({ key, scope: 'global', isDeleted: false })
      .exec();
  }

  /**
   * Reveal sensitive value — universe.owner only. Caller logs audit.
   */
  async revealByKey(key: ConfigKey, context: RequestContext): Promise<Setting> {
    if (!context.roles?.includes(PredefinedRole.UniverseOwner)) {
      throw new ForbiddenException('Only universe.owner can reveal sensitive values');
    }

    const setting = await this.findByKey(key, context);
    if (!setting) {
      throw new NotFoundException(`Setting with key '${key}' not found`);
    }
    return setting;
  }

  // =========================================================================
  // Write operations
  // =========================================================================

  /**
   * Upsert setting: create if missing, update value/notes if exists.
   * `sensitive` flag is derived from metadata, not from input.
   */
  async createOrUpdate(dto: CreateSettingDto, context: RequestContext): Promise<Setting> {
    this.validateValue(dto.key, dto.value);

    const scope: SettingScope = dto.scope ?? 'org';
    this.assertCanWriteScope(scope, context);

    const sensitive = this.isSensitive(dto.key);
    const filter: Record<string, unknown> = {
      key: dto.key,
      scope,
      isDeleted: false,
      'owner.orgId': scope === 'global' ? '' : context.orgId,
    };

    const existing = await this.settingModel.findOne(filter).exec();

    if (existing) {
      const updateData: Record<string, unknown> = {
        value: dto.value,
        sensitive, // keep in sync with metadata (in case metadata flag changed)
        updatedBy: context.userId,
        updatedAt: new Date(),
      };
      if (dto.notes !== undefined) updateData.notes = dto.notes;

      await this.settingModel.updateOne({ _id: existing._id }, { $set: updateData });
      const updated = await this.settingModel.findById(existing._id).exec();
      this.logger.log('Setting updated', { key: dto.key, scope, sensitive });
      await this.publisher.publishSettingInvalidate({
        key: dto.key,
        scope,
        orgId: scope === 'global' ? null : context.orgId,
        sensitive,
      });
      return updated as Setting;
    }

    const created = await super.create(
      { ...dto, scope, sensitive } as any,
      context,
    );
    this.logger.log('Setting created', { key: dto.key, scope, sensitive });
    await this.publisher.publishSettingInvalidate({
      key: dto.key,
      scope,
      orgId: scope === 'global' ? null : context.orgId,
      sensitive,
    });
    return created as Setting;
  }

  /**
   * Update an existing setting by key (partial).
   */
  async updateByKey(
    key: ConfigKey,
    dto: UpdateSettingDto,
    context: RequestContext,
  ): Promise<Setting> {
    const setting = await this.findByKey(key, context);
    if (!setting) throw new NotFoundException(`Setting with key '${key}' not found`);

    this.assertCanWriteScope(setting.scope, context);

    const updateData: Record<string, unknown> = {
      updatedBy: context.userId,
      updatedAt: new Date(),
    };

    if (dto.value !== undefined) {
      this.validateValue(key, dto.value);
      updateData.value = dto.value;
    }
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    await this.settingModel.updateOne(
      { _id: (setting as any)._id },
      { $set: updateData },
    );
    const updated = await this.settingModel.findById((setting as any)._id).exec();
    this.logger.log('Setting updated', { key, scope: setting.scope });
    await this.publisher.publishSettingInvalidate({
      key,
      scope: setting.scope,
      orgId: setting.scope === 'global' ? null : (setting.owner?.orgId || context.orgId),
      sensitive: setting.sensitive,
    });
    return updated as Setting;
  }

  /**
   * Soft delete by key.
   */
  async deleteByKey(key: ConfigKey, context: RequestContext): Promise<void> {
    const setting = await this.findByKey(key, context);
    if (!setting) throw new NotFoundException(`Setting with key '${key}' not found`);

    this.assertCanWriteScope(setting.scope, context);

    await this.settingModel.updateOne(
      { _id: (setting as any)._id },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          updatedBy: context.userId,
        },
      },
    );
    this.logger.log('Setting deleted', { key, scope: setting.scope });
    await this.publisher.publishSettingInvalidate({
      key,
      scope: setting.scope,
      orgId: setting.scope === 'global' ? null : (setting.owner?.orgId || context.orgId),
      sensitive: setting.sensitive,
    });
  }

  // =========================================================================
  // Bulk initialize
  // =========================================================================

  /**
   * Initialize all known setting keys with empty values for the target scope/org.
   * Only creates missing keys — never overwrites.
   *
   * RBAC:
   * - universe.owner + scope=global → seed global settings (owner.orgId = '')
   * - universe.owner + scope=org + orgId → seed for specified org (validate ObjectId)
   * - universe.owner + scope=org without orgId → seed for caller orgId
   * - organization.owner + scope=org → seed for caller orgId (orgId in body ignored)
   * - organization.owner + scope=global → forbidden
   * - other roles → forbidden
   */
  async initializeAll(
    dto: InitializeSettingsDto,
    context: RequestContext,
  ): Promise<{ total: number; created: number; skipped: number }> {
    const isUniverseOwner = context.roles?.includes(PredefinedRole.UniverseOwner);
    const isOrgOwner = context.roles?.includes(PredefinedRole.OrganizationOwner);

    if (!isUniverseOwner && !isOrgOwner) {
      throw new ForbiddenException(
        'Only universe.owner or organization.owner can initialize settings',
      );
    }
    if (dto.scope === 'global' && !isUniverseOwner) {
      throw new ForbiddenException('Only universe.owner can initialize global settings');
    }

    let targetOrgId: string;
    if (dto.scope === 'global') {
      targetOrgId = '';
    } else if (isUniverseOwner && dto.orgId) {
      if (!/^[0-9a-fA-F]{24}$/.test(dto.orgId)) {
        throw new BadRequestException(`Invalid organization ID format: '${dto.orgId}'`);
      }
      targetOrgId = dto.orgId;
    } else {
      if (!context.orgId) {
        throw new BadRequestException('Could not determine target organization');
      }
      targetOrgId = context.orgId;
    }

    return this.bulkInsertMissingKeys(dto.scope, targetOrgId, context.userId);
  }

  /**
   * Internal — bypasses role check. For SetupService bootstrap.
   */
  async initializeAllInternal(params: {
    scope: SettingScope;
    orgId: string;
  }): Promise<{ total: number; created: number; skipped: number }> {
    const targetOrgId = params.scope === 'global' ? '' : params.orgId;
    return this.bulkInsertMissingKeys(params.scope, targetOrgId, '');
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private async bulkInsertMissingKeys(
    scope: SettingScope,
    targetOrgId: string,
    userId: string,
  ): Promise<{ total: number; created: number; skipped: number }> {
    const allKeys = Object.values(ConfigKey);

    const existingDocs = await this.settingModel
      .find({
        key: { $in: allKeys },
        scope,
        isDeleted: false,
        'owner.orgId': targetOrgId,
      })
      .select('key')
      .lean()
      .exec();

    const existingKeySet = new Set(existingDocs.map((d: any) => d.key));
    const keysToCreate = allKeys.filter((k) => !existingKeySet.has(k));
    let skipped = allKeys.length - keysToCreate.length;

    if (keysToCreate.length === 0) {
      return { total: allKeys.length, created: 0, skipped };
    }

    const docs = keysToCreate.map((key) => ({
      key,
      value: '',
      scope,
      sensitive: this.isSensitive(key),
      isDeleted: false,
      owner: {
        orgId: targetOrgId,
        userId,
        groupId: '',
        agentId: '',
        appId: '',
      },
      createdBy: userId,
      updatedBy: userId,
    }));

    let created = 0;
    try {
      const result: any = await this.settingModel.insertMany(docs, {
        ordered: false,
        rawResult: true,
      });
      created = result.insertedCount ?? result.length ?? 0;
    } catch (error: any) {
      // ordered:false may partially succeed and throw BulkWriteError on dupes
      if (error.name === 'MongoBulkWriteError' || error.code === 11000) {
        created = error.result?.nInserted ?? error.insertedDocs?.length ?? 0;
        skipped += keysToCreate.length - created;
      } else {
        throw error;
      }
    }

    this.logger.log('Settings initialization completed', {
      scope,
      orgId: targetOrgId,
      total: allKeys.length,
      created,
      skipped,
    });
    return { total: allKeys.length, created, skipped };
  }

  /**
   * Whether a key is configured as sensitive in metadata.
   */
  isSensitive(key: ConfigKey): boolean {
    return SETTING_METADATA[key]?.sensitive === true;
  }

  /**
   * RBAC: only universe.owner can write global; org.owner can write own org.
   */
  private assertCanWriteScope(scope: SettingScope, context: RequestContext): void {
    const isUniverseOwner = context.roles?.includes(PredefinedRole.UniverseOwner);
    const isOrgOwner = context.roles?.includes(PredefinedRole.OrganizationOwner);

    if (scope === 'global' && !isUniverseOwner) {
      throw new ForbiddenException('Only universe.owner can write global settings');
    }
    if (scope === 'org' && !isUniverseOwner && !isOrgOwner) {
      throw new ForbiddenException('Only organization.owner can write org settings');
    }
  }

  /**
   * Validate value against metadata rules (dataType, validation block).
   */
  private validateValue(key: ConfigKey, value: string): void {
    const metadata: SettingKeyMetadata | undefined = SETTING_METADATA[key];
    if (!metadata) {
      throw new BadRequestException(`Invalid setting key: ${key}`);
    }

    switch (metadata.dataType) {
      case 'number':
        if (isNaN(Number(value))) {
          throw new BadRequestException(`Value for '${key}' must be a number`);
        }
        if (metadata.validation?.min !== undefined && Number(value) < metadata.validation.min) {
          throw new BadRequestException(
            `Value for '${key}' must be at least ${metadata.validation.min}`,
          );
        }
        if (metadata.validation?.max !== undefined && Number(value) > metadata.validation.max) {
          throw new BadRequestException(
            `Value for '${key}' must be at most ${metadata.validation.max}`,
          );
        }
        break;

      case 'boolean':
        if (!['true', 'false', '1', '0'].includes(value.toLowerCase())) {
          throw new BadRequestException(`Value for '${key}' must be true/false or 1/0`);
        }
        break;

      case 'url':
        try {
          new URL(value);
        } catch {
          throw new BadRequestException(`Value for '${key}' must be a valid URL`);
        }
        break;

      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          throw new BadRequestException(`Value for '${key}' must be a valid email`);
        }
        break;
    }

    if (metadata.validation?.pattern) {
      const regex = new RegExp(metadata.validation.pattern);
      if (!regex.test(value)) {
        throw new BadRequestException(`Value for '${key}' does not match required pattern`);
      }
    }
    if (
      metadata.validation?.minLength !== undefined &&
      value.length < metadata.validation.minLength
    ) {
      throw new BadRequestException(
        `Value for '${key}' must be at least ${metadata.validation.minLength} characters`,
      );
    }
    if (
      metadata.validation?.maxLength !== undefined &&
      value.length > metadata.validation.maxLength
    ) {
      throw new BadRequestException(
        `Value for '${key}' must be at most ${metadata.validation.maxLength} characters`,
      );
    }
    if (metadata.validation?.enum && !metadata.validation.enum.includes(value)) {
      throw new BadRequestException(
        `Value for '${key}' must be one of: ${metadata.validation.enum.join(', ')}`,
      );
    }
  }
}
