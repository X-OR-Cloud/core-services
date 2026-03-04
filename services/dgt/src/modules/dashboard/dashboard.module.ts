import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { AccountModule } from '../account/account.module';
import { PositionModule } from '../position/position.module';
import { MarketPriceModule } from '../market-price/market-price.module';
import { PortfolioSnapshotModule } from '../portfolio-snapshot/portfolio-snapshot.module';

@Module({
  imports: [AccountModule, PositionModule, MarketPriceModule, PortfolioSnapshotModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
