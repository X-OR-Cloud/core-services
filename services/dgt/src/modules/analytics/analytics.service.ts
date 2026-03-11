import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Account, AccountDocument, AccountStatus } from '../account/account.schema';
import { Position, PositionDocument, PositionStatus } from '../position/position.schema';
import { Trade, TradeDocument } from '../trade/trade.schema';
import { PortfolioSnapshot, PortfolioSnapshotDocument } from '../portfolio-snapshot/portfolio-snapshot.schema';

type RangeKey = '24h' | '7d' | '30d' | '90d' | 'all';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(Position.name) private readonly positionModel: Model<PositionDocument>,
    @InjectModel(Trade.name) private readonly tradeModel: Model<TradeDocument>,
    @InjectModel(PortfolioSnapshot.name) private readonly snapshotModel: Model<PortfolioSnapshotDocument>,
  ) {}

  async getSummary(userId: string, range: RangeKey, accountId?: string) {
    const account = await this.resolveAccount(userId, accountId);
    const accId = account._id as Types.ObjectId;
    const fromDate = this.rangeToDate(range);

    const closedPositions = await this.positionModel
      .find({ accountId: accId, status: PositionStatus.CLOSED, closedAt: { $gte: fromDate } })
      .select('realizedPnl closedAt')
      .lean()
      .exec();

    const openPositions = await this.positionModel
      .find({ accountId: accId, status: PositionStatus.OPEN })
      .select('unrealizedPnl')
      .lean()
      .exec();

    const trades = await this.tradeModel
      .find({ accountId: accId, executedAt: { $gte: fromDate } })
      .select('notionalUsd')
      .lean()
      .exec();

    const wins = closedPositions.filter((p) => (p.realizedPnl || 0) > 0);
    const losses = closedPositions.filter((p) => (p.realizedPnl || 0) <= 0);
    const totalTrades = closedPositions.length;
    const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;

    const realizedPnlUsd = closedPositions.reduce((s, p) => s + (p.realizedPnl || 0), 0);
    const unrealizedPnlUsd = openPositions.reduce((s, p) => s + (p.unrealizedPnl || 0), 0);
    const netPnlUsd = realizedPnlUsd + unrealizedPnlUsd;
    const totalVolumeUsd = trades.reduce((s, t) => s + (t.notionalUsd || 0), 0);

    const avgWinUsd = wins.length > 0
      ? wins.reduce((s, p) => s + (p.realizedPnl || 0), 0) / wins.length
      : 0;
    const avgLossUsd = losses.length > 0
      ? losses.reduce((s, p) => s + (p.realizedPnl || 0), 0) / losses.length
      : 0;
    const totalWinAmount = wins.reduce((s, p) => s + (p.realizedPnl || 0), 0);
    const totalLossAmount = Math.abs(losses.reduce((s, p) => s + (p.realizedPnl || 0), 0));
    const profitFactor = totalLossAmount > 0 ? totalWinAmount / totalLossAmount : 0;

    const initialBalance = account.initialBalance || 1;
    const netPnlPct = initialBalance > 0 ? (netPnlUsd / initialBalance) * 100 : 0;

    return {
      range,
      summary: {
        netPnlUsd: Math.round(netPnlUsd * 100) / 100,
        netPnlPct: Math.round(netPnlPct * 100) / 100,
        realizedPnlUsd: Math.round(realizedPnlUsd * 100) / 100,
        unrealizedPnlUsd: Math.round(unrealizedPnlUsd * 100) / 100,
        totalVolumeUsd: Math.round(totalVolumeUsd * 100) / 100,
        totalTrades,
        winRate: Math.round(winRate * 10) / 10,
        wins: wins.length,
        losses: losses.length,
        avgWinUsd: Math.round(avgWinUsd * 100) / 100,
        avgLossUsd: Math.round(avgLossUsd * 100) / 100,
        profitFactor: Math.round(profitFactor * 100) / 100,
      },
    };
  }

  async getOpenPositions(userId: string, accountId: string | undefined, page: number, limit: number) {
    const account = await this.resolveAccount(userId, accountId);
    const accId = account._id as Types.ObjectId;

    const total = await this.positionModel.countDocuments({ accountId: accId, status: PositionStatus.OPEN });
    const positions = await this.positionModel
      .find({ accountId: accId, status: PositionStatus.OPEN })
      .sort({ openedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .exec();

    const now = Date.now();
    const data = positions.map((p) => {
      const currentPrice = p.currentPrice || p.entryPrice;
      const durationMs = now - new Date(p.openedAt).getTime();
      const durationHours = Math.round((durationMs / 3_600_000) * 10) / 10;
      const isPositive = (p.unrealizedPnl || 0) >= 0;

      return {
        id: (p._id as Types.ObjectId).toString(),
        symbol: p.symbol,
        side: (p.side as string).toUpperCase(),
        entryPrice: p.entryPrice,
        currentPrice,
        quantity: p.quantity,
        notionalUsd: p.notionalUsd,
        unrealizedPnlUsd: Math.round((p.unrealizedPnl || 0) * 100) / 100,
        unrealizedPnlPct: Math.round((p.unrealizedPnlPct || 0) * 100) / 100,
        isPositive,
        stopLossPrice: p.stopLossPrice,
        takeProfitPrice: p.takeProfitPrice,
        leverage: p.leverage,
        openedAt: p.openedAt,
        durationHours,
      };
    });

    return { data, total, page, limit };
  }

  async getTrades(userId: string, range: RangeKey, accountId: string | undefined, page: number, limit: number) {
    const account = await this.resolveAccount(userId, accountId);
    const accId = account._id as Types.ObjectId;
    const fromDate = this.rangeToDate(range);

    const filter = { accountId: accId, status: PositionStatus.CLOSED, closedAt: { $gte: fromDate } };
    const total = await this.positionModel.countDocuments(filter);
    const positions = await this.positionModel
      .find(filter)
      .sort({ closedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .exec();

    const data = positions.map((p, idx) => {
      const openedAt = new Date(p.openedAt);
      const closedAt = new Date(p.closedAt!);
      const durationMs = closedAt.getTime() - openedAt.getTime();
      const durationMinutes = Math.round(durationMs / 60_000);
      const durationFormatted = this.formatDuration(durationMs);
      const isPositive = (p.realizedPnl || 0) >= 0;

      return {
        id: `T-${String(total - idx).padStart(3, '0')}`,
        symbol: p.symbol,
        side: (p.side as string).toUpperCase(),
        entryPrice: p.entryPrice,
        exitPrice: p.exitPrice || p.currentPrice,
        quantity: p.quantity,
        realizedPnlUsd: Math.round((p.realizedPnl || 0) * 100) / 100,
        realizedPnlPct: p.entryPrice > 0
          ? Math.round(((p.realizedPnl || 0) / p.notionalUsd) * 10000) / 100
          : 0,
        isPositive,
        closeReason: p.closeReason,
        openedAt: p.openedAt,
        closedAt: p.closedAt,
        durationMinutes,
        durationFormatted,
        date: closedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      };
    });

    return { data, total, page, limit };
  }

  async getPnlChart(userId: string, range: RangeKey, accountId?: string) {
    const account = await this.resolveAccount(userId, accountId);
    const accId = account._id as Types.ObjectId;
    const fromDate = this.rangeToDate(range);

    const closedPositions = await this.positionModel
      .find({ accountId: accId, status: PositionStatus.CLOSED, closedAt: { $gte: fromDate } })
      .select('realizedPnl closedAt')
      .sort({ closedAt: 1 })
      .lean()
      .exec();

    // Group by day
    const dailyMap: Record<string, number> = {};
    for (const p of closedPositions) {
      const day = new Date(p.closedAt!).toISOString().slice(0, 10);
      dailyMap[day] = (dailyMap[day] || 0) + (p.realizedPnl || 0);
    }

    // Fill all days in range and compute cumulative
    const data: { date: string; dailyPnlUsd: number; cumulativePnlUsd: number }[] = [];
    let cumulative = 0;
    const current = new Date(fromDate);
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);

    while (current <= today) {
      const day = current.toISOString().slice(0, 10);
      const daily = dailyMap[day] || 0;
      cumulative += daily;
      if (daily !== 0 || data.length > 0) {
        data.push({
          date: day,
          dailyPnlUsd: Math.round(daily * 100) / 100,
          cumulativePnlUsd: Math.round(cumulative * 100) / 100,
        });
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return { range, data };
  }

  async getEquityCurve(userId: string, range: RangeKey, accountId?: string) {
    const account = await this.resolveAccount(userId, accountId);
    const accId = account._id as Types.ObjectId;
    const fromDate = this.rangeToDate(range);
    const initialBalance = account.initialBalance || 1;

    const snapshots = await this.snapshotModel
      .find({ accountId: accId, date: { $gte: fromDate } })
      .sort({ date: 1 })
      .lean()
      .exec();

    const data = snapshots.map((s) => {
      const cumulativePnl = (s.realizedPnlUsd || 0) + (s.unrealizedPnlUsd || 0);
      const roiPct = initialBalance > 0
        ? Math.round(((s.totalValueUsd - initialBalance) / initialBalance) * 10000) / 100
        : 0;
      return {
        timestamp: s.date.toISOString(),
        equity: s.totalValueUsd,
        cumulativePnl: Math.round(cumulativePnl * 100) / 100,
        roiPct,
      };
    });

    return { range, data };
  }

  async getDrawdown(userId: string, range: RangeKey, accountId?: string) {
    const account = await this.resolveAccount(userId, accountId);
    const accId = account._id as Types.ObjectId;
    const fromDate = this.rangeToDate(range);

    const snapshots = await this.snapshotModel
      .find({ accountId: accId, date: { $gte: fromDate } })
      .sort({ date: 1 })
      .lean()
      .exec();

    let peak = snapshots.length > 0 ? snapshots[0].totalValueUsd : (account.initialBalance || 0);
    let maxDrawdownPct = 0;

    const data = snapshots.map((s) => {
      const equity = s.totalValueUsd;
      if (equity > peak) peak = equity;
      const drawdownPct = peak > 0 ? Math.min(0, ((equity - peak) / peak) * 100) : 0;
      if (drawdownPct < maxDrawdownPct) maxDrawdownPct = drawdownPct;
      return {
        timestamp: s.date.toISOString(),
        equity,
        drawdownPct: Math.round(drawdownPct * 100) / 100,
      };
    });

    return {
      range,
      maxDrawdownPct: Math.round(maxDrawdownPct * 100) / 100,
      data,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async resolveAccount(userId: string, accountId?: string): Promise<any> {
    const filter: Record<string, any> = { 'owner.userId': userId, status: AccountStatus.ACTIVE };
    if (accountId) {
      filter['_id'] = new Types.ObjectId(accountId);
    } else {
      filter['isDefault'] = true;
    }
    const account = await this.accountModel.findOne(filter).lean().exec();
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  private rangeToDate(range: RangeKey): Date {
    const now = new Date();
    const map: Record<RangeKey, number> = { '24h': 1, '7d': 7, '30d': 30, '90d': 90, 'all': 365 * 10 };
    return new Date(now.getTime() - (map[range] ?? 7) * 24 * 60 * 60 * 1000);
  }

  private formatDuration(ms: number): string {
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }
}
