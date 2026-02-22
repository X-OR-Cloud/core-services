import { Controller, Get, Post, Body, Put, Param, Delete, Query, NotFoundException, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PaginationQueryDto } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { ExtensionsService } from './extensions.service';
import { CreateExtensionDto, UpdateExtensionDto } from './extensions.dto';

// System context — no auth for MVP
const systemContext: RequestContext = {
  orgId: '',
  groupId: '',
  userId: 'system',
  agentId: '',
  appId: '',
  roles: ['universe.owner' as any],
};

@ApiTags('extensions')
@Controller('extensions')
export class ExtensionsController {
  constructor(private readonly extensionsService: ExtensionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create extension' })
  @ApiResponse({ status: 201, description: 'Extension created' })
  async create(@Body(ValidationPipe) dto: CreateExtensionDto) {
    return this.extensionsService.create(dto, systemContext);
  }

  @Get()
  @ApiOperation({ summary: 'List extensions' })
  @ApiResponse({ status: 200, description: 'Extensions list' })
  async findAll(@Query() query: PaginationQueryDto) {
    return this.extensionsService.findAll(query, systemContext);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get extension by ID' })
  @ApiParam({ name: 'id', description: 'Extension ID' })
  async findOne(@Param('id') id: string) {
    const ext = await this.extensionsService.findById(new Types.ObjectId(id) as any, systemContext);
    if (!ext) throw new NotFoundException(`Extension ${id} not found`);
    return ext;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update extension' })
  @ApiParam({ name: 'id', description: 'Extension ID' })
  async update(@Param('id') id: string, @Body(ValidationPipe) dto: UpdateExtensionDto) {
    const updated = await this.extensionsService.update(new Types.ObjectId(id) as any, dto as any, systemContext);
    if (!updated) throw new NotFoundException(`Extension ${id} not found`);
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete extension' })
  @ApiParam({ name: 'id', description: 'Extension ID' })
  async remove(@Param('id') id: string) {
    const deleted = await this.extensionsService.softDelete(new Types.ObjectId(id) as any, systemContext);
    if (!deleted) throw new NotFoundException(`Extension ${id} not found`);
    return { message: 'Extension deleted' };
  }
}
