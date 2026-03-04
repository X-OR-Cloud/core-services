import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AccountModule } from '../account/account.module';
import { PositionModule } from '../position/position.module';
import { TradeModule } from '../trade/trade.module';

@Module({
  imports: [AccountModule, PositionModule, TradeModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
