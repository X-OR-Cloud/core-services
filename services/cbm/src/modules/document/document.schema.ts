import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type DocumentDocument = Document & MongooseDocument;

/**
 * Document - User or AI Agent generated documents
 * Supports multiple content types: html, text, markdown, json
 * Uses MongoDB _id as the primary identifier
 */
@Schema({ timestamps: true, collection: 'documents' })
export class Document extends BaseSchema {
  @Prop({ required: true, maxlength: 500 })
  summary!: string; // Document summary/title

  @Prop({ default: '' })
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

  @Prop({ enum: ['private', 'organization'], default: 'private' })
  shareMode?: string; // Sharing mode: 'private' (creator/leads/admins only) or 'organization' (all org members can view)

  // ── Knowledge Base (RAG) extension fields ──
  @Prop({ type: Boolean, default: false })
  embeddingEnabled?: boolean; // Enable/disable RAG embedding for this document

  @Prop({ type: String })
  knowledgeCollectionId?: string; // Link to KnowledgeCollection

  @Prop({ enum: ['pending', 'processing', 'ready', 'error'], type: String, default: null })
  embeddingStatus?: string | null; // null = not enrolled in KB

  // ── Notion-lite extension fields ──

  /**
   * Index of attachments referenced by this document's content (via `file:<id>`
   * scheme in markdown). Rebuilt automatically on create/update from the content
   * body. Used for cascade soft-delete and reverse lookup.
   */
  @Prop({
    type: [{
      fileId: { type: String, required: true },
      kind: { type: String, enum: ['image', 'video', 'file'], required: true },
      placeholder: { type: String, required: true },
    }],
    default: [],
    _id: false,
  })
  attachments!: Array<{ fileId: string; kind: string; placeholder: string }>;

  /**
   * Index of resource mentions referenced by this document's content (via
   * `[label](@kind:id)` markdown links). Rebuilt automatically on create/update.
   */
  @Prop({
    type: [{
      kind: {
        type: String,
        enum: ['document', 'work', 'project', 'user', 'knowledge-collection'],
        required: true,
      },
      id: { type: String, required: true },
    }],
    default: [],
    _id: false,
  })
  mentions!: Array<{ kind: string; id: string }>;

  /**
   * Yjs binary snapshot of the in-progress collaborative draft. Null when no
   * session is active. Plan #3 (realtime collab) will write to this field via
   * Hocuspocus; Plan #2 only declares the field so the schema is forward
   * compatible and the /commit endpoint can be stubbed.
   */
  @Prop({ type: Buffer, default: null })
  draftState?: any;  // Mongoose Buffer / Binary — typed `any` so .lean() results don't collide with Node Buffer

  @Prop({ type: Date, default: null })
  draftUpdatedAt?: Date | null;

  @Prop({ type: Boolean, default: false })
  hasActiveDraft!: boolean;

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
DocumentSchema.index({ 'attachments.fileId': 1 });
DocumentSchema.index({ 'mentions.kind': 1, 'mentions.id': 1 });
DocumentSchema.index({ hasActiveDraft: 1 });
