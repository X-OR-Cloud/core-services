import { Module } from '@nestjs/common';
import { MarketPriceModule } from '../modules/market-price/market-price.module';
import { TechnicalIndicatorModule } from '../modules/technical-indicator/technical-indicator.module';
import { IndicatorComputationService } from './indicator-computation.service';

@Module({
  imports: [
    MarketPriceModule,
    TechnicalIndicatorModule,
  ],
  providers: [IndicatorComputationService],
  exports: [IndicatorComputationService],
})
export class IndicatorsModule {}
