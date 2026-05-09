import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type SettingScope = 'global' | 'org';

/**
 * Setting Schema (skeleton — full impl in P1)
 *
 * Stores runtime configuration key-value pairs.
 * Multi-tenant: lookup priority org-specific → global → hardcoded default.
 *
 * Ref: docs/sys/PROPOSAL.md §4.1
 */
@Schema({ timestamps: true, collection: 'settings' })
export class Setting extends BaseSchema {
  @Prop({ required: true, index: true })
  key!: string;

  @Prop({ default: '' })
  value!: string;

  @Prop({ required: true, enum: ['global', 'org'], default: 'org', index: true })
  scope!: SettingScope;

  @Prop({ default: false, index: true })
  sensitive!: boolean;

  // Level 2 future fields (chừa schema, chưa dùng ở P1)
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
