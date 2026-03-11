import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { redisConfig } from '../config/redis.config';
import { QUEUE_NAMES } from '../config/queue.config';
import { SchedulerProcessor } from '../queues/scheduler.processor';

/**
 * AppSchedulerModule — mode=shd
 * Registers repeatable BullMQ jobs only. Does NOT consume jobs.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRoot(
      process.env['MONGODB_URI'] || 'mongodb://localhost:27017',
      { dbName: 'core_dgt' },
    ),
    BullModule.forRoot({
      connection: redisConfig,
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.SCHEDULER },
      { name: QUEUE_NAMES.DATA_INGESTION },
    ),
  ],
  providers: [SchedulerProcessor],
})
export class AppSchedulerModule {}
