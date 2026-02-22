import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ExtensionDocument = Extension & Document;

@Schema({ timestamps: true, collection: 'extensions' })
export class Extension extends BaseSchema {
  @Prop({ required: true, type: String, unique: true })
  number: string; // "1001"

  @Prop({ required: true, type: String })
  name: string; // "AI Receptionist"

  @Prop({ type: String, enum: ['ai', 'sip'], default: 'ai' })
  type: string;

  @Prop({ type: Object, default: {} })
  ai: {
    provider?: string;        // "openai"
    model?: string;           // "gpt-4o-realtime-preview-2025-06-03"
    voice?: string;           // "shimmer"
    systemPrompt?: string;
    temperature?: number;
    maxCallDurationSec?: number;
    vad?: {
      threshold?: number;
      silenceDurationMs?: number;
      prefixPaddingMs?: number;
    };
  };

  @Prop({ type: [String], default: [] })
  allowedCallers: string[]; // ["84909*", "84912345678"]

  @Prop({ type: String, default: '' })
  initialMessage: string; // Message gửi cho AI khi bắt đầu cuộc gọi

  @Prop({ type: String, enum: ['active', 'inactive'], default: 'active' })
  status: string;
}

export const ExtensionSchema = SchemaFactory.createForClass(Extension);

ExtensionSchema.index({ number: 1 });
ExtensionSchema.index({ status: 1 });
