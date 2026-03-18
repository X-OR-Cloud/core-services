import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TechnicalIndicator, TechnicalIndicatorDocument } from '../technical-indicator/technical-indicator.schema';
import { SentimentSignal, SentimentSignalDocument } from '../sentiment-signal/sentiment-signal.schema';
import { MarketPrice, MarketPriceDocument } from '../market-price/market-price.schema';
import { Signal, SignalDocument, SignalStatus } from '../signal/signal.schema';

@Injectable()
export class InsightsDataService {
  constructor(
    @InjectModel(TechnicalIndicator.name) private readonly tiModel: Model<TechnicalIndicatorDocument>,
    @InjectModel(SentimentSignal.name) private readonly sentimentModel: Model<SentimentSignalDocument>,
    @InjectModel(MarketPrice.name) private readonly marketPriceModel: Model<MarketPriceDocument>,
    @InjectModel(Signal.name) private readonly signalModel: Model<SignalDocument>,
  ) {}

  async getTechnicalIndicators(symbol: string, timeframe: string) {
    const ti = await this.tiModel
      .findOne({ symbol, timeframe })
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    if (!ti) return { symbol, timeframe, data: null, updatedAt: new Date() };

    return {
      symbol,
      timeframe,
      data: {
        rsi14: ti.rsi14,
        macd: { line: ti.macdLine, signal: ti.macdSignal, histogram: ti.macdHistogram },
        ema: { ema9: ti.ema9, ema20: ti.ema20, ema50: ti.ema50, ema200: ti.ema200 },
        sma20: ti.sma20,
        bollingerBands: { upper: ti.bbUpper, middle: ti.bbMiddle, lower: ti.bbLower },
        atr14: ti.atr14,
        atr14Pct: ti.atr14Pct,
        volumeRatio: ti.volumeRatio,
        hv30d: ti.hv30d,
      },
      updatedAt: ti.timestamp,
    };
  }

  async getSentimentVolatility(symbol: string) {
    const ti = await this.tiModel
      .findOne({ symbol, timeframe: '1h' })
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    const newsData = await this.sentimentModel
      .findOne({ source: 'newsapi' })
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    const futuresData = await this.sentimentModel
      .findOne({ source: 'binance_futures' })
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    const atrPct = ti?.atr14Pct || 0;
    const hv30d = ti?.hv30d || 0;
    const volatilityLevel = atrPct > 2 ? 'HIGH' : atrPct > 1 ? 'MEDIUM' : 'LOW';

    const sentimentScore = newsData?.newsSentimentMean ?? null;
    const sentimentLabel =
      sentimentScore === null ? 'UNKNOWN'
        : sentimentScore > 0.3 ? 'BULLISH'
        : sentimentScore < -0.3 ? 'BEARISH'
        : 'NEUTRAL';

    return {
      symbol,
      volatility: {
        atr14Pct: Math.round(atrPct * 100) / 100,
        hv30d: Math.round(hv30d * 100) / 100,
        level: volatilityLevel,
      },
      sentiment: {
        score: sentimentScore,
        label: sentimentLabel,
        geopoliticalRisk: newsData?.geopoliticalRiskScore ?? null,
        eventImpact: newsData?.eventImpactLevel ?? null,
        updatedAt: newsData?.timestamp || null,
      },
      futures: {
        fundingRateAnnualized: futuresData?.fundingRateAnnualized ?? null,
        longShortRatio: futuresData?.longShortRatio ?? null,
        openInterestUsd: futuresData?.openInterestUsd ?? null,
      },
      updatedAt: new Date(),
    };
  }

  async getLiquidityHeatmap(symbol: string) {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const candles = await this.marketPriceModel
      .find({ symbol, timestamp: { $gte: since24h } })
      .sort({ timestamp: 1 })
      .select('timestamp volume close source')
      .lean()
      .exec();

    const ti = await this.tiModel
      .findOne({ symbol, timeframe: '1h' })
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    const volumeRatio = ti?.volumeRatio || 1;
    const liquidityLevel = volumeRatio > 1.5 ? 'HIGH' : volumeRatio > 0.8 ? 'MEDIUM' : 'LOW';

    // Group by hour for heatmap
    const hourlyMap: Record<string, { volume: number; count: number }> = {};
    for (const c of candles) {
      const hour = new Date(c.timestamp).toISOString().slice(0, 13);
      if (!hourlyMap[hour]) hourlyMap[hour] = { volume: 0, count: 0 };
      hourlyMap[hour].volume += c.volume || 0;
      hourlyMap[hour].count += 1;
    }

    const heatmap = Object.entries(hourlyMap).map(([hour, v]) => ({
      hour,
      volume: Math.round(v.volume * 100) / 100,
      avgVolume: Math.round((v.volume / v.count) * 100) / 100,
    }));

    return {
      symbol,
      volumeRatio: Math.round(volumeRatio * 100) / 100,
      liquidityLevel,
      heatmap,
      updatedAt: new Date(),
    };
  }

  async getAdvancedMetrics(symbol: string, timeframe: string) {
    const ti = await this.tiModel
      .findOne({ symbol, timeframe })
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    const latestSignal = await this.signalModel
      .findOne({ asset: symbol, timeframe, status: SignalStatus.ACTIVE })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    if (!ti) return { symbol, timeframe, data: null, signal: null, updatedAt: new Date() };

    const rsi14 = ti.rsi14 || 50;
    const rsiZone =
      rsi14 > 70 ? 'OVERBOUGHT'
        : rsi14 > 60 ? 'APPROACHING_OVERBOUGHT'
        : rsi14 < 30 ? 'OVERSOLD'
        : rsi14 < 40 ? 'APPROACHING_OVERSOLD'
        : 'NEUTRAL';

    const macdCrossover =
      ti.macdLine !== null && ti.macdSignal !== null
        ? (ti.macdLine > ti.macdSignal ? 'BULLISH' : 'BEARISH')
        : 'UNKNOWN';

    const bbPosition =
      ti.bbUpper && ti.bbLower && ti.bbMiddle
        ? {
            upper: ti.bbUpper,
            middle: ti.bbMiddle,
            lower: ti.bbLower,
            width: Math.round(((ti.bbUpper - ti.bbLower) / ti.bbMiddle) * 10000) / 100,
          }
        : null;

    return {
      symbol,
      timeframe,
      data: {
        rsi: { value: Math.round(rsi14 * 10) / 10, zone: rsiZone },
        macd: {
          line: ti.macdLine,
          signal: ti.macdSignal,
          histogram: ti.macdHistogram,
          crossover: macdCrossover,
        },
        bollingerBands: bbPosition,
        ema: { ema20: ti.ema20, ema50: ti.ema50, ema200: ti.ema200 },
        atr: { value: ti.atr14, pct: ti.atr14Pct },
        volumeRatio: ti.volumeRatio,
      },
      signal: latestSignal
        ? {
            type: latestSignal.signalType,
            confidence: latestSignal.confidence,
            confidenceLabel: latestSignal.confidenceLabel,
            expiresAt: latestSignal.expiresAt,
          }
        : null,
      updatedAt: ti.timestamp,
    };
  }
}
