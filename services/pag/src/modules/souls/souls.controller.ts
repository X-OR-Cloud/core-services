import { Controller, Get, Post, Body, Put, Param, Delete, UseGuards, Query, NotFoundException, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, PaginationQueryDto, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { SoulsService } from './souls.service';
import { CreateSoulDto, UpdateSoulDto } from './souls.dto';

@ApiTags('souls')
@ApiBearerAuth('JWT-auth')
@Controller('souls')
export class SoulsController {
  constructor(private readonly soulsService: SoulsService) {}

  @Post()
  @ApiOperation({ summary: 'Create soul', description: 'Create a new AI soul (personality)' })
  @ApiResponse({ status: 201, description: 'Soul created successfully' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body(ValidationPipe) createSoulDto: CreateSoulDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.soulsService.create(createSoulDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all souls', description: 'Retrieve list of all souls with pagination' })
  @ApiResponse({ status: 200, description: 'Souls retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() paginationQuery: PaginationQueryDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.soulsService.findAll(paginationQuery, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get soul by ID', description: 'Retrieve a single soul by ID' })
  @ApiResponse({ status: 200, description: 'Soul found' })
  @ApiParam({ name: 'id', description: 'Soul ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const soul = await this.soulsService.findById(new Types.ObjectId(id) as any, context);
    if (!soul) {
      throw new NotFoundException(`Soul with ID ${id} not found`);
    }
    return soul;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update soul', description: 'Update soul information' })
  @ApiResponse({ status: 200, description: 'Soul updated successfully' })
  @ApiParam({ name: 'id', description: 'Soul ID' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateSoulDto: UpdateSoulDto,
    @CurrentUser() context: RequestContext,
  ) {
    const updated = await this.soulsService.update(new Types.ObjectId(id) as any, updateSoulDto, context);
    if (!updated) {
      throw new NotFoundException(`Soul with ID ${id} not found`);
    }
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete soul', description: 'Soft delete a soul' })
  @ApiResponse({ status: 200, description: 'Soul deleted successfully' })
  @ApiParam({ name: 'id', description: 'Soul ID' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const deleted = await this.soulsService.softDelete(new Types.ObjectId(id) as any, context);
    if (!deleted) {
      throw new NotFoundException(`Soul with ID ${id} not found`);
    }
    return { message: 'Soul deleted successfully' };
  }
}