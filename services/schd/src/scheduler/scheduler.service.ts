import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createLogger } from '@hydrabyte/shared';
import { ScheduledJobService } from '../modules/scheduled-job/scheduled-job.service';
import { JobExecutionService } from '../modules/job-execution/job-execution.service';
import { JobTriggerProducer } from '../queues/producers/job-trigger.producer';
import { ScheduledJob } from '../modules/scheduled-job/scheduled-job.schema';
import { JobExecution } from '../modules/job-execution/job-execution.schema';
import {
  SCHEDULER_CONFIG,
  EXECUTION_STATUS,
  TRIGGER_TYPE,
} from '../config/scheduler.config';
import { JOB_EXECUTION_EVENTS } from '../config/queue.config';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('SchedulerService');
  private isRunning = false;

  constructor(
    private readonly scheduledJobService: ScheduledJobService,
    private readonly executionService: JobExecutionService,
    private readonly triggerProducer: JobTriggerProducer,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    this.isRunning = true;
    this.logger.info('Scheduler service initialized');
  }

  async onModuleDestroy() {
    this.isRunning = false;
    await this.triggerProducer.closeAll();
    this.logger.info('Scheduler service destroyed');
  }

  /**
   * Check for due jobs every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkDueJobs() {
    if (!this.isRunning) {
      return;
    }

    const now = new Date();
    this.logger.debug('Checking for due jobs', { time: now.toISOString() });

    try {
      const dueJobs = await this.scheduledJobService.findDueJobs(now);

      if (dueJobs.length > 0) {
        this.logger.info(`Found ${dueJobs.length} due jobs`);
      }

      for (const job of dueJobs) {
        await this.triggerJobInternal(job, TRIGGER_TYPE.SCHEDULER);
      }
    } catch (error) {
      this.logger.error('Error checking due jobs', { error: error.message });
    }
  }

  /**
   * Check for timed out executions every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkTimeoutExecutions() {
    if (!this.isRunning) {
      return;
    }

    this.logger.debug('Checking for timed out executions');

    try {
      const timedOutExecutions = await this.executionService.findTimedOutExecutions();

      if (timedOutExecutions.length > 0) {
        this.logger.info(`Found ${timedOutExecutions.length} timed out executions`);
      }

      for (const execution of timedOutExecutions) {
        await this.handleTimeout(execution);
      }
    } catch (error) {
      this.logger.error('Error checking timeout executions', { error: error.message });
    }
  }

  /**
   * Manually trigger a job
   */
  async triggerJob(
    job: ScheduledJob,
    userId?: string,
  ): Promise<JobExecution> {
    return this.triggerJobInternal(job, TRIGGER_TYPE.MANUAL, userId);
  }

  /**
   * Internal job trigger logic
   */
  private async triggerJobInternal(
    job: ScheduledJob,
    triggeredBy: 'scheduler' | 'manual',
    triggeredByUser?: string,
  ): Promise<JobExecution> {
    this.logger.info('Triggering job', {
      jobId: (job as any)._id,
      jobName: job.name,
      triggeredBy,
    });

    // Create execution record
    const execution = await this.executionService.createExecution({
      job,
      triggeredBy,
      triggeredByUser,
    });

    try {
      // Push to target queue
      await this.triggerProducer.triggerJob(execution, job);

      // Mark as queued
      await this.executionService.markAsQueued((execution as any)._id.toString());

      // Emit event
      this.eventEmitter.emit(JOB_EXECUTION_EVENTS.QUEUED, {
        executionId: (execution as any)._id,
        jobId: (job as any)._id,
        jobName: job.name,
        correlationId: execution.correlationId,
      });

      // Update job's nextRunAt if triggered by scheduler
      if (triggeredBy === TRIGGER_TYPE.SCHEDULER) {
        await this.scheduledJobService.updateAfterExecution(
          (job as any)._id.toString(),
          EXECUTION_STATUS.QUEUED,
        );
      }

      this.logger.info('Job triggered successfully', {
        executionId: (execution as any)._id,
        jobName: job.name,
        targetQueue: job.targetQueue,
      });

      return execution;
    } catch (error) {
      this.logger.error('Error triggering job', {
        jobId: (job as any)._id,
        jobName: job.name,
        error: error.message,
      });

      // Mark execution as failed
      await this.executionService.updateFromResult({
        executionId: (execution as any)._id.toString(),
        status: 'failed',
        error: {
          message: `Failed to push job to queue: ${error.message}`,
          code: 'QUEUE_ERROR',
        },
      });

      throw error;
    }
  }

  /**
   * Handle timed out execution
   */
  private async handleTimeout(execution: JobExecution): Promise<void> {
    this.logger.warn('Handling timeout execution', {
      executionId: (execution as any)._id,
      jobName: execution.jobName,
    });

    // Mark as timeout
    await this.executionService.markAsTimeout((execution as any)._id.toString());

    // Emit timeout event
    this.eventEmitter.emit(JOB_EXECUTION_EVENTS.TIMEOUT, {
      executionId: (execution as any)._id,
      jobId: execution.jobId,
      jobName: execution.jobName,
      correlationId: execution.correlationId,
    });

    // Check if should retry
    const job = await this.scheduledJobService.findById(execution.jobId as any, undefined as any);
    if (!job) {
      this.logger.warn('Job not found for timeout retry check', {
        jobId: execution.jobId,
      });
      return;
    }

    const retryResult = await this.executionService.scheduleRetry(execution, job);

    if (retryResult.shouldRetry) {
      this.logger.info('Retry scheduled for timed out execution', {
        executionId: (execution as any)._id,
        retryCount: retryResult.retryCount,
        nextRetryAt: retryResult.nextRetryAt,
      });

      // Create new execution for retry
      const retryExecution = await this.executionService.createExecution({
        job,
        triggeredBy: TRIGGER_TYPE.SCHEDULER,
        retryOf: (execution as any)._id,
        retryCount: retryResult.retryCount,
      });

      // Trigger the retry
      await this.triggerProducer.triggerJob(retryExecution, job);
      await this.executionService.markAsQueued((retryExecution as any)._id.toString());

      this.eventEmitter.emit(JOB_EXECUTION_EVENTS.RETRY_SCHEDULED, {
        executionId: (retryExecution as any)._id,
        retryOf: (execution as any)._id,
        retryCount: retryResult.retryCount,
      });
    } else {
      this.logger.warn('Max retries reached for execution', {
        executionId: (execution as any)._id,
        jobName: execution.jobName,
      });

      // Update job status
      await this.scheduledJobService.updateAfterExecution(
        execution.jobId.toString(),
        EXECUTION_STATUS.FAILED,
      );

      this.eventEmitter.emit(JOB_EXECUTION_EVENTS.RETRY_EXHAUSTED, {
        executionId: (execution as any)._id,
        jobId: execution.jobId,
        jobName: execution.jobName,
      });
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): { isRunning: boolean; message: string } {
    return {
      isRunning: this.isRunning,
      message: this.isRunning ? 'Scheduler is running' : 'Scheduler is stopped',
    };
  }
}
