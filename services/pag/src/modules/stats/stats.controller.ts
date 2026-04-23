import { Controller, Get, Put, Param, Body, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '@hydrabyte/base';
import { IsString, IsOptional, IsDateString, IsIn } from 'class-validator';
import axios from 'axios';
import { StatsService } from './stats.service';
import { UserPlansService } from '../user-plans/user-plans.service';

const PLAN_RANK: Record<string, number> = { mortal: 1, immortal: 2, god: 3 };
const PLAN_LABEL: Record<string, string> = { mortal: 'Mortal', immortal: 'Immortal', god: 'God' };

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
  private readonly logger = new Logger(StatsController.name);

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

    // Get current plan before changing
    const currentPlan = await this.userPlansService.getOrCreate(platformUserId);
    const oldSlug = currentPlan.planSlug;
    const newSlug = body.planSlug;

    const userPlan = await this.userPlansService.setPlan(platformUserId, newSlug, expiresAt);

    // Send notifications if plan actually changed
    if (oldSlug !== newSlug) {
      const oldRank = PLAN_RANK[oldSlug] ?? 0;
      const newRank = PLAN_RANK[newSlug] ?? 0;
      const oldLabel = PLAN_LABEL[oldSlug] || oldSlug;
      const newLabel = PLAN_LABEL[newSlug] || newSlug;
      const isUpgrade = newRank > oldRank;

      let zaloMsg: string;
      if (isUpgrade) {
        const expiryStr = expiresAt
          ? expiresAt.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })
          : 'không giới hạn';
        zaloMsg = `🎉 Tài khoản của bạn đã được nâng lên gói ${newLabel}!\nHạn sử dụng: ${expiryStr}.\nCảm ơn bạn đã ủng hộ nhé!`;
      } else {
        zaloMsg = `📢 Gói của bạn đã được chuyển từ ${oldLabel} sang ${newLabel}.\nQuota mới sẽ áp dụng từ hôm nay.`;
      }

      // Fire-and-forget notifications (don't block response)
      this.statsService.sendZaloPlanNotification(platformUserId, zaloMsg).catch((err) =>
        this.logger.error(`Failed to send Zalo plan notification: ${err.message}`),
      );

      const discordUrl = process.env['PAG_DISCORD_WEBHOOK_URL'];
      if (discordUrl) {
        const direction = isUpgrade ? '⬆️ upgrade' : '⬇️ downgrade';
        axios
          .post(discordUrl, { content: `Plan ${direction}: user \`${platformUserId}\` **${oldLabel}** → **${newLabel}**` }, { timeout: 5000 })
          .catch((err) => this.logger.warn(`Discord webhook failed: ${err.message}`));
      }
    }

    return {
      platformUserId,
      planSlug: userPlan.planSlug,
      expiresAt: userPlan.expiresAt,
      activatedAt: userPlan.activatedAt,
      previousPlanSlug: userPlan.previousPlanSlug,
    };
  }
}
