import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Connection } from './connection.schema';

@Injectable()
export class ConnectionService extends BaseService<Connection> {
  constructor(
    @InjectModel(Connection.name)
    connectionModel: Model<Connection>,
  ) {
    super(connectionModel);
  }

  async findAll(
    options: FindManyOptions,
    context: RequestContext,
  ): Promise<FindManyResult<Connection>> {
    options.selectFields = ['-config', '-routes'];
    return super.findAll(options, context);
  }

  async getActiveConnections(): Promise<Connection[]> {
    return this.model.find({ status: 'active', isDeleted: false }).exec();
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

    return connection;
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

    return connection;
  }
}
