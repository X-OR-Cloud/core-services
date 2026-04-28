import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { TrunksService } from '../trunks/trunks.service';
import { DialplansService } from '../dialplans/dialplans.service';
import { CallsService } from '../calls/calls.service';
import { NodesService } from '../nodes/nodes.service';
import { Account } from '../accounts/accounts.schema';
import { AmiEventDto, SyncResultDto } from './webhooks.dto';

// Asterisk CDR Disposition → VSM result
const DISPOSITION_MAP: Record<string, string> = {
  ANSWERED: 'answered',
  'NO ANSWER': 'not-answered',
  BUSY: 'busy',
  FAILED: 'failed',
  CONGESTION: 'failed',
};

// Asterisk Hangup Cause → VSM result override
const CAUSE_MAP: Record<string, string> = {
  '17': 'busy',
  '21': 'terminated',  // Call Rejected
  '603': 'terminated', // Decline
};

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectModel(Account.name) private readonly accountModel: Model<Account>,
    private readonly accountsService: AccountsService,
    private readonly trunksService: TrunksService,
    private readonly dialplansService: DialplansService,
    private readonly callsService: CallsService,
    private readonly nodesService: NodesService,
  ) {}

  async handleAmiEvent(dto: AmiEventDto): Promise<void> {
    const { event, nodeId, payload } = dto;

    switch (event) {
      case 'Cdr':
        await this.handleCdr(nodeId, payload);
        break;
      case 'PeerStatus':
        await this.handlePeerStatus(payload);
        break;
      case 'DeviceStateChange':
        await this.handleDeviceStateChange(payload);
        break;
      case 'DialBegin':
        await this.handleDialBegin(payload);
        break;
      case 'DialEnd':
        await this.handleDialEnd(payload);
        break;
      case 'Hangup':
        await this.handleHangup(payload);
        break;
      default:
        this.logger.debug(`Unhandled AMI event: ${event}`);
    }
  }

  private async handleCdr(nodeId: string, payload: Record<string, any>): Promise<void> {
    try {
      const disposition: string = payload['Disposition'] || '';
      const cause: string = String(payload['HangupCause'] || '');
      let result = DISPOSITION_MAP[disposition] || 'failed';
      if (CAUSE_MAP[cause]) result = CAUSE_MAP[cause];

      const duration = parseInt(payload['Duration'] || '0', 10);
      const billableSec = parseInt(payload['BillableSeconds'] || '0', 10);

      const startedAt = payload['StartTime'] ? new Date(payload['StartTime']) : new Date();
      const endedAt = payload['EndTime'] ? new Date(payload['EndTime']) : new Date();
      const answeredAt = billableSec > 0
        ? new Date(endedAt.getTime() - billableSec * 1000)
        : undefined;

      // Strip recording prefix to get S3 key
      const recordingPrefix = process.env['AMI_RECORDING_PREFIX'] || '/var/spool/asterisk/monitor/';
      let recordingFile: string | undefined = payload['RecordingFile'];
      if (recordingFile && recordingFile.startsWith(recordingPrefix)) {
        recordingFile = recordingFile.slice(recordingPrefix.length);
      }

      // Resolve VSM call ID from channel variable (VSM_CALL_ID) or create new
      const vsmCallId: string | undefined = payload['VSM_CALL_ID'];
      const uniqueId: string = payload['UniqueID'] || payload['Uniqueid'] || '';
      const src: string = payload['Source'] || payload['CallerID'] || '';
      const dst: string = payload['Destination'] || payload['DestinationChannel'] || '';

      if (vsmCallId) {
        // Outbound originated call — update existing record
        await this.callsService['model'].findByIdAndUpdate(vsmCallId, {
          asteriskUniqueId: uniqueId,
          result,
          duration,
          answeredDuration: billableSec,
          startedAt,
          answeredAt,
          endedAt,
          recordingFile,
        });
      } else {
        // Inbound call — create new record
        await this.callsService.createFromCdr({
          nodeId,
          asteriskUniqueId: uniqueId,
          fromNumber: src,
          toNumber: dst,
          direction: 'inbound',
          result,
          duration,
          answeredDuration: billableSec,
          startedAt,
          answeredAt,
          endedAt,
          recordingFile,
        });
      }
    } catch (err) {
      this.logger.error('handleCdr error', err);
    }
  }

  private async handlePeerStatus(payload: Record<string, any>): Promise<void> {
    try {
      // Peer = PJSIP/<accountId>-<hex>
      const peer: string = payload['Peer'] || '';
      const match = peer.match(/^PJSIP\/([a-f0-9]{24})/i);
      if (!match) return;

      const accountId = match[1];
      const peerStatus: string = payload['PeerStatus'] || '';
      const status = peerStatus === 'Registered'
        ? 'registered'
        : peerStatus === 'Unregistered' ? 'unregistered' : 'unknown';

      await this.accountsService.updateStatus(accountId, status as any);
    } catch (err) {
      this.logger.error('handlePeerStatus error', err);
    }
  }

  private async handleDeviceStateChange(payload: Record<string, any>): Promise<void> {
    try {
      // Device = PJSIP/<accountId>
      const device: string = payload['Device'] || '';
      const match = device.match(/^PJSIP\/([a-f0-9]{24})$/i);
      if (!match) return;

      const accountId = match[1];
      const deviceState: string = payload['State'] || '';
      let state: 'idle' | 'ringing' | 'in_call' | 'unknown' = 'unknown';
      if (deviceState === 'NOT_INUSE') state = 'idle';
      else if (deviceState === 'RINGING' || deviceState === 'RINGINUSE') state = 'ringing';
      else if (deviceState === 'INUSE' || deviceState === 'BUSY') state = 'in_call';

      await this.accountsService.updateState(accountId, state);
    } catch (err) {
      this.logger.error('handleDeviceStateChange error', err);
    }
  }

  private async handleDialBegin(payload: Record<string, any>): Promise<void> {
    try {
      const uniqueId: string = payload['UniqueID'] || payload['Uniqueid'] || '';
      if (!uniqueId) return;
      await this.callsService.updateByUniqueId(uniqueId, { result: 'pending' } as any);
    } catch (err) {
      this.logger.error('handleDialBegin error', err);
    }
  }

  private async handleDialEnd(payload: Record<string, any>): Promise<void> {
    try {
      const uniqueId: string = payload['UniqueID'] || payload['Uniqueid'] || '';
      const dialStatus: string = payload['DialStatus'] || '';
      if (!uniqueId) return;

      let result: string | undefined;
      if (dialStatus === 'ANSWER') result = 'answered';
      else if (dialStatus === 'BUSY') result = 'busy';
      else if (dialStatus === 'NOANSWER') result = 'not-answered';
      else if (dialStatus === 'CANCEL') result = 'canceled';
      else if (dialStatus === 'CONGESTION' || dialStatus === 'CHANUNAVAIL') result = 'failed';

      if (result) {
        await this.callsService.updateByUniqueId(uniqueId, { result } as any);
      }
    } catch (err) {
      this.logger.error('handleDialEnd error', err);
    }
  }

  private async handleHangup(payload: Record<string, any>): Promise<void> {
    try {
      const uniqueId: string = payload['UniqueID'] || payload['Uniqueid'] || '';
      const cause: string = String(payload['Cause'] || '');
      if (!uniqueId) return;

      // Only update if CDR hasn't finalized this call yet
      const call = await this.callsService.findByUniqueId(uniqueId);
      if (!call || call.result === 'answered' || call.result === 'not-answered') return;

      const result = CAUSE_MAP[cause] || 'failed';
      await this.callsService.updateByUniqueId(uniqueId, { result, endedAt: new Date() } as any);
    } catch (err) {
      this.logger.error('handleHangup error', err);
    }
  }

  async handleSyncResult(dto: SyncResultDto): Promise<void> {
    const update = {
      syncStatus: dto.status,
      ...(dto.status === 'synced' ? { syncedAt: new Date() } : {}),
    };

    try {
      if (dto.entityType === 'account') {
        await this.accountsService['model'].findByIdAndUpdate(dto.entityId, update);
      } else if (dto.entityType === 'trunk') {
        await this.trunksService['model'].findByIdAndUpdate(dto.entityId, update);
      } else if (dto.entityType === 'dialplan') {
        await this.dialplansService['model'].findByIdAndUpdate(dto.entityId, update);
      }
    } catch (err) {
      this.logger.error('handleSyncResult error', err);
    }
  }
}
