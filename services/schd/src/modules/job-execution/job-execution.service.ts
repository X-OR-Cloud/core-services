import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { JobExecution } from './job-execution.schema';
import { ScheduledJob } from '../scheduled-job/scheduled-job.schema';
import { ExecutionStatsResponseDto } from './job-execution.dto';
import {
  EXECUTION_STATUS,
  TRIGGER_TYPE,
  SCHEDULER_CONFIG,
} from '../../config/scheduler.config';
import { v4 as uuidv4 } from 'uuid';

interface CreateExecutionParams {
  job: ScheduledJob;
  triggeredBy: 'scheduler' | 'manual';
  triggeredByUser?: string;
  retryOf?: Types.ObjectId;
  retryCount?: number;
}

interface UpdateFromResultParams {
  executionId: string;
  status: 'completed' | 'failed';
  result?: Record<string, any>;
  error?: { message: string; code?: string };
  startedAt?: Date;
  completedAt?: Date;
}

@Injectable()
export class JobExecutionService extends BaseService<JobExecution> {
  constructor(
    @InjectModel(JobExecution.name) private executionModel: Model<JobExecution>,
  ) {
    super(executionModel as any);
  }

  /**
   * Create a new job execution record
   */
  async createExecution(
    params: CreateExecutionParams,
    context?: RequestContext,
  ): Promise<JobExecution> {
    const { job, triggeredBy, triggeredByUser, retryOf, retryCount = 0 } = params;

    const execution = new this.executionModel({
      jobId: (job as any)._id,
      jobName: job.name,
      triggeredAt: new Date(),
      triggeredBy,
      triggeredByUser,
      status: EXECUTION_STATUS.PENDING,
      retryCount,
      retryOf,
      correlationId: uuidv4(),
      timeout: job.timeout,
      // Copy owner from job if context not provided
      owner: context ? {
        orgId: context.orgId,
        userId: context.userId,
        groupId: context.groupId || '',
        agentId: '',
        appId: '',
      } : (job as any).owner,
    });

    const saved = await execution.save();

    this.logger.info('Job execution created', {
      executionId: (saved as any)._id,
      jobId: (job as any)._id,
      jobName: job.name,
      triggeredBy,
      retryCount,
    });

    return saved;
  }

  /**
   * Update execution status to queued
   */
  async markAsQueued(executionId: string): Promise<JobExecution | null> {
    return this.executionModel.findByIdAndUpdate(
      executionId,
      {
        status: EXECUTION_STATUS.QUEUED,
        queuedAt: new Date(),
      },
      { new: true },
    ).exec();
  }

  /**
   * Update execution status to running
   */
  async markAsRunning(executionId: string): Promise<JobExecution | null> {
    return this.executionModel.findByIdAndUpdate(
      executionId,
      {
        status: EXECUTION_STATUS.RUNNING,
        startedAt: new Date(),
      },
      { new: true },
    ).exec();
  }

  /**
   * Update execution from result message
   */
  async updateFromResult(params: UpdateFromResultParams): Promise<JobExecution | null> {
    const { executionId, status, result, error, startedAt, completedAt } = params;

    const execution = await this.executionModel.findById(executionId);
    if (!execution) {
      this.logger.warn('Execution not found for result update', { executionId });
      return null;
    }

    const now = new Date();
    const updateData: any = {
      status: status === 'completed' ? EXECUTION_STATUS.COMPLETED : EXECUTION_STATUS.FAILED,
      completedAt: completedAt || now,
    };

    if (startedAt) {
      updateData.startedAt = startedAt;
    }

    if (result) {
      updateData.result = result;
    }

    if (error) {
      updateData.error = error;
    }

    // Calculate duration
    const start = updateData.startedAt || execution.startedAt || execution.queuedAt;
    if (start) {
      updateData.duration = updateData.completedAt.getTime() - new Date(start).getTime();
    }

    const updated = await this.executionModel.findByIdAndUpdate(
      executionId,
      updateData,
      { new: true },
    ).exec();

    this.logger.info('Execution result updated', {
      executionId,
      status: updateData.status,
      duration: updateData.duration,
    });

    return updated;
  }

  /**
   * Mark execution as timed out
   */
  async markAsTimeout(executionId: string): Promise<JobExecution | null> {
    const now = new Date();

    const execution = await this.executionModel.findById(executionId);
    if (!execution) {
      return null;
    }

    const updateData: any = {
      status: EXECUTION_STATUS.TIMEOUT,
      completedAt: now,
      error: {
        message: 'Job execution timed out',
        code: 'JOB_TIMEOUT',
      },
    };

    // Calculate duration
    const start = execution.startedAt || execution.queuedAt;
    if (start) {
      updateData.duration = now.getTime() - new Date(start).getTime();
    }

    const updated = await this.executionModel.findByIdAndUpdate(
      executionId,
      updateData,
      { new: true },
    ).exec();

    this.logger.warn('Execution timed out', {
      executionId,
      jobId: execution.jobId,
      jobName: execution.jobName,
    });

    return updated;
  }

