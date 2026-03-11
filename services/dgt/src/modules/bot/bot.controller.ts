import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  parseQueryString,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { BotService } from './bot.service';
import { CreateBotDto, UpdateBotDto } from './bot.dto';
import { BotStatus } from './bot.schema';

@ApiTags('bots')
@ApiBearerAuth('JWT-auth')
@Controller('bots')
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Post()
  @ApiOperation({ summary: 'Create bot' })
  @ApiResponse({ status: 201, description: 'Bot created successfully' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() dto: CreateBotDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.botService.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all bots' })
  @ApiResponse({ status: 200, description: 'Bots retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext,
  ) {
    const options = parseQueryString(query);
    return this.botService.findAll(options, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bot by ID' })
  @ApiResponse({ status: 200, description: 'Bot found' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const bot = await this.botService.findById(new Types.ObjectId(id) as any, context);
    if (!bot) throw new NotFoundException(`Bot ${id} not found`);
    return bot;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update bot configuration' })
  @ApiResponse({ status: 200, description: 'Bot updated successfully' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBotDto,
    @CurrentUser() context: RequestContext,
  ) {
    const updated = await this.botService.update(new Types.ObjectId(id) as any, dto as any, context);
    if (!updated) throw new NotFoundException(`Bot ${id} not found`);
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete bot (only if STOPPED or PAUSED)' })
  @ApiResponse({ status: 200, description: 'Bot deleted successfully' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const bot = await this.botService.findById(new Types.ObjectId(id) as any, context);
    if (!bot) throw new NotFoundException(`Bot ${id} not found`);

    if (bot.status !== BotStatus.STOPPED && bot.status !== BotStatus.PAUSED) {
      throw new BadRequestException('Cannot delete a running bot. Stop the bot before deleting.');
    }

    return this.botService.softDelete(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start bot' })
  @ApiResponse({ status: 200, description: 'Bot started successfully' })
  @UseGuards(JwtAuthGuard)
  async start(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.botService.transitionStatus(new Types.ObjectId(id), BotStatus.RUNNING, context);
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause bot' })
  @ApiResponse({ status: 200, description: 'Bot paused successfully' })
  @UseGuards(JwtAuthGuard)
  async pause(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.botService.transitionStatus(new Types.ObjectId(id), BotStatus.PAUSED, context);
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume bot' })
  @ApiResponse({ status: 200, description: 'Bot resumed successfully' })
  @UseGuards(JwtAuthGuard)
  async resume(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.botService.transitionStatus(new Types.ObjectId(id), BotStatus.RUNNING, context);
  }

  @Post(':id/stop')
  @ApiOperation({ summary: 'Stop bot' })
  @ApiResponse({ status: 200, description: 'Bot stopped successfully' })
  @UseGuards(JwtAuthGuard)
  async stop(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.botService.transitionStatus(new Types.ObjectId(id), BotStatus.STOPPED, context);
  }
}
