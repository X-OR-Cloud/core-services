import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Types } from 'mongoose';
import axios from 'axios';
import { RequestContext } from '@hydrabyte/shared';
import { QUEUE_NAMES, QUEUE_EVENTS } from '../../config/queue.config';
import { UserNewsPrefsService } from '../../modules/user-news-prefs/user-news-prefs.service';
import { NewsDigestService } from '../../modules/news-digest/news-digest.service';
import { ChannelsService } from '../../modules/channels/channels.service';
import { ConversationsService } from '../../modules/conversations/conversations.service';
import { MessagesService } from '../../modules/messages/messages.service';

@Processor(QUEUE_NAMES.NEWS_DELIVERY)
export class NewsDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(NewsDeliveryProcessor.name);

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

  constructor(
    private readonly userNewsPrefsService: UserNewsPrefsService,
    private readonly newsDigestService: NewsDigestService,
    private readonly channelsService: ChannelsService,
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.log(`Processing news delivery job: ${job.name}`);

    switch (job.name) {
      case QUEUE_EVENTS.NEWS_DELIVERY_MORNING:
        return this.deliverDigests('morning');
      case QUEUE_EVENTS.NEWS_DELIVERY_EVENING:
        return this.deliverDigests('evening');
      default:
        this.logger.warn(`Unknown delivery job: ${job.name}`);
        return null;
    }
  }

  private async deliverDigests(slot: 'morning' | 'evening'): Promise<any> {
    const prefs = await this.userNewsPrefsService.findActiveByFrequency(slot);
    this.logger.log(`News delivery [${slot}]: found ${prefs.length} active users`);

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const pref of prefs) {
      try {
        const platformUserId = pref.platformUserId;
        const soulId = pref.soulId;
        const channelId = pref.channelId;

        // Debounce: skip if delivered within last 6 hours
        if (pref.lastDeliveredAt) {
          const hoursSince = (Date.now() - new Date(pref.lastDeliveredAt).getTime()) / 3_600_000;
          if (hoursSince < 6) {
            this.logger.log(`Skipping ${platformUserId} — delivered ${hoursSince.toFixed(1)}h ago`);
            skipped++;
            continue;
          }
        }

        // Build digest via Gemini
        const digest = await this.newsDigestService.buildDigest(platformUserId, soulId);

        // Send via Zalo
        const messageSent = await this.sendZaloMessage(channelId, platformUserId, digest);
        if (!messageSent) {
          skipped++;
          continue;
        }

        // Find/create conversation for message history
        const conversation = await this.conversationsService.findOrCreateByPlatformUser(
          channelId,
          soulId,
          { id: platformUserId },
          this.systemContext,
        );

        // Save to message history
        await this.messagesService.create({
          conversationId: new Types.ObjectId((conversation as any)._id) as any,
          role: 'assistant',
          content: digest,
        }, this.systemContext);

        // Mark delivered
        await this.userNewsPrefsService.markDelivered(platformUserId, soulId);

        this.logger.log(`Digest delivered [${slot}] → user: ${platformUserId}`);
        sent++;
      } catch (err: any) {
        this.logger.error(`Delivery failed for ${pref.platformUserId}: ${err.message}`);
        failed++;
      }
    }

    const result = { slot, total: prefs.length, sent, skipped, failed };
    this.logger.log(`News delivery [${slot}] complete: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Send message via Zalo OA API.
   * Returns true on success, false on Zalo -216 (48h window) or missing token — these are skipped.
   * Throws on unexpected errors (triggers BullMQ retry).
   */
  private async sendZaloMessage(channelId: string, platformUserId: string, text: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(channelId)) {
      this.logger.warn(`Invalid channelId "${channelId}" for user ${platformUserId} — skipping`);
      return false;
    }

    const channel = await this.channelsService.findById(
      new Types.ObjectId(channelId) as any,
      this.systemContext,
    );

    if (!channel || !channel.credentials?.accessToken) {
      this.logger.warn(`Channel ${channelId} missing access token — skipping user ${platformUserId}`);
      return false;
    }

    const response = await axios.post(
      'https://openapi.zalo.me/v3.0/oa/message/cs',
      {
        recipient: { user_id: platformUserId },
        message: { text },
      },
      {
        headers: {
          'access_token': channel.credentials.accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      },
    );

    const errorCode = response.data.error;

    if (errorCode === 0) {
      return true;
    }

    // Zalo -216: 48h window exceeded — skip silently
    // Zalo -201: invalid/expired token — skip silently
    if (errorCode === -216 || errorCode === -201) {
      this.logger.warn(`Zalo error ${errorCode} for user ${platformUserId} — skipping (${response.data.message})`);
      return false;
    }

    throw new Error(`Zalo API error ${errorCode}: ${response.data.message || 'Unknown'}`);
  }
}
