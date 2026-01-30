import { Module } from '@nestjs/common';
import { MetricsAggregationProcessor } from './processors/metrics-aggregation.processor';
import { MetricsModule } from '../modules/metrics/metrics.module';

@Module({
  imports: [MetricsModule],
  providers: [MetricsAggregationProcessor],
})
export class ProcessorsModule {}
