import { Controller, Get, Post, Body, Put, Param, Delete, UseGuards, Query, NotFoundException, HttpCode, HttpStatus, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, PaginationQueryDto, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { ChannelsService } from './channels.service';
import { CreateChannelDto, UpdateChannelDto } from './channels.dto';

@ApiTags('channels')
@ApiBearerAuth('JWT-auth')
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post()
  @ApiOperation({ summary: 'Create channel', description: 'Create a new platform channel' })
  @ApiResponse({ status: 201, description: 'Channel created successfully' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body(ValidationPipe) createChannelDto: CreateChannelDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.channelsService.create(createChannelDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all channels', description: 'Retrieve list of all channels with pagination' })
  @ApiResponse({ status: 200, description: 'Channels retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() paginationQuery: PaginationQueryDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.channelsService.findAll(paginationQuery, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get channel by ID', description: 'Retrieve a single channel by ID' })
  @ApiResponse({ status: 200, description: 'Channel found' })
  @ApiParam({ name: 'id', description: 'Channel ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const channel = await this.channelsService.findById(new Types.ObjectId(id) as any, context);
    if (!channel) {
      throw new NotFoundException(`Channel with ID ${id} not found`);
    }
    return channel;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update channel', description: 'Update channel information' })
  @ApiResponse({ status: 200, description: 'Channel updated successfully' })
  @ApiParam({ name: 'id', description: 'Channel ID' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateChannelDto: UpdateChannelDto,
    @CurrentUser() context: RequestContext,
  ) {
    const updated = await this.channelsService.update(new Types.ObjectId(id) as any, updateChannelDto as any, context);
    if (!updated) {
      throw new NotFoundException(`Channel with ID ${id} not found`);
    }
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete channel', description: 'Soft delete a channel' })
  @ApiResponse({ status: 200, description: 'Channel deleted successfully' })
  @ApiParam({ name: 'id', description: 'Channel ID' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const deleted = await this.channelsService.softDelete(new Types.ObjectId(id) as any, context);
    if (!deleted) {
      throw new NotFoundException(`Channel with ID ${id} not found`);
    }
    return { message: 'Channel deleted successfully' };
  }

  @Post(':id/refresh-token')
  @ApiOperation({ summary: 'Refresh channel token', description: 'Refresh OAuth token for a channel' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiParam({ name: 'id', description: 'Channel ID' })
  @ApiResponse({ status: 400, description: 'Bad request - invalid channel or missing refresh token' })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async refreshToken(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const channel = await this.channelsService.refreshToken(new Types.ObjectId(id) as any, context);
    return {
      message: 'Token refreshed successfully',
      channel: {
        id: (channel as any)._id,
        name: channel.name,
        tokenExpiresAt: channel.credentials?.tokenExpiresAt
      }
    };
  }

  @Post(':id/webhook')
  @ApiOperation({ 
    summary: 'Webhook receiver', 
    description: 'Receive webhook from platform (Zalo, Telegram, etc). No authentication required - verified by webhook secret' 
  })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid webhook signature or payload' })
  @ApiParam({ name: 'id', description: 'Channel ID' })
  @HttpCode(HttpStatus.OK)
  // No @UseGuards(JwtAuthGuard) - webhook verification will be done internally
  async webhook(
    @Param('id') id: string,
    @Body() payload: any,
  ) {
    // TODO: Implement webhook processing logic in Phase 7
    // This will verify webhook signature, parse message, and queue for processing
    
    return {
      message: 'Webhook received successfully',
      channelId: id,
      timestamp: new Date().toISOString()
    };
  }
}