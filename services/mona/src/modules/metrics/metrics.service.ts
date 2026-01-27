import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MetricData, MetricDataDocument, AggregationInterval } from './metrics.schema';
import {
  PushNodeMetricsDto,
  PushResourceMetricsDto,
  QueryMetricsDto,
  QueryMultipleMetricsDto,
} from './metrics.dto';
import { RequestContext } from '@hydrabyte/shared';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    @InjectModel(MetricData.name) private metricDataModel: Model<MetricData>,
  ) {}

  // ============= Push Methods =============

  /**
   * Push node metrics
   */
  async pushNodeMetrics(
    dto: PushNodeMetricsDto,
    context: RequestContext,
  ): Promise<MetricDataDocument> {
    // Validate nodeId ownership (nodeId in JWT must match nodeId in request)
    if (dto.nodeId && dto.nodeId !== dto.nodeId) {
      throw new ForbiddenException('Node can only push its own metrics');
    }

    // Build metrics object from DTO
    const metricsData = {
      cpu: dto.cpu,
      memory: dto.memory,
      disk: dto.disk,
      network: dto.network,
      gpu: dto.gpu,
      status: dto.status,
      websocketConnected: dto.websocketConnected,
      uptime: dto.uptime,
    };

    // Create metric document
    const metricDoc = new this.metricDataModel({
      type: 'node',
      entityType: 'node',
      entityId: dto.nodeId,
      timestamp: new Date(dto.timestamp),
      interval: dto.interval || AggregationInterval.ONE_MIN,
      systemInfo: dto.systemInfo,
      metrics: metricsData,
      owner: {
        orgId: context.orgId || '',
        userId: '',
        groupId: '',
      },
      createdBy: {
        userId: '',
        orgId: context.orgId || '',
        role: '',
        email: '',
        ipAddress: '',
      },
      updatedBy: {
        userId: '',
        orgId: context.orgId || '',
        role: '',
        email: '',
        ipAddress: '',
      },
    });

    const saved = await metricDoc.save();
    this.logger.log(`Node metrics pushed: nodeId=${dto.nodeId}`);
    return saved;
  }

  /**
   * Push resource metrics
   */
  async pushResourceMetrics(
    dto: PushResourceMetricsDto,
    context: RequestContext,
  ): Promise<MetricDataDocument> {
    // Build metrics object from DTO
    const metricsData = {
      containerId: dto.containerId,
      vmId: dto.vmId,
      resourceType: dto.resourceType,
      cpu: dto.cpu,
      memory: dto.memory,
      network: dto.network,
      disk: dto.disk,
      restartCount: dto.restartCount,
      uptime: dto.uptime,
      status: dto.status,
      exitCode: dto.exitCode,
      oomKilled: dto.oomKilled,
    };

    // Create metric document
    const metricDoc = new this.metricDataModel({
      type: 'resource',
      entityType: 'resource',
      entityId: dto.resourceId,
      timestamp: new Date(dto.timestamp),
      interval: dto.interval || AggregationInterval.FIVE_MIN,
      metrics: metricsData,
      owner: {
        orgId: context.orgId || '',
        userId: '',
        groupId: '',
      },
      createdBy: {
        userId: '',
        orgId: context.orgId || '',
        role: '',
        email: '',
        ipAddress: '',
      },
      updatedBy: {
        userId: '',
        orgId: context.orgId || '',
        role: '',
        email: '',
        ipAddress: '',
      },
    });

    const saved = await metricDoc.save();
    this.logger.log(`Resource metrics pushed: resourceId=${dto.resourceId}`);
    return saved;
  }

  // ============= Query Methods =============

  /**
   * Query node metrics by time range
   */
  async queryNodeMetrics(
    nodeId: string,
    query: QueryMetricsDto,
    context: RequestContext,
  ) {
    const filter: any = {
      type: 'node',
      entityId: nodeId,
      timestamp: {
        $gte: new Date(query.startTime),
        $lte: new Date(query.endTime),
      },
    };

    // Add orgId filter for scoped access
    if (context.orgId) {
      filter['owner.orgId'] = context.orgId;
    }

    // Add interval filter if specified
    if (query.interval) {
      filter.interval = query.interval;
    }

    // Build projection for specific fields
    let projection: any = {
      _id: 1,
      type: 1,
      entityId: 1,
      timestamp: 1,
      interval: 1,
      metrics: 1,
      createdAt: 1,
    };

    // If specific fields requested, project only those
    if (query.fields) {
      const requestedFields = query.fields.split(',').map((f) => f.trim());
      projection = {
        _id: 1,
        type: 1,
        entityId: 1,
        timestamp: 1,
        interval: 1,
        createdAt: 1,
      };
      requestedFields.forEach((field) => {
        projection[`metrics.${field}`] = 1;
      });
    }

    const metrics = await this.metricDataModel
      .find(filter, projection)
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    this.logger.log(
      `Queried node metrics: nodeId=${nodeId}, count=${metrics.length}`,
    );

    return {
      success: true,
      data: {
        nodeId,
        interval: query.interval || 'all',
        startTime: query.startTime,
        endTime: query.endTime,
        count: metrics.length,
        metrics: metrics.map((m) => ({
          timestamp: m.timestamp,
          interval: m.interval,
          data: m.metrics,
        })),
      },
    };
  }

  /**
   * Query resource metrics by time range
   */
  async queryResourceMetrics(
    resourceId: string,
    query: QueryMetricsDto,
    context: RequestContext,
  ) {
    const filter: any = {
      type: 'resource',
      entityId: resourceId,
      timestamp: {
        $gte: new Date(query.startTime),
        $lte: new Date(query.endTime),
      },
    };

    // Add orgId filter for scoped access
    if (context.orgId) {
      filter['owner.orgId'] = context.orgId;
    }

    // Add interval filter if specified
    if (query.interval) {
      filter.interval = query.interval;
    }

    // Build projection for specific fields
    let projection: any = {
      _id: 1,
      type: 1,
      entityId: 1,
      timestamp: 1,
      interval: 1,
      metrics: 1,
      createdAt: 1,
    };

    // If specific fields requested, project only those
    if (query.fields) {
      const requestedFields = query.fields.split(',').map((f) => f.trim());
      projection = {
        _id: 1,
        type: 1,
        entityId: 1,
        timestamp: 1,
        interval: 1,
        createdAt: 1,
      };
      requestedFields.forEach((field) => {
        projection[`metrics.${field}`] = 1;
      });
    }

    const metrics = await this.metricDataModel
      .find(filter, projection)
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    this.logger.log(
      `Queried resource metrics: resourceId=${resourceId}, count=${metrics.length}`,
    );

    return {
      success: true,
      data: {
        resourceId,
        interval: query.interval || 'all',
        startTime: query.startTime,
        endTime: query.endTime,
        count: metrics.length,
        metrics: metrics.map((m) => ({
          timestamp: m.timestamp,
          interval: m.interval,
          data: m.metrics,
        })),
      },
    };
  }

  /**
   * Query multiple entities metrics
   */
  async queryMultipleMetrics(
    query: QueryMultipleMetricsDto,
    context: RequestContext,
  ) {
    const entityIds = query.entityIds.split(',').map((id) => id.trim());

    const filter: any = {
      type: query.type,
      entityId: { $in: entityIds },
      timestamp: {
        $gte: new Date(query.startTime),
        $lte: new Date(query.endTime),
      },
    };

    // Add orgId filter for scoped access
    if (context.orgId) {
      filter['owner.orgId'] = context.orgId;
    }

    // Add interval filter if specified
    if (query.interval) {
      filter.interval = query.interval;
    }

    const metrics = await this.metricDataModel
      .find(filter)
      .sort({ entityId: 1, timestamp: -1 })
      .lean()
      .exec();

    // Group by entityId
    const grouped: Record<string, any[]> = {};
    metrics.forEach((m) => {
      if (!grouped[m.entityId]) {
        grouped[m.entityId] = [];
      }
      grouped[m.entityId].push({
        timestamp: m.timestamp,
        interval: m.interval,
        data: m.metrics,
      });
    });

    this.logger.log(
      `Queried multiple metrics: type=${query.type}, count=${metrics.length}`,
    );

    return {
      success: true,
      data: {
        type: query.type,
        startTime: query.startTime,
        endTime: query.endTime,
        entityCount: entityIds.length,
        totalMetrics: metrics.length,
        metrics: grouped,
      },
    };
  }

  /**
   * Get latest metrics for an entity
   */
  async getLatestMetrics(
    type: string,
    entityId: string,
    context: RequestContext,
  ) {
    const filter: any = {
      type,
      entityId,
    };

    // Add orgId filter for scoped access
    if (context.orgId) {
      filter['owner.orgId'] = context.orgId;
    }

    const latest = await this.metricDataModel
      .findOne(filter)
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    if (!latest) {
      throw new NotFoundException(
        `No metrics found for ${type}/${entityId}`,
      );
    }

    this.logger.log(`Retrieved latest metrics: type=${type}, entityId=${entityId}`);

    return {
      success: true,
      data: {
        type,
        entityId,
        timestamp: latest.timestamp,
        interval: latest.interval,
        data: latest.metrics,
      },
    };
  }
}
