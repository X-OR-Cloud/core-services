import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { redisConfig } from '../config/redis.config';
import { QUEUE_NAMES } from '../config/queue.config';

// Group 1: User & Account
import { AccountModule } from '../modules/account/account.module';

// Group 2: Market Data modules (read by signal collectors)
import { MarketPriceModule } from '../modules/market-price/market-price.module';
import { TechnicalIndicatorModule } from '../modules/technical-indicator/technical-indicator.module';

// Group 5: AI Signal
import { SignalModule } from '../modules/signal/signal.module';

// Queue processors
import { SignalProcessorsModule } from '../queues/signal-processors.module';

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
      { name: QUEUE_NAMES.SIGNAL_SCHEDULER },
      { name: QUEUE_NAMES.SIGNAL_GENERATION },
    ),

    // Group 1: User & Account
    AccountModule,

    // Group 2: Market Data (read by signal collectors)
    MarketPriceModule,
    TechnicalIndicatorModule,

    // Group 5: AI Signal
    SignalModule,

    // Processors & Collectors
    SignalProcessorsModule,
  ],
})
export class AppSignalModule {}
