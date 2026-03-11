import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AccountModule } from '../modules/account/account.module';
import { OrderModule } from '../modules/order/order.module';
import { PositionModule } from '../modules/position/position.module';
import { MarketPriceModule } from '../modules/market-price/market-price.module';
import { MonitoringWorker } from '../workers/monitoring.worker';

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

    // Only modules needed by MonitoringWorker
    AccountModule,
    OrderModule,
    PositionModule,
    MarketPriceModule,
  ],
  providers: [MonitoringWorker],
})
export class AppMonitorModule {}
