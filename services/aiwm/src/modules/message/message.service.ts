import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Message, MessageDocument } from './message.schema';
import { CreateMessageDto } from './dto/create-message.dto';
import { AttachmentHelper } from './attachment.helper';
import { ConversationService } from '../conversation/conversation.service';

@Injectable()
export class MessageService extends BaseService<Message> {
  protected readonly logger = new Logger(MessageService.name);

  constructor(
    @InjectModel(Message.name)
    messageModel: Model<MessageDocument>,
    private readonly conversationService: ConversationService,
  ) {
    super(messageModel as any);
  }

  /**
   * Create a message directly, bypassing RBAC.
   * Used for agent and anonymous users in WebSocket chat.
   * Caller must supply full owner context.
   */
  async createMessageDirect(
    dto: CreateMessageDto,
    owner: { orgId: string; agentId: string; userId: string },
  ): Promise<Message> {
    // Validate attachments if present
    if (dto.attachments && dto.attachments.length > 0) {
      const validation = AttachmentHelper.validateAll(dto.attachments);
      if (!validation.valid) {
        throw new BadRequestException({
          message: 'Invalid attachments',
          invalidAttachments: validation.invalidAttachments,
        });
      }
    }

    const actorId = owner.userId || owner.agentId;
    const message = await this.model.create({
      ...dto,
      owner: {
        orgId: owner.orgId || '',
        agentId: owner.agentId || '',
        userId: owner.userId || '',
        groupId: '',
        appId: '',
      },
      createdBy: actorId,
      updatedBy: actorId,
    });

    // Update conversation metadata
    await this.conversationService.updateLastMessage(
      dto.conversationId,
      dto.content,
      dto.role,
      new Date(),
    );
    await this.conversationService.incrementMessageCount(dto.conversationId);

    if (dto.usage) {
      const cost = this.calculateCost(dto.usage.totalTokens);
      await this.conversationService.updateTokenUsage(
        dto.conversationId,
        dto.usage.totalTokens,
        cost,
      );
    }

    const context: RequestContext = {
      userId: actorId,
      roles: ['organization.editor'],
      orgId: owner.orgId || '',
      groupId: '',
      agentId: owner.agentId || '',
      appId: '',
    };
    const conversation = await this.conversationService.findById(
      new Types.ObjectId(dto.conversationId) as any,
      context,
    );
    if (conversation && conversation.totalMessages % 10 === 0) {
      this.conversationService
        .generateContextSummary(dto.conversationId, context)
        .catch((error) => {
          this.logger.error(
            `Failed to generate summary for conversation ${dto.conversationId}:`,
            error.stack,
          );
        });
    }

    this.logger.log(
      `Created message (direct) ${(message as any)._id} in conversation ${dto.conversationId}`,
    );

    return message as unknown as Message;
  }

  /**
   * Create a new message
   */
  async createMessage(
    dto: CreateMessageDto,
    context: RequestContext,
  ): Promise<Message> {
    // Validate attachments if present
    if (dto.attachments && dto.attachments.length > 0) {
      const validation = AttachmentHelper.validateAll(dto.attachments);
      if (!validation.valid) {
        throw new BadRequestException({
          message: 'Invalid attachments',
          invalidAttachments: validation.invalidAttachments,
        });
      }
    }

    // Create message
    const message = await this.create(dto, context);

    // Update conversation metadata
    await this.conversationService.updateLastMessage(
      dto.conversationId,
      dto.content,
      dto.role,
      new Date(),
    );

    await this.conversationService.incrementMessageCount(dto.conversationId);

    // Update token usage if provided
    if (dto.usage) {
      const cost = this.calculateCost(dto.usage.totalTokens);
      await this.conversationService.updateTokenUsage(
        dto.conversationId,
        dto.usage.totalTokens,
        cost,
      );
    }

    // Check if we need to generate summary (every 10 messages)
    const conversation = await this.conversationService.findById(
      new Types.ObjectId(dto.conversationId) as any,
      context,
    );

    if (conversation && conversation.totalMessages % 10 === 0) {
      // Generate summary in background (don't await)
      this.conversationService
        .generateContextSummary(dto.conversationId, context)
        .catch((error) => {
          this.logger.error(
            `Failed to generate summary for conversation ${dto.conversationId}:`,
            error.stack,
          );
        });
    }

    this.logger.log(
      `Created message ${(message as any)._id} in conversation ${dto.conversationId}`,
    );

    return message as Message;
  }

