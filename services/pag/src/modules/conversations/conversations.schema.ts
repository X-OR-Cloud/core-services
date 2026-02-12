import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ConversationDocument = Conversation & Document;

@Schema({ timestamps: true })
export class Conversation extends BaseSchema {
  @Prop({ required: true, type: String })
  channelId: string;

  @Prop({ required: true, type: String })
  soulId: string;

  @Prop({
    type: {
      id: { type: String, required: true }, // zalo_user_id
      username: { type: String, required: false }, // display name
      // extensible: avatar, phone, ...
      avatar: { type: String, required: false },
      phone: { type: String, required: false },
    },
    required: true,
  })
  platformUser: {
    id: string; // zalo_user_id
    username?: string; // display name
    avatar?: string;
    phone?: string;
    // extensible for future platform-specific fields
  };

  @Prop({ 
    required: true, 
    type: String,
    enum: ['active', 'idle', 'closed'],
    default: 'active'
  })
  status: string; // 'active' | 'idle' | 'closed'

  @Prop({ type: Date, default: Date.now })
  lastActiveAt: Date; // track 48h window

  @Prop({ type: Number, default: 0 })
  messageCount: number;

  // Context summary (tóm tắt cũ, tiết kiệm token)
  @Prop({ type: String, required: false })
  summary?: string;

  @Prop({ type: Date, required: false })
  summaryUpdatedAt?: Date;

  @Prop({ type: [String], default: [] })
  tags: string[];
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Indexes
ConversationSchema.index({ channelId: 1, 'platformUser.id': 1 }, { unique: true });
ConversationSchema.index({ soulId: 1 });
ConversationSchema.index({ status: 1 });
ConversationSchema.index({ lastActiveAt: 1 });
ConversationSchema.index({ 'owner.orgId': 1 });