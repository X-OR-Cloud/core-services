import { Injectable } from '@nestjs/common';
import { BaseCollector } from './base.collector';
import { MarketPriceService } from '../modules/market-price/market-price.service';

@Injectable()
export class BinanceSpotCollector extends BaseCollector {
  protected readonly name = 'BinanceSpot';
  private readonly baseUrl = 'https://api.binance.com';

  constructor(
    private readonly marketPriceService: MarketPriceService,
  ) {
    super();
  }

  async collect(params: Record<string, any>): Promise<void> {
    const { symbols = ['PAXGUSDT'] } = params;

    for (const symbol of symbols) {
      await this.collectSymbol(symbol);
    }
  }

  private async collectSymbol(symbol: string): Promise<void> {
    // Fetch 24hr ticker
    const ticker = await this.fetchWithRetry(
      `${this.baseUrl}/api/v3/ticker/24hr?symbol=${symbol}`,
    );

    // Fetch orderbook for spread calculation
    let bidAskSpreadPct = 0;
    try {
      const depth = await this.fetchWithRetry(
        `${this.baseUrl}/api/v3/depth?symbol=${symbol}&limit=5`,
      );
      if (depth.bids?.length && depth.asks?.length) {
        const bestBid = parseFloat(depth.bids[0][0]);
        const bestAsk = parseFloat(depth.asks[0][0]);
        bidAskSpreadPct = ((bestAsk - bestBid) / bestBid) * 100;
      }
    } catch {
      this.logger.warn(`[${this.name}] Failed to fetch orderbook for ${symbol}`);
    }

    await this.marketPriceService.insert({
      symbol,
      source: 'binance_spot',
      timeframe: '1m',
      open: parseFloat(ticker.openPrice),
      high: parseFloat(ticker.highPrice),
      low: parseFloat(ticker.lowPrice),
      close: parseFloat(ticker.lastPrice),
      volume: parseFloat(ticker.volume),
      timestamp: new Date(ticker.closeTime),
      extra: {
        vwap: parseFloat(ticker.weightedAvgPrice),
        quoteVolume: parseFloat(ticker.quoteVolume),
        bidAskSpreadPct,
      },
    });

    this.logger.info(`[${this.name}] Saved ${symbol} price: ${ticker.lastPrice}`);
  }
}
