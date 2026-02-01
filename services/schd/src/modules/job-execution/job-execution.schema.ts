import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type JobExecutionDocument = JobExecution & Document;

@Schema({ _id: false })
export class ExecutionError {
  @Prop({ required: true })
  message: string;

  @Prop()
  code: string;

  @Prop()
  stack: string;
}

export const ExecutionErrorSchema = SchemaFactory.createForClass(ExecutionError);

@Schema({ timestamps: true, collection: 'job_executions' })
export class JobExecution extends BaseSchema {
  @Prop({ type: Types.ObjectId, ref: 'ScheduledJob', required: true, index: true })
  jobId: Types.ObjectId;

  @Prop({ required: true })
  jobName: string;

  @Prop({ required: true })
  triggeredAt: Date;

  @Prop({ enum: ['scheduler', 'manual'], required: true })
  triggeredBy: string;

  @Prop()
  triggeredByUser: string;

  @Prop({
    enum: ['pending', 'queued', 'running', 'completed', 'failed', 'timeout'],
    default: 'pending',
    index: true,
  })
  status: string;

  @Prop()
  queuedAt: Date;

  @Prop()
  startedAt: Date;

  @Prop()
  completedAt: Date;

  @Prop()
  duration: number;

  @Prop({ type: Object })
  result: Record<string, any>;

  @Prop({ type: ExecutionErrorSchema })
  error: ExecutionError;

  @Prop({ default: 0 })
  retryCount: number;

  @Prop({ type: Types.ObjectId, ref: 'JobExecution' })
  retryOf: Types.ObjectId;

  @Prop()
  nextRetryAt: Date;

  @Prop({ required: true, index: true })
  correlationId: string;

  @Prop()
  timeout: number;
}

export const JobExecutionSchema = SchemaFactory.createForClass(JobExecution);

// Indexes
JobExecutionSchema.index({ jobId: 1, triggeredAt: -1 });
JobExecutionSchema.index({ status: 1, queuedAt: 1 });
JobExecutionSchema.index({ triggeredAt: -1 });
JobExecutionSchema.index({ 'owner.orgId': 1, triggeredAt: -1 });
