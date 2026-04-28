import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type NodeDocument = AsteriskNode & Document;

class AmiConfig {
  @Prop({ default: 5038 }) port: number;
  @Prop({ required: true }) username: string;
  @Prop({ required: true, select: false }) secret: string; // stored encrypted
}

class WssConfig {
  @Prop({ required: true }) hostname: string;
  @Prop({ default: 8089 }) port: number;
  @Prop({ default: '/ws' }) path: string;
}

@Schema({ timestamps: true, collection: 'nodes' })
export class AsteriskNode extends BaseSchema {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) hostname: string;
  @Prop({ type: AmiConfig, required: true }) ami: AmiConfig;
  @Prop({ type: WssConfig }) wss?: WssConfig;
  @Prop({ enum: ['online', 'offline', 'error'], default: 'offline' }) status: string;
}

export const AsteriskNodeSchema = SchemaFactory.createForClass(AsteriskNode);
