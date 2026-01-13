import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES } from './queue.constants';

/**
 * WorkflowExecutionQueue
 * BullMQ queue producer for workflow executions
 * Responsible for adding workflow execution jobs to the queue
 */
@Injectable()
export class WorkflowExecutionQueue {
  private readonly logger = new Logger(WorkflowExecutionQueue.name);
  private queue: Queue;

  constructor() {
    this.queue = new Queue(QUEUE_NAMES.WORKFLOW_EXECUTION, {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 100,
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    });

    this.logger.log('Workflow execution queue initialized');
  }

  /**
   * Add a workflow execution job to the queue
   * @param executionId - Unique execution ID
   */
  async addExecutionJob(executionId: string): Promise<void> {
    await this.queue.add(
      JOB_NAMES.EXECUTE_WORKFLOW,
      { executionId },
      {
        jobId: `workflow-exec-${executionId}`, // Prevent duplicates
      }
    );

    this.logger.log(`Added execution job for ${executionId}`);
  }

  /**
   * Get queue status metrics
   * @returns Queue status with counts
   */
  async getQueueStatus() {
    return {
      waiting: await this.queue.getWaitingCount(),
      active: await this.queue.getActiveCount(),
      completed: await this.queue.getCompletedCount(),
      failed: await this.queue.getFailedCount(),
    };
  }

  /**
   * Clean up old jobs
   * Called periodically to remove old completed and failed jobs
   */
  async cleanupOldJobs(): Promise<void> {
    await this.queue.clean(24 * 3600 * 1000, 100, 'completed');
    await this.queue.clean(7 * 24 * 3600 * 1000, 100, 'failed');
    this.logger.log('Cleaned up old queue jobs');
  }
}
