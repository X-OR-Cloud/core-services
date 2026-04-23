import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { Conversation } from '../conversations/conversations.schema';
import { Channel } from '../channels/channels.schema';
import { Memory } from '../memories/memories.schema';
import { Message } from '../messages/messages.schema';
import { Task } from '../tasks/tasks.schema';
import { UserPlansService } from '../user-plans/user-plans.service';

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<Conversation>,
    @InjectModel(Channel.name) private channelModel: Model<Channel>,
    @InjectModel(Memory.name) private memoryModel: Model<Memory>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(Task.name) private taskModel: Model<Task>,
    private readonly userPlansService: UserPlansService,
  ) {}

  async getOverallStats() {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalConversations,
      messagesToday,
      activeUsers,
      channelStatusCounts,
      totalMemories,
      pendingTasks,
    ] = await Promise.all([
      this.conversationModel.countDocuments({ isDeleted: false }),
      this.messageModel.countDocuments({ createdAt: { $gte: startOfDay }, isDeleted: false }),
      this.conversationModel.countDocuments({
        lastActiveAt: { $gte: twentyFourHoursAgo },
        status: { $in: ['active', 'idle'] },
        isDeleted: false,
      }),
      this.channelModel.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.memoryModel.countDocuments({ isDeleted: false }),
      this.taskModel.countDocuments({ status: 'pending', isDeleted: false }),
    ]);

    const channelsByStatus = channelStatusCounts.reduce((acc: any, item: any) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    return {
      conversations: { total: totalConversations, activeUsers },
      messages: { today: messagesToday },
      channels: channelsByStatus,
      memories: { total: totalMemories },
      tasks: { pending: pendingTasks },
      generatedAt: now.toISOString(),
    };
  }

  async getUserProfile(platformUserId: string) {
    const [conversations, memories, tasks, userPlan] = await Promise.all([
      this.conversationModel
        .find({ 'platformUser.id': platformUserId, isDeleted: false })
        .select('-isDeleted -deletedAt')
        .sort({ lastActiveAt: -1 })
        .exec(),
      this.memoryModel
        .find({ platformUserId, isDeleted: false })
        .select('-isDeleted -deletedAt')
        .sort({ createdAt: -1 })
        .exec(),
      this.taskModel
        .find({ platformUserId, isDeleted: false })
        .select('-isDeleted -deletedAt')
        .sort({ createdAt: -1 })
        .exec(),
      this.userPlansService.getOrCreate(platformUserId),
    ]);

    const plan = {
      planSlug: userPlan.planSlug,
      expiresAt: userPlan.expiresAt,
      activatedAt: userPlan.activatedAt,
    };

    return { platformUserId, plan, conversations, memories, tasks };
  }

  /**
   * Send a Zalo plan notification to a user via their most recent conversation's channel.
   */
  async sendZaloPlanNotification(platformUserId: string, message: string): Promise<void> {
    const conversation = await this.conversationModel
      .findOne({ 'platformUser.id': platformUserId, isDeleted: false })
      .sort({ lastActiveAt: -1 })
      .exec();

    if (!conversation) {
      this.logger.warn(`sendZaloPlanNotification: no conversation for ${platformUserId}`);
      return;
    }

    const channel = await this.channelModel
      .findOne({ _id: conversation.channelId, isDeleted: false })
      .exec();

    if (!channel?.credentials?.accessToken) {
      this.logger.warn(`sendZaloPlanNotification: channel ${conversation.channelId} missing token`);
      return;
    }

    try {
      const res = await axios.post(
        'https://openapi.zalo.me/v3.0/oa/message/cs',
        { recipient: { user_id: platformUserId }, message: { text: message } },
        { headers: { 'access_token': channel.credentials.accessToken, 'Content-Type': 'application/json' }, timeout: 10000 },
      );
      if (res.data.error !== 0) {
        throw new Error(`Zalo API error ${res.data.error}: ${res.data.message}`);
      }
      this.logger.log(`Plan notification sent to ${platformUserId}`);
    } catch (err) {
      this.logger.error(`Failed to send plan notification: ${err.message}`);
    }
  }
}
