import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { ScheduledJob } from './scheduled-job.schema';
import { CreateScheduledJobDto, UpdateScheduledJobDto } from './scheduled-job.dto';
import { SCHEDULER_CONFIG } from '../../config/scheduler.config';
import * as cronParser from 'cron-parser';

@Injectable()
export class ScheduledJobService extends BaseService<ScheduledJob> {
  constructor(
    @InjectModel(ScheduledJob.name) private scheduledJobModel: Model<ScheduledJob>,
  ) {
    super(scheduledJobModel as any);
  }

  /**
   * Create a new scheduled job
   */
  async create(createDto: CreateScheduledJobDto, context: RequestContext): Promise<ScheduledJob> {
    // Validate cron expression
    this.validateCronExpression(createDto.cronExpression);

    // Calculate next run time
    const nextRunAt = this.calculateNextRunAt(
      createDto.cronExpression,
      createDto.timezone || SCHEDULER_CONFIG.DEFAULT_TIMEZONE,
    );

    // Merge with defaults
    const jobData = {
      ...createDto,
      nextRunAt,
      retryConfig: {
        maxRetries: createDto.retryConfig?.maxRetries ?? SCHEDULER_CONFIG.DEFAULT_MAX_RETRIES,
        backoffMs: createDto.retryConfig?.backoffMs ?? SCHEDULER_CONFIG.DEFAULT_BACKOFF_MS,
        backoffType: createDto.retryConfig?.backoffType ?? SCHEDULER_CONFIG.DEFAULT_BACKOFF_TYPE,
      },
    };

    const saved = await super.create(jobData as any, context);

    this.logger.info('Scheduled job created', {
      id: (saved as any)._id,
      name: saved.name,
      cronExpression: saved.cronExpression,
      nextRunAt: saved.nextRunAt,
    });

    return saved as ScheduledJob;
  }

  /**
   * Update a scheduled job
   */
  async updateJob(
    id: string,
    updateDto: UpdateScheduledJobDto,
    context: RequestContext,
  ): Promise<ScheduledJob | null> {
    // Validate cron expression if provided
    if (updateDto.cronExpression) {
      this.validateCronExpression(updateDto.cronExpression);
    }

    const existing = await this.findById(new Types.ObjectId(id) as any, context);
    if (!existing) {
      return null;
    }

    // Recalculate next run time if cron or timezone changed
    let nextRunAt = existing.nextRunAt;
    if (updateDto.cronExpression || updateDto.timezone) {
      nextRunAt = this.calculateNextRunAt(
        updateDto.cronExpression || existing.cronExpression,
        updateDto.timezone || existing.timezone,
      );
    }

    const updateData = {
      ...updateDto,
      nextRunAt,
    };

    const updated = await super.update(new Types.ObjectId(id) as any, updateData as any, context);

    if (updated) {
      this.logger.info('Scheduled job updated', {
        id,
        name: updated.name,
        cronExpression: updated.cronExpression,
        nextRunAt: updated.nextRunAt,
      });
    }

    return updated;
  }

  /**
   * Enable a scheduled job
   */
  async enable(id: string, context: RequestContext): Promise<ScheduledJob | null> {
    const job = await this.findById(new Types.ObjectId(id) as any, context);
    if (!job) {
      return null;
    }

    // Recalculate next run time
    const nextRunAt = this.calculateNextRunAt(job.cronExpression, job.timezone);

    const updated = await super.update(
      new Types.ObjectId(id) as any,
      { enabled: true, nextRunAt } as any,
      context,
    );

    if (updated) {
      this.logger.info('Scheduled job enabled', { id, name: updated.name });
    }

    return updated;
  }

  /**
   * Disable a scheduled job
   */
  async disable(id: string, context: RequestContext): Promise<ScheduledJob | null> {
    const updated = await super.update(
      new Types.ObjectId(id) as any,
      { enabled: false } as any,
      context,
    );

    if (updated) {
      this.logger.info('Scheduled job disabled', { id, name: updated.name });
    }

    return updated;
  }

  /**
   * Soft delete a scheduled job
   */
  async remove(id: string, context: RequestContext): Promise<void> {
    const result = await super.softDelete(new Types.ObjectId(id) as any, context);

    if (result) {
      this.logger.info('Scheduled job deleted', { id });
    }
  }

  /**
   * Find all enabled jobs that are due to run
   */
  async findDueJobs(now: Date): Promise<ScheduledJob[]> {
    return this.scheduledJobModel.find({
      enabled: true,
      isDeleted: { $ne: true },
      nextRunAt: { $lte: now },
    }).exec();
  }

  /**
   * Update job after execution
   */
  async updateAfterExecution(
    jobId: string,
    status: string,
    context?: RequestContext,
  ): Promise<ScheduledJob | null> {
    const job = await this.scheduledJobModel.findById(jobId);
    if (!job) {
      return null;
    }

    const nextRunAt = this.calculateNextRunAt(job.cronExpression, job.timezone);

    return this.scheduledJobModel.findByIdAndUpdate(
      jobId,
      {
        lastRunAt: new Date(),
        lastExecutionStatus: status,
        nextRunAt,
      },
      { new: true },
    ).exec();
  }

  /**
   * Get next N run times for a job
   */
  getNextRuns(cronExpression: string, timezone: string, count: number = 5): Date[] {
    this.validateCronExpression(cronExpression);

    const runs: Date[] = [];
    const options = {
      currentDate: new Date(),
      tz: timezone,
    };

    const interval = cronParser.parseExpression(cronExpression, options);

    for (let i = 0; i < count; i++) {
      runs.push(interval.next().toDate());
    }

    return runs;
  }

  /**
   * Validate cron expression
   */
  private validateCronExpression(cronExpression: string): void {
    try {
      cronParser.parseExpression(cronExpression);
    } catch (error) {
      throw new BadRequestException(`Invalid cron expression: ${cronExpression}`);
    }
  }

  /**
   * Calculate next run time from cron expression
   */
  private calculateNextRunAt(cronExpression: string, timezone: string): Date {
    const options = {
      currentDate: new Date(),
      tz: timezone,
    };

    const interval = cronParser.parseExpression(cronExpression, options);
    return interval.next().toDate();
  }
}
