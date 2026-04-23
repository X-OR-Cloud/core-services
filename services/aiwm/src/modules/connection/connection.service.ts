import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Redis from 'ioredis';
import axios from 'axios';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Connection, ConnectionLog, ConnectionLogLevel } from './connection.schema';
import { redisConfig } from '../../config/redis.config';

const ZALO_API_BASE = 'https://bot-api.zaloplatforms.com/bot';
const AIWM_BASE_URL = process.env.AIWM_SERVICE_URL ?? 'http://localhost:3003';

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

  private async _syncZaloWebhook(connection: any): Promise<void> {
    const botToken: string = connection.config?.botToken;
    const secretToken: string | undefined = connection.config?.zaloSecretToken;
    const usePolling = connection.config?.pollingMode !== false;

    if (usePolling) {
      // Switch to polling → remove webhook from Zalo
      const res = await axios.post<{ ok: boolean; description?: string; error_code?: number }>(
        `${ZALO_API_BASE}${botToken}/deleteWebhook`,
        {},
        { headers: { 'Content-Type': 'application/json' } },
      );
      if (!res.data.ok) {
        throw new Error(`Zalo API error [${res.data.error_code}]: ${res.data.description}`);
      }
      this.connLogger.log(`Zalo webhook removed for connection ${String(connection._id)}`);
    } else {
      // Switch to webhook → register webhook URL on Zalo
      const webhookUrl = `${AIWM_BASE_URL}/connections/${String(connection._id)}/webhook`;
      const res = await axios.post<{ ok: boolean; result?: { url: string }; description?: string; error_code?: number }>(
        `${ZALO_API_BASE}${botToken}/setWebhook`,
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
