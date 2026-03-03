import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type RiskProfileDocument = RiskProfile & Document;

export enum PresetTemplate {
  CONSERVATIVE = 'conservative',
  MODERATE = 'moderate',
  AGGRESSIVE = 'aggressive',
  CUSTOM = 'custom',
}

export enum RiskAppetite {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  AGGRESSIVE = 'aggressive',
}

export enum TimeHorizon {
  SCALP = 'scalp',
  INTRADAY = 'intraday',
  SWING = 'swing',
  POSITION = 'position',
}

@Schema({ timestamps: true })
export class RiskProfile extends BaseSchema {
  @Prop({ type: Types.ObjectId, ref: 'Account', required: true })
  accountId: Types.ObjectId;

  @Prop({ required: true, enum: PresetTemplate, default: PresetTemplate.MODERATE })
  presetTemplate: string;

  @Prop({ required: true, enum: RiskAppetite, default: RiskAppetite.MEDIUM })
  riskAppetite: string;

  @Prop({ required: true, enum: TimeHorizon, default: TimeHorizon.SWING })
  timeHorizon: string;

  @Prop({ required: true, default: 15 })
  maxPositionSizePct: number;

  @Prop({ required: true, default: 3 })
  maxConcurrentPositions: number;

  @Prop({ required: true, default: 2.5 })
  stopLossPct: number;

  @Prop({ required: true, default: 5 })
  takeProfitPct: number;

  @Prop({ required: true, default: 5 })
  maxDailyLossPct: number;

  @Prop({ required: true, default: 1.5 })
  riskPerTradePct: number;

  @Prop({ required: true, default: 2 })
  minRiskRewardRatio: number;

  @Prop({ required: true, default: 1 })
  leverage: number;

  @Prop({ required: true, default: 60 })
  minConfidenceScore: number;
}

export const RiskProfileSchema = SchemaFactory.createForClass(RiskProfile);

RiskProfileSchema.index({ accountId: 1 }, { unique: true });
