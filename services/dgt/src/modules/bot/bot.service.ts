import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext, PredefinedRole } from '@hydrabyte/shared';
import { Bot, BotStatus } from './bot.schema';

@Injectable()
export class BotService extends BaseService<Bot> {
  constructor(
    @InjectModel(Bot.name) private readonly botModel: Model<Bot>,
  ) {
    super(botModel as any);
  }

  private isOrgOwner(context: RequestContext): boolean {
    return (
      context.roles?.includes(PredefinedRole.OrganizationOwner) ||
      context.roles?.includes(PredefinedRole.UniverseOwner)
    );
  }

  private async verifyOwnership(id: any, context: RequestContext): Promise<void> {
    const existing = await super.findById(id, context);
    if (existing?.owner?.userId !== context.userId) {
      throw new ForbiddenException('Access denied');
    }
  }

  async findAll(options: FindManyOptions, context: RequestContext): Promise<FindManyResult<Bot>> {
    if (!this.isOrgOwner(context)) {
      options.filter = { ...(options.filter || {}), 'owner.userId': context.userId };
    }
    return super.findAll(options, context);
  }

  async findById(id: any, context: RequestContext): Promise<Partial<Bot>> {
    const result = await super.findById(id, context);
    if (!this.isOrgOwner(context) && result?.owner?.userId !== context.userId) {
      throw new ForbiddenException('Access denied');
    }
    return result;
  }

  async update(id: any, dto: any, context: RequestContext): Promise<Partial<Bot>> {
    if (!this.isOrgOwner(context)) {
      await this.verifyOwnership(id, context);
    }
    return super.update(id, dto, context);
  }

  async softDelete(id: any, context: RequestContext): Promise<Partial<Bot>> {
    if (!this.isOrgOwner(context)) {
      await this.verifyOwnership(id, context);
    }
    return super.softDelete(id, context);
  }

  async stopAll(context: RequestContext): Promise<{ stoppedCount: number; stoppedBotIds: string[] }> {
    const bots = await this.botModel
      .find({
        'owner.userId': context.userId,
        status: { $in: [BotStatus.RUNNING, BotStatus.PAUSED] },
        isDeleted: false,
      })
      .lean()
      .exec();

    const stoppedBotIds: string[] = [];
    for (const bot of bots) {
      await this.transitionStatus(bot._id as Types.ObjectId, BotStatus.STOPPED, context);
      stoppedBotIds.push((bot._id as Types.ObjectId).toString());
    }

    return { stoppedCount: stoppedBotIds.length, stoppedBotIds };
  }

  async getStats(userId: string): Promise<{
    activeBots: number;
    totalPnl: number;
    activeVolume: number;
    totalVolume: number;
  }> {
    const bots = await this.botModel
      .find({ 'owner.userId': userId, isDeleted: false })
      .lean()
      .exec();

    const activeBots = bots.filter((b) => b.status === BotStatus.RUNNING).length;
    const totalPnl = bots.reduce((s, b) => s + (b.stats?.totalPnl || 0), 0);
    const activeVolume = bots
      .filter((b) => b.status === BotStatus.RUNNING)
      .reduce((s, b) => s + (b.totalCapital || 0), 0);
    const totalVolume = bots.reduce((s, b) => s + (b.stats?.totalTrades || 0) * (b.maxEntrySize || 0), 0);

    return {
      activeBots,
      totalPnl: Math.round(totalPnl * 100) / 100,
      activeVolume: Math.round(activeVolume * 100) / 100,
      totalVolume: Math.round(totalVolume * 100) / 100,
    };
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
