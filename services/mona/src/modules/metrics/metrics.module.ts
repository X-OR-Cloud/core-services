import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { MetricsAggregationService } from './metrics-aggregation.service';
import { MetricsAggregationController } from './metrics-aggregation.controller';
import { MetricData, MetricDataSchema } from './metrics.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MetricData.name, schema: MetricDataSchema },
    ]),
    BullModule.registerQueue({
      name: 'metrics-aggregation',
    }),
  ],
  controllers: [MetricsController, MetricsAggregationController],
  providers: [MetricsService, MetricsAggregationService],
  exports: [MetricsService, MetricsAggregationService],
})
export class MetricsModule {}
