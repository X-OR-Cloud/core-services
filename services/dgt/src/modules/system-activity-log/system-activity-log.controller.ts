import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, QueryStringParams, ApiReadErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { SystemActivityLogService } from './system-activity-log.service';

@ApiTags('system-activity-logs')
@ApiBearerAuth('JWT-auth')
@Controller('system-activity-logs')
@UseGuards(JwtAuthGuard)
export class SystemActivityLogController {
  constructor(private readonly systemActivityLogService: SystemActivityLogService) {}

  @Get()
  @ApiOperation({ summary: 'Get system activity logs (signal gen, data ingestion, tech indicators)' })
  @ApiResponse({ status: 200, description: 'System activity logs retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: QueryStringParams,
    @CurrentUser() context: RequestContext,
  ) {
    const options = parseQueryString(query);
    return this.systemActivityLogService.findAll(options, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get system activity log by ID' })
  @ApiResponse({ status: 200, description: 'System activity log found' })
  @ApiReadErrors()
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.systemActivityLogService.findById(id as any, context);
  }
}
