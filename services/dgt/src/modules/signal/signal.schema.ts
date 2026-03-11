import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type SignalDocument = Signal & Document;

export enum SignalTimeframe {
  H1 = '1h',
  H4 = '4h',
}

export enum SignalType {
  BUY = 'BUY',
  SELL = 'SELL',
  HOLD = 'HOLD',
}

export enum ConfidenceLabel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  VERY_HIGH = 'very_high',
}

export enum SignalStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  SUPERSEDED = 'SUPERSEDED',
  EXECUTED = 'EXECUTED',
  IGNORED = 'IGNORED',
}

@Schema({ timestamps: true })
export class Signal extends BaseSchema {
  @Prop({ type: Types.ObjectId, ref: 'Account', required: true })
  accountId: Types.ObjectId;

  @Prop({ required: true })
  asset: string;

  @Prop({ required: true, enum: SignalTimeframe })
  timeframe: string;

  @Prop({ required: true, enum: SignalType })
  signalType: string;

  @Prop({ required: true })
  confidence: number;

  @Prop({ required: true, enum: ConfidenceLabel })
  confidenceLabel: string;

  @Prop({ required: true })
  insight: string;

  @Prop({ type: [String], default: [] })
  indicatorsUsed: string[];

  @Prop({ type: [{ factor: String, weight: String }] })
  keyFactors: { factor: string; weight: string }[];

  @Prop()
  llmModel: string;

  @Prop({ required: true, enum: SignalStatus, default: SignalStatus.ACTIVE })
  status: string;

  @Prop({ required: true, type: Date })
  expiresAt: Date;

  @Prop({ type: Date })
  executedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'Signal' })
  supersededBy: Types.ObjectId;

  @Prop()
  priceAtCreation: number;

  @Prop({ type: Object })
  llmInput: Record<string, any>;

  @Prop({ type: Object })
  llmRawResponse: Record<string, any>;
}

export const SignalSchema = SchemaFactory.createForClass(Signal);

SignalSchema.index({ accountId: 1, asset: 1, timeframe: 1, status: 1 });
SignalSchema.index({ accountId: 1, createdAt: -1 });
SignalSchema.index({ status: 1, expiresAt: 1 });
