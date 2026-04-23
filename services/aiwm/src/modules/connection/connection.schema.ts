import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ConnectionDocument = Connection & Document;

export type ConnectionProvider = 'discord' | 'telegram' | 'teams' | 'zalo-bot';
export type ConnectionStatus = 'active' | 'inactive' | 'error';
export type ConnectionLogLevel = 'info' | 'warn' | 'error';
export type ConversationMode = 'user' | 'connection' | 'shared';

export interface ConnectionLog {
  level: ConnectionLogLevel;
  message: string;
  time: Date;
  data?: Record<string, any>;
}

export interface ConnectionConfig {
  botToken?: string;            // Discord / Telegram
  appId?: string;               // Discord: application/client ID | Teams: Microsoft App ID
  appPassword?: string;         // Teams: Azure AD client secret
  appToken?: string;            // Teams: cached OAuth bearer token (runtime)
  appTokenExpiresAt?: Date;     // Teams: token expiry
  tenantId?: string;            // Teams: Azure AD tenant ID
  webhookUrl?: string;          // Telegram: webhook mode public URL
  pollingMode?: boolean;        // Telegram / Zalo Bot: use long-polling (default: true); set false to use webhook mode
  zaloSecretToken?: string;     // Zalo Bot: secret token to validate X-Bot-Api-Secret-Token header
}

export interface ConnectionRoute {
  serverId?: string;        // Discord: guild ID | Telegram: chat.id (group) | Teams: teamId
  channelId?: string;       // Discord: channel ID | Telegram: message_thread_id (topic) | Teams: channelId
  botId?: string;           // filter by specific bot ID
  tenantId?: string;        // Teams: Azure tenant ID
  requireMention?: boolean; // only reply when @mentioned (Discord / Teams)
  agentId: string;          // target agent
  allowAnonymous?: boolean; // allow users not in org (default: true)
  verboseActions?: string[]; // action types to forward to main channel: undefined/[] = message only, ['*'] = all, ['thinking','tool_use','notice'] = selective
  verboseLogsChannelId?: string; // if set, ALL actions are forwarded to this channel regardless of verboseActions
  /** @deprecated Use Agent.conversationMode instead. Ignored by RoutingService. Will be removed in a future version. */
  conversationMode?: ConversationMode;
}

@Schema({ timestamps: true })
export class Connection extends BaseSchema {
  @Prop({ required: true })
  name: string;

  @Prop({ required: false })
  description?: string;

  @Prop({
    required: true,
    enum: ['discord', 'telegram', 'teams', 'zalo-bot'],
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
