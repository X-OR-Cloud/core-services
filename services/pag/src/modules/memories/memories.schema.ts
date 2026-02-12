import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type MemoryDocument = Memory & Document;

@Schema({ timestamps: true })
export class Memory extends BaseSchema {
  @Prop({ required: true, type: String })
  conversationId: string;

  @Prop({ required: true, type: String })
  soulId: string;

  @Prop({ required: true, type: String })
  platformUserId: string; // index nhanh across conversations

  @Prop({ 
    required: true, 
    type: String,
    enum: ['fact', 'preference', 'schedule', 'note']
  })
  type: string; // 'fact' | 'preference' | 'schedule' | 'note'

  @Prop({ required: true, type: String })
  key: string; // "name" | "favorite_food" | "work_hours"

  @Prop({ required: true, type: String })
  value: string;

  @Prop({ 
    required: true, 
    type: String,
    enum: ['extracted', 'user_told', 'bot_inferred']
  })
  source: string; // 'extracted' | 'user_told' | 'bot_inferred'

  @Prop({ type: Number, min: 0, max: 1, default: 1.0 })
  confidence: number; // 0-1

  @Prop({ type: Date, required: false })
  expiresAt?: Date; // null = permanent
}

export const MemorySchema = SchemaFactory.createForClass(Memory);

// Indexes
MemorySchema.index({ platformUserId: 1, soulId: 1, type: 1 });
MemorySchema.index({ conversationId: 1 });
MemorySchema.index({ key: 1 });
MemorySchema.index({ expiresAt: 1 });
MemorySchema.index({ 'owner.orgId': 1 });