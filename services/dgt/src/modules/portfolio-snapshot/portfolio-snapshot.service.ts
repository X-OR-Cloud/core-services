import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PortfolioSnapshot, PortfolioSnapshotDocument } from './portfolio-snapshot.schema';

export interface SnapshotData {
  totalValueUsd: number;
  cashBalanceUsd: number;
  positionsValueUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
}

@Injectable()
export class PortfolioSnapshotService {
  constructor(
    @InjectModel(PortfolioSnapshot.name)
    private readonly model: Model<PortfolioSnapshotDocument>,
  ) {}

  async upsertSnapshot(accountId: Types.ObjectId, date: Date, data: SnapshotData): Promise<void> {
    const dayStart = this.truncateToDay(date);
    await this.model.findOneAndUpdate(
      { accountId, date: dayStart },
      { $set: { ...data, accountId, date: dayStart } },
      { upsert: true, new: true },
    );
  }

  async findByRange(accountId: Types.ObjectId, from: Date, to: Date): Promise<PortfolioSnapshot[]> {
    const docs = await this.model
      .find({ accountId, date: { $gte: from, $lte: to } })
      .sort({ date: 1 })
      .lean()
      .exec();
    return docs as unknown as PortfolioSnapshot[];
  }

  private truncateToDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
}
