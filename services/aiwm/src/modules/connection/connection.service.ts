import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Redis from 'ioredis';
import axios from 'axios';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext, ConfigKey } from '@hydrabyte/shared';
import { Connection, ConnectionLog, ConnectionLogLevel } from './connection.schema';
import { redisConfig } from '../../config/redis.config';
import { ConfigService } from '../configuration/config.service';

const ZALO_BOT_API_BASE = 'https://bot-api.zaloplatforms.com/bot';
const ZALO_OA_OAUTH_BASE = 'https://oauth.zaloapp.com/v4/oa';
const ZALO_OA_GRAPH_BASE = 'https://openapi.zalo.me/v3.0/oa';

export const CHANNEL_CONNECTION_CHANGED = 'connection:changed';

export type ConnectionChangedAction = 'created' | 'updated' | 'deleted' | 'status_changed' | 'route_changed';

export interface ConnectionChangedPayload {
  connectionId: string;
  action: ConnectionChangedAction;
  status?: string;
}

@Injectable()
export class ConnectionService extends BaseService<Connection> implements OnModuleDestroy {
  private readonly connLogger = new Logger(ConnectionService.name);
  private redisPub: Redis | null = null;

  constructor(
    @InjectModel(Connection.name)
    connectionModel: Model<Connection>,
    private readonly configService: ConfigService,
  ) {
    super(connectionModel);
    this.redisPub = new Redis(redisConfig);
  }

  onModuleDestroy(): void {
    this.redisPub?.disconnect();
  }

  private publishChanged(payload: ConnectionChangedPayload): void {
    this.redisPub
      ?.publish(CHANNEL_CONNECTION_CHANGED, JSON.stringify(payload))
      .catch((err: Error) => this.connLogger.error(`Failed to publish connection:changed: ${err.message}`));
  }

  async findAll(
    options: FindManyOptions,
    context: RequestContext,
  ): Promise<FindManyResult<Connection>> {
    options.selectFields = ['-config'];
    const result = await super.findAll(options, context);
    result.data = result.data.map((conn) => {
      const obj: Record<string, unknown> = (conn as unknown as { toObject: () => Record<string, unknown> }).toObject?.() ?? { ...(conn as object) };
      const routeCount: number = Array.isArray(obj['routes']) ? (obj['routes'] as unknown[]).length : 0;
      delete obj['routes'];
      obj['routeCount'] = routeCount;
      return obj as unknown as Connection;
    });
    return result;
  }

  async create(dto: any, context: RequestContext): Promise<any> {
    const connection = await super.create(dto, context);
    this.publishChanged({
      connectionId: String((connection as any)._id),
      action: 'created',
      status: (connection as any).status,
    });
    return connection;
  }

  async update(id: string, dto: any, context: RequestContext): Promise<any> {
    const before = await this.model.findOne({ _id: new Types.ObjectId(id), isDeleted: false }).exec();
    const connection = await super.update(id, dto, context);

    // Auto sync Zalo Bot webhook when pollingMode changes
    if ((connection as any).provider === 'zalo-bot' && dto.config?.pollingMode !== undefined) {
      const wasPolling = before?.config?.pollingMode !== false;
      const nowPolling = dto.config.pollingMode !== false;
      if (wasPolling !== nowPolling) {
        await this._syncZaloWebhook(connection).catch((err: Error) =>
          this.connLogger.error(`Failed to sync Zalo webhook for ${id}: ${err.message}`),
        );
      }
    }

    this.publishChanged({
      connectionId: id,
      action: 'updated',
      status: (connection as any).status,
    });
    return connection;
  }

  /**
   * Build the AIWM public base URL from DB config, falling back to env var.
   */
  private async _getAiwmBaseUrl(): Promise<string> {
    return (
      (await this.configService.get<string>(ConfigKey.AIWM_BASE_API_URL)) ??
      process.env.AIWM_SERVICE_URL ??
      'http://localhost:3003'
    );
  }

  /**
   * Build Zalo OA authorization URL for the OAuth redirect.
   */
  async buildZaloOaAuthUrl(connectionId: string, appId: string): Promise<string> {
    const aiwmBaseUrl = await this._getAiwmBaseUrl();
    const redirectUri = encodeURIComponent(`${aiwmBaseUrl}/connections/${connectionId}/oauth-callback`);
    return `${ZALO_OA_OAUTH_BASE}/permission?app_id=${appId}&redirect_uri=${redirectUri}&state=${connectionId}`;
  }

  /**
   * Exchange OAuth authorization code for access_token + refresh_token and persist to DB.
   */
  async exchangeZaloOaCode(connectionId: string, code: string): Promise<void> {
    const connection = await this.model.findOne({ _id: new Types.ObjectId(connectionId), isDeleted: false }).exec();
    if (!connection) throw new NotFoundException(`Connection ${connectionId} not found`);

    const appId: string = (connection as any).config?.zaloAppId ?? '';
    const appSecret: string = (connection as any).config?.zaloAppSecret ?? '';
    if (!appId || !appSecret) throw new Error('zaloAppId and zaloAppSecret are required');

    const res = await axios.post<{
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: number;
      message?: string;
    }>(
      `${ZALO_OA_OAUTH_BASE}/access_token`,
      new URLSearchParams({ app_id: appId, app_secret: appSecret, code, grant_type: 'authorization_code' }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    if (res.data.error) {
      throw new Error(`Zalo OA OAuth error [${res.data.error}]: ${res.data.message}`);
    }

    const expiresIn = res.data.expires_in ?? 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await this.model.updateOne(
      { _id: new Types.ObjectId(connectionId) },
      {
        'config.zaloAccessToken': res.data.access_token,
        'config.zaloRefreshToken': res.data.refresh_token,
        'config.zaloTokenExpiresAt': expiresAt,
        status: 'active',
      },
    );

    this.publishChanged({ connectionId, action: 'updated', status: 'active' });
    this.connLogger.log(`Zalo OA OAuth completed for connection ${connectionId}, token expires at ${expiresAt.toISOString()}`);
  }

  /**
   * Refresh Zalo OA access token using refresh_token. Updates DB and returns new access token.
   * Called by ConnectionWorkerService every 30 min.
   */
  async refreshZaloOaToken(connectionId: string): Promise<string> {
    const connection = await this.model.findOne({ _id: new Types.ObjectId(connectionId), isDeleted: false }).exec();
    if (!connection) throw new NotFoundException(`Connection ${connectionId} not found`);

    const appId: string = (connection as any).config?.zaloAppId ?? '';
    const appSecret: string = (connection as any).config?.zaloAppSecret ?? '';
    const refreshToken: string = (connection as any).config?.zaloRefreshToken ?? '';
    if (!appId || !appSecret || !refreshToken) throw new Error('Missing zaloAppId, zaloAppSecret, or zaloRefreshToken');

    const res = await axios.post<{
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: number;
      message?: string;
    }>(
      `${ZALO_OA_OAUTH_BASE}/access_token`,
      new URLSearchParams({ app_id: appId, app_secret: appSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    if (res.data.error) {
      throw new Error(`Zalo OA token refresh error [${res.data.error}]: ${res.data.message}`);
    }

    const expiresIn = res.data.expires_in ?? 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await this.model.updateOne(
      { _id: new Types.ObjectId(connectionId) },
      {
        'config.zaloAccessToken': res.data.access_token,
        // Zalo issues a new refresh_token each time (single-use) — persist it
        ...(res.data.refresh_token ? { 'config.zaloRefreshToken': res.data.refresh_token } : {}),
        'config.zaloTokenExpiresAt': expiresAt,
      },
    );

    this.connLogger.log(`Zalo OA token refreshed for connection ${connectionId}, expires at ${expiresAt.toISOString()}`);
    return res.data.access_token!;
  }

  /**
   * Register Zalo OA webhook URL via Zalo Graph API.
   * Called after OAuth completes or when webhook config changes.
   */
  async registerZaloOaWebhook(connectionId: string): Promise<void> {
    const connection = await this.model.findOne({ _id: new Types.ObjectId(connectionId), isDeleted: false }).exec();
    if (!connection) throw new NotFoundException(`Connection ${connectionId} not found`);

    const accessToken: string = (connection as any).config?.zaloAccessToken ?? '';
    if (!accessToken) throw new Error('No access token — complete OAuth first');

    const aiwmBaseUrl = await this._getAiwmBaseUrl();
    const webhookUrl = `${aiwmBaseUrl}/connections/${connectionId}/webhook`;

    const res = await axios.post<{ error: number; message: string }>(
      `${ZALO_OA_GRAPH_BASE}/webhook`,
      { callback_url: webhookUrl },
      { headers: { 'Content-Type': 'application/json', 'access_token': accessToken } },
    );

    if (res.data.error !== 0) {
      throw new Error(`Zalo OA webhook register error [${res.data.error}]: ${res.data.message}`);
    }
    this.connLogger.log(`Zalo OA webhook registered: ${webhookUrl}`);
  }

  private async _syncZaloWebhook(connection: any): Promise<void> {
    const botToken: string = connection.config?.botToken;
    const secretToken: string | undefined = connection.config?.zaloSecretToken;
    const usePolling = connection.config?.pollingMode !== false;

    if (usePolling) {
      const res = await axios.post<{ ok: boolean; description?: string; error_code?: number }>(
        `${ZALO_BOT_API_BASE}${botToken}/deleteWebhook`,
        {},
        { headers: { 'Content-Type': 'application/json' } },
      );
      if (!res.data.ok) {
        throw new Error(`Zalo API error [${res.data.error_code}]: ${res.data.description}`);
      }
      this.connLogger.log(`Zalo webhook removed for connection ${String(connection._id)}`);
    } else {
      const aiwmBaseUrl = await this._getAiwmBaseUrl();
      const webhookUrl = `${aiwmBaseUrl}/connections/${String(connection._id)}/webhook`;
      const res = await axios.post<{ ok: boolean; result?: { url: string }; description?: string; error_code?: number }>(
        `${ZALO_BOT_API_BASE}${botToken}/setWebhook`,
        { url: webhookUrl, ...(secretToken ? { secret_token: secretToken } : {}) },
        { headers: { 'Content-Type': 'application/json' } },
      );
      if (!res.data.ok) {
        throw new Error(`Zalo API error [${res.data.error_code}]: ${res.data.description}`);
      }
      this.connLogger.log(`Zalo webhook registered: ${webhookUrl}`);
    }
  }

  async softDelete(id: string, context: RequestContext): Promise<any> {
    const result = await super.softDelete(id, context);
    this.publishChanged({ connectionId: id, action: 'deleted' });
    return result;
  }

  async findByIdInternal(id: string): Promise<Connection | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model.findOne({ _id: new Types.ObjectId(id), isDeleted: false }).exec();
  }

  async getActiveConnections(): Promise<Connection[]> {
    return this.model.find({ status: 'active', isDeleted: false }).exec();
  }

  async getConnectionById(id: string): Promise<Connection | null> {
    return this.model.findOne({ _id: new Types.ObjectId(id), isDeleted: false }).exec();
  }

  async setStatus(
    id: string,
    status: 'active' | 'inactive' | 'error',
    context: RequestContext,
  ): Promise<Connection> {
    const connection = await this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), isDeleted: false },
        { status, updatedBy: context.userId },
        { new: true },
      )
      .exec();

    if (!connection) {
      throw new NotFoundException(`Connection ${id} not found`);
    }

    this.publishChanged({ connectionId: id, action: 'status_changed', status });
    return connection;
  }

  async addRoute(id: string, route: any, context: RequestContext): Promise<Connection> {
    const connection = await this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), isDeleted: false },
        { $push: { routes: route }, updatedBy: context.userId },
        { new: true },
      )
      .exec();

    if (!connection) {
      throw new NotFoundException(`Connection ${id} not found`);
    }

    this.publishChanged({ connectionId: id, action: 'route_changed', status: connection.status });
    return connection;
  }

  async updateRoute(
    id: string,
    routeIndex: number,
    route: any,
    context: RequestContext,
  ): Promise<Connection> {
    const connection = await this.model
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
      .exec();

    if (!connection) {
      throw new NotFoundException(`Connection ${id} not found`);
    }

    if (routeIndex < 0 || routeIndex >= connection.routes.length) {
      throw new NotFoundException(`Route at index ${routeIndex} not found`);
    }

    connection.routes[routeIndex] = { ...connection.routes[routeIndex], ...route };
    (connection as any).updatedBy = context.userId;
    (connection as any).markModified('routes');
    await (connection as any).save();

    this.publishChanged({ connectionId: id, action: 'route_changed', status: connection.status });
    return connection;
  }

  async addLog(
    id: string,
    level: ConnectionLogLevel,
    message: string,
    data?: Record<string, any>,
  ): Promise<void> {
    await this.model.updateOne(
      { _id: new Types.ObjectId(id), isDeleted: false },
      {
        $push: {
          logs: {
            $each: [{ level, message, time: new Date(), data }],
            $slice: -200,
          },
        },
      },
    );
  }

  async getLogs(id: string, context: RequestContext): Promise<ConnectionLog[]> {
    const connection = await this.model
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false, 'owner.orgId': context.orgId })
      .select('+logs')
      .exec();

    if (!connection) {
      throw new NotFoundException(`Connection ${id} not found`);
    }

    return connection.logs ?? [];
  }

  async removeRoute(id: string, routeIndex: number, context: RequestContext): Promise<Connection> {
    const connection = await this.model
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
      .exec();

    if (!connection) {
      throw new NotFoundException(`Connection ${id} not found`);
    }

    connection.routes.splice(routeIndex, 1);
    (connection as any).updatedBy = context.userId;
    await (connection as any).save();

    this.publishChanged({ connectionId: id, action: 'route_changed', status: connection.status });
    return connection;
  }
}
