import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { HealthModule, JwtStrategy, CorrelationIdMiddleware } from '@hydrabyte/base';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Group 1: User & Account
import { AccountModule } from '../modules/account/account.module';
import { RiskProfileModule } from '../modules/risk-profile/risk-profile.module';

// Group 2: Market Data (Shared)
import { MarketPriceModule } from '../modules/market-price/market-price.module';
import { TechnicalIndicatorModule } from '../modules/technical-indicator/technical-indicator.module';
import { MacroIndicatorModule } from '../modules/macro-indicator/macro-indicator.module';
import { SentimentSignalModule } from '../modules/sentiment-signal/sentiment-signal.module';

// Group 3: Trading (Paper)
import { OrderModule } from '../modules/order/order.module';
import { TradeModule } from '../modules/trade/trade.module';
import { PositionModule } from '../modules/position/position.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'services/dgt/.env',
    }),
    MongooseModule.forRoot(
      process.env['MONGODB_URI'] || 'mongodb://localhost:27017',
      { dbName: 'core_dgt' },
    ),
    PassportModule,
    HealthModule,

    // Group 1: User & Account
    AccountModule,
    RiskProfileModule,

    // Group 2: Market Data (Shared)
    MarketPriceModule,
    TechnicalIndicatorModule,
    MacroIndicatorModule,
    SentimentSignalModule,

    // Group 3: Trading (Paper)
    OrderModule,
    TradeModule,
    PositionModule,
  ],
  controllers: [AppController],
  providers: [AppService, JwtStrategy],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
