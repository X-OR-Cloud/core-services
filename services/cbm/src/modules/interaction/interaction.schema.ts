import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type InteractionDocument = Interaction & MongooseDocument;

/**
 * Interaction - A single interaction event with a Contact or Company
 * Append-only timeline — records calls, emails, meetings, notes
 * Uses MongoDB _id as the primary identifier
 */
@Schema({ timestamps: true })
export class Interaction extends BaseSchema {
  @Prop({ required: true })
  contactId!: string; // ref: Contact (required)

  @Prop({ type: String })
  companyId?: string; // ref: Company (optional)

  @Prop({
    required: true,
    enum: ['call', 'email', 'meeting', 'note', 'other'],
  })
  type!: string;

  @Prop({ required: true, type: Date })
  date!: Date; // when the interaction happened

  @Prop({ required: true, maxlength: 5000 })
  summary!: string; // what was discussed / content of the note

  @Prop({ maxlength: 2000 })
  outcome?: string; // result or next action

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ maxlength: 2000 })
  notes?: string;

  // createdBy inherited from BaseSchema
  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
}

export const InteractionSchema = SchemaFactory.createForClass(Interaction);

// Indexes for performance
InteractionSchema.index({ contactId: 1, date: -1 });
InteractionSchema.index({ companyId: 1, date: -1 });
InteractionSchema.index({ type: 1 });
InteractionSchema.index({ date: -1 });
InteractionSchema.index({ tags: 1 });
InteractionSchema.index({ 'owner.orgId': 1 });
InteractionSchema.index({ createdAt: -1 });
