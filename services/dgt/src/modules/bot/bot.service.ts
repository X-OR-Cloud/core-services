import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Bot, BotStatus } from './bot.schema';

@Injectable()
export class BotService extends BaseService<Bot> {
  constructor(
    @InjectModel(Bot.name) botModel: Model<Bot>,
  ) {
    super(botModel as any);
  }

  validateTransition(currentStatus: BotStatus, newStatus: BotStatus): void {
    if (currentStatus === BotStatus.DELETED) {
      throw new BadRequestException(`Cannot transition from DELETED status`);
    }

    if (newStatus === BotStatus.CREATED && currentStatus === BotStatus.RUNNING) {
      throw new BadRequestException(`Cannot transition from RUNNING to CREATED`);
    }

    if (newStatus === BotStatus.CREATED && currentStatus === BotStatus.PAUSED) {
      throw new BadRequestException(`Cannot transition from PAUSED to CREATED`);
    }
  }

  async transitionStatus(
    id: Types.ObjectId,
    newStatus: BotStatus,
    context: RequestContext,
    errorMessage?: string,
  ): Promise<Bot> {
    const bot = await this.findById(id as any, context);
    if (!bot) {
      throw new NotFoundException(`Bot ${id} not found`);
    }

    this.validateTransition(bot.status as BotStatus, newStatus);

    const payload: Record<string, any> = { status: newStatus };

    if (newStatus === BotStatus.RUNNING) {
      payload['lastActiveAt'] = new Date();
    }

    if (errorMessage) {
      payload['errorMessage'] = errorMessage;
    }

    if (newStatus === BotStatus.STOPPED || newStatus === BotStatus.DELETED) {
      payload['errorMessage'] = null;
    }

    const updated = await this.update(id as any, payload, context);
    return updated as Bot;
  }
}
