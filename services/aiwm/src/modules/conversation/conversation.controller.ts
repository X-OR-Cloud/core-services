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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Types } from 'mongoose';
import {
  JwtAuthGuard,
  CurrentUser,
  PaginationQueryDto,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
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
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: PaginationQueryDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.conversationService.findAll(query, context);
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
