import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { OnModuleInit } from '@nestjs/common';
import { Queue, Job } from 'bullmq';
import { createLogger, RequestContext, PredefinedRole } from '@hydrabyte/shared';
import { QUEUE_NAMES } from '../config/queue.config';
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

    // Clear old repeatable jobs to avoid duplicates on restart
    const repeatableJobs = await this.signalGenerationQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await this.signalGenerationQueue.removeRepeatableByKey(job.key);
    }
    this.logger.info(`Cleared ${repeatableJobs.length} old repeatable jobs`);

    // Fetch all active accounts
    const { data: accounts } = await this.accountService.findAll(
      { filter: { status: 'active' }, page: 1, limit: 1000 },
      SYSTEM_CONTEXT,
    );

    // Register repeatable jobs per account
    let registered = 0;

    for (const account of accounts) {
      const accountId = (account as any)._id.toString();

      // 1h signal generation
      await this.signalGenerationQueue.add(
        'generate_signal',
        { type: 'generate_signal', params: { accountId, asset: 'PAXGUSDT', timeframe: '1h' } },
        {
          repeat: { every: 3_600_000 },
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      );

      // 4h signal generation
      await this.signalGenerationQueue.add(
        'generate_signal',
        { type: 'generate_signal', params: { accountId, asset: 'PAXGUSDT', timeframe: '4h' } },
        {
          repeat: { every: 14_400_000 },
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      );

      registered += 2;
    }

    // Register global expiry job
    await this.signalGenerationQueue.add(
      'expire_signals',
      { type: 'expire_signals', params: {} },
      {
        repeat: { every: 60_000 },
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    );
    registered++;

    this.logger.info(`Signal scheduler initialized: ${registered} jobs registered for ${accounts.length} accounts`);
  }

  async process(job: Job): Promise<void> {
    // Signal scheduler processor doesn't process jobs itself
    // It only registers repeatable jobs on init
    this.logger.debug(`Signal scheduler heartbeat: ${job.name}`);
  }
}
