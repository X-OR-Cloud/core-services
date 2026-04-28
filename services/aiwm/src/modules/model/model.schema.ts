import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ModelDocument = Model & Document;

/**
 * Model - AI/ML Models Registry
 * Simple MVP version supporting both self-hosted and API-based models
 * Uses MongoDB _id as the primary identifier
 */
@Schema({ timestamps: true, collection: 'models' })
export class Model extends BaseSchema {
  // Core fields (both deployment types)
  @Prop({ required: true, maxlength: 100 })
  name!: string; // e.g., "GPT-4.1-2024-11-20", "Llama-3.1-8B", "Whisper-Large-v3" (version included in name)

  @Prop({ required: true, enum: ['llm', 'vision', 'embedding', 'voice'] })
  type!: string; // llm: text models, vision: image/OCR/generation, embedding: embeddings, voice: ASR/TTS

  @Prop({ required: true, maxlength: 500 })
  description!: string;

  @Prop({ required: true, enum: ['self-hosted', 'api-based'] })
  deploymentType!: string; // Distinguishes between self-hosted GPU models and API-forwarded models

  // Status lifecycle - auto-initialized based on deploymentType in service layer
  @Prop({
    required: true,
    enum: [
      'queued', 'downloading', 'downloaded', 'deploying', 'active', 'inactive',
      'download-failed', 'deploy-failed', 'validating', 'invalid-credentials', 'error'
    ],
  })
  status!: string;
  /**
   * Status transitions:
   *
   * Self-hosted models (initial: queued):
   *   queued → downloading → downloaded → deploying → active
   *      ↓          ↓            ↓
   *   download-failed  deploy-failed  error
   *
   *   active ↔ inactive (user toggle via activate/deactivate APIs)
   *
   * API-based models (initial: validating):
   *   validating → active
   *       ↓
   *   invalid-credentials
   *
   *   active ↔ inactive (user toggle via activate/deactivate APIs)
   */

  // Self-hosted model fields (required if deploymentType = 'self-hosted')
  @Prop()
  repository?: string; // HuggingFace repo, e.g., "meta-llama/Llama-3-8B"

  @Prop({ enum: ['vllm', 'triton'] })
  framework?: string; // vllm: optimized for LLM inference, triton: multi-purpose (vision, voice, embedding)

  @Prop()
  fileName?: string; // Model file name

  @Prop()
  fileSize?: number; // In bytes

  @Prop()
  downloadPath?: string; // Local/MinIO path after download

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Node' })
  nodeId?: MongooseSchema.Types.ObjectId; // GPU node for deployment

  // API-based model fields (required if deploymentType = 'api-based')
  @Prop()
  provider?: string; // 'openai', 'anthropic', 'google', 'azure', 'cohere'

  @Prop()
  apiEndpoint?: string; // e.g., "https://api.openai.com/v1"

  @Prop()
  modelIdentifier?: string; // API model name, e.g., "gpt-4-turbo", "claude-3-sonnet-20240229"

  @Prop({ type: Object })
  apiConfig?: Record<string, string>; // API authentication and configuration
  // Store API keys, bearer tokens, custom headers, rate limits, etc.
  // Example: { "apiKey": "sk-...", "organization": "org-...", "customHeader": "value" }

  // Access control
  @Prop({ required: true, enum: ['public', 'org', 'private'], default: 'public' })
  scope!: string;

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
  // _id is automatically provided by MongoDB
}

export const ModelSchema = SchemaFactory.createForClass(Model);

// Indexes for performance
ModelSchema.index({ type: 1, status: 1 });
ModelSchema.index({ deploymentType: 1 });
ModelSchema.index({ provider: 1 }); // For API-based models
ModelSchema.index({ nodeId: 1 }); // For self-hosted models
ModelSchema.index({ name: 'text', description: 'text' }); // Text search
