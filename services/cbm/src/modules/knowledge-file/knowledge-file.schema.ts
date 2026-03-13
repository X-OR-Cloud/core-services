import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type KnowledgeFileDocument = KnowledgeFile & MongooseDocument;

export type EmbeddingStatus = 'pending' | 'processing' | 'ready' | 'error';

/**
 * KnowledgeFile — physical file uploaded by user, raw data source for indexing.
 * Org-scoped via owner.orgId (inherited from BaseSchema).
 */
@Schema({ timestamps: true, collection: 'knowledge_files' })
export class KnowledgeFile extends BaseSchema {
  @Prop({ required: true, type: String })
  collectionId!: string;

  @Prop({ required: true, maxlength: 500 })
  name!: string;

  @Prop({ required: true })
  fileName!: string;

  @Prop({ required: true })
  filePath!: string;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ type: Number, default: 0 })
  fileSize: number = 0;

  @Prop({ type: String })
  rawContent?: string;

  @Prop({ enum: ['pending', 'processing', 'ready', 'error'], default: 'pending' })
  embeddingStatus: EmbeddingStatus = 'pending';

  @Prop({ type: String })
  errorMessage?: string;

  @Prop({ type: Number, default: 0 })
  chunkCount: number = 0;
}

export const KnowledgeFileSchema = SchemaFactory.createForClass(KnowledgeFile);

// Indexes
KnowledgeFileSchema.index({ collectionId: 1, isDeleted: 1 });
KnowledgeFileSchema.index({ 'owner.orgId': 1, isDeleted: 1 });
KnowledgeFileSchema.index({ embeddingStatus: 1 });
KnowledgeFileSchema.index({ createdAt: -1 });
