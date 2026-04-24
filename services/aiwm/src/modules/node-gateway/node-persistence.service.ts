import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Node } from '../node/node.schema';

@Injectable()
export class NodePersistenceService {
  private readonly logger = new Logger(NodePersistenceService.name);

  constructor(@InjectModel(Node.name) private readonly nodeModel: Model<Node>) {}

  async findById(nodeId: string): Promise<Node | null> {
    return this.nodeModel
      .findOne({ _id: new Types.ObjectId(nodeId), isDeleted: { $ne: true } })
      .exec();
  }

  async updateStatus(nodeId: string, status: string): Promise<void> {
    const update: Record<string, unknown> = { status, updatedAt: new Date() };
    if (status === 'online') {
      update.lastHeartbeat = new Date();
    }
    await this.nodeModel.updateOne(
      { _id: new Types.ObjectId(nodeId) },
      { $set: update },
    );
    this.logger.log(`Node ${nodeId} status → ${status}`);
  }

  async updateNodeInfo(nodeId: string, info: any): Promise<void> {
    await this.nodeModel.updateOne(
      { _id: new Types.ObjectId(nodeId) },
      { $set: { ...info, updatedAt: new Date() } },
    );
    this.logger.log(`Node ${nodeId} info updated`);
  }

  async updateHeartbeat(nodeId: string, heartbeatData: any): Promise<void> {
    const update: Record<string, unknown> = {
      status: heartbeatData.status,
      uptimeSeconds: heartbeatData.uptimeSeconds,
      cpuUsage: heartbeatData.cpuUsage,
      ramUsage: heartbeatData.ramUsage,
      lastHeartbeat: new Date(),
      updatedAt: new Date(),
    };
    if (heartbeatData.daemonVersion) {
      update.daemonVersion = heartbeatData.daemonVersion;
    }
    await this.nodeModel.updateOne(
      { _id: new Types.ObjectId(nodeId) },
      { $set: update },
    );
  }

  async storeMetrics(nodeId: string, _metrics: any): Promise<void> {
    await this.nodeModel.updateOne(
      { _id: new Types.ObjectId(nodeId) },
      { $set: { lastMetricsAt: new Date(), updatedAt: new Date() } },
    );
    this.logger.debug(`Metrics stored for node ${nodeId}`);
  }
}
