import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { Call } from './calls.schema';

@Injectable()
export class CallsService extends BaseService<Call> {
  constructor(@InjectModel(Call.name) model: Model<Call>) {
    super(model as any);
  }

  /**
   * Find calls with date range and optional filters
   */
  async findByDateRange(
    from?: Date,
    to?: Date,
    filters?: { caller?: string; status?: string; extensionId?: string },
    page = 1,
    limit = 20,
  ): Promise<{ data: Call[]; total: number }> {
    const query: any = { isDeleted: false };

    if (from || to) {
      query.startedAt = {};
      if (from) query.startedAt.$gte = from;
      if (to) query.startedAt.$lte = to;
    }

    if (filters?.caller) {
      query.callerNumber = new RegExp(filters.caller, 'i');
    }
    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.extensionId) {
      query.extensionId = filters.extensionId;
    }

    const [data, total] = await Promise.all([
      this.model
        .find(query)
        .sort({ startedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-isDeleted -deletedAt -password')
        .exec(),
      this.model.countDocuments(query).exec(),
    ]);

    return { data, total };
  }

  /**
   * Find call by Asterisk callId / AudioSocket UUID
   */
  async findByCallId(callId: string): Promise<Call | null> {
    return this.model
      .findOne({ callId, isDeleted: false })
      .exec();
  }
}
