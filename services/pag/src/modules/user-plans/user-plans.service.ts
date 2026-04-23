import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserPlan, UserPlanDocument } from './user-plans.schema';

@Injectable()
export class UserPlansService {
  constructor(
    @InjectModel(UserPlan.name) private readonly userPlanModel: Model<UserPlanDocument>,
  ) {}

  /**
   * Get user's current plan. Auto-creates Mortal plan if not exists.
   */
  async getOrCreate(platformUserId: string): Promise<UserPlanDocument> {
    const existing = await this.userPlanModel.findOne({ platformUserId }).exec();
    if (existing) return existing;

    return this.userPlanModel.create({
      platformUserId,
      planSlug: 'mortal',
      expiresAt: null,
      activatedAt: new Date(),
      previousPlanSlug: null,
    });
  }

  /**
   * Upgrade or change user plan.
   */
  async setPlan(
    platformUserId: string,
    planSlug: string,
    expiresAt: Date | null,
  ): Promise<UserPlanDocument> {
    const current = await this.getOrCreate(platformUserId);

    return this.userPlanModel.findOneAndUpdate(
      { platformUserId },
      {
        planSlug,
        expiresAt,
        activatedAt: new Date(),
        previousPlanSlug: current.planSlug !== planSlug ? current.planSlug : current.previousPlanSlug,
      },
      { new: true },
    ).exec();
  }

  /**
   * Get users whose paid plan expires within the given number of days.
   */
  async getExpiringSoon(days: number): Promise<UserPlanDocument[]> {
    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return this.userPlanModel.find({
      planSlug: { $ne: 'mortal' },
      expiresAt: { $gt: now, $lte: future },
    }).exec();
  }

  /**
   * Get users whose paid plan has already expired (but not yet downgraded).
   */
  async getExpired(): Promise<UserPlanDocument[]> {
    return this.userPlanModel.find({
      planSlug: { $ne: 'mortal' },
      expiresAt: { $lte: new Date() },
    }).exec();
  }

  /**
   * Check if plan is expired and downgrade to mortal if needed.
   * Returns the effective plan slug.
   */
  async getEffectivePlanSlug(platformUserId: string): Promise<string> {
    const userPlan = await this.getOrCreate(platformUserId);

    if (
      userPlan.planSlug !== 'mortal' &&
      userPlan.expiresAt &&
      userPlan.expiresAt < new Date()
    ) {
      // Auto-downgrade
      await this.setPlan(platformUserId, 'mortal', null);
      return 'mortal';
    }

    return userPlan.planSlug;
  }
}
