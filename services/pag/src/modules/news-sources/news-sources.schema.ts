import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type NewsSourceDocument = NewsSource & Document;

@Schema({ timestamps: true })
export class NewsSource extends BaseSchema {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  url: string;

  @Prop({ required: true })
  domain: string;

  @Prop({ type: [String], default: [] })
  categories: string[];

  @Prop({ required: true, enum: ['vi', 'en'], default: 'vi' })
  language: string;

  @Prop({ default: true })
  active: boolean;

  @Prop({ type: Number, default: 60 })
  fetchIntervalMinutes: number;

  @Prop({ type: Date, default: null })
  lastFetchedAt: Date | null;
}

export const NewsSourceSchema = SchemaFactory.createForClass(NewsSource);

NewsSourceSchema.index({ url: 1 }, { unique: true });
NewsSourceSchema.index({ active: 1, language: 1 });
NewsSourceSchema.index({ domain: 1 });
