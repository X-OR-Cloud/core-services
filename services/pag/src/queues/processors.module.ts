import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InboundProcessor } from './processors/inbound.processor';
import { MemoryProcessor } from './processors/memory.processor';
import { HeartbeatProcessor } from './processors/heartbeat.processor';
import { TokenRefreshProcessor } from './processors/token-refresh.processor';
import { MemoryProducer } from './producers/memory.producer';

// Import entity modules
import { SoulsModule } from '../modules/souls/souls.module';
import { ConversationsModule } from '../modules/conversations/conversations.module';
import { MessagesModule } from '../modules/messages/messages.module';
import { MemoriesModule } from '../modules/memories/memories.module';
import { ChannelsModule } from '../modules/channels/channels.module';

// Import queue config
import { QUEUE_NAMES } from '../config/queue.config';

@Module({
  imports: [
    // Register queues for processors
    BullModule.registerQueue(
      { name: QUEUE_NAMES.INBOUND },
      { name: QUEUE_NAMES.HEARTBEAT },
      { name: QUEUE_NAMES.MEMORY_EXTRACT },
      { name: QUEUE_NAMES.TOKEN_REFRESH }
    ),
    // Import entity modules for services
    SoulsModule,
    ConversationsModule,
    MessagesModule,
    MemoriesModule,
    ChannelsModule,
  ],
  providers: [
    InboundProcessor,
    MemoryProcessor,
    HeartbeatProcessor,
    TokenRefreshProcessor,
    MemoryProducer,
  ],
})
export class ProcessorsModule implements OnModuleInit {
  private readonly logger = new Logger(ProcessorsModule.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.TOKEN_REFRESH) private tokenRefreshQueue: Queue,
  ) {}

  async onModuleInit() {
    // Schedule token refresh every 30 minutes
    const jobName = 'scheduled-token-refresh';
    
    // Remove existing repeatable to avoid duplicates
    const existing = await this.tokenRefreshQueue.getRepeatableJobs();
    for (const job of existing) {
      await this.tokenRefreshQueue.removeRepeatableByKey(job.key);
    }

    await this.tokenRefreshQueue.add(jobName, { triggeredAt: new Date().toISOString() }, {
      repeat: { every: 30 * 60 * 1000 }, // every 30 min
      removeOnComplete: 5,
      removeOnFail: 5,
    });
    this.logger.log('Token refresh scheduled: every 30 minutes');
  }
}