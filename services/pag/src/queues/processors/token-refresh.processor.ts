import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Types } from 'mongoose';
import axios from 'axios';
import { QUEUE_NAMES, QUEUE_EVENTS } from '../../config/queue.config';
import { ChannelsService } from '../../modules/channels/channels.service';

interface TokenRefreshJobData {
  channelId?: string; // If specified, only refresh this channel
  triggeredAt: string;
}

@Processor(QUEUE_NAMES.TOKEN_REFRESH)
export class TokenRefreshProcessor extends WorkerHost {
  private readonly logger = new Logger(TokenRefreshProcessor.name);

  constructor(
    private channelsService: ChannelsService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.log(`Processing token refresh job ${job.id}`);

    switch (job.name) {
      case QUEUE_EVENTS.TOKEN_REFRESH:
        return this.handleTokenRefresh(job.data.data as TokenRefreshJobData);
      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
        return null;
    }
  }

  /**
   * Process token refresh tasks (Flow 6 from flows.md)
   */
  private async handleTokenRefresh(data: TokenRefreshJobData): Promise<any> {
    try {
      this.logger.log('Processing token refresh task');

      // 1. Load channels that need token refresh
      const channels = data.channelId 
        ? [await this.channelsService.findById(new Types.ObjectId(data.channelId) as any, { userId: 'system' } as any)]
        : await this.getChannelsNeedingRefresh();

      const validChannels = channels.filter(channel => channel && this.shouldRefreshToken(channel));
      
      let totalProcessed = 0;
      let totalRefreshed = 0;
      let totalFailed = 0;

      for (const channel of validChannels) {
        if (!channel) continue;

        try {
          totalProcessed++;
          const refreshed = await this.refreshChannelToken(channel);
          
          if (refreshed) {
            totalRefreshed++;
            this.logger.log(`Token refreshed successfully for channel: ${channel.name} (${channel.platform})`);
          } else {
            this.logger.log(`Token refresh not needed for channel: ${channel.name} (${channel.platform})`);
          }

        } catch (error) {
          totalFailed++;
          this.logger.error(`Failed to refresh token for channel ${channel.name}: ${error.message}`, error.stack);
        }
      }

      this.logger.log(`Token refresh completed. Processed ${totalProcessed} channels, refreshed ${totalRefreshed}, failed ${totalFailed}`);

      return {
        processed: true,
        channelsProcessed: totalProcessed,
        tokensRefreshed: totalRefreshed,
        failures: totalFailed,
        triggeredAt: data.triggeredAt,
      };

    } catch (error) {
      this.logger.error(`Error processing token refresh: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all channels that might need token refresh
   */
  private async getChannelsNeedingRefresh(): Promise<any[]> {
    // Get all active channels
    const result = await this.channelsService.findAll(
      { limit: 1000, page: 1 }, 
      { userId: 'system' } as any
    );
    
    // The BaseService.findAll returns { data, total, limit, skip }
    return (result as any).data || [];
  }

  /**
   * Check if a channel's token needs refreshing
   */
  private shouldRefreshToken(channel: any): boolean {
    // Only process channels that have OAuth tokens
    if (!channel.credentials?.refreshToken) {
      return false;
    }

    // Check if token is expiring soon (within 1 hour)
    if (channel.credentials.tokenExpiresAt) {
      const expiresAt = new Date(channel.credentials.tokenExpiresAt);
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
      
      if (expiresAt > oneHourFromNow) {
        return false; // Token is still valid for more than 1 hour
      }
    }

    return true;
  }

  /**
   * Refresh token for a specific channel
   */
  private async refreshChannelToken(channel: any): Promise<boolean> {
    try {
      // Delegate to the channel service refresh method
      const refreshedChannel = await this.channelsService.refreshToken(
        channel._id,
        { userId: 'system' } as any
      );

      return !!refreshedChannel;

    } catch (error) {
      // If the refresh fails due to invalid refresh token, mark the channel as needing manual attention
      if (error.message.includes('invalid_grant') || error.message.includes('refresh_token')) {
        this.logger.warn(`Invalid refresh token for channel ${channel.name}. Manual re-authentication may be required.`);
        
        // Update channel to mark token as expired
        try {
          await this.channelsService.update(
            channel._id,
            { 
              credentials: {
                ...channel.credentials,
                accessToken: null,
                tokenExpiresAt: new Date(), // Mark as expired
              },
              status: 'token_expired',
            },
            { userId: 'system' } as any
          );
        } catch (updateError) {
          this.logger.error(`Failed to update channel status: ${updateError.message}`);
        }
      }

      throw error;
    }
  }
}