import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserNewsPreference, UserNewsPrefDocument } from './user-news-prefs.schema';

const SOURCE_LIMITS: Record<string, number | null> = {
  mortal: 3,
  immortal: 20,
  god: null,
};

@Injectable()
export class UserNewsPrefsService {
  constructor(
    @InjectModel(UserNewsPreference.name) private readonly model: Model<UserNewsPrefDocument>,
  ) {}

  async getOrCreate(platformUserId: string, soulId: string, channelId: string): Promise<UserNewsPrefDocument> {
    const existing = await this.model.findOne({ platformUserId, soulId }).exec();
    if (existing) return existing;
    return this.model.create({ platformUserId, soulId, channelId });
  }

  async findByUser(platformUserId: string, soulId: string): Promise<UserNewsPrefDocument | null> {
    return this.model.findOne({ platformUserId, soulId }).exec();
  }

  async update(platformUserId: string, soulId: string, data: Partial<UserNewsPreference>): Promise<UserNewsPrefDocument> {
    const doc = await this.model.findOneAndUpdate(
      { platformUserId, soulId },
      { $set: data },
      { new: true, upsert: false },
    ).exec();
    if (!doc) throw new NotFoundException(`UserNewsPreference not found for user ${platformUserId}`);
    return doc;
  }

  /** Add a source, enforcing plan limit. Returns updated doc. */
  async addSource(platformUserId: string, soulId: string, sourceId: string, planSlug: string): Promise<UserNewsPrefDocument> {
    const pref = await this.model.findOne({ platformUserId, soulId }).exec();
    if (!pref) throw new NotFoundException(`Preference not found`);

    const limit = SOURCE_LIMITS[planSlug] ?? 3;
    if (limit !== null && pref.sourceIds.length >= limit) {
      throw new Error(`Source limit reached for plan ${planSlug} (max ${limit})`);
    }
    if (pref.sourceIds.includes(sourceId)) return pref;

    return this.model.findOneAndUpdate(
      { platformUserId, soulId },
      { $addToSet: { sourceIds: sourceId } },
      { new: true },
    ).exec();
  }

  async removeSource(platformUserId: string, soulId: string, sourceId: string): Promise<UserNewsPrefDocument> {
    return this.model.findOneAndUpdate(
      { platformUserId, soulId },
      { $pull: { sourceIds: sourceId } },
      { new: true },
    ).exec();
  }

  /** Used by Task 2.4 delivery scheduler. Pass soulId to filter by soul, or omit to sweep all. */
  async findActiveByFrequency(slot: 'morning' | 'evening', soulId?: string): Promise<UserNewsPrefDocument[]> {
    return this.model.find({
      active: true,
      frequency: { $in: [slot, 'both'] },
      ...(soulId ? { soulId } : {}),
    }).exec();
  }

  async markDelivered(platformUserId: string, soulId: string): Promise<void> {
    await this.model.findOneAndUpdate(
      { platformUserId, soulId },
      { $set: { lastDeliveredAt: new Date() } },
    ).exec();
  }
}
