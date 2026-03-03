import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MarketPriceDocument = MarketPrice & Document;

export enum MarketPriceSource {
  GOLDAPI = 'goldapi',
  YAHOO = 'yahoo',
  BINANCE_SPOT = 'binance_spot',
  BINANCE_FUTURES = 'binance_futures',
  OKX = 'okx',
  BITFINEX = 'bitfinex',
  BYTETREE = 'bytetree',
}

export enum Timeframe {
  M1 = '1m',
  M5 = '5m',
  M15 = '15m',
  H1 = '1h',
  H4 = '4h',
  D1 = '1d',
  W1 = '1w',
}

@Schema({ timestamps: true })
export class MarketPrice {
  @Prop({ required: true })
  symbol: string;

  @Prop({ required: true, enum: MarketPriceSource })
  source: string;

  @Prop({ required: true, enum: Timeframe })
  timeframe: string;

  @Prop()
  open: number;

  @Prop()
  high: number;

  @Prop()
  low: number;

  @Prop({ required: true })
  close: number;

  @Prop({ default: 0 })
  volume: number;

  @Prop({ required: true, type: Date })
  timestamp: Date;

  @Prop({ type: Object })
  extra: Record<string, any>;
}

export const MarketPriceSchema = SchemaFactory.createForClass(MarketPrice);

MarketPriceSchema.index(
  { symbol: 1, source: 1, timeframe: 1, timestamp: -1 },
);
MarketPriceSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 365 * 24 * 60 * 60 }, // TTL 1 year
);
