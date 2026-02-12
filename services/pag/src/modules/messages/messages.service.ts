import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { Message } from './messages.schema';

@Injectable()
export class MessagesService extends BaseService<Message> {

  constructor(@InjectModel(Message.name) messageModel: Model<Message>) {
    super(messageModel as any);
  }

  /**
   * Get recent messages by conversation (most recent first)
   * @param conversationId - Conversation ID
   * @param limit - Maximum number of messages to return (default: 50)
   * @returns Array of recent messages, most recent first
   */
  async getRecentByConversation(conversationId: string, limit: number = 50): Promise<Message[]> {
    this.logger.debug(`Getting recent messages for conversation: ${conversationId}, limit: ${limit}`);

    const messages = await this.model
      .find({
        conversationId,
        isDeleted: false
      })
      .sort({ createdAt: -1 }) // Most recent first
      .limit(limit)
      .select('-isDeleted -deletedAt -password')
      .exec();

    this.logger.debug(`Found ${messages.length} recent messages for conversation: ${conversationId}`);

    return messages;
  }
}