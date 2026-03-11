import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SignalController } from './signal.controller';
import { SignalService } from './signal.service';
import { Signal, SignalSchema } from './signal.schema';
import { SignalLlmCollector } from '../../collectors/signal-llm.collector';
import { MarketPriceModule } from '../market-price/market-price.module';
import { TechnicalIndicatorModule } from '../technical-indicator/technical-indicator.module';
import { AccountModule } from '../account/account.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Signal.name, schema: SignalSchema }]),
    AccountModule,
    MarketPriceModule,
    TechnicalIndicatorModule,
  ],
  controllers: [SignalController],
  providers: [SignalService, SignalLlmCollector],
  exports: [SignalService, MongooseModule],
})
export class SignalModule {}
