import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { Model } from 'mongoose';
import axios from 'axios';
import { QUEUE_NAMES, QUEUE_EVENTS } from '../../config/queue.config';
import { UserPlansService } from '../../modules/user-plans/user-plans.service';
import { PlansService } from '../../modules/plans/plans.service';
import { Conversation } from '../../modules/conversations/conversations.schema';
import { Channel } from '../../modules/channels/channels.schema';

const PLAN_RANK: Record<string, number> = { mortal: 1, immortal: 2, god: 3 };

@Processor(QUEUE_NAMES.PLAN_LIFECYCLE)
export class PlanLifecycleProcessor extends WorkerHost {
  private readonly logger = new Logger(PlanLifecycleProcessor.name);

  constructor(
    private readonly userPlansService: UserPlansService,
    private readonly plansService: PlansService,
    @InjectModel(Conversation.name) private readonly conversationModel: Model<Conversation>,
    @InjectModel(Channel.name) private readonly channelModel: Model<Channel>,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.log(`Processing plan-lifecycle job ${job.id}, name: ${job.name}`);

    switch (job.name) {
      case QUEUE_EVENTS.PLAN_LIFECYCLE:
        return this.handleDailyLifecycle();
      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
        return null;
    }
  }

  /**
   * Daily job: warn expiring plans + downgrade expired plans.
   */
  private async handleDailyLifecycle(): Promise<any> {
    let warned = 0;
    let downgraded = 0;

    // 1. Warn plans expiring within 3 days
    const expiringSoon = await this.userPlansService.getExpiringSoon(3);
    for (const userPlan of expiringSoon) {
      try {
        const plan = await this.plansService.findBySlug(userPlan.planSlug);
        const planName = plan?.name || userPlan.planSlug;
        const expiresAt = userPlan.expiresAt!;
        const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const dateStr = expiresAt.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' });

        const msg = `⚠️ Gói ${planName} của bạn sẽ hết hạn vào ${dateStr} (còn ${daysLeft} ngày).\nLiên hệ admin để gia hạn và tiếp tục sử dụng đầy đủ tính năng nhé!`;
        await this.sendZaloMessage(userPlan.platformUserId, msg);
        warned++;
      } catch (err) {
        this.logger.error(`Failed to warn user ${userPlan.platformUserId}: ${err.message}`);
      }
    }

    // 2. Downgrade expired plans
    const expired = await this.userPlansService.getExpired();
    for (const userPlan of expired) {
      try {
        const oldPlanName = (await this.plansService.findBySlug(userPlan.planSlug))?.name || userPlan.planSlug;
        await this.userPlansService.setPlan(userPlan.platformUserId, 'mortal', null);

        const msg = `📢 Gói ${oldPlanName} của bạn đã hết hạn và được chuyển về gói Mortal.\nQuota mới: 30 tin/ngày, 5 tasks đang chờ.\nLiên hệ admin để nâng cấp lại nhé!`;
        await this.sendZaloMessage(userPlan.platformUserId, msg);

        await this.postDiscordLog(`Plan expired → downgraded: user \`${userPlan.platformUserId}\` from **${oldPlanName}** → **Mortal**`);
        downgraded++;
      } catch (err) {
        this.logger.error(`Failed to downgrade user ${userPlan.platformUserId}: ${err.message}`);
      }
    }

    this.logger.log(`Daily lifecycle done — warned: ${warned}, downgraded: ${downgraded}`);
    return { warned, downgraded };
  }

  /**
   * Send a Zalo message to a user via their most recent active channel.
   */
  async sendZaloMessage(platformUserId: string, message: string): Promise<void> {
    const conversation = await this.conversationModel
      .findOne({ 'platformUser.id': platformUserId, isDeleted: false })
      .sort({ lastActiveAt: -1 })
      .exec();

    if (!conversation) {
      this.logger.warn(`No conversation found for platformUserId: ${platformUserId}`);
      return;
    }

    const channel = await this.channelModel
      .findOne({ _id: conversation.channelId, isDeleted: false })
      .exec();

    if (!channel?.credentials?.accessToken) {
      this.logger.warn(`Channel ${conversation.channelId} missing access token`);
      return;
    }

    try {
      const response = await axios.post(
        'https://openapi.zalo.me/v3.0/oa/message/cs',
        {
          recipient: { user_id: platformUserId },
          message: { text: message },
        },
        {
          headers: { 'access_token': channel.credentials.accessToken, 'Content-Type': 'application/json' },
          timeout: 10000,
        },
      );

      if (response.data.error !== 0) {
        throw new Error(`Zalo API error ${response.data.error}: ${response.data.message}`);
      }
      this.logger.log(`Zalo plan notification sent to: ${platformUserId}`);
    } catch (err) {
      this.logger.error(`Failed to send Zalo plan notification: ${err.message}`);
    }
  }

  /**
   * Post a message to the configured Discord webhook (audit log).
   */
  async postDiscordLog(message: string): Promise<void> {
    const webhookUrl = process.env['PAG_DISCORD_WEBHOOK_URL'];
    if (!webhookUrl) return;

    try {
      await axios.post(webhookUrl, { content: message }, { timeout: 5000 });
    } catch (err) {
      this.logger.warn(`Discord webhook failed: ${err.message}`);
    }
  }
}
