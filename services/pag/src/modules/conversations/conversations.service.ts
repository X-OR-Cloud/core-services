import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Conversation } from './conversations.schema';
import { Message, MessageSchema } from '../messages/messages.schema';

@Injectable()
export class ConversationsService extends BaseService<Conversation> {

  constructor(
    @InjectModel(Conversation.name) conversationModel: Model<Conversation>,
    @InjectModel(Message.name) private readonly messageModel: Model<Message>,
  ) {
    super(conversationModel as any);
  }

  /**
   * Find existing conversation or create new one by platform user
   * @param channelId - Channel ID
   * @param soulId - Soul ID
   * @param platformUser - Platform user data
   * @param context - Request context
   * @returns Existing or newly created conversation
   */
  async findOrCreateByPlatformUser(
    channelId: string,
    soulId: string,
    platformUser: { id: string; username?: string; avatar?: string; phone?: string },
    context: RequestContext
  ): Promise<Conversation> {
    this.logger.debug(`Finding or creating conversation`, {
      channelId,
      soulId,
      platformUserId: platformUser.id,
      userId: context.userId
    });

    // Try to find existing conversation
    let conversation = await this.model
      .findOne({
        channelId,
        'platformUser.id': platformUser.id,
        isDeleted: false
      })
      .select('-isDeleted -deletedAt -password')
      .exec();

    if (conversation) {
      this.logger.debug(`Found existing conversation: ${conversation._id}`);

      // Update lastActiveAt and platform user info if changed
      const updatedConversation = await this.model
        .findByIdAndUpdate(
          conversation._id,
          {
            lastActiveAt: new Date(),
            platformUser: {
              ...conversation.platformUser,
              ...platformUser // merge new platform user data
            },
            updatedBy: context
          },
          { new: true }
        )
        .select('-isDeleted -deletedAt -password')
        .exec();

      return updatedConversation;
    }

    // Create new conversation
    this.logger.debug(`Creating new conversation for platform user: ${platformUser.id}`);

    const newConversationData = {
      channelId,
      soulId,
      platformUser,
      status: 'active',
      lastActiveAt: new Date(),
      messageCount: 0,
      tags: []
    };

    const newConversation = await this.create(newConversationData, context);

    this.logger.log(`New conversation created: ${(newConversation as any)._id}`, {
      channelId,
      soulId,
      platformUserId: platformUser.id,
      userId: context.userId
    });

    return newConversation as Conversation;
  }

  /**
   * Find active conversations within 48 hours
   * @param soulId - Soul ID to filter by
   * @returns Array of active conversations
   */
  async resetConversation(conversationId: string, context: RequestContext): Promise<{ deletedMessages: number }> {
    const conversation = await this.model.findOne({ _id: conversationId, isDeleted: false });
    if (!conversation) throw new NotFoundException(`Conversation ${conversationId} not found`);

    const result = await this.messageModel.updateMany(
      { conversationId, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date() } },
    );

    await this.model.findByIdAndUpdate(conversationId, {
      $set: { messageCount: 0, lastActiveAt: null, updatedBy: context },
    });

    return { deletedMessages: result.modifiedCount };
  }

  async getUnansweredConversations(sinceHours = 24) {
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

    const conversations = await this.model
      .find({ status: { $in: ['active', 'idle'] }, lastActiveAt: { $gte: since }, isDeleted: false })
      .select('_id channelId soulId platformUser lastActiveAt')
      .sort({ lastActiveAt: -1 })
      .exec();

    if (!conversations.length) return { total: 0, sinceHours, conversations: [] };

    const ids = conversations.map(c => (c as any)._id.toString());

    const lastMsgResults = await this.messageModel.aggregate([
      { $match: { conversationId: { $in: ids }, isDeleted: false } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$conversationId', role: { $first: '$role' }, content: { $first: '$content' }, at: { $first: '$createdAt' } } },
    ]);
    const lastMessages: Record<string, any> = Object.fromEntries(
      lastMsgResults.map(r => [r._id, { role: r.role, content: r.content, at: r.at }])
    );

    const unanswered = conversations
      .filter(c => {
        const last = lastMessages[(c as any)._id.toString()];
        return !last || last.role === 'user';
      })
      .map(c => ({
        conversationId: (c as any)._id,
        platformUserId: c.platformUser?.id,
        platformUserName: c.platformUser?.username,
        lastActiveAt: c.lastActiveAt,
        lastMessage: lastMessages[(c as any)._id.toString()] || null,
      }));

    return { total: unanswered.length, sinceHours, conversations: unanswered };
  }

  async findActiveWithin48h(soulId: string): Promise<Conversation[]> {
    this.logger.debug(`Finding active conversations within 48h for soul: ${soulId}`);

    const fortyEightHoursAgo = new Date();
    fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

    const conversations = await this.model
      .find({
        soulId,
        status: { $in: ['active', 'idle'] },
        lastActiveAt: { $gte: fortyEightHoursAgo },
        isDeleted: false
      })
      .sort({ lastActiveAt: -1 })
      .select('-isDeleted -deletedAt -password')
      .exec();

    this.logger.debug(`Found ${conversations.length} active conversations within 48h for soul: ${soulId}`);

    return conversations;
  }
}