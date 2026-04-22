import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DailyUsage, DailyUsageDocument } from './daily-usages.schema';

function getTodayGMT7(): string {
  const now = new Date();
  // GMT+7 = UTC+7
  const gmt7 = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return gmt7.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

@Injectable()
export class DailyUsagesService {
  constructor(
    @InjectModel(DailyUsage.name) private readonly dailyUsageModel: Model<DailyUsageDocument>,
  ) {}

  async getToday(platformUserId: string): Promise<DailyUsageDocument | null> {
    return this.dailyUsageModel.findOne({
      platformUserId,
      date: getTodayGMT7(),
    }).exec();
  }

  /**
   * Atomically increment messageCount.
   * Returns the updated document (after increment).
   */
  async incrementMessageCount(platformUserId: string): Promise<DailyUsageDocument> {
    return this.dailyUsageModel.findOneAndUpdate(
      { platformUserId, date: getTodayGMT7() },
      { $inc: { messageCount: 1 } },
      { upsert: true, new: true },
    ).exec();
  }

  /**
   * Check quota atomically: increment only if count < limit.
   * Returns { allowed, messageCount } after attempt.
   */
  async tryIncrementIfAllowed(
    platformUserId: string,
    limit: number,
  ): Promise<{ allowed: boolean; messageCount: number }> {
    const result = await this.dailyUsageModel.findOneAndUpdate(
      {
        platformUserId,
        date: getTodayGMT7(),
        messageCount: { $lt: limit },
      },
      { $inc: { messageCount: 1 } },
      { upsert: false, new: true },
    ).exec();

    if (result) {
      return { allowed: true, messageCount: result.messageCount };
    }

    // Either quota exceeded or no doc yet — get current count
    const existing = await this.getToday(platformUserId);
    return { allowed: false, messageCount: existing?.messageCount ?? 0 };
  }

  async markWarningAt80Sent(platformUserId: string): Promise<void> {
    await this.dailyUsageModel.findOneAndUpdate(
      { platformUserId, date: getTodayGMT7() },
      { $set: { warningAt80Sent: true } },
      { upsert: true },
    ).exec();
  }
}
