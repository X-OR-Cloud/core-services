import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createLogger } from '@hydrabyte/shared';
import { redisConfig } from '../../config/redis.config';
import { JOB_NAMES } from '../../config/queue.config';
import { ScheduledJob } from '../../modules/scheduled-job/scheduled-job.schema';
import { JobExecution } from '../../modules/job-execution/job-execution.schema';

interface TriggerJobMessage {
  executionId: string;
  jobId: string;
  jobName: string;
  payload: Record<string, any>;
  correlationId: string;
  triggeredAt: string;
  timeout: number;
  metadata: {
    retryCount: number;
    priority: number;
  };
}

@Injectable()
export class JobTriggerProducer {
  private readonly logger = createLogger('JobTriggerProducer');
  private queues: Map<string, Queue> = new Map();

  /**
   * Get or create a queue for the target
   */
  private getQueue(queueName: string): Queue {
    if (!this.queues.has(queueName)) {
      const queue = new Queue(queueName, {
        connection: {
          host: redisConfig.host,
          port: redisConfig.port,
          password: redisConfig.password || undefined,
          db: redisConfig.db,
        },
      });
      this.queues.set(queueName, queue);
    }
    return this.queues.get(queueName)!;
  }

  /**
   * Trigger a job by pushing message to target queue
   */
  async triggerJob(execution: JobExecution, job: ScheduledJob): Promise<void> {
    const queue = this.getQueue(job.targetQueue);

    const message: TriggerJobMessage = {
      executionId: (execution as any)._id.toString(),
      jobId: (job as any)._id.toString(),
      jobName: job.name,
      payload: job.payload,
      correlationId: execution.correlationId,
      triggeredAt: execution.triggeredAt.toISOString(),
      timeout: job.timeout,
      metadata: {
        retryCount: execution.retryCount,
        priority: job.priority,
      },
    };

    await queue.add(JOB_NAMES.TRIGGER_JOB, message, {
      priority: job.priority,
      attempts: 1, // SCHD handles retry logic, not BullMQ
      removeOnComplete: {
        age: 24 * 3600, // 24 hours
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // 7 days
      },
    });

    this.logger.info('Job triggered', {
      executionId: message.executionId,
      jobId: message.jobId,
      jobName: message.jobName,
      targetQueue: job.targetQueue,
      correlationId: message.correlationId,
    });
  }

  /**
   * Close all queue connections
   */
  async closeAll(): Promise<void> {
    for (const [name, queue] of this.queues) {
      await queue.close();
      this.logger.debug(`Queue closed: ${name}`);
    }
    this.queues.clear();
  }
}
