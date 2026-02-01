import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { createLogger } from '@hydrabyte/shared';
import { QUEUE_NAMES, JOB_EXECUTION_EVENTS } from '../../config/queue.config';
import { JobExecutionService } from '../../modules/job-execution/job-execution.service';
import { ScheduledJobService } from '../../modules/scheduled-job/scheduled-job.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface JobResultMessage {
  executionId: string;
  correlationId: string;
  status: 'completed' | 'failed';
  result?: Record<string, any>;
  error?: {
    message: string;
    code?: string;
  };
  startedAt: string;
  completedAt: string;
  processedBy: string;
}

@Processor(QUEUE_NAMES.JOB_RESULTS)
@Injectable()
export class JobResultProcessor extends WorkerHost {
  private readonly logger = createLogger('JobResultProcessor');

  constructor(
    private readonly executionService: JobExecutionService,
    private readonly scheduledJobService: ScheduledJobService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<JobResultMessage>): Promise<void> {
    const { executionId, status, result, error, startedAt, completedAt, correlationId } = job.data;

    this.logger.info('Processing job result', {
      executionId,
      status,
      correlationId,
    });

    try {
      // Update execution record
      const execution = await this.executionService.updateFromResult({
        executionId,
        status,
        result,
        error,
        startedAt: startedAt ? new Date(startedAt) : undefined,
        completedAt: completedAt ? new Date(completedAt) : undefined,
      });

      if (!execution) {
        this.logger.warn('Execution not found for result', { executionId });
        return;
      }

      // Update job's last execution status
      await this.scheduledJobService.updateAfterExecution(
        execution.jobId.toString(),
        status,
      );

      // Emit event
      const eventName = status === 'completed'
        ? JOB_EXECUTION_EVENTS.COMPLETED
        : JOB_EXECUTION_EVENTS.FAILED;

      this.eventEmitter.emit(eventName, {
        executionId,
        jobId: execution.jobId.toString(),
        jobName: execution.jobName,
        status,
        correlationId,
      });

      this.logger.info('Job result processed', {
        executionId,
        status,
        duration: execution.duration,
      });
    } catch (err) {
      this.logger.error('Error processing job result', {
        executionId,
        error: err.message,
      });
      throw err;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<JobResultMessage>) {
    this.logger.debug('Result processor job completed', {
      jobId: job.id,
      executionId: job.data.executionId,
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<JobResultMessage>, error: Error) {
    this.logger.error('Result processor job failed', {
      jobId: job.id,
      executionId: job.data.executionId,
      error: error.message,
    });
  }
}
