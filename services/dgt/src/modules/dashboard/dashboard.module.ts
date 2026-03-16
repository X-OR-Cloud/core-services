import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { AccountModule } from '../account/account.module';
import { PositionModule } from '../position/position.module';
import { MarketPriceModule } from '../market-price/market-price.module';
import { PortfolioSnapshotModule } from '../portfolio-snapshot/portfolio-snapshot.module';
import { TechnicalIndicatorModule } from '../technical-indicator/technical-indicator.module';
import { MacroIndicatorModule } from '../macro-indicator/macro-indicator.module';
import { SignalModule } from '../signal/signal.module';
import { BotActivityLogModule } from '../bot-activity-log/bot-activity-log.module';

@Module({
  imports: [
    AccountModule,
    PositionModule,
    MarketPriceModule,
    PortfolioSnapshotModule,
    TechnicalIndicatorModule,
    MacroIndicatorModule,
    SignalModule,
    BotActivityLogModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
