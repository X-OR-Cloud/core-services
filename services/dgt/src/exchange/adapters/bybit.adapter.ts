/**
 * BybitAdapter (stub)
 *
 * TODO: Implement khi cần hỗ trợ Bybit exchange.
 * Ref: https://bybit-exchange.github.io/docs/v5/intro
 */
import { IExchangeAdapter, PlaceOrderParams, OrderResult } from '../exchange.interfaces';

export class BybitAdapter implements IExchangeAdapter {
  readonly exchange = 'bybit';
  readonly accountType: string;

  constructor(_config: { apiKey: string; apiSecret: string; isTestnet: boolean }) {
    this.accountType = _config.isTestnet ? 'paper' : 'live';
  }

  async placeMarketOrder(_params: PlaceOrderParams): Promise<OrderResult> {
    throw new Error('Bybit adapter not yet implemented');
  }

  async cancelOrder(_exchangeOrderId: string, _symbol: string): Promise<void> {
    throw new Error('Bybit adapter not yet implemented');
  }

  async getBalance(_asset: string): Promise<number> {
    throw new Error('Bybit adapter not yet implemented');
  }
}
