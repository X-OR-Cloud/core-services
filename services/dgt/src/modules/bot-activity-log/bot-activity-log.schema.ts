import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type BotActivityLogDocument = BotActivityLog & Document;

export enum ActivityActionType {
  BUY = 'buy',
  SELL = 'sell',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
}

export enum ActivityStatus {
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  INFO = 'INFO',
}

export enum PerformedBy {
  USER = 'user',
  SYSTEM = 'system',
}

@Schema({ timestamps: true })
export class BotActivityLog extends BaseSchema {
  @Prop({ type: Types.ObjectId, ref: 'Bot', required: true })
  botId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Account', required: true })
  accountId: Types.ObjectId;

  @Prop({ required: true })
  action: string;

  @Prop({ required: true, enum: ActivityActionType })
  actionType: ActivityActionType;

  @Prop({ required: true })
  details: string;

  @Prop({ type: Object })
  metadata: Record<string, any>;

  @Prop({ required: true, enum: PerformedBy, default: PerformedBy.SYSTEM })
  performedBy: PerformedBy;

  @Prop({ required: true, enum: ActivityStatus, default: ActivityStatus.INFO })
  status: ActivityStatus;

  @Prop({
    type: Date,
    default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  })
  expiresAt: Date;
}

export const BotActivityLogSchema = SchemaFactory.createForClass(BotActivityLog);

BotActivityLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
BotActivityLogSchema.index({ botId: 1, createdAt: -1 });
BotActivityLogSchema.index({ accountId: 1, createdAt: -1 });
