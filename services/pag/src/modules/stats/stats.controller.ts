import { Controller, Get, Put, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '@hydrabyte/base';
import { IsString, IsOptional, IsDateString, IsIn } from 'class-validator';
import { StatsService } from './stats.service';
import { UserPlansService } from '../user-plans/user-plans.service';

class SetUserPlanDto {
  @IsString()
  @IsIn(['mortal', 'immortal', 'god'])
  planSlug: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

@ApiTags('stats')
@ApiBearerAuth('JWT-auth')
@Controller()
export class StatsController {
  constructor(
    private readonly statsService: StatsService,
    private readonly userPlansService: UserPlansService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Overall stats', description: 'Total conversations, messages today, active users, channel status' })
  @ApiResponse({ status: 200, description: 'Stats retrieved successfully' })
  @UseGuards(JwtAuthGuard)
  async getOverallStats() {
    return this.statsService.getOverallStats();
  }

  @Get('users/:platformUserId/profile')
  @ApiOperation({ summary: 'User profile', description: 'All memories, tasks, conversations, and plan for a platform user' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  @ApiParam({ name: 'platformUserId', description: 'Zalo/platform user ID' })
  @UseGuards(JwtAuthGuard)
  async getUserProfile(@Param('platformUserId') platformUserId: string) {
    return this.statsService.getUserProfile(platformUserId);
  }

  @Get('users/:platformUserId/plan')
  @ApiOperation({ summary: 'Get user plan', description: 'Get current plan for a platform user' })
  @ApiResponse({ status: 200, description: 'Plan retrieved successfully' })
  @ApiParam({ name: 'platformUserId', description: 'Zalo/platform user ID' })
  @UseGuards(JwtAuthGuard)
  async getUserPlan(@Param('platformUserId') platformUserId: string) {
    const userPlan = await this.userPlansService.getOrCreate(platformUserId);
    return {
      platformUserId,
      planSlug: userPlan.planSlug,
      expiresAt: userPlan.expiresAt,
      activatedAt: userPlan.activatedAt,
      previousPlanSlug: userPlan.previousPlanSlug,
    };
  }

  @Put('users/:platformUserId/plan')
  @ApiOperation({ summary: 'Set user plan', description: 'Upgrade or change plan for a platform user' })
  @ApiResponse({ status: 200, description: 'Plan updated successfully' })
  @ApiParam({ name: 'platformUserId', description: 'Zalo/platform user ID' })
  @ApiBody({ type: SetUserPlanDto })
  @UseGuards(JwtAuthGuard)
  async setUserPlan(
    @Param('platformUserId') platformUserId: string,
    @Body() body: SetUserPlanDto,
  ) {
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    const userPlan = await this.userPlansService.setPlan(platformUserId, body.planSlug, expiresAt);
    return {
      platformUserId,
      planSlug: userPlan.planSlug,
      expiresAt: userPlan.expiresAt,
      activatedAt: userPlan.activatedAt,
      previousPlanSlug: userPlan.previousPlanSlug,
    };
  }
}
