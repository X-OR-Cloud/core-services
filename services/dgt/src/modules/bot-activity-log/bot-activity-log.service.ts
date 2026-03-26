import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext, PredefinedRole } from '@hydrabyte/shared';
import { BotActivityLog, ActivityActionType, ActivityStatus } from './bot-activity-log.schema';
import { Account } from '../account/account.schema';

@Injectable()
export class BotActivityLogService extends BaseService<BotActivityLog> {
  constructor(
    @InjectModel(BotActivityLog.name) botActivityLogModel: Model<BotActivityLog>,
    @InjectModel(Account.name) private readonly accountModel: Model<Account>,
  ) {
    super(botActivityLogModel as any);
  }

  private isOrgOwner(context: RequestContext): boolean {
    return (
      context.roles?.includes(PredefinedRole.OrganizationOwner) ||
      context.roles?.includes(PredefinedRole.UniverseOwner)
    );
  }

  private async getUserAccountIds(userId: string): Promise<Types.ObjectId[]> {
    return this.accountModel
      .find({ 'owner.userId': userId, isDeleted: false })
      .distinct('_id');
  }

  async findAll(options: FindManyOptions, context: RequestContext): Promise<FindManyResult<BotActivityLog>> {
    // Cast botId string → ObjectId nếu có trong filter
    const filter = (options.filter as any) || {};
    if (filter.botId && typeof filter.botId === 'string') {
      filter.botId = new Types.ObjectId(filter.botId);
      options.filter = filter;
    }

    if (!this.isOrgOwner(context)) {
      const accountIds = await this.getUserAccountIds(context.userId);
      const requestedAccountId = filter.accountId;
      if (requestedAccountId) {
        const requested = new Types.ObjectId(requestedAccountId);
        const belongs = accountIds.some((id) => id.equals(requested));
        if (!belongs) {
          options.filter = { ...(options.filter || {}), accountId: new Types.ObjectId() };
        }
      } else {
        options.filter = { ...(options.filter || {}), accountId: { $in: accountIds } };
      }
    }
    return super.findAll(options, context);
  }

  async findById(id: any, context: RequestContext): Promise<Partial<BotActivityLog>> {
    const result = await super.findById(id, context);
    if (!this.isOrgOwner(context)) {
      const accountIds = await this.getUserAccountIds(context.userId);
      const belongs = accountIds.some((aid) => aid.equals(result?.accountId as Types.ObjectId));
      if (!belongs) {
        throw new ForbiddenException('Access denied');
      }
    }
    return result;
  }

  async logActivity(
    data: {
      botId: Types.ObjectId;
      accountId: Types.ObjectId;
      action: string;
      actionType: ActivityActionType;
      details: string;
      metadata?: Record<string, any>;
      performedBy?: 'user' | 'system';
      status?: ActivityStatus;
    },
    context: RequestContext,
  ): Promise<Partial<BotActivityLog>> {
    return this.create(data, context);
  }
}
