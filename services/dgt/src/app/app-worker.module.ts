import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { redisConfig } from '../config/redis.config';
import { QUEUE_NAMES } from '../config/queue.config';

// Group 2: Market Data modules (workers write to these)
import { MarketPriceModule } from '../modules/market-price/market-price.module';
import { TechnicalIndicatorModule } from '../modules/technical-indicator/technical-indicator.module';
import { MacroIndicatorModule } from '../modules/macro-indicator/macro-indicator.module';
import { SentimentSignalModule } from '../modules/sentiment-signal/sentiment-signal.module';

// Queue processors
import { ProcessorsModule } from '../queues/processors.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'services/dgt/.env',
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

    // Group 2: Market Data (shared, written by collectors)
    MarketPriceModule,
    TechnicalIndicatorModule,
    MacroIndicatorModule,
    SentimentSignalModule,

    // Processors & Collectors
    ProcessorsModule,
  ],
})
export class AppWorkerModule {}
