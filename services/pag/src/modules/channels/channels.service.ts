import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, Types } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Channel } from './channels.schema';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesService } from '../messages/messages.service';
import { InboundProducer } from '../../queues/producers/inbound.producer';

@Injectable()
export class ChannelsService extends BaseService<Channel> {

  constructor(
    @InjectModel(Channel.name) channelModel: Model<Channel>,
    private conversationsService: ConversationsService,
    private messagesService: MessagesService,
    private inboundProducer: InboundProducer,
  ) {
    super(channelModel as any);
  }

  /**
   * Find channel by OA ID (for Zalo webhook verification)
   * @param oaId - Zalo OA ID
   * @returns Channel or null
   */
  async findByOaId(oaId: string): Promise<Channel | null> {
    this.logger.debug(`Finding channel by oaId: ${oaId}`);

    const channel = await this.model
      .findOne({
        'credentials.oaId': oaId,
        status: { $ne: 'error' },
        isDeleted: false
      })
      .select('-isDeleted -deletedAt -password')
      .exec();

    if (channel) {
      this.logger.debug(`Channel found for oaId: ${oaId}`);
    } else {
      this.logger.debug(`Channel not found for oaId: ${oaId}`);
    }

    return channel;
  }

  /**
   * Refresh OAuth token for a channel
   * @param channelId - Channel ObjectId
   * @param context - Request context
   * @returns Updated channel with new token
   */
  async refreshToken(channelId: ObjectId, context: RequestContext): Promise<Channel | null> {
    this.logger.log(`Refreshing token for channel: ${channelId}`, {
      userId: context.userId,
      channelId: channelId.toString()
    });

    // Get current channel
    const channel = await this.findById(channelId, context);
    if (!channel) {
      throw new BadRequestException(`Channel with ID ${channelId} not found`);
    }

    if (channel.platform !== 'zalo_oa') {
      throw new BadRequestException('Token refresh only supported for Zalo OA channels');
    }

    if (!channel.credentials?.refreshToken) {
      throw new BadRequestException('No refresh token available for this channel');
    }

    // TODO: Implement actual Zalo OAuth refresh logic
    // For now, just update the tokenExpiresAt to extend the token validity
    const newExpiresAt = new Date();
    newExpiresAt.setHours(newExpiresAt.getHours() + 24); // Extend by 24 hours

    const updateData = {
      credentials: {
        ...channel.credentials,
        tokenExpiresAt: newExpiresAt
      }
    };

    const updatedChannel = await this.update(channelId, updateData, context);

    this.logger.log(`Token refreshed for channel: ${channelId}`, {
      userId: context.userId,
      newExpiresAt: newExpiresAt.toISOString()
    });

    return updatedChannel;
  }

  /**
   * Process webhook from platform (Zalo, Telegram, etc)
   * Implements Flow 1 & 2 from flows.md
   */
  async processWebhook(channelId: ObjectId, payload: any) {
    this.logger.log(`Processing webhook for channel: ${channelId}`, { payload });

    try {
      // 1. Load channel
      const channel = await this.findById(channelId, { userId: 'system' } as any);
      if (!channel) {
        throw new NotFoundException(`Channel with ID ${channelId} not found`);
      }

      // 2. Parse webhook payload based on platform
      const messageData = this.parseWebhookPayload(channel.platform, payload);
      if (!messageData) {
        this.logger.log('Webhook payload does not contain message data, ignoring');
        return { message: 'Webhook received - no message to process' };
      }

      // 3. Find or create conversation
      const conversation = await this.conversationsService.findOrCreateByPlatformUser(
        channelId,
        new Types.ObjectId(channel.defaultBotId) as any,
        messageData.platformUserId,
        {
          id: messageData.platformUserId,
          username: messageData.platformUsername || messageData.platformUserId,
          displayName: messageData.platformDisplayName || messageData.platformUsername || 'Unknown User',
          avatarUrl: messageData.platformAvatarUrl,
        }
      );

      // 4. Save user message to database
      const savedMessage = await this.messagesService.create({
        conversationId: (conversation as any)._id,
        role: 'user',
        content: messageData.text,
        platformMessageId: messageData.platformMessageId,
        attachments: messageData.attachments || [],
        metadata: messageData.metadata || {},
      }, { userId: 'system' } as any);

      // 5. Get soul slug for queue routing
      const soul = await this.model.db.collection('souls').findOne({ 
        _id: new Types.ObjectId(channel.defaultBotId) 
      });
      
      if (!soul) {
        throw new Error(`Default soul not found for channel: ${channelId}`);
      }

      // 6. Publish job to inbound queue
      await this.inboundProducer.publishMessageJob({
        conversationId: (conversation as any)._id.toString(),
        messageId: (savedMessage as any)._id.toString(),
        soulSlug: soul.slug,
        platformUserId: messageData.platformUserId,
        messageText: messageData.text,
        channelId: channelId.toString(),
      });

      this.logger.log(`Webhook processed and job queued for conversation: ${(conversation as any)._id}`);

      return {
        message: 'Webhook processed successfully',
        conversationId: (conversation as any)._id,
        messageId: (savedMessage as any)._id,
        queuedForProcessing: true,
      };

    } catch (error) {
      this.logger.error(`Error processing webhook: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Parse webhook payload based on platform type
   */
  private parseWebhookPayload(platform: string, payload: any): {
    platformUserId: string;
    platformUsername?: string;
    platformDisplayName?: string;
    platformAvatarUrl?: string;
    text: string;
    platformMessageId?: string;
    attachments?: any[];
    metadata?: any;
  } | null {
    switch (platform) {
      case 'zalo_oa':
        return this.parseZaloWebhook(payload);
      case 'telegram':
        return this.parseTelegramWebhook(payload);
      // Add other platforms as needed
      default:
        this.logger.warn(`Unsupported platform for webhook parsing: ${platform}`);
        return null;
    }
  }

  /**
   * Parse Zalo OA webhook payload
   */
  private parseZaloWebhook(payload: any) {
    // Handle Zalo OA message webhook
    // Ref: https://developers.zalo.me/docs/official-account/webhook/setup-webhook-post
    
    if (payload.event_name === 'user_send_text') {
      const message = payload.message;
      const sender = payload.sender;
      
      return {
        platformUserId: sender.id,
        platformUsername: sender.id, 
        platformDisplayName: sender.name || 'Zalo User',
        platformAvatarUrl: sender.avatar,
        text: message.text,
        platformMessageId: message.msg_id,
        metadata: {
          timestamp: payload.timestamp,
          app_id: payload.app_id,
          oa_id: payload.oa_id,
        }
      };
    }

    // Handle other Zalo events as needed (images, stickers, etc.)
    return null;
  }

  /**
   * Parse Telegram webhook payload  
   */
  private parseTelegramWebhook(payload: any) {
    // Handle Telegram bot webhook
    if (payload.message && payload.message.text) {
      const message = payload.message;
      const from = message.from;
      
      return {
        platformUserId: from.id.toString(),
        platformUsername: from.username,
        platformDisplayName: `${from.first_name} ${from.last_name || ''}`.trim(),
        text: message.text,
        platformMessageId: message.message_id.toString(),
        metadata: {
          chat: message.chat,
          date: message.date,
        }
      };
    }

    return null;
  }
}