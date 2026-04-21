import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model as MongooseModel } from 'mongoose';
import { RequestContext } from '@hydrabyte/shared';
import { Node } from '../node/node.schema';
import { Resource } from '../resource/resource.schema';
import { Model } from '../model/model.schema';
import { Deployment } from '../deployment/deployment.schema';
import { Agent } from '../agent/agent.schema';
import { Execution } from '../execution/execution.schema';
import { ConversationService } from '../conversation/conversation.service';
import { ActionService } from '../action/action.service';
import { ActionType } from '../action/action.enum';
import {
  computeFrt,
  computeAvg,
  resolveTimeRange,
  defaultGranularity,
  SLA_FRT_THRESHOLD_MS,
  SLA_UNANSWERED_THRESHOLD_MS,
  SlaAction,
} from '../../core/sla.helper';

/**
 * Reports Service
 *
 * Provides aggregated data for monitoring dashboards and reports.
 * Generates overview reports for:
 * - Platform overview (all metrics)
 * - System overview (nodes, services, resources)
 * - AI Workload overview (models, deployments, agents)
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectModel(Node.name) private readonly nodeModel: MongooseModel<Node>,
    @InjectModel(Resource.name) private readonly resourceModel: MongooseModel<Resource>,
    @InjectModel(Model.name) private readonly modelModel: MongooseModel<Model>,
    @InjectModel(Deployment.name)
    private readonly deploymentModel: MongooseModel<Deployment>,
    @InjectModel(Agent.name) private readonly agentModel: MongooseModel<Agent>,
    @InjectModel(Execution.name)
    private readonly executionModel: MongooseModel<Execution>,
    private readonly conversationService: ConversationService,
    private readonly actionService: ActionService,
  ) {}

  /**
   * GET /reports/overview
   * Platform overview - High-level metrics for entire AIWM platform
   */
  async getOverview(context: RequestContext): Promise<any> {
    this.logger.debug('Generating platform overview report');

    const [
      infrastructure,
      workload,
      activity,
      health,
    ] = await Promise.all([
      this.getInfrastructureMetrics(context),
      this.getWorkloadMetrics(context),
      this.getActivityMetrics(context),
      this.getHealthMetrics(context),
    ]);

    // Generate usage history
    const usageHistory = this.generate30DayUsageHistory();
    const usageHistory60Min = this.generate60MinuteUsageHistory();

    return {
      timestamp: new Date().toISOString(),
      infrastructure,
      workload,
      activity,
      health,
      usageHistory,
      usageHistory60Min,
    };
  }

  /**
   * GET /reports/system-overview
   * System overview - Nodes and services details
   */
  async getSystemOverview(context: RequestContext): Promise<any> {
    this.logger.debug('Generating system overview report');

    // Nodes statistics
    const nodes = await this.nodeModel
      .find({ isDeleted: false, 'owner.orgId': context.orgId })
      .exec();

    const nodesByStatus = this.groupByField(nodes, 'status');
    const nodesByRole = {};

    // Count nodes by role (nodes can have multiple roles)
    nodes.forEach((node) => {
      node.role.forEach((role) => {
        if (!nodesByRole[role]) {
          nodesByRole[role] = { total: 0, online: 0 };
        }
        nodesByRole[role].total++;
        if (node.status === 'online') {
          nodesByRole[role].online++;
        }
      });
    });

    // Calculate resource utilization averages
    const onlineNodes = nodes.filter((n) => n.status === 'online');
    const cpuUtilization = this.calculateAverage(
      onlineNodes.map((n) => n.cpuUsage || 0)
    );
    const ramUtilization = this.calculateAverage(
      onlineNodes.map((n) =>
        n.ramTotal && n.ramFree
          ? ((n.ramTotal - n.ramFree) / n.ramTotal) * 100
          : 0
      )
    );
    const diskUtilization = 0; // Disk usage not tracked in schema

    // GPU statistics
    let totalGpus = 0;
    let activeGpus = 0;
    let totalGpuUtilization = 0;
    let gpuCount = 0;

    onlineNodes.forEach((node) => {
      if (node.gpuDevices && node.gpuDevices.length > 0) {
        totalGpus += node.gpuDevices.length;
        node.gpuDevices.forEach((gpu: any) => {
          if (gpu.utilization > 10) {
            // Consider GPU active if utilization > 10%
            activeGpus++;
          }
          totalGpuUtilization += gpu.utilization || 0;
          gpuCount++;
        });
      }
    });

    const gpuUtilization = gpuCount > 0 ? totalGpuUtilization / gpuCount : 0;

    // Resources statistics
    const resources = await this.resourceModel
      .find({ isDeleted: false, 'owner.orgId': context.orgId })
      .exec();

    const resourcesByStatus = this.groupByField(resources, 'status');
    const resourcesByType = this.groupByField(resources, 'resourceType');

    // Node list với basic info
    const nodesList = nodes.map((node) => ({
      _id: node._id,
      name: node.name,
      role: node.role,
      status: node.status,
      lastHeartbeat: node.lastHeartbeat,
      cpuUsage: node.cpuUsage,
      ramUsage:
        node.ramTotal && node.ramFree ? node.ramTotal - node.ramFree : undefined,
      ramTotal: node.ramTotal,
      diskTotal: node.diskTotal,
      gpuCount: node.gpuDevices?.length || 0,
      uptime: node.uptimeSeconds,
    }));

    return {
      timestamp: new Date().toISOString(),
      summary: {
        nodes: {
          total: nodes.length,
          online: nodesByStatus['online'] || 0,
          offline: nodesByStatus['offline'] || 0,
          maintenance: nodesByStatus['maintenance'] || 0,
          byRole: nodesByRole,
        },
        resources: {
          total: resources.length,
          running: resourcesByStatus['running'] || 0,
          stopped: resourcesByStatus['stopped'] || 0,
          deploying: resourcesByStatus['deploying'] || 0,
          failed: resourcesByStatus['failed'] || 0,
          byType: {
            virtualMachine: resourcesByType['virtual-machine'] || 0,
            applicationContainer: resourcesByType['application-container'] || 0,
            inferenceContainer: resourcesByType['inference-container'] || 0,
          },
        },
        utilization: {
          cpu: Math.round(cpuUtilization * 10) / 10,
          ram: Math.round(ramUtilization * 10) / 10,
          disk: Math.round(diskUtilization * 10) / 10,
          gpu: Math.round(gpuUtilization * 10) / 10,
          gpusActive: activeGpus,
          gpusTotal: totalGpus,
        },
      },
      nodes: nodesList,
    };
  }

  /**
   * GET /reports/ai-workload-overview
   * AI Workload overview - Models, deployments, agents
   */
  async getAIWorkloadOverview(context: RequestContext): Promise<any> {
    this.logger.debug('Generating AI workload overview report');

    // Models statistics
    const models = await this.modelModel
      .find({ isDeleted: false, 'owner.orgId': context.orgId })
      .exec();

    const modelsByStatus = this.groupByField(models, 'status');
    const modelsByType = this.groupByField(models, 'type');
    const modelsByDeploymentType = this.groupByField(
      models,
      'deploymentType'
    );

    // Deployments statistics
    const deployments = await this.deploymentModel
      .find({ isDeleted: false, 'owner.orgId': context.orgId })
      .exec();

    const deploymentsByStatus = this.groupByField(deployments, 'status');

    // Agents statistics
    const agents = await this.agentModel
      .find({ isDeleted: false, 'owner.orgId': context.orgId })
      .exec();

    const agentsByStatus = this.groupByField(agents, 'status');

    // Note: Agent performance metrics removed in MVP simplification
    // Performance tracking moved to Execution entities

    // Executions statistics
    const executions = await this.executionModel
      .find({ isDeleted: false, 'owner.orgId': context.orgId })
      .exec();

    const executionsByStatus = this.groupByField(executions, 'status');

    return {
      timestamp: new Date().toISOString(),
      models: {
        total: models.length,
        active: modelsByStatus['active'] || 0,
        inactive: modelsByStatus['inactive'] || 0,
        downloading: modelsByStatus['downloading'] || 0,
        failed:
          (modelsByStatus['download-failed'] || 0) +
          (modelsByStatus['deploy-failed'] || 0) +
          (modelsByStatus['error'] || 0),
        byType: {
          llm: modelsByType['llm'] || 0,
          vision: modelsByType['vision'] || 0,
          embedding: modelsByType['embedding'] || 0,
          voice: modelsByType['voice'] || 0,
        },
        byDeploymentType: {
          selfHosted: modelsByDeploymentType['self-hosted'] || 0,
          apiBased: modelsByDeploymentType['api-based'] || 0,
        },
      },
      deployments: {
        total: deployments.length,
        running: deploymentsByStatus['running'] || 0,
        stopped: deploymentsByStatus['stopped'] || 0,
        deploying: deploymentsByStatus['deploying'] || 0,
        failed:
          (deploymentsByStatus['failed'] || 0) +
          (deploymentsByStatus['error'] || 0),
      },
      agents: {
        total: agents.length,
        active: agentsByStatus['active'] || 0,
        busy: agentsByStatus['busy'] || 0,
        inactive: agentsByStatus['inactive'] || 0,
      },
      executions: {
        total: executions.length,
        completed: executionsByStatus['completed'] || 0,
        running: executionsByStatus['running'] || 0,
        failed: executionsByStatus['failed'] || 0,
        pending:
          (executionsByStatus['pending'] || 0) +
          (executionsByStatus['queued'] || 0),
      },
    };
  }

  // =========================================================================
  // Private Helper Methods
  // =========================================================================

  private async getInfrastructureMetrics(
    context: RequestContext
  ): Promise<any> {
    const nodes = await this.nodeModel
      .find({ isDeleted: false, 'owner.orgId': context.orgId })
      .exec();

    const resources = await this.resourceModel
      .find({ isDeleted: false, 'owner.orgId': context.orgId })
      .exec();

    const nodesByStatus = this.groupByField(nodes, 'status');
    const resourcesByStatus = this.groupByField(resources, 'status');
    const resourcesByType = this.groupByField(resources, 'resourceType');

    // Role counting
    const nodesByRole = {};
    nodes.forEach((node) => {
      node.role.forEach((role) => {
        nodesByRole[role] = (nodesByRole[role] || 0) + 1;
      });
    });

    // Hardware utilization
    const onlineNodes = nodes.filter((n) => n.status === 'online');
    const cpuUtilization = this.calculateAverage(
      onlineNodes.map((n) => n.cpuUsage || 0)
    );
    const ramUtilization = this.calculateAverage(
      onlineNodes.map((n) =>
        n.ramTotal && n.ramFree
          ? ((n.ramTotal - n.ramFree) / n.ramTotal) * 100
          : 0
      )
    );
    const diskUtilization = 0; // Disk usage not tracked in schema

    let totalGpus = 0;
    let activeGpus = 0;
    let totalGpuUtilization = 0;
    let gpuCount = 0;

    onlineNodes.forEach((node) => {
      if (node.gpuDevices && node.gpuDevices.length > 0) {
        totalGpus += node.gpuDevices.length;
        node.gpuDevices.forEach((gpu: any) => {
          if (gpu.utilization > 10) activeGpus++;
          totalGpuUtilization += gpu.utilization || 0;
          gpuCount++;
        });
      }
    });

    const gpuUtilization = gpuCount > 0 ? totalGpuUtilization / gpuCount : 0;

    return {
      nodes: {
        total: nodes.length,
        online: nodesByStatus['online'] || 0,
        offline: nodesByStatus['offline'] || 0,
        maintenance: nodesByStatus['maintenance'] || 0,
        byRole: nodesByRole,
      },
      resources: {
        total: resources.length,
        running: resourcesByStatus['running'] || 0,
        stopped: resourcesByStatus['stopped'] || 0,
        deploying: resourcesByStatus['deploying'] || 0,
        failed: resourcesByStatus['failed'] || 0,
        byType: {
          vm: resourcesByType['virtual-machine'] || 0,
          appContainer: resourcesByType['application-container'] || 0,
          inferenceContainer: resourcesByType['inference-container'] || 0,
        },
      },
      hardware: {
        cpuUtilization: Math.round(cpuUtilization * 10) / 10,
        ramUtilization: Math.round(ramUtilization * 10) / 10,
        gpuUtilization: Math.round(gpuUtilization * 10) / 10,
        diskUtilization: Math.round(diskUtilization * 10) / 10,
        gpusActive: activeGpus,
        gpusTotal: totalGpus,
      },
    };
  }

  private async getWorkloadMetrics(context: RequestContext): Promise<any> {
    const [models, deployments, agents, executions] = await Promise.all([
      this.modelModel
        .find({ isDeleted: false, 'owner.orgId': context.orgId })
        .exec(),
      this.deploymentModel
        .find({ isDeleted: false, 'owner.orgId': context.orgId })
        .exec(),
      this.agentModel
        .find({ isDeleted: false, 'owner.orgId': context.orgId })
        .exec(),
      this.executionModel
        .find({ isDeleted: false, 'owner.orgId': context.orgId })
        .exec(),
    ]);

    const modelsByStatus = this.groupByField(models, 'status');
    const modelsByType = this.groupByField(models, 'type');
    const deploymentsByStatus = this.groupByField(deployments, 'status');
    const agentsByStatus = this.groupByField(agents, 'status');
    const executionsByStatus = this.groupByField(executions, 'status');

    return {
      models: {
        total: models.length,
        active: modelsByStatus['active'] || 0,
        inactive: modelsByStatus['inactive'] || 0,
        downloading: modelsByStatus['downloading'] || 0,
        byType: {
          llm: modelsByType['llm'] || 0,
          vision: modelsByType['vision'] || 0,
          embedding: modelsByType['embedding'] || 0,
          voice: modelsByType['voice'] || 0,
        },
      },
      deployments: {
        total: deployments.length,
        running: deploymentsByStatus['running'] || 0,
        stopped: deploymentsByStatus['stopped'] || 0,
        deploying: deploymentsByStatus['deploying'] || 0,
        failed: deploymentsByStatus['failed'] || 0,
      },
      agents: {
        total: agents.length,
        active: agentsByStatus['active'] || 0,
        busy: agentsByStatus['busy'] || 0,
        inactive: agentsByStatus['inactive'] || 0,
      },
      executions: {
        total: executions.length,
        completed: executionsByStatus['completed'] || 0,
        running: executionsByStatus['running'] || 0,
        failed: executionsByStatus['failed'] || 0,
      },
    };
  }

  private async getActivityMetrics(context: RequestContext): Promise<any> {
    // TODO: In future, collect actual API metrics from logs/monitoring
    // For now, return placeholder data
    return {
      period: '24h',
      apiRequests: 0,
      inferenceRequests: 0,
      agentTasks: 0,
      avgResponseTime: 0,
      successRate: 100,
    };
  }

  private async getHealthMetrics(context: RequestContext): Promise<any> {
    const nodes = await this.nodeModel
      .find({ isDeleted: false, 'owner.orgId': context.orgId })
      .exec();

    const issues = [];

    // Check nodes for issues
    nodes.forEach((node) => {
      // Check if node is offline
      if (node.status === 'offline') {
        issues.push({
          severity: 'warning',
          type: 'node.offline',
          message: `Node ${node.name} is offline`,
          nodeId: node._id,
        });
      }

      // Check GPU temperature
      if (node.gpuDevices && node.gpuDevices.length > 0) {
        node.gpuDevices.forEach((gpu: any, index: number) => {
          if (gpu.temperature > 80) {
            issues.push({
              severity: 'warning',
              type: 'node.gpu.temperature',
              message: `Node ${node.name} GPU-${index} temperature high (${gpu.temperature}°C)`,
              nodeId: node._id,
            });
          }
        });
      }

      // Note: Disk usage check removed - diskUsage field not tracked in schema
    });

    const criticalIssues = issues.filter((i) => i.severity === 'critical');
    const warningIssues = issues.filter((i) => i.severity === 'warning');

    // Calculate system health (100 - issues impact)
    const systemHealth = Math.max(
      0,
      100 - criticalIssues.length * 10 - warningIssues.length * 2
    );

    return {
      systemHealth,
      alerts: {
        critical: criticalIssues.length,
        warning: warningIssues.length,
        info: 0,
      },
      issues,
    };
  }

  private groupByField(items: any[], field: string): Record<string, number> {
    return items.reduce((acc, item) => {
      const value = item[field];
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  }

  /**
   * Generate fixed 30-day usage history
   * Returns consistent data based on baseline values with controlled variation
   * Each metric uses different seed and oscillation pattern for realistic variation
   */
  private generate30DayUsageHistory(): any {
    const baselineData = {
      cpu: 43, // 43% baseline
      ram: 56, // 56% baseline
      storage: 47, // 47% baseline
      gpu: 25, // 25% baseline (light workload)
    };

    const history = [];
    const now = new Date();

    // Generate data for 30 days (from oldest to newest)
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);

      // Use different seeds for each metric to create independent variations
      const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);

      // CPU: Fast oscillation (daily pattern)
      const cpuSeed = (dayOfYear * 7 + date.getDate() * 3) % 100;
      const cpuVariation = Math.sin(cpuSeed * 0.314) * 0.20; // -20% to +20%

      // RAM: Slow oscillation (weekly pattern)
      const ramSeed = (dayOfYear * 3 + date.getMonth() * 5) % 100;
      const ramVariation = Math.cos(ramSeed * 0.157) * 0.18; // -18% to +18%

      // Storage: Very slow growth (monthly trend)
      const storageSeed = (dayOfYear * 2) % 100;
      const storageVariation = (Math.sin(storageSeed * 0.063) * 0.12) + (i * 0.001); // -12% to +12% + slight growth

      // GPU: Random spikes (irregular pattern)
      const gpuSeed = (dayOfYear * 11 + date.getDate() * 7) % 100;
      const gpuVariation = Math.sin(gpuSeed * 0.628) * Math.cos(gpuSeed * 0.157) * 0.25; // -25% to +25% irregular

      // Calculate values with independent variations
      const cpu = Math.max(5, Math.min(95, Math.round(baselineData.cpu * (1 + cpuVariation))));
      const ram = Math.max(5, Math.min(95, Math.round(baselineData.ram * (1 + ramVariation))));
      const storage = Math.max(5, Math.min(95, Math.round(baselineData.storage * (1 + storageVariation))));
      const gpu = Math.max(5, Math.min(95, Math.round(baselineData.gpu * (1 + gpuVariation))));

      history.push({
        date: date.toISOString().split('T')[0], // YYYY-MM-DD format
        cpu,
        ram,
        storage,
        gpu,
      });
    }

    return history;
  }

  /**
   * Generate fixed 60-minute usage history
   * Returns consistent data based on baseline values with minute-level variation
   * Each metric uses different seed and oscillation pattern for realistic variation
   */
  private generate60MinuteUsageHistory(): any {
    const baselineData = {
      cpu: 43, // 43% baseline
      ram: 56, // 56% baseline
      storage: 47, // 47% baseline
      gpu: 25, // 25% baseline (light workload)
    };

    const history = [];
    const now = new Date();

    // Generate data for 60 minutes (from oldest to newest)
    for (let i = 59; i >= 0; i--) {
      const time = new Date(now);
      time.setMinutes(time.getMinutes() - i);

      // Use minute-based seeds for each metric
      const minuteOfDay = time.getHours() * 60 + time.getMinutes();
      const dayOfYear = Math.floor((time.getTime() - new Date(time.getFullYear(), 0, 0).getTime()) / 86400000);

      // CPU: High frequency micro-fluctuations (per minute spikes)
      const cpuSeed = (minuteOfDay * 7 + dayOfYear * 3) % 1000;
      const cpuVariation = Math.sin(cpuSeed * 0.0628) * 0.15 + Math.sin(cpuSeed * 0.251) * 0.08; // Combined waves

      // RAM: More stable with gradual changes
      const ramSeed = (minuteOfDay * 2 + dayOfYear * 5) % 1000;
      const ramVariation = Math.cos(ramSeed * 0.0314) * 0.10; // Slower variation for RAM

      // Storage: Very stable, minimal changes per minute
      const storageSeed = (minuteOfDay + dayOfYear * 2) % 1000;
      const storageVariation = Math.sin(storageSeed * 0.0126) * 0.05; // Very small variation

      // GPU: Bursty pattern with occasional spikes
      const gpuSeed = (minuteOfDay * 11 + dayOfYear * 7) % 1000;
      const gpuBase = Math.sin(gpuSeed * 0.0942) * 0.20;
      const gpuSpike = (gpuSeed % 17 === 0) ? 0.15 : 0; // Occasional spikes
      const gpuVariation = gpuBase + gpuSpike;

      // Calculate values with independent variations
      const cpu = Math.max(5, Math.min(95, Math.round(baselineData.cpu * (1 + cpuVariation))));
      const ram = Math.max(5, Math.min(95, Math.round(baselineData.ram * (1 + ramVariation))));
      const storage = Math.max(5, Math.min(95, Math.round(baselineData.storage * (1 + storageVariation))));
      const gpu = Math.max(5, Math.min(95, Math.round(baselineData.gpu * (1 + gpuVariation))));

      history.push({
        time: time.toISOString(), // Full ISO timestamp
        cpu,
        ram,
        storage,
        gpu,
      });
    }

    return history;
  }

  async getAgentSlaReport(
    agentIds: string[] | undefined,
    preset: string | undefined,
    from: string | undefined,
    to: string | undefined,
    context: RequestContext,
  ): Promise<Record<string, unknown>> {
    const timeRange = resolveTimeRange(preset, from, to);
    const now = Date.now();

    const agentFilter: Record<string, unknown> = { isDeleted: false, 'owner.orgId': context.orgId };
    if (agentIds && agentIds.length > 0) agentFilter['_id'] = { $in: agentIds };
    const agents = await this.agentModel.find(agentFilter).lean().exec() as any[];

    const alerts: Record<string, unknown>[] = [];
    let onlineCount = 0;
    let totalConversations = 0;
    let activeConversations = 0;
    const allFrtValues: number[] = [];
    let totalSlaBreaches = 0;

    const agentBreakdown = await Promise.all(
      agents.map(async (agent: any) => {
        const agentId = String(agent._id);
        const heartbeatAgeMs = agent.lastHeartbeatAt
          ? now - new Date(agent.lastHeartbeatAt).getTime()
          : null;
        const isOnline = heartbeatAgeMs !== null && heartbeatAgeMs < 60_000;

        if (isOnline) onlineCount++;
        else {
          alerts.push({
            type: 'agent_offline',
            severity: 'error',
            agentId,
            detail: heartbeatAgeMs !== null
              ? `No heartbeat for ${Math.round(heartbeatAgeMs / 1000)} seconds`
              : 'Agent has never sent a heartbeat',
            since: agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt).toISOString() : null,
          });
        }

        // Conversations in period
        const convs = await (this.conversationService as any).model
          .find({
            agentId,
            isDeleted: false,
            createdAt: { $gte: timeRange.from, $lte: timeRange.to },
          })
          .lean()
          .exec() as any[];

        // All active conversations (regardless of period) for unanswered detection
        const activeConvs = await (this.conversationService as any).model
          .find({ agentId, isDeleted: false, status: 'active' })
          .lean()
          .exec() as any[];

        totalConversations += convs.length;
        activeConversations += activeConvs.length;

        // Unanswered detection
        let unansweredCount = 0;
        for (const conv of activeConvs) {
          const lastMsg = conv.lastMessage;
          if (lastMsg?.role === 'user') {
            const unansweredMs = now - new Date(lastMsg.createdAt).getTime();
            if (unansweredMs > SLA_UNANSWERED_THRESHOLD_MS) {
              unansweredCount++;
              alerts.push({
                type: 'unanswered',
                severity: 'warning',
                agentId,
                conversationId: String(conv._id),
                detail: `User message unanswered for ${Math.round(unansweredMs / 1000)} seconds`,
                since: new Date(lastMsg.createdAt).toISOString(),
              });
            }
          }
        }

        // Compute FRT for period conversations
        const convIds = convs.map((c: any) => String(c._id));
        const allActions = convIds.length > 0
          ? await (this.actionService as any).model
              .find({ conversationId: { $in: convIds }, isDeleted: false, type: ActionType.MESSAGE })
              .sort({ createdAt: 1 })
              .lean()
              .exec() as any[]
          : [];

        const actionsByConv = new Map<string, any[]>();
        for (const a of allActions) {
          const cid = String(a.conversationId);
          if (!actionsByConv.has(cid)) actionsByConv.set(cid, []);
          actionsByConv.get(cid)!.push(a);
        }

        const frtValues: number[] = [];
        let agentSlaBreaches = 0;

        for (const conv of convs) {
          const actions = actionsByConv.get(String(conv._id)) ?? [];
          const slaActions: SlaAction[] = actions.map((a: any) => ({
            type: a.type,
            actor: { role: a.actor?.role },
            createdAt: new Date(a.createdAt),
          }));
          const frt = computeFrt(slaActions);
          if (frt.ms !== null) {
            frtValues.push(frt.ms);
            allFrtValues.push(frt.ms);
            if (frt.slaBreached) agentSlaBreaches++;
          }
        }

        totalSlaBreaches += agentSlaBreaches;

        const agentTotal = convs.length;
        return {
          agentId,
          name: agent.name,
          isOnline,
          totalConversations: agentTotal,
          activeConversations: activeConvs.length,
          slaBreachRate: agentTotal > 0 ? Math.round((agentSlaBreaches / agentTotal) * 1000) / 10 : 0,
          avgFrtMs: computeAvg(frtValues),
          unansweredCount,
        };
      }),
    );

    const overallTotal = totalConversations;
    const overallSlaBreachRate = overallTotal > 0
      ? Math.round((totalSlaBreaches / overallTotal) * 1000) / 10
      : 0;

    return {
      generatedAt: new Date().toISOString(),
      period: { from: timeRange.from, to: timeRange.to, preset: timeRange.preset },
      slaThresholdMs: SLA_FRT_THRESHOLD_MS,
      unansweredThresholdSeconds: SLA_UNANSWERED_THRESHOLD_MS / 1000,
      overview: {
        totalAgents: agents.length,
        onlineAgents: onlineCount,
        totalConversations,
        activeConversations,
        overallSlaBreachRate,
        overallAvgFrtMs: computeAvg(allFrtValues),
      },
      alerts,
      agentBreakdown,
    };
  }
}
