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
  @Prop({
    type: {
      provider: { type: String, required: true, enum: ['gemini', 'openai', 'anthropic'] },
      model: { type: String, required: true }, // 'gemini-2.0-flash'
      temperature: { type: Number, default: 0.7 },
      maxTokens: { type: Number, default: 2048 },
      apiKeyRef: { type: String, required: false }, // ref to secret store or env var
    },
    required: true,
  })
  llm: {
    provider: string; // 'gemini' | 'openai' | 'anthropic'
    model: string; // 'gemini-2.0-flash'
    temperature: number; // 0.7
    maxTokens: number; // 2048
    apiKeyRef?: string; // ref to secret store or env var
  };

  // Persona & Prompt
  @Prop({
    type: {
      systemPrompt: { type: String, required: true }, // "Bạn là TranGPT..."
      greeting: { type: String, required: false }, // Tin nhắn chào khi user follow
      tone: { type: String, enum: ['friendly', 'professional', 'casual'], default: 'friendly' },
      pronouns: {
        type: {
          self: { type: String, default: 'em' }, // "em"
          user: { type: String, default: 'anh/chị' }, // "anh/chị"
        },
        default: {},
      },
    },
    required: true,
  })
  persona: {
    systemPrompt: string; // "Bạn là TranGPT..."
    greeting?: string; // Tin nhắn chào khi user follow
    tone: string; // 'friendly' | 'professional' | 'casual'
    pronouns: {
      self: string; // "em"
      user: string; // "anh/chị"
    };
  };

  // Memory strategy
  @Prop({
    type: {
      enabled: { type: Boolean, default: true },
      maxHistoryMessages: { type: Number, default: 50 }, // số message gần nhất load làm context
      summaryAfter: { type: Number, default: 100 }, // sau N messages thì tóm tắt
      autoExtract: { type: Boolean, default: true }, // tự extract facts từ chat
    },
    default: {},
  })
  memory: {
    enabled: boolean;
    maxHistoryMessages: number; // số message gần nhất load làm context
    summaryAfter: number; // sau N messages thì tóm tắt
    autoExtract: boolean; // tự extract facts từ chat
  };

  // Tools soul có thể dùng
  @Prop({
    type: [{
      name: { type: String, required: true }, // 'weather' | 'reminder' | 'memory_write' | 'search'
      enabled: { type: Boolean, default: true },
      config: { type: Object, default: {} },
    }],
    default: [],
  })
  tools: Array<{
    name: string; // 'weather' | 'reminder' | 'memory_write' | 'search'
    enabled: boolean;
    config?: object;
  }>;

  // Queue config
  @Prop({
    type: {
      name: { type: String, required: false }, // 'pag:soul:transgpt'
      concurrency: { type: Number, default: 3 }, // 3
      timeoutMs: { type: Number, default: 30000 }, // 30000
    },
    default: {},
  })
  queue: {
    name?: string; // 'pag:soul:transgpt'
    concurrency: number; // 3
    timeoutMs: number; // 30000
  };
}

export const SoulSchema = SchemaFactory.createForClass(Soul);

// Indexes
SoulSchema.index({ slug: 1 }, { unique: true });
SoulSchema.index({ status: 1 });
SoulSchema.index({ channelIds: 1 });
SoulSchema.index({ 'owner.orgId': 1 });