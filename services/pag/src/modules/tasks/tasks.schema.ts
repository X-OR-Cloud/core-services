import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type TaskDocument = Task & Document;

@Schema({ timestamps: true })
export class Task extends BaseSchema {
  @Prop({ required: true, type: String })
  conversationId: string;

  @Prop({ required: true, type: String })
  soulId: string;

  @Prop({ required: true, type: String })
  platformUserId: string;

  @Prop({ required: true, type: String })
  channelId: string;

  @Prop({ required: true, type: String })
  title: string;

  @Prop({ type: String })
  description?: string;

  @Prop({
    required: true,
    type: String,
    enum: ['reminder', 'todo'],
    default: 'reminder',
  })
  type: string;

  @Prop({
    required: true,
    type: String,
    enum: ['pending', 'done', 'cancelled', 'overdue', 'snoozed'],
    default: 'pending',
  })
  status: string;

  @Prop({ type: Date, required: false })
  dueAt?: Date;

  @Prop({ type: Date, required: false })
  remindAt?: Date;

  @Prop({
    type: String,
    enum: ['user_request', 'auto_extraction'],
    default: 'user_request',
  })
  source: string;

  @Prop({ type: String })
  rawMessage?: string;

  @Prop({ type: Number, default: 0 })
  notifiedCount: number;

  @Prop({ type: Date })
  lastNotifiedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: String })
  bullJobId?: string; // Track the scheduled BullMQ job
}

export const TaskSchema = SchemaFactory.createForClass(Task);

// Indexes
TaskSchema.index({ conversationId: 1, status: 1 });
TaskSchema.index({ platformUserId: 1, soulId: 1 });
TaskSchema.index({ remindAt: 1, status: 1 }); // For catch-up queries
TaskSchema.index({ 'owner.orgId': 1 });
