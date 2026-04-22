import { Controller, Get, Put, Post, Body, Param, Delete, UseGuards, Query, NotFoundException, ValidationPipe, HttpCode, HttpStatus, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
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
  @ApiQuery({ name: 'platformUserId', required: false, description: 'Filter by Zalo/platform user ID' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: PaginationQueryDto & { channelId?: string; soulId?: string; status?: string; platformUserId?: string },
    @CurrentUser() context: RequestContext,
  ) {
    // Build filter object for queries
    const filter: any = {};
    if (query.channelId) filter.channelId = query.channelId;
    if (query.soulId) filter.soulId = query.soulId;
    if (query.status) filter.status = query.status;
    if (query.platformUserId) filter['platformUser.id'] = query.platformUserId;

    const options = {
      ...query,
      filter
    };

    return this.conversationsService.findAll(options, context);
  }

  @Get('unanswered')
  @ApiOperation({ summary: 'Unanswered conversations', description: 'Conversations where the last message is from user (no assistant reply yet)' })
  @ApiResponse({ status: 200, description: 'Unanswered conversations retrieved' })
  @ApiQuery({ name: 'sinceHours', required: false, description: 'Look back window in hours', example: 24 })
  @UseGuards(JwtAuthGuard)
  async getUnanswered(
    @Query('sinceHours', new DefaultValuePipe(24), ParseIntPipe) sinceHours: number,
  ) {
    return this.conversationsService.getUnansweredConversations(sinceHours);
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

  @Post(':id/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset conversation', description: 'Soft-delete all messages and reset message count' })
  @ApiResponse({ status: 200, description: 'Conversation reset successfully' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @UseGuards(JwtAuthGuard)
  async reset(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.conversationsService.resetConversation(id, context);
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