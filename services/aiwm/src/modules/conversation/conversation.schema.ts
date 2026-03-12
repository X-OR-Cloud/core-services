import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { Agent } from '../agent/agent.schema';

export type ConversationDocument = Conversation & Document;

@Schema({ timestamps: true })
export class Conversation extends BaseSchema {
  // Conversation title (auto-generated from first message or user-set)
  @Prop({ required: true })
  title: string;

  // Brief description
  @Prop({ default: '' })
  description: string;

  // Primary agent handling this conversation
  @Prop({ required: true, type: String, ref: 'Agent', index: true })
  agentId: string;

  // Conversation type: 'chat', 'support', 'workflow'
  @Prop({ required: true, default: 'chat' })
  conversationType: string;

  // Status: 'active', 'archived', 'closed'
  @Prop({ required: true, default: 'active', index: true })
  status: string;

  // Total tokens consumed
  @Prop({ default: 0 })
  totalTokens: number;

  // Total messages count
  @Prop({ default: 0 })
  totalMessages: number;

  // Total cost (in USD)
  @Prop({ default: 0 })
  totalCost: number;

  // Participants in conversation
  @Prop({
    type: [
      {
        type: { type: String, enum: ['user', 'agent'], required: true },
        id: { type: String, required: true },
        joined: { type: Date, required: true, default: Date.now },
      },
    ],
    default: [],
  })
  participants: Array<{
    type: 'user' | 'agent';
    id: string;
    joined: Date;
  }>;

  // Last message preview (for conversation list UI)
  @Prop({ type: Object, required: false })
  lastMessage?: {
    content: string;
    role: string;
    createdAt: Date;
  };

  // User identity (authenticated userId or anonymousId)
  @Prop({ type: String, default: '', index: true })
  userId: string;

  // User type for analytics and future cleanup
  @Prop({ type: String, enum: ['authenticated', 'anonymous'], default: 'authenticated' })
  userType: 'authenticated' | 'anonymous';

  // Tags for categorization
  @Prop({ type: [String], default: [] })
  tags: string[];

  // Context summary (auto-generated every 10 messages)
  @Prop({ type: String, required: false })
  contextSummary?: string;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Indexes for performance
ConversationSchema.index({ agentId: 1, status: 1, createdAt: -1 });
ConversationSchema.index({ 'participants.id': 1, status: 1 });
ConversationSchema.index({ createdBy: 1, status: 1, createdAt: -1 });
ConversationSchema.index({ agentId: 1, userId: 1, status: 1 }); // findOrCreate per (userId, agentId)