import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ProjectDocument = Project & MongooseDocument;

/**
 * Project - Project management entity
 * Groups works and manages large work scopes
 * Uses MongoDB _id as the primary identifier
 */
@Schema({ timestamps: true })
export class Project extends BaseSchema {
  @Prop({ required: true, maxlength: 200 })
  name!: string; // Project name

  @Prop({ maxlength: 2000 })
  description?: string; // Project description

  @Prop({ type: [String], default: [] })
  members!: string[]; // Array of user IDs (members)

  @Prop({ type: Date })
  startDate?: Date; // Project start date

  @Prop({ type: Date })
  endDate?: Date; // Project end date

  @Prop({ type: [String], default: [] })
  tags!: string[]; // Tags for categorization

  @Prop({
    required: true,
    enum: ['draft', 'active', 'on_hold', 'completed', 'archived'],
    default: 'draft'
  })
  status!: string; // Project status

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
  // _id is automatically provided by MongoDB
}

export const ProjectSchema = SchemaFactory.createForClass(Project);

// Indexes for performance
ProjectSchema.index({ status: 1 });
ProjectSchema.index({ 'owner.userId': 1 });
ProjectSchema.index({ members: 1 });
ProjectSchema.index({ tags: 1 });
ProjectSchema.index({ createdAt: -1 });
ProjectSchema.index({ name: 'text', description: 'text' }); // Full-text search
