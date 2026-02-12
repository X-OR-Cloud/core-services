import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ChannelDocument = Channel & Document;

@Schema({ timestamps: true })
export class Channel extends BaseSchema {
  @Prop({ required: true, type: String })
  name: string; // "TranGPT Zalo OA"

  @Prop({ 
    required: true, 
    type: String,
    enum: ['zalo_oa', 'telegram', 'facebook', 'discord', 'whatsapp']
  })
  platform: string; // 'zalo_oa' | 'telegram' | 'facebook' | ...

  @Prop({ 
    required: true, 
    type: String,
    enum: ['active', 'inactive', 'error'],
    default: 'inactive'
  })
  status: string; // 'active' | 'inactive' | 'error'

  // Platform credentials (encrypted)
  @Prop({
    type: {
      appId: { type: String, required: false },
      appSecret: { type: String, required: false },
      oaId: { type: String, required: false },
      accessToken: { type: String, required: false },
      refreshToken: { type: String, required: false },
      tokenExpiresAt: { type: Date, required: false },
    },
    default: {},
  })
  credentials: {
    appId?: string;
    appSecret?: string;
    oaId?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
  };

  // Webhook config
  @Prop({
    type: {
      verifyToken: { type: String, required: false },
      secret: { type: String, required: false },
      url: { type: String, required: false }, // auto-generated
    },
    default: {},
  })
  webhook: {
    verifyToken?: string;
    secret?: string;
    url?: string; // auto-generated
  };

  @Prop({ type: String, required: false })
  defaultBotId?: string; // ref → souls
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);

// Indexes
ChannelSchema.index({ platform: 1, 'owner.orgId': 1 });
ChannelSchema.index({ status: 1 });
ChannelSchema.index({ 'credentials.oaId': 1 });