import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Model } from 'mongoose';
import { Queue } from 'bullmq';
import { MetricData, AggregationInterval } from './metrics.schema';
import { AGGREGATION_WINDOWS, AGGREGATION_FUNCTIONS } from './metrics.constants';

@Injectable()
export class MetricsAggregationService {
  private readonly logger = new Logger(MetricsAggregationService.name);

  constructor(
    @InjectModel(MetricData.name) private metricDataModel: Model<MetricData>,
    @InjectQueue('metrics-aggregation') private aggregationQueue: Queue,
  ) {}

  /**
   * Trigger aggregation from 1min to 5min
   */
  async aggregate1minTo5min() {
    const config = AGGREGATION_WINDOWS['1min-to-5min'];
    const endTime = new Date();
    const startTime = new Date(
      endTime.getTime() - config.lookbackMinutes * 60 * 1000,
    );

    this.logger.log(
      `Starting 1min->5min aggregation: ${startTime.toISOString()} to ${endTime.toISOString()}`,
    );

    // Find all unique entity IDs in the time range
    const entities = await this.metricDataModel.distinct('entityId', {
      interval: config.sourceInterval,
      timestamp: { $gte: startTime, $lte: endTime },
    });

    this.logger.log(`Found ${entities.length} entities to aggregate`);

    // Queue aggregation job for each entity
    for (const entityId of entities) {
      await this.aggregationQueue.add('aggregate-entity', {
        entityId,
        sourceInterval: config.sourceInterval,
        targetInterval: config.targetInterval,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });
    }

    return {
      success: true,
      message: `Queued aggregation for ${entities.length} entities`,
      data: {
        sourceInterval: config.sourceInterval,
        targetInterval: config.targetInterval,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        entityCount: entities.length,
      },
    };
  }

  /**
   * Trigger aggregation from 5min to 1hour
   */
  async aggregate5minTo1hour() {
    const config = AGGREGATION_WINDOWS['5min-to-1hour'];
    const endTime = new Date();
    const startTime = new Date(
      endTime.getTime() - config.lookbackMinutes * 60 * 1000,
    );

    this.logger.log(
      `Starting 5min->1hour aggregation: ${startTime.toISOString()} to ${endTime.toISOString()}`,
    );

    const entities = await this.metricDataModel.distinct('entityId', {
      interval: config.sourceInterval,
      timestamp: { $gte: startTime, $lte: endTime },
    });

    this.logger.log(`Found ${entities.length} entities to aggregate`);

    for (const entityId of entities) {
      await this.aggregationQueue.add('aggregate-entity', {
        entityId,
        sourceInterval: config.sourceInterval,
        targetInterval: config.targetInterval,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });
    }

    return {
      success: true,
      message: `Queued aggregation for ${entities.length} entities`,
      data: {
        sourceInterval: config.sourceInterval,
        targetInterval: config.targetInterval,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        entityCount: entities.length,
      },
    };
  }

  /**
   * Trigger aggregation from 1hour to 1day
   */
  async aggregate1hourTo1day() {
    const config = AGGREGATION_WINDOWS['1hour-to-1day'];
    const endTime = new Date();
    const startTime = new Date(
      endTime.getTime() - config.lookbackMinutes * 60 * 1000,
    );

    this.logger.log(
      `Starting 1hour->1day aggregation: ${startTime.toISOString()} to ${endTime.toISOString()}`,
    );

    const entities = await this.metricDataModel.distinct('entityId', {
      interval: config.sourceInterval,
      timestamp: { $gte: startTime, $lte: endTime },
    });

    this.logger.log(`Found ${entities.length} entities to aggregate`);

    for (const entityId of entities) {
      await this.aggregationQueue.add('aggregate-entity', {
        entityId,
        sourceInterval: config.sourceInterval,
        targetInterval: config.targetInterval,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });
    }

    return {
      success: true,
      message: `Queued aggregation for ${entities.length} entities`,
      data: {
        sourceInterval: config.sourceInterval,
        targetInterval: config.targetInterval,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        entityCount: entities.length,
      },
    };
  }

  /**
   * Perform aggregation for a single entity
   * Called by BullMQ worker
   */
  async aggregateEntityMetrics(
    entityId: string,
    sourceInterval: string,
    targetInterval: string,
    startTime: string,
    endTime: string,
  ) {
    const start = new Date(startTime);
    const end = new Date(endTime);

    // Fetch source metrics
    const sourceMetrics = await this.metricDataModel
      .find({
        entityId,
        interval: sourceInterval,
        timestamp: { $gte: start, $lte: end },
      })
      .sort({ timestamp: 1 })
      .lean()
      .exec();

    if (sourceMetrics.length === 0) {
      this.logger.log(
        `No source metrics found for entity ${entityId} in interval ${sourceInterval}`,
      );
      return;
    }

    // Group metrics by time buckets based on target interval
    const buckets = this.groupMetricsIntoBuckets(
      sourceMetrics,
      targetInterval,
    );

    // Aggregate each bucket and save
    for (const [bucketTime, metrics] of Object.entries(buckets)) {
      const aggregated = this.aggregateMetricsBucket(metrics as any[]);

      // Check if aggregated metric already exists
      const existing = await this.metricDataModel.findOne({
        entityId,
        interval: targetInterval,
        timestamp: new Date(bucketTime),
      });

      if (existing) {
        this.logger.log(
          `Aggregated metric already exists for ${entityId} at ${bucketTime}, skipping`,
        );
        continue;
      }

      // Create new aggregated metric
      const firstMetric = (metrics as any[])[0];
      const aggregatedDoc = new this.metricDataModel({
        type: firstMetric.type,
        entityType: firstMetric.entityType,
        entityId: entityId,
        timestamp: new Date(bucketTime),
        interval: targetInterval,
        systemInfo: firstMetric.systemInfo,
        metrics: aggregated,
        owner: firstMetric.owner,
        createdBy: firstMetric.createdBy,
        updatedBy: firstMetric.updatedBy,
      });

      await aggregatedDoc.save();
      this.logger.log(
        `Saved aggregated metric: ${entityId} at ${bucketTime} (${targetInterval})`,
      );
    }
  }

