import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { OrderSide } from '../order/order.schema';

export type TradeDocument = Trade & Document;

@Schema({ timestamps: true })
export class Trade extends BaseSchema {
  @Prop({ type: Types.ObjectId, ref: 'Account', required: true })
  accountId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  orderId: Types.ObjectId;

  @Prop({ required: true })
  symbol: string;

  @Prop({ required: true, enum: OrderSide })
  side: string;

  @Prop({ required: true })
  filledPrice: number;

  @Prop({ required: true })
  filledQuantity: number;

  @Prop({ required: true })
  notionalUsd: number;

  @Prop({ default: 0 })
  fees: number;

  @Prop({ required: true, type: Date })
  executedAt: Date;
}

export const TradeSchema = SchemaFactory.createForClass(Trade);

TradeSchema.index({ accountId: 1, executedAt: -1 });
