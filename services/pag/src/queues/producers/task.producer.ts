import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, QUEUE_EVENTS } from '../../config/queue.config';

@Injectable()
export class TaskProducer {
  private readonly logger = new Logger(TaskProducer.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.TASKS) private taskQueue: Queue,
  ) {}

  /**
   * Schedule a task reminder as a delayed BullMQ job
   * @returns The BullMQ job ID (store in task.bullJobId for cancellation)
   */
  async scheduleReminder(data: {
    taskId: string;
    conversationId: string;
    platformUserId: string;
    soulId: string;
    channelId: string;
    title: string;
    remindAt: Date;
  }): Promise<string> {
    const delay = data.remindAt.getTime() - Date.now();

    if (delay <= 0) {
      // Already past due — process immediately
      this.logger.warn(`Task ${data.taskId} is already past due, processing immediately`);
    }

    const job = await this.taskQueue.add(
      QUEUE_EVENTS.TASK_REMIND,
      {
        event: QUEUE_EVENTS.TASK_REMIND,
        data,
        timestamp: new Date().toISOString(),
      },
      {
        delay: Math.max(delay, 0),
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: 100,
        removeOnFail: 50,
        jobId: `task-remind-${data.taskId}`, // Deduplicate
      },
    );

    this.logger.log(
      `Scheduled reminder for task ${data.taskId}: "${data.title}" in ${Math.round(Math.max(delay, 0) / 60000)}min`,
    );

    return job.id;
  }

  /**
   * Cancel a scheduled reminder
   */
  async cancelReminder(taskId: string): Promise<void> {
    const jobId = `task-remind-${taskId}`;
    try {
      const job = await this.taskQueue.getJob(jobId);
      if (job) {
        await job.remove();
        this.logger.log(`Cancelled reminder for task: ${taskId}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to cancel reminder for task ${taskId}: ${error.message}`);
    }
  }
}
