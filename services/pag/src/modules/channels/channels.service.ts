import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Channel } from './channels.schema';

@Injectable()
export class ChannelsService extends BaseService<Channel> {

  constructor(@InjectModel(Channel.name) channelModel: Model<Channel>) {
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
}