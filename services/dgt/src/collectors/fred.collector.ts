import { Injectable } from '@nestjs/common';
import { BaseCollector } from './base.collector';
import { MacroIndicatorService } from '../modules/macro-indicator/macro-indicator.service';

const SERIES_META: Record<string, { name: string; unit: string; frequency: string; impactLevel: 'low' | 'medium' | 'high' }> = {
  FEDFUNDS: { name: 'Federal Funds Rate', unit: '%', frequency: 'daily', impactLevel: 'high' },
  CPIAUCSL: { name: 'Consumer Price Index', unit: 'index', frequency: 'monthly', impactLevel: 'high' },
  PCEPI: { name: 'PCE Price Index', unit: 'index', frequency: 'monthly', impactLevel: 'high' },
  FEDTARMD: { name: 'Fed Target Rate (Midpoint)', unit: '%', frequency: 'daily', impactLevel: 'high' },
  DFII10: { name: '10Y Real Interest Rate', unit: '%', frequency: 'daily', impactLevel: 'medium' },
  DTWEXBGS: { name: 'Trade Weighted US Dollar Index', unit: 'index', frequency: 'daily', impactLevel: 'medium' },
  M2SL: { name: 'M2 Money Supply', unit: 'USD billion', frequency: 'monthly', impactLevel: 'medium' },
  RRPONTSYD: { name: 'Overnight Reverse Repo', unit: 'USD billion', frequency: 'daily', impactLevel: 'low' },
  BAMLH0A0HYM2: { name: 'High Yield Bond Spread', unit: '%', frequency: 'daily', impactLevel: 'low' },
  DGS10: { name: '10Y Treasury Yield', unit: '%', frequency: 'daily', impactLevel: 'medium' },
  DGS2: { name: '2Y Treasury Yield', unit: '%', frequency: 'daily', impactLevel: 'medium' },
};

@Injectable()
export class FredCollector extends BaseCollector {
  protected readonly name = 'FRED';
  private readonly baseUrl = 'https://api.stlouisfed.org/fred/series/observations';

  constructor(
    private readonly macroIndicatorService: MacroIndicatorService,
  ) {
    super();
  }

  async collect(params: Record<string, any>): Promise<void> {
    const { seriesIds = Object.keys(SERIES_META) } = params;

    // TODO: Read API key from Settings (DB) instead of env
    const apiKey = process.env['FRED_API_KEY'] || '';
    if (!apiKey) {
      this.logger.warn(`[${this.name}] No API key configured, skipping`);
      return;
    }

    for (const seriesId of seriesIds) {
      try {
        await this.collectSeries(seriesId, apiKey);
      } catch (error: any) {
        this.logger.error(`[${this.name}] Failed to collect ${seriesId}: ${error.message}`);
      }
    }
  }

  private async collectSeries(seriesId: string, apiKey: string): Promise<void> {
    const url = `${this.baseUrl}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`;
    const data = await this.fetchWithRetry(url);

    const observations = data.observations;
    if (!observations?.length) {
      this.logger.warn(`[${this.name}] No observations for ${seriesId}`);
      return;
    }

    const obs = observations[0];
    const value = parseFloat(obs.value);
    if (isNaN(value)) {
      this.logger.warn(`[${this.name}] Invalid value for ${seriesId}: ${obs.value}`);
      return;
    }

    const meta = SERIES_META[seriesId] || {
      name: seriesId,
      unit: 'unknown',
      frequency: 'daily',
      impactLevel: 'low' as const,
    };

    await this.macroIndicatorService.upsert(
      { seriesId, timestamp: new Date(obs.date) },
      {
        seriesId,
        name: meta.name,
        value,
        unit: meta.unit,
        timestamp: new Date(obs.date),
        releaseDate: obs.realtime_start ? new Date(obs.realtime_start) : undefined,
        source: 'fred',
        frequency: meta.frequency,
        actual: value,
        impactLevel: meta.impactLevel,
      },
    );

    this.logger.info(`[${this.name}] Saved ${seriesId}: ${value} ${meta.unit}`);
  }
}
