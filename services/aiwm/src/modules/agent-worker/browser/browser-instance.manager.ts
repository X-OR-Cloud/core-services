import { Logger } from '@nestjs/common';
import { BrowserContext } from './browser.types';

/**
 * BrowserInstanceManager — manages lifecycle of a PinchTab browser instance.
 * Calls POST /instances/start on init and POST /instances/{id}/stop on destroy.
 */
export class BrowserInstanceManager {
  private readonly logger = new Logger(BrowserInstanceManager.name);

  constructor(private readonly ctx: BrowserContext) {}

  async start(): Promise<void> {
    try {
      const { apiUrl, mode, width, height } = this.ctx.config;
      const res = await fetch(`${apiUrl}/instances/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, width, height }),
      });

      if (!res.ok) {
        throw new Error(`PinchTab start failed: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as { id: string };
      this.ctx.instanceId = data.id;
      this.logger.log(`Browser instance started: ${data.id}`);
    } catch (err) {
      this.logger.error(`Failed to start browser instance: ${(err as Error).message}`);
      // Non-fatal — browser tools will return error when instanceId is null
    }
  }

  async stop(): Promise<void> {
    if (!this.ctx.instanceId) return;

    try {
      const res = await fetch(`${this.ctx.config.apiUrl}/instances/${this.ctx.instanceId}/stop`, {
        method: 'POST',
      });
      if (!res.ok) {
        this.logger.warn(`PinchTab stop responded ${res.status}`);
      } else {
        this.logger.log(`Browser instance stopped: ${this.ctx.instanceId}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to stop browser instance: ${(err as Error).message}`);
    } finally {
      this.ctx.instanceId = null;
    }
  }
}
