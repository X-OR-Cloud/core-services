import { Injectable } from '@nestjs/common';
import { BaseCollector } from './base.collector';
import { MarketPriceService } from '../modules/market-price/market-price.service';

@Injectable()
export class BitfinexCollector extends BaseCollector {
  protected readonly name = 'Bitfinex';

  constructor(
    private readonly marketPriceService: MarketPriceService,
  ) {
    super();
  }

  async collect(params: Record<string, any>): Promise<void> {
    const { symbol = 'tXAUT:USD' } = params;

    // Bitfinex returns array: [BID, BID_SIZE, ASK, ASK_SIZE, DAILY_CHANGE, DAILY_CHANGE_RELATIVE, LAST_PRICE, VOLUME, HIGH, LOW]
    const data = await this.fetchWithRetry(
      `https://api-pub.bitfinex.com/v2/ticker/${symbol}`,
    );

    if (!Array.isArray(data) || data.length < 10) {
      this.logger.warn(`[${this.name}] Invalid ticker response for ${symbol}`);
      return;
    }

    const [, , , , , , lastPrice, volume, high, low] = data;
    const normalizedSymbol = symbol.replace('t', '').replace(':', '');

    await this.marketPriceService.insert({
      symbol: normalizedSymbol,
      source: 'bitfinex',
      timeframe: '5m',
      high,
      low,
      close: lastPrice,
      volume,
      timestamp: new Date(),
    });

    this.logger.info(`[${this.name}] Saved ${normalizedSymbol} price: ${lastPrice}`);
  }
}
