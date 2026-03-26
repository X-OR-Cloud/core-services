/**
 * BinanceAdapter
 *
 * Gọi Binance REST API (SPOT) để thực thi lệnh.
 * - Paper account (accountType='paper') → Binance Spot Demo: https://demo-api.binance.com
 * - Live account  (accountType='live')  → Binance Spot Live: https://api.binance.com
 *
 * Ref: https://developers.binance.com/docs/binance-spot-api-docs/demo-mode/general-info
 * Authentication: HMAC-SHA256 signed requests.
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
    // paper = Binance Demo Trading (demo.binance.com) → https://demo-api.binance.com
    // live  = Binance Mainnet → https://api.binance.com
    this.baseUrl = config.isTestnet
      ? 'https://demo-api.binance.com'
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
    // Round quantity theo LOT_SIZE stepSize của Binance trước khi đặt lệnh
    const stepSize = await this.getLotStepSize(params.symbol);
    const roundedQuantity = this.roundToStepSize(params.quantity, stepSize);

    this.logger.debug(
      `[Binance] placeMarketOrder: symbol=${params.symbol} qty=${params.quantity} → rounded=${roundedQuantity} (stepSize=${stepSize})`,
    );

    const orderParams: Record<string, any> = {
      symbol: params.symbol,
      side: params.side,
      type: 'MARKET',
      quantity: roundedQuantity,
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

  /**
   * Lấy LOT_SIZE stepSize của symbol từ Binance exchangeInfo.
   * stepSize quy định quantity phải là bội số của nó (vd: 0.0001 cho PAXGUSDT).
   */
  private async getLotStepSize(symbol: string): Promise<number> {
    try {
      const res = await axios.get(
        `${this.baseUrl}/api/v3/exchangeInfo?symbol=${symbol}`,
        { timeout: this.timeout },
      );
      const symbolInfo = res.data?.symbols?.[0];
      const lotFilter = symbolInfo?.filters?.find((f: any) => f.filterType === 'LOT_SIZE');
      return lotFilter ? parseFloat(lotFilter.stepSize) : 0.00001;
    } catch (err: any) {
      this.logger.warn(`[Binance] getLotStepSize failed for ${symbol}: ${err?.message}. Using default 0.00001`);
      return 0.00001;
    }
  }

  /**
   * Round quantity xuống bội số gần nhất của stepSize.
   * Ví dụ: roundToStepSize(0.031250, 0.0001) = 0.0312
   */
  private roundToStepSize(quantity: number, stepSize: number): number {
    if (!stepSize || stepSize <= 0) return quantity;
    const precision = Math.round(-Math.log10(stepSize));
    const rounded = Math.floor(quantity / stepSize) * stepSize;
    return parseFloat(rounded.toFixed(precision));
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
