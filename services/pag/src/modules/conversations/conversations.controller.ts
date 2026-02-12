import { Controller, Get, Put, Body, Param, Delete, UseGuards, Query, NotFoundException, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, PaginationQueryDto, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { ConversationsService } from './conversations.service';
import { UpdateConversationDto } from './conversations.dto';

@ApiTags('conversations')
@ApiBearerAuth('JWT-auth')
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all conversations', description: 'Retrieve list of conversations with optional filters' })
  @ApiResponse({ status: 200, description: 'Conversations retrieved successfully' })
  @ApiQuery({ name: 'channelId', required: false, description: 'Filter by channel ID' })
  @ApiQuery({ name: 'soulId', required: false, description: 'Filter by soul ID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (active, idle, closed)' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: PaginationQueryDto & { channelId?: string; soulId?: string; status?: string },
    @CurrentUser() context: RequestContext,
  ) {
    // Build filter object for queries
    const filter: any = {};
    if (query.channelId) filter.channelId = query.channelId;
    if (query.soulId) filter.soulId = query.soulId;
    if (query.status) filter.status = query.status;

    const options = {
      ...query,
      filter
    };

    return this.conversationsService.findAll(options, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversation by ID', description: 'Retrieve a single conversation by ID' })
  @ApiResponse({ status: 200, description: 'Conversation found' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const conversation = await this.conversationsService.findById(new Types.ObjectId(id) as any, context);
    if (!conversation) {
      throw new NotFoundException(`Conversation with ID ${id} not found`);
    }
    return conversation;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update conversation', description: 'Update conversation information (status, summary, tags)' })
  @ApiResponse({ status: 200, description: 'Conversation updated successfully' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateConversationDto: UpdateConversationDto,
    @CurrentUser() context: RequestContext,
  ) {
    const updated = await this.conversationsService.update(new Types.ObjectId(id) as any, updateConversationDto as any, context);
    if (!updated) {
      throw new NotFoundException(`Conversation with ID ${id} not found`);
    }
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete conversation', description: 'Soft delete a conversation' })
  @ApiResponse({ status: 200, description: 'Conversation deleted successfully' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const deleted = await this.conversationsService.softDelete(new Types.ObjectId(id) as any, context);
    if (!deleted) {
      throw new NotFoundException(`Conversation with ID ${id} not found`);
    }
    return { message: 'Conversation deleted successfully' };
  }
}