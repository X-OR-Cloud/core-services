import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { ActionType, ActorRole, ActionStatus } from './action.enum';

export type ActionDocument = Action & Document;

export interface Actor {
  role: ActorRole;
  userId?: string;          // AIWM IAM user ID (if known)
  agentId?: string;         // AIWM agent ID
  displayName: string;      // always present
  externalProvider?: string; // 'discord' | 'telegram'
  externalId?: string;       // Discord userId / Telegram chatId
  externalUsername?: string;
}

export interface ActionAttachment {
  type: 'file' | 'image' | 'video' | 'audio' | 'document';
  url: string;
  filename?: string;
  size?: number;
  mimeType?: string;
}

export interface ActionMetadata {
  // tool_use
  toolName?: string;
  toolInput?: any;
  toolUseId?: string;         // link tool_use ↔ tool_result

  // tool_result
  toolResult?: any;           // raw result from agent SDK
  toolResultId?: string;      // ref to tool_use action

  // thinking
  thinkingContent?: string;   // thinking block content (hidden from user)

  // attachments
  attachments?: ActionAttachment[];

  // inbound from external provider (Discord/Telegram)
  raw?: any;                  // raw platform event object
}

export interface ActionUsage {
  inputTokens: number;
  outputTokens: number;
  duration: number;
}

@Schema({ timestamps: true })
export class Action extends BaseSchema {
  @Prop({ required: true, type: String, ref: 'Conversation', index: true })
  conversationId: string;

  @Prop({ required: false, type: String, ref: 'Connection', index: true })
  connectionId?: string;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(ActionType),
    index: true,
  })
  type: ActionType;

  @Prop({ required: true, type: Object })
  actor: Actor;

  @Prop({ required: true, type: String })
  content: string;

  @Prop({ required: false, type: Object })
  metadata?: ActionMetadata;

  @Prop({ required: false, type: Object })
  usage?: ActionUsage;

  @Prop({
    required: false,
    type: String,
    enum: Object.values(ActionStatus),
    default: ActionStatus.COMPLETED,
  })
  status?: ActionStatus;

  @Prop({ required: false, type: String, ref: 'Action' })
  parentId?: string;
}

export const ActionSchema = SchemaFactory.createForClass(Action);

ActionSchema.index({ conversationId: 1, createdAt: 1 });
ActionSchema.index({ conversationId: 1, 'actor.role': 1 });
ActionSchema.index({ conversationId: 1, type: 1 });
ActionSchema.index({ connectionId: 1, createdAt: -1 });
ActionSchema.index({ 'actor.externalId': 1, 'actor.externalProvider': 1 });
ActionSchema.index({ parentId: 1 });
