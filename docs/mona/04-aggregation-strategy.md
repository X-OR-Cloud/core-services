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

### 2.3 Aggregation Trigger

**API-Driven Approach** (External Cronjob → AIWM API):

Thay vì sử dụng `@Cron` decorators trong code, aggregation được trigger thông qua API endpoints từ external system-level cronjobs.

**Flow**:
```
External Crontab → HTTP POST to AIWM API → BullMQ Queue → Worker processes aggregation
```

**Benefits**:
- ✅ **Flexibility**: Dễ dàng thay đổi schedule mà không cần deploy lại service
- ✅ **Monitoring**: External monitoring tools có thể track job execution
- ✅ **Scalability**: Phù hợp với multi-instance deployment
- ✅ **Control**: Admin có thể trigger manual aggregation khi cần

**API Endpoints** (see [03-api-design.md](./03-api-design.md#4-aggregation-api-endpoints)):
- `POST /metrics/aggregate/1min-to-5min` - Aggregate 1min → 5min
- `POST /metrics/aggregate/5min-to-1hour` - Aggregate 5min → 1hour
- `POST /metrics/aggregate/1hour-to-1day` - Aggregate 1hour → 1day

**External Cronjob Setup**:

```bash
# /etc/crontab

# Aggregate 1min → 5min (every 5 minutes)
*/5 * * * * curl -X POST http://localhost:3004/metrics/aggregate/1min-to-5min \
  -H "X-API-Key: $INTERNAL_API_KEY" -H "Content-Type: application/json"

# Aggregate 5min → 1hour (every hour at minute 5)
5 * * * * curl -X POST http://localhost:3004/metrics/aggregate/5min-to-1hour \
  -H "X-API-Key: $INTERNAL_API_KEY" -H "Content-Type: application/json"

# Aggregate 1hour → 1day (daily at 00:05)
5 0 * * * curl -X POST http://localhost:3004/metrics/aggregate/1hour-to-1day \
  -H "X-API-Key: $INTERNAL_API_KEY" -H "Content-Type: application/json"
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
): Promise<MetricData> {
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
MetricDataSchema.index(
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

In case TTL index không work hoặc cần immediate cleanup, có thể tạo API endpoint tương tự:

**Endpoint**: `POST /metrics/cleanup/expired` (API Key auth)

**Implementation**:

```typescript
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

**External Cronjob**:

```bash
# Daily at 2 AM
0 2 * * * curl -X POST http://localhost:3004/metrics/cleanup/expired \
  -H "X-API-Key: $INTERNAL_API_KEY"
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

### 4.1 Aggregation API Controller

**File**: `services/mona/src/modules/metrics/metrics-aggregation.controller.ts`

```typescript
import { Controller, Post, Body, UseGuards, Get, Param } from '@nestjs/common';
import { ApiKeyGuard } from '@hydrabyte/base';
import { MetricsAggregationService } from './metrics-aggregation.service';

interface TriggerAggregationDto {
  metricTypes?: string[];
  startTime?: string;
  endTime?: string;
  batchSize?: number;
}

@Controller('metrics/aggregate')
export class MetricsAggregationController {
  constructor(
    private readonly aggregationService: MetricsAggregationService
  ) {}

  @Post('1min-to-5min')
  @UseGuards(ApiKeyGuard)
  async trigger1minTo5min(@Body() dto: TriggerAggregationDto) {
    return this.aggregationService.triggerAggregation('1min', '5min', dto);
  }

  @Post('5min-to-1hour')
  @UseGuards(ApiKeyGuard)
  async trigger5minTo1hour(@Body() dto: TriggerAggregationDto) {
    return this.aggregationService.triggerAggregation('5min', '1hour', dto);
  }

  @Post('1hour-to-1day')
  @UseGuards(ApiKeyGuard)
  async trigger1hourTo1day(@Body() dto: TriggerAggregationDto) {
    return this.aggregationService.triggerAggregation('1hour', '1day', dto);
  }

  @Get('jobs/:jobId')
  @UseGuards(ApiKeyGuard)
  async getJobStatus(@Param('jobId') jobId: string) {
    return this.aggregationService.getJobStatus(jobId);
  }
}
```

### 4.2 Aggregation Service

**File**: `services/mona/src/modules/metrics/metrics-aggregation.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { MetricData } from './metrics.schema';

@Injectable()
export class MetricsAggregationService {
  private readonly logger = new Logger(MetricsAggregationService.name);

  constructor(
    @InjectModel(MetricData.name)
    private readonly metricModel: Model<MetricData>,
    @InjectQueue('metrics-aggregation')
    private readonly aggregationQueue: Queue
  ) {}

  /**
   * Trigger aggregation job
   */
  async triggerAggregation(
    sourceInterval: string,
    targetInterval: string,
    dto: TriggerAggregationDto
  ) {
    this.logger.log(`Triggering ${sourceInterval} → ${targetInterval} aggregation`);

    // Default values
    const metricTypes = dto.metricTypes || ['node', 'resource', 'deployment'];
    const endTime = dto.endTime ? new Date(dto.endTime) : this.getDefaultEndTime(sourceInterval);
    const startTime = dto.startTime ? new Date(dto.startTime) : this.getDefaultStartTime(sourceInterval, endTime);
    const batchSize = dto.batchSize || 10;

    // Create job ID
    const jobId = `agg-${sourceInterval}-${targetInterval}-${Date.now()}`;

    // Enqueue aggregation jobs
    await this.enqueueAggregationJobs(
      jobId,
      metricTypes,
      sourceInterval,
      targetInterval,
      startTime,
      endTime,
      batchSize
    );

    return {
      success: true,
      message: 'Aggregation job queued successfully',
      data: {
        jobId,
        metricTypes,
        timeRange: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
        },
        status: 'queued',
      },
    };
  }

  /**
   * Get default end time based on source interval
   */
  private getDefaultEndTime(sourceInterval: string): Date {
    const now = Date.now();
    switch (sourceInterval) {
      case '1min':
        return new Date(now - 5 * 60 * 1000); // 5 min ago
      case '5min':
        return new Date(now - 60 * 60 * 1000); // 1 hour ago
      case '1hour':
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today; // Start of today
      default:
        return new Date();
    }
  }

  /**
   * Get default start time based on source interval
   */
  private getDefaultStartTime(sourceInterval: string, endTime: Date): Date {
    switch (sourceInterval) {
      case '1min':
        return new Date(endTime.getTime() - 5 * 60 * 1000); // 5 min before endTime
      case '5min':
        return new Date(endTime.getTime() - 60 * 60 * 1000); // 1 hour before endTime
      case '1hour':
        return new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // 1 day before endTime
      default:
        return new Date(endTime.getTime() - 3600000);
    }
  }

  /**
   * Enqueue aggregation jobs to BullMQ
   */
  private async enqueueAggregationJobs(
    jobId: string,
    metricTypes: string[],
    sourceInterval: string,
    targetInterval: string,
    startTime: Date,
    endTime: Date,
    batchSize: number
  ) {
    for (const metricType of metricTypes) {
      // Get distinct entity IDs
      const entityIds = await this.metricModel.distinct('entityId', {
        type: metricType,
        interval: sourceInterval,
        timestamp: { $gte: startTime, $lt: endTime },
      });

      this.logger.log(
        `Enqueuing ${entityIds.length} ${metricType} aggregation jobs`
      );

      // Create jobs for each entity
      const jobs = entityIds.map(entityId => ({
        name: 'aggregate-entity',
        data: {
          jobId,
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
  }

  /**
   * Get aggregation job status
   */
  async getJobStatus(jobId: string) {
    // Implementation: Query BullMQ job status or custom tracking table
    // For now, return mock data
    return {
      success: true,
      data: {
        jobId,
        status: 'completed',
        progress: {
          total: 100,
          processed: 100,
          failed: 2,
        },
      },
    };
  }

  /**
   * Aggregate all entities of a given type
   */
  async aggregateAllEntities(
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

  // aggregateNodeMetrics, aggregateResourceMetrics, etc. implemented as shown in section 2.4
}
```

### 4.3 BullMQ Worker (Processor)

**File**: `services/mona/src/modules/metrics/metrics-aggregation.processor.ts`

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MetricsAggregationService } from './metrics-aggregation.service';

interface AggregationJobData {
  jobId: string;
  metricType: 'node' | 'resource' | 'deployment';
  entityId: string;
  sourceInterval: string;
  targetInterval: string;
  startTime: Date;
  endTime: Date;
}

@Processor('metrics-aggregation')
export class MetricsAggregationProcessor extends WorkerHost {
  private readonly logger = new Logger(MetricsAggregationProcessor.name);

  constructor(
    private readonly aggregationService: MetricsAggregationService
  ) {
    super();
  }

  async process(job: Job<AggregationJobData>): Promise<void> {
    const { jobId, metricType, entityId, sourceInterval, targetInterval, startTime, endTime } = job.data;

    this.logger.log(`Processing aggregation job ${jobId} for ${metricType} ${entityId}`);

    try {
      await this.aggregationService.aggregateEntity(
        metricType,
        entityId,
        sourceInterval,
        targetInterval,
        new Date(startTime),
        new Date(endTime)
      );

      this.logger.log(`Completed aggregation for ${metricType} ${entityId}`);
    } catch (error) {
      this.logger.error(`Failed to aggregate ${metricType} ${entityId}:`, error);
      throw error; // BullMQ will retry
    }
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
