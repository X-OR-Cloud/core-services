import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AmiClientService } from './ami-client.service';
import { AmiCommand } from '../queues/producers/ami-commands.producer';

/**
 * Executes AMI actions for each command type.
 * Called by AmiCommandConsumer after dequeuing a job.
 */
@Injectable()
export class AmiCommandService {
  private readonly logger = new Logger(AmiCommandService.name);
  private readonly apiUrl: string;
  private readonly bridgeToken: string;

  constructor(
    private readonly amiClient: AmiClientService,
    private readonly http: HttpService,
  ) {
    this.apiUrl = process.env['VSM_API_URL'] || 'http://localhost:3009';
    this.bridgeToken = process.env['AMI_BRIDGE_TOKEN'] || '';
  }

  async execute(command: AmiCommand): Promise<void> {
    switch (command.type) {
      case 'originate':
        await this.originate(command);
        break;
      case 'syncAccount':
        await this.syncAccount(command);
        break;
      case 'syncTrunk':
        await this.syncTrunk(command);
        break;
      case 'syncDialplan':
        await this.syncDialplan(command);
        break;
      case 'hangupChannel':
        await this.hangupChannel(command);
        break;
      default:
        this.logger.warn(`Unknown command type: ${(command as any).type}`);
    }
  }

  private async originate(cmd: AmiCommand): Promise<void> {
    const callId = cmd['callId'] as string;
    const fromAccountId = cmd['fromAccountId'] as string;
    const toNumber = cmd['toNumber'] as string;
    const fromNumber = cmd['fromNumber'] as string | undefined;
    const dialplanContext = (cmd['dialplanContext'] as string) || 'from-internal';

    await this.amiClient.sendAction({
      Action: 'Originate',
      Channel: `PJSIP/${fromAccountId}`,
      Context: dialplanContext,
      Exten: toNumber,
      Priority: '1',
      Timeout: '30000',
      CallerID: fromNumber || toNumber,
      Variable: `VSM_CALL_ID=${callId}`,
      Async: 'true',
    });

    this.logger.log(`Originate sent: callId=${callId}, channel=PJSIP/${fromAccountId}, to=${toNumber}`);
  }

  private async syncAccount(cmd: AmiCommand): Promise<void> {
    const accountId = cmd['accountId'] as string;
    const entityId = accountId;

    try {
      // Reload res_pjsip to pick up config changes written to pjsip.conf
      // In practice, AMI bridge generates pjsip.conf sections from VSM API data
      // and triggers reload via UpdateConfig + ModuleReload
      await this.amiClient.sendAction({
        Action: 'ModuleReload',
        Module: 'res_pjsip.so',
      });

      await this.notifySyncResult(entityId, 'account', 'synced');
      this.logger.log(`syncAccount done: ${accountId}`);
    } catch (err: any) {
      this.logger.error(`syncAccount failed: ${accountId} — ${err?.message}`);
      await this.notifySyncResult(entityId, 'account', 'error', err?.message);
      throw err;
    }
  }

  private async syncTrunk(cmd: AmiCommand): Promise<void> {
    const trunkId = cmd['trunkId'] as string;

    try {
      await this.amiClient.sendAction({
        Action: 'ModuleReload',
        Module: 'res_pjsip.so',
      });

      await this.notifySyncResult(trunkId, 'trunk', 'synced');
      this.logger.log(`syncTrunk done: ${trunkId}`);
    } catch (err: any) {
      this.logger.error(`syncTrunk failed: ${trunkId} — ${err?.message}`);
      await this.notifySyncResult(trunkId, 'trunk', 'error', err?.message);
      throw err;
    }
  }

  private async syncDialplan(cmd: AmiCommand): Promise<void> {
    const dialplanId = cmd['dialplanId'] as string;

    try {
      // Reload dialplan
      await this.amiClient.sendAction({
        Action: 'Command',
        Command: 'dialplan reload',
      });

      await this.notifySyncResult(dialplanId, 'dialplan', 'synced');
      this.logger.log(`syncDialplan done: ${dialplanId}`);
    } catch (err: any) {
      this.logger.error(`syncDialplan failed: ${dialplanId} — ${err?.message}`);
      await this.notifySyncResult(dialplanId, 'dialplan', 'error', err?.message);
      throw err;
    }
  }

  private async hangupChannel(cmd: AmiCommand): Promise<void> {
    const channel = cmd['channel'] as string;
    await this.amiClient.sendAction({
      Action: 'Hangup',
      Channel: channel,
    });
    this.logger.log(`Hangup sent: channel=${channel}`);
  }

  private async notifySyncResult(
    entityId: string,
    entityType: string,
    status: 'synced' | 'error',
    error?: string,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(
          `${this.apiUrl}/webhooks/ami/sync-result`,
          { entityId, entityType, status, error },
          { headers: { Authorization: `Bearer ${this.bridgeToken}` } },
        ),
      );
    } catch (err: any) {
      this.logger.error(`Failed to notify sync result: ${err?.message}`);
    }
  }
}
