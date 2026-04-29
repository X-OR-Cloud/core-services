import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type AccountDocument = Account & Document;

@Schema({ timestamps: true, collection: 'accounts' })
export class Account extends BaseSchema {
  @Prop({ type: Types.ObjectId, required: true }) nodeId: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) userId?: Types.ObjectId; // linked user if any
  @Prop({ required: true }) ext: string; // extension number
  @Prop({ required: true }) displayName: string;
  @Prop({ required: true, select: false }) password: string; // stored encrypted
  @Prop({ enum: ['sip', 'webrtc'], required: true }) protocol: string;
  @Prop({ enum: ['registered', 'unregistered', 'unknown'], default: 'unknown' }) status: string;
  @Prop({ enum: ['idle', 'ringing', 'in_call', 'unknown'], default: 'unknown' }) state: string;
  @Prop({ type: [String], default: ['ulaw', 'alaw'] }) codecs: string[];
  @Prop({ enum: ['pending', 'synced', 'error'], default: 'pending' }) syncStatus: string;
  @Prop() syncedAt?: Date;
}

export const AccountSchema = SchemaFactory.createForClass(Account);

// Unique constraint: org + ext (one extension per org)
AccountSchema.index({ orgId: 1, ext: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
