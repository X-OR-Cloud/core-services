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
      .find({ conversationId, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-isDeleted -deletedAt -password')
      .exec();

    return messages;
  }

  // Compact format for LLM agent consumption — minimal fields, chronological order
  async getCompactHistory(conversationId: string, limit: number = 50): Promise<any[]> {
    const messages = await this.model
      .find({ conversationId, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('role content createdAt')
      .exec();

    return messages.reverse().map(m => ({
      role: m.role,
      content: m.content,
      at: (m as any).createdAt?.toISOString?.() ?? '',
    }));
  }

  // Last message by role per conversation — used to detect unanswered conversations
  async getLastMessageByConversations(conversationIds: string[]): Promise<Record<string, any>> {
    const results = await this.model.aggregate([
      { $match: { conversationId: { $in: conversationIds }, isDeleted: false } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$conversationId', role: { $first: '$role' }, content: { $first: '$content' }, at: { $first: '$createdAt' } } },
    ]);

    return Object.fromEntries(results.map(r => [r._id, { role: r.role, content: r.content, at: r.at }]));
  }
}