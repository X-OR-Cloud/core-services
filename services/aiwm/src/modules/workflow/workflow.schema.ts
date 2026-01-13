import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type WorkflowDocument = Workflow & Document;

/**
 * Workflow - Workflow Template Definition
 * Defines reusable workflow templates for orchestrating multi-step LLM pipelines
 */
@Schema({ timestamps: true })
export class Workflow extends BaseSchema {
  @Prop({ required: true, maxlength: 200 })
  name!: string;

  @Prop({ maxlength: 1000 })
  description?: string;

  @Prop({ required: true, default: 'v1.0' })
  version!: string;

  @Prop({ required: true, enum: ['draft', 'active', 'archived'], default: 'draft' })
  status!: string;

  @Prop({ required: true, enum: ['internal', 'langgraph'], default: 'internal' })
  executionMode!: string;

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
  // _id is automatically provided by MongoDB
}

export const WorkflowSchema = SchemaFactory.createForClass(Workflow);

// Indexes for performance
WorkflowSchema.index({ status: 1 });
WorkflowSchema.index({ 'owner.orgId': 1, 'owner.userId': 1 });
WorkflowSchema.index({ name: 'text', description: 'text' }); // Text search
