import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AmiClientService, AmiEvent } from './ami-client.service';

const SUBSCRIBED_EVENTS = new Set(['Cdr', 'DialBegin', 'DialEnd', 'Hangup', 'PeerStatus', 'DeviceStateChange']);

/**
 * Subscribes to AMI events and forwards them to VSM API webhook.
 */
@Injectable()
export class AmiEventHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(AmiEventHandler.name);
  private readonly nodeId: string;
  private readonly apiUrl: string;
  private readonly bridgeToken: string;

  constructor(
    private readonly amiClient: AmiClientService,
    private readonly http: HttpService,
  ) {
    this.nodeId = process.env['NODE_ID'] || '';
    this.apiUrl = process.env['VSM_API_URL'] || 'http://localhost:3009';
    this.bridgeToken = process.env['AMI_BRIDGE_TOKEN'] || '';
  }

  onApplicationBootstrap() {
    this.amiClient.onEvent((event) => this.handleEvent(event));
  }

  private async handleEvent(event: AmiEvent): Promise<void> {
    if (!SUBSCRIBED_EVENTS.has(event.Event)) return;

    try {
      await firstValueFrom(
        this.http.post(
          `${this.apiUrl}/webhooks/ami`,
          { event: event.Event, nodeId: this.nodeId, payload: event },
          { headers: { Authorization: `Bearer ${this.bridgeToken}` } },
        ),
      );
    } catch (err: any) {
      this.logger.error(`Failed to forward AMI event ${event.Event}: ${err?.message}`);
    }
  }
}
