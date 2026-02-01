import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { redisConfig } from '../config/redis.config';
import { QUEUE_NAMES } from '../config/queue.config';
import { JobTriggerProducer } from './producers/job-trigger.producer';

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
    BullModule.registerQueue(
      { name: QUEUE_NAMES.JOB_RESULTS },
    ),
  ],
  providers: [
    JobTriggerProducer,
  ],
  exports: [
    JobTriggerProducer,
    BullModule,
  ],
})
export class QueueModule {}
