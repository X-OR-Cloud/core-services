import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { PositionService } from './position.service';
import { CreatePositionDto, UpdatePositionDto } from './position.dto';

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
