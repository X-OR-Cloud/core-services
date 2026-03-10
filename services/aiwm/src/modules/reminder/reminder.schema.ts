import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ReminderDocument = Reminder & Document;

export type ReminderStatus = 'pending' | 'done';

@Schema({ timestamps: true })
export class Reminder extends BaseSchema {
  @Prop({ required: true, type: String, ref: 'Agent' })
  agentId: string;

  @Prop({ required: true })
  content: string;

  @Prop({ enum: ['pending', 'done'], default: 'pending' })
  status: ReminderStatus;

  @Prop({ type: Date, default: null })
  triggerAt?: Date;

  @Prop({ type: Date })
  doneAt?: Date;

  // BaseSchema provides: owner, createdBy, updatedBy, isDeleted, metadata, timestamps
}

export const ReminderSchema = SchemaFactory.createForClass(Reminder);

ReminderSchema.index({ agentId: 1, status: 1 });
ReminderSchema.index({ agentId: 1, triggerAt: 1 });
ReminderSchema.index({ status: 1, triggerAt: 1 });
