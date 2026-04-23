import { Logger } from '@nestjs/common';
import axios from 'axios';
import { BaseAdapter, NormalizedInbound, AdapterTarget, SendOptions, EmbedPayload, FilePayload } from './base.adapter';
import { ConnectionConfig } from '../../connection/connection.schema';

const ZALO_API_BASE = 'https://bot-api.zaloplatforms.com/bot';
const MAX_TEXT_LENGTH = 2000;

export class ZaloBotAdapter extends BaseAdapter {
  readonly provider = 'zalo-bot';
  private readonly logger = new Logger(ZaloBotAdapter.name);
  private pollingTimer: NodeJS.Timeout | null = null;
  private lastUpdateOffset = 0;
  private stopped = false;

  constructor(private readonly config: ConnectionConfig) {
    super();
  }

  private get apiBase(): string {
    return `${ZALO_API_BASE}${this.config.botToken}`;
  }

  private async callApi<T = any>(method: string, params: Record<string, any> = {}): Promise<T> {
    const res = await axios.post<{ ok: boolean; result: T; description?: string; error_code?: number }>(
      `${this.apiBase}/${method}`,
      params,
      { headers: { 'Content-Type': 'application/json' } },
    );
    if (!res.data.ok) {
      throw new Error(`Zalo API error [${res.data.error_code}]: ${res.data.description}`);
    }
    return res.data.result;
  }

  async start(): Promise<void> {
    this.stopped = false;

    // pollingMode: true (default) = long-polling; false = webhook mode
    // In webhook mode, messages arrive via processWebhook() called from Redis inbound channel.
    const usePolling = this.config.pollingMode !== false;

    if (usePolling) {
      this._startPolling();
      this.logger.log('Zalo Bot connected via long-polling');
    } else {
      this.logger.log('Zalo Bot connected via webhook');
    }

    this.emitConnected();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.logger.log('Zalo Bot disconnected');
    this.emitDisconnected('stopped');
  }

  /**
   * Process a raw webhook payload forwarded from Redis by ConnectionWorkerService.
   * Zalo webhook payload is flat: { event_name, message } — no result wrapper.
   */
  processWebhook(body: Record<string, any>): void {
    const eventName: string = body?.event_name ?? '';
    const msg: Record<string, any> = body?.message;

    if (!msg) return;

    // Unsupported events — reply directly, bypass agent pipeline
    if (eventName === 'message.unsupported.received') {
      this.logger.debug(`Unsupported Zalo event from ${msg.from?.display_name}, sending auto-reply`);
      const chatId = String(msg.chat?.id ?? '');
      if (chatId) {
        this.callApi('sendMessage', { chat_id: chatId, text: 'Xin lỗi, Agent chưa hỗ trợ loại tin nhắn này.' })
          .catch((err: Error) => this.logger.warn(`Failed to send unsupported reply: ${err.message}`));
      }
      return;
    }

    this._handleMessage(eventName, msg);
  }

  async send(target: AdapterTarget, text: string, _options?: SendOptions): Promise<void> {
    const plain = this._stripMarkdown(text);
    const chunks = this._chunkText(plain, MAX_TEXT_LENGTH);
    for (const chunk of chunks) {
      await this.callApi('sendMessage', { chat_id: target.channelId, text: chunk });
    }
  }

  async sendPhoto(target: AdapterTarget, photoUrl: string, caption?: string): Promise<void> {
    await this.callApi('sendPhoto', {
      chat_id: target.channelId,
      photo: photoUrl,
      ...(caption ? { caption } : {}),
    });
  }

  async sendTyping(target: AdapterTarget): Promise<void> {
    try {
      await this.callApi('sendChatAction', { chat_id: target.channelId, action: 'typing' });
    } catch (err: any) {
      this.logger.warn(`sendTyping failed for chat ${target.channelId}: ${err.message}`);
    }
  }

  async sendEmbed(target: AdapterTarget, embed: EmbedPayload): Promise<void> {
    const lines: string[] = [];
    if (embed.title) lines.push(embed.url ? `[${embed.title}](${embed.url})` : embed.title);
    if (embed.description) lines.push(embed.description);
    if (embed.fields?.length) {
      for (const f of embed.fields) lines.push(`\n${f.name}\n${f.value}`);
    }
    if (embed.imageUrl) lines.push(embed.imageUrl);
    if (embed.footer) lines.push(embed.footer);
    await this.send(target, lines.join('\n'));
  }

