import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Account, AccountDocument, AccountStatus } from '../account/account.schema';
import { Position, PositionDocument, PositionStatus } from '../position/position.schema';
import { MarketPrice, MarketPriceDocument } from '../market-price/market-price.schema';
import { PortfolioSnapshotService } from '../portfolio-snapshot/portfolio-snapshot.service';
import { PortfolioSnapshot } from '../portfolio-snapshot/portfolio-snapshot.schema';

type RangeKey = '7d' | '30d' | '90d' | 'all';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(Position.name) private readonly positionModel: Model<PositionDocument>,
    @InjectModel(MarketPrice.name) private readonly marketPriceModel: Model<MarketPriceDocument>,
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

    const assetAllocation = [
      ...Object.entries(symbolMap).map(([symbol, v]) => ({
        symbol,
        valueUsd: Math.round(v.valueUsd * 100) / 100,
        pct: totalValueUsd > 0 ? Math.round((v.valueUsd / totalValueUsd) * 1000) / 10 : 0,
        quantity: Math.round(v.quantity * 10000) / 10000,
      })),
      {
        symbol: account.currency || 'USDT',
        valueUsd: Math.round(cashBalanceUsd * 100) / 100,
        pct: totalValueUsd > 0 ? Math.round((cashBalanceUsd / totalValueUsd) * 1000) / 10 : 0,
        quantity: Math.round(cashBalanceUsd * 100) / 100,
      },
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
