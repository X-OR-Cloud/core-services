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

  @Prop()
  entry: number;

  @Prop()
  takeProfit: number;

  @Prop()
  stopLoss: number;

  @Prop({ type: [String], default: [] })
  macroFactors: string[];

  @Prop({ type: Object })
  llmInput: Record<string, any>;

  @Prop({ type: Object })
  llmRawResponse: Record<string, any>;

  /**
   * Snapshot các giá trị dữ liệu thực tế đã được đưa vào LLM để generate signal.
   * Lưu để audit/traceability — biết chính xác tín hiệu kỹ thuật, macro, sentiment
   * tại thời điểm signal được tạo.
   */
  @Prop({ type: Object })
  dataSnapshot: {
    /** Giá trị TechnicalIndicator tại thời điểm generate */
    indicator?: {
      timestamp?: Date;
      rsi14?: number;
      macdLine?: number;
      macdSignal?: number;
      macdHistogram?: number;
      ema9?: number;
      ema20?: number;
      ema50?: number;
      ema200?: number;
      sma20?: number;
      bbUpper?: number;
      bbMiddle?: number;
      bbLower?: number;
      atr14?: number;
      atr14Pct?: number;
      volumeRatio?: number;
      hv30d?: number;
    };
    /** MacroIndicator values tại thời điểm generate (mỗi series 1 record) */
    macro?: Array<{
      seriesId: string;
      name?: string;
      value: number;
      unit?: string;
      timestamp?: Date;
    }>;
    /** SentimentSignal values tại thời điểm generate */
    sentiment?: {
      source?: string;
      timestamp?: Date;
      newsSentimentMean?: number;
      geopoliticalRiskScore?: number;
      eventImpactLevel?: string;
      etfFlow7dOz?: number;
      etfAumUsd?: number;
      fundingRateAnnualized?: number;
      longShortRatio?: number;
      openInterestUsd?: number;
      /** Các sự kiện thị trường nổi bật từ ByteTree analysis */
      keyEvents?: string[];
      /** Tóm tắt phân tích sentiment từ ByteTree */
      analysisSummary?: string;
    };
    /** News articles gần nhất đã được đưa vào LLM prompt */
    newsArticles?: Array<{
      title: string;
      sourceName?: string;
      publishedAt?: Date;
      description?: string;
      sentiment?: number;
      sentimentLabel?: string;
      sentimentReason?: string;
    }>;
    /** Context về market price candles đã dùng */
    marketContext?: {
      source: string;
      candleCount: number;
      fromTimestamp?: Date;
      toTimestamp?: Date;
      openPrice?: number;
      highPrice?: number;
      lowPrice?: number;
      closePrice?: number;
    };
  };

  /**
   * Thời điểm bot đã pick up signal này để execute trade.
   * Dùng làm atomic idempotency guard: chỉ set 1 lần, không reset.
   */
  @Prop({ type: Date })
  botExecutedAt: Date;

  /** Bot đã thực hiện execute signal này */
  @Prop({ type: Types.ObjectId, ref: 'Bot' })
  executedByBotId: Types.ObjectId;
}

export const SignalSchema = SchemaFactory.createForClass(Signal);

// Virtual fields for FE compatibility (spec uses `symbol` and `action`)
SignalSchema.virtual('symbol').get(function () {
  return this.asset;
});
SignalSchema.virtual('action').get(function () {
  return this.signalType;
});
SignalSchema.set('toJSON', { virtuals: true });
SignalSchema.set('toObject', { virtuals: true });

SignalSchema.index({ accountId: 1, asset: 1, timeframe: 1, status: 1 });
SignalSchema.index({ accountId: 1, createdAt: -1 });
SignalSchema.index({ status: 1, expiresAt: 1 });
// BotExecutionWorker dùng index này để query signal chưa bị execute bởi bot
SignalSchema.index({ status: 1, botExecutedAt: 1 });
