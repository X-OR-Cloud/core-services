import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { AnalyticsService } from './analytics.service';

@ApiTags('Portfolio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('performance')
  @ApiOperation({ summary: 'Portfolio performance over time — equity curve with summary stats' })
  @ApiQuery({ name: 'range', required: false, enum: ['24H', '7D', '30D', '90D', 'ALL'], example: '7D' })
  @ApiQuery({ name: 'accountId', required: false })
  getPerformance(
    @CurrentUser() ctx: RequestContext,
    @Query('range') range = '7D',
    @Query('accountId') accountId?: string,
  ) {
    return this.analyticsService.getPortfolioPerformance(ctx.userId, range, accountId);
  }

  @Get('assets')
  @ApiOperation({ summary: 'Asset breakdown — positions grouped by symbol with allocation' })
  @ApiQuery({ name: 'range', required: false, enum: ['24H', '7D', '30D', '90D', 'ALL'], example: '7D' })
  @ApiQuery({ name: 'accountId', required: false })
  getAssets(
    @CurrentUser() ctx: RequestContext,
    @Query('range') range = '7D',
    @Query('accountId') accountId?: string,
  ) {
    return this.analyticsService.getAssetPerformance(ctx.userId, range, accountId);
  }
}
