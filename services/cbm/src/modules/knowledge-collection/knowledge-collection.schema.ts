import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type KnowledgeCollectionDocument = KnowledgeCollection & MongooseDocument;

export type CollectionStatus = 'idle' | 'processing' | 'ready' | 'error';

export class ChunkingConfig {
  strategy: 'fixed' | 'sentence' | 'paragraph' = 'sentence';
  chunkSize: number = 512;
  chunkOverlap: number = 64;
}

export class CollectionStats {
  totalFiles: number = 0;
  readyFiles: number = 0;
  processingFiles: number = 0;
  errorFiles: number = 0;
  pendingFiles: number = 0;
  totalSize: number = 0;
  totalChunks: number = 0;
}

/**
 * KnowledgeCollection — domain/knowledge repository
 * Org-scoped via owner.orgId (inherited from BaseSchema)
 */
@Schema({ timestamps: true, collection: 'knowledge_collections' })
export class KnowledgeCollection extends BaseSchema {
  @Prop({ required: true, maxlength: 200 })
  name!: string;

  @Prop({ maxlength: 1000 })
  description?: string;

  @Prop({ type: String })
  projectId?: string;

  @Prop({ enum: ['idle', 'processing', 'ready', 'error'], default: 'idle' })
  status: CollectionStatus = 'idle';

  @Prop({ type: Object, default: () => ({}) })
  chunkingConfig?: ChunkingConfig;

  @Prop({ type: String })
  embeddingModel?: string;

  @Prop({ type: String })
  qdrantCollection?: string;

  @Prop({ type: Object, default: () => new CollectionStats() })
  stats: CollectionStats = new CollectionStats();
}

export const KnowledgeCollectionSchema = SchemaFactory.createForClass(KnowledgeCollection);

// Indexes
KnowledgeCollectionSchema.index({ 'owner.orgId': 1, isDeleted: 1 });
KnowledgeCollectionSchema.index({ projectId: 1 });
KnowledgeCollectionSchema.index({ status: 1 });
KnowledgeCollectionSchema.index({ createdAt: -1 });
