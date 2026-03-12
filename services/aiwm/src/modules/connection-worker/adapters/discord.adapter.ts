import { Logger } from '@nestjs/common';
import { Client, GatewayIntentBits, Events, Message as DiscordMessage } from 'discord.js';
import { BaseAdapter, NormalizedInbound, AdapterTarget, SendOptions } from './base.adapter';
import { ConnectionConfig } from '../../connection/connection.schema';

export class DiscordAdapter extends BaseAdapter {
  readonly provider = 'discord';
  private readonly logger = new Logger(DiscordAdapter.name);
  private client: Client | null = null;

  constructor(private readonly config: ConnectionConfig) {
    super();
  }

  async start(): Promise<void> {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    this.client.on(Events.MessageCreate, (msg: DiscordMessage) => this._handleMessage(msg));
    this.client.on(Events.ClientReady, () => {
      this.logger.log(`Discord connected as ${this.client?.user?.tag}`);
      this.emitConnected();
    });
    this.client.on(Events.Error, (err: Error) => {
      this.logger.error('Discord error:', err.message);
      this.emitError(err);
    });

    await this.client.login(this.config.botToken);
  }

  async stop(): Promise<void> {
    await this.client?.destroy();
    this.client = null;
    this.logger.log('Discord disconnected');
    this.emitDisconnected('stopped');
  }

  async send(target: AdapterTarget, text: string, _options?: SendOptions): Promise<void> {
    if (!this.client) throw new Error('Discord client not connected');

    const channel = await this.client.channels.fetch(target.channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Channel ${target.channelId} not found or not text-based`);
    }

    // Split if over Discord's 2000 char limit
    const chunks = this._chunkText(text, 2000);
    for (const chunk of chunks) {
      await (channel as any).send(chunk);
    }
  }

  private _handleMessage(msg: DiscordMessage): void {
    // Ignore bot messages
    if (msg.author.bot) return;

    const botId = this.client?.user?.id;
    const isMention = botId ? msg.mentions.has(botId) : false;

    const normalized: NormalizedInbound = {
      provider: 'discord',
      externalUserId: msg.author.id,
      externalUsername: msg.author.username,
      channelId: msg.channelId,
      guildId: msg.guildId ?? undefined,
      text: msg.content,
      attachments: msg.attachments.map((a) => ({
        url: a.url,
        filename: a.name,
        size: a.size,
        mimeType: a.contentType ?? undefined,
      })),
      isMention,
      raw: msg,
    };

    this.emitMessage(normalized);
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
