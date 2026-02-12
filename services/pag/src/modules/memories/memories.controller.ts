import { Controller, Get, Post, Body, Put, Param, Delete, UseGuards, Query, NotFoundException, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, PaginationQueryDto, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { MemoriesService } from './memories.service';
import { CreateMemoryDto, UpdateMemoryDto } from './memories.dto';

@ApiTags('memories')
@ApiBearerAuth('JWT-auth')
@Controller('memories')
export class MemoriesController {
  constructor(private readonly memoriesService: MemoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create memory', description: 'Create a new memory entry' })
  @ApiResponse({ status: 201, description: 'Memory created successfully' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body(ValidationPipe) createMemoryDto: CreateMemoryDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.memoriesService.create(createMemoryDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all memories', description: 'Retrieve list of memories with optional filters' })
  @ApiResponse({ status: 200, description: 'Memories retrieved successfully' })
  @ApiQuery({ name: 'platformUserId', required: false, description: 'Filter by platform user ID' })
  @ApiQuery({ name: 'soulId', required: false, description: 'Filter by soul ID' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by memory type' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: PaginationQueryDto & { platformUserId?: string; soulId?: string; type?: string },
    @CurrentUser() context: RequestContext,
  ) {
    // Build filter object for queries
    const filter: any = {};
    if (query.platformUserId) filter.platformUserId = query.platformUserId;
    if (query.soulId) filter.soulId = query.soulId;
    if (query.type) filter.type = query.type;

    const options = {
      ...query,
      filter
    };

    return this.memoriesService.findAll(options, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get memory by ID', description: 'Retrieve a single memory by ID' })
  @ApiResponse({ status: 200, description: 'Memory found' })
  @ApiParam({ name: 'id', description: 'Memory ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const memory = await this.memoriesService.findById(new Types.ObjectId(id) as any, context);
    if (!memory) {
      throw new NotFoundException(`Memory with ID ${id} not found`);
    }
    return memory;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update memory', description: 'Update memory information' })
  @ApiResponse({ status: 200, description: 'Memory updated successfully' })
  @ApiParam({ name: 'id', description: 'Memory ID' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateMemoryDto: UpdateMemoryDto,
    @CurrentUser() context: RequestContext,
  ) {
    const updated = await this.memoriesService.update(new Types.ObjectId(id) as any, updateMemoryDto as any, context);
    if (!updated) {
      throw new NotFoundException(`Memory with ID ${id} not found`);
    }
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete memory', description: 'Soft delete a memory' })
  @ApiResponse({ status: 200, description: 'Memory deleted successfully' })
  @ApiParam({ name: 'id', description: 'Memory ID' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const deleted = await this.memoriesService.softDelete(new Types.ObjectId(id) as any, context);
    if (!deleted) {
      throw new NotFoundException(`Memory with ID ${id} not found`);
    }
    return { message: 'Memory deleted successfully' };
  }
}