import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type PortfolioSnapshotDocument = PortfolioSnapshot & Document;

@Schema({ timestamps: true })
export class PortfolioSnapshot extends BaseSchema {
  @Prop({ type: Types.ObjectId, ref: 'Account', required: true })
  accountId: Types.ObjectId;

  @Prop({ required: true, type: Date })
  date: Date;

  @Prop({ required: true, default: 0 })
  totalValueUsd: number;

  @Prop({ required: true, default: 0 })
  cashBalanceUsd: number;

  @Prop({ required: true, default: 0 })
  positionsValueUsd: number;

  @Prop({ required: true, default: 0 })
  realizedPnlUsd: number;

  @Prop({ required: true, default: 0 })
  unrealizedPnlUsd: number;
}

export const PortfolioSnapshotSchema = SchemaFactory.createForClass(PortfolioSnapshot);

PortfolioSnapshotSchema.index({ accountId: 1, date: -1 }, { unique: true });
