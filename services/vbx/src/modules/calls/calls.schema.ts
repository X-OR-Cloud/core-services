import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type CallDocument = Call & Document;

@Schema({ timestamps: true, collection: 'calls' })
export class Call extends BaseSchema {
  @Prop({ type: String })
  extensionId: string;

  @Prop({ type: String })
  callId: string; // Asterisk unique call ID / AudioSocket UUID

  @Prop({ required: true, type: String })
  callerNumber: string;

  @Prop({ type: String, default: '' })
  callerName: string;

  @Prop({ required: true, type: String })
  calledNumber: string; // "842471083656"

  @Prop({ type: String, enum: ['inbound', 'outbound'], default: 'inbound' })
  direction: string;

  @Prop({ type: Date })
  startedAt: Date;

  @Prop({ type: Date })
  answeredAt: Date;

  @Prop({ type: Date })
  endedAt: Date;

  @Prop({ type: Number, default: 0 })
  duration: number; // Total seconds

  @Prop({ type: Number, default: 0 })
  talkDuration: number; // After answer, seconds

  @Prop({ type: [Object], default: [] })
  transcript: { role: string; text: string; timestamp: Date }[];

  @Prop({ type: String, default: '' })
  recordingUrl: string;

  @Prop({ type: Number, default: 0 })
  recordingDuration: number;

  @Prop({
    type: String,
    enum: ['ringing', 'answered', 'missed', 'failed', 'busy', 'rejected'],
    default: 'ringing',
  })
  status: string;

  @Prop({ type: String, default: '' })
  summary: string;

  @Prop({ type: String, default: '' })
  llmProvider: string;

  @Prop({ type: String, default: '' })
  llmModel: string;

  @Prop({ type: Object, default: {} })
  data: Record<string, any>;
}

export const CallSchema = SchemaFactory.createForClass(Call);

CallSchema.index({ callerNumber: 1, startedAt: -1 });
CallSchema.index({ extensionId: 1, startedAt: -1 });
CallSchema.index({ startedAt: -1 });
CallSchema.index({ status: 1 });
CallSchema.index({ callId: 1 });
