import { Injectable } from '@nestjs/common';
import { createLogger } from '@hydrabyte/shared';
import { MarketPriceService } from '../modules/market-price/market-price.service';
import { TechnicalIndicatorService } from '../modules/technical-indicator/technical-indicator.service';
import { SystemActivityLogService } from '../modules/system-activity-log/system-activity-log.service';
import { SystemWorkerType, SystemActivityStatus } from '../modules/system-activity-log/system-activity-log.schema';
import * as math from './math.util';

/** Minimum candles needed for all indicators (EMA200 + buffer) */
const MIN_CANDLES = 220;

@Injectable()
export class IndicatorComputationService {
  private readonly logger = createLogger('IndicatorComputation');

  constructor(
    private readonly marketPriceService: MarketPriceService,
    private readonly technicalIndicatorService: TechnicalIndicatorService,
    private readonly systemActivityLogService: SystemActivityLogService,
  ) {}

  /**
   * Compute all technical indicators for a given symbol + timeframe.
   * Reads recent MarketPrice candles, calculates indicators, and upserts result.
   */
  async compute(symbol: string, source: string, timeframe: string): Promise<void> {
    const startTime = Date.now();

    // Fetch enough candles for EMA200
    // Sort DESC to get latest candles, then reverse to chronological order for indicator calculation
    const { data: rawCandles } = await this.marketPriceService.findAll(
      { symbol, source, timeframe },
      { sort: { timestamp: -1 }, limit: MIN_CANDLES },
    );
    const candles = rawCandles.slice().reverse();

    if (candles.length < 30) {
      this.logger.warn(`[${symbol}/${timeframe}] Not enough candles (${candles.length}), need at least 30`);
      this.systemActivityLogService.logActivity({
        workerType: SystemWorkerType.TECH_INDICATOR,
        source,
        symbol,
        action: 'compute_indicators',
        status: SystemActivityStatus.WARNING,
        details: `Not enough candles for ${symbol}/${timeframe} (${candles.length}/30 required)`,
        metadata: { symbol, source, timeframe, candleCount: candles.length },
        durationMs: Date.now() - startTime,
      });
      return;
    }

    const closes = candles.map((c: any) => c.close);
    const highs = candles.map((c: any) => c.high ?? c.close);
    const lows = candles.map((c: any) => c.low ?? c.close);
    const volumes = candles.map((c: any) => c.volume ?? 0);
    const lastCandle = candles[candles.length - 1] as any;
    const lastClose = closes[closes.length - 1];

    // RSI
    const rsi14 = math.rsi(closes, 14);

    // MACD
    const macdResult = math.macd(closes, 12, 26, 9);

    // EMAs
    const ema9 = math.ema(closes, 9);
    const ema20 = math.ema(closes, 20);
    const ema50 = math.ema(closes, 50);
    const ema200 = math.ema(closes, 200);

    // SMA
    const sma20 = math.sma(closes, 20);

    // Bollinger Bands
    const bb = math.bollingerBands(closes, 20, 2);

    // ATR
    const atr14 = math.atr(highs, lows, closes, 14);
    const atr14Pct = atr14 && lastClose ? (atr14 / lastClose) * 100 : undefined;

    // Volume Ratio
    const volRatio = math.volumeRatio(volumes, 20);

    // Historical Volatility
    const hv30d = math.historicalVolatility(closes, 30);

    const indicator = {
      symbol,
      timeframe,
      timestamp: lastCandle.timestamp,
      rsi14,
      macdLine: macdResult?.line,
      macdSignal: macdResult?.signal,
      macdHistogram: macdResult?.histogram,
      ema9,
      ema20,
      ema50,
      ema200,
      sma20,
      bbUpper: bb?.upper,
      bbMiddle: bb?.middle,
      bbLower: bb?.lower,
      atr14,
      atr14Pct,
      volumeRatio: volRatio,
      hv30d,
    };

    await this.technicalIndicatorService.upsert(
      { symbol, timeframe, timestamp: lastCandle.timestamp },
      indicator,
    );

    const durationMs = Date.now() - startTime;
    this.logger.info(`[${symbol}/${timeframe}] Indicators computed: RSI=${rsi14?.toFixed(1)}, MACD=${macdResult?.line?.toFixed(2)}`);

    this.systemActivityLogService.logActivity({
      workerType: SystemWorkerType.TECH_INDICATOR,
      source,
      symbol,
      action: 'compute_indicators',
      status: SystemActivityStatus.SUCCESS,
      details: `Computed indicators for ${symbol}/${timeframe} — RSI: ${rsi14?.toFixed(1)}, MACD: ${macdResult?.line?.toFixed(2)}`,
      metadata: {
        symbol,
        source,
        timeframe,
        candleCount: candles.length,
        rsi14: rsi14?.toFixed(1),
        macdLine: macdResult?.line?.toFixed(2),
        ema20: ema20?.toFixed(2),
      },
      durationMs,
    });
  }
}
