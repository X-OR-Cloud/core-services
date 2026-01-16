# Metrics Module - Aggregation & Retention Strategy

**Version**: 2.0
**Date**: 2026-01-14
**Status**: Updated for v2.0 Schema

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Aggregation Strategy](#aggregation-strategy)
3. [Data Retention Policy](#data-retention-policy)
4. [Implementation Details](#implementation-details)
5. [Performance Optimization](#performance-optimization)

---

## 1. Overview

### 1.1 Purpose

Aggregation và retention strategy giải quyết vấn đề:
- ✅ **Storage explosion**: Giảm storage growth bằng aggregation
- ✅ **Query performance**: Fast queries cho long time ranges
- ✅ **Data lifecycle**: Automatic cleanup của old data
- ✅ **Historical analysis**: Preserve long-term trends với daily aggregates

### 1.2 Design Principles

1. **Lossy Compression**: Raw data → Aggregated data (averages, sums)
2. **Multi-level Aggregation**: 1min → 5min → 1hour → 1day
3. **Progressive Retention**: Raw data short retention, aggregated data long retention
4. **Automatic Cleanup**: TTL indexes for hands-off data lifecycle
5. **Query Optimization**: Pre-aggregated data for fast queries

---

## 2. Aggregation Strategy

### 2.1 Aggregation Levels

```
Raw Data (1min)
      ↓
   Aggregate to 5min
      ↓
   Aggregate to 1hour
      ↓
   Aggregate to 1day
```

| Level | Interval | Source | Aggregation Method | Retention |
|-------|----------|--------|-------------------|-----------|
| **Level 0** | 1min | Push API | Raw data | 7 days |
| **Level 1** | 5min | Level 0 | Average of 5 × 1min | 30 days |
| **Level 2** | 1hour | Level 1 | Average of 12 × 5min | 90 days |
| **Level 3** | 1day | Level 2 | Average of 24 × 1hour | 365 days |

### 2.2 Aggregation Functions

Different metrics sử dụng different aggregation functions:

| Metric Type | Aggregation Function | Rationale |
|-------------|---------------------|-----------|
| **Percentages** (CPU, GPU utilization) | `avg()` | Average usage over period |
| **Bytes** (Memory, Disk) | `avg()` | Average consumption |
| **Rates** (bytes/sec, req/sec) | `avg()` | Average rate |
| **Counts** (requests, tokens) | `sum()` | Total count in period |
| **Costs** | `sum()` | Total cost in period |
| **Latencies** | `avg()` for avg, `max()` for max | Preserve both |
| **Status** | `mode()` | Most frequent status |
| **Temperatures** | `avg()`, `max()` | Track both average và peak |

### 2.3 Aggregation Schedule

**Cron Jobs** (BullMQ):

```typescript
// Aggregate 1min → 5min (every 5 minutes)
@Cron('*/5 * * * *')
async aggregate1minTo5min() {
  // Aggregate data from 5 minutes ago
  const endTime = Date.now() - 300000; // 5 min ago
  const startTime = endTime - 300000; // 10 min ago
  await this.aggregateMetrics('1min', '5min', startTime, endTime);
}

// Aggregate 5min → 1hour (every hour)
@Cron('5 * * * *')
async aggregate5minTo1hour() {
  // Aggregate data from 1 hour ago
  const endTime = Date.now() - 3600000; // 1 hour ago
  const startTime = endTime - 3600000; // 2 hours ago
  await this.aggregateMetrics('5min', '1hour', startTime, endTime);
}

// Aggregate 1hour → 1day (daily at 00:05)
@Cron('5 0 * * *')
async aggregate1hourTo1day() {
  // Aggregate data from yesterday
  const endTime = Date.now() - 86400000; // 1 day ago
  const startTime = endTime - 86400000; // 2 days ago
  await this.aggregateMetrics('1hour', '1day', startTime, endTime);
}
```

### 2.4 Aggregation Algorithm

**Example: Aggregate Node Metrics (1min → 5min)**

```typescript
async aggregateNodeMetrics(
  nodeId: string,
  startTime: Date,
  endTime: Date,
  sourceInterval: '1min',
  targetInterval: '5min'
): Promise<MetricSnapshot> {
  // 1. Fetch source metrics
  const sourceMetrics = await this.metricModel.find({
    type: 'node',
    entityId: nodeId,
    interval: sourceInterval,
    timestamp: { $gte: startTime, $lt: endTime },
  });

  if (sourceMetrics.length === 0) {
    throw new Error('No source metrics found for aggregation');
  }

  // 2. Aggregate CPU metrics
  const cpuUsageValues = sourceMetrics.map(m => m.metrics.cpu.usage);
  const cpuUsageAvg = this.average(cpuUsageValues);

  const loadAverageValues = sourceMetrics.map(m => m.metrics.cpu.loadAverage);
  const loadAverageAvg = [
    this.average(loadAverageValues.map(la => la[0])),
    this.average(loadAverageValues.map(la => la[1])),
    this.average(loadAverageValues.map(la => la[2])),
  ];

  // 3. Aggregate Memory metrics
  const memoryUsedValues = sourceMetrics.map(m => m.metrics.memory.used);
  const memoryUsedAvg = this.average(memoryUsedValues);

  const memoryUsagePercentValues = sourceMetrics.map(m => m.metrics.memory.usagePercent);
  const memoryUsagePercentAvg = this.average(memoryUsagePercentValues);

  // 4. Aggregate Disk metrics
  const diskReadBytesValues = sourceMetrics.map(m => m.metrics.disk.readBytesPerSec);
  const diskReadBytesAvg = this.average(diskReadBytesValues);

  // 5. Aggregate Network metrics
  const networkRxBytesValues = sourceMetrics.map(m => m.metrics.network.rxBytesPerSec);
  const networkRxBytesAvg = this.average(networkRxBytesValues);

  // 6. Aggregate GPU metrics (per device)
  const gpuDevices = sourceMetrics[0].metrics.gpu || [];
  const aggregatedGpus = gpuDevices.map((_, index) => {
    const utilizationValues = sourceMetrics
      .map(m => m.metrics.gpu?.[index]?.utilization)
      .filter(v => v !== undefined);

    const tempValues = sourceMetrics
      .map(m => m.metrics.gpu?.[index]?.temperature)
      .filter(v => v !== undefined);

    return {
      deviceId: gpuDevices[index].deviceId,
      model: gpuDevices[index].model,
      utilization: this.average(utilizationValues),
      memoryUsed: this.average(
        sourceMetrics.map(m => m.metrics.gpu?.[index]?.memoryUsed).filter(v => v !== undefined)
      ),
      memoryTotal: gpuDevices[index].memoryTotal,
      memoryPercent: this.average(
        sourceMetrics.map(m => m.metrics.gpu?.[index]?.memoryPercent).filter(v => v !== undefined)
      ),
      temperature: this.average(tempValues),
      powerDraw: this.average(
        sourceMetrics.map(m => m.metrics.gpu?.[index]?.powerDraw).filter(v => v !== undefined)
      ),
      fanSpeed: this.average(
        sourceMetrics.map(m => m.metrics.gpu?.[index]?.fanSpeed).filter(v => v !== undefined)
      ),
    };
  });

  // 7. Status aggregation (most frequent)
  const statusValues = sourceMetrics.map(m => m.metrics.status);
  const statusMode = this.mode(statusValues);

  // 8. Create aggregated metric
  const aggregatedMetric = new this.metricModel({
    type: 'node',
    entityType: 'node',
    entityId: nodeId,
    entityName: sourceMetrics[0].entityName,
    timestamp: startTime, // Start of aggregation window
    interval: targetInterval,

    metrics: {
      cpu: {
        usage: cpuUsageAvg,
        cores: sourceMetrics[0].metrics.cpu.cores,
        loadAverage: loadAverageAvg,
      },
      memory: {
        total: sourceMetrics[0].metrics.memory.total,
        used: memoryUsedAvg,
        free: sourceMetrics[0].metrics.memory.total - memoryUsedAvg,
        cached: this.average(sourceMetrics.map(m => m.metrics.memory.cached)),
        usagePercent: memoryUsagePercentAvg,
      },
      disk: {
        total: sourceMetrics[0].metrics.disk.total,
        used: this.average(sourceMetrics.map(m => m.metrics.disk.used)),
        free: this.average(sourceMetrics.map(m => m.metrics.disk.free)),
        usagePercent: this.average(sourceMetrics.map(m => m.metrics.disk.usagePercent)),
        readBytesPerSec: diskReadBytesAvg,
        writeBytesPerSec: this.average(sourceMetrics.map(m => m.metrics.disk.writeBytesPerSec)),
        readOpsPerSec: this.average(sourceMetrics.map(m => m.metrics.disk.readOpsPerSec)),
        writeOpsPerSec: this.average(sourceMetrics.map(m => m.metrics.disk.writeOpsPerSec)),
      },
      network: {
        rxBytesPerSec: networkRxBytesAvg,
        txBytesPerSec: this.average(sourceMetrics.map(m => m.metrics.network.txBytesPerSec)),
        rxPacketsPerSec: this.average(sourceMetrics.map(m => m.metrics.network.rxPacketsPerSec)),
        txPacketsPerSec: this.average(sourceMetrics.map(m => m.metrics.network.txPacketsPerSec)),
        rxDropped: this.sum(sourceMetrics.map(m => m.metrics.network.rxDropped)),
        txDropped: this.sum(sourceMetrics.map(m => m.metrics.network.txDropped)),
      },
      gpu: aggregatedGpus,
      status: statusMode,
      websocketConnected: sourceMetrics[sourceMetrics.length - 1].metrics.websocketConnected,
      uptime: this.average(sourceMetrics.map(m => m.metrics.uptime)),
    },

    // Copy systemInfo from first metric (it's static)
    systemInfo: sourceMetrics[0].systemInfo,

    owner: sourceMetrics[0].owner,
    createdBy: 'system',
  });

  return aggregatedMetric.save();
}

// Helper functions
private average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

private sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

private mode<T>(values: T[]): T {
  const counts = new Map<T, number>();
  values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
  return Array.from(counts.entries()).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}
```

---

## 3. Data Retention Policy

### 3.1 Retention Rules

```typescript
export const RETENTION_POLICY = {
  '1min': 7 * 24 * 60 * 60, // 7 days in seconds
  '5min': 30 * 24 * 60 * 60, // 30 days
  '1hour': 90 * 24 * 60 * 60, // 90 days
  '1day': 365 * 24 * 60 * 60, // 365 days
};
```

### 3.2 TTL Index Configuration

MongoDB TTL indexes automatically delete expired documents:

```typescript
// In schema file
MetricSnapshotSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: 365 * 24 * 60 * 60, // 365 days max
    name: 'metrics_ttl_cleanup',
    partialFilterExpression: {
      interval: { $in: ['1min', '5min', '1hour', '1day'] },
    },
  }
);
```

**How TTL Works**:
- MongoDB checks TTL indexes every 60 seconds
- Documents where `timestamp + expireAfterSeconds < now` are deleted
- Deletion is automatic và background
- No application code needed

### 3.3 Manual Cleanup (Backup)

In case TTL index không work hoặc cần immediate cleanup:

```typescript
@Cron('0 2 * * *') // Daily at 2 AM
async cleanupExpiredMetrics() {
  const now = Date.now();

  // Cleanup 1min metrics older than 7 days
  await this.metricModel.deleteMany({
    interval: '1min',
    timestamp: { $lt: new Date(now - RETENTION_POLICY['1min'] * 1000) },
  });

  // Cleanup 5min metrics older than 30 days
  await this.metricModel.deleteMany({
    interval: '5min',
    timestamp: { $lt: new Date(now - RETENTION_POLICY['5min'] * 1000) },
  });

  // Cleanup 1hour metrics older than 90 days
  await this.metricModel.deleteMany({
    interval: '1hour',
    timestamp: { $lt: new Date(now - RETENTION_POLICY['1hour'] * 1000) },
  });

  // Cleanup 1day metrics older than 365 days
  await this.metricModel.deleteMany({
    interval: '1day',
    timestamp: { $lt: new Date(now - RETENTION_POLICY['1day'] * 1000) },
  });

  this.logger.log('Expired metrics cleaned up successfully');
}
```

### 3.4 Storage Lifecycle Diagram

```
Day 0 ─────────────► Day 7 ─────────────► Day 30 ───────────► Day 90 ───────────► Day 365
│                     │                    │                   │                    │
│ 1min raw data       │ Delete 1min        │                   │                    │
│ ↓ Aggregate         │                    │ Delete 5min       │                    │
│ 5min data           │ Keep 5min          │                   │ Delete 1hour       │
│ ↓ Aggregate         │                    │ Keep 1hour        │                    │
│ 1hour data          │                    │                   │ Keep 1day          │ Delete 1day
│ ↓ Aggregate         │                    │                   │                    │
│ 1day data           │                    │                   │                    │ Keep 1day
│                     │                    │                   │                    │
└─────────────────────┴────────────────────┴───────────────────┴────────────────────┴─────►
  Raw + Aggregated    Aggregated Only     1hour + 1day Only   1day Only              Gone
```

---

## 4. Implementation Details

### 4.1 Aggregation Worker Service

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { MetricSnapshot } from './metrics.schema';

@Injectable()
export class MetricsAggregationService {
  private readonly logger = new Logger(MetricsAggregationService.name);

  constructor(
    @InjectModel(MetricSnapshot.name)
    private readonly metricModel: Model<MetricSnapshot>
  ) {}

  /**
   * Aggregate 1min → 5min (every 5 minutes)
   */
  @Cron('*/5 * * * *')
  async aggregate1minTo5min() {
    this.logger.log('Starting 1min → 5min aggregation');

    try {
      const endTime = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
      const startTime = new Date(endTime.getTime() - 5 * 60 * 1000); // 10 min ago

      await this.aggregateAllEntities('node', '1min', '5min', startTime, endTime);
      await this.aggregateAllEntities('resource', '1min', '5min', startTime, endTime);
      await this.aggregateAllEntities('deployment', '1min', '5min', startTime, endTime);

      this.logger.log('Completed 1min → 5min aggregation');
    } catch (error) {
      this.logger.error('Failed to aggregate 1min → 5min:', error);
    }
  }

  /**
   * Aggregate 5min → 1hour (every hour at minute 5)
   */
  @Cron('5 * * * *')
  async aggregate5minTo1hour() {
    this.logger.log('Starting 5min → 1hour aggregation');

    try {
      const endTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      const startTime = new Date(endTime.getTime() - 60 * 60 * 1000); // 2 hours ago

      await this.aggregateAllEntities('node', '5min', '1hour', startTime, endTime);
      await this.aggregateAllEntities('resource', '5min', '1hour', startTime, endTime);
      await this.aggregateAllEntities('deployment', '5min', '1hour', startTime, endTime);

      this.logger.log('Completed 5min → 1hour aggregation');
    } catch (error) {
      this.logger.error('Failed to aggregate 5min → 1hour:', error);
    }
  }

  /**
   * Aggregate 1hour → 1day (daily at 00:05)
   */
  @Cron('5 0 * * *')
  async aggregate1hourTo1day() {
    this.logger.log('Starting 1hour → 1day aggregation');

    try {
      const endTime = new Date();
      endTime.setHours(0, 0, 0, 0); // Start of today
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // Start of yesterday

      await this.aggregateAllEntities('node', '1hour', '1day', startTime, endTime);
      await this.aggregateAllEntities('resource', '1hour', '1day', startTime, endTime);
      await this.aggregateAllEntities('deployment', '1hour', '1day', startTime, endTime);

      this.logger.log('Completed 1hour → 1day aggregation');
    } catch (error) {
      this.logger.error('Failed to aggregate 1hour → 1day:', error);
    }
  }

  /**
   * Aggregate all entities of a given type
   */
  private async aggregateAllEntities(
    metricType: string,
    sourceInterval: string,
    targetInterval: string,
    startTime: Date,
    endTime: Date
  ) {
    // Get distinct entity IDs
    const entityIds = await this.metricModel.distinct('entityId', {
      type: metricType,
      interval: sourceInterval,
      timestamp: { $gte: startTime, $lt: endTime },
    });

    this.logger.log(
      `Aggregating ${entityIds.length} ${metricType} entities from ${sourceInterval} to ${targetInterval}`
    );

    // Aggregate each entity
    for (const entityId of entityIds) {
      try {
        await this.aggregateEntity(
          metricType,
          entityId,
          sourceInterval,
          targetInterval,
          startTime,
          endTime
        );
      } catch (error) {
        this.logger.error(`Failed to aggregate ${metricType} ${entityId}:`, error);
      }
    }
  }

  /**
   * Aggregate a single entity
   */
  private async aggregateEntity(
    metricType: string,
    entityId: string,
    sourceInterval: string,
    targetInterval: string,
    startTime: Date,
    endTime: Date
  ) {
    // Implementation depends on metricType
    switch (metricType) {
      case 'node':
        return this.aggregateNodeMetrics(entityId, startTime, endTime, sourceInterval, targetInterval);
      case 'resource':
        return this.aggregateResourceMetrics(entityId, startTime, endTime, sourceInterval, targetInterval);
      case 'deployment':
        return this.aggregateDeploymentMetrics(entityId, startTime, endTime, sourceInterval, targetInterval);
      default:
        throw new Error(`Unknown metric type: ${metricType}`);
    }
  }

  // aggregateNodeMetrics, aggregateResourceMetrics, etc. implemented as shown earlier
}
```

### 4.2 Queue-Based Aggregation (Alternative)

For better reliability và scalability, use BullMQ:

```typescript
// metrics.aggregation.queue.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

interface AggregationJobData {
  metricType: 'node' | 'resource' | 'deployment';
  entityId: string;
  sourceInterval: string;
  targetInterval: string;
  startTime: Date;
  endTime: Date;
}

@Processor('metrics-aggregation')
export class MetricsAggregationProcessor extends WorkerHost {
  async process(job: Job<AggregationJobData>): Promise<void> {
    const { metricType, entityId, sourceInterval, targetInterval, startTime, endTime } = job.data;

    await this.aggregateEntity(metricType, entityId, sourceInterval, targetInterval, startTime, endTime);
  }
}
```

---

## 5. Performance Optimization

### 5.1 Aggregation Pipeline (MongoDB)

Use MongoDB aggregation pipeline for efficient aggregation:

```typescript
async aggregateNodeMetricsWithPipeline(
  nodeId: string,
  startTime: Date,
  endTime: Date,
  sourceInterval: string,
  targetInterval: string
) {
  const aggregated = await this.metricModel.aggregate([
    // 1. Match source metrics
    {
      $match: {
        type: 'node',
        entityId: nodeId,
        interval: sourceInterval,
        timestamp: { $gte: startTime, $lt: endTime },
      },
    },

    // 2. Group and aggregate
    {
      $group: {
        _id: {
          entityId: '$entityId',
          interval: targetInterval,
          timestamp: startTime,
        },
        // CPU aggregations
        cpuUsageAvg: { $avg: '$metrics.cpu.usage' },
        cpuCores: { $first: '$metrics.cpu.cores' },
        loadAverage0: { $avg: { $arrayElemAt: ['$metrics.cpu.loadAverage', 0] } },
        loadAverage1: { $avg: { $arrayElemAt: ['$metrics.cpu.loadAverage', 1] } },
        loadAverage2: { $avg: { $arrayElemAt: ['$metrics.cpu.loadAverage', 2] } },

        // Memory aggregations
        memoryTotal: { $first: '$metrics.memory.total' },
        memoryUsedAvg: { $avg: '$metrics.memory.used' },
        memoryFreeAvg: { $avg: '$metrics.memory.free' },
        memoryCachedAvg: { $avg: '$metrics.memory.cached' },
        memoryUsagePercentAvg: { $avg: '$metrics.memory.usagePercent' },

        // Disk aggregations
        diskTotal: { $first: '$metrics.disk.total' },
        diskUsedAvg: { $avg: '$metrics.disk.used' },
        diskFreeAvg: { $avg: '$metrics.disk.free' },
        diskUsagePercentAvg: { $avg: '$metrics.disk.usagePercent' },
        diskReadBytesAvg: { $avg: '$metrics.disk.readBytesPerSec' },
        diskWriteBytesAvg: { $avg: '$metrics.disk.writeBytesPerSec' },

        // Network aggregations
        networkRxBytesAvg: { $avg: '$metrics.network.rxBytesPerSec' },
        networkTxBytesAvg: { $avg: '$metrics.network.txBytesPerSec' },

        // Metadata
        entityName: { $first: '$entityName' },
        owner: { $first: '$owner' },
        systemInfo: { $first: '$systemInfo' },
      },
    },

    // 3. Project to final structure
    {
      $project: {
        type: 'node',
        entityType: 'node',
        entityId: '$_id.entityId',
        entityName: 1,
        timestamp: '$_id.timestamp',
        interval: '$_id.interval',
        metrics: {
          cpu: {
            usage: '$cpuUsageAvg',
            cores: '$cpuCores',
            loadAverage: ['$loadAverage0', '$loadAverage1', '$loadAverage2'],
          },
          memory: {
            total: '$memoryTotal',
            used: '$memoryUsedAvg',
            free: '$memoryFreeAvg',
            cached: '$memoryCachedAvg',
            usagePercent: '$memoryUsagePercentAvg',
          },
          disk: {
            total: '$diskTotal',
            used: '$diskUsedAvg',
            free: '$diskFreeAvg',
            usagePercent: '$diskUsagePercentAvg',
            readBytesPerSec: '$diskReadBytesAvg',
            writeBytesPerSec: '$diskWriteBytesAvg',
          },
          network: {
            rxBytesPerSec: '$networkRxBytesAvg',
            txBytesPerSec: '$networkTxBytesAvg',
          },
        },
        systemInfo: 1,
        owner: 1,
        createdBy: 'system',
      },
    },

    // 4. Merge into collection
    {
      $merge: {
        into: 'metrics',
        whenMatched: 'replace',
        whenNotMatched: 'insert',
      },
    },
  ]);

  return aggregated;
}
```

### 5.2 Batch Processing

Process aggregations in batches để avoid overwhelming database:

```typescript
private async aggregateAllEntitiesInBatches(
  metricType: string,
  sourceInterval: string,
  targetInterval: string,
  startTime: Date,
  endTime: Date,
  batchSize = 10
) {
  const entityIds = await this.metricModel.distinct('entityId', {
    type: metricType,
    interval: sourceInterval,
    timestamp: { $gte: startTime, $lt: endTime },
  });

  // Process in batches
  for (let i = 0; i < entityIds.length; i += batchSize) {
    const batch = entityIds.slice(i, i + batchSize);

    await Promise.all(
      batch.map(entityId =>
        this.aggregateEntity(metricType, entityId, sourceInterval, targetInterval, startTime, endTime)
      )
    );

    this.logger.log(`Processed batch ${i / batchSize + 1} of ${Math.ceil(entityIds.length / batchSize)}`);
  }
}
```

### 5.3 Parallel Aggregation

Run aggregation jobs in parallel using queue workers:

```typescript
// Enqueue aggregation jobs
async enqueueAggregationJobs(
  metricType: string,
  sourceInterval: string,
  targetInterval: string,
  startTime: Date,
  endTime: Date
) {
  const entityIds = await this.getEntityIds(metricType, sourceInterval, startTime, endTime);

  const jobs = entityIds.map(entityId => ({
    name: 'aggregate-metrics',
    data: {
      metricType,
      entityId,
      sourceInterval,
      targetInterval,
      startTime,
      endTime,
    },
  }));

  await this.aggregationQueue.addBulk(jobs);
}
```

---

## 6. Monitoring & Alerting

### 6.1 Aggregation Metrics

Track aggregation performance:

```typescript
interface AggregationMetrics {
  jobType: '1min-to-5min' | '5min-to-1hour' | '1hour-to-1day';
  startTime: Date;
  endTime: Date;
  duration: number; // milliseconds
  entitiesProcessed: number;
  entitiesFailed: number;
  status: 'success' | 'partial' | 'failed';
}
```

### 6.2 Health Checks

```typescript
@Get('/metrics/aggregation/health')
async getAggregationHealth() {
  const lastRun1min = await this.getLastAggregationRun('1min-to-5min');
  const lastRun5min = await this.getLastAggregationRun('5min-to-1hour');
  const lastRun1hour = await this.getLastAggregationRun('1hour-to-1day');

  return {
    status: 'ok',
    aggregations: {
      '1min-to-5min': {
        lastRun: lastRun1min.timestamp,
        status: lastRun1min.status,
        nextRun: this.getNextScheduledRun('*/5 * * * *'),
      },
      '5min-to-1hour': {
        lastRun: lastRun5min.timestamp,
        status: lastRun5min.status,
        nextRun: this.getNextScheduledRun('5 * * * *'),
      },
      '1hour-to-1day': {
        lastRun: lastRun1hour.timestamp,
        status: lastRun1hour.status,
        nextRun: this.getNextScheduledRun('5 0 * * *'),
      },
    },
  };
}
```

---

**Next**: [05-implementation-plan.md](./05-implementation-plan.md) - Development Roadmap
