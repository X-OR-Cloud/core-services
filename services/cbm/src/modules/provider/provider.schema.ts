import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ProviderDocument = Provider & MongooseDocument;

export type ProviderType = 'payment-gateway' | 'einvoice';
export type ProviderStatus = 'inactive' | 'active' | 'error';

/**
 * Provider — external integration config (payment gateway, e-invoice)
 * Org-scoped. `config` field is AES-256-GCM encrypted JSON string.
 * Never expose `config` in API responses — use PATCH /providers/:id/config to update.
 */
@Schema({ timestamps: true, collection: 'providers' })
export class Provider extends BaseSchema {
  @Prop({ required: true, enum: ['payment-gateway', 'einvoice'] })
  type!: ProviderType;

  @Prop({ required: true })
  provider!: string; // 'payos' | 'vnpay' | 'momo' | 'misa' | 'fast' | ...

  @Prop({ required: true })
  name!: string; // display name e.g. "PayOS Production"

  @Prop({ required: true, enum: ['inactive', 'active', 'error'], default: 'inactive' })
  status!: ProviderStatus;

  @Prop({ required: true })
  config!: string; // AES-256-GCM encrypted JSON string

  @Prop()
  lastError?: string;

  @Prop({ type: Date })
  lastTestedAt?: Date;
}

export const ProviderSchema = SchemaFactory.createForClass(Provider);

ProviderSchema.index({ 'owner.orgId': 1, type: 1 });
ProviderSchema.index({ 'owner.orgId': 1, provider: 1 });
