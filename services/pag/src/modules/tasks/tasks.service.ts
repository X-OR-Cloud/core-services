import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Task } from './tasks.schema';

@Injectable()
export class TasksService extends BaseService<Task> {
  constructor(@InjectModel(Task.name) taskModel: Model<Task>) {
    super(taskModel as any);
  }

  /**
   * Get pending tasks for a conversation
   */
  async getPendingByConversation(
    conversationId: string,
    limit = 20,
  ): Promise<Task[]> {
    return this.model
      .find({
        conversationId,
        status: { $in: ['pending', 'snoozed'] },
        isDeleted: false,
      })
      .sort({ remindAt: 1, createdAt: -1 })
      .limit(limit)
      .select('-isDeleted -deletedAt -password')
      .exec();
  }

  /**
   * Get overdue tasks that need catch-up notification
   * Called on worker startup to handle tasks missed during downtime
   */
  async getOverdueTasks(): Promise<Task[]> {
    const now = new Date();
    return this.model
      .find({
        status: 'pending',
        remindAt: { $lte: now },
        isDeleted: false,
      })
      .sort({ remindAt: 1 })
      .select('-isDeleted -deletedAt -password')
      .exec();
  }

  /**
   * Mark task as done
   */
  async markDone(taskId: string, context: RequestContext): Promise<Task> {
    return this.model
      .findByIdAndUpdate(
        taskId,
        {
          status: 'done',
          completedAt: new Date(),
        },
        { new: true },
      )
      .select('-isDeleted -deletedAt -password')
      .exec();
  }

  /**
   * Snooze a task — reschedule remindAt
   */
  async snooze(
    taskId: string,
    newRemindAt: Date,
    context: RequestContext,
  ): Promise<Task> {
    return this.model
      .findByIdAndUpdate(
        taskId,
        {
          status: 'pending',
          remindAt: newRemindAt,
          notifiedCount: 0,
        },
        { new: true },
      )
      .select('-isDeleted -deletedAt -password')
      .exec();
  }

  /**
   * Get pending tasks for a user across conversations
   */
  async getPendingByUser(
    platformUserId: string,
    soulId: string,
  ): Promise<Task[]> {
    return this.model
      .find({
        platformUserId,
        soulId,
        status: { $in: ['pending', 'snoozed'] },
        isDeleted: false,
      })
      .sort({ remindAt: 1, createdAt: -1 })
      .select('-isDeleted -deletedAt -password')
      .exec();
  }

  /**
   * Find the most recent pending task for a user (for "xong"/"done" commands)
   */
  async findRecentPendingByUser(
    platformUserId: string,
    soulId: string,
  ): Promise<Task | null> {
    return this.model
      .findOne({
        platformUserId,
        soulId,
        status: { $in: ['pending', 'overdue'] },
        isDeleted: false,
      })
      .sort({ notifiedCount: -1, remindAt: -1 })
      .select('-isDeleted -deletedAt -password')
      .exec();
  }
}
