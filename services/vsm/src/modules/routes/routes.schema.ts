import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type RouteDocument = Route & Document;

@Schema({ timestamps: true, collection: 'routes' })
export class Route extends BaseSchema {
  @Prop({ required: true }) name: string;
  @Prop({ enum: ['inbound', 'outbound'], required: true }) direction: string;
  @Prop({ default: 0 }) priority: number; // lower = higher priority

  // Match criteria
  @Prop() matchNumber?: string;    // regex or exact DID for inbound, caller ID prefix for outbound
  @Prop({ type: Types.ObjectId }) fromAccountId?: Types.ObjectId; // outbound: originating account

  // Destination
  @Prop({ type: Types.ObjectId }) toAccountId?: Types.ObjectId;   // inbound: destination account
  @Prop({ type: Types.ObjectId }) toTrunkId?: Types.ObjectId;     // outbound: via trunk
  @Prop({ type: Types.ObjectId }) toDialplanId?: Types.ObjectId;  // forward to dialplan context
}

export const RouteSchema = SchemaFactory.createForClass(Route);

RouteSchema.index({ orgId: 1, direction: 1, priority: 1 });
