import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard, CurrentUser } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { MetricsService } from './metrics.service';
import {
  PushNodeMetricsDto,
  PushResourceMetricsDto,
  QueryMetricsDto,
  QueryMultipleMetricsDto,
} from './metrics.dto';

@Controller('metrics')
@ApiTags('Metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check for metrics module' })
  healthCheck() {
    return { status: 'ok', service: 'mona-metrics' };
  }

  // ============= Push API Endpoints =============

  @Post('push/node')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 1, ttl: 60000 } }) // 1 req/min
  @ApiOperation({ summary: 'Push node metrics' })
  @ApiCreatedResponse({ description: 'Node metrics received successfully' })
  async pushNodeMetrics(
    @Body() dto: PushNodeMetricsDto,
    @CurrentUser() context: RequestContext,
  ) {
    const metric = await this.metricsService.pushNodeMetrics(dto, context);

    return {
      success: true,
      message: 'Node metrics received successfully',
      data: {
        metricId: metric._id,
        nodeId: metric.entityId,
        timestamp: metric.timestamp,
        interval: metric.interval,
      },
    };
  }

  @Post('push/resource')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 1, ttl: 300000 } }) // 1 req/5min
  @ApiOperation({ summary: 'Push resource metrics' })
  @ApiCreatedResponse({
    description: 'Resource metrics received successfully',
  })
  async pushResourceMetrics(
    @Body() dto: PushResourceMetricsDto,
    @CurrentUser() context: RequestContext,
  ) {
    const metric = await this.metricsService.pushResourceMetrics(dto, context);

    return {
      success: true,
      message: 'Resource metrics received successfully',
      data: {
        metricId: metric._id,
        resourceId: metric.entityId,
        timestamp: metric.timestamp,
        interval: metric.interval,
      },
    };
  }

  // ============= Query API Endpoints =============

  @Get('nodes/:nodeId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 req/min
  @ApiOperation({ summary: 'Query node metrics by time range' })
  @ApiOkResponse({ description: 'Node metrics retrieved successfully' })
  async queryNodeMetrics(
    @Param('nodeId') nodeId: string,
    @Query() query: QueryMetricsDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.metricsService.queryNodeMetrics(nodeId, query, context);
  }

  @Get('resources/:resourceId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 req/min
  @ApiOperation({ summary: 'Query resource metrics by time range' })
  @ApiOkResponse({ description: 'Resource metrics retrieved successfully' })
  async queryResourceMetrics(
    @Param('resourceId') resourceId: string,
    @Query() query: QueryMetricsDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.metricsService.queryResourceMetrics(resourceId, query, context);
  }

  @Get('query')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 req/min
  @ApiOperation({ summary: 'Query multiple entities metrics' })
  @ApiOkResponse({ description: 'Metrics retrieved successfully' })
  async queryMultipleMetrics(
    @Query() query: QueryMultipleMetricsDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.metricsService.queryMultipleMetrics(query, context);
  }

  @Get(':type/:entityId/latest')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 req/min
  @ApiOperation({ summary: 'Get latest metrics for an entity' })
  @ApiOkResponse({ description: 'Latest metrics retrieved successfully' })
  async getLatestMetrics(
    @Param('type') type: string,
    @Param('entityId') entityId: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.metricsService.getLatestMetrics(type, entityId, context);
  }
}
