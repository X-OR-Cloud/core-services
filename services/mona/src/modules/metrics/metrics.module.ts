import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { MetricData, MetricDataSchema } from './metrics.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MetricData.name, schema: MetricDataSchema },
    ]),
  ],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
