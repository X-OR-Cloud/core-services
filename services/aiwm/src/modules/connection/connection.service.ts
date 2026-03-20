import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Redis from 'ioredis';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Connection, ConnectionLog, ConnectionLogLevel } from './connection.schema';
import { redisConfig } from '../../config/redis.config';

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
    options.selectFields = ['-config', '-routes'];
    return super.findAll(options, context);
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
    const connection = await super.update(id, dto, context);
    this.publishChanged({
      connectionId: id,
      action: 'updated',
      status: (connection as any).status,
    });
    return connection;
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
