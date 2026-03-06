import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ProjectDocument = Project & MongooseDocument;

export interface ProjectMember {
  type: 'user' | 'agent';
  id: string; // ObjectId string
  role: 'project.lead' | 'project.member';
}

/**
 * Project - Project management entity
 * Groups works and manages large work scopes
 * Uses MongoDB _id as the primary identifier
 */
@Schema({ timestamps: true })
export class Project extends BaseSchema {
  @Prop({ required: true, maxlength: 200 })
  name!: string;

  @Prop({ maxlength: 500 })
  summary?: string; // Public-facing short description visible to all org members

  @Prop({ maxlength: 2000 })
  description?: string; // Private — visible to project members only

  @Prop({
    type: [
      {
        _id: false,
        type: { type: String, enum: ['user', 'agent'], required: true },
        id: { type: String, required: true },
        role: { type: String, enum: ['project.lead', 'project.member'], required: true },
      },
    ],
    default: [],
  })
  members!: ProjectMember[];

  @Prop({ type: Date })
  startDate?: Date;

  @Prop({ type: Date })
  endDate?: Date;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({
    required: true,
    enum: ['draft', 'active', 'on_hold', 'completed', 'archived'],
    default: 'draft'
  })
  status!: string;

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
  // _id is automatically provided by MongoDB
}

export const ProjectSchema = SchemaFactory.createForClass(Project);

// Indexes for performance
ProjectSchema.index({ status: 1 });
ProjectSchema.index({ 'owner.userId': 1 });
ProjectSchema.index({ 'members.id': 1 });
ProjectSchema.index({ 'members.role': 1 });
ProjectSchema.index({ tags: 1 });
ProjectSchema.index({ createdAt: -1 });
ProjectSchema.index({ name: 'text', description: 'text', summary: 'text' }); // Full-text search
