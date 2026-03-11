import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { IsMongoId, IsString, IsOptional } from 'class-validator';
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
@Controller('signals')
export class SignalController {
  constructor(
    private readonly signalService: SignalService,
    private readonly signalLlmCollector: SignalLlmCollector,
  ) {}

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
  @ApiResponse({ status: 201, description: 'Signal created successfully' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() dto: CreateSignalDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.signalService.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all signals' })
  @ApiResponse({ status: 200, description: 'Signals retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext,
  ) {
    const options = parseQueryString(query);
    return this.signalService.findAll(options, context);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Get latest ACTIVE signal per asset x timeframe' })
  @ApiResponse({ status: 200, description: 'Latest active signals retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findLatest(
    @Query() query: Record<string, any>,
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
  @ApiResponse({ status: 200, description: 'Signal found' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const signal = await this.signalService.findById(new Types.ObjectId(id) as any, context);
    if (!signal) throw new NotFoundException(`Signal ${id} not found`);
    return signal;
  }

  @Patch(':id/ignore')
  @ApiOperation({ summary: 'Ignore a signal' })
  @ApiResponse({ status: 200, description: 'Signal ignored successfully' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async ignore(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const updated = await this.signalService.update(
      new Types.ObjectId(id) as any,
      { status: SignalStatus.IGNORED } as any,
      context,
    );
    if (!updated) throw new NotFoundException(`Signal ${id} not found`);
    return updated;
  }
}
