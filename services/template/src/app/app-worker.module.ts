import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { redisConfig } from '../config/redis.config';
import { QUEUE_NAMES } from '../config/queue.config';
import { CategoryModule } from '../modules/category/category.module';
import { ProductModule } from '../modules/product/product.module';
import { ReportModule } from '../modules/report/report.module';
import { CategoryProcessor } from '../queues/processors/category.processor';
import { ProductProcessor } from '../queues/processors/product.processor';
import { ReportProcessor } from '../queues/processors/report.processor';

/**
 * Worker mode module — no HTTP server, only BullMQ processors.
 * Run with: MODE=wrk nx run template:wrk
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRoot(
      process.env['MONGODB_URI'] || 'mongodb://localhost:27017',
      { dbName: 'core_template' },
    ),
    BullModule.forRoot({ connection: redisConfig }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.CATEGORIES },
      { name: QUEUE_NAMES.PRODUCTS },
      { name: QUEUE_NAMES.REPORTS },
    ),
    CategoryModule,
    ProductModule,
    ReportModule,
  ],
  providers: [
    CategoryProcessor,
    ProductProcessor,
    ReportProcessor,
  ],
})
export class AppWorkerModule {}
