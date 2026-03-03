import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SentimentSignalDocument = SentimentSignal & Document;

export enum SentimentSource {
  NEWSAPI = 'newsapi',
  BYTETREE = 'bytetree',
  BINANCE_FUTURES = 'binance_futures',
  LLM_ANALYSIS = 'llm_analysis',
}

export enum EventImpactLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

@Schema({ timestamps: true })
export class SentimentSignal {
  @Prop({ required: true, type: Date })
  timestamp: Date;

  @Prop({ required: true, enum: SentimentSource })
  source: string;

  @Prop()
  newsSentimentMean: number;

  @Prop()
  geopoliticalRiskScore: number;

  @Prop({ enum: EventImpactLevel })
  eventImpactLevel: string;

  @Prop()
  etfFlow7dOz: number;

  @Prop()
  etfAumUsd: number;

  @Prop()
  fundingRateAnnualized: number;

  @Prop()
  longShortRatio: number;

  @Prop()
  openInterestUsd: number;

  @Prop({ type: [String] })
  keyEvents: string[];

  @Prop()
  analysisSummary: string;
}

export const SentimentSignalSchema = SchemaFactory.createForClass(SentimentSignal);

SentimentSignalSchema.index({ source: 1, timestamp: -1 });
