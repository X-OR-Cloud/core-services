import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { OnModuleInit } from '@nestjs/common';
import { Queue, Job } from 'bullmq';
import { createLogger, RequestContext, PredefinedRole } from '@hydrabyte/shared';
import { QUEUE_NAMES, SIGNAL_JOB_TYPES } from '../config/queue.config';
import { AccountService } from '../modules/account/account.service';

const SYSTEM_CONTEXT: RequestContext = {
  userId: 'system',
  orgId: 'system',
  groupId: 'system',
  agentId: 'system',
  appId: 'system',
  roles: [PredefinedRole.UniverseOwner],
};

@Processor(QUEUE_NAMES.SIGNAL_SCHEDULER)
export class SignalSchedulerProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = createLogger('SignalSchedulerProcessor');

  constructor(
    @InjectQueue(QUEUE_NAMES.SIGNAL_GENERATION)
    private readonly signalGenerationQueue: Queue,
    private readonly accountService: AccountService,
  ) {
    super();
  }

  async onModuleInit() {
    const mode = process.env['MODE'];
    if (mode !== 'sig') return;

    this.logger.info('Initializing signal scheduler...');

    // Clear old repeatable jobs to avoid duplicates on restart.
    // Wrapped in try-catch: if Redis is briefly read-only (e.g. replica failover),
    // we skip the clear step rather than crashing the entire worker startup.
    try {
      const repeatableJobs = await this.signalGenerationQueue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        await this.signalGenerationQueue.removeRepeatableByKey(job.key);
      }
      this.logger.info(`Cleared ${repeatableJobs.length} old repeatable jobs`);
    } catch (err: any) {
      this.logger.warn(`[init] Skipped clearing old repeatable jobs: ${err.message}`);
    }

    // Fetch all active accounts
    const { data: accounts } = await this.accountService.findAll(
      { filter: { status: 'active' }, page: 1, limit: 1000 },
      SYSTEM_CONTEXT,
    );

    // Register repeatable jobs per account
    let registered = 0;
    let failed = 0;

    for (const account of accounts) {
      const accountId = (account as any)._id.toString();
      try {
        await this.registerJobsForAccount(accountId);
        registered += 3; // 15m + 1h + 4h
      } catch (err: any) {
        failed++;
        this.logger.warn(`[init] Failed to register jobs for account ${accountId}: ${err.message}`);
      }
    }

    // Register global expiry job
    try {
      await this.signalGenerationQueue.add(
        SIGNAL_JOB_TYPES.EXPIRE_SIGNALS,
        { type: SIGNAL_JOB_TYPES.EXPIRE_SIGNALS, params: {} },
        {
          repeat: { every: 60_000 },
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );
      registered++;
    } catch (err: any) {
      this.logger.warn(`[init] Failed to register expire_signals job: ${err.message}`);
    }

    this.logger.info(`Signal scheduler initialized: ${registered} jobs registered for ${accounts.length} accounts${failed > 0 ? ` (${failed} failed)` : ''}`);
  }

  async process(job: Job): Promise<void> {
    if (job.name === SIGNAL_JOB_TYPES.SYNC_ACCOUNT_SIGNALS) {
      const { accountId, action } = job.data.params as { accountId: string; action: 'upsert' | 'remove' };
      if (action === 'upsert') {
        await this.registerJobsForAccount(accountId);
        this.logger.info(`[sync_account_signals] Registered jobs for account ${accountId}`);
      } else {
        await this.removeJobsForAccount(accountId);
        this.logger.info(`[sync_account_signals] Removed jobs for account ${accountId}`);
      }
      return;
    }
    this.logger.debug(`Signal scheduler heartbeat: ${job.name}`);
  }

  /**
   * Job name includes accountId + timeframe to ensure each account gets its OWN
   * BullMQ repeat entry. BullMQ deduplicates by (name + repeat-config hash), so
   * using the same name for all accounts would collapse them into a single entry,
   * causing only one account to ever receive generated signals.
   */
  private jobName(accountId: string, timeframe: string): string {
    return `${SIGNAL_JOB_TYPES.GENERATE_SIGNAL}:${accountId}:${timeframe}`;
  }

  private async registerJobsForAccount(accountId: string): Promise<void> {
    await this.signalGenerationQueue.add(
      this.jobName(accountId, '15m'),
      { type: SIGNAL_JOB_TYPES.GENERATE_SIGNAL, params: { accountId, asset: 'PAXGUSDT', timeframe: '15m' } },
      {
        repeat: { every: 900_000 }, // 15 phút
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );

    await this.signalGenerationQueue.add(
      this.jobName(accountId, '1h'),
      { type: SIGNAL_JOB_TYPES.GENERATE_SIGNAL, params: { accountId, asset: 'PAXGUSDT', timeframe: '1h' } },
      {
        repeat: { every: 3_600_000 },
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );

    await this.signalGenerationQueue.add(
      this.jobName(accountId, '4h'),
      { type: SIGNAL_JOB_TYPES.GENERATE_SIGNAL, params: { accountId, asset: 'PAXGUSDT', timeframe: '4h' } },
      {
        repeat: { every: 14_400_000 },
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }

  private async removeJobsForAccount(accountId: string): Promise<void> {
    const repeatableJobs = await this.signalGenerationQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      // Match jobs by accountId prefix in the unique job name
      if (job.name.startsWith(`${SIGNAL_JOB_TYPES.GENERATE_SIGNAL}:${accountId}`)) {
        await this.signalGenerationQueue.removeRepeatableByKey(job.key);
      }
    }
  }
}
