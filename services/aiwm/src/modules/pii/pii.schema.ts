import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type PiiDocument = Pii & Document;

/**
 * PII - Personally Identifiable Information Pattern
 * Defines regex patterns for detecting and redacting sensitive data
 * Uses MongoDB _id as the primary identifier
 */
@Schema({ timestamps: true, collection: 'piis' })
export class Pii extends BaseSchema {
  @Prop({ required: true })
  name!: string; // e.g., "Email Address", "Phone Number (Vietnam)"

  @Prop({ required: true })
  pattern!: string; // Regex pattern as string

  @Prop({ required: true })
  replacement!: string; // e.g., "[EMAIL_REDACTED]", "[PHONE_REDACTED]"

  @Prop()
  description?: string; // Description of what this pattern detects

  @Prop({ enum: ['active', 'inactive'], default: 'active' })
  status!: string; // 'active' or 'inactive'

  @Prop({ type: [String], default: [] })
  tags!: string[]; // e.g., ['common', 'gdpr', 'hipaa', 'vietnam']

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
  // _id is automatically provided by MongoDB
}

export const PiiSchema = SchemaFactory.createForClass(Pii);

// Indexes for performance
PiiSchema.index({ status: 1, enabled: 1, createdAt: -1 });
PiiSchema.index({ tags: 1 });
PiiSchema.index({ name: 'text', description: 'text' }); // Text search
