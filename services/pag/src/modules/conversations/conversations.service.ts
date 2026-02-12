import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Conversation } from './conversations.schema';

@Injectable()
export class ConversationsService extends BaseService<Conversation> {

  constructor(@InjectModel(Conversation.name) conversationModel: Model<Conversation>) {
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