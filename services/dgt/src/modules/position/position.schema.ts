import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type PositionDocument = Position & Document;

export enum PositionSide {
  LONG = 'long',
  SHORT = 'short',
}

export enum PositionStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

export enum CloseReason {
  MANUAL = 'manual',
  STOP_LOSS = 'stop_loss',
  TAKE_PROFIT = 'take_profit',
}

@Schema({ timestamps: true })
export class Position extends BaseSchema {
  @Prop({ type: Types.ObjectId, ref: 'Account', required: true })
  accountId: Types.ObjectId;

  @Prop({ required: true })
  symbol: string;

  @Prop({ required: true, enum: PositionSide })
  side: string;

  @Prop({ required: true })
  entryPrice: number;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true })
  notionalUsd: number;

  @Prop()
  currentPrice: number;

  @Prop({ default: 0 })
  unrealizedPnl: number;

  @Prop({ default: 0 })
  unrealizedPnlPct: number;

  @Prop()
  stopLossPrice: number;

  @Prop()
  takeProfitPrice: number;

  @Prop({ required: true, default: 1 })
  leverage: number;

  @Prop({ required: true, enum: PositionStatus, default: PositionStatus.OPEN })
  status: string;

  @Prop({ required: true, type: Date })
  openedAt: Date;

  @Prop({ type: Date })
  closedAt: Date;

  @Prop()
  exitPrice: number;

  @Prop()
  realizedPnl: number;

  @Prop({ enum: CloseReason })
  closeReason: string;
}

export const PositionSchema = SchemaFactory.createForClass(Position);

PositionSchema.index({ accountId: 1, status: 1 });
PositionSchema.index({ accountId: 1, closedAt: -1 });
