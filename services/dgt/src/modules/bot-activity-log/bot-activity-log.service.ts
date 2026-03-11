import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { BotActivityLog, ActivityActionType, ActivityStatus } from './bot-activity-log.schema';

@Injectable()
export class BotActivityLogService extends BaseService<BotActivityLog> {
  constructor(
    @InjectModel(BotActivityLog.name) botActivityLogModel: Model<BotActivityLog>,
  ) {
    super(botActivityLogModel as any);
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
