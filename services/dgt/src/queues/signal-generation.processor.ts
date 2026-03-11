import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { createLogger } from '@hydrabyte/shared';
import { QUEUE_NAMES } from '../config/queue.config';
import { SignalLlmCollector } from '../collectors/signal-llm.collector';
import { SignalService } from '../modules/signal/signal.service';
import { SignalStatus } from '../modules/signal/signal.schema';

@Processor(QUEUE_NAMES.SIGNAL_GENERATION)
export class SignalGenerationProcessor extends WorkerHost {
  private readonly logger = createLogger('SignalGenerationProcessor');

  constructor(
    private readonly signalLlmCollector: SignalLlmCollector,
    private readonly signalService: SignalService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { type, params } = job.data;
    const startTime = Date.now();

    try {
      switch (type) {
        case 'generate_signal':
          await this.signalLlmCollector.collect(params);
          break;
        case 'expire_signals':
          await this.expireSignals();
          break;
        default:
          throw new Error(`Unknown signal job type: ${type}`);
      }

      const duration = Date.now() - startTime;
      this.logger.info(`[${type}] Processed in ${duration}ms`);
    } catch (error: any) {
      this.logger.error(`[${type}] Processing failed: ${error.message}`);
      throw error;
    }
  }

  private async expireSignals(): Promise<void> {
    const result = await (this.signalService as any).model.updateMany(
      { status: SignalStatus.ACTIVE, expiresAt: { $lte: new Date() } },
      { $set: { status: SignalStatus.EXPIRED } },
    );
    const count = result?.modifiedCount ?? 0;
    this.logger.info(`[expire_signals] Expired ${count} signals`);
  }
}
