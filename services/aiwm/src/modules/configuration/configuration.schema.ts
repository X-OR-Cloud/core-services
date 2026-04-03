import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { ConfigKey } from '@hydrabyte/shared';

export type ConfigScope = 'global' | 'org';

/**
 * Configuration Schema
 *
 * Stores system configuration key-value pairs.
 * V3: Multi-tenant with global/org scope support.
 *
 * Lookup priority: org-specific → global → hardcoded default
 */
@Schema({ timestamps: true })
export class Configuration extends BaseSchema {
  @Prop({
    required: true,
    enum: Object.values(ConfigKey),
    index: true,
  })
  key!: string;

  @Prop({ default: '' })
  value!: string;

  @Prop({ required: true, enum: ['global', 'org'], default: 'org', index: true })
  scope!: ConfigScope;

  @Prop()
  notes?: string;

  // BaseSchema provides:
  // - owner (orgId, userId, groupId, agentId, appId)
  // - createdBy, updatedBy
  // - deletedAt (soft delete)
  // - createdAt, updatedAt (timestamps: true)
}

export const ConfigurationSchema =
  SchemaFactory.createForClass(Configuration);

// Indexes
ConfigurationSchema.index({ key: 1 });
ConfigurationSchema.index({ deletedAt: 1 });

// Unique constraint: one key per scope+org
// global scope: key + scope unique (owner.orgId is empty)
// org scope: key + scope + owner.orgId unique
ConfigurationSchema.index(
  { key: 1, scope: 1, 'owner.orgId': 1 },
  { unique: true, name: 'unique_key_per_scope_org' }
);
