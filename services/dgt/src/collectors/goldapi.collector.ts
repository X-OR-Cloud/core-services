import { Injectable } from '@nestjs/common';
import { BaseCollector } from './base.collector';
import { MarketPriceService } from '../modules/market-price/market-price.service';

@Injectable()
export class GoldapiCollector extends BaseCollector {
  protected readonly name = 'GoldAPI';

  constructor(
    private readonly marketPriceService: MarketPriceService,
  ) {
    super();
  }

  async collect(params: Record<string, any>): Promise<void> {
    const { symbol = 'XAU', currency = 'USD' } = params;

    // TODO: Read API key from Settings (DB) instead of env
    const apiKey = process.env['GOLDAPI_KEY'] || '';
    if (!apiKey) {
      this.logger.warn(`[${this.name}] No API key configured, skipping`);
      return;
    }

    const url = `https://www.goldapi.io/api/${symbol}/${currency}`;
    const data = await this.fetchWithRetry(url, {
      headers: { 'x-access-token': apiKey },
    });

    await this.marketPriceService.insert({
      symbol: `${symbol}${currency}`,
      source: 'goldapi',
      timeframe: '1m',
      open: data.open_price,
      high: data.high_price,
      low: data.low_price,
      close: data.price,
      timestamp: new Date(data.timestamp * 1000),
      extra: {
        change: data.ch,
        changePct: data.chp,
      },
    });

    this.logger.info(`[${this.name}] Saved ${symbol}${currency} price: ${data.price}`);
  }
}
