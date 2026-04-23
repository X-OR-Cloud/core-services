import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PlansService } from '../plans/plans.service';
import { UserPlansService } from '../user-plans/user-plans.service';
import { DailyUsagesService } from '../daily-usages/daily-usages.service';
import { Task } from '../tasks/tasks.schema';

export interface ChatQuotaResult {
  allowed: boolean;
  messageCount: number;
  limit: number | null;       // null = unlimited
  warningNeeded: boolean;     // true if crossed 80% threshold
  planSlug: string;           // effective plan slug for UX messaging
}

export interface TaskQuotaResult {
  allowed: boolean;
  activeCount: number;
  limit: number | null;
  planSlug: string;
}

@Injectable()
export class QuotaService {
  constructor(
    private readonly plansService: PlansService,
    private readonly userPlansService: UserPlansService,
    private readonly dailyUsagesService: DailyUsagesService,
    @InjectModel(Task.name) private readonly taskModel: Model<Task>,
  ) {}

  /**
   * Atomically check and consume 1 chat message from daily quota.
   * Returns { allowed, messageCount, limit, warningNeeded }.
   * If limit is null (God plan), always allowed.
   */
  async tryConsumeChatQuota(platformUserId: string): Promise<ChatQuotaResult> {
    const planSlug = await this.userPlansService.getEffectivePlanSlug(platformUserId);
    const plan = await this.plansService.findBySlug(planSlug);
    const limit = plan?.dailyMessageLimit ?? null;

    // Unlimited plan
    if (limit === null) {
      await this.dailyUsagesService.incrementMessageCount(platformUserId);
      return { allowed: true, messageCount: 0, limit: null, warningNeeded: false, planSlug };
    }

    const { allowed, messageCount } = await this.dailyUsagesService.tryIncrementIfAllowed(
      platformUserId,
      limit,
    );

    if (!allowed) {
      return { allowed: false, messageCount, limit, warningNeeded: false, planSlug };
    }

    // Check if 80% warning should be sent (exact crossing: messageCount hits 80% threshold)
    const threshold = Math.floor(limit * 0.8);
    const warningNeeded = messageCount === threshold;
    if (warningNeeded) {
      const usage = await this.dailyUsagesService.getToday(platformUserId);
      if (usage?.warningAt80Sent) {
        // Already sent today — don't resend
        return { allowed: true, messageCount, limit, warningNeeded: false, planSlug };
      }
      await this.dailyUsagesService.markWarningAt80Sent(platformUserId);
    }

    return { allowed: true, messageCount, limit, warningNeeded, planSlug };
  }

  /**
   * Check if user can create another task (active task quota).
   * Does NOT create the task — just checks.
   */
  async checkTaskQuota(platformUserId: string): Promise<TaskQuotaResult> {
    const planSlug = await this.userPlansService.getEffectivePlanSlug(platformUserId);
    const plan = await this.plansService.findBySlug(planSlug);
    const limit = plan?.maxActiveTasks ?? null;

    const activeCount = await this.taskModel.countDocuments({
      platformUserId,
      status: { $in: ['pending', 'snoozed'] },
      isDeleted: false,
    }).exec();

    if (limit === null) {
      return { allowed: true, activeCount, limit: null, planSlug };
    }

    return { allowed: activeCount < limit, activeCount, limit, planSlug };
  }

  /**
   * Check if user's plan allows a specific feature.
   * Currently supports: 'recurringTasks'
   */
  async checkFeatureAccess(platformUserId: string, feature: 'recurringTasks'): Promise<boolean> {
    const planSlug = await this.userPlansService.getEffectivePlanSlug(platformUserId);
    const plan = await this.plansService.findBySlug(planSlug);
    if (!plan) return false;

    switch (feature) {
      case 'recurringTasks':
        return plan.allowRecurringTasks;
      default:
        return false;
    }
  }

  /**
   * Full quota summary for a user (used by stats/admin endpoints).
   */
  async getUserQuotaSummary(platformUserId: string) {
    const planSlug = await this.userPlansService.getEffectivePlanSlug(platformUserId);
    const plan = await this.plansService.findBySlug(planSlug);
    const todayUsage = await this.dailyUsagesService.getToday(platformUserId);

    const activeTaskCount = await this.taskModel.countDocuments({
      platformUserId,
      status: { $in: ['pending', 'snoozed'] },
      isDeleted: false,
    }).exec();

    return {
      planSlug,
      chat: {
        messageCount: todayUsage?.messageCount ?? 0,
        limit: plan?.dailyMessageLimit ?? null,
      },
      tasks: {
        activeCount: activeTaskCount,
        limit: plan?.maxActiveTasks ?? null,
      },
      features: {
        recurringTasks: plan?.allowRecurringTasks ?? false,
      },
    };
  }
}
