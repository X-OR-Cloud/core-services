import { Logger } from '@nestjs/common';
import { Client, GatewayIntentBits, Events, Message as DiscordMessage, EmbedBuilder } from 'discord.js';
import { BaseAdapter, NormalizedAttachment, NormalizedInbound, AdapterTarget, SendOptions, EmbedPayload, FilePayload } from './base.adapter';
import { ConnectionConfig } from '../../connection/connection.schema';

export class DiscordAdapter extends BaseAdapter {
  readonly provider = 'discord';
  private readonly logger = new Logger(DiscordAdapter.name);
  private client: Client | null = null;

  // Max rendered ASCII-table width before falling back to list format (mobile-friendly threshold).
  private static readonly MAX_TABLE_WIDTH = 55;

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

    const transformed = this._convertMarkdownTables(text);
    const chunks = this._splitMarkdown(transformed, 1900);
    for (const chunk of chunks) {
      await (channel as any).send(chunk);
    }
  }

  async sendEmbed(target: AdapterTarget, embed: EmbedPayload): Promise<void> {
    if (!this.client) throw new Error('Discord client not connected');

    const channel = await this.client.channels.fetch(target.channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Channel ${target.channelId} not found or not text-based`);
    }

    const builder = new EmbedBuilder();
    if (embed.title) builder.setTitle(embed.title);
    if (embed.description) builder.setDescription(embed.description);
    if (embed.color !== undefined) builder.setColor(embed.color);
    if (embed.url) builder.setURL(embed.url);
    if (embed.imageUrl) builder.setImage(embed.imageUrl);
    if (embed.footer) builder.setFooter({ text: embed.footer });
    if (embed.fields?.length) {
      builder.addFields(embed.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline ?? false })));
    }

    await (channel as any).send({ embeds: [builder] });
  }

  async sendFile(target: AdapterTarget, file: FilePayload): Promise<void> {
    if (!this.client) throw new Error('Discord client not connected');

    const channel = await this.client.channels.fetch(target.channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Channel ${target.channelId} not found or not text-based`);
    }

    // Download file buffer first — discord.js struggles with external URLs in some environments
    const res = await fetch(file.fileUrl);
    if (!res.ok) throw new Error(`Failed to fetch file from ${file.fileUrl}: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    await (channel as any).send({
      content: file.caption || undefined,
      files: [{ attachment: buffer, name: file.filename || 'file' }],
    });
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
      externalMessageId: msg.id,
      channelId: msg.channelId,
      serverId: msg.guildId ?? undefined,
      text: msg.content,
      attachments: msg.attachments.map((a): NormalizedAttachment => ({
        type: this._detectType(a.contentType ?? undefined),
        url: a.url,
        filename: a.name ?? undefined,
        size: a.size,
        mimeType: a.contentType ?? undefined,
      })),
      isMention,
      raw: msg,
    };

    this.emitMessage(normalized);
  }

  private _detectType(mimeType?: string): NormalizedAttachment['type'] {
    if (!mimeType) return 'file';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf' || mimeType.startsWith('application/')) return 'document';
    return 'file';
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

  /**
   * Convert markdown tables in text to Discord-friendly format.
   * Discord doesn't render markdown tables — small tables become ASCII tables
   * inside a code fence (monospace alignment); large tables become a list.
   */
  private _convertMarkdownTables(text: string): string {
    const lines = text.split('\n');
    const out: string[] = [];
    let inFence = false;
    let i = 0;

    while (i < lines.length) {
      // Skip over existing fenced code blocks untouched
      if (/^```/.test(lines[i].trim())) {
        inFence = !inFence;
        out.push(lines[i]);
        i++;
        continue;
      }
      if (inFence) {
        out.push(lines[i]);
        i++;
        continue;
      }

      const tableEnd = this._detectTable(lines, i);
      if (tableEnd > i) {
        out.push(this._renderTable(lines.slice(i, tableEnd)));
        i = tableEnd;
      } else {
        out.push(lines[i]);
        i++;
      }
    }

    return out.join('\n');
  }

  /**
   * Detect a markdown table starting at startIdx. Returns exclusive end index,
   * or startIdx if no table is detected. Requires header + separator + ≥1 row.
   */
  private _detectTable(lines: string[], startIdx: number): number {
    if (startIdx + 2 >= lines.length) return startIdx;

    const header = lines[startIdx].trim();
    const sep = lines[startIdx + 1].trim();

    if (!header.includes('|')) return startIdx;
    // Separator: only |, -, :, spaces; must contain at least one '-'
    if (!/^\|?[\s:|-]+\|?$/.test(sep) || !sep.includes('-')) return startIdx;

    const headerCols = this._parseRow(header);
    const sepCols = this._parseRow(sep);
    if (headerCols.length < 2 || headerCols.length !== sepCols.length) return startIdx;
    if (!sepCols.every((c) => /^:?-+:?$/.test(c.trim()))) return startIdx;

    let end = startIdx + 2;
    while (end < lines.length) {
      const line = lines[end].trim();
      if (!line.includes('|')) break;
      const cols = this._parseRow(line);
      if (cols.length !== headerCols.length) break;
      end++;
    }

    // Need at least one data row
    return end > startIdx + 2 ? end : startIdx;
  }

  private _parseRow(line: string): string[] {
    return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  }

  private _renderTable(tableLines: string[]): string {
    const headers = this._parseRow(tableLines[0]);
    const rows = tableLines.slice(2).map((l) => this._parseRow(l));

    const widths = headers.map((h, idx) => {
      let w = this._displayWidth(h);
      for (const r of rows) w = Math.max(w, this._displayWidth(r[idx] ?? ''));
      return w;
    });

    // "| " + col + " | " + col + " |" → sum(widths) + 3*N + 1
    const totalWidth = widths.reduce((s, w) => s + w, 0) + 3 * widths.length + 1;

    if (totalWidth <= DiscordAdapter.MAX_TABLE_WIDTH) {
      return this._renderAsciiTable(headers, rows, widths);
    }
    return this._renderListTable(headers, rows);
  }

  private _renderAsciiTable(headers: string[], rows: string[][], widths: number[]): string {
    const renderRow = (cells: string[]) =>
      '| ' + cells.map((c, i) => this._padCell(c ?? '', widths[i])).join(' | ') + ' |';
    const sep = '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|';

    return '```\n' + [renderRow(headers), sep, ...rows.map(renderRow)].join('\n') + '\n```';
  }

  private _renderListTable(headers: string[], rows: string[][]): string {
    const out: string[] = [];
    rows.forEach((row, idx) => {
      const title = (row[0] ?? '').trim() || `Row ${idx + 1}`;
      out.push(`**${idx + 1}. ${title}**`);
      for (let c = 1; c < headers.length; c++) {
        const value = (row[c] ?? '').trim();
        if (value) out.push(`• ${headers[c]}: ${value}`);
      }
      out.push('');
    });
    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    return out.join('\n');
  }

  /** Display width for monospace alignment — CJK/emoji = 2 cells, others = 1. */
  private _displayWidth(s: string): number {
    let w = 0;
    for (const ch of s) {
      const code = ch.codePointAt(0) ?? 0;
      if (
        (code >= 0x1100 && code <= 0x115f) ||
        (code >= 0x2e80 && code <= 0x303e) ||
        (code >= 0x3041 && code <= 0x33ff) ||
        (code >= 0x3400 && code <= 0x4dbf) ||
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0xa000 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe30 && code <= 0xfe4f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6) ||
        (code >= 0x1f000 && code <= 0x1ffff)
      ) {
        w += 2;
      } else {
        w += 1;
      }
    }
    return w;
  }

  private _padCell(s: string, target: number): string {
    const cur = this._displayWidth(s);
    return cur >= target ? s : s + ' '.repeat(target - cur);
  }
}
