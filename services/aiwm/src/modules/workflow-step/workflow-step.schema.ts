import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type WorkflowStepDocument = WorkflowStep & Document;

/**
 * WorkflowStep - Individual step definition in a workflow
 * Defines the configuration for each step in a workflow template
 */
@Schema({ timestamps: true })
export class WorkflowStep extends BaseSchema {
  @Prop({ type: Types.ObjectId, ref: 'Workflow', required: true, index: true })
  workflowId!: Types.ObjectId;

  @Prop({ required: true, maxlength: 200 })
  name!: string;

  @Prop({ maxlength: 500 })
  description?: string;

  @Prop({ required: true, min: 0 })
  orderIndex!: number;

  @Prop({ required: true, enum: ['llm'], default: 'llm' })
  type!: string; // MVP: only 'llm'

  @Prop({ required: true, type: Object })
  llmConfig!: {
    deploymentId: string;
    systemPrompt: string;
    userPromptTemplate?: string;
    parameters?: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
    };
    timeout?: number; // Default: 30000ms
  };

  @Prop({ type: Object })
  inputSchema?: Record<string, any>; // JSON Schema

  @Prop({ type: Object })
  outputSchema?: Record<string, any>; // JSON Schema

  @Prop({ type: [String], default: [] })
  dependencies!: string[]; // Array of WorkflowStep._id references

  @Prop({ type: Object })
  errorHandling?: {
    maxRetries?: number;
    retryDelayMs?: number;
    continueOnError?: boolean;
  };

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
  // _id is automatically provided by MongoDB
}

export const WorkflowStepSchema = SchemaFactory.createForClass(WorkflowStep);

// Indexes for performance
WorkflowStepSchema.index({ workflowId: 1, orderIndex: 1 });
WorkflowStepSchema.index({ 'owner.orgId': 1, 'owner.userId': 1 });
