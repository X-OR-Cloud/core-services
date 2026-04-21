import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Conversation } from '../conversations/conversations.schema';
import { Message } from '../messages/messages.schema';
import { Channel } from '../channels/channels.schema';
import { Memory } from '../memories/memories.schema';
import { Task } from '../tasks/tasks.schema';

@Injectable()
export class StatsService {
  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<Conversation>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(Channel.name) private channelModel: Model<Channel>,
    @InjectModel(Memory.name) private memoryModel: Model<Memory>,
    @InjectModel(Task.name) private taskModel: Model<Task>,
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
    const [conversations, memories, tasks] = await Promise.all([
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
    ]);

    return { platformUserId, conversations, memories, tasks };
  }
}
