import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type FileEntityDocument = FileEntity & MongooseDocument;

export type EmbeddingStatus = 'pending' | 'processing' | 'ready' | 'error';

export type FilePurpose = 'knowledge' | 'attachment' | 'avatar' | 'cover' | 'other';

export type OwnerRefKind =
  | 'knowledge-collection'
  | 'document'
  | 'work'
  | 'project'
  | 'user'
  | 'organization';

export type StorageKind = 's3' | 'local';

@Schema({ timestamps: true, collection: 'files' })
export class FileEntity extends BaseSchema {
  // ── Identification ──
  @Prop({ required: true, maxlength: 500 })
  name!: string;

  @Prop({ required: true })
  fileName!: string;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ type: Number, default: 0 })
  fileSize: number = 0;

  // ── Storage ──
  @Prop({ required: true, enum: ['s3', 'local'], default: 's3' })
  storageKind!: StorageKind;

  @Prop({ required: true })
  storageKey!: string;

  @Prop({ type: String })
  storageBucket?: string;

  // ── Purpose & ownership ──
  @Prop({
    required: true,
    enum: ['knowledge', 'attachment', 'avatar', 'cover', 'other'],
    default: 'other',
  })
  purpose!: FilePurpose;

  @Prop({
    type: {
      kind: {
        type: String,
        enum: ['knowledge-collection', 'document', 'work', 'project', 'user', 'organization'],
      },
      id: { type: String },
    },
    _id: false,
  })
  ownerRef?: { kind: OwnerRefKind; id: string };

  // ── RAG-specific (purpose='knowledge') ──
  @Prop({ type: String })
  rawContent?: string;

  @Prop({
    enum: ['pending', 'processing', 'ready', 'error'],
    type: String,
    default: null,
  })
  embeddingStatus?: EmbeddingStatus | null;

  @Prop({ type: String })
  errorMessage?: string;

  @Prop({ type: Number, default: 0 })
  chunkCount?: number;

  // ── Attachment-specific (purpose='attachment') ──
  @Prop({ type: Number })
  width?: number;

  @Prop({ type: Number })
  height?: number;

  @Prop({ type: String })
  posterKey?: string;

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
}

export const FileEntitySchema = SchemaFactory.createForClass(FileEntity);

FileEntitySchema.index({ purpose: 1, 'ownerRef.kind': 1, 'ownerRef.id': 1, isDeleted: 1 });
FileEntitySchema.index({ 'owner.orgId': 1, isDeleted: 1 });
FileEntitySchema.index({ embeddingStatus: 1 });
FileEntitySchema.index({ createdAt: -1 });
