import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { OnModuleInit } from '@nestjs/common';
import { Queue, Job } from 'bullmq';
import { createLogger } from '@hydrabyte/shared';
import { QUEUE_NAMES } from '../config/queue.config';
import { DATASOURCE_SCHEDULES } from '../config/datasources.config';

@Processor(QUEUE_NAMES.SCHEDULER)
export class SchedulerProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = createLogger('SchedulerProcessor');

  constructor(
    @InjectQueue(QUEUE_NAMES.DATA_INGESTION)
    private readonly ingestionQueue: Queue,
  ) {
    super();
  }

  async onModuleInit() {
    const mode = process.env['MODE'];
    if (mode !== 'shd') return;

    this.logger.info('Initializing scheduler...');

    // Clear old repeatable jobs to avoid duplicates on restart
    const repeatableJobs = await this.ingestionQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await this.ingestionQueue.removeRepeatableByKey(job.key);
    }
    this.logger.info(`Cleared ${repeatableJobs.length} old repeatable jobs`);

    // Register new repeatable jobs
    let registered = 0;
    for (const schedule of DATASOURCE_SCHEDULES) {
      if (!schedule.enabled) continue;

      await this.ingestionQueue.add(
        schedule.type,
        {
          type: schedule.type,
          params: schedule.params,
          scheduledAt: new Date().toISOString(),
        },
        {
          repeat: { every: schedule.intervalMs },
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      );

      this.logger.info(`Scheduled: ${schedule.name} every ${schedule.intervalMs}ms`);
      registered++;
    }

    this.logger.info(`Scheduler initialized: ${registered} datasources registered`);
  }

  async process(job: Job): Promise<void> {
    // Scheduler processor doesn't process jobs itself
    // It only registers repeatable jobs on init
    this.logger.debug(`Scheduler heartbeat: ${job.name}`);
  }
}
