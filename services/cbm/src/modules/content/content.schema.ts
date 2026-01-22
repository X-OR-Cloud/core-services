import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ContentDocument = Content & MongooseDocument;

/**
 * MediaAttachment - Reference to media files stored in S3-like storage
 */
export interface MediaAttachment {
  id: string; // Unique attachment ID
  type: 'image' | 'video' | 'audio' | 'file';

  // Storage reference
  storageProvider: 'minio' | 's3' | 'url'; // Where it's stored
  storageKey?: string; // Object key (for minio/s3)
  url: string; // Access URL (public or signed)

  // File metadata
  originalName: string; // Original filename
  size: number; // File size in bytes
  mime: string; // MIME type (image/jpeg, video/mp4)

  // Media-specific metadata
  dimensions?: {
    width: number;
    height: number;
  };
  duration?: number; // For video/audio (seconds)
  thumbnail?: string; // Small base64 preview (< 100KB)

  // Processing status (for future async processing)
  processingStatus?: 'pending' | 'processing' | 'complete' | 'failed';
  processingError?: string;

  // Timestamps
  uploadedAt: Date;
}

/**
 * Content - Universal content type supporting text and multimedia
 * Supports multiple content types: html, text, markdown, json, multipart
 * Uses MongoDB _id as the primary identifier
 */
@Schema({ timestamps: true })
export class Content extends BaseSchema {
  @Prop({ required: true, maxlength: 500 })
  summary!: string; // Content summary/title

  @Prop({ required: true })
  body!: string; // Main text content (renamed from 'content' for clarity)

  @Prop({
    required: true,
    enum: ['html', 'text', 'markdown', 'json', 'multipart'],
  })
  contentType!: string; // Type of body content (renamed from 'type')

  @Prop({ type: [Object], default: [] })
  attachments!: MediaAttachment[]; // Media attachments (NEW)

  @Prop({ type: [String], default: [] })
  labels!: string[]; // Labels for categorization and search

  // Common fields
  @Prop({ enum: ['draft', 'published', 'archived'], default: 'draft' })
  status?: string; // Content status

  @Prop({ enum: ['public', 'org', 'private'], default: 'private' })
  scope?: string; // Access control

  // Optional: For future AI analysis
  @Prop({ type: Object })
  aiMetadata?: {
    generatedBy?: string; // AI model/agent ID
    confidence?: number; // Generation confidence
    tags?: string[]; // AI-generated tags
    summary?: string; // AI-generated summary
  };

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, isDeleted, metadata, timestamps
  // _id is automatically provided by MongoDB
}

export const ContentSchema = SchemaFactory.createForClass(Content);

// Indexes for performance
ContentSchema.index({ contentType: 1, status: 1 });
ContentSchema.index({ labels: 1 });
ContentSchema.index({ summary: 'text', body: 'text' }); // Full-text search
ContentSchema.index({ createdAt: -1 }); // Sort by creation date
ContentSchema.index({ 'owner.orgId': 1, status: 1 }); // Organization filter
ContentSchema.index({ 'attachments.type': 1 }); // Search by attachment type
