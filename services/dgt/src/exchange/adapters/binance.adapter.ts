/**
 * BinanceAdapter
 *
 * Gọi Binance REST API (SPOT) để thực thi lệnh.
 * - Paper account (accountType='paper') → testnet: https://testnet.binance.vision
 * - Live account  (accountType='live')  → mainnet: https://api.binance.com
 *
 * Authentication: HMAC-SHA256 signed requests.
 * Ref: https://binance-docs.github.io/apidocs/spot/en/
 */
import { createHmac } from 'crypto';
import axios from 'axios';
import { createLogger } from '@hydrabyte/shared';
import { IExchangeAdapter, PlaceOrderParams, OrderResult } from '../exchange.interfaces';

interface BinanceAdapterConfig {
  apiKey: string;
  apiSecret: string;
  isTestnet: boolean;
}

export class BinanceAdapter implements IExchangeAdapter {
  readonly exchange = 'binance';
  readonly accountType: string;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly logger = createLogger('BinanceAdapter');
  private readonly timeout = 10_000;

  constructor(config: BinanceAdapterConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.accountType = config.isTestnet ? 'paper' : 'live';
    this.baseUrl = config.isTestnet
      ? 'https://testnet.binance.vision'
      : 'https://api.binance.com';
  }

  // ─── Signature helpers ────────────────────────────────────────────────────

  private sign(queryString: string): string {
    return createHmac('sha256', this.apiSecret).update(queryString).digest('hex');
  }

  private buildSignedParams(params: Record<string, any>): string {
    const timestamp = Date.now();
    const entries = { ...params, timestamp };
    const qs = Object.entries(entries)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const signature = this.sign(qs);
    return `${qs}&signature=${signature}`;
  }

  private get headers() {
    return {
      'X-MBX-APIKEY': this.apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  }

  // ─── IExchangeAdapter ─────────────────────────────────────────────────────

  async placeMarketOrder(params: PlaceOrderParams): Promise<OrderResult> {
    const orderParams: Record<string, any> = {
      symbol: params.symbol,
      side: params.side,
      type: 'MARKET',
      quantity: params.quantity,
    };
    if (params.clientOrderId) {
      orderParams['newClientOrderId'] = params.clientOrderId;
    }

    const qs = this.buildSignedParams(orderParams);

    try {
      const res = await axios.post(
        `${this.baseUrl}/api/v3/order`,
        qs,
        { headers: this.headers, timeout: this.timeout },
      );
      const data = res.data;
      return this.parseOrderResponse(data);
    } catch (err: any) {
      const msg = err?.response?.data?.msg || err?.message || 'Unknown error';
      this.logger.error(`[Binance] placeMarketOrder failed: ${msg}`);
      throw new Error(`Binance order failed: ${msg}`);
    }
  }

  async cancelOrder(exchangeOrderId: string, symbol: string): Promise<void> {
    const qs = this.buildSignedParams({ symbol, orderId: exchangeOrderId });
    try {
      await axios.delete(
        `${this.baseUrl}/api/v3/order?${qs}`,
        { headers: this.headers, timeout: this.timeout },
      );
      this.logger.info(`[Binance] Cancelled order ${exchangeOrderId} for ${symbol}`);
    } catch (err: any) {
      const msg = err?.response?.data?.msg || err?.message;
      this.logger.error(`[Binance] cancelOrder failed: ${msg}`);
      throw new Error(`Binance cancel failed: ${msg}`);
    }
  }

  async getBalance(asset: string): Promise<number> {
    const qs = this.buildSignedParams({});
    try {
      const res = await axios.get(
        `${this.baseUrl}/api/v3/account?${qs}`,
        { headers: this.headers, timeout: this.timeout },
      );
      const balances: { asset: string; free: string }[] = res.data.balances || [];
      const found = balances.find((b) => b.asset === asset);
      return found ? parseFloat(found.free) : 0;
    } catch (err: any) {
      const msg = err?.response?.data?.msg || err?.message;
      this.logger.error(`[Binance] getBalance failed: ${msg}`);
      throw new Error(`Binance getBalance failed: ${msg}`);
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private parseOrderResponse(data: any): OrderResult {
    // Parse fills để tính avgPrice và fees
    const fills: { price: string; qty: string; commission: string; commissionAsset: string }[] =
      data.fills || [];

    let filledQty = 0;
    let totalQuote = 0;
    let totalFees = 0;
    let feeAsset = 'USDT';

    for (const fill of fills) {
      const qty = parseFloat(fill.qty);
      const price = parseFloat(fill.price);
      filledQty += qty;
      totalQuote += qty * price;
      totalFees += parseFloat(fill.commission);
      feeAsset = fill.commissionAsset;
    }

    const avgFilledPrice = filledQty > 0 ? totalQuote / filledQty : 0;

    // Fallback nếu fills rỗng (testnet thỉnh thoảng không trả fills)
    const executedQty = parseFloat(data.executedQty || '0');
    const cummulativeQuoteQty = parseFloat(data.cummulativeQuoteQty || '0');
    const fallbackAvgPrice =
      executedQty > 0 ? cummulativeQuoteQty / executedQty : 0;

    return {
      exchangeOrderId: String(data.orderId),
      symbol: data.symbol,
      side: data.side,
      type: data.type,
      quantity: parseFloat(data.origQty || '0'),
      filledQuantity: executedQty,
      averageFilledPrice: avgFilledPrice || fallbackAvgPrice,
      fees: totalFees,
      feeAsset,
      status: this.mapBinanceStatus(data.status),
      filledAt: data.transactTime ? new Date(data.transactTime) : new Date(),
      raw: data,
    };
  }

  private mapBinanceStatus(
    status: string,
  ): 'filled' | 'partially_filled' | 'pending' | 'cancelled' | 'rejected' {
    switch (status) {
      case 'FILLED':
        return 'filled';
      case 'PARTIALLY_FILLED':
        return 'partially_filled';
      case 'NEW':
      case 'PENDING_NEW':
        return 'pending';
      case 'CANCELED':
      case 'EXPIRED':
        return 'cancelled';
      case 'REJECTED':
        return 'rejected';
      default:
        return 'pending';
    }
  }
}
