import { Injectable } from '@nestjs/common';
import { BaseCollector } from './base.collector';
import { SentimentSignalService } from '../modules/sentiment-signal/sentiment-signal.service';

@Injectable()
export class BytetreeCollector extends BaseCollector {
  protected readonly name = 'ByteTree';

  constructor(
    private readonly sentimentSignalService: SentimentSignalService,
  ) {
    super();
  }

  async collect(_params: Record<string, any>): Promise<void> {
    const data = await this.fetchWithRetry(
      'https://bold.report/api/v1/combined/all-latest.json',
    );

    if (!data) {
      this.logger.warn(`[${this.name}] No data received`);
      return;
    }

    // Extract gold ETF metrics
    const etfFlow7dOz = this.extractValue(data, 'gold-ff-culm7day');
    const etfAumUsd = this.extractValue(data, 'gold-ft-aum');

    await this.sentimentSignalService.insert({
      timestamp: new Date(),
      source: 'bytetree',
      etfFlow7dOz,
      etfAumUsd,
    });

    this.logger.info(`[${this.name}] Saved ETF flow: ${etfFlow7dOz}oz, AUM: ${etfAumUsd}`);
  }

  private extractValue(data: any, key: string): number | undefined {
    try {
      if (data[key] !== undefined) return parseFloat(data[key]);
      // Try nested structure
      for (const section of Object.values(data) as any[]) {
        if (section?.[key] !== undefined) return parseFloat(section[key]);
      }
    } catch {
      // ignore
    }
    return undefined;
  }
}
