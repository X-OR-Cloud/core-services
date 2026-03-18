import { Module } from '@nestjs/common';
import { InsightsController } from './insights.controller';
import { InsightsMacroService } from './insights-macro.service';
import { InsightsDataService } from './insights-data.service';
import { MacroIndicatorModule } from '../macro-indicator/macro-indicator.module';
import { SentimentSignalModule } from '../sentiment-signal/sentiment-signal.module';
import { TechnicalIndicatorModule } from '../technical-indicator/technical-indicator.module';
import { MarketPriceModule } from '../market-price/market-price.module';
import { SignalModule } from '../signal/signal.module';

@Module({
  imports: [
    MacroIndicatorModule,
    SentimentSignalModule,
    TechnicalIndicatorModule,
    MarketPriceModule,
    SignalModule,
  ],
  controllers: [InsightsController],
  providers: [InsightsMacroService, InsightsDataService],
})
export class InsightsModule {}
