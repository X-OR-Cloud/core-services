import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type BotDocument = Bot & Document;

export enum BotStatus {
  CREATED = 'CREATED',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR',
  DELETED = 'DELETED',
}

export enum TradingMode {
  SANDBOX = 'sandbox',
  LIVE = 'live',
}

export enum BotTimeframe {
  H1 = '1h',
  H4 = '4h',
}

@Schema({ timestamps: true })
export class Bot extends BaseSchema {
  @Prop({ type: Types.ObjectId, ref: 'Account', required: true })
  accountId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: BotStatus, default: BotStatus.CREATED })
  status: BotStatus;

  @Prop({ required: true, enum: TradingMode, default: TradingMode.SANDBOX })
  tradingMode: TradingMode;

  @Prop({ required: true, default: 'PAXGUSDT' })
  asset: string;

  @Prop({ required: true, enum: BotTimeframe, default: BotTimeframe.H1 })
  timeframe: BotTimeframe;

  @Prop({ required: true })
  totalCapital: number;

  @Prop({ required: true })
  maxEntrySize: number;

  @Prop({ required: true })
  stopLoss: number;

  @Prop({ required: true })
  takeProfit: number;

  @Prop({ required: true })
  maxDrawdownLimit: number;

  @Prop({ required: true })
  dailyStopLossUSD: number;

  @Prop({ required: true, default: 70 })
  minConfidenceScore: number;

  @Prop()
  errorMessage: string;

  @Prop({ type: Date })
  lastActiveAt: Date;

  @Prop({
    type: { date: String, lossUsd: Number },
    default: { date: '', lossUsd: 0 },
  })
  dailyLossTracking: { date: string; lossUsd: number };

  @Prop({
    type: {
      totalPnl: Number,
      winRate: Number,
      totalTrades: Number,
      currentDrawdownPct: Number,
    },
    default: { totalPnl: 0, winRate: 0, totalTrades: 0, currentDrawdownPct: 0 },
  })
  stats: {
    totalPnl: number;
    winRate: number;
    totalTrades: number;
    currentDrawdownPct: number;
  };
}

export const BotSchema = SchemaFactory.createForClass(Bot);

BotSchema.index({ 'owner.userId': 1, status: 1 });
BotSchema.index({ accountId: 1 }, { unique: true });
BotSchema.index({ name: 1, 'owner.userId': 1 }, { unique: true });
