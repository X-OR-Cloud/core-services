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

  async sendTyping(target: AdapterTarget): Promise<void> {
    if (!this.client) return;
    try {
      const channel = await this.client.channels.fetch(target.channelId);
      if (channel?.isTextBased()) {
        await (channel as any).sendTyping();
      }
    } catch (err: any) {
      this.logger.warn(`sendTyping failed for channel ${target.channelId}: ${err.message}`);
    }
  }

  async send(target: AdapterTarget, text: string, _options?: SendOptions): Promise<void> {
    if (!this.client) throw new Error('Discord client not connected');

    const channel = await this.client.channels.fetch(target.channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Channel ${target.channelId} not found or not text-based`);
    }

    const chunks = this._splitMarkdown(text, 1900);
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

  /**
   * Split markdown text into chunks ≤ maxLength characters.
   *
   * Priority order for split points (highest → lowest):
   *   1. Between paragraphs (double newline) — never splits mid-paragraph
   *   2. Between lines (single newline) — never splits mid-line
   *   3. Hard cut at maxLength as last resort (e.g. single line > maxLength)
   *
   * Code block awareness: if a split would leave an unclosed ``` fence,
   * the opening fence is prepended to the next chunk so Discord renders it correctly.
   */
  private _splitMarkdown(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > maxLength) {
      const window = remaining.slice(0, maxLength);

      // 1. Try split on double newline (paragraph boundary)
      let splitAt = window.lastIndexOf('\n\n');

      // 2. Fallback: single newline
      if (splitAt <= 0) splitAt = window.lastIndexOf('\n');

      // 3. Fallback: hard cut
      if (splitAt <= 0) splitAt = maxLength;

      const chunk = remaining.slice(0, splitAt).trimEnd();
      remaining = remaining.slice(splitAt).trimStart();

      if (!chunk) continue;

      // Code block fence tracking — count ``` occurrences in chunk
      const fenceMatches = chunk.match(/```/g);
      const openFences = fenceMatches ? fenceMatches.length % 2 : 0;

      if (openFences !== 0) {
        // Close the open fence at end of this chunk
        chunks.push(chunk + '\n```');
        // Re-open fence at start of next chunk (preserve language hint if present)
        const langMatch = chunk.match(/```(\w*)/g);
        const lastFence = langMatch ? langMatch[langMatch.length - 1] : '```';
        remaining = lastFence + '\n' + remaining;
      } else {
        chunks.push(chunk);
      }
    }

    if (remaining.trim()) chunks.push(remaining.trim());
    return chunks;
  }
}
