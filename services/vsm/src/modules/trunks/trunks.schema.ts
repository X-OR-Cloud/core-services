import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type TrunkDocument = Trunk & Document;

@Schema({ timestamps: true, collection: 'trunks' })
export class Trunk extends BaseSchema {
  @Prop({ type: Types.ObjectId, required: true }) nodeId: Types.ObjectId;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) host: string; // SIP provider host/IP
  @Prop({ default: 5060 }) port: number;
  @Prop({ required: true }) username: string;
  @Prop({ required: true, select: false }) password: string; // stored encrypted
  @Prop({ type: [String], default: ['ulaw', 'alaw'] }) codecs: string[];
  @Prop({ enum: ['registered', 'unregistered', 'unknown'], default: 'unknown' }) status: string;
  @Prop({ enum: ['pending', 'synced', 'error'], default: 'pending' }) syncStatus: string;
  @Prop() syncedAt?: Date;
}

export const TrunkSchema = SchemaFactory.createForClass(Trunk);
