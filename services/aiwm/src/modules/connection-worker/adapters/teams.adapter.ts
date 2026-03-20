import { Logger } from '@nestjs/common';
import { BaseAdapter, NormalizedInbound, AdapterTarget, SendOptions } from './base.adapter';
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

    const isMention = Array.isArray(body.entities) &&
      body.entities.some((e: any) => e.type === 'mention' && e.mentioned?.role === 'bot');

    const normalized: NormalizedInbound = {
      provider: 'teams',
      externalUserId: body.from?.aadObjectId || body.from?.id || 'unknown',
      externalUsername: body.from?.name || 'unknown',
      channelId: body.conversation?.id || '',
      serverId: teamId,
      tenantId,
      teamsServiceUrl: body.serviceUrl,
      teamsConversationId: body.conversation?.id,
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
    const token = await this._getToken();

    // Teams conversation ID format: 19:xxx@thread.tacv2 (channel) or 19:xxx@thread.v2 (DM)
    // For channel posts we use Graph API: /teams/{teamId}/channels/{channelId}/messages
    // We store teamId in target as threadId (reusing the field)
    const teamId = target.threadId;
    const channelId = target.channelId;

    if (teamId) {
      await this._graphPost(
        `${GRAPH_API}/teams/${teamId}/channels/${channelId}/messages`,
        { body: { contentType: 'text', content: text } },
        token,
      );
    } else {
      // Fallback: direct message via conversation (1:1 chat)
      // This requires the conversation reference from the original activity
      // For now log a warning — full proactive DM requires conversation reference
      this.logger.warn(`send() called without teamId for channelId=${channelId}; DM not yet supported`);
    }
  }

  async sendTyping(target: AdapterTarget): Promise<void> {
    // Teams does not support typing indicators via Graph API for channel messages
    // Bot Framework connector supports it, but we are using Graph API only
    this.logger.debug(`sendTyping skipped for Teams (not supported via Graph API) channel=${target.channelId}`);
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
