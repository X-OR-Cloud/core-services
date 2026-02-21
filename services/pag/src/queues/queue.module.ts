import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { redisConfig } from '../config/redis.config';
import { QUEUE_NAMES } from '../config/queue.config';
import { InboundProducer } from './producers/inbound.producer';
import { MemoryProducer } from './producers/memory.producer';
import { TaskProducer } from './producers/task.producer';

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
      { name: QUEUE_NAMES.INBOUND },
      { name: QUEUE_NAMES.HEARTBEAT },
      { name: QUEUE_NAMES.MEMORY_EXTRACT },
      { name: QUEUE_NAMES.TOKEN_REFRESH },
      { name: QUEUE_NAMES.TASKS }
    ),
  ],
  providers: [
    InboundProducer,
    MemoryProducer,
    TaskProducer,
  ],
  exports: [
    InboundProducer,
    MemoryProducer,
    TaskProducer,
    BullModule,
  ],
})
export class QueueModule {}
