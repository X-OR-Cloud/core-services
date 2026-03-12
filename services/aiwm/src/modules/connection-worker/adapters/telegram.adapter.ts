import { Logger } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { BaseAdapter, NormalizedInbound, AdapterTarget, SendOptions } from './base.adapter';
import { ConnectionConfig } from '../../connection/connection.schema';

export class TelegramAdapter extends BaseAdapter {
  readonly provider = 'telegram';
  private readonly logger = new Logger(TelegramAdapter.name);
  private bot: TelegramBot | null = null;

  constructor(private readonly config: ConnectionConfig) {
    super();
  }

  async start(): Promise<void> {
    const useWebhook = !!this.config.webhookUrl && this.config.pollingMode !== true;

    if (useWebhook) {
      this.bot = new TelegramBot(this.config.botToken, { webHook: true });
      await this.bot.setWebHook(this.config.webhookUrl!);
      this.logger.log(`Telegram connected via webhook: ${this.config.webhookUrl}`);
    } else {
      this.bot = new TelegramBot(this.config.botToken, { polling: true });
      this.logger.log('Telegram connected via long-polling');
    }

    this.bot.on('message', (msg) => this._handleMessage(msg));
    this.bot.on('polling_error', (err) => {
      this.logger.error('Telegram polling error:', err.message);
      this.emitError(err);
    });

    this.emitConnected();
  }

  async stop(): Promise<void> {
    if (this.bot) {
      await this.bot.stopPolling();
      this.bot = null;
    }
    this.logger.log('Telegram disconnected');
    this.emitDisconnected('stopped');
  }

  async send(target: AdapterTarget, text: string, options?: SendOptions): Promise<void> {
    if (!this.bot) throw new Error('Telegram bot not connected');

    // Split if over Telegram's 4096 char limit
    const chunks = this._chunkText(text, 4096);
    for (const chunk of chunks) {
      await this.bot.sendMessage(target.channelId, chunk, {
        reply_to_message_id: options?.replyToId ? Number(options.replyToId) : undefined,
        parse_mode: 'Markdown',
      });
    }
  }

  private _handleMessage(msg: TelegramBot.Message): void {
    const text = msg.text || msg.caption || '';
    if (!text) return;

    const normalized: NormalizedInbound = {
      provider: 'telegram',
      externalUserId: String(msg.chat.id),
      externalUsername: msg.from?.username || msg.from?.first_name || 'unknown',
      channelId: String(msg.chat.id),
      text,
      attachments: this._extractAttachments(msg),
      raw: msg,
    };

    this.emitMessage(normalized);
  }

  private _extractAttachments(msg: TelegramBot.Message): any[] {
    const attachments: any[] = [];
    if (msg.photo) {
      const largest = msg.photo[msg.photo.length - 1];
      attachments.push({ type: 'image', fileId: largest.file_id });
    }
    if (msg.document) {
      attachments.push({ type: 'document', fileId: msg.document.file_id, filename: msg.document.file_name });
    }
    if (msg.voice) {
      attachments.push({ type: 'audio', fileId: msg.voice.file_id });
    }
    return attachments;
  }

  private _chunkText(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];
    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
      chunks.push(text.slice(i, i + maxLength));
      i += maxLength;
    }
    return chunks;
  }
}
