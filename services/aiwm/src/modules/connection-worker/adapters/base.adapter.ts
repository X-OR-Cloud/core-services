import { EventEmitter } from 'events';

export interface NormalizedAttachment {
  type: 'image' | 'audio' | 'document' | 'video' | 'file';
  url?: string;        // Discord: permanent CDN URL | Telegram: expires ~1h
  fileId?: string;     // Telegram only — use to re-resolve when url expires
  filename?: string;
  size?: number;
  mimeType?: string;
}

export interface NormalizedInbound {
  provider: string;
  externalUserId: string;
  externalUsername: string;
  externalMessageId?: string; // Platform message ID — Discord: message.id, Telegram: update_id, used for dedup
  channelId: string;
  serverId?: string;          // Discord: guildId | Teams: teamId
  tenantId?: string;          // Teams only
  teamsServiceUrl?: string;   // Teams only — needed to reply via Bot connector
  teamsConversationId?: string; // Teams only — conversation reference for replies
  text: string;
  attachments?: NormalizedAttachment[];
  isMention?: boolean;
  raw: any;               // raw platform event
}

export interface AdapterTarget {
  channelId: string;
  threadId?: string;
  replyToId?: string;
}

export interface SendOptions {
  threadId?: string;
  replyToId?: string;
}

export interface EmbedPayload {
  title?: string;
  description?: string;
  color?: number;        // Discord: decimal color int (e.g. 0x5865F2); ignored on Telegram/Teams
  url?: string;          // Clickable title URL
  imageUrl?: string;     // Thumbnail/image URL
  footer?: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

export interface FilePayload {
  fileUrl: string;
  filename?: string;
  mimeType?: string;
  caption?: string;
}

export abstract class BaseAdapter extends EventEmitter {
  abstract readonly provider: string;

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(target: AdapterTarget, text: string, options?: SendOptions): Promise<void>;
  abstract sendTyping(target: AdapterTarget): Promise<void>;
  abstract sendEmbed(target: AdapterTarget, embed: EmbedPayload): Promise<void>;
  abstract sendFile(target: AdapterTarget, file: FilePayload): Promise<void>;

  // Typed event emitters
  emitMessage(msg: NormalizedInbound): void {
    this.emit('message', msg);
  }

  emitConnected(): void {
    this.emit('connected');
  }

  emitDisconnected(reason: string): void {
    this.emit('disconnected', reason);
  }

  emitError(err: Error): void {
    this.emit('error', err);
  }
}
