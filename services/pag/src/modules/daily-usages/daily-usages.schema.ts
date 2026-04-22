import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DailyUsageDocument = DailyUsage & Document;

@Schema({ timestamps: true })
export class DailyUsage {
  @Prop({ required: true })
  platformUserId: string;

  @Prop({ required: true })
  date: string;                         // 'YYYY-MM-DD' in GMT+7

  @Prop({ type: Number, default: 0 })
  messageCount: number;

  @Prop({ type: Boolean, default: false })
  warningAt80Sent: boolean;             // soft warning already sent today
}

export const DailyUsageSchema = SchemaFactory.createForClass(DailyUsage);

DailyUsageSchema.index({ platformUserId: 1, date: 1 }, { unique: true });
// TTL: auto-delete after 7 days
DailyUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });
