import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type SystemActivityLogDocument = SystemActivityLog & Document;

export enum SystemWorkerType {
  SIGNAL_GEN = 'signal_gen',
  DATA_INGESTION = 'data_ingestion',
  TECH_INDICATOR = 'tech_indicator',
}

export enum SystemActivityStatus {
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  INFO = 'INFO',
}

@Schema({ timestamps: true })
export class SystemActivityLog extends BaseSchema {
  @Prop({ required: true, enum: SystemWorkerType })
  workerType: SystemWorkerType;

  @Prop({ required: true })
  source: string;

  @Prop()
  symbol: string;

  @Prop({ required: true })
  action: string;

  @Prop({ required: true, enum: SystemActivityStatus, default: SystemActivityStatus.INFO })
  status: SystemActivityStatus;

  @Prop({ required: true })
  details: string;

  @Prop({ type: Object })
  metadata: Record<string, any>;

  @Prop({ type: Number })
  durationMs: number;

  @Prop({
    type: Date,
    default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  })
  expiresAt: Date;
}

export const SystemActivityLogSchema = SchemaFactory.createForClass(SystemActivityLog);

SystemActivityLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SystemActivityLogSchema.index({ workerType: 1, createdAt: -1 });
SystemActivityLogSchema.index({ symbol: 1, createdAt: -1 });
SystemActivityLogSchema.index({ status: 1, createdAt: -1 });
