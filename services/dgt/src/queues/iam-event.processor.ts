import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job } from 'bullmq';
import { RequestContext } from '@hydrabyte/shared';
import { QUEUE_NAMES } from '../config/queue.config';
import { AccountService } from '../modules/account/account.service';
import { Account, AccountType, Exchange } from '../modules/account/account.schema';
import { IamQueueEvent, IamUserCreatedEvent } from './iam-event.types';

@Processor(QUEUE_NAMES.IAM_EVENTS)
export class IamEventProcessor extends WorkerHost {
  private readonly logger = new Logger(IamEventProcessor.name);

  constructor(
    private readonly accountService: AccountService,
    @InjectModel(Account.name) private readonly accountModel: Model<Account>,
  ) {
    super();
  }

  async process(job: Job<IamQueueEvent>): Promise<void> {
    const { event, data } = job.data;
    this.logger.log(`Processing IAM event: ${event} (Job: ${job.id})`);

    switch (event) {
      case 'user.created':
        await this.handleUserCreated(job.data as IamUserCreatedEvent);
        break;
      default:
        this.logger.debug(`Unhandled IAM event: ${event} — skipped`);
    }
  }

  private async handleUserCreated(event: IamUserCreatedEvent): Promise<void> {
    const { userId, username, orgId, role } = event.data;

    // Idempotency: skip nếu user đã có account
    const existing = await this.accountModel.findOne({
      'owner.userId': userId,
      isDeleted: false,
    }).exec();

    if (existing) {
      this.logger.debug(`User ${userId} already has an account — skipped`);
      return;
    }

    const context: RequestContext = {
      userId,
      orgId: orgId || '',
      groupId: '',
      agentId: '',
      appId: '',
      roles: [role as any],
    };

    await this.accountService.create(
      {
        accountType: AccountType.PAPER,
        exchange: Exchange.BINANCE,
        label: 'Default Paper Account',
        initialBalance: 10000,
        currency: 'USDT',
        isDefault: true,
      },
      context,
    );

    this.logger.log(`Created default paper account for user ${username} (${userId})`);
  }
}
