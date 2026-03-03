import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { createLogger } from '@hydrabyte/shared';
import { QUEUE_NAMES } from '../config/queue.config';
import { GoldapiCollector } from '../collectors/goldapi.collector';
import { BinanceSpotCollector } from '../collectors/binance-spot.collector';
import { BinanceFuturesCollector } from '../collectors/binance-futures.collector';
import { FredCollector } from '../collectors/fred.collector';
import { OkxCollector } from '../collectors/okx.collector';
import { BitfinexCollector } from '../collectors/bitfinex.collector';
import { YahooFinanceCollector } from '../collectors/yahoo-finance.collector';
import { BytetreeCollector } from '../collectors/bytetree.collector';
import { NewsapiCollector } from '../collectors/newsapi.collector';
import { IndicatorComputationService } from '../indicators/indicator-computation.service';

@Processor(QUEUE_NAMES.DATA_INGESTION)
export class DataIngestionProcessor extends WorkerHost {
  private readonly logger = createLogger('DataIngestionProcessor');

  constructor(
    private readonly goldapiCollector: GoldapiCollector,
    private readonly binanceSpotCollector: BinanceSpotCollector,
    private readonly binanceFuturesCollector: BinanceFuturesCollector,
    private readonly fredCollector: FredCollector,
    private readonly okxCollector: OkxCollector,
    private readonly bitfinexCollector: BitfinexCollector,
    private readonly yahooCollector: YahooFinanceCollector,
    private readonly bytetreeCollector: BytetreeCollector,
    private readonly newsapiCollector: NewsapiCollector,
    private readonly indicatorComputation: IndicatorComputationService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { type, params } = job.data;
    const startTime = Date.now();

    try {
      switch (type) {
        case 'goldapi':
          await this.goldapiCollector.collect(params);
          break;
        case 'binance_spot':
          await this.binanceSpotCollector.collect(params);
          break;
        case 'binance_futures':
          await this.binanceFuturesCollector.collect(params);
          break;
        case 'fred':
          await this.fredCollector.collect(params);
          break;
        case 'okx':
          await this.okxCollector.collect(params);
          break;
        case 'bitfinex':
          await this.bitfinexCollector.collect(params);
          break;
        case 'yahoo_finance':
          await this.yahooCollector.collect(params);
          break;
        case 'bytetree':
          await this.bytetreeCollector.collect(params);
          break;
        case 'newsapi':
          await this.newsapiCollector.collect(params);
          break;
        case 'compute_indicators':
          await this.computeIndicators(params);
          break;
        default:
          throw new Error(`Unknown datasource type: ${type}`);
      }

      const duration = Date.now() - startTime;
      this.logger.info(`[${type}] Processed in ${duration}ms`);
    } catch (error: any) {
      this.logger.error(`[${type}] Collection failed: ${error.message}`);
      throw error;
    }
  }

  private async computeIndicators(params: Record<string, any>): Promise<void> {
    const { pairs = [] } = params;
    for (const pair of pairs) {
      try {
        await this.indicatorComputation.compute(pair.symbol, pair.source, pair.timeframe);
      } catch (error: any) {
        this.logger.error(`[compute_indicators] Failed for ${pair.symbol}/${pair.timeframe}: ${error.message}`);
      }
    }
  }
}