  /**
   * Group metrics into time buckets
   */
  private groupMetricsIntoBuckets(metrics: any[], targetInterval: string) {
    const buckets: Record<string, any[]> = {};
    const bucketSize = this.getBucketSizeMs(targetInterval);

    for (const metric of metrics) {
      const timestamp = new Date(metric.timestamp).getTime();
      const bucketTime = Math.floor(timestamp / bucketSize) * bucketSize;
      const bucketKey = new Date(bucketTime).toISOString();

      if (!buckets[bucketKey]) {
        buckets[bucketKey] = [];
      }
      buckets[bucketKey].push(metric);
    }

    return buckets;
  }

  /**
   * Get bucket size in milliseconds
   */
  private getBucketSizeMs(interval: string): number {
    switch (interval) {
      case AggregationInterval.FIVE_MIN:
        return 5 * 60 * 1000;
      case AggregationInterval.ONE_HOUR:
        return 60 * 60 * 1000;
      case AggregationInterval.ONE_DAY:
        return 24 * 60 * 60 * 1000;
      default:
        return 60 * 1000;
    }
  }

  /**
   * Aggregate metrics bucket using averaging
   */
  private aggregateMetricsBucket(metrics: any[]) {
    if (metrics.length === 0) return {};
    if (metrics.length === 1) return metrics[0].metrics;

    const aggregated: any = {};
    const metricsData = metrics.map((m) => m.metrics);

    // Deep merge and average numeric fields
    this.deepAverageMetrics(metricsData, aggregated);

    return aggregated;
  }

  /**
   * Deep average numeric fields in metrics
   */
  private deepAverageMetrics(metricsArray: any[], result: any) {
    if (metricsArray.length === 0) return;

    const keys = new Set<string>();
    metricsArray.forEach((m) => {
      if (m && typeof m === 'object') {
        Object.keys(m).forEach((k) => keys.add(k));
      }
    });

    for (const key of keys) {
      const values = metricsArray
        .map((m) => m[key])
        .filter((v) => v !== undefined && v !== null);

      if (values.length === 0) continue;

      const firstValue = values[0];

      if (typeof firstValue === 'number') {
        // Average numbers
        result[key] = values.reduce((a, b) => a + b, 0) / values.length;
      } else if (Array.isArray(firstValue)) {
        // Handle arrays (e.g., loadAverage, gpu array)
        if (typeof firstValue[0] === 'number') {
          // Array of numbers - average each element
          result[key] = firstValue.map((_, idx) => {
            const nums = values
              .map((v) => v[idx])
              .filter((n) => typeof n === 'number');
            return nums.reduce((a, b) => a + b, 0) / nums.length;
          });
        } else {
          // Array of objects - take first or aggregate recursively
          result[key] = values[0];
        }
      } else if (typeof firstValue === 'object') {
        // Recursively aggregate nested objects
        result[key] = {};
        this.deepAverageMetrics(values, result[key]);
      } else {
        // String, boolean, etc - take first value
        result[key] = firstValue;
      }
    }
  }

  /**
   * Cleanup old metrics based on retention policy
   */
  async cleanupOldMetrics() {
    const now = new Date();
    const results: any = {};

    // 1min metrics: keep 7 days
    const cutoff1min = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const deleted1min = await this.metricDataModel.deleteMany({
      interval: AggregationInterval.ONE_MIN,
      timestamp: { $lt: cutoff1min },
    });
    results['1min'] = deleted1min.deletedCount;

    // 5min metrics: keep 30 days
    const cutoff5min = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const deleted5min = await this.metricDataModel.deleteMany({
      interval: AggregationInterval.FIVE_MIN,
      timestamp: { $lt: cutoff5min },
    });
    results['5min'] = deleted5min.deletedCount;

    // 1hour metrics: keep 90 days
    const cutoff1hour = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const deleted1hour = await this.metricDataModel.deleteMany({
      interval: AggregationInterval.ONE_HOUR,
      timestamp: { $lt: cutoff1hour },
    });
    results['1hour'] = deleted1hour.deletedCount;

    // 1day metrics: keep 365 days (handled by TTL index)

    this.logger.log(
      `Cleanup completed: ${JSON.stringify(results)} metrics deleted`,
    );

    return {
      success: true,
      message: 'Old metrics cleaned up successfully',
      data: results,
    };
  }
}
