import {
  Controller,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@hydrabyte/base';
import { MetricsAggregationService } from './metrics-aggregation.service';

@Controller('metrics/admin')
@ApiTags('Metrics Admin')
export class MetricsAggregationController {
  constructor(
    private readonly aggregationService: MetricsAggregationService,
  ) {}

  @Post('aggregate/1min-to-5min')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trigger 1min to 5min aggregation' })
  @ApiOkResponse({ description: 'Aggregation job queued successfully' })
  async aggregate1minTo5min() {
    return this.aggregationService.aggregate1minTo5min();
  }

  @Post('aggregate/5min-to-1hour')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trigger 5min to 1hour aggregation' })
  @ApiOkResponse({ description: 'Aggregation job queued successfully' })
  async aggregate5minTo1hour() {
    return this.aggregationService.aggregate5minTo1hour();
  }

  @Post('aggregate/1hour-to-1day')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trigger 1hour to 1day aggregation' })
  @ApiOkResponse({ description: 'Aggregation job queued successfully' })
  async aggregate1hourTo1day() {
    return this.aggregationService.aggregate1hourTo1day();
  }

  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cleanup old metrics based on retention policy' })
  @ApiOkResponse({ description: 'Cleanup completed successfully' })
  async cleanupOldMetrics() {
    return this.aggregationService.cleanupOldMetrics();
  }
}
