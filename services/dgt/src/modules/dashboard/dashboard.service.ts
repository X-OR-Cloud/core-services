import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Account, AccountDocument, AccountStatus } from '../account/account.schema';
import { Position, PositionDocument, PositionStatus } from '../position/position.schema';
import { MarketPrice, MarketPriceDocument } from '../market-price/market-price.schema';
import { TechnicalIndicator, TechnicalIndicatorDocument } from '../technical-indicator/technical-indicator.schema';
import { MacroIndicator, MacroIndicatorDocument } from '../macro-indicator/macro-indicator.schema';
import { Signal, SignalDocument, SignalStatus, SignalType } from '../signal/signal.schema';
import { BotActivityLog, BotActivityLogDocument } from '../bot-activity-log/bot-activity-log.schema';
import { PortfolioSnapshotService } from '../portfolio-snapshot/portfolio-snapshot.service';
import { PortfolioSnapshot } from '../portfolio-snapshot/portfolio-snapshot.schema';

type RangeKey = '7d' | '30d' | '90d' | 'all';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(Position.name) private readonly positionModel: Model<PositionDocument>,
    @InjectModel(MarketPrice.name) private readonly marketPriceModel: Model<MarketPriceDocument>,
    @InjectModel(TechnicalIndicator.name) private readonly technicalIndicatorModel: Model<TechnicalIndicatorDocument>,
    @InjectModel(MacroIndicator.name) private readonly macroIndicatorModel: Model<MacroIndicatorDocument>,
    @InjectModel(Signal.name) private readonly signalModel: Model<SignalDocument>,
    @InjectModel(BotActivityLog.name) private readonly botActivityLogModel: Model<BotActivityLogDocument>,
    private readonly snapshotService: PortfolioSnapshotService,
  ) {}

  async getSummary(userId: string) {
    const account = await this.getDefaultAccount(userId);
    const accountId = account._id as Types.ObjectId;

    const openPositions = await this.positionModel
      .find({ accountId, status: PositionStatus.OPEN })
      .lean()
      .exec();

    const closedPositions = await this.positionModel
      .find({ accountId, status: PositionStatus.CLOSED })
      .select('realizedPnl symbol')
      .lean()
      .exec();

    const unrealizedPnlUsd = openPositions.reduce((s, p) => s + (p.unrealizedPnl || 0), 0);
    const realizedPnlUsd = closedPositions.reduce((s, p) => s + (p.realizedPnl || 0), 0);
    const cashBalanceUsd = account.balance;

    // Group open positions by symbol → asset allocation
    const symbolMap: Record<string, { valueUsd: number; quantity: number }> = {};
    for (const p of openPositions) {
      const currentValue = p.quantity * (p.currentPrice || p.entryPrice);
      if (!symbolMap[p.symbol]) symbolMap[p.symbol] = { valueUsd: 0, quantity: 0 };
      symbolMap[p.symbol].valueUsd += currentValue;
      symbolMap[p.symbol].quantity += p.quantity;
    }

    const positionsValueUsd = Object.values(symbolMap).reduce((s, v) => s + v.valueUsd, 0);
    const totalValueUsd = cashBalanceUsd + positionsValueUsd;
    const totalPnlUsd = realizedPnlUsd + unrealizedPnlUsd;
    const initialBalance = account.initialBalance || totalValueUsd;
    const totalPnlPct = initialBalance > 0 ? (totalPnlUsd / initialBalance) * 100 : 0;

    // Build cash asset allocation từ balanceBreakdown (nếu có)
    // balanceBreakdown lưu qty thực từng asset: { USDT: 2274.71, PAXG: 3.21 }
    const breakdown = account.balanceBreakdown
      ? Object.fromEntries(account.balanceBreakdown as Map<string, number>)
      : {};

    let cashAllocation: Array<{ symbol: string; valueUsd: number; pct: number; quantity: number }>;

    if (Object.keys(breakdown).length > 0) {
      // Lấy PAXG price nếu có PAXG trong breakdown
      const paxgPrice = breakdown['PAXG'] ? await this.getPaxgPriceForDashboard() : 0;

      // Tính valueUsd cho từng asset từ qty × price
      const breakdownEntries = Object.entries(breakdown).map(([asset, qty]) => {
        const valueUsd = asset === 'USDT' ? qty : asset === 'PAXG' ? qty * paxgPrice : 0;
        return { asset, qty, valueUsd };
      });

      cashAllocation = breakdownEntries.map(({ asset, qty, valueUsd }) => ({
        symbol: asset,
        valueUsd: Math.round(valueUsd * 100) / 100,
        pct: totalValueUsd > 0 ? Math.round((valueUsd / totalValueUsd) * 1000) / 10 : 0,
        quantity: Math.round(qty * 10000) / 10000,
      }));
    } else {
      // Fallback: behavior cũ — hiện toàn bộ balance là USDT
      cashAllocation = [
        {
          symbol: account.currency || 'USDT',
          valueUsd: Math.round(cashBalanceUsd * 100) / 100,
          pct: totalValueUsd > 0 ? Math.round((cashBalanceUsd / totalValueUsd) * 1000) / 10 : 0,
          quantity: Math.round(cashBalanceUsd * 100) / 100,
        },
      ];
    }

    const assetAllocation = [
      ...Object.entries(symbolMap).map(([symbol, v]) => ({
        symbol,
        valueUsd: Math.round(v.valueUsd * 100) / 100,
        pct: totalValueUsd > 0 ? Math.round((v.valueUsd / totalValueUsd) * 1000) / 10 : 0,
        quantity: Math.round(v.quantity * 10000) / 10000,
      })),
      ...cashAllocation,
    ];

    return {
      portfolio: {
        totalValueUsd: Math.round(totalValueUsd * 100) / 100,
        cashBalanceUsd: Math.round(cashBalanceUsd * 100) / 100,
        positionsValueUsd: Math.round(positionsValueUsd * 100) / 100,
        totalPnlUsd: Math.round(totalPnlUsd * 100) / 100,
        totalPnlPct: Math.round(totalPnlPct * 100) / 100,
        realizedPnlUsd: Math.round(realizedPnlUsd * 100) / 100,
        unrealizedPnlUsd: Math.round(unrealizedPnlUsd * 100) / 100,
      },
      assetAllocation,
      updatedAt: new Date(),
    };
  }

  /**
   * Lấy giá PAXG/USDT mới nhất từ DB (binance_spot) để tính assetAllocation.
   * Fallback về 0 nếu không có data (hiếm gặp — worker thường cập nhật liên tục).
   */
  private async getPaxgPriceForDashboard(): Promise<number> {
    try {
      const latest = await this.marketPriceModel
        .findOne({ symbol: 'PAXGUSDT', source: 'binance_spot' })
        .sort({ timestamp: -1 })
        .lean()
        .exec();
      return latest?.close || 0;
    } catch {
      return 0;
    }
  }

  async getPriceCards(symbols: string[], sparklinePoints: number) {
    const priceCards = await Promise.all(
      symbols.map((symbol) => this.buildPriceCard(symbol, sparklinePoints)),
    );
    return { priceCards: priceCards.filter(Boolean) };
  }

  async getPortfolioHistory(userId: string, range: RangeKey) {
    const account = await this.getDefaultAccount(userId);
    const accountId = account._id as Types.ObjectId;
    const from = this.rangeToDate(range);
    const to = new Date();

    const snapshots = await this.snapshotService.findByRange(accountId, from, to) as PortfolioSnapshot[];

    if (!snapshots.length) {
      return { range, data: [], summary: null };
    }

    const data = snapshots.map((s) => ({
      date: s.date.toISOString().slice(0, 10),
      totalValueUsd: s.totalValueUsd,
      cashUsd: s.cashBalanceUsd,
      positionsUsd: s.positionsValueUsd,
    }));

    const start = snapshots[0].totalValueUsd;
    const end = snapshots[snapshots.length - 1].totalValueUsd;
    const changePct = start > 0 ? Math.round(((end - start) / start) * 10000) / 100 : 0;

    return {
      range,
      data,
      summary: {
        startValueUsd: start,
        endValueUsd: end,
        changePct,
      },
    };
  }

  async getAiSignal(userId: string, symbol: string, timeframe: string) {
    const account = await this.getDefaultAccount(userId);
    const accountId = account._id as Types.ObjectId;

    const signal = await this.signalModel
      .findOne({ accountId, asset: symbol, timeframe, status: SignalStatus.ACTIVE })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    if (!signal) {
      return {
        signal: 'NEUTRAL',
        confidence: 0,
        timeframe,
        symbol,
        updatedAt: new Date(),
        components: { technicalSignal: 'NEUTRAL', liquiditySignal: 'NEUTRAL', volumeSignal: 'NEUTRAL' },
        reasoning: { trendStrength: 'Weak', liquidityFlow: 'Neutral', volatilityRegime: 'Stable' },
      };
    }

    const signalLabel = signal.signalType === SignalType.BUY ? 'BULLISH'
      : signal.signalType === SignalType.SELL ? 'BEARISH'
      : 'NEUTRAL';

    const ti = await this.technicalIndicatorModel
      .findOne({ symbol, timeframe })
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    const technicalSignal = ti
      ? (ti.rsi14 > 60 ? 'BULLISH' : ti.rsi14 < 40 ? 'BEARISH' : 'NEUTRAL')
      : 'NEUTRAL';
    const volumeSignal = ti
      ? (ti.volumeRatio > 1.2 ? 'BULLISH' : ti.volumeRatio < 0.8 ? 'BEARISH' : 'NEUTRAL')
      : 'NEUTRAL';

    // Build reasoning (Format A — structured metrics)
    const atrPct = ti?.atr14Pct || 0;
    const volumeRatio = ti?.volumeRatio || 1;
    const trendStrength = signal.confidence >= 75 ? 'Strong' : signal.confidence >= 50 ? 'Moderate' : 'Weak';
    const liquidityFlow = volumeRatio > 1.2 ? 'Positive' : volumeRatio < 0.8 ? 'Negative' : 'Neutral';
    const volatilityRegime = atrPct > 2 ? 'High' : atrPct > 1 ? 'Elevated' : 'Stable';

    return {
      signal: signalLabel,
      confidence: signal.confidence,
      timeframe,
      symbol,
      updatedAt: signal.createdAt || new Date(),
      components: {
        technicalSignal,
        liquiditySignal: 'NEUTRAL',
        volumeSignal,
      },
      reasoning: {
        trendStrength,
        liquidityFlow,
        volatilityRegime,
      },
    };
  }

  async getMarketStatus(symbol: string) {
    const ti = await this.technicalIndicatorModel
      .findOne({ symbol, timeframe: '1h' })
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    if (!ti) {
      return { symbol, trend: 'RANGING', volatilityLevel: 'MEDIUM', volatilityScore: 50, liquidityScore: 50, liquidityLabel: 'MEDIUM', bidAskSpread: 0, slippageEstimate: 0, updatedAt: new Date() };
    }

    const atrPct = ti.atr14Pct || 0;
    const volatilityScore = Math.min(100, Math.round(atrPct * 50));
    const volatilityLevel = atrPct > 2 ? 'HIGH' : atrPct > 1 ? 'MEDIUM' : 'LOW';

    const volumeRatio = ti.volumeRatio || 1;
    const liquidityScore = Math.min(100, Math.round(volumeRatio * 50));
    const liquidityLabel = liquidityScore > 65 ? 'HIGH' : liquidityScore > 35 ? 'MEDIUM' : 'LOW';

    const macdHist = ti.macdHistogram || 0;
    const trend = atrPct > 2 ? 'VOLATILE' : Math.abs(macdHist) > 0.5 ? 'TRENDING' : 'RANGING';

    const bidAskSpread = Math.round(atrPct * 0.05 * 100) / 100;
    const slippageEstimate = Math.round(atrPct * 0.03 * 100) / 100;

    return {
      symbol,
      trend,
      volatilityLevel,
      volatilityScore,
      liquidityScore,
      liquidityLabel,
      bidAskSpread,
      slippageEstimate,
      updatedAt: ti.timestamp,
    };
  }

  async getMacroContext() {
    // DTWEXBGS = Trade Weighted US Dollar Index (FRED series, collected daily)
    // VIXCLS   = CBOE Volatility Index (FRED series, collected daily)
    // DFII10   = 10Y Real Interest Rate (FRED series, collected daily)
    const seriesIds = ['DTWEXBGS', 'VIXCLS', 'DFII10'];
    const indicators = await Promise.all(
      seriesIds.map((id) =>
        this.macroIndicatorModel.findOne({ seriesId: id }).sort({ timestamp: -1 }).lean().exec(),
      ),
    );

    const [dxy, vix, realYield] = indicators;

    const vixValue = vix?.value || 0;
    const vixLevel = vixValue > 30 ? 'HIGH' : vixValue > 20 ? 'MODERATE' : 'LOW';

    const macroRiskScore = Math.min(100, Math.round((vixValue / 50) * 100));
    const macroRiskLabel = macroRiskScore > 75 ? 'EXTREME' : macroRiskScore > 50 ? 'HIGH' : macroRiskScore > 25 ? 'MODERATE' : 'LOW';
    const tradeGate = macroRiskScore > 75 ? 'BLOCKED' : 'OPEN';

    // Derive goldOutlook from macro indicators
    const dxyValue = dxy?.value || 0;
    const realYieldValue = realYield?.value || 0;
    // Gold is bullish when: DXY weak (< 103), VIX moderate, real yields low/negative
    let goldBiasScore = 50; // neutral baseline
    if (dxyValue > 0 && dxyValue < 103) goldBiasScore += 15; // DXY weak → bullish gold
    if (dxyValue > 0 && dxyValue > 106) goldBiasScore -= 15; // DXY strong → bearish gold
    if (vixValue > 20) goldBiasScore += 10; // high VIX → fear → safe haven demand
    if (realYieldValue < 1.5) goldBiasScore += 10; // low real yield → gold more attractive
    if (realYieldValue > 2.5) goldBiasScore -= 10; // high real yield → gold less attractive

    const goldBias = goldBiasScore >= 60 ? 'BULLISH' : goldBiasScore <= 40 ? 'BEARISH' : 'NEUTRAL';
    const goldConfidence = Math.min(100, Math.max(0, Math.round(Math.abs(goldBiasScore - 50) * 2)));
    const goldReasons: string[] = [];
    if (dxyValue > 0 && dxyValue < 103) goldReasons.push('US Dollar weakening — bullish for gold');
    if (dxyValue > 0 && dxyValue > 106) goldReasons.push('US Dollar strengthening — headwind for gold');
    if (vixValue > 20) goldReasons.push(`VIX elevated at ${vixValue.toFixed(1)} — safe haven demand rising`);
    if (realYieldValue < 1.5) goldReasons.push('Real yields low — gold relative attractiveness increasing');
    if (realYieldValue > 2.5) goldReasons.push('Real yields elevated — opportunity cost of holding gold increases');
    if (!goldReasons.length) goldReasons.push('Mixed macro signals — neutral gold outlook');

    return {
      tradeGate,
      macroRiskScore,
      macroRiskLabel,
      indicators: {
        dxy: { value: dxy?.value || null, change24h: null, label: 'USD Index' },
        vix: { value: vix?.value || null, level: vixLevel, label: 'Market Stress (VIX)' },
        realYield10y: { value: realYield?.value || null, label: 'US 10Y Real Yield' },
      },
      upcomingEvents: [],
      updatedAt: new Date(),
      goldOutlook: {
        bias: goldBias,
        confidence: goldConfidence,
        reasons: goldReasons,
      },
    };
  }

  async getMarketIndicators(rawSymbol: string) {
    // Strip exchange prefix (e.g. "BINANCE:PAXGUSDT" → "PAXGUSDT")
    const symbol = rawSymbol.includes(':') ? rawSymbol.split(':').pop()! : rawSymbol;
    const ti = await this.technicalIndicatorModel
      .findOne({ symbol, timeframe: '1m' })
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    const rsi14 = ti?.rsi14 || 50;
    const rsiLevel = rsi14 > 70 ? 'OVERBOUGHT'
      : rsi14 > 60 ? 'APPROACHING_OVERBOUGHT'
      : rsi14 < 30 ? 'OVERSOLD'
      : 'NEUTRAL';

    const atrPct = ti?.atr14Pct || 0;

    // Fear & Greed approximation from RSI + volume
    const fearGreedIndex = Math.min(100, Math.max(0, Math.round((rsi14 - 30) * (100 / 40))));
    const fearGreedLabel = fearGreedIndex > 75 ? 'Extreme Greed'
      : fearGreedIndex > 55 ? 'Greed'
      : fearGreedIndex > 45 ? 'Neutral'
      : fearGreedIndex > 25 ? 'Fear'
      : 'Extreme Fear';

    const support = ti?.bbLower || null;
    const resistance = ti?.bbUpper || null;

    // Volatility zone label
    const volatilityZone = atrPct > 2.5 ? 'HIGH' : atrPct > 1 ? 'MEDIUM' : 'LOW';

    // Sentiment label from fearGreedIndex
    const sentimentLabel = fearGreedIndex > 75 ? 'Strongly Bullish'
      : fearGreedIndex > 55 ? 'Bullish'
      : fearGreedIndex > 45 ? 'Neutral'
      : fearGreedIndex > 25 ? 'Bearish'
      : 'Strongly Bearish';

    // Liquidity from volumeRatio
    const volumeRatio = ti?.volumeRatio || 1;
    const liquidityScore = Math.min(100, Math.round(volumeRatio * 50));
    const liquidityLabel = liquidityScore > 65 ? 'High' : liquidityScore > 35 ? 'Medium' : 'Low';
    const liquidityNote = liquidityScore > 65
      ? 'Strong orderbook depth'
      : liquidityScore > 35
        ? 'Normal market liquidity'
        : 'Thin orderbook — wider spreads expected';

    return {
      symbol,
      timeframe: '24h',
      volatility24hPct: Math.round(atrPct * 100) / 100,
      rsi14: Math.round(rsi14 * 10) / 10,
      rsiLevel,
      fearGreedIndex,
      fearGreedLabel,
      support,
      resistance,
      updatedAt: ti?.timestamp || new Date(),
      volatilityZone,
      sentimentLabel,
      sentimentScore: fearGreedIndex,
      liquidityLabel,
      liquidityNote,
    };
  }

  async getAiActivity(userId: string, limit: number, since?: string) {
    const accountIds = await this.accountModel
      .find({ 'owner.userId': userId, isDeleted: false })
      .distinct('_id');

    const dateFilter = since ? { $gt: new Date(since) } : undefined;

    // Query bot activity logs và LLM signals song song
    const [logs, signals] = await Promise.all([
      this.botActivityLogModel
        .find({
          accountId: { $in: accountIds },
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .exec(),
      this.signalModel
        .find({
          accountId: { $in: accountIds },
          insight: { $exists: true, $ne: '' },
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('_id accountId asset timeframe signalType confidence confidenceLabel insight keyFactors macroFactors createdAt')
        .lean()
        .exec(),
    ]);

    const agentMap: Record<string, string> = {
      buy: 'TREND',
      sell: 'TREND',
      info: 'NEURAL',
      warning: 'RISK',
      error: 'RISK',
    };
    const severityMap: Record<string, string> = {
      SUCCESS: 'INFO',
      INFO: 'INFO',
      WARNING: 'WARNING',
      ERROR: 'ALERT',
    };

    // Map bot activity logs
    const logEntries = logs.map((log) => ({
      id: (log._id as Types.ObjectId).toString(),
      timestamp: log.createdAt,
      agent: agentMap[log.actionType] || 'NEURAL',
      message: log.action,
      severity: severityMap[log.status] || 'INFO',
      metadata: log.metadata || {},
      type: 'bot_activity' as const,
    }));

    // Map LLM signal insights
    const signalEntries = signals.map((sig) => ({
      id: (sig._id as Types.ObjectId).toString(),
      timestamp: sig.createdAt,
      agent: 'LLM',
      message: sig.insight,
      severity: 'INFO' as const,
      metadata: {
        signalType: sig.signalType,
        confidence: sig.confidence,
        confidenceLabel: sig.confidenceLabel,
        asset: sig.asset,
        timeframe: sig.timeframe,
        keyFactors: sig.keyFactors || [],
        macroFactors: sig.macroFactors || [],
      },
      type: 'llm_insight' as const,
    }));

    // Merge, sort by timestamp desc, apply limit
    const merged = [...logEntries, ...signalEntries]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    return { entries: merged, hasMore: false };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getDefaultAccount(userId: string): Promise<any> {
    const account = await this.accountModel
      .findOne({ 'owner.userId': userId, isDefault: true, status: AccountStatus.ACTIVE })
      .lean()
      .exec();
    if (!account) {
      throw new NotFoundException('No default account found for this user');
    }
    return account;
  }

  private async buildPriceCard(symbol: string, sparklinePoints: number) {
    const latest = await this.marketPriceModel
      .findOne({ symbol })
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    if (!latest) return null;

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const candles24h = await this.marketPriceModel
      .find({ symbol, source: latest.source, timestamp: { $gte: since24h } })
      .sort({ timestamp: 1 })
      .lean()
      .exec();

    const high24h = candles24h.length ? Math.max(...candles24h.map((c) => c.high || c.close)) : latest.close;
    const low24h = candles24h.length ? Math.min(...candles24h.map((c) => c.low || c.close)) : latest.close;
    const open24h = candles24h.length ? candles24h[0].close : latest.close;
    const change24hUsd = latest.close - open24h;
    const change24hPct = open24h > 0 ? (change24hUsd / open24h) * 100 : 0;
    const isPositive = change24hPct >= 0;

    const sparklineCandles = await this.marketPriceModel
      .find({ symbol, source: latest.source })
      .sort({ timestamp: -1 })
      .limit(sparklinePoints)
      .lean()
      .exec();
    const sparkline = sparklineCandles.reverse().map((c) => c.close);

    return {
      symbol,
      price: latest.close,
      change24hUsd: Math.round(change24hUsd * 100) / 100,
      change24hPct: Math.round(change24hPct * 100) / 100,
      isPositive,
      high24h,
      low24h,
      sparkline,
      source: latest.source,
      timestamp: latest.timestamp,
    };
  }

  private rangeToDate(range: RangeKey): Date {
    const now = new Date();
    const map: Record<RangeKey, number> = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      'all': 365 * 10,
    };
    const days = map[range] ?? 30;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }
}
