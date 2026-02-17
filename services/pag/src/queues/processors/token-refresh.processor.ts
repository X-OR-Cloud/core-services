import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Types } from 'mongoose';
import { RequestContext } from '@hydrabyte/shared';
import { QUEUE_NAMES, QUEUE_EVENTS } from '../../config/queue.config';
import { ChannelsService } from '../../modules/channels/channels.service';

@Processor(QUEUE_NAMES.TOKEN_REFRESH)
export class TokenRefreshProcessor extends WorkerHost {
  private readonly logger = new Logger(TokenRefreshProcessor.name);

  private get systemContext(): RequestContext {
    return {
      orgId: '', groupId: '', userId: 'system',
      agentId: '', appId: '', roles: ['universe.owner' as any],
    };
  }

  constructor(private channelsService: ChannelsService) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.log(`Processing token refresh job ${job.id}`);
    return this.handleTokenRefresh(job.data);
  }

  private async handleTokenRefresh(data: any): Promise<any> {
    try {
      // Get all active channels
      const result = await this.channelsService.findAll(
        { limit: 1000, page: 1 },
        this.systemContext,
      );
      const channels = (result as any).data || [];

      let refreshed = 0;
      let failed = 0;

      for (const channel of channels) {
        if (!channel.credentials?.refreshToken) continue;

        // Check if token expires within 1 hour
        if (channel.credentials.tokenExpiresAt) {
          const expiresAt = new Date(channel.credentials.tokenExpiresAt);
          if (expiresAt.getTime() > Date.now() + 60 * 60 * 1000) continue;
        }

        try {
          await this.channelsService.refreshZaloToken(channel._id);
          refreshed++;
          this.logger.log(`Token refreshed: ${channel.name}`);
        } catch (error) {
          failed++;
          this.logger.error(`Token refresh failed for ${channel.name}: ${error.message}`);
        }
      }

      return { refreshed, failed, total: channels.length };
    } catch (error) {
      this.logger.error(`Token refresh error: ${error.message}`, error.stack);
      throw error;
    }
  }
}
