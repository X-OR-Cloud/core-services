import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NewsItemDocument = NewsItem & Document;

@Schema({ timestamps: true })
export class NewsItem {
  @Prop({ required: true, unique: true })
  urlHash: string;

  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  title: string;

  @Prop({ type: String, default: null })
  summary: string | null;

  @Prop({ required: true })
  sourceId: string;

  @Prop({ required: true })
  sourceName: string;

  @Prop({ type: [String], default: [] })
  categories: string[];

  @Prop({ required: true, enum: ['vi', 'en'], default: 'vi' })
  language: string;

  @Prop({ required: true })
  publishedAt: Date;

  @Prop({ type: Date, default: null })
  fetchedAt: Date | null;
}

export const NewsItemSchema = SchemaFactory.createForClass(NewsItem);

NewsItemSchema.index({ urlHash: 1 }, { unique: true });
NewsItemSchema.index({ sourceId: 1, publishedAt: -1 });
NewsItemSchema.index({ categories: 1, publishedAt: -1, language: 1 });
NewsItemSchema.index({ publishedAt: -1 });
// TTL: auto-delete after 7 days
NewsItemSchema.index({ publishedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
