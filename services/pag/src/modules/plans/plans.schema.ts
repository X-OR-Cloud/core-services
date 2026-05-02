import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PlanDocument = Plan & Document;

@Schema({ timestamps: true, collection: 'plans' })
export class Plan {
  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: Number, default: 0 })
  price: number;                        // VND/month (0 = free)

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  // AI Chat
  @Prop({ type: Number, default: null })
  dailyMessageLimit: number | null;     // null = unlimited

  // Tasks
  @Prop({ type: Number, default: null })
  maxActiveTasks: number | null;        // null = unlimited

  @Prop({ type: Boolean, default: false })
  allowRecurringTasks: boolean;

  // Notes (quota config only — Notes module in separate Epic)
  @Prop({ type: Number, default: null })
  maxNotes: number | null;

  @Prop({ type: Number, default: null })
  maxNoteLength: number | null;

  // Memory
  @Prop({ type: Number, default: null })
  memoryRetentionDays: number | null;   // null = unlimited

  @Prop({ type: Number, default: null })
  memoryContextLimit: number | null;    // top-k memories injected into context
}

export const PlanSchema = SchemaFactory.createForClass(Plan);

PlanSchema.index({ slug: 1 }, { unique: true });
