import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Types } from 'mongoose';
import axios from 'axios';
import { RequestContext } from '@hydrabyte/shared';
import { QUEUE_NAMES, QUEUE_EVENTS } from '../../config/queue.config';
import { TasksService } from '../../modules/tasks/tasks.service';
import { ChannelsService } from '../../modules/channels/channels.service';
import { TaskProducer } from '../producers/task.producer';

interface TaskRemindJobData {
  taskId: string;
  conversationId: string;
  platformUserId: string;
  soulId: string;
  channelId: string;
  title: string;
  remindAt: string;
}

@Processor(QUEUE_NAMES.TASKS)
export class TaskProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(TaskProcessor.name);

  private get systemContext(): RequestContext {
    return {
      orgId: '',
      groupId: '',
      userId: 'system',
      agentId: '',
      appId: '',
      roles: ['universe.owner' as any],
    };
  }

  constructor(
    private tasksService: TasksService,
    private channelsService: ChannelsService,
    private taskProducer: TaskProducer,
  ) {
    super();
  }

  /**
   * On startup, catch up any overdue tasks missed during downtime
   */
  async onModuleInit() {
    try {
      const overdueTasks = await this.tasksService.getOverdueTasks();
      if (overdueTasks.length > 0) {
        this.logger.warn(`Found ${overdueTasks.length} overdue tasks — processing catch-up`);
        for (const task of overdueTasks) {
          await this.processReminder({
            taskId: (task as any)._id.toString(),
            conversationId: task.conversationId,
            platformUserId: task.platformUserId,
            soulId: task.soulId,
            channelId: task.channelId,
            title: task.title,
            remindAt: task.remindAt?.toISOString() || new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      this.logger.error(`Catch-up failed: ${error.message}`);
    }
  }

  async process(job: Job): Promise<any> {
    this.logger.log(`Processing task job ${job.id}, name: ${job.name}`);

    switch (job.name) {
      case QUEUE_EVENTS.TASK_REMIND:
        return this.processReminder(job.data.data as TaskRemindJobData);
      default:
        this.logger.warn(`Unknown task job type: ${job.name}`);
        return null;
    }
  }

  private async processReminder(data: TaskRemindJobData): Promise<any> {
    try {
      // 1. Load task from DB — verify still pending
      const task = await this.tasksService.findById(
        new Types.ObjectId(data.taskId) as any,
        this.systemContext,
      );

      if (!task) {
        this.logger.warn(`Task ${data.taskId} not found — skipping`);
        return { skipped: true, reason: 'not_found' };
      }

      if (task.status !== 'pending') {
        this.logger.log(`Task ${data.taskId} status is ${task.status} — skipping`);
        return { skipped: true, reason: `status_${task.status}` };
      }

      // 2. Build notification message
      const vnTime = task.dueAt
        ? new Date(task.dueAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })
        : '';
      
      const message = [
        '⏰ Nhắc nhở',
        '━━━━━━━━━━',
        task.title,
        vnTime ? `Thời gian: ${vnTime}` : '',
        task.description || '',
        '',
        'Trả lời "xong" để hoàn thành',
        'Trả lời "nhắc lại 30p" để hoãn',
      ].filter(Boolean).join('\n');

      // 3. Send via Zalo OA
      await this.sendZaloMessage(data.channelId, data.platformUserId, message);

      // 4. Update task
      await this.tasksService.update(
        new Types.ObjectId(data.taskId) as any,
        {
          notifiedCount: (task.notifiedCount || 0) + 1,
          lastNotifiedAt: new Date(),
          status: 'overdue', // Mark as overdue after notification
        },
        this.systemContext,
      );

      this.logger.log(`Reminder sent for task ${data.taskId}: "${data.title}"`);
      return { processed: true, taskId: data.taskId };

    } catch (error) {
      this.logger.error(`Error processing task reminder: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async sendZaloMessage(channelId: string, platformUserId: string, text: string): Promise<void> {
    try {
      const channel = await this.channelsService.findById(
        new Types.ObjectId(channelId) as any,
        this.systemContext,
      );

      if (!channel || !channel.credentials?.accessToken) {
        this.logger.warn(`Channel ${channelId} missing access token`);
        return;
      }

      const response = await axios.post(
        'https://openapi.zalo.me/v3.0/oa/message/cs',
        {
          recipient: { user_id: platformUserId },
          message: { text },
        },
        {
          headers: {
            'access_token': channel.credentials.accessToken,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      if (response.data.error !== 0) {
        this.logger.warn(`Zalo API error ${response.data.error}: ${response.data.message}`);
        // If error -216 (outside 48h window), log but don't throw
        if (response.data.error === -216) {
          this.logger.warn(`User ${platformUserId} outside 48h window — reminder not delivered`);
          return;
        }
        throw new Error(`Zalo API error ${response.data.error}: ${response.data.message}`);
      }

      this.logger.log(`Task reminder sent to user: ${platformUserId}`);
    } catch (error) {
      this.logger.error(`Failed to send task reminder: ${error.message}`);
      throw error;
    }
  }
}