  /**
   * Find executions that have exceeded their timeout
   */
  async findTimedOutExecutions(): Promise<JobExecution[]> {
    const now = new Date();

    return this.executionModel.find({
      status: { $in: [EXECUTION_STATUS.QUEUED, EXECUTION_STATUS.RUNNING] },
      queuedAt: { $exists: true },
      timeout: { $exists: true, $gt: 0 },
      $expr: {
        $gt: [
          { $subtract: [now, '$queuedAt'] },
          '$timeout',
        ],
      },
    }).exec();
  }

  /**
   * Find executions by job ID
   */
  async findByJobId(
    jobId: string,
    page: number = 1,
    limit: number = 10,
    context?: RequestContext,
  ): Promise<{ data: JobExecution[]; pagination: { page: number; limit: number; total: number } }> {
    const skip = (page - 1) * limit;

    const filter: any = {
      jobId: new Types.ObjectId(jobId),
      isDeleted: { $ne: true },
    };

    // Apply org filter if context provided
    if (context?.orgId) {
      filter['owner.orgId'] = context.orgId;
    }

    const [data, total] = await Promise.all([
      this.executionModel
        .find(filter)
        .sort({ triggeredAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.executionModel.countDocuments(filter),
    ]);

    return {
      data,
      pagination: { page, limit, total },
    };
  }

  /**
   * Get execution statistics
   */
  async getStats(
    jobId?: string,
    startDate?: Date,
    endDate?: Date,
    context?: RequestContext,
  ): Promise<ExecutionStatsResponseDto> {
    const filter: any = {
      isDeleted: { $ne: true },
    };

    if (jobId) {
      filter.jobId = new Types.ObjectId(jobId);
    }

    if (startDate || endDate) {
      filter.triggeredAt = {};
      if (startDate) {
        filter.triggeredAt.$gte = startDate;
      }
      if (endDate) {
        filter.triggeredAt.$lte = endDate;
      }
    }

    if (context?.orgId) {
      filter['owner.orgId'] = context.orgId;
    }

    const [stats, avgDurationResult] = await Promise.all([
      this.executionModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      this.executionModel.aggregate([
        {
          $match: {
            ...filter,
            status: EXECUTION_STATUS.COMPLETED,
            duration: { $exists: true, $gt: 0 },
          },
        },
        {
          $group: {
            _id: null,
            avgDuration: { $avg: '$duration' },
          },
        },
      ]),
    ]);

    const statusCounts: Record<string, number> = {};
    let total = 0;

    for (const stat of stats) {
      statusCounts[stat._id] = stat.count;
      total += stat.count;
    }

    const completed = statusCounts[EXECUTION_STATUS.COMPLETED] || 0;
    const failed = statusCounts[EXECUTION_STATUS.FAILED] || 0;
    const timeout = statusCounts[EXECUTION_STATUS.TIMEOUT] || 0;
    const running = statusCounts[EXECUTION_STATUS.RUNNING] || 0;
    const pending = statusCounts[EXECUTION_STATUS.PENDING] || 0;
    const queued = statusCounts[EXECUTION_STATUS.QUEUED] || 0;

    const successRate = total > 0 ? (completed / total) * 100 : 0;
    const avgDuration = avgDurationResult[0]?.avgDuration || 0;

    return {
      total,
      completed,
      failed,
      timeout,
      running,
      pending,
      queued,
      successRate: Math.round(successRate * 100) / 100,
      avgDuration: Math.round(avgDuration),
    };
  }

  /**
   * Schedule a retry for failed/timeout execution
   */
  async scheduleRetry(
    execution: JobExecution,
    job: ScheduledJob,
  ): Promise<{ shouldRetry: boolean; nextRetryAt?: Date; retryCount?: number }> {
    const maxRetries = job.retryConfig?.maxRetries ?? SCHEDULER_CONFIG.DEFAULT_MAX_RETRIES;

    if (execution.retryCount >= maxRetries) {
      this.logger.info('Max retries reached', {
        executionId: (execution as any)._id,
        retryCount: execution.retryCount,
        maxRetries,
      });
      return { shouldRetry: false };
    }

    const backoffMs = job.retryConfig?.backoffMs ?? SCHEDULER_CONFIG.DEFAULT_BACKOFF_MS;
    const backoffType = job.retryConfig?.backoffType ?? SCHEDULER_CONFIG.DEFAULT_BACKOFF_TYPE;

    let delay: number;
    if (backoffType === 'exponential') {
      delay = backoffMs * Math.pow(2, execution.retryCount);
    } else {
      delay = backoffMs;
    }

    // Cap the delay
    delay = Math.min(delay, SCHEDULER_CONFIG.MAX_BACKOFF_MS);

    const nextRetryAt = new Date(Date.now() + delay);
    const newRetryCount = execution.retryCount + 1;

    // Update current execution with next retry info
    await this.executionModel.findByIdAndUpdate((execution as any)._id, {
      nextRetryAt,
    });

    this.logger.info('Retry scheduled', {
      executionId: (execution as any)._id,
      retryCount: newRetryCount,
      nextRetryAt,
      delay,
    });

    return {
      shouldRetry: true,
      nextRetryAt,
      retryCount: newRetryCount,
    };
  }
}
