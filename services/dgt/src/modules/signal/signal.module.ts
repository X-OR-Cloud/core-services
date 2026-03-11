import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SignalController } from './signal.controller';
import { SignalService } from './signal.service';
import { Signal, SignalSchema } from './signal.schema';
import { SignalLlmCollector } from '../../collectors/signal-llm.collector';
import { MarketPriceModule } from '../market-price/market-price.module';
import { TechnicalIndicatorModule } from '../technical-indicator/technical-indicator.module';
import { AccountModule } from '../account/account.module';
import { SentimentSignalModule } from '../sentiment-signal/sentiment-signal.module';
import { MacroIndicatorModule } from '../macro-indicator/macro-indicator.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Signal.name, schema: SignalSchema }]),
    AccountModule,
    MarketPriceModule,
    TechnicalIndicatorModule,
    SentimentSignalModule,
    MacroIndicatorModule,
  ],
  controllers: [SignalController],
  providers: [SignalService, SignalLlmCollector],
  exports: [SignalService, MongooseModule],
})
export class SignalModule {}
