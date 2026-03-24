/**
 * LocalSimulationAdapter
 *
 * Dùng cho các paper account chưa config API key.
 * Giả lập lệnh khớp ngay lập tức, không gọi exchange thật.
 * Đây là fallback để đảm bảo backward compatibility.
 */
import { createLogger } from '@hydrabyte/shared';
import { IExchangeAdapter, PlaceOrderParams, OrderResult } from '../exchange.interfaces';

export class LocalSimulationAdapter implements IExchangeAdapter {
  readonly exchange: string;
  readonly accountType: string;
  private readonly logger = createLogger('LocalSimulationAdapter');

  constructor(exchange: string, accountType: string) {
    this.exchange = exchange;
    this.accountType = accountType;
  }

  async placeMarketOrder(params: PlaceOrderParams): Promise<OrderResult> {
    this.logger.warn(
      `[Simulation] Placing simulated market order: ${params.side} ${params.quantity} ${params.symbol}`,
    );
    return {
      exchangeOrderId: `sim_${Date.now()}`,
      symbol: params.symbol,
      side: params.side,
      type: 'MARKET',
      quantity: params.quantity,
      filledQuantity: params.quantity,
      averageFilledPrice: params.price || 0,
      fees: 0,
      feeAsset: 'USDT',
      status: 'filled',
      filledAt: new Date(),
    };
  }

  async cancelOrder(exchangeOrderId: string, symbol: string): Promise<void> {
    this.logger.warn(`[Simulation] Cancel order ${exchangeOrderId} for ${symbol} (no-op)`);
  }

  async getBalance(asset: string): Promise<number> {
    this.logger.warn(`[Simulation] getBalance(${asset}) → 0 (no real exchange)`);
    return 0;
  }
}
