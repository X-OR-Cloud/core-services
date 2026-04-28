import { Controller, Get, Post, Body, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, QueryStringParams, ApiCreateErrors, ApiReadErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { CallsService } from './calls.service';
import { OriginateCallDto, ScheduleAutoCallDto } from './calls.dto';

@ApiTags('calls')
@ApiBearerAuth()
@Controller('calls')
export class CallsController {
  constructor(private readonly service: CallsService) {}

  @Post('originate')
  @ApiOperation({ summary: 'Initiate outbound call (click-to-call / manual)' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  originate(@Body() dto: OriginateCallDto, @CurrentUser() ctx: RequestContext) {
    return this.service.originate(dto, ctx);
  }

  @Post('schedule')
  @ApiOperation({ summary: 'Schedule auto call at future time' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  scheduleAuto(@Body() dto: ScheduleAutoCallDto, @CurrentUser() ctx: RequestContext) {
    return this.service.scheduleAuto(dto, ctx);
  }

  @Get()
  @ApiOperation({ summary: 'List call logs' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  findAll(@Query() query: QueryStringParams, @CurrentUser() ctx: RequestContext) {
    return this.service.findAll(parseQueryString(query), ctx);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get call log by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @CurrentUser() ctx: RequestContext) {
    return this.service.findById(id as any, ctx);
  }

  @Get(':id/recording-url')
  @ApiOperation({ summary: 'Get presigned URL for recording playback (TTL 15 min)' })
  @ApiOkResponse({ schema: { example: { url: 'https://...', expiresIn: 900 } } })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  getRecordingUrl(@Param('id') id: string, @CurrentUser() ctx: RequestContext) {
    return this.service.getRecordingUrl(id, ctx);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete call log (soft delete)' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @CurrentUser() ctx: RequestContext) {
    return this.service.softDelete(id, ctx);
  }
}
