import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type SoulDocument = Soul & Document;

@Schema({ timestamps: true })
export class Soul extends BaseSchema {
  @Prop({ required: true, type: String })
  name: string; // "TranGPT"

  @Prop({ required: true, type: String, unique: true })
  slug: string; // "transgpt"

  @Prop({ 
    required: true, 
    type: String,
    enum: ['active', 'paused', 'disabled'],
    default: 'active'
  })
  status: string; // 'active' | 'paused' | 'disabled'

  @Prop({ type: [String], default: [] })
  channelIds: string[]; // channels soul serves

  // LLM Config
  @Prop({ type: Object, required: true })
  llm: {
    provider: string;
    model: string;
    temperature: number;
    maxTokens: number;
    apiKeyRef?: string;
  };

  // Persona & Prompt
  @Prop({ type: Object, required: true })
  persona: {
    systemPrompt: string;
    greeting?: string;
    tone: string;
    pronouns: {
      self: string;
      user: string;
    };
  };

  // Memory strategy
  @Prop({ type: Object, default: { enabled: true, maxHistoryMessages: 50, summaryAfter: 100, autoExtract: true } })
  memory: {
    enabled: boolean;
    maxHistoryMessages: number;
    summaryAfter: number;
    autoExtract: boolean;
  };

  // Tools soul có thể dùng
  @Prop({ type: [Object], default: [] })
  tools: Array<{
    name: string;
    enabled: boolean;
    config?: object;
  }>;

  // Queue config
  @Prop({ type: Object, default: { concurrency: 3, timeoutMs: 30000 } })
  queue: {
    name?: string;
    concurrency: number;
    timeoutMs: number;
  };
}

export const SoulSchema = SchemaFactory.createForClass(Soul);

// Indexes
SoulSchema.index({ slug: 1 }, { unique: true });
SoulSchema.index({ status: 1 });
SoulSchema.index({ channelIds: 1 });
SoulSchema.index({ 'owner.orgId': 1 });