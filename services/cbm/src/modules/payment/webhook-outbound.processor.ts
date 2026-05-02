import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { createHmac } from 'crypto';

export const WEBHOOK_OUTBOUND_QUEUE = 'cbm-webhook-outbound';

export interface WebhookOutboundJob {
  url: string;
  secret: string;
  payload: object;
}

/**
 * Processes outbound webhook calls (CBM → PAG or any caller-supplied URL).
 *
 * Retry policy (configured at enqueue time):
 *   attempts: 4 (1 initial + 3 retries)
 *   backoff: exponential, base 30s → ~30s, ~60s, ~120s
 *
 * Each attempt:
 *   1. Serialize payload to JSON
 *   2. Sign with HMAC-SHA256 using job.data.secret
 *   3. POST to job.data.url with X-Signature header
 *   4. Throw on non-2xx → BullMQ retries automatically
 */
@Processor(WEBHOOK_OUTBOUND_QUEUE)
export class WebhookOutboundProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookOutboundProcessor.name);

  async process(job: Job<WebhookOutboundJob>): Promise<void> {
    const { url, secret, payload } = job.data;

    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', secret || '').update(body).digest('hex');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': `sha256=${signature}`,
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.warn(`Webhook to ${url} returned ${res.status} (attempt ${job.attemptsMade + 1}): ${text}`);
      throw new Error(`HTTP ${res.status}`);
    }

    this.logger.log(`Webhook to ${url} delivered (attempt ${job.attemptsMade + 1})`);
  }
}
