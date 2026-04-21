import { Controller, Get, Param, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '@hydrabyte/base';
import { StatsService } from './stats.service';

@ApiTags('stats')
@ApiBearerAuth('JWT-auth')
@Controller()
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Overall stats', description: 'Total conversations, messages today, active users, channel status' })
  @ApiResponse({ status: 200, description: 'Stats retrieved successfully' })
  @UseGuards(JwtAuthGuard)
  async getOverallStats() {
    return this.statsService.getOverallStats();
  }

  @Get('conversations/unanswered')
  @ApiOperation({ summary: 'Unanswered conversations', description: 'Conversations where the last message is from user (no assistant reply yet)' })
  @ApiResponse({ status: 200, description: 'Unanswered conversations retrieved' })
  @ApiQuery({ name: 'sinceHours', required: false, description: 'Look back window in hours', example: 24 })
  @UseGuards(JwtAuthGuard)
  async getUnanswered(
    @Query('sinceHours', new DefaultValuePipe(24), ParseIntPipe) sinceHours: number,
  ) {
    return this.statsService.getUnansweredConversations(sinceHours);
  }

  @Get('users/:platformUserId/profile')
  @ApiOperation({ summary: 'User profile', description: 'All memories, tasks, and conversations for a platform user' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  @ApiParam({ name: 'platformUserId', description: 'Zalo/platform user ID' })
  @UseGuards(JwtAuthGuard)
  async getUserProfile(@Param('platformUserId') platformUserId: string) {
    return this.statsService.getUserProfile(platformUserId);
  }
}
