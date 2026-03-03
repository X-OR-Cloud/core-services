import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MacroIndicatorDocument = MacroIndicator & Document;

export enum MacroFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
}

@Schema({ timestamps: true })
export class MacroIndicator {
  @Prop({ required: true })
  seriesId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  value: number;

  @Prop({ required: true })
  unit: string;

  @Prop({ required: true, type: Date })
  timestamp: Date;

  @Prop({ type: Date })
  releaseDate: Date;

  @Prop({ required: true, default: 'fred' })
  source: string;

  @Prop({ required: true, enum: MacroFrequency })
  frequency: string;
}

export const MacroIndicatorSchema = SchemaFactory.createForClass(MacroIndicator);

MacroIndicatorSchema.index({ seriesId: 1, timestamp: -1 }, { unique: true });
