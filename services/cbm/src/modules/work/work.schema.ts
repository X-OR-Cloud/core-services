import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type WorkDocument = Work & MongooseDocument;

/**
 * ReporterAssignee - Entity reference for reporter/assignee
 * Can reference either user or agent
 */
export interface ReporterAssignee {
  type: 'agent' | 'user';
  id: string;
}

/**
 * RecurrenceConfig - Structured recurrence definition for recurring tasks
 * Only applicable to type=task
 */
export interface RecurrenceConfig {
  /** Recurrence pattern type */
  type: 'interval' | 'daily' | 'weekly' | 'monthly';
  /** Interval in minutes. Required when type='interval'. Min: 1, Max: 525600 */
  intervalMinutes?: number;
  /** Times of day in "HH:mm" 24-hour format. Required when type='daily'|'weekly'|'monthly' */
  timesOfDay?: string[];
  /** Days of the week (0=Sunday, 6=Saturday). Required when type='weekly' */
  daysOfWeek?: number[];
  /** Days of the month (1-31). Required when type='monthly'. Clamped to last day of month */
  daysOfMonth?: number[];
  /** IANA timezone string. Default: 'UTC' */
  timezone?: string;
}

/**
 * Work - Work/task management entity
 * Supports 3 types: epic, task, subtask
 * Uses MongoDB _id as the primary identifier
 */
@Schema({ timestamps: true })
export class Work extends BaseSchema {
  @Prop({ required: true, maxlength: 200 })
  title!: string; // Work title

  @Prop({ maxlength: 10000 })
  description?: string; // Detailed description (markdown)

  @Prop({ required: true, enum: ['epic', 'task', 'subtask'] })
  type!: string; // Work type

  @Prop({ type: String })
  projectId?: string; // Optional project reference

  @Prop({ type: Object, required: true })
  reporter!: ReporterAssignee; // Who reported the work

  @Prop({ type: Object })
  assignee?: ReporterAssignee; // Who is assigned to the work

  @Prop({ type: Date })
  dueDate?: Date; // Due date

  @Prop({ type: Date })
  startAt?: Date; // Start time (for agent scheduled execution)

  @Prop({
    required: true,
    enum: ['backlog', 'todo', 'in_progress', 'blocked', 'cancelled', 'review', 'done'],
    default: 'backlog'
  })
  status!: string; // Work status

  @Prop({ type: [String], default: [] })
  dependencies!: string[]; // Array of Work IDs that this work depends on

  @Prop({ maxlength: 1000 })
  reason?: string; // Reason/explanation when work is blocked

  @Prop({ maxlength: 2000 })
  feedback?: string; // Feedback for review rejection or unblock resolution

  @Prop({ type: String })
  parentId?: string; // Parent Work ID (for subtasks)

  @Prop({ type: [String], default: [] })
  documents!: string[]; // Array of document IDs

  @Prop({ type: Object })
  recurrence?: RecurrenceConfig; // Recurrence configuration (only for type=task)

  @Prop({ type: Boolean, default: false })
  isRecurring!: boolean; // Convenience flag: true when recurrence is set and active

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
  // _id is automatically provided by MongoDB
}

export const WorkSchema = SchemaFactory.createForClass(Work);

// Indexes for performance
WorkSchema.index({ status: 1 });
WorkSchema.index({ type: 1 });
WorkSchema.index({ projectId: 1 });
WorkSchema.index({ 'reporter.id': 1 });
WorkSchema.index({ 'assignee.id': 1 });
WorkSchema.index({ parentId: 1 });
WorkSchema.index({ createdAt: -1 });
WorkSchema.index({ title: 'text', description: 'text' }); // Full-text search
WorkSchema.index({ isRecurring: 1, status: 1, startAt: 1, 'assignee.id': 1 }); // Recurring work queries
