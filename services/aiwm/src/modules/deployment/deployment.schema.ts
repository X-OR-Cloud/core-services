import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type DeploymentDocument = Deployment & Document;

/**
 * Deployment - Model Deployment Records
 * Supports both API-based and self-hosted model deployments
 * Uses MongoDB _id as the primary identifier
 */
@Schema({ timestamps: true, collection: 'deployments' })
export class Deployment extends BaseSchema {
  // Core fields
  @Prop({ required: true, maxlength: 100 })
  name!: string; // e.g., "Llama 3.1 8B - Production", "GPT-4 Production"

  @Prop({ required: true, maxlength: 500 })
  description!: string;

  // References (stored as strings for simplicity)
  @Prop({ required: true })
  modelId!: string; // Model to deploy (MongoDB ObjectId as string)

  // Self-hosted specific fields (optional - only required for self-hosted deployments)
  @Prop()
  nodeId?: string; // GPU node for deployment (MongoDB ObjectId as string)

  @Prop()
  resourceId?: string; // Inference container resource (MongoDB ObjectId as string)

  // Status lifecycle
  @Prop({
    required: true,
    enum: ['queued', 'deploying', 'running', 'stopping', 'stopped', 'failed', 'error'],
    default: 'queued',
  })
  status!: string;
  // 'queued': Waiting for deployment
  // 'deploying': Currently being deployed to node
  // 'running': Successfully deployed and running
  // 'stopping': Being stopped
  // 'stopped': Stopped by user
  // 'failed': Deployment failed
  // 'error': Runtime error

  // Note: Container info (containerId, containerName, dockerImage, containerPort, endpoint, gpuDevice)
  // are now retrieved from the linked Resource document via resourceId

  // Error handling
  @Prop()
  errorMessage?: string; // Error details if status = 'failed' or 'error'

  // Health monitoring
  @Prop()
  lastHealthCheck?: Date; // Last successful health check

  // Usage tracking (for both API-based and self-hosted)
  @Prop({ default: 0 })
  requestCount?: number; // Total number of inference requests

  @Prop({ default: 0 })
  totalTokens?: number; // Total tokens consumed (from provider usage field)

  @Prop({ default: 0 })
  totalCost?: number; // Total cost in USD (optional, for future cost tracking)

  // TODO Phase 3: PII & Guardrails
  // @Prop()
  // guardrailId?: string; // Optional guardrail override for this deployment
  //
  // @Prop({ default: true })
  // piiEnabled?: boolean; // Enable/disable PII redaction for this deployment

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
  // _id is automatically provided by MongoDB
}

export const DeploymentSchema = SchemaFactory.createForClass(Deployment);

// Indexes for performance
DeploymentSchema.index({ status: 1 });
DeploymentSchema.index({ modelId: 1 });
DeploymentSchema.index({ modelId: 1, status: 1 }); // Compound index for queries
DeploymentSchema.index({ nodeId: 1 }); // Sparse index (only for self-hosted)
DeploymentSchema.index({ resourceId: 1 }); // Sparse index (only for self-hosted)
DeploymentSchema.index({ requestCount: -1 }); // For top deployments query
DeploymentSchema.index({ name: 'text', description: 'text' }); // Text search
