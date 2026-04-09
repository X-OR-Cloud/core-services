import { Logger } from '@nestjs/common';
import { BaseAdapter, NormalizedInbound, AdapterTarget, SendOptions, EmbedPayload, FilePayload } from './base.adapter';
import { ConnectionConfig } from '../../connection/connection.schema';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL = (tenantId: string) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

/**
 * TeamsAdapter — stateless adapter for Microsoft Teams.
 *
 * Unlike Discord/Telegram, Teams pushes messages via webhook (POST from Teams).
 * This adapter does NOT maintain a persistent connection.
 *
 * Inbound flow:
 *   Teams → POST /connections/:id/webhook (api mode)
 *   → publish Redis: inbound:teams:{connectionId}
 *   → ConnectionRunner calls processActivity() to normalize and emit 'message'
 *
 * Outbound flow:
 *   send() → Graph API POST /teams/{teamId}/channels/{channelId}/messages
 */
export class TeamsAdapter extends BaseAdapter {
  readonly provider = 'teams';
  private readonly logger = new Logger(TeamsAdapter.name);
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConnectionConfig) {
    super();
  }

  /**
   * Validate credentials by fetching an OAuth token.
   * Teams does not require a persistent connection — this just confirms config is valid.
   */
  async start(): Promise<void> {
    await this._getToken();
    this.logger.log('Teams adapter started (credentials validated)');
    this.emitConnected();
  }

  async stop(): Promise<void> {
    this.tokenCache = null;
    this.logger.log('Teams adapter stopped');
    this.emitDisconnected('stopped');
  }

  /**
   * Process a raw Teams Activity payload (received via webhook).
   * Called by ConnectionRunner when it receives an inbound:teams Redis message.
   * Emits 'message' with NormalizedInbound if the activity is a user message.
   */
  processActivity(body: Record<string, any>): void {
    // Only handle message activities
    if (body.type !== 'message') return;

    // Ignore bot messages
    const fromRole = body.from?.role;
    if (fromRole === 'bot') return;

    const text: string = body.text || '';
    if (!text.trim()) return;

    // Strip @mention HTML: <at>BotName</at>
    const cleanText = text.replace(/<at>[^<]*<\/at>/g, '').trim();
    if (!cleanText) return;

    const channelData = body.channelData || {};
    const teamId: string | undefined = channelData.team?.id;
    const tenantId: string | undefined = body.conversation?.tenantId || channelData.tenant?.id;

    // Strip ;messageid=... suffix from channel conversation IDs (Teams reply threads)
    const rawConversationId: string = body.conversation?.id || '';
    const cleanConversationId = rawConversationId.split(';')[0];

    if (Array.isArray(body.entities) && body.entities.length > 0) {
      this.logger.debug(`Teams entities: ${JSON.stringify(body.entities)}`);
    }
    const isMention = Array.isArray(body.entities) &&
      body.entities.some((e: any) => e.type === 'mention' && e.mentioned?.role === 'bot');

    const normalized: NormalizedInbound = {
      provider: 'teams',
      externalUserId: body.from?.aadObjectId || body.from?.id || 'unknown',
      externalUsername: body.from?.name || 'unknown',
      channelId: cleanConversationId,
      serverId: teamId,
      tenantId,
      teamsServiceUrl: body.serviceUrl,
      teamsConversationId: cleanConversationId,
      text: cleanText,
      attachments: this._extractAttachments(body),
      isMention,
      raw: body,
    };

    this.emitMessage(normalized);
  }

  /**
   * Send a plain text message to a Teams channel via Graph API.
   * target.channelId should be the Teams conversation ID (from NormalizedInbound).
   * For channel messages, serverId (teamId) must be in AdapterTarget.
   */
  async send(target: AdapterTarget, text: string, _options?: SendOptions): Promise<void> {
    if (target.teamsServiceUrl && target.teamsConversationId) {
      // Both DM and channel messages — use Bot Framework connector API
      await this._botConnectorReply(target.teamsServiceUrl, target.teamsConversationId, text);
    } else {
      this.logger.warn(`send() called without conversation reference for channelId=${target.channelId}; cannot send`);
    }
  }

  async sendEmbed(target: AdapterTarget, embed: EmbedPayload): Promise<void> {
    // Teams has no native embed via Graph API — format as HTML-like text (Teams supports basic HTML)
    const lines: string[] = [];
    if (embed.title) lines.push(embed.url ? `<a href="${embed.url}"><b>${embed.title}</b></a>` : `<b>${embed.title}</b>`);
    if (embed.description) lines.push(embed.description);
    if (embed.fields?.length) {
      for (const f of embed.fields) {
        lines.push(`<br><b>${f.name}</b><br>${f.value}`);
      }
    }
    if (embed.imageUrl) lines.push(`<br><img src="${embed.imageUrl}" />`);
    if (embed.footer) lines.push(`<br><i>${embed.footer}</i>`);

    await this.send(target, lines.join('<br>'));
  }

  async sendFile(target: AdapterTarget, file: FilePayload): Promise<void> {
    // Teams: send as a message with an inline image/link card
    const caption = file.caption ? `${file.caption}\n` : '';
    const name = file.filename || 'file';
    await this.send(target, `${caption}<a href="${file.fileUrl}">${name}</a>`);
  }

  async sendTyping(target: AdapterTarget): Promise<void> {
    if (target.teamsServiceUrl && target.teamsConversationId) {
      try {
        await this._botConnectorReply(target.teamsServiceUrl, target.teamsConversationId, '', 'typing');
      } catch (err: any) {
        this.logger.debug(`sendTyping failed (non-critical): ${err.message}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _getToken(): Promise<string> {
    const now = Date.now();

    if (this.tokenCache && this.tokenCache.expiresAt - now > TOKEN_REFRESH_BUFFER_MS) {
      return this.tokenCache.token;
    }

    const { appId, appPassword, tenantId } = this.config;
    if (!appId || !appPassword || !tenantId) {
      throw new Error('Teams adapter requires appId, appPassword, and tenantId in config');
    }

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: appId,
      client_secret: appPassword,
      scope: 'https://graph.microsoft.com/.default',
    });

    const res = await fetch(TOKEN_URL(tenantId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Teams OAuth token fetch failed: ${res.status} ${body}`);
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    this.tokenCache = {
      token: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    };

    this.logger.debug('Teams OAuth token refreshed');
    return this.tokenCache.token;
  }

  /**
   * Reply to a DM/1:1 conversation via Bot Framework connector API.
   * Uses https://login.microsoftonline.com/botframework.com scope (not Graph).
   */
  private async _botConnectorReply(serviceUrl: string, conversationId: string, text: string, type = 'message'): Promise<void> {
    const { appId, appPassword } = this.config;
    if (!appId || !appPassword) {
      throw new Error('Teams adapter requires appId and appPassword for Bot connector reply');
    }

    // Bot Framework connector scope + tenant from config (or 'common' fallback)
    const scope = 'https://api.botframework.com/.default';
    const tenant = this.config.tenantId ?? 'common';

    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: appId,
        client_secret: appPassword,
        scope,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      throw new Error(`Bot connector token fetch failed: ${tokenRes.status} ${body}`);
    }

    const tokenData = await tokenRes.json() as { access_token: string };
    const token = tokenData.access_token;
    this.logger.debug(`Bot connector token fetched, aud=api.botframework.com, prefix=${token.slice(0, 20)}...`);

    const baseUrl = serviceUrl.endsWith('/') ? serviceUrl.slice(0, -1) : serviceUrl;
    // Do NOT encodeURIComponent — Bot connector expects the raw conversation ID in the path
    const url = `${baseUrl}/v3/conversations/${conversationId}/activities`;
    this.logger.debug(`Bot connector POST url=${url}`);

    const body: Record<string, any> = { type };
    if (text) body['text'] = text;
    await this._graphPost(url, body, token);

    this.logger.debug(`Bot connector ${type} sent to conversation=${conversationId}`);
  }

  private async _graphPost(url: string, body: unknown, token: string): Promise<void> {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph API POST ${url} failed: ${res.status} ${text}`);
    }
  }

  private _extractAttachments(body: Record<string, any>): any[] {
    if (!Array.isArray(body.attachments)) return [];
    return body.attachments.map((a: any) => ({
      url: a.contentUrl,
      filename: a.name,
      mimeType: a.contentType,
    }));
  }
}
