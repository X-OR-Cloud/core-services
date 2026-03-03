import { Injectable } from '@nestjs/common';
import { BaseCollector } from './base.collector';
import { MarketPriceService } from '../modules/market-price/market-price.service';

@Injectable()
export class OkxCollector extends BaseCollector {
  protected readonly name = 'OKX';

  constructor(
    private readonly marketPriceService: MarketPriceService,
  ) {
    super();
  }

  async collect(params: Record<string, any>): Promise<void> {
    const { instId = 'PAXG-USDT' } = params;

    const data = await this.fetchWithRetry(
      `https://www.okx.com/api/v5/market/ticker?instId=${instId}`,
    );

    const ticker = data.data?.[0];
    if (!ticker) {
      this.logger.warn(`[${this.name}] No ticker data for ${instId}`);
      return;
    }

    const symbol = instId.replace('-', '');

    await this.marketPriceService.insert({
      symbol,
      source: 'okx',
      timeframe: '5m',
      open: parseFloat(ticker.open24h),
      high: parseFloat(ticker.high24h),
      low: parseFloat(ticker.low24h),
      close: parseFloat(ticker.last),
      volume: parseFloat(ticker.vol24h),
      timestamp: new Date(parseInt(ticker.ts)),
    });

    this.logger.info(`[${this.name}] Saved ${symbol} price: ${ticker.last}`);
  }
}
