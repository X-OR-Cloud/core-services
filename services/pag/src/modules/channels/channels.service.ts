import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, Types } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Channel } from './channels.schema';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesService } from '../messages/messages.service';
import { InboundProducer } from '../../queues/producers/inbound.producer';
import axios from 'axios';
import * as crypto from 'crypto';

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
  private get systemContext(): RequestContext {
    return {
      orgId: '',
      groupId: '',
      userId: 'system',
      agentId: '',
      appId: '',
      roles: ['universe.owner' as any],
    };
  }

  async processWebhook(channelId: ObjectId, payload: any) {
    this.logger.log(`Processing webhook for channel: ${channelId}`, { payload });

    try {
      // 1. Load channel
      const channel = await this.findById(channelId, this.systemContext);
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
        channelId as any,
        new Types.ObjectId(channel.defaultBotId) as any,
        {
          id: messageData.platformUserId,
          username: messageData.platformUsername || messageData.platformUserId,
        },
        this.systemContext,
      );

      // 4. Save user message to database
      const savedMessage = await this.messagesService.create({
        conversationId: (conversation as any)._id,
        role: 'user',
        content: messageData.text,
        platformMessageId: messageData.platformMessageId,
        attachments: messageData.attachments || [],
        metadata: messageData.metadata || {},
      }, this.systemContext);

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

  // ==================== OAuth v4 ====================

  // Store code_verifier temporarily (in-memory for MVP, should be Redis for production)
  private codeVerifiers = new Map<string, string>();

  /**
   * Generate OAuth URL for Zalo OA authorization
   */
  async getOAuthUrl(channelId: ObjectId): Promise<string> {
    const channel = await this.findById(channelId, this.systemContext);
    if (!channel) {
      throw new NotFoundException(`Channel ${channelId} not found`);
    }

    const appId = channel.credentials?.appId;
    if (!appId) {
      throw new BadRequestException('Channel missing appId in credentials');
    }

    // Generate PKCE code_verifier and code_challenge
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    // Store code_verifier for later exchange
    this.codeVerifiers.set(channelId.toString(), codeVerifier);

    const redirectUri = `${process.env['PAG_BASE_URL'] || 'https://api.hydrabyte.co/pag'}/channels/${channelId}/oauth-callback`;

    const params = new URLSearchParams({
      app_id: appId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
    });

    return `https://oauth.zaloapp.com/v4/oa/permission?${params.toString()}`;
  }

  /**
   * Handle OAuth callback — exchange code for access token
   */
  async handleOAuthCallback(channelId: ObjectId, code: string) {
    const channel = await this.findById(channelId, this.systemContext);
    if (!channel) {
      throw new NotFoundException(`Channel ${channelId} not found`);
    }

    const codeVerifier = this.codeVerifiers.get(channelId.toString());
    if (!codeVerifier) {
      throw new BadRequestException('OAuth session expired. Please start the OAuth flow again.');
    }

    const appId = channel.credentials?.appId;
    const appSecret = channel.credentials?.appSecret;

    if (!appId || !appSecret) {
      throw new BadRequestException('Channel missing appId or appSecret');
    }

    try {
      // Exchange code for access token
      const response = await axios.post(
        'https://oauth.zaloapp.com/v4/oa/access_token',
        new URLSearchParams({
          code,
          app_id: appId,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'secret_key': appSecret,
          },
          timeout: 10000,
        },
      );

      const { access_token, refresh_token, expires_in } = response.data;

      if (!access_token) {
        throw new Error(`Zalo OAuth error: ${JSON.stringify(response.data)}`);
      }

      // Calculate expiry
      const tokenExpiresAt = new Date(Date.now() + (expires_in || 86400) * 1000);

      // Update channel with tokens
      await this.update(channelId, {
        credentials: {
          ...channel.credentials,
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: tokenExpiresAt.toISOString(),
        },
        status: 'active',
      } as any, this.systemContext);

      // Clean up code_verifier
      this.codeVerifiers.delete(channelId.toString());

      this.logger.log(`OAuth completed for channel ${channelId}, token expires at ${tokenExpiresAt.toISOString()}`);

      return {
        name: channel.name,
        tokenExpiresAt: tokenExpiresAt.toISOString(),
      };

    } catch (error) {
      this.logger.error(`OAuth token exchange failed: ${error.message}`, error.stack);
      throw new BadRequestException(`OAuth failed: ${error.message}`);
    }
  }

  /**
   * Refresh Zalo OA access token using refresh_token
   */
  async refreshZaloToken(channelId: ObjectId): Promise<void> {
    const channel = await this.findById(channelId, this.systemContext);
    if (!channel) {
      throw new NotFoundException(`Channel ${channelId} not found`);
    }

    const refreshToken = channel.credentials?.refreshToken;
    const appId = channel.credentials?.appId;
    const appSecret = channel.credentials?.appSecret;

    if (!refreshToken || !appId || !appSecret) {
      throw new BadRequestException('Channel missing refresh token or app credentials');
    }

    try {
      const response = await axios.post(
        'https://oauth.zaloapp.com/v4/oa/access_token',
        new URLSearchParams({
          refresh_token: refreshToken,
          app_id: appId,
          grant_type: 'refresh_token',
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'secret_key': appSecret,
          },
          timeout: 10000,
        },
      );

      const { access_token, refresh_token: newRefreshToken, expires_in } = response.data;

      if (!access_token) {
        throw new Error(`Zalo refresh error: ${JSON.stringify(response.data)}`);
      }

      const tokenExpiresAt = new Date(Date.now() + (expires_in || 86400) * 1000);

      await this.update(channelId, {
        credentials: {
          ...channel.credentials,
          accessToken: access_token,
          refreshToken: newRefreshToken || refreshToken,
          tokenExpiresAt: tokenExpiresAt.toISOString(),
        },
      } as any, this.systemContext);

      this.logger.log(`Token refreshed for channel ${channelId}, new expiry: ${tokenExpiresAt.toISOString()}`);

    } catch (error) {
      this.logger.error(`Token refresh failed for channel ${channelId}: ${error.message}`, error.stack);
      
      // Mark channel as error if refresh fails
      await this.update(channelId, { status: 'error' } as any, this.systemContext);
      throw error;
    }
  }
}