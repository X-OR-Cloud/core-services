import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
// import { InboundProcessor } from './processors/inbound.processor'; // TODO: Dynamic processor
import { MemoryProcessor } from './processors/memory.processor';
import { HeartbeatProcessor } from './processors/heartbeat.processor';
import { TokenRefreshProcessor } from './processors/token-refresh.processor';

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
    // InboundProcessor, // TODO: Dynamic processor for soul-specific queues - implement separately
    MemoryProcessor,
    HeartbeatProcessor,
    TokenRefreshProcessor,
  ],
})
export class ProcessorsModule {}