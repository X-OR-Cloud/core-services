/**
 * OKXAdapter (stub)
 *
 * TODO: Implement khi cần hỗ trợ OKX exchange.
 * Ref: https://www.okx.com/docs-v5/en/
 */
import { IExchangeAdapter, PlaceOrderParams, OrderResult } from '../exchange.interfaces';

export class OKXAdapter implements IExchangeAdapter {
  readonly exchange = 'okx';
  readonly accountType: string;

  constructor(_config: { apiKey: string; apiSecret: string; isTestnet: boolean }) {
    this.accountType = _config.isTestnet ? 'paper' : 'live';
  }

  async placeMarketOrder(_params: PlaceOrderParams): Promise<OrderResult> {
    throw new Error('OKX adapter not yet implemented');
  }

  async cancelOrder(_exchangeOrderId: string, _symbol: string): Promise<void> {
    throw new Error('OKX adapter not yet implemented');
  }

  async getBalance(_asset: string): Promise<number> {
    throw new Error('OKX adapter not yet implemented');
  }
}
