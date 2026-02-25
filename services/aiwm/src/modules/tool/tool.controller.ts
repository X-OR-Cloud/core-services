import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  PaginationQueryDto,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
  RequireUniverseRole,
  UniverseRoleGuard,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { ToolService } from './tool.service';
import { CreateToolDto, UpdateToolDto, LookupToolFunctionsDto } from './tool.dto';

@ApiTags('Tools')
@ApiBearerAuth()
@Controller('tools')
export class ToolController {
  constructor(private readonly toolService: ToolService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new tool' })
  @ApiCreateErrors()
  @RequireUniverseRole()
  @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async create(
    @Body() createToolDto: CreateToolDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.toolService.create(createToolDto, context);
  }

  @Get('functions')
  @ApiOperation({ summary: 'Lookup available functions by framework and tool IDs' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async lookupFunctions(
    @Query('framework') framework: string,
    @Query('toolIds') toolIds: string,
    @CurrentUser() context: RequestContext
  ) {
    const dto: LookupToolFunctionsDto = {
      framework,
      toolIds: toolIds ? toolIds.split(',') : [],
    };
    return this.toolService.lookupFunctions(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List all tools with pagination' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: PaginationQueryDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.toolService.findAll(query, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tool by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.toolService.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update tool by ID' })
  @ApiUpdateErrors()
  @RequireUniverseRole()
  @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async update(
    @Param('id') id: string,
    @Body() updateToolDto: UpdateToolDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.toolService.update(new Types.ObjectId(id) as any, updateToolDto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete tool by ID' })
  @ApiDeleteErrors()
  @RequireUniverseRole()
    @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.toolService.softDelete(new Types.ObjectId(id) as any, context);
  }
}
