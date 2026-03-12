import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Conversation, ConversationDocument } from './conversation.schema';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { UtilService } from '../util/util.service';
import { GenerateTextRequestDto } from '../util/dto/text-generation.dto';

@Injectable()
export class ConversationService extends BaseService<Conversation> {
  protected readonly logger = new Logger(ConversationService.name);

  constructor(
    @InjectModel(Conversation.name)
    conversationModel: Model<ConversationDocument>,
    private readonly utilService: UtilService,
  ) {
    super(conversationModel as any);
  }

  async findAll(options: FindManyOptions, context: RequestContext): Promise<FindManyResult<Conversation>> {
    return await super.findAll(options, context);
  }

  /**
   * Find or create a conversation for a specific (userId, agentId) pair.
   * Works for both authenticated users and anonymous users.
   */
  async findOrCreateForUser(
    userId: string,
    agentId: string,
    orgId: string,
    userType: 'authenticated' | 'anonymous',
  ): Promise<Conversation> {
    const existing = await this.model.findOne({
      agentId,
      userId,
      status: 'active',
      isDeleted: false,
    }).exec();

    if (existing) {
      this.logger.log(`Reusing existing conversation ${existing._id} for user ${userId} + agent ${agentId}`);
      return existing as Conversation;
    }

    const newConversation = await this.model.create({
      title: `Conversation with agent ${agentId}`,
      description: '',
      agentId,
      userId,
      userType,
      conversationType: 'chat',
      status: 'active',
      totalTokens: 0,
      totalMessages: 0,
      totalCost: 0,
      participants: [
        { type: 'user' as const, id: userId, joined: new Date() },
        { type: 'agent' as const, id: agentId, joined: new Date() },
      ],
      owner: {
        orgId,
        userId: userType === 'authenticated' ? userId : '',
        groupId: '',
        agentId,
        appId: '',
      },
      createdBy: userId || agentId,
      updatedBy: userId || agentId,
    });

    this.logger.log(`Created new conversation ${newConversation._id} for user ${userId} + agent ${agentId}`);
    return newConversation as Conversation;
  }

  /**
   * Create a new conversation
   */
  async createConversation(
    dto: CreateConversationDto,
    context: RequestContext,
  ): Promise<Conversation> {
    const conversation = await this.create(
      {
        ...dto,
        conversationType: 'chat', // Default to chat
        status: 'active',
        totalTokens: 0,
        totalMessages: 0,
        totalCost: 0,
        participants: [
          {
            type: 'user' as const,
            id: context.userId,
            joined: new Date(),
          },
          {
            type: 'agent' as const,
            id: dto.agentId,
            joined: new Date(),
          },
        ],
        tags: dto.tags || [],
      },
      context,
    );

    this.logger.log(
      `Created conversation ${(conversation as any)._id} for user ${context.userId}`,
    );

    return conversation as Conversation;
  }

  /**
   * Update conversation
   */
  async updateConversation(
    id: string,
    dto: UpdateConversationDto,
    context: RequestContext,
  ): Promise<Conversation> {
    const updated = await this.update(
      new Types.ObjectId(id) as any,
      dto as any,
      context,
    );

    this.logger.log(`Updated conversation ${id}`);

    return updated as Conversation;
  }

  /**
   * Add participant to conversation
   */
  async addParticipant(
    conversationId: string,
    participantType: 'user' | 'agent',
    participantId: string,
    context: RequestContext,
  ): Promise<Conversation> {
    const conversation = await this.findById(
      new Types.ObjectId(conversationId) as any,
      context,
    );

    if (!conversation) {
      throw new NotFoundException(
        `Conversation ${conversationId} not found`,
      );
    }

    // Check if participant already exists
    const exists = conversation.participants?.some(
      (p) => p.type === participantType && p.id === participantId,
    );

    if (exists) {
      this.logger.warn(
        `Participant ${participantId} already in conversation ${conversationId}`,
      );
      return conversation;
    }

    // Add new participant
    const updatedParticipants = [
      ...(conversation.participants || []),
      {
        type: participantType,
        id: participantId,
        joined: new Date(),
      },
    ];

    const updated = await this.update(
      new Types.ObjectId(conversationId) as any,
      { participants: updatedParticipants } as any,
      context,
    );

    this.logger.log(
      `Added ${participantType} ${participantId} to conversation ${conversationId}`,
    );

    return updated as Conversation;
  }