  async sendFile(target: AdapterTarget, file: FilePayload): Promise<void> {
    const mime = file.mimeType ?? '';
    if (mime.startsWith('image/')) {
      await this.sendPhoto(target, file.fileUrl, file.caption);
    } else {
      // Zalo Bot API does not support generic file upload — fall back to URL text
      const text = file.caption ? `${file.caption}\n${file.fileUrl}` : file.fileUrl;
      await this.send(target, text);
    }
  }

  private _startPolling(): void {
    const poll = async () => {
      if (this.stopped) return;
      try {
        const updates = await this.callApi<any[]>('getUpdates', {
          timeout: 30,
          ...(this.lastUpdateOffset ? { offset: this.lastUpdateOffset } : {}),
        });
        if (Array.isArray(updates)) {
          for (const update of updates) {
            // Polling response: { event_name, message, update_id }
            const eventName: string = update?.event_name ?? '';
            const msg: Record<string, any> = update?.message;
            if (msg && eventName !== 'message.unsupported.received') {
              this._handleMessage(eventName, msg);
              if (update.update_id != null) {
                this.lastUpdateOffset = update.update_id + 1;
              }
            }
          }
        }
      } catch (err: any) {
        if (!this.stopped) {
          // 408 = long-poll timeout (no new messages) — expected, retry silently
          if (err.message?.includes('[408]')) {
            this.logger.debug('Zalo long-poll timeout, retrying...');
          } else {
            this.logger.error(`Zalo polling error: ${err.message}`);
            this.emitError(err);
          }
        }
      }
      if (!this.stopped) {
        this.pollingTimer = setTimeout(poll, 1000);
      }
    };
    poll();
  }

  private _handleMessage(eventName: string, msg: Record<string, any>): void {
    const chatId = String(msg.chat?.id ?? '');
    const chatType: string = msg.chat?.chat_type ?? 'PRIVATE';

    let text = '';
    const attachments: NormalizedInbound['attachments'] = [];

    if (eventName === 'message.text.received') {
      text = msg.text ?? '';
    } else if (eventName === 'message.image.received') {
      text = msg.caption || '[image]';
      if (msg.photo_url) {
        attachments.push({ type: 'image', url: msg.photo_url });
      }
    } else if (eventName === 'message.sticker.received') {
      text = '[sticker]';
      if (msg.url) {
        attachments.push({ type: 'image', url: msg.url, fileId: msg.sticker });
      }
    }

    // Skip if no content at all
    if (!text && attachments.length === 0) return;

    const normalized: NormalizedInbound = {
      provider: 'zalo-bot',
      externalUserId: String(msg.from?.id ?? chatId),
      externalUsername: msg.from?.display_name ?? 'unknown',
      externalMessageId: String(msg.message_id ?? ''),
      // serverId = chat.id — used as send target for both PRIVATE and GROUP
      serverId: chatId,
      channelId: chatType !== 'PRIVATE' ? chatId : undefined,
      text,
      attachments,
      isMention: false,
      raw: msg,
    };

    this.emitMessage(normalized);
  }

  private _stripMarkdown(text: string): string {
    return text
      // Code blocks (``` ... ```) — replace with content only
      .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => code.trim())
      // Inline code
      .replace(/`([^`]+)`/g, '$1')
      // Bold/italic: ***text***, **text**, *text*, ___text___, __text__, _text_
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
      .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
      // Strikethrough ~~text~~
      .replace(/~~([^~]+)~~/g, '$1')
      // Headers # ## ###
      .replace(/^#{1,6}\s+/gm, '')
      // Blockquotes
      .replace(/^>\s+/gm, '')
      // Horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // Links [text](url) → text (url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
      // Images ![alt](url) → alt
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      // Unordered list markers
      .replace(/^[\s]*[-*+]\s+/gm, '- ')
      // Ordered list markers (keep numbering)
      .replace(/^[\s]*(\d+)\.\s+/gm, '$1. ')
      // Collapse multiple blank lines
      .replace(/\n{3,}/g, '\n\n')
      .trim();
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
