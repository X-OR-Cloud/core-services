import { Logger } from '@nestjs/common';
import axios from 'axios';
import { BaseAdapter, NormalizedInbound, AdapterTarget, SendOptions, EmbedPayload, FilePayload } from './base.adapter';
import { ConnectionConfig } from '../../connection/connection.schema';

const ZALO_OA_API_BASE = 'https://openapi.zalo.me/v3.0/oa';
const MAX_TEXT_LENGTH = 2000;

export class ZaloOaAdapter extends BaseAdapter {
  readonly provider = 'zalo-oa';
  private readonly logger = new Logger(ZaloOaAdapter.name);

  // Access token is kept in memory; refreshed by ConnectionWorkerService every 30 min
  private accessToken: string;

  constructor(private config: ConnectionConfig) {
    super();
    this.accessToken = config.zaloAccessToken ?? '';
  }

  /** Called by ConnectionWorkerService after a token refresh to update the in-memory token. */
  updateAccessToken(token: string): void {
    this.accessToken = token;
  }

  async start(): Promise<void> {
    this.emitConnected();
    this.logger.log('Zalo OA connected via webhook');
  }

  async stop(): Promise<void> {
    this.logger.log('Zalo OA disconnected');
    this.emitDisconnected('stopped');
  }

  /**
   * Process a raw Zalo OA webhook payload forwarded from Redis.
   * Payload: { event_name, sender, recipient, message, timestamp, ... }
   */
  processWebhook(body: Record<string, any>): void {
    const eventName: string = body?.event_name ?? '';
    if (!eventName.startsWith('user_send_')) return;

    const senderId: string = String(body?.sender?.id ?? '');
    if (!senderId) return;

    let text = '';
    const attachments: NormalizedInbound['attachments'] = [];

    if (eventName === 'user_send_text') {
      text = body?.message?.text ?? '';
    } else if (eventName === 'user_send_image') {
      const attachList: any[] = body?.message?.attachments ?? [];
      text = '[image]';
      for (const att of attachList) {
        if (att?.payload?.url) {
          attachments.push({ type: 'image', url: att.payload.url });
        }
      }
    } else if (eventName === 'user_send_sticker') {
      text = '[sticker]';
    } else if (eventName === 'user_send_audio') {
      text = '[audio]';
    } else if (eventName === 'user_send_video') {
      text = '[video]';
    } else if (eventName === 'user_send_file') {
      const att = body?.message?.attachments?.[0];
      text = att?.payload?.name ? `[file: ${att.payload.name}]` : '[file]';
    } else if (eventName === 'user_send_location') {
      const loc = body?.message?.location;
      text = loc ? `[location: ${loc.description ?? `${loc.latitude},${loc.longitude}`}]` : '[location]';
    } else {
      // Unknown event type — skip
      return;
    }

    if (!text && attachments.length === 0) return;

    const normalized: NormalizedInbound = {
      provider: 'zalo-oa',
      externalUserId: senderId,
      externalUsername: body?.sender?.display_name ?? senderId,
      externalMessageId: String(body?.message?.msg_id ?? ''),
      // For Zalo OA: serverId = senderId (used as reply target)
      serverId: senderId,
      channelId: undefined,
      text,
      attachments,
      isMention: false,
      raw: body,
    };

    this.emitMessage(normalized);
  }

  async send(target: AdapterTarget, text: string, _options?: SendOptions): Promise<void> {
    const plain = this._stripMarkdown(text);
    const chunks = this._chunkText(plain, MAX_TEXT_LENGTH);
    for (const chunk of chunks) {
      await this._callApi('message', {
        recipient: { user_id: target.channelId },
        message: { text: chunk },
      });
    }
  }

  async sendPhoto(target: AdapterTarget, photoUrl: string, caption?: string): Promise<void> {
    await this._callApi('message', {
      recipient: { user_id: target.channelId },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'media',
            elements: [{ media_type: 'image', url: photoUrl }],
          },
        },
      },
    });
    if (caption) {
      await this.send(target, caption);
    }
  }

  async sendTyping(target: AdapterTarget): Promise<void> {
    try {
      await this._callApi('message', {
        recipient: { user_id: target.channelId },
        sender_action: 'typing_on',
      });
    } catch (err: any) {
      this.logger.warn(`sendTyping failed for user ${target.channelId}: ${err.message}`);
    }
  }

  async sendEmbed(target: AdapterTarget, embed: EmbedPayload): Promise<void> {
    const lines: string[] = [];
    if (embed.title) lines.push(embed.url ? `${embed.title} (${embed.url})` : embed.title);
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
      const text = file.caption ? `${file.caption}\n${file.fileUrl}` : file.fileUrl;
      await this.send(target, text);
    }
  }

  private async _callApi(endpoint: string, payload: Record<string, any>): Promise<any> {
    const res = await axios.post(
      `${ZALO_OA_API_BASE}/${endpoint}`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'access_token': this.accessToken,
        },
      },
    );
    if (res.data?.error !== 0) {
      throw new Error(`Zalo OA API error [${res.data?.error}]: ${res.data?.message}`);
    }
    return res.data;
  }

  private _stripMarkdown(text: string): string {
    return text
      .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => code.trim())
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
      .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^>\s+/gm, '')
      .replace(/^[-*_]{3,}\s*$/gm, '')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/^[\s]*[-*+]\s+/gm, '- ')
      .replace(/^[\s]*(\d+)\.\s+/gm, '$1. ')
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
