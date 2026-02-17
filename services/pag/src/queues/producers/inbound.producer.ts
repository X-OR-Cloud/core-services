import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, QUEUE_EVENTS } from '../../config/queue.config';

@Injectable()
export class InboundProducer {
  private readonly logger = new Logger(InboundProducer.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.INBOUND) private readonly inboundQueue: Queue,
  ) {}

  async publishMessageJob(data: {
    conversationId: string;
    messageId: string;
    soulSlug: string;
    platformUserId: string;
    messageText: string;
    channelId: string;
  }) {
    const jobData = {
      event: QUEUE_EVENTS.MESSAGE_RECEIVED,
      data,
      timestamp: new Date().toISOString(),
    };

    await this.inboundQueue.add(QUEUE_EVENTS.MESSAGE_RECEIVED, jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 50,
      removeOnFail: 20,
    });

    this.logger.log(`Published message job to queue: ${QUEUE_NAMES.INBOUND}, conversation: ${data.conversationId}`);
  }
}
