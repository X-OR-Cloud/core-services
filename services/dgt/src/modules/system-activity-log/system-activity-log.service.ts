import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import {
  SystemActivityLog,
  SystemWorkerType,
  SystemActivityStatus,
} from './system-activity-log.schema';

export interface LogSystemActivityParams {
  workerType: SystemWorkerType;
  source: string;
  symbol?: string;
  action: string;
  status?: SystemActivityStatus;
  details: string;
  metadata?: Record<string, any>;
  durationMs?: number;
}

@Injectable()
export class SystemActivityLogService extends BaseService<SystemActivityLog> {
  constructor(
    @InjectModel(SystemActivityLog.name)
    systemActivityLogModel: Model<SystemActivityLog>,
  ) {
    super(systemActivityLogModel as any);
  }

  async findAll(
    options: FindManyOptions,
    context: RequestContext,
  ): Promise<FindManyResult<SystemActivityLog>> {
    return super.findAll(options, context);
  }

  async findById(id: any, context: RequestContext): Promise<Partial<SystemActivityLog>> {
    return super.findById(id, context);
  }

  async logActivity(data: LogSystemActivityParams): Promise<void> {
    try {
      const systemContext: RequestContext = {
        userId: 'system',
        orgId: 'system',
        roles: [],
        email: 'system',
      } as any;

      await this.create(
        {
          ...data,
          status: data.status ?? SystemActivityStatus.INFO,
        },
        systemContext,
      );
    } catch {
      // non-blocking — không throw để tránh ảnh hưởng worker chính
    }
  }
}
