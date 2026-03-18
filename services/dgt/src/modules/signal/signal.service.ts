import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext, PredefinedRole } from '@hydrabyte/shared';
import { Signal } from './signal.schema';
import { Account } from '../account/account.schema';

@Injectable()
export class SignalService extends BaseService<Signal> {
  constructor(
    @InjectModel(Signal.name) signalModel: Model<Signal>,
    @InjectModel(Account.name) private readonly accountModel: Model<Account>,
  ) {
    super(signalModel as any);
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

  async findAll(options: FindManyOptions, context: RequestContext): Promise<FindManyResult<Signal>> {
    if (!this.isOrgOwner(context)) {
      const accountIds = await this.getUserAccountIds(context.userId);
      const requestedAccountId = (options.filter as any)?.accountId;
      if (requestedAccountId) {
        const requested = new Types.ObjectId(requestedAccountId);
        const belongs = accountIds.some((id) => id.equals(requested));
        if (!belongs) {
          // Return empty result — requested accountId không thuộc về user
          options.filter = { ...(options.filter || {}), accountId: new Types.ObjectId() };
        }
      } else {
        options.filter = { ...(options.filter || {}), accountId: { $in: accountIds } };
      }
    }
    return super.findAll(options, context);
  }

  async findById(id: any, context: RequestContext): Promise<Partial<Signal>> {
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
}
