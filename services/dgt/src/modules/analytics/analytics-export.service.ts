import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Account, AccountDocument, AccountStatus } from '../account/account.schema';
import { Position, PositionDocument, PositionStatus } from '../position/position.schema';
import { Trade, TradeDocument } from '../trade/trade.schema';

type RangeKey = '24h' | '7d' | '30d' | '90d' | 'all';

@Injectable()
export class AnalyticsExportService {
  constructor(
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(Position.name) private readonly positionModel: Model<PositionDocument>,
    @InjectModel(Trade.name) private readonly tradeModel: Model<TradeDocument>,
  ) {}

  async exportTradesToCsv(userId: string, accountId: string | undefined, range: RangeKey): Promise<string> {
    const account = await this.resolveAccount(userId, accountId);
    const accId = account._id as Types.ObjectId;
    const fromDate = this.rangeToDate(range);

    const filter = { accountId: accId, status: PositionStatus.CLOSED, closedAt: { $gte: fromDate } };
    const positions = await this.positionModel
      .find(filter)
      .sort({ closedAt: -1 })
      .limit(50000)
      .lean()
      .exec();

    const header = 'trade_id,bot_id,bot_name,asset,side,entry_time,exit_time,entry_price,exit_price,quantity,pnl,pnl_pct,duration_minutes,signal_id,signal_confidence,status';

    const rows = positions.map((p) => {
      const openedAt = new Date(p.openedAt);
      const closedAt = new Date(p.closedAt!);
      const durationMs = closedAt.getTime() - openedAt.getTime();
      const durationMinutes = Math.round(durationMs / 60_000);
      const pnlPct = p.notionalUsd > 0
        ? Math.round(((p.realizedPnl || 0) / p.notionalUsd) * 10000) / 100
        : 0;

      return [
        (p._id as Types.ObjectId).toString(),
        '',
        '',
        p.symbol,
        (p.side as string).toUpperCase(),
        openedAt.toISOString(),
        closedAt.toISOString(),
        p.entryPrice,
        p.exitPrice ?? p.currentPrice ?? '',
        p.quantity,
        p.realizedPnl ?? 0,
        pnlPct,
        durationMinutes,
        '',
        '',
        'CLOSED',
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    return '\uFEFF' + csv;
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
}
