import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, QUEUE_EVENTS } from '../../config/queue.config';

@Injectable()
export class MemoryProducer {
  constructor(
    @InjectQueue(QUEUE_NAMES.MEMORY_EXTRACT) private memoryQueue: Queue,
  ) {}

  /**
   * Trigger memory extraction for a conversation
   */
  async triggerMemoryExtract(data: {
    conversationId: string;
    platformUserId: string;
    soulId: string;
    messageCount?: number; // Number of recent messages to analyze
  }) {
    await this.memoryQueue.add(QUEUE_EVENTS.MEMORY_EXTRACT, {
      event: QUEUE_EVENTS.MEMORY_EXTRACT,
      data: {
        ...data,
        messageCount: data.messageCount || 10, // Default to last 10 messages
      },
      timestamp: new Date().toISOString(),
    }, {
      // Job options
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      delay: 5000, // 5 second delay to allow conversation processing to complete
      removeOnComplete: 100,
      removeOnFail: 50,
    });
  }
}