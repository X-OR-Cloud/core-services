import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type InstructionDocument = Instruction & Document;

/**
 * Instruction - Defines behavior and guidelines for AI agents
 * Simple MVP version with only essential fields
 * Uses MongoDB _id as the primary identifier
 */
@Schema({ timestamps: true })
export class Instruction extends BaseSchema {
  @Prop({ required: true })
  name!: string; // e.g., "Customer Support Agent v1"

  @Prop()
  description?: string;

  @Prop({ required: true })
  systemPrompt!: string; // Main system prompt for the agent

  @Prop({ type: [String], default: [] })
  tags!: string[]; // e.g., ['customer-service', 'polite', 'helpful']

  @Prop({ enum: ['active', 'inactive'], default: 'active' })
  status!: string; // 'active' or 'inactive'

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
  // _id is automatically provided by MongoDB
}

export const InstructionSchema = SchemaFactory.createForClass(Instruction);

// Indexes for performance
InstructionSchema.index({ status: 1, createdAt: -1 });
InstructionSchema.index({ tags: 1 });
InstructionSchema.index({ name: 'text', description: 'text' }); // Text search
