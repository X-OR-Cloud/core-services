import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from '../config/queue.config';
import { InboundProducer } from './producers/inbound.producer';
import { MemoryProducer } from './producers/memory.producer';
import { TaskProducer } from './producers/task.producer';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST') || 'localhost',
          port: parseInt(config.get('REDIS_PORT') || '6379', 10),
          username: config.get('REDIS_USERNAME') || undefined,
          password: config.get('REDIS_PASSWORD') || undefined,
          db: parseInt(config.get('REDIS_DB') || '0', 10),
          enableReadyCheck: false,
          maxRetriesPerRequest: null,
        },
      }),
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
