import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import * as crypto from 'crypto';
import { App } from './app.schema';

export interface WebhookUserCreatedPayload {
  userId: string;
  username: string;
  orgId: string;
  role: string;
  provider: string;
  fullname: string;
}

@Injectable()
export class AppWebhookService {
  private readonly logger = new Logger(AppWebhookService.name);

  constructor(private readonly httpService: HttpService) {}

  fireUserCreated(app: App, data: WebhookUserCreatedPayload): void {
    if (!app.webhookUrl) return;

    const payload = JSON.stringify({
      event: 'user.created',
      timestamp: new Date().toISOString(),
      data,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-IAM-Event': 'user.created',
    };

    if (app.webhookSecret) {
      const sig = crypto.createHmac('sha256', app.webhookSecret).update(payload).digest('hex');
      headers['X-IAM-Signature'] = `sha256=${sig}`;
    }

    this.httpService
      .post(app.webhookUrl, payload, { headers, timeout: 5000 })
      .subscribe({
        next: () => this.logger.debug(`Webhook delivered → ${app.webhookUrl}`),
        error: (err) => this.logger.warn(`Webhook failed → ${app.webhookUrl}: ${err.message}`),
      });
  }
}
