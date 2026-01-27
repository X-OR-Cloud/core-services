import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { redisConfig } from '../config/redis.config';
import { QUEUE_NAMES } from '../config/queue.config';
import { CategoryProducer } from './producers/category.producer';
import { ProductProducer } from './producers/product.producer';
import { ReportProducer } from './producers/report.producer';

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
      { name: QUEUE_NAMES.CATEGORIES },
      { name: QUEUE_NAMES.PRODUCTS },
      { name: QUEUE_NAMES.REPORTS }
    ),
  ],
  providers: [
    CategoryProducer,
    ProductProducer,
    ReportProducer,
  ],
  exports: [
    CategoryProducer,
    ProductProducer,
    ReportProducer,
    BullModule,
  ],
})
export class QueueModule {}
