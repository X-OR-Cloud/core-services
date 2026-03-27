import { Injectable } from '@nestjs/common';
import { createLogger } from '@hydrabyte/shared';
import { AccountService } from '../modules/account/account.service';

@Injectable()
export class AccountBalanceSyncCollector {
  private readonly logger = createLogger('AccountBalanceSyncCollector');

  constructor(private readonly accountService: AccountService) {}

  async collect(): Promise<void> {
    this.logger.info('Starting periodic balance sync for all active accounts...');
    const result = await this.accountService.syncAllActiveBalances();
    this.logger.info(
      `Balance sync completed: ${result.synced}/${result.total} synced, ${result.failed} failed`,
    );
  }
}
