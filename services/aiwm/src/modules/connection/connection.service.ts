import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Connection, ConnectionDocument } from './connection.schema';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';

@Injectable()
export class ConnectionService extends BaseService<Connection> {
  protected readonly logger = new Logger(ConnectionService.name);

  constructor(
    @InjectModel(Connection.name)
    connectionModel: Model<ConnectionDocument>,
  ) {
    super(connectionModel as any);
  }

  async createConnection(dto: CreateConnectionDto, context: RequestContext): Promise<Connection> {
    const connection = await this.create(dto, context);
    this.logger.log(`Created connection ${(connection as any)._id} [${dto.provider}] "${dto.name}"`);
    return connection as Connection;
  }

  async updateConnection(
    id: string,
    dto: UpdateConnectionDto,
    context: RequestContext,
  ): Promise<Connection> {
    const connection = await this.update(new Types.ObjectId(id) as any, dto as any, context);
    this.logger.log(`Updated connection ${id}`);
    return connection as Connection;
  }

  async getOrgConnections(orgId: string, context: RequestContext): Promise<Connection[]> {
    return this.model
      .find({ 'owner.orgId': orgId, isDeleted: false })
      .sort({ createdAt: -1 })
      .exec();
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

    this.logger.log(`Connection ${id} status → ${status}`);
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
