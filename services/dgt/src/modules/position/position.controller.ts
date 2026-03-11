import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors } from '@hydrabyte/base';
import { RequestContext, PredefinedRole } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { IsMongoId, IsString, IsNumber, IsOptional } from 'class-validator';
import { PositionService } from './position.service';
import { CreatePositionDto, UpdatePositionDto } from './position.dto';

class DebugCreatePositionDto {
  @ApiProperty({ example: '69b0f1ccb37fe2f00470be1e' })
  @IsMongoId()
  accountId: string;

  @ApiProperty({ default: 'PAXGUSDT' })
  @IsString()
  symbol: string;

  @ApiProperty({ enum: ['long', 'short'] })
  @IsString()
  side: string;

  @ApiProperty()
  @IsNumber()
  entryPrice: number;

  @ApiProperty()
  @IsNumber()
  quantity: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  stopLossPrice?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  takeProfitPrice?: number;
}

const SYSTEM_CONTEXT = {
  userId: '69b0f09eb7a006e7927080c9',
  orgId: '69b0f096b37fe2f00470be18',
  groupId: '',
  agentId: '',
  appId: '',
  roles: [PredefinedRole.UniverseOwner],
};

@ApiTags('positions')
@ApiBearerAuth('JWT-auth')
@Controller('positions')
export class PositionController {
  constructor(private readonly positionService: PositionService) {}

  @Post()
  @ApiOperation({ summary: 'Create position' })
  @ApiResponse({ status: 201, description: 'Position created successfully' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() dto: CreatePositionDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.positionService.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all positions' })
  @ApiResponse({ status: 200, description: 'Positions retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext,
  ) {
    const options = parseQueryString(query);
    return this.positionService.findAll(options, context);
  }

  @Post('debug-create')
  @ApiOperation({ summary: '[DEBUG] Create position directly without auth (for testing only)' })
  @ApiResponse({ status: 201, description: 'Position created successfully' })
  async debugCreate(@Body() dto: DebugCreatePositionDto) {
    const payload = {
      accountId: new Types.ObjectId(dto.accountId),
      symbol: dto.symbol || 'PAXGUSDT',
      side: dto.side || 'long',
      entryPrice: dto.entryPrice,
      quantity: dto.quantity,
      notionalUsd: dto.entryPrice * dto.quantity,
      currentPrice: dto.entryPrice,
      unrealizedPnl: 0,
      unrealizedPnlPct: 0,
      stopLossPrice: dto.stopLossPrice,
      takeProfitPrice: dto.takeProfitPrice,
      leverage: 1,
      status: 'open',
      openedAt: new Date(),
      monitoringStatus: 'active',
    };
    return this.positionService.create(payload as any, SYSTEM_CONTEXT as any);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get position by ID' })
  @ApiResponse({ status: 200, description: 'Position found' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const position = await this.positionService.findById(new Types.ObjectId(id) as any, context);
    if (!position) throw new NotFoundException(`Position ${id} not found`);
    return position;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update position' })
  @ApiResponse({ status: 200, description: 'Position updated successfully' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePositionDto,
    @CurrentUser() context: RequestContext,
  ) {
    const updated = await this.positionService.update(new Types.ObjectId(id) as any, dto, context);
    if (!updated) throw new NotFoundException(`Position ${id} not found`);
    return updated;
  }
}
