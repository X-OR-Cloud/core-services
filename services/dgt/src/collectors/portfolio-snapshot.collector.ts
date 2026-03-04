import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createLogger } from '@hydrabyte/shared';
import { Account, AccountDocument, AccountStatus } from '../modules/account/account.schema';
import { Position, PositionDocument, PositionStatus } from '../modules/position/position.schema';
import { PortfolioSnapshotService } from '../modules/portfolio-snapshot/portfolio-snapshot.service';

@Injectable()
export class PortfolioSnapshotCollector {
  private readonly logger = createLogger('PortfolioSnapshotCollector');

  constructor(
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(Position.name) private readonly positionModel: Model<PositionDocument>,
    private readonly snapshotService: PortfolioSnapshotService,
  ) {}

  async collect(): Promise<void> {
    const accounts = await this.accountModel
      .find({ status: AccountStatus.ACTIVE })
      .lean()
      .exec();

    this.logger.info(`Snapshotting ${accounts.length} active accounts`);

    for (const account of accounts) {
      try {
        await this.snapshotAccount(account as unknown as AccountDocument);
      } catch (err: any) {
        this.logger.error(`Snapshot failed for account ${account._id}: ${err.message}`);
      }
    }
  }

  private async snapshotAccount(account: AccountDocument): Promise<void> {
    const accountId = account._id as Types.ObjectId;

    const openPositions = await this.positionModel
      .find({ accountId, status: PositionStatus.OPEN })
      .select('quantity currentPrice entryPrice unrealizedPnl notionalUsd')
      .lean()
      .exec();

    const closedPositions = await this.positionModel
      .find({ accountId, status: PositionStatus.CLOSED })
      .select('realizedPnl')
      .lean()
      .exec();

    const positionsValueUsd = openPositions.reduce((s, p) => {
      const price = p.currentPrice || p.entryPrice;
      return s + p.quantity * price;
    }, 0);

    const unrealizedPnlUsd = openPositions.reduce((s, p) => s + (p.unrealizedPnl || 0), 0);
    const realizedPnlUsd = closedPositions.reduce((s, p) => s + (p.realizedPnl || 0), 0);
    const cashBalanceUsd = account.balance;
    const totalValueUsd = cashBalanceUsd + positionsValueUsd;

    await this.snapshotService.upsertSnapshot(accountId, new Date(), {
      totalValueUsd: Math.round(totalValueUsd * 100) / 100,
      cashBalanceUsd: Math.round(cashBalanceUsd * 100) / 100,
      positionsValueUsd: Math.round(positionsValueUsd * 100) / 100,
      realizedPnlUsd: Math.round(realizedPnlUsd * 100) / 100,
      unrealizedPnlUsd: Math.round(unrealizedPnlUsd * 100) / 100,
    });

    this.logger.info(`Snapshot done for account ${accountId}: totalValue=$${totalValueUsd.toFixed(2)}`);
  }
}
