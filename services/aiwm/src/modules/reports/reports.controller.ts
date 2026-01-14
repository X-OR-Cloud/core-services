import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser } from '@hydrabyte/base';
import { PredefinedRole, RequestContext } from '@hydrabyte/shared';
import { ReportsService } from './reports.service';

/**
 * Reports Controller
 *
 * Provides aggregated monitoring and reporting data for dashboards.
 * All endpoints require JWT authentication.
 *
 * Endpoints:
 * - GET /reports/overview - Platform overview
 * - GET /reports/system-overview - System infrastructure overview
 * - GET /reports/ai-workload-overview - AI workload overview
 */
@ApiTags('Reports & Monitoring')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Platform Overview
   * High-level metrics for entire AIWM platform
   */
  @Get('overview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get platform overview',
    description:
      'Returns high-level metrics for entire AIWM platform including infrastructure, workload, activity, health, and 30-day usage history for CPU, RAM, Storage, and GPU.',
  })
  @ApiResponse({
    status: 200,
    description: 'Platform overview retrieved successfully',
    schema: {
      example: {
        timestamp: '2025-12-03T10:00:00.000Z',
        infrastructure: {
          nodes: {
            total: 12,
            online: 10,
            offline: 2,
            maintenance: 0,
            byRole: { controller: 2, worker: 8, proxy: 1, storage: 1 },
          },
          resources: {
            total: 45,
            running: 25,
            stopped: 15,
            deploying: 5,
            failed: 0,
          },
          hardware: {
            cpuUtilization: 45.2,
            ramUtilization: 67.5,
            gpuUtilization: 67.8,
            diskUtilization: 62.3,
            gpusActive: 8,
            gpusTotal: 12,
          },
        },
        workload: {
          models: { total: 23, active: 15, inactive: 5, downloading: 3 },
          deployments: { total: 12, running: 10, stopped: 2 },
          agents: { total: 8, active: 5, busy: 2, inactive: 1 },
          executions: { total: 145, completed: 120, running: 15, failed: 10 },
        },
        activity: {
          period: '24h',
          apiRequests: 12500,
          inferenceRequests: 3200,
          agentTasks: 89,
          avgResponseTime: 234,
          successRate: 98.5,
        },
        health: {
          systemHealth: 95,
          alerts: { critical: 0, warning: 2, info: 5 },
          issues: [],
        },
        usageHistory: [
          { date: '2025-11-04', cpu: 34, ram: 45, storage: 38, gpu: 20 },
          { date: '2025-11-05', cpu: 37, ram: 48, storage: 40, gpu: 21 },
          { date: '2025-11-06', cpu: 40, ram: 51, storage: 43, gpu: 23 },
          { date: '2025-11-07', cpu: 43, ram: 56, storage: 47, gpu: 25 },
          { date: '2025-11-08', cpu: 46, ram: 60, storage: 50, gpu: 27 },
          { date: '2025-11-09', cpu: 49, ram: 63, storage: 53, gpu: 28 },
          { date: '2025-11-10', cpu: 52, ram: 67, storage: 56, gpu: 30 },
          '... (30 days total)',
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getOverview(@CurrentUser() context: RequestContext) {
    return this.reportsService.getOverview(context);
  }

  /**
   * Platform Overview (Public - Fixed Organization)
   * Same as /overview but without authentication, for fixed organization
   */
  @Get('overview-7ec5')
  @ApiOperation({
    summary: 'Get platform overview (public endpoint)',
    description:
      'Returns high-level metrics for AIWM platform with fixed organization context. No authentication required.',
  })
  @ApiResponse({
    status: 200,
    description: 'Platform overview retrieved successfully',
  })
  async getOverviewPublic() {
    // Fixed context for organization 692ff5fa3371dad36b287ec5
    const context: RequestContext = {
      orgId: '692ff5fa3371dad36b287ec5',
      groupId: '',
      userId: '',
      agentId: '',
      appId: '',
      roles: [PredefinedRole.OrganizationOwner],
    };
    return this.reportsService.getOverview(context);
  }

  /**
   * System Overview
   * Detailed infrastructure metrics (nodes, services, resources)
   */
  @Get('system-overview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system infrastructure overview',
    description:
      'Returns detailed metrics about nodes, services running on nodes, and resources. Includes node list with hardware utilization.',
  })
  @ApiResponse({
    status: 200,
    description: 'System overview retrieved successfully',
    schema: {
      example: {
        timestamp: '2025-12-03T10:00:00.000Z',
        summary: {
          nodes: {
            total: 12,
            online: 10,
            offline: 2,
            byRole: {
              controller: { total: 2, online: 2 },
              worker: { total: 8, online: 7 },
            },
          },
          resources: {
            total: 45,
            running: 25,
            stopped: 15,
            byType: {
              virtualMachine: 15,
              applicationContainer: 20,
              inferenceContainer: 10,
            },
          },
          utilization: {
            cpu: 45.2,
            ram: 67.5,
            disk: 62.3,
            gpu: 67.8,
            gpusActive: 8,
            gpusTotal: 12,
          },
        },
        nodes: [
          {
            _id: '675a1b2c3d4e5f6a7b8c9d0e',
            name: 'worker-gpu-01',
            role: ['worker'],
            status: 'online',
            websocketConnected: true,
            cpuUsage: 45,
            ramUsage: 128,
            ramTotal: 256,
            gpuCount: 2,
            uptime: 1296000,
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSystemOverview(@CurrentUser() context: RequestContext) {
    return this.reportsService.getSystemOverview(context);
  }

  /**
   * AI Workload Overview
   * Detailed AI workload metrics (models, deployments, agents)
   */
  @Get('ai-workload-overview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get AI workload overview',
    description:
      'Returns detailed metrics about AI models, deployments, agents, and executions. Includes performance statistics.',
  })
  @ApiResponse({
    status: 200,
    description: 'AI workload overview retrieved successfully',
    schema: {
      example: {
        timestamp: '2025-12-03T10:00:00.000Z',
        models: {
          total: 23,
          active: 15,
          inactive: 5,
          downloading: 3,
          byType: { llm: 12, vision: 5, embedding: 4, voice: 2 },
          byDeploymentType: { selfHosted: 15, apiBased: 8 },
        },
        deployments: {
          total: 12,
          running: 10,
          stopped: 2,
          deploying: 0,
          failed: 0,
        },
        agents: {
          total: 8,
          active: 5,
          busy: 2,
          inactive: 1,
          performance: {
            totalTasks: 1245,
            completedTasks: 1189,
            failedTasks: 56,
            successRate: 95.5,
            avgResponseTime: 2300,
          },
        },
        executions: {
          total: 145,
          completed: 120,
          running: 15,
          failed: 10,
          pending: 0,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAIWorkloadOverview(@CurrentUser() context: RequestContext) {
    return this.reportsService.getAIWorkloadOverview(context);
  }
}
