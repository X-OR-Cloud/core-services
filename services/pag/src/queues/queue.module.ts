import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { redisConfig } from '../config/redis.config';
import { QUEUE_NAMES } from '../config/queue.config';
import { InboundProducer } from './producers/inbound.producer';
import { MemoryProducer } from './producers/memory.producer';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.db,
      },
    }),
    // Register static queues
    BullModule.registerQueue(
      { name: QUEUE_NAMES.HEARTBEAT },
      { name: QUEUE_NAMES.MEMORY_EXTRACT },
      { name: QUEUE_NAMES.TOKEN_REFRESH }
    ),
  ],
  providers: [
    InboundProducer,
    MemoryProducer,
  ],
  exports: [
    InboundProducer,
    MemoryProducer,
    BullModule,
  ],
})
export class QueueModule {}
