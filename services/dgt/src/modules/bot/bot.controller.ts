import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, QueryStringParams, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { BotService } from './bot.service';
import { CreateBotDto, UpdateBotDto } from './bot.dto';
import { BotStatus } from './bot.schema';

@ApiTags('bots')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('bots')
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Post()
  @ApiOperation({ summary: 'Create bot' })
  @ApiCreateErrors()
  async create(
    @Body() dto: CreateBotDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.botService.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all bots' })
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: QueryStringParams,
    @CurrentUser() context: RequestContext,
  ) {
    return this.botService.findAll(parseQueryString(query), context);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Aggregate stats across all bots for current user' })
  async getStats(@CurrentUser() context: RequestContext) {
    return this.botService.getStats(context.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bot by ID' })
  @ApiReadErrors()
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const bot = await this.botService.findById(id, context);
    if (!bot) throw new NotFoundException(`Bot ${id} not found`);
    return bot;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update bot configuration' })
  @ApiUpdateErrors()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBotDto,
    @CurrentUser() context: RequestContext,
  ) {
    const updated = await this.botService.update(id, dto as any, context);
    if (!updated) throw new NotFoundException(`Bot ${id} not found`);
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete bot (only if STOPPED or PAUSED)' })
  @ApiDeleteErrors()
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const bot = await this.botService.findById(id, context);
    if (!bot) throw new NotFoundException(`Bot ${id} not found`);
    if (bot.status !== BotStatus.STOPPED && bot.status !== BotStatus.PAUSED) {
      throw new BadRequestException('Cannot delete a running bot. Stop the bot before deleting.');
    }
    return this.botService.softDelete(id, context);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start bot' })
  async start(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.botService.transitionStatus(new Types.ObjectId(id), BotStatus.RUNNING, context);
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause bot' })
  async pause(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.botService.transitionStatus(new Types.ObjectId(id), BotStatus.PAUSED, context);
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume bot' })
  async resume(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.botService.transitionStatus(new Types.ObjectId(id), BotStatus.RUNNING, context);
  }

  @Post(':id/stop')
  @ApiOperation({ summary: 'Stop bot' })
  async stop(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.botService.transitionStatus(new Types.ObjectId(id), BotStatus.STOPPED, context);
  }
}
