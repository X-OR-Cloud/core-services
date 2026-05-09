import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { ConfigKey } from '@hydrabyte/shared';

export type SettingScope = 'global' | 'org';

/**
 * Setting Schema
 *
 * Stores runtime configuration key-value pairs.
 * Multi-tenant: lookup priority org-specific → global → hardcoded default.
 *
 * Reuses `ConfigKey` enum from @hydrabyte/shared so dual-read with
 * `core_aiwm.configurations` works during P5 migration window.
 *
 * Ref: docs/sys/PROPOSAL.md §4.1
 */
@Schema({ timestamps: true, collection: 'settings' })
export class Setting extends BaseSchema {
  @Prop({ required: true, enum: Object.values(ConfigKey), index: true })
  key!: string;

  @Prop({ default: '' })
  value!: string;

  @Prop({ required: true, enum: ['global', 'org'], default: 'org', index: true })
  scope!: SettingScope;

  @Prop({ default: false, index: true })
  sensitive!: boolean;

  // Level 2 future fields — chừa schema sẵn (PROPOSAL §4.1)
  @Prop({ default: false })
  encrypted!: boolean;

  @Prop()
  iv?: string;

  @Prop()
  authTag?: string;

  @Prop({ default: 1 })
  keyVersion?: number;

  @Prop()
  notes?: string;
}

export const SettingSchema = SchemaFactory.createForClass(Setting);

// Indexes
SettingSchema.index({ deletedAt: 1 });

// Unique constraint: one key per scope+org
// global scope → key + scope unique (owner.orgId is empty)
// org scope → key + scope + owner.orgId unique
SettingSchema.index(
  { key: 1, scope: 1, 'owner.orgId': 1 },
  { unique: true, name: 'unique_key_per_scope_org' },
);
