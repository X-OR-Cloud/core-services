import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsExportService } from './analytics-export.service';
import { AccountModule } from '../account/account.module';
import { PositionModule } from '../position/position.module';
import { TradeModule } from '../trade/trade.module';
import { PortfolioSnapshotModule } from '../portfolio-snapshot/portfolio-snapshot.module';

@Module({
  imports: [AccountModule, PositionModule, TradeModule, PortfolioSnapshotModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsExportService],
})
export class AnalyticsModule {}
