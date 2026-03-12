import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Types } from 'mongoose';
import {
  JwtAuthGuard,
  CurrentUser,
  ApiCreateErrors,
  ApiReadErrors,
  ApiDeleteErrors,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { MessageService } from './message.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { Message } from './message.schema';

@ApiTags('Messages')
@Controller('messages')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new message' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Message created successfully',
    type: Message,
  })
  @ApiCreateErrors()
  async create(
    @Body() dto: CreateMessageDto,
    @CurrentUser() context: RequestContext,
  ): Promise<Message> {
    return this.messageService.createMessage(dto, context);
  }

  @Get('conversation/:conversationId')
  @ApiOperation({ summary: 'Get messages for a conversation' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Messages retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/Message' } },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
      },
    },
  })
  @ApiReadErrors({ notFound: false })
  async getConversationMessages(
    @Param('conversationId') conversationId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @CurrentUser() context: RequestContext,
  ): Promise<{ data: Message[]; total: number; page: number; limit: number }> {
    return this.messageService.getConversationMessages(
      conversationId,
      Number(page),
      Number(limit),
      context,
    );
  }

  @Get('conversation/:conversationId/role/:role')
  @ApiOperation({ summary: 'Get messages by role' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Messages retrieved successfully',
    type: [Message],
  })
  @ApiReadErrors({ notFound: false })
  async getMessagesByRole(
    @Param('conversationId') conversationId: string,
    @Param('role') role: 'user' | 'agent' | 'system' | 'tool',
    @CurrentUser() context: RequestContext,
  ): Promise<Message[]> {
    return this.messageService.getMessagesByRole(
      conversationId,
      role,
      context,
    );
  }

  @Get('conversation/:conversationId/attachments')
  @ApiOperation({ summary: 'Get messages with attachments' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Messages with attachments retrieved successfully',
    type: [Message],
  })
  @ApiReadErrors({ notFound: false })
  async getMessagesWithAttachments(
    @Param('conversationId') conversationId: string,
    @CurrentUser() context: RequestContext,
  ): Promise<Message[]> {
    return this.messageService.getMessagesWithAttachments(
      conversationId,
      context,
    );
  }

  @Get('conversation/:conversationId/search')
  @ApiOperation({ summary: 'Search messages by content' })
  @ApiQuery({ name: 'q', required: true, type: String, example: 'deployment' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Search results retrieved successfully',
    type: [Message],
  })
  @ApiReadErrors({ notFound: false })
  async searchMessages(
    @Param('conversationId') conversationId: string,
    @Query('q') searchText: string,
    @CurrentUser() context: RequestContext,
  ): Promise<Message[]> {
    return this.messageService.searchMessages(
      conversationId,
      searchText,
      context,
    );
  }

  @Get('conversation/:conversationId/last/:count')
  @ApiOperation({ summary: 'Get last N messages from conversation' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Last messages retrieved successfully',
    type: [Message],
  })
  @ApiReadErrors({ notFound: false })
  async getLastMessages(
    @Param('conversationId') conversationId: string,
    @Param('count') count: number,
    @CurrentUser() context: RequestContext,
  ): Promise<Message[]> {
    return this.messageService.getLastMessages(
      conversationId,
      Number(count),
      context,
    );
  }

  @Get('conversation/:conversationId/statistics')
  @ApiOperation({ summary: 'Get message statistics for a conversation' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        byRole: { type: 'object' },
        byType: { type: 'object' },
        totalTokens: { type: 'number' },
        withAttachments: { type: 'number' },
      },
    },
  })
  @ApiReadErrors({ notFound: false })
  async getMessageStatistics(
    @Param('conversationId') conversationId: string,
    @CurrentUser() context: RequestContext,
  ): Promise<{
    total: number;
    byRole: Record<string, number>;
    byType: Record<string, number>;
    totalTokens: number;
    withAttachments: number;
  }> {
    return this.messageService.getMessageStatistics(conversationId, context);
  }

  @Get('thread/:messageId')
  @ApiOperation({ summary: 'Get message thread (parent and children)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Message thread retrieved successfully',
    type: [Message],
  })
  @ApiReadErrors({ notFound: false })
  async getMessageThread(
    @Param('messageId') messageId: string,
    @CurrentUser() context: RequestContext,
  ): Promise<Message[]> {
    return this.messageService.getMessageThread(messageId, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get message by ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Message retrieved successfully',
    type: Message,
  })
  @ApiReadErrors()
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<Partial<Message>> {
    return this.messageService.findById(
      new Types.ObjectId(id) as any,
      context,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete message' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Message deleted successfully',
  })
  @ApiDeleteErrors()
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<void> {
    await this.messageService.softDelete(
      new Types.ObjectId(id) as any,
      context,
    );
  }
}
