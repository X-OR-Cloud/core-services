import { Injectable } from '@nestjs/common';
import { BaseCollector } from './base.collector';
import { MarketPriceService } from '../modules/market-price/market-price.service';

@Injectable()
export class YahooFinanceCollector extends BaseCollector {
  protected readonly name = 'YahooFinance';
  private readonly baseUrl = 'https://query1.finance.yahoo.com/v8/finance/chart';

  constructor(
    private readonly marketPriceService: MarketPriceService,
  ) {
    super();
  }

  async collect(params: Record<string, any>): Promise<void> {
    const { symbols = [] } = params;

    for (const symbol of symbols) {
      try {
        await this.collectSymbol(symbol);
      } catch (error: any) {
        this.logger.error(`[${this.name}] Failed to collect ${symbol}: ${error.message}`);
      }
    }
  }

  private async collectSymbol(symbol: string): Promise<void> {
    const data = await this.fetchWithRetry(
      `${this.baseUrl}/${symbol}?interval=1d&range=1d`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      },
    );

    const result = data?.chart?.result?.[0];
    if (!result?.meta?.regularMarketPrice) {
      this.logger.warn(`[${this.name}] No quote data for ${symbol}`);
      return;
    }

    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];

    await this.marketPriceService.insert({
      symbol,
      source: 'yahoo',
      timeframe: '1h',
      open: quote?.open?.[0] ?? meta.chartPreviousClose,
      high: quote?.high?.[0] ?? meta.regularMarketPrice,
      low: quote?.low?.[0] ?? meta.regularMarketPrice,
      close: meta.regularMarketPrice,
      volume: quote?.volume?.[0] ?? 0,
      timestamp: new Date(),
    });

    this.logger.info(`[${this.name}] Saved ${symbol} price: ${meta.regularMarketPrice}`);
  }
}
