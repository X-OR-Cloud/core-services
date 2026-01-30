import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MetricsAggregationService } from '../../modules/metrics/metrics-aggregation.service';

@Processor('metrics-aggregation')
export class MetricsAggregationProcessor extends WorkerHost {
  private readonly logger = new Logger(MetricsAggregationProcessor.name);

  constructor(
    private readonly aggregationService: MetricsAggregationService,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    this.logger.log(
      `Processing aggregation job ${job.id}: ${job.name}`,
    );

    try {
      switch (job.name) {
        case 'aggregate-entity':
          return await this.handleAggregateEntity(job);
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          return { success: false, error: 'Unknown job type' };
      }
    } catch (error) {
      this.logger.error(
        `Job ${job.id} failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async handleAggregateEntity(job: Job<any>) {
    const { entityId, sourceInterval, targetInterval, startTime, endTime } =
      job.data;

    this.logger.log(
      `Aggregating entity ${entityId}: ${sourceInterval} -> ${targetInterval}`,
    );

    await this.aggregationService.aggregateEntityMetrics(
      entityId,
      sourceInterval,
      targetInterval,
      startTime,
      endTime,
    );

    return {
      success: true,
      entityId,
      sourceInterval,
      targetInterval,
    };
  }
}
