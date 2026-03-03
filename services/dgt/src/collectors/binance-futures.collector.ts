import { Injectable } from '@nestjs/common';
import { BaseCollector } from './base.collector';
import { MarketPriceService } from '../modules/market-price/market-price.service';
import { SentimentSignalService } from '../modules/sentiment-signal/sentiment-signal.service';

@Injectable()
export class BinanceFuturesCollector extends BaseCollector {
  protected readonly name = 'BinanceFutures';
  private readonly baseUrl = 'https://fapi.binance.com';

  constructor(
    private readonly marketPriceService: MarketPriceService,
    private readonly sentimentSignalService: SentimentSignalService,
  ) {
    super();
  }

  async collect(params: Record<string, any>): Promise<void> {
    const { symbol = 'PAXGUSDT' } = params;

    // 1. Premium Index (mark price, funding rate)
    const premiumIndex = await this.fetchWithRetry(
      `${this.baseUrl}/fapi/v1/premiumIndex?symbol=${symbol}`,
    );

    // 2. Open Interest History
    let openInterestUsd = 0;
    try {
      const oiData = await this.fetchWithRetry(
        `${this.baseUrl}/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=1`,
      );
      if (oiData?.length) {
        openInterestUsd = parseFloat(oiData[0].sumOpenInterestValue);
      }
    } catch {
      this.logger.warn(`[${this.name}] Failed to fetch OI for ${symbol}`);
    }

    // 3. Long/Short Ratio
    let longShortRatio = 0;
    try {
      const lsData = await this.fetchWithRetry(
        `${this.baseUrl}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`,
      );
      if (lsData?.length) {
        longShortRatio = parseFloat(lsData[0].longShortRatio);
      }
    } catch {
      this.logger.warn(`[${this.name}] Failed to fetch L/S ratio for ${symbol}`);
    }

    const markPrice = parseFloat(premiumIndex.markPrice);
    const indexPrice = parseFloat(premiumIndex.indexPrice);
    const fundingRate = parseFloat(premiumIndex.lastFundingRate);
    const now = new Date();

    // Save MarketPrice
    await this.marketPriceService.insert({
      symbol,
      source: 'binance_futures',
      timeframe: '1m',
      close: markPrice,
      timestamp: now,
      extra: {
        markPrice,
        indexPrice,
        fundingRate,
      },
    });

    // Save SentimentSignal
    const fundingRateAnnualized = fundingRate * 3 * 365 * 100; // 3 funding/day * 365 days * 100%
    await this.sentimentSignalService.insert({
      timestamp: now,
      source: 'binance_futures',
      fundingRateAnnualized,
      longShortRatio,
      openInterestUsd,
    });

    this.logger.info(`[${this.name}] Saved ${symbol} mark: ${markPrice}, funding: ${(fundingRate * 100).toFixed(4)}%`);
  }
}