  /**
   * Get messages for a conversation with pagination
   */
  async getConversationMessages(
    conversationId: string,
    page: number = 1,
    limit: number = 50,
    context: RequestContext,
  ): Promise<{ data: Message[]; total: number; page: number; limit: number }> {
    const filter = {
      conversationId,
      isDeleted: false,
    };

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: 1 }) // Oldest first (chronological order)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return {
      data: messages,
      total,
      page,
      limit,
    };
  }

  /**
   * Get messages by role
   */
  async getMessagesByRole(
    conversationId: string,
    role: 'user' | 'agent' | 'system' | 'tool',
    context: RequestContext,
  ): Promise<Message[]> {
    const filter = {
      conversationId,
      role,
      isDeleted: false,
    };

    const messages = await this.model
      .find(filter)
      .sort({ createdAt: 1 })
      .exec();

    return messages;
  }

  /**
   * Get messages with attachments
   */
  async getMessagesWithAttachments(
    conversationId: string,
    context: RequestContext,
  ): Promise<Message[]> {
    const filter = {
      conversationId,
      attachments: { $exists: true, $ne: [] },
      isDeleted: false,
    };

    const messages = await this.model
      .find(filter)
      .sort({ createdAt: -1 }) // Newest first
      .exec();

    return messages;
  }

  /**
   * Get message thread (parent and children)
   */
  async getMessageThread(
    messageId: string,
    context: RequestContext,
  ): Promise<Message[]> {
    // Get the message
    const message = await this.findById(
      new Types.ObjectId(messageId) as any,
      context,
    );

    if (!message) {
      return [];
    }

    // Get all children of this message
    const children = await this.model
      .find({
        parentId: messageId,
        isDeleted: false,
      })
      .sort({ createdAt: 1 })
      .exec();

    return [message, ...children];
  }

  /**
   * Calculate cost based on tokens
   * Using approximate pricing (can be adjusted)
   */
  private calculateCost(totalTokens: number): number {
    // Approximate cost: $0.002 per 1K tokens (gpt-4o-mini pricing)
    const costPer1kTokens = 0.002;
    return (totalTokens / 1000) * costPer1kTokens;
  }

  /**
   * Get last N messages from conversation
   */
  async getLastMessages(
    conversationId: string,
    count: number,
    context: RequestContext,
  ): Promise<Message[]> {
    const filter = {
      conversationId,
      isDeleted: false,
    };

    const messages = await this.model
      .find(filter)
      .sort({ createdAt: -1 }) // Newest first
      .limit(count)
      .exec();

    // Reverse to get chronological order
    return messages.reverse();
  }

  /**
   * Search messages by content
   */
  async searchMessages(
    conversationId: string,
    searchText: string,
    context: RequestContext,
  ): Promise<Message[]> {
    const filter = {
      conversationId,
      content: { $regex: searchText, $options: 'i' }, // Case-insensitive search
      isDeleted: false,
    };

    const messages = await this.model
      .find(filter)
      .sort({ createdAt: 1 })
      .exec();

    return messages;
  }

  /**
   * Get message statistics for a conversation
   */
  async getMessageStatistics(
    conversationId: string,
    context: RequestContext,
  ): Promise<{
    total: number;
    byRole: Record<string, number>;
    byType: Record<string, number>;
    totalTokens: number;
    withAttachments: number;
  }> {
    const filter = {
      conversationId,
      isDeleted: false,
    };

    const messages = await this.model.find(filter).exec();

    const stats = {
      total: messages.length,
      byRole: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      totalTokens: 0,
      withAttachments: 0,
    };

    messages.forEach((msg) => {
      // Count by role
      stats.byRole[msg.role] = (stats.byRole[msg.role] || 0) + 1;

      // Count by type
      if (msg.type) {
        stats.byType[msg.type] = (stats.byType[msg.type] || 0) + 1;
      }

      // Sum tokens
      if (msg.usage) {
        stats.totalTokens += msg.usage.totalTokens;
      }

      // Count attachments
      if (msg.attachments && msg.attachments.length > 0) {
        stats.withAttachments++;
      }
    });

    return stats;
  }
}
