import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
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

  @Get('users/:platformUserId/profile')
  @ApiOperation({ summary: 'User profile', description: 'All memories, tasks, and conversations for a platform user' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  @ApiParam({ name: 'platformUserId', description: 'Zalo/platform user ID' })
  @UseGuards(JwtAuthGuard)
  async getUserProfile(@Param('platformUserId') platformUserId: string) {
    return this.statsService.getUserProfile(platformUserId);
  }
}
