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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  ApiCreateErrors,
  ApiReadErrors,
  ApiDeleteErrors,
  parseQueryString,
  QueryStringParams,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { MemoryService } from './memory.service';
import { SearchMemoryDto, UpsertMemoryDto, ListMemoryKeysDto } from './memory.dto';
import { MemoryCategory } from './memory.schema';

/**
 * MemoryController
 * REST API for agent persistent memory, scoped by agentId from JWT context
 */
@ApiTags('Agent Memory')
@ApiBearerAuth()
@Controller('agent-memories')
@UseGuards(JwtAuthGuard)
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Get()
  @ApiOperation({ summary: 'Get all memory entries with content' })
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: QueryStringParams,
    @CurrentUser() context: RequestContext
  ) {
    return this.memoryService.findAll(parseQueryString(query), context);
  }

  @Post('search')
  @ApiOperation({ summary: 'Search memory by keyword (full-text)' })
  @ApiResponse({ status: 200, description: 'Search results' })
  @ApiReadErrors({ notFound: false })
  async search(
    @Body() dto: SearchMemoryDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.memoryService.search(context.userId, dto);
  }

  @Put('upsert')
  @ApiOperation({ summary: 'Upsert a memory entry (create or update by category+key)' })
  @ApiResponse({ status: 200, description: 'Memory upserted' })
  @ApiCreateErrors()
  async upsert(
    @Body() dto: UpsertMemoryDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.memoryService.upsert(context.userId, dto);
  }

  @Get('keys')
  @ApiOperation({ summary: 'List all memory keys (no content), optionally filtered by category' })
  @ApiResponse({ status: 200, description: 'Memory keys list' })
  @ApiReadErrors({ notFound: false })
  async listKeys(
    @Query() dto: ListMemoryKeysDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.memoryService.listKeys(context.userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a memory entry by ID' })
  @ApiDeleteErrors()
  async deleteById(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.memoryService.softDelete(id, context);
  }

  @Delete(':category/:key')
  @ApiOperation({ summary: 'Soft delete a memory entry by category and key' })
  @ApiDeleteErrors()
  async deleteByKey(
    @Param('category') category: MemoryCategory,
    @Param('key') key: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.memoryService.deleteByKey(context.userId, category, key);
  }
}
