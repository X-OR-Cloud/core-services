import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ApiKeyDocument = ApiKey & Document;

/**
 * ApiKey - Org-level API Key for authenticating AIWM API calls
 *
 * Key format: xai_<8-char-prefix>.<32-char-random>
 * - Only keyHash (SHA-256) is stored, plain text is returned once on creation
 * - keyPrefix is stored for display/identification in list APIs
 *
 * Scopes:
 * - "all"              → full AIWM API access
 * - "deployment:<id>"  → only /deployments/<id>/inference/* endpoints
 */
@Schema({ timestamps: true })
export class ApiKey extends BaseSchema {
  @Prop({ required: true, maxlength: 100 })
  name!: string;

  @Prop({ required: true, unique: true })
  keyHash!: string; // SHA-256 of the full key string

  @Prop({ required: true, length: 8 })
  keyPrefix!: string; // First 8 chars after "xai_", for display only

  @Prop({ type: [String], default: ['all'] })
  scopes!: string[]; // ["all"] or ["deployment:id1", "deployment:id2"]

  @Prop({ required: true, enum: ['active', 'revoked'], default: 'active' })
  status!: string;

  @Prop({ type: Date, default: null })
  lastUsedAt?: Date | null;

  @Prop({ type: Date, default: null })
  expiresAt?: Date | null;

  // BaseSchema provides: owner (orgId, userId...), createdBy, updatedBy, isDeleted, timestamps
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);

ApiKeySchema.index({ keyHash: 1 }, { unique: true });
ApiKeySchema.index({ 'owner.orgId': 1, status: 1 });
ApiKeySchema.index({ scopes: 1 });