  /**
   * Remove participant from conversation
   */
  async removeParticipant(
    conversationId: string,
    participantType: 'user' | 'agent',
    participantId: string,
    context: RequestContext,
  ): Promise<Conversation> {
    const conversation = await this.findById(
      new Types.ObjectId(conversationId) as any,
      context,
    );

    if (!conversation) {
      throw new NotFoundException(
        `Conversation ${conversationId} not found`,
      );
    }

    // Filter out the participant
    const updatedParticipants = (conversation.participants || []).filter(
      (p) => !(p.type === participantType && p.id === participantId),
    );

    const updated = await this.update(
      new Types.ObjectId(conversationId) as any,
      { participants: updatedParticipants } as any,
      context,
    );

    this.logger.log(
      `Removed ${participantType} ${participantId} from conversation ${conversationId}`,
    );

    return updated as Conversation;
  }

  /**
   * Update last message preview
   */
  async updateLastMessage(
    conversationId: string,
    content: string,
    role: string,
    createdAt: Date,
  ): Promise<void> {
    await this.model
      .findByIdAndUpdate(conversationId, {
        $set: {
          lastMessage: {
            content: content.substring(0, 100), // Truncate for preview
            role,
            createdAt,
          },
        },
      })
      .exec();

    this.logger.debug(`Updated last message for conversation ${conversationId}`);
  }

  /**
   * Increment message count
   */
  async incrementMessageCount(conversationId: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(conversationId, {
        $inc: { totalMessages: 1 },
      })
      .exec();
  }

  /**
   * Update token usage
   */
  async updateTokenUsage(
    conversationId: string,
    tokens: number,
    cost: number,
  ): Promise<void> {
    await this.model
      .findByIdAndUpdate(conversationId, {
        $inc: {
          totalTokens: tokens,
          totalCost: cost,
        },
      })
      .exec();

    this.logger.debug(
      `Updated tokens (+${tokens}) and cost (+$${cost.toFixed(4)}) for conversation ${conversationId}`,
    );
  }

  /**
   * Generate context summary for conversation
   * Called every 10 messages
   */
  async generateContextSummary(
    conversationId: string,
    context: RequestContext,
  ): Promise<string> {
    try {
      // Get conversation with recent messages
      const conversation = await this.model.findById(conversationId).exec();

      if (!conversation) {
        throw new NotFoundException(
          `Conversation ${conversationId} not found`,
        );
      }

      // TODO: Get last 10 messages from MessageService
      // For now, use a placeholder user input
      const userInput = `Conversation ID: ${conversationId}, Total messages: ${conversation.totalMessages}, Agent: ${conversation.agentId}`;

      const request: GenerateTextRequestDto = {
        fieldDescription:
          'Summarize the conversation context in 2-3 sentences focusing on main topics, key decisions, and current state.',
        userInput,
        maxLength: 150,
      };

      const response = await this.utilService.generateText(request, context);
      const summary = response.generatedText;

      // Update conversation with summary
      await this.model
        .findByIdAndUpdate(conversationId, {
          $set: { contextSummary: summary },
        })
        .exec();

      this.logger.log(
        `Generated context summary for conversation ${conversationId}`,
      );

      return summary;
    } catch (error) {
      this.logger.error(
        `Failed to generate context summary for conversation ${conversationId}:`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get user's conversations
   */
  async getUserConversations(
    userId: string,
    status?: string,
    context?: RequestContext,
  ): Promise<Conversation[]> {
    const filter: any = {
      'participants.id': userId,
      isDeleted: false,
    };

    if (status) {
      filter.status = status;
    }

    const conversations = await this.model
      .find(filter)
      .sort({ updatedAt: -1 })
      .exec();

    return conversations;
  }

  /**
   * Get agent's conversations
   */
  async getAgentConversations(
    agentId: string,
    status?: string,
    context?: RequestContext,
  ): Promise<Conversation[]> {
    const filter: any = {
      agentId,
      isDeleted: false,
    };

    if (status) {
      filter.status = status;
    }

    const conversations = await this.model
      .find(filter)
      .sort({ updatedAt: -1 })
      .exec();

    return conversations;
  }

  /**
   * Archive conversation
   */
  async archiveConversation(
    id: string,
    context: RequestContext,
  ): Promise<Conversation> {
    const updated = await this.update(
      new Types.ObjectId(id) as any,
      { status: 'archived' } as any,
      context,
    );

    this.logger.log(`Archived conversation ${id}`);

    return updated as Conversation;
  }

  /**
   * Close conversation
   */
  async closeConversation(
    id: string,
    context: RequestContext,
  ): Promise<Conversation> {
    const updated = await this.update(
      new Types.ObjectId(id) as any,
      { status: 'closed' } as any,
      context,
    );

    this.logger.log(`Closed conversation ${id}`);

    return updated as Conversation;
  }
}
