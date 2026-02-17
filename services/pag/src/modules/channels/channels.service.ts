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

      // 3.5 Check re-engagement (user returns after 12h silence)
      if (conversation.lastActiveAt) {
        const hoursSinceLastActive = (Date.now() - new Date(conversation.lastActiveAt).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastActive >= 12) {
          this.notifyDiscord('re_engagement', { id: messageData.platformUserId, name: messageData.platformDisplayName }, {
            hours_silent: Math.round(hoursSinceLastActive),
            message_preview: messageData.text?.substring(0, 100),
          }).catch(e => this.logger.warn(`Discord re-engagement notify failed: ${e.message}`));
        }
      }

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
    const event = payload.event_name;
    const sender = payload.sender;
    const message = payload.message;

    // Follow/unfollow events → notify Discord, no message processing
    if (event === 'follow' || event === 'unfollow') {
      this.notifyDiscord(event, sender, payload).catch(e => 
        this.logger.warn(`Discord notify failed: ${e.message}`)
      );
      return null;
    }

    if (!sender || !message) return null;

    const base = {
      platformUserId: sender.id,
      platformUsername: sender.id,
      platformDisplayName: sender.name || 'Zalo User',
      platformAvatarUrl: sender.avatar,
      platformMessageId: message.msg_id,
      metadata: { timestamp: payload.timestamp, app_id: payload.app_id, oa_id: payload.oa_id, event_name: event },
    };

    // Text message
    if (event === 'user_send_text') {
      return { ...base, text: message.text };
    }

    // Non-text messages → friendly fallback
    const fallbacks: Record<string, string> = {
      'user_send_image': '[Hình ảnh] Em chưa xem được ảnh, anh/chị mô tả giúp em nhé! 📷',
      'user_send_gif': '[GIF] Haha, em chưa xem được GIF nhưng chắc vui lắm! 😄',
      'user_send_sticker': '[Sticker] 😊',
      'user_send_audio': '[Audio] Em chưa nghe được tin nhắn thoại, anh/chị gõ chữ giúp em nhé!',
      'user_send_file': '[File] Em chưa mở được file đính kèm, anh/chị cho em biết nội dung file nhé!',
      'user_send_location': '[Vị trí] Em đã nhận vị trí của anh/chị!',
      'user_send_link': '[Link] ' + (message.text || message.url || 'Em đã nhận link từ anh/chị!'),
      'user_submit_info': '[Thông tin] Em đã nhận thông tin từ anh/chị!',
    };

    const fallbackText = fallbacks[event];
    if (fallbackText) {
      return { ...base, text: fallbackText, attachments: [{ type: event.replace('user_send_', ''), raw: message }] };
    }

    // Unknown event → log and skip
    this.logger.warn(`Unhandled Zalo event: ${event}`);
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

  // ==================== Broadcast ====================

  /**
   * Get all followers from Zalo OA
   */
  async getFollowers(channelId: ObjectId) {
    const channel = await this.findById(channelId, this.systemContext);
    if (!channel) throw new NotFoundException(`Channel ${channelId} not found`);
    if (!channel.credentials?.accessToken) throw new BadRequestException('Channel missing access token');

    const followers: { userId: string }[] = [];
    let offset = 0;
    const count = 50;

    // Paginate through all followers
    while (true) {
      try {
        const response = await axios.get('https://openapi.zalo.me/v3.0/oa/user/getlist', {
          params: { data: JSON.stringify({ offset, count }) },
          headers: { 'access_token': channel.credentials.accessToken },
          timeout: 10000,
        });

        if (response.data.error !== 0) {
          throw new Error(`Zalo API error ${response.data.error}: ${response.data.message}`);
        }

        const data = response.data.data;
        if (!data?.users || data.users.length === 0) break;

        for (const f of data.users) {
          followers.push({ userId: f.user_id });
        }

        if (followers.length >= data.total) break;
        offset += count;
      } catch (error) {
        this.logger.error(`getFollowers failed at offset ${offset}: ${error.message}`);
        throw error;
      }
    }

    return { total: followers.length, followers };
  }

  /**
   * Broadcast message to users. dryRun=true returns preview without sending.
   */
  async broadcast(channelId: ObjectId, message: string, userIds?: string[], dryRun = false) {
    const channel = await this.findById(channelId, this.systemContext);
    if (!channel) throw new NotFoundException(`Channel ${channelId} not found`);
    if (!channel.credentials?.accessToken) throw new BadRequestException('Channel missing access token');

    // Resolve targets
    let targets = userIds;
    if (!targets || targets.length === 0) {
      const { followers } = await this.getFollowers(channelId);
      targets = followers.map(f => f.userId);
    }

    // Dry run — return preview
    if (dryRun) {
      return {
        dryRun: true,
        totalRecipients: targets.length,
        recipients: targets,
        messagePreview: message.substring(0, 200) + (message.length > 200 ? '...' : ''),
        messageLength: message.length,
        estimatedCost: `${targets.length} tin Tư vấn (nếu ngoài 48h window)`,
      };
    }

    this.logger.log(`Broadcasting to ${targets.length} users on channel ${channelId}`);
    const results = { sent: 0, failed: 0, total: targets.length, errors: [] as any[] };

    for (const userId of targets) {
      try {
        const response = await axios.post(
          'https://openapi.zalo.me/v3.0/oa/message/cs',
          { recipient: { user_id: userId }, message: { text: message } },
          {
            headers: { 'access_token': channel.credentials.accessToken, 'Content-Type': 'application/json' },
            timeout: 10000,
          },
        );

        if (response.data.error === 0) {
          results.sent++;
        } else {
          results.failed++;
          results.errors.push({ userId, error: response.data.message, code: response.data.error });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ userId, error: error.message });
      }

      await new Promise(r => setTimeout(r, 200));
    }

    // Notify Discord about broadcast
    this.notifyDiscord('broadcast', { id: 'system' }, {
      message_preview: message.substring(0, 100),
      sent: results.sent,
      failed: results.failed,
      total: results.total,
    }).catch(() => {});

    this.logger.log(`Broadcast complete: ${results.sent} sent, ${results.failed} failed`);
    return results;
  }

  // ==================== Discord Notifications ====================

  private async notifyDiscord(event: string, sender: any, extra: any = {}) {
    const webhookUrl = process.env['DISCORD_WEBHOOK_URL'];
    if (!webhookUrl) return;

    const colors: Record<string, number> = {
      follow: 0x2ecc71,       // green
      unfollow: 0xe74c3c,     // red
      re_engagement: 0x3498db, // blue
      broadcast: 0xf39c12,    // orange
    };

    const titles: Record<string, string> = {
      follow: '👋 Người dùng mới follow OA',
      unfollow: '😢 Người dùng unfollow OA',
      re_engagement: '🔔 Người dùng quay lại sau im lặng',
      broadcast: '📢 Broadcast đã gửi',
    };

    const descriptions: Record<string, string> = {
      follow: `**${sender?.name || sender?.id || 'Unknown'}** vừa follow TranGPT OA`,
      unfollow: `**${sender?.name || sender?.id || 'Unknown'}** vừa unfollow TranGPT OA`,
      re_engagement: `**${sender?.name || sender?.id || 'Unknown'}** quay lại sau **${extra.hours_silent || '?'}h** im lặng\n> ${extra.message_preview || ''}`,
      broadcast: `✅ ${extra.sent || 0}/${extra.total || 0} gửi thành công, ❌ ${extra.failed || 0} thất bại\n> ${extra.message_preview || ''}`,
    };

    try {
      await axios.post(webhookUrl, {
        embeds: [{
          title: titles[event] || `📌 Event: ${event}`,
          description: descriptions[event] || JSON.stringify(extra).substring(0, 200),
          color: colors[event] || 0x95a5a6,
          timestamp: new Date().toISOString(),
          footer: { text: `User ID: ${sender?.id || 'unknown'}` },
        }],
      }, { timeout: 5000 });
    } catch (error) {
      this.logger.warn(`Discord webhook failed: ${error.message}`);
    }
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