import { Controller, Get, Post, Body, Param, UseGuards, Query, ValidationPipe, DefaultValuePipe, ParseIntPipe, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsEnum } from 'class-validator';
import { JwtAuthGuard, CurrentUser, ApiCreateErrors, ApiReadErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { MessagesService } from './messages.service';
import { ChannelsService } from '../channels/channels.service';
import { Conversation } from '../conversations/conversations.schema';
import axios from 'axios';

class SendMessageDto {
  @ApiPropertyOptional({ description: 'Role', enum: ['user', 'assistant', 'system'], default: 'assistant' })
  @IsOptional()
  @IsEnum(['user', 'assistant', 'system'])
  role?: string;

  @ApiProperty({ description: 'Message content' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: 'Also deliver to user via channel (Zalo OA API)', default: false })
  @IsOptional()
  @IsBoolean()
  sendToChannel?: boolean;
}

@ApiTags('messages')
@ApiBearerAuth('JWT-auth')
@Controller('conversations/:conversationId/messages')
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly channelsService: ChannelsService,
    @InjectModel(Conversation.name) private readonly conversationModel: Model<Conversation>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Compact message history', description: 'Returns role, content, at — optimized for agent/LLM consumption' })
  @ApiResponse({ status: 200, description: 'Messages retrieved' })
  @ApiParam({ name: 'conversationId', description: 'Conversation ID' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async getHistory(
    @Param('conversationId') conversationId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const messages = await this.messagesService.getCompactHistory(conversationId, limit);
    return { conversationId, total: messages.length, messages };
  }

  @Post()
  @ApiOperation({ summary: 'Send message to conversation', description: 'Save to DB and optionally deliver to user via Zalo OA' })
  @ApiResponse({ status: 201, description: 'Message sent' })
  @ApiParam({ name: 'conversationId', description: 'Conversation ID' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async sendMessage(
    @Param('conversationId') conversationId: string,
    @Body(ValidationPipe) dto: SendMessageDto,
    @CurrentUser() context: RequestContext,
  ) {
    await this.messagesService.create({
      conversationId,
      role: dto.role || 'assistant',
      content: dto.content,
    } as any, context);

    if (!dto.sendToChannel) {
      return { saved: true, channelDelivered: false };
    }

    const conversation = await this.conversationModel
      .findOne({ _id: conversationId, isDeleted: false })
      .select('channelId platformUser')
      .exec();

    if (!conversation) throw new BadRequestException('Conversation not found');

    const channel = await this.channelsService.findById(
      new Types.ObjectId(conversation.channelId) as any,
      { orgId: '', groupId: '', userId: 'system', agentId: '', appId: '', roles: ['universe.owner' as any] },
    );

    if (!channel?.credentials?.accessToken) {
      throw new BadRequestException('Channel missing access token');
    }

    const response = await axios.post(
      'https://openapi.zalo.me/v3.0/oa/message/cs',
      { recipient: { user_id: conversation.platformUser.id }, message: { text: dto.content } },
      { headers: { 'access_token': channel.credentials.accessToken, 'Content-Type': 'application/json' }, timeout: 10000 },
    );

    const ok = response.data.error === 0;
    return {
      saved: true,
      channelDelivered: ok,
      ...(ok ? {} : { channelError: response.data.message }),
    };
  }
}
