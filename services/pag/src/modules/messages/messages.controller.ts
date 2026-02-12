import { Controller, Get, Post, Body, Param, UseGuards, Query, NotFoundException, ValidationPipe, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, ApiCreateErrors, ApiReadErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './messages.dto';

@ApiTags('messages')
@ApiBearerAuth('JWT-auth')
@Controller('conversations/:conversationId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @ApiOperation({ 
    summary: 'Get conversation message history', 
    description: 'Retrieve paginated message history for a conversation (most recent first)' 
  })
  @ApiResponse({ status: 200, description: 'Messages retrieved successfully' })
  @ApiParam({ name: 'conversationId', description: 'Conversation ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum number of messages to return', example: 50 })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async getHistory(
    @Param('conversationId') conversationId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @CurrentUser() context: RequestContext,
  ) {
    const messages = await this.messagesService.getRecentByConversation(conversationId, limit);
    
    return {
      data: messages,
      pagination: {
        conversationId,
        limit,
        total: messages.length
      }
    };
  }

  @Post()
  @ApiOperation({ 
    summary: 'Send manual message', 
    description: 'Send a manual message to a conversation (for admin/testing purposes)' 
  })
  @ApiResponse({ status: 201, description: 'Message sent successfully' })
  @ApiParam({ name: 'conversationId', description: 'Conversation ID' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async sendManualMessage(
    @Param('conversationId') conversationId: string,
    @Body(ValidationPipe) createMessageDto: CreateMessageDto,
    @CurrentUser() context: RequestContext,
  ) {
    // Add conversationId to the message data
    const messageData = {
      ...createMessageDto,
      conversationId
    };

    const message = await this.messagesService.create(messageData, context);
    
    return {
      message: 'Manual message sent successfully',
      data: message
    };
  }
}