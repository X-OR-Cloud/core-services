import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';

export type KnowledgeChunkDocument = KnowledgeChunk & MongooseDocument;

/**
 * KnowledgeChunk — derived data, does NOT extend BaseSchema (no owner/audit trail needed)
 * Chunks are rebuilt when files are reindexed.
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'knowledge_chunks' })
export class KnowledgeChunk {
  @Prop({ required: true, index: true })
  orgId!: string;

  @Prop({ required: true, index: true })
  collectionId!: string;

  @Prop({ required: true, enum: ['file', 'document'] })
  sourceType!: 'file' | 'document';

  @Prop({ required: true, index: true })
  sourceId!: string;

  @Prop({ required: true, type: Number })
  chunkIndex!: number;

  @Prop({ required: true })
  content!: string;

  @Prop({ type: Object, default: {} })
  metadata: {
    page?: number;
    section?: string;
    charStart?: number;
    charEnd?: number;
  } = {};

  @Prop({ required: true })
  qdrantPointId!: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date = new Date();
}

export const KnowledgeChunkSchema = SchemaFactory.createForClass(KnowledgeChunk);

// Indexes
KnowledgeChunkSchema.index({ collectionId: 1 });
KnowledgeChunkSchema.index({ sourceId: 1 });
KnowledgeChunkSchema.index({ orgId: 1, collectionId: 1 });
KnowledgeChunkSchema.index({ qdrantPointId: 1 });
