import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '@hydrabyte/base';
import { QueuesAdminService } from './queues-admin.service';

@ApiTags('queues')
@ApiBearerAuth('JWT-auth')
@Controller('queues')
export class QueuesAdminController {
  constructor(private readonly queuesAdminService: QueuesAdminService) {}

  @Get('status')
  @ApiOperation({ summary: 'Queue status', description: 'Job counts per queue (waiting, active, failed, completed, delayed)' })
  @ApiResponse({ status: 200, description: 'Queue status retrieved successfully' })
  @UseGuards(JwtAuthGuard)
  async getStatus() {
    return this.queuesAdminService.getQueueStatus();
  }

  @Post(':queueName/retry-failed')
  @ApiOperation({ summary: 'Retry failed jobs', description: 'Retry all failed jobs in a specific queue' })
  @ApiResponse({ status: 201, description: 'Failed jobs retried successfully' })
  @ApiParam({ name: 'queueName', description: 'Queue name (e.g. pag-inbound, pag-heartbeat, pag-memory-extract, pag-token-refresh, pag-tasks)' })
  @UseGuards(JwtAuthGuard)
  async retryFailed(@Param('queueName') queueName: string) {
    return this.queuesAdminService.retryFailedJobs(queueName);
  }
}
