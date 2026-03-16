import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ConnectionDocument = Connection & Document;

export type ConnectionProvider = 'discord' | 'telegram';
export type ConnectionStatus = 'active' | 'inactive' | 'error';
export type ConnectionLogLevel = 'info' | 'warn' | 'error';

export interface ConnectionLog {
  level: ConnectionLogLevel;
  message: string;
  time: Date;
  data?: Record<string, any>;
}

export interface ConnectionConfig {
  botToken: string;
  applicationId?: string;  // Discord: application/client ID
  webhookUrl?: string;     // Telegram: webhook mode public URL
  pollingMode?: boolean;   // Telegram: use long-polling (default: true)
}

export interface ConnectionRoute {
  guildId?: string;         // Discord server ID
  channelId?: string;       // Discord channel ID / Telegram chatId
  botId?: string;           // filter by specific bot ID
  requireMention?: boolean; // only reply when @mentioned (Discord)
  agentId: string;          // target agent
  allowAnonymous?: boolean; // allow users not in org (default: true)
}

@Schema({ timestamps: true })
export class Connection extends BaseSchema {
  @Prop({ required: true })
  name: string;

  @Prop({ required: false })
  description?: string;

  @Prop({
    required: true,
    enum: ['discord', 'telegram'],
    index: true,
  })
  provider: ConnectionProvider;

  @Prop({
    required: true,
    enum: ['active', 'inactive', 'error'],
    default: 'inactive',
  })
  status: ConnectionStatus;

  @Prop({ required: true, type: Object })
  config: ConnectionConfig;

  @Prop({ type: [Object], default: [] })
  routes: ConnectionRoute[];

  @Prop({
    type: [
      {
        level: { type: String, enum: ['info', 'warn', 'error'], required: true, default: 'info' },
        message: { type: String, required: true },
        time: { type: Date, required: true },
        data: { type: Object },
      },
    ],
    default: [],
    select: false,
  })
  logs: ConnectionLog[];

  // owner.orgId, owner.userId from BaseSchema
}

export const ConnectionSchema = SchemaFactory.createForClass(Connection);

ConnectionSchema.index({ 'owner.orgId': 1, status: 1 });
ConnectionSchema.index({ provider: 1, status: 1 });
