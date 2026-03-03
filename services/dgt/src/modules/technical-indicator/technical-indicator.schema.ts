import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Timeframe } from '../market-price/market-price.schema';

export type TechnicalIndicatorDocument = TechnicalIndicator & Document;

@Schema({ timestamps: true })
export class TechnicalIndicator {
  @Prop({ required: true })
  symbol: string;

  @Prop({ required: true, enum: Timeframe })
  timeframe: string;

  @Prop({ required: true, type: Date })
  timestamp: Date;

  @Prop()
  rsi14: number;

  @Prop()
  macdLine: number;

  @Prop()
  macdSignal: number;

  @Prop()
  macdHistogram: number;

  @Prop()
  ema9: number;

  @Prop()
  ema20: number;

  @Prop()
  ema50: number;

  @Prop()
  ema200: number;

  @Prop()
  sma20: number;

  @Prop()
  bbUpper: number;

  @Prop()
  bbMiddle: number;

  @Prop()
  bbLower: number;

  @Prop()
  atr14: number;

  @Prop()
  atr14Pct: number;

  @Prop()
  volumeRatio: number;

  @Prop()
  hv30d: number;
}

export const TechnicalIndicatorSchema = SchemaFactory.createForClass(TechnicalIndicator);

TechnicalIndicatorSchema.index({ symbol: 1, timeframe: 1, timestamp: -1 });
