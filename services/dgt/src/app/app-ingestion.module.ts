import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { redisConfig } from '../config/redis.config';
import { QUEUE_NAMES } from '../config/queue.config';
import { CollectorsModule } from '../collectors/collectors.module';
import { IndicatorsModule } from '../indicators/indicators.module';
import { DataIngestionProcessor } from '../queues/data-ingestion.processor';
import { TechnicalIndicatorModule } from '../modules/technical-indicator/technical-indicator.module';

/**
 * AppIngestionModule — mode=ing
 * Consumes jobs from DATA_INGESTION queue and runs collectors.
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

    TechnicalIndicatorModule,
    CollectorsModule,
    IndicatorsModule,
  ],
  providers: [DataIngestionProcessor],
})
export class AppIngestionModule {}
