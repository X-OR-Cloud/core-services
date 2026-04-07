import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, QueryStringParams, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { IsMongoId, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SignalService } from './signal.service';
import { CreateSignalDto, UpdateSignalDto } from './signal.dto';
import { SignalStatus } from './signal.schema';
import { SignalLlmCollector } from '../../collectors/signal-llm.collector';

class TriggerSignalDto {
  @ApiProperty({ example: '69b0f1ccb37fe2f00470be1e' })
  @IsMongoId()
  accountId: string;

  @ApiProperty({ required: false, default: 'PAXGUSDT' })
  @IsString()
  @IsOptional()
  asset?: string;

  @ApiProperty({ required: false, enum: ['1h', '4h'], default: '1h' })
  @IsString()
  @IsOptional()
  timeframe?: string;
}

@ApiTags('signals')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('signals')
export class SignalController {
  constructor(
    private readonly signalService: SignalService,
    private readonly signalLlmCollector: SignalLlmCollector,
  ) {}

  // DEBUG — no auth guard (class guard applies, but this is intentionally left for debug use)
  @Post('trigger-generation')
  @ApiOperation({ summary: '[DEBUG] Trigger LLM signal generation for an account (no auth)' })
  @ApiResponse({ status: 201, description: 'Signal generation triggered' })
  async triggerGeneration(@Body() dto: TriggerSignalDto) {
    const asset = dto.asset || 'PAXGUSDT';
    const timeframe = dto.timeframe || '1h';
    await this.signalLlmCollector.collect({ accountId: dto.accountId, asset, timeframe });
    return { message: 'Signal generation triggered', accountId: dto.accountId, asset, timeframe };
  }

  @Post()
  @ApiOperation({ summary: 'Create signal' })
  @ApiCreateErrors()
  async create(
    @Body() dto: CreateSignalDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.signalService.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all signals' })
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: QueryStringParams,
    @CurrentUser() context: RequestContext,
  ) {
    const parsed = parseQueryString(query);
    // Default filters: 1h + 4h timeframe, only BUY/SELL (skip HOLD)
    if (!parsed.filter?.['timeframe']) {
      parsed.filter = { ...(parsed.filter || {}), timeframe: { $in: ['1h', '4h'] } };
    }
    // Use 'signalType' (actual DB field), not 'action' (virtual field)
    if (!parsed.filter?.['signalType']) {
      parsed.filter = { ...(parsed.filter || {}), signalType: { $in: ['BUY', 'SELL'] } };
    }
    return this.signalService.findAll(parsed, context);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Get latest ACTIVE signal per asset x timeframe' })
  @ApiReadErrors({ notFound: false })
  async findLatest(
    @Query() query: QueryStringParams,
    @CurrentUser() context: RequestContext,
  ) {
    const options = parseQueryString({
      ...query,
      status: SignalStatus.ACTIVE,
      sort: 'createdAt:desc',
      limit: 1000,
    });
    return this.signalService.findAll(options, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get signal by ID' })
  @ApiReadErrors()
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const signal = await this.signalService.findById(id, context);
    if (!signal) throw new NotFoundException(`Signal ${id} not found`);
    return signal;
  }

  @Patch(':id/ignore')
  @ApiOperation({ summary: 'Ignore a signal' })
  @ApiUpdateErrors()
  async ignore(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const updated = await this.signalService.update(id, { status: SignalStatus.IGNORED } as any, context);
    if (!updated) throw new NotFoundException(`Signal ${id} not found`);
    return updated;
  }
}
