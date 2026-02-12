import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, QUEUE_EVENTS, getInboundQueueName } from '../../config/queue.config';
import { redisConfig } from '../../config/redis.config';

@Injectable()
export class InboundProducer {
  private readonly logger = new Logger(InboundProducer.name);
  private queueInstances = new Map<string, Queue>();

  /**
   * Get or create a queue instance for a specific soul
   */
  private getQueueForSoul(soulSlug: string): Queue {
    const queueName = getInboundQueueName(soulSlug);
    
    if (!this.queueInstances.has(queueName)) {
      const queue = new Queue(queueName, {
        connection: {
          host: redisConfig.host,
          port: redisConfig.port,
          password: redisConfig.password,
          db: redisConfig.db,
        },
      });
      this.queueInstances.set(queueName, queue);
      this.logger.log(`Created queue instance: ${queueName}`);
    }

    return this.queueInstances.get(queueName)!;
  }

  /**
   * Publish a message job to the appropriate soul's queue
   */
  async publishMessageJob(data: {
    conversationId: string;
    messageId: string;
    soulSlug: string;
    platformUserId: string;
    messageText: string;
    channelId: string;
  }) {
    const queue = this.getQueueForSoul(data.soulSlug);
    
    const jobData = {
      event: QUEUE_EVENTS.MESSAGE_RECEIVED,
      data,
      timestamp: new Date().toISOString(),
    };

    await queue.add(QUEUE_EVENTS.MESSAGE_RECEIVED, jobData, {
      // Job options
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 50, // Keep last 50 completed jobs
      removeOnFail: 20,     // Keep last 20 failed jobs
    });

    this.logger.log(`Published message job to queue: ${queue.name}, conversation: ${data.conversationId}`);
  }

  /**
   * Clean up queue instances when service shuts down
   */
  async onModuleDestroy() {
    for (const [queueName, queue] of this.queueInstances) {
      await queue.close();
      this.logger.log(`Closed queue: ${queueName}`);
    }
    this.queueInstances.clear();
  }
}