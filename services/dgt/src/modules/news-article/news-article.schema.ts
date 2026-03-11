import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NewsArticleDocument = NewsArticle & Document;

export enum ArticleSentimentLabel {
  BULLISH = 'bullish',
  BEARISH = 'bearish',
  NEUTRAL = 'neutral',
}

@Schema({ timestamps: true })
export class NewsArticle {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true, unique: true })
  url: string;

  @Prop({ required: true, type: Date })
  publishedAt: Date;

  @Prop()
  sourceName: string;

  @Prop()
  description: string;

  // LLM analysis fields — populated after analysis
  @Prop()
  sentiment: number; // -1.0 to +1.0

  @Prop({ enum: ArticleSentimentLabel })
  sentimentLabel: string; // bullish | bearish | neutral

  @Prop()
  sentimentReason: string; // LLM explanation

  @Prop({ type: Date })
  llmAnalyzedAt: Date;
}

export const NewsArticleSchema = SchemaFactory.createForClass(NewsArticle);

NewsArticleSchema.index({ url: 1 }, { unique: true });
NewsArticleSchema.index({ publishedAt: -1 });
NewsArticleSchema.index({ sentimentLabel: 1, publishedAt: -1 });
