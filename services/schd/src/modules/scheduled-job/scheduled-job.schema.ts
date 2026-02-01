import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ScheduledJobDocument = ScheduledJob & Document;

@Schema({ _id: false })
export class RetryConfig {
  @Prop({ default: 3 })
  maxRetries: number;

  @Prop({ default: 5000 })
  backoffMs: number;

  @Prop({ enum: ['fixed', 'exponential'], default: 'exponential' })
  backoffType: string;
}

export const RetryConfigSchema = SchemaFactory.createForClass(RetryConfig);

@Schema({ timestamps: true, collection: 'scheduled_jobs' })
export class ScheduledJob extends BaseSchema {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop()
  description: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ required: true })
  cronExpression: string;

  @Prop({ default: 'Asia/Ho_Chi_Minh' })
  timezone: string;

  @Prop({ required: true })
  targetQueue: string;

  @Prop({ type: Object, default: {} })
  payload: Record<string, any>;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ default: 5, min: 1, max: 10 })
  priority: number;

  @Prop({ default: 300000 }) // 5 minutes
  timeout: number;

  @Prop({ type: RetryConfigSchema, default: () => ({}) })
  retryConfig: RetryConfig;

  @Prop()
  nextRunAt: Date;

  @Prop()
  lastRunAt: Date;

  @Prop()
  lastExecutionStatus: string;
}

export const ScheduledJobSchema = SchemaFactory.createForClass(ScheduledJob);

// Indexes
ScheduledJobSchema.index({ name: 1 }, { unique: true });
ScheduledJobSchema.index({ enabled: 1, nextRunAt: 1 });
ScheduledJobSchema.index({ tags: 1 });
ScheduledJobSchema.index({ 'owner.orgId': 1 });
