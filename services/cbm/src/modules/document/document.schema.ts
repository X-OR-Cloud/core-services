import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type DocumentDocument = Document & MongooseDocument;

/**
 * Document - User or AI Agent generated documents
 * Supports multiple content types: html, text, markdown, json
 * Uses MongoDB _id as the primary identifier
 */
@Schema({ timestamps: true })
export class Document extends BaseSchema {
  @Prop({ required: true, maxlength: 500 })
  summary!: string; // Document summary/title

  @Prop({ required: true })
  content!: string; // Main document content

  @Prop({ required: true, enum: ['html', 'text', 'markdown', 'json'] })
  type!: string; // Content type

  @Prop({ type: [String], default: [] })
  labels!: string[]; // Labels for categorization and search

  // Common fields
  @Prop({ enum: ['draft', 'published', 'archived'], default: 'draft' })
  status?: string; // Document status

  @Prop({ type: String })
  projectId?: string; // Optional reference to Project

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
  // _id is automatically provided by MongoDB
}

export const DocumentSchema = SchemaFactory.createForClass(Document);

// Indexes for performance
DocumentSchema.index({ type: 1, status: 1 });
DocumentSchema.index({ labels: 1 });
DocumentSchema.index({ summary: 'text', content: 'text' }); // Full-text search
DocumentSchema.index({ createdAt: -1 }); // Sort by creation date
DocumentSchema.index({ projectId: 1 }); // Filter by project
