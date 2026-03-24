/**
 * Exchange Adapter Interfaces
 * Abstraction layer cho tất cả sàn giao dịch (Binance, OKX, Bybit).
 * Paper account → testnet; Live account → mainnet.
 */

export interface PlaceOrderParams {
  symbol: string;        // e.g. 'PAXGUSDT'
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  price?: number;        // LIMIT orders only
  clientOrderId?: string;
}

export interface OrderResult {
  exchangeOrderId: string;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  filledQuantity: number;
  averageFilledPrice: number;
  fees: number;
  feeAsset: string;
  status: 'filled' | 'partially_filled' | 'pending' | 'cancelled' | 'rejected';
  filledAt: Date | null;
  raw?: Record<string, any>; // raw exchange response for debugging
}

export interface IExchangeAdapter {
  /**
   * Tên sàn giao dịch: 'binance' | 'okx' | 'bybit' | 'simulation'
   */
  readonly exchange: string;

  /**
   * Loại account: 'paper' (testnet) | 'live' (mainnet)
   */
  readonly accountType: string;

  /**
   * Đặt lệnh market order
   */
  placeMarketOrder(params: PlaceOrderParams): Promise<OrderResult>;

  /**
   * Huỷ lệnh đang pending
   */
  cancelOrder(exchangeOrderId: string, symbol: string): Promise<void>;

  /**
   * Lấy số dư khả dụng của một asset (e.g. 'USDT')
   */
  getBalance(asset: string): Promise<number>;
}
