import { EventEmitter } from 'events';

export interface NormalizedInbound {
  provider: string;
  externalUserId: string;
  externalUsername: string;
  channelId: string;
  guildId?: string;       // Discord only
  text: string;
  attachments?: any[];
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

export abstract class BaseAdapter extends EventEmitter {
  abstract readonly provider: string;

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(target: AdapterTarget, text: string, options?: SendOptions): Promise<void>;

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
