import axios, { AxiosRequestConfig } from 'axios';
import { createLogger } from '@hydrabyte/shared';

export abstract class BaseCollector {
  protected abstract readonly name: string;
  protected readonly timeout = 10_000;
  protected readonly logger;

  constructor() {
    this.logger = createLogger(this.constructor.name);
  }

  abstract collect(params: Record<string, any>): Promise<void>;

  protected async fetchWithRetry(
    url: string,
    options?: AxiosRequestConfig,
    maxRetries = 3,
  ): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get(url, {
          ...options,
          timeout: this.timeout,
        });
        return response.data;
      } catch (error: any) {
        // Auth errors: don't retry
        if (error.response?.status === 401 || error.response?.status === 403) {
          this.logger.error(`[${this.name}] Auth error: ${error.response.status}`);
          throw error;
        }
        // Rate limit: wait and retry
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
          this.logger.warn(`[${this.name}] Rate limited, waiting ${waitMs}ms`);
          await this.sleep(waitMs);
          continue;
        }
        // Last attempt: throw
        if (attempt === maxRetries) {
          this.logger.error(`[${this.name}] Failed after ${maxRetries} attempts: ${error.message}`);
          throw error;
        }
        // Exponential backoff
        const waitMs = Math.pow(2, attempt) * 1000;
        this.logger.warn(`[${this.name}] Attempt ${attempt} failed, retrying in ${waitMs}ms`);
        await this.sleep(waitMs);
      }
    }
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
