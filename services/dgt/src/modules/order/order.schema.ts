import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type OrderDocument = Order & Document;

export enum OrderSide {
  BUY = 'buy',
  SELL = 'sell',
}

export enum OrderType {
  MARKET = 'market',
  LIMIT = 'limit',
  STOP_LIMIT = 'stop_limit',
}

export enum OrderStatus {
  PENDING = 'pending',
  FILLED = 'filled',
  CANCELLED = 'cancelled',
  REJECTED = 'rejected',
}

export enum OrderSource {
  MANUAL = 'manual',
  PAPER = 'paper',
  SYSTEM = 'system',
  BOT = 'bot',
}

@Schema({ timestamps: true })
export class Order extends BaseSchema {
  @Prop({ type: Types.ObjectId, ref: 'Account', required: true })
  accountId: Types.ObjectId;

  @Prop({ required: true })
  symbol: string;

  @Prop({ required: true, enum: OrderSide })
  side: string;

  @Prop({ required: true, enum: OrderType })
  orderType: string;

  @Prop({ required: true })
  quantity: number;

  @Prop()
  price: number;

  @Prop()
  stopLossPrice: number;

  @Prop()
  takeProfitPrice: number;

  @Prop({ required: true, enum: OrderStatus, default: OrderStatus.PENDING })
  status: string;

  @Prop({ default: 0 })
  filledQuantity: number;

  @Prop()
  averageFilledPrice: number;

  @Prop({ required: true, default: 'paper' })
  exchange: string;

  @Prop({ required: true, enum: OrderSource, default: OrderSource.PAPER })
  source: string;

  @Prop({ type: Date })
  filledAt: Date;

  @Prop({ type: Date })
  cancelledAt: Date;

  @Prop()
  rejectionReason: string;

  @Prop({ type: Types.ObjectId, ref: 'Bot' })
  botId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Signal' })
  signalId: Types.ObjectId;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ accountId: 1, status: 1, createdAt: -1 });
