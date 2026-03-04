import { Module } from '@nestjs/common';
import { MarketPriceModule } from '../modules/market-price/market-price.module';
import { MacroIndicatorModule } from '../modules/macro-indicator/macro-indicator.module';
import { SentimentSignalModule } from '../modules/sentiment-signal/sentiment-signal.module';
import { AccountModule } from '../modules/account/account.module';
import { PositionModule } from '../modules/position/position.module';
import { PortfolioSnapshotModule } from '../modules/portfolio-snapshot/portfolio-snapshot.module';
import { GoldapiCollector } from './goldapi.collector';
import { BinanceSpotCollector } from './binance-spot.collector';
import { BinanceFuturesCollector } from './binance-futures.collector';
import { FredCollector } from './fred.collector';
import { OkxCollector } from './okx.collector';
import { BitfinexCollector } from './bitfinex.collector';
import { YahooFinanceCollector } from './yahoo-finance.collector';
import { BytetreeCollector } from './bytetree.collector';
import { NewsapiCollector } from './newsapi.collector';
import { PortfolioSnapshotCollector } from './portfolio-snapshot.collector';

const collectors = [
  GoldapiCollector,
  BinanceSpotCollector,
  BinanceFuturesCollector,
  FredCollector,
  OkxCollector,
  BitfinexCollector,
  YahooFinanceCollector,
  BytetreeCollector,
  NewsapiCollector,
  PortfolioSnapshotCollector,
];

@Module({
  imports: [
    MarketPriceModule,
    MacroIndicatorModule,
    SentimentSignalModule,
    AccountModule,
    PositionModule,
    PortfolioSnapshotModule,
  ],
  providers: [...collectors],
  exports: [...collectors],
})
export class CollectorsModule {}
