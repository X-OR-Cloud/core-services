import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type GuardrailDocument = Guardrail & Document;

/**
 * Guardrail - Content filtering and safety rules for AI agents
 * Reusable guardrail configurations that can be shared across multiple agents
 * Uses MongoDB _id as the primary identifier
 */
@Schema({ timestamps: true, collection: 'guardrails' })
export class Guardrail extends BaseSchema {
  @Prop({ required: true })
  name!: string; // e.g., "VTV Safe Content Filter"

  @Prop()
  description?: string; // Detailed description of this guardrail policy

  @Prop({ default: true })
  enabled!: boolean; // Whether this guardrail is active

  @Prop({ type: [String], default: [] })
  blockedKeywords!: string[]; // e.g., ['violence', 'hack', 'illegal']

  @Prop({ type: [String], default: [] })
  blockedTopics!: string[]; // e.g., ['political', 'medical', 'legal']

  @Prop()
  customMessage?: string; // Custom message when content is blocked

  @Prop({ type: [String], default: [] })
  tags!: string[]; // e.g., ['vtv', 'public', 'strict', 'education']

  @Prop({ enum: ['active', 'inactive'], default: 'active' })
  status!: string; // 'active' or 'inactive'

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
  // _id is automatically provided by MongoDB
}

export const GuardrailSchema = SchemaFactory.createForClass(Guardrail);

// Indexes for performance
GuardrailSchema.index({ status: 1, enabled: 1, createdAt: -1 });
GuardrailSchema.index({ tags: 1 });
GuardrailSchema.index({ name: 'text', description: 'text' }); // Text search
