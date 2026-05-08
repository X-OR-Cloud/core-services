import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import * as crypto from 'crypto';
import { App, AppStatus } from './app.schema';

export interface WebhookUserCreatedPayload {
  userId: string;
  username: string;
  orgId: string;
  role: string;
  provider: string;
  fullname: string;
  status?: string;
}

export interface WebhookUserUpdatedPayload {
  userId: string;
  username: string;
  orgId: string;
  updatedFields?: string[];
  role?: string;
  status?: string;
  fullname?: string;
}

export interface WebhookUserDeletedPayload {
  userId: string;
  username: string;
  orgId: string;
  deletedBy: string;
}

@Injectable()
export class AppWebhookService {
  private readonly logger = new Logger(AppWebhookService.name);

  constructor(
    @InjectModel(App.name) private readonly appModel: Model<App>,
    private readonly httpService: HttpService,
  ) {}

  // ---------------------------------------------------------------------------
  // Direct fire — when caller already has the App object (e.g. Google SSO flow)
  // ---------------------------------------------------------------------------

  fireUserCreated(app: App, data: WebhookUserCreatedPayload): void {
    this.fire(app, 'user.created', data);
  }

  fireUserUpdated(app: App, data: WebhookUserUpdatedPayload): void {
    this.fire(app, 'user.updated', data);
  }

  fireUserDeleted(app: App, data: WebhookUserDeletedPayload): void {
    this.fire(app, 'user.deleted', data);
  }

  // ---------------------------------------------------------------------------
  // Org-scoped fire — finds all active apps in the org that have webhookUrl
  // ---------------------------------------------------------------------------

  async fireUserCreatedForOrg(orgId: string, data: WebhookUserCreatedPayload): Promise<void> {
    await this.fireForOrg(orgId, 'user.created', data);
  }

  async fireUserUpdatedForOrg(orgId: string, data: WebhookUserUpdatedPayload): Promise<void> {
    await this.fireForOrg(orgId, 'user.updated', data);
  }

  async fireUserDeletedForOrg(orgId: string, data: WebhookUserDeletedPayload): Promise<void> {
    await this.fireForOrg(orgId, 'user.deleted', data);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async fireForOrg(orgId: string, event: string, data: object): Promise<void> {
    try {
      const apps = await this.appModel
        .find({ 'owner.orgId': orgId, webhookUrl: { $ne: null }, status: AppStatus.Active, isDeleted: false })
        .lean()
        .exec();
      for (const app of apps) {
        this.fire(app as App, event, data);
      }
    } catch (err) {
      this.logger.error(`Failed to query apps for webhook (orgId=${orgId}): ${(err as Error).message}`);
    }
  }

  private fire(app: App, event: string, data: object): void {
    if (!app.webhookUrl) return;

    const payload = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-IAM-Event': event,
    };

    if (app.webhookSecret) {
      const sig = crypto.createHmac('sha256', app.webhookSecret).update(payload).digest('hex');
      headers['X-IAM-Signature'] = `sha256=${sig}`;
    }

    this.httpService
      .post(app.webhookUrl, payload, { headers, timeout: 5000 })
      .subscribe({
        next: () => this.logger.debug(`Webhook [${event}] delivered → ${app.webhookUrl}`),
        error: (err) => this.logger.warn(`Webhook [${event}] failed → ${app.webhookUrl}: ${err.message}`),
      });
  }
}
