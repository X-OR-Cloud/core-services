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

  @Prop({ type: Object, default: {} })
  platformMessage: {
    id: string;
    type: string;
    raw: object;
  };

  // LLM info (role=assistant only)
  @Prop({ type: Object, default: null })
  llm?: {
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
  };

  @Prop({ type: [Object], default: [] })
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