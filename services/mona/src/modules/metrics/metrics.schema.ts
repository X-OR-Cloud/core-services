import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type MetricDataDocument = MetricData & Document;

/**
 * MetricType - Discriminator cho loại metrics (nguồn phát sinh)
 */
export enum MetricType {
  NODE = 'node',
  RESOURCE = 'resource',
  DEPLOYMENT = 'deployment',
  SYSTEM = 'system',
}

/**
 * AggregationInterval - Granularity của metrics
 */
export enum AggregationInterval {
  ONE_MIN = '1min',
  FIVE_MIN = '5min',
  ONE_HOUR = '1hour',
  ONE_DAY = '1day',
}

/**
 * MetricData - Time-series metrics storage
 * Single collection design với type discriminator
 */
@Schema({ timestamps: true })
export class MetricData extends BaseSchema {
  // ============= Discriminator & Classification =============

  @Prop({
    required: true,
    enum: Object.values(MetricType),
    index: true,
  })
  type!: string; // 'node' | 'resource' | 'deployment' | 'system'

  @Prop({
    required: true,
    enum: ['node', 'resource', 'deployment', 'agent', 'model', 'system'],
    index: true,
  })
  entityType!: string; // Type của entity được monitor

  @Prop({ required: true, index: true })
  entityId!: string; // Reference to Node._id, Resource._id, Deployment._id, etc.

  @Prop()
  entityName?: string; // Optional: tên entity cho easier debugging (no index)

  // ============= Timestamp & Interval =============

  @Prop({ required: true, type: Date, index: true })
  timestamp!: Date; // Thời điểm snapshot (UTC)

  @Prop({
    required: true,
    enum: Object.values(AggregationInterval),
    index: true,
  })
  interval!: string; // '1min' | '5min' | '1hour' | '1day'

  // ============= System Information (mostly static) =============

  @Prop(
    raw({
      os: {
        name: { type: String },
        version: { type: String },
        kernel: { type: String },
        platform: { type: String },
      },
      architecture: {
        cpu: { type: String },
        bits: { type: Number },
        endianness: { type: String },
      },
      containerRuntime: {
        type: { type: String },
        version: { type: String },
        apiVersion: { type: String },
        storage: {
          driver: { type: String },
          filesystem: { type: String },
        },
      },
      virtualization: {
        type: { type: String },
        role: { type: String },
      },
    })
  )
  systemInfo?: {
    os: {
      name: string;
      version: string;
      kernel: string;
      platform: string;
    };
    architecture: {
      cpu: string;
      bits: number;
      endianness: string;
    };
    containerRuntime?: {
      type: string;
      version: string;
      apiVersion?: string;
      storage: {
        driver: string;
        filesystem: string;
      };
    };
    virtualization?: {
      type: string;
      role: string;
    };
  };

  // ============= Metrics Data (flexible structure based on type) =============

  @Prop({ type: Object, required: true })
  metrics!: Record<string, any>;

  // Structure of 'metrics' depends on 'type':
  // - type='node': NodeMetrics
  // - type='resource': ResourceMetrics
  // - type='deployment': DeploymentMetrics
  // - type='system': SystemMetrics

  // BaseSchema provides: owner (orgId, userId, groupId), createdBy, updatedBy, etc.
}

export const MetricDataSchema = SchemaFactory.createForClass(MetricData);

// ============= Indexes =============

// Compound index for time-range queries
MetricDataSchema.index(
  { type: 1, entityId: 1, timestamp: -1 },
  { name: 'metrics_time_range_query' }
);

// Compound index for aggregation queries
MetricDataSchema.index(
  { type: 1, interval: 1, timestamp: -1 },
  { name: 'metrics_aggregation_query' }
);

// Index for entity lookup
MetricDataSchema.index(
  { entityType: 1, entityId: 1 },
  { name: 'metrics_entity_lookup' }
);

// Index for organization-scoped queries
MetricDataSchema.index(
  { 'owner.orgId': 1, type: 1, timestamp: -1 },
  { name: 'metrics_org_query' }
);

// TTL index for automatic cleanup (expire after 365 days)
MetricDataSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: 31536000, // 365 days
    name: 'metrics_ttl_cleanup',
  }
);

// Index for latest metric queries
MetricDataSchema.index(
  { type: 1, entityId: 1, timestamp: -1 },
  { name: 'metrics_latest_lookup' }
);
