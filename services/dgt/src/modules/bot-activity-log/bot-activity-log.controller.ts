import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, ApiReadErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { BotActivityLogService } from './bot-activity-log.service';

@ApiTags('bot-activity-logs')
@ApiBearerAuth('JWT-auth')
@Controller('bot-activity-logs')
@UseGuards(JwtAuthGuard)
export class BotActivityLogController {
  constructor(private readonly botActivityLogService: BotActivityLogService) {}

  @Get()
  @ApiOperation({ summary: 'Get bot activity logs' })
  @ApiResponse({ status: 200, description: 'Bot activity logs retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext,
  ) {
    const options = parseQueryString(query);
    return this.botActivityLogService.findAll(options, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bot activity log by ID' })
  @ApiResponse({ status: 200, description: 'Bot activity log found' })
  @ApiReadErrors()
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.botActivityLogService.findById(id as any, context);
  }
}
