import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type CallDocument = Call & Document;

@Schema({ timestamps: true, collection: 'calls' })
export class Call extends BaseSchema {
  @Prop({ type: Types.ObjectId, required: true }) nodeId: Types.ObjectId;

  // Participants
  @Prop({ type: Types.ObjectId }) fromAccountId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) toAccountId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) trunkId?: Types.ObjectId;
  @Prop() fromNumber?: string;   // caller number
  @Prop() toNumber?: string;     // callee number

  // Call direction & mode
  @Prop({ enum: ['inbound', 'outbound'], required: true }) direction: string;
  @Prop({ enum: ['manual', 'click-to-call', 'auto'] }) mode?: string; // null for inbound

  // Status & result
  @Prop({
    enum: ['pending', 'queued', 'answered', 'not-answered', 'busy', 'canceled', 'terminated', 'failed'],
    default: 'pending',
  })
  result: string;

  // Timing
  @Prop() startedAt?: Date;
  @Prop() answeredAt?: Date;
  @Prop() endedAt?: Date;
  @Prop({ default: 0 }) duration: number;        // total seconds (ring + talk)
  @Prop({ default: 0 }) answeredDuration: number; // talk time seconds

  // Asterisk correlation
  @Prop() asteriskUniqueId?: string; // Asterisk UniqueID for event correlation

  // Recording
  @Prop() recordingFile?: string; // S3 key, e.g. recordings/2026/04/19/<id>.wav
}

export const CallSchema = SchemaFactory.createForClass(Call);

CallSchema.index({ orgId: 1, createdAt: -1 });
CallSchema.index({ asteriskUniqueId: 1 }, { sparse: true });
