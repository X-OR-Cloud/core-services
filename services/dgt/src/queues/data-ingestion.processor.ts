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
import { PortfolioSnapshotCollector } from '../collectors/portfolio-snapshot.collector';
import { SystemActivityLogService } from '../modules/system-activity-log/system-activity-log.service';
import { SystemWorkerType, SystemActivityStatus } from '../modules/system-activity-log/system-activity-log.schema';

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
    private readonly portfolioSnapshotCollector: PortfolioSnapshotCollector,
    private readonly systemActivityLogService: SystemActivityLogService,
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
        case 'snapshot_portfolio':
          await this.portfolioSnapshotCollector.collect();
          break;
        default:
          throw new Error(`Unknown datasource type: ${type}`);
      }

      const duration = Date.now() - startTime;
      this.logger.info(`[${type}] Processed in ${duration}ms`);

      if (type !== 'compute_indicators' && type !== 'snapshot_portfolio') {
        this.systemActivityLogService.logActivity({
          workerType: SystemWorkerType.DATA_INGESTION,
          source: type,
          symbol: params?.symbol,
          action: 'fetch_market_data',
          status: SystemActivityStatus.SUCCESS,
          details: `Collected ${type} data successfully`,
          metadata: { type, params },
          durationMs: duration,
        });
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error(`[${type}] Collection failed: ${error.message}`);

      if (type !== 'compute_indicators' && type !== 'snapshot_portfolio') {
        this.systemActivityLogService.logActivity({
          workerType: SystemWorkerType.DATA_INGESTION,
          source: type,
          symbol: params?.symbol,
          action: 'fetch_market_data',
          status: SystemActivityStatus.ERROR,
          details: `Collection failed for ${type}: ${error.message}`,
          metadata: { type, params, error: error.message },
          durationMs: duration,
        });
      }
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
