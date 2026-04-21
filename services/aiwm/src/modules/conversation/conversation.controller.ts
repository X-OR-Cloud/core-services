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
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Types } from 'mongoose';
import {
  JwtAuthGuard,
  CurrentUser,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
  parseQueryString,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { Conversation } from './conversation.schema';

@ApiTags('Conversations')
@Controller('conversations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new conversation' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Conversation created successfully',
    type: Conversation,
  })
  @ApiCreateErrors()
  async create(
    @Body() dto: CreateConversationDto,
    @CurrentUser() context: RequestContext,
  ): Promise<Conversation> {
    return this.conversationService.createConversation(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all conversations with pagination' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conversations retrieved successfully',
    type: [Conversation],
  })
  @ApiQuery({ name: 'keyword', required: false, description: 'Search in message content (case-insensitive)' })
  @ApiQuery({ name: 'unanswered', required: false, type: Boolean, description: 'Filter conversations where last user message has no agent reply after 30s' })
  @ApiQuery({ name: 'lowResponseRate', required: false, type: Boolean, description: 'Filter conversations where agent action count is less than user action count' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by userId or anonymousId' })
  @ApiQuery({ name: 'createdAt:gte', required: false, description: 'Filter by start date (ISO 8601)' })
  @ApiQuery({ name: 'createdAt:lte', required: false, description: 'Filter by end date (ISO 8601)' })
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext,
  ) {
    return this.conversationService.findAll(parseQueryString(query), context);
  }

  @Get('my-conversations')
  @ApiOperation({ summary: 'Get current user conversations' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User conversations retrieved successfully',
    type: [Conversation],
  })
  @ApiReadErrors({ notFound: false })
  async getMyConversations(
    @Query('status') status: string,
    @CurrentUser() context: RequestContext,
  ): Promise<Conversation[]> {
    return this.conversationService.getUserConversations(
      context.userId,
      status,
      context,
    );
  }

  @Get('agent/:agentId')
  @ApiOperation({ summary: 'Get conversations by agent ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Agent conversations retrieved successfully',
    type: [Conversation],
  })
  @ApiReadErrors({ notFound: false })
  async getAgentConversations(
    @Param('agentId') agentId: string,
    @Query('status') status: string,
    @CurrentUser() context: RequestContext,
  ): Promise<Conversation[]> {
    return this.conversationService.getAgentConversations(
      agentId,
      status,
      context,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversation by ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conversation retrieved successfully',
    type: Conversation,
  })
  @ApiReadErrors()
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<Partial<Conversation>> {
    return this.conversationService.findById(
      new Types.ObjectId(id) as any,
      context,
    );
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update conversation' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conversation updated successfully',
    type: Conversation,
  })
  @ApiUpdateErrors()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
    @CurrentUser() context: RequestContext,
  ): Promise<Conversation> {
    return this.conversationService.updateConversation(id, dto, context);
  }

  @Delete(':id/history')
  @ApiOperation({
    summary: 'Clear conversation chat history',
    description:
      'Soft-deletes all Action records for the conversation and resets counters. Requires organization.owner or universe.* role.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'History cleared successfully',
    schema: {
      type: 'object',
      properties: { deletedActions: { type: 'number' } },
    },
  })
  @ApiDeleteErrors()
  async clearHistory(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<{ deletedActions: number }> {
    return this.conversationService.clearHistory(id, context);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete conversation' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Conversation deleted successfully',
  })
  @ApiDeleteErrors()
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<void> {
    await this.conversationService.softDelete(
      new Types.ObjectId(id) as any,
      context,
    );
  }

  @Post(':id/participants')
  @ApiOperation({ summary: 'Add participant to conversation' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Participant added successfully',
    type: Conversation,
  })
  @ApiUpdateErrors()
  async addParticipant(
    @Param('id') id: string,
    @Body() body: { type: 'user' | 'agent'; participantId: string },
    @CurrentUser() context: RequestContext,
  ): Promise<Conversation> {
    return this.conversationService.addParticipant(
      id,
      body.type,
      body.participantId,
      context,
    );
  }

  @Delete(':id/participants/:type/:participantId')
  @ApiOperation({ summary: 'Remove participant from conversation' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Participant removed successfully',
    type: Conversation,
  })
  @ApiUpdateErrors()
  async removeParticipant(
    @Param('id') id: string,
    @Param('type') type: 'user' | 'agent',
    @Param('participantId') participantId: string,
    @CurrentUser() context: RequestContext,
  ): Promise<Conversation> {
    return this.conversationService.removeParticipant(
      id,
      type,
      participantId,
      context,
    );
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive conversation' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conversation archived successfully',
    type: Conversation,
  })
  @ApiUpdateErrors()
  async archive(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<Conversation> {
    return this.conversationService.archiveConversation(id, context);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Close conversation' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conversation closed successfully',
    type: Conversation,
  })
  @ApiUpdateErrors()
  async close(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<Conversation> {
    return this.conversationService.closeConversation(id, context);
  }

  @Get(':id/metrics')
  @ApiOperation({ summary: 'Get SLA metrics for a conversation' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conversation SLA metrics',
    schema: {
      type: 'object',
      properties: {
        conversationId: { type: 'string' },
        agentId: { type: 'string' },
        status: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        durationSeconds: { type: 'number' },
        totalMessages: { type: 'number' },
        userMessages: { type: 'number' },
        agentMessages: { type: 'number' },
        systemMessages: { type: 'number' },
        firstResponseTime: {
          type: 'object',
          properties: {
            ms: { type: 'number', nullable: true },
            slaBreached: { type: 'boolean' },
          },
        },
        avgResponseTimeMs: { type: 'number', nullable: true },
        p90ResponseTimeMs: { type: 'number', nullable: true },
        errorCount: { type: 'number' },
        tokenUsage: {
          type: 'object',
          properties: {
            inputTokens: { type: 'number' },
            outputTokens: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiReadErrors()
  async getMetrics(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<Record<string, unknown>> {
    return this.conversationService.getConversationMetrics(id, context);
  }

  @Post(':id/summary')
  @ApiOperation({ summary: 'Generate context summary for conversation' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Summary generated successfully',
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
      },
    },
  })
  @ApiUpdateErrors()
  async generateSummary(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<{ summary: string }> {
    const summary = await this.conversationService.generateContextSummary(
      id,
      context,
    );
    return { summary };
  }
}
