import { Logger } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { BaseAdapter, NormalizedAttachment, NormalizedInbound, AdapterTarget, SendOptions } from './base.adapter';
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

  async sendTyping(target: AdapterTarget): Promise<void> {
    if (!this.bot) return;
    try {
      await this.bot.sendChatAction(target.channelId, 'typing');
    } catch (err: any) {
      this.logger.warn(`sendTyping failed for channel ${target.channelId}: ${err.message}`);
    }
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
    const attachments = this._extractAttachments(msg);

    // Skip if no text and no attachments
    if (!text && attachments.length === 0) return;

    const normalized: NormalizedInbound = {
      provider: 'telegram',
      externalUserId: String(msg.chat.id),
      externalUsername: msg.from?.username || msg.from?.first_name || 'unknown',
      channelId: String(msg.chat.id),
      text,
      attachments,
      raw: msg,
    };

    this.emitMessage(normalized);
  }

  private _extractAttachments(msg: TelegramBot.Message): NormalizedAttachment[] {
    const attachments: NormalizedAttachment[] = [];
    if (msg.photo) {
      const largest = msg.photo[msg.photo.length - 1];
      attachments.push({ type: 'image', fileId: largest.file_id });
      this._resolveUrl(largest.file_id, attachments[attachments.length - 1]);
    }
    if (msg.document) {
      const att: NormalizedAttachment = { type: 'document', fileId: msg.document.file_id, filename: msg.document.file_name };
      attachments.push(att);
      this._resolveUrl(msg.document.file_id, att);
    }
    if (msg.voice) {
      const att: NormalizedAttachment = { type: 'audio', fileId: msg.voice.file_id };
      attachments.push(att);
      this._resolveUrl(msg.voice.file_id, att);
    }
    if (msg.video) {
      const att: NormalizedAttachment = { type: 'video', fileId: msg.video.file_id };
      attachments.push(att);
      this._resolveUrl(msg.video.file_id, att);
    }
    return attachments;
  }

  private _resolveUrl(fileId: string, target: NormalizedAttachment): void {
    if (!this.bot) return;
    this.bot.getFileLink(fileId).then((url) => {
      target.url = url;
    }).catch((err: any) => {
      this.logger.warn(`Failed to resolve Telegram fileId ${fileId}: ${err.message}`);
    });
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
