import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../config/queue.config';

const VALID_QUEUES = Object.values(QUEUE_NAMES).filter((v) => typeof v === 'string') as string[];

@Injectable()
export class QueuesAdminService {
  private readonly queues: Record<string, Queue>;

  constructor(
    @InjectQueue(QUEUE_NAMES.INBOUND) inboundQueue: Queue,
    @InjectQueue(QUEUE_NAMES.HEARTBEAT) heartbeatQueue: Queue,
    @InjectQueue(QUEUE_NAMES.MEMORY_EXTRACT) memoryQueue: Queue,
    @InjectQueue(QUEUE_NAMES.TOKEN_REFRESH) tokenRefreshQueue: Queue,
    @InjectQueue(QUEUE_NAMES.TASKS) tasksQueue: Queue,
  ) {
    this.queues = {
      [QUEUE_NAMES.INBOUND]: inboundQueue,
      [QUEUE_NAMES.HEARTBEAT]: heartbeatQueue,
      [QUEUE_NAMES.MEMORY_EXTRACT]: memoryQueue,
      [QUEUE_NAMES.TOKEN_REFRESH]: tokenRefreshQueue,
      [QUEUE_NAMES.TASKS]: tasksQueue,
    };
  }

  async getQueueStatus() {
    const entries = await Promise.all(
      Object.entries(this.queues).map(async ([name, queue]) => {
        const counts = await queue.getJobCounts('waiting', 'active', 'failed', 'completed', 'delayed');
        return [name, counts];
      }),
    );
    return Object.fromEntries(entries);
  }

  async retryFailedJobs(queueName: string): Promise<{ queueName: string; retriedCount: number }> {
    if (!VALID_QUEUES.includes(queueName)) {
      throw new BadRequestException(`Invalid queue name. Valid: ${VALID_QUEUES.join(', ')}`);
    }
    const queue = this.queues[queueName];
    const failedJobs = await queue.getFailed(0, 100);
    await Promise.all(failedJobs.map((job) => job.retry()));
    return { queueName, retriedCount: failedJobs.length };
  }
}
