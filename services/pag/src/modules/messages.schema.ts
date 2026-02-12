import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message extends BaseSchema {
  @Prop({ required: true, type: String })
  conversationId: string;

  @Prop({ 
    required: true, 
    type: String,
    enum: ['user', 'assistant', 'system']
  })
  role: string; // 'user' | 'assistant' | 'system'

  @Prop({ required: true, type: String })
  content: string;

  @Prop({
    type: {
      id: { type: String, required: true }, // Zalo message ID
      type: { type: String, required: true }, // 'text' | 'image' | 'file' | 'sticker' | 'location'
      raw: { type: Object, required: true }, // raw payload từ platform — giữ nguyên
    },
    required: true,
  })
  platformMessage: {
    id: string; // Zalo message ID
    type: string; // 'text' | 'image' | 'file' | 'sticker' | 'location'
    raw: object; // raw payload từ platform — giữ nguyên
  };

  // LLM info (role=assistant only)
  @Prop({
    type: {
      provider: { type: String, required: false }, // 'gemini' | 'openai' | 'anthropic'
      model: { type: String, required: false }, // 'gemini-2.0-flash'
      promptTokens: { type: Number, required: false },
      completionTokens: { type: Number, required: false },
      latencyMs: { type: Number, required: false },
    },
    required: false,
  })
  llm?: {
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
  };

  @Prop({
    type: [{
      tool: { type: String, required: true },
      input: { type: Object, required: true },
      output: { type: Object, required: true },
    }],
    required: false,
  })
  toolCalls?: Array<{
    tool: string;
    input: object;
    output: object;
  }>;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Indexes
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ role: 1 });
MessageSchema.index({ 'platformMessage.id': 1 });
MessageSchema.index({ 'owner.orgId': 1 });