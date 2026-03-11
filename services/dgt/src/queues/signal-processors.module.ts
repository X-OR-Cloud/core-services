import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../config/queue.config';
import { SignalSchedulerProcessor } from './signal-scheduler.processor';
import { SignalGenerationProcessor } from './signal-generation.processor';
import { AccountModule } from '../modules/account/account.module';
import { SignalModule } from '../modules/signal/signal.module';
import { MarketPriceModule } from '../modules/market-price/market-price.module';
import { TechnicalIndicatorModule } from '../modules/technical-indicator/technical-indicator.module';
import { SentimentSignalModule } from '../modules/sentiment-signal/sentiment-signal.module';
import { MacroIndicatorModule } from '../modules/macro-indicator/macro-indicator.module';
import { SignalLlmCollector } from '../collectors/signal-llm.collector';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.SIGNAL_SCHEDULER },
      { name: QUEUE_NAMES.SIGNAL_GENERATION },
    ),
    AccountModule,
    SignalModule,
    MarketPriceModule,
    TechnicalIndicatorModule,
    SentimentSignalModule,
    MacroIndicatorModule,
  ],
  providers: [
    SignalSchedulerProcessor,
    SignalGenerationProcessor,
    SignalLlmCollector,
  ],
  exports: [
    SignalSchedulerProcessor,
    SignalGenerationProcessor,
  ],
})
export class SignalProcessorsModule {}
