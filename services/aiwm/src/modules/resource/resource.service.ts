import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Resource } from './resource.schema';
import { ResourceStatus } from './enums';

/**
 * Resource Service
 * V1: CRUD operations + mock responses for lifecycle/monitoring actions
 * V2: Integration with worker for actual deployment
 */
@Injectable()
export class ResourceService extends BaseService<Resource> {
  constructor(@InjectModel(Resource.name) model: Model<Resource>) {
    super(model);
  }

  /**
   * Override findAll to include statistics by status
   */
  async findAll(options: FindManyOptions, context: RequestContext): Promise<FindManyResult<Resource>> {
    if(options.filter){
      // Support filtering by 'container' to get all container types
      if(options.filter.type === 'container'){
        options.filter.type = { $in: ['application-container','inference-container','system-container'] };
      }
    }
    const findResult = await super.findAll(options, context);

    // Aggregate statistics by status
    const statusStats = await super.aggregate([
      { $match: { ...options.filter } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ], context);

    // Aggregate statistics by type (changed from resourceType)
    const typeStats = await super.aggregate([
      { $match: { ...options.filter } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ], context);

    // Build statistics object
    const statistics: any = {
      total: findResult.pagination.total,
      byStatus: {},
      byType: {},
    };

    // Map status statistics
    statusStats.forEach((stat: any) => {
      statistics.byStatus[stat._id] = stat.count;
    });

    // Map resource type statistics
    typeStats.forEach((stat: any) => {
      statistics.byType[stat._id] = stat.count;
    });

    // Ensure all status enums are present (with 0 if not found)
    Object.values(ResourceStatus).forEach((status) => {
      if (!(status in statistics.byStatus)) {
        statistics.byStatus[status] = 0;
      }
    });

    findResult.statistics = statistics;
    return findResult;
  }

  // V1: Mock response methods for lifecycle actions
  // These will be replaced with actual worker communication in V2

  /**
   * Generate mock success response for lifecycle actions
   */
  private mockActionResponse(resourceId: string, action: string) {
    return {
      success: true,
      message: `${action.charAt(0).toUpperCase() + action.slice(1)} requested`,
      resourceId,
      action,
      timestamp: new Date().toISOString(),
      note: `V1: Mock response. Actual ${action} will be implemented in V2.`,
    };
  }

  /**
   * Start resource (V1: Mock response)
   */
  async start(resourceId: string) {
    // V1: Just return mock response
    // V2: Send command to worker via WebSocket
    // TODO: V2 - Implement worker communication
    return this.mockActionResponse(resourceId, 'start');
  }

  /**
   * Stop resource (V1: Mock response)
   */
  async stop(resourceId: string) {
    // V1: Just return mock response
    // V2: Send command to worker via WebSocket
    // TODO: V2 - Implement worker communication
    return this.mockActionResponse(resourceId, 'stop');
  }

  /**
   * Restart resource (V1: Mock response)
   */
  async restart(resourceId: string) {
    // V1: Just return mock response
    // V2: Send command to worker via WebSocket
    // TODO: V2 - Implement worker communication
    return this.mockActionResponse(resourceId, 'restart');
  }

  /**
   * Get resource status (V1: Mock data based on DB status)
   */
  async getStatus(resourceId: string) {
    const resource = await this.model.findById(resourceId);
    if (!resource) {
      throw new Error('Resource not found');
    }

    // V1: Return mock status based on DB status field
    // V2: Get real-time status from worker
    // TODO: V2 - Implement real status from worker
    return {
      resourceId,
      status: resource.status,
      deployment: resource.deployment || null,
      lastHealthCheck: resource.lastHealthCheck || null,
      lastMetricsAt: resource.lastMetricsAt || null,
      restartCount: resource.restartCount || 0,
      note: 'V1: Status from DB. Real-time status from worker will be implemented in V2.',
    };
  }

  /**
   * Get resource logs (V1: Mock logs)
   */
  async getLogs(resourceId: string) {
    const resource = await this.model.findById(resourceId);
    if (!resource) {
      throw new Error('Resource not found');
    }

    // V1: Return mock logs
    // V2: Stream actual logs from worker
    // TODO: V2 - Implement real log streaming from libvirt/docker
    const mockLogs = [
      {
        timestamp: new Date(Date.now() - 60000).toISOString(),
        level: 'info',
        message: `[Mock] ${resource.name} initializing...`,
      },
      {
        timestamp: new Date(Date.now() - 45000).toISOString(),
        level: 'info',
        message: `[Mock] Allocating resources (${resource.type})...`,
      },
      {
        timestamp: new Date(Date.now() - 30000).toISOString(),
        level: 'info',
        message: `[Mock] ${resource.name} ready`,
      },
    ];

    if (resource.type === 'virtual-machine') {
      const deployment = resource.deployment as any;
      mockLogs.push({
        timestamp: new Date(Date.now() - 15000).toISOString(),
        level: 'info',
        message: `[Mock] SSH available at ${deployment?.sshEndpoint || deployment?.endpoint || 'pending'}`,
      });
    }

    return {
      resourceId,
      logs: mockLogs,
      note: 'V1: Mock logs. Actual logs from libvirt/docker will be implemented in V2.',
    };
  }

  /**
   * Get resource metrics (V1: Mock metrics)
   */
  async getMetrics(resourceId: string) {
    const resource = await this.model.findById(resourceId);
    if (!resource) {
      throw new Error('Resource not found');
    }

    // V1: Return mock metrics
    // V2: Get real metrics from worker
    // TODO: V2 - Implement real metrics from libvirt/docker
    const config: any = resource.config;

    return {
      resourceId,
      timestamp: new Date().toISOString(),
      metrics: {
        cpu: {
          cores: config.vcpus || config.cpuCores || 4,
          usagePercent: Math.random() * 80 + 10, // 10-90%
        },
        memory: {
          totalMB: config.ramMB || (config.ramLimit || 8) * 1024,
          usedMB: Math.floor((config.ramMB || (config.ramLimit || 8) * 1024) * (Math.random() * 0.6 + 0.2)),
          usagePercent: Math.random() * 60 + 20, // 20-80%
        },
        disk: {
          totalGB: config.diskGB || 50,
          usedGB: Math.floor((config.diskGB || 50) * (Math.random() * 0.4 + 0.1)),
          usagePercent: Math.random() * 40 + 10, // 10-50%
        },
        gpu: config.gpuConfig?.enabled || config.gpuDeviceIds?.length > 0 ? {
          enabled: true,
          deviceId: config.gpuConfig?.deviceIds?.[0] || config.gpuDeviceIds?.[0] || 'GPU-0',
          usagePercent: Math.random() * 90 + 5, // 5-95%
          memoryUsedMB: Math.floor(Math.random() * 15000 + 1000),
          memoryTotalMB: 16384,
        } : undefined,
        network: {
          rxBytes: Math.floor(Math.random() * 1000000000 + 100000000),
          txBytes: Math.floor(Math.random() * 500000000 + 50000000),
        },
      },
      note: 'V1: Mock metrics. Actual metrics from libvirt/docker will be implemented in V2.',
    };
  }

  /**
   * Get console access (V1: Mock VNC URL for VMs)
   */
  async getConsole(resourceId: string) {
    const resource = await this.model.findById(resourceId);
    if (!resource) {
      throw new Error('Resource not found');
    }

    if (resource.type !== 'virtual-machine') {
      throw new Error('Console access only available for VMs');
    }

    // V1: Return mock console URL
    // V2: Get actual VNC URL from worker
    // TODO: V2 - Implement real VNC/console access via libvirt
    return {
      resourceId,
      type: 'vnc',
      url: `vnc://192.168.100.${Math.floor(Math.random() * 200 + 10)}:5900`,
      password: `mock-vnc-pass-${resourceId.slice(-6)}`,
      note: 'V1: Mock VNC URL. Actual VNC access will be implemented in V2.',
    };
  }

  /**
   * Create snapshot (V1: Mock snapshot for VMs)
   */
  async createSnapshot(resourceId: string, name: string, description?: string) {
    const resource = await this.model.findById(resourceId);
    if (!resource) {
      throw new Error('Resource not found');
    }

    if (resource.type !== 'virtual-machine') {
      throw new Error('Snapshots only available for VMs');
    }

    // V1: Return mock snapshot
    // V2: Create actual snapshot via libvirt
    // TODO: V2 - Implement actual libvirt snapshot
    return {
      success: true,
      snapshot: {
        id: `snapshot-mock-${Date.now()}`,
        resourceId,
        name,
        description,
        createdAt: new Date().toISOString(),
        diskSizeGB: Math.floor(Math.random() * 30 + 10),
      },
      note: 'V1: Mock snapshot. Actual libvirt snapshot will be implemented in V2.',
    };
  }

  /**
   * List snapshots (V1: Mock snapshots array)
   */
  async listSnapshots(resourceId: string) {
    const resource = await this.model.findById(resourceId);
    if (!resource) {
      throw new Error('Resource not found');
    }

    if (resource.type !== 'virtual-machine') {
      throw new Error('Snapshots only available for VMs');
    }

    // V1: Return mock snapshots
    // V2: Get actual snapshots from libvirt
    // TODO: V2 - Implement actual libvirt snapshot list
    return {
      resourceId,
      snapshots: [
        {
          id: `snapshot-mock-${Date.now() - 86400000}`,
          name: 'Initial Setup',
          description: 'Fresh VM after OS installation',
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          diskSizeGB: 15,
        },
        {
          id: `snapshot-mock-${Date.now() - 3600000}`,
          name: 'After Updates',
          description: 'VM after installing system updates',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          diskSizeGB: 18,
        },
      ],
      note: 'V1: Mock snapshots. Actual libvirt snapshots will be implemented in V2.',
    };
  }

  /**
   * Restore snapshot (V1: Mock restore)
   */
  async restoreSnapshot(resourceId: string, snapshotId: string) {
    // V1: Return mock success
    // V2: Restore actual snapshot via libvirt
    // TODO: V2 - Implement actual libvirt snapshot restore
    return {
      success: true,
      message: 'Snapshot restore requested',
      resourceId,
      snapshotId,
      timestamp: new Date().toISOString(),
      note: 'V1: Mock restore. Actual snapshot restore will be implemented in V2.',
    };
  }

  /**
   * Delete snapshot (V1: Mock delete)
   */
  async deleteSnapshot(resourceId: string, snapshotId: string) {
    // V1: Return mock success
    // V2: Delete actual snapshot via libvirt
    // TODO: V2 - Implement actual libvirt snapshot delete
    return {
      success: true,
      message: 'Snapshot deleted',
      resourceId,
      snapshotId,
      timestamp: new Date().toISOString(),
      note: 'V1: Mock delete. Actual snapshot delete will be implemented in V2.',
    };
  }

  /**
   * Execute command in container (V1: Mock exec output)
   */
  async execCommand(resourceId: string, command: string, workingDir?: string) {
    const resource = await this.model.findById(resourceId);
    if (!resource) {
      throw new Error('Resource not found');
    }

    if (!resource.type.includes('container')) {
      throw new Error('Exec only available for containers');
    }

    // V1: Return mock command output
    // V2: Execute actual command via docker
    // TODO: V2 - Implement actual docker exec
    return {
      resourceId,
      command,
      workingDir: workingDir || '/app',
      output: `[Mock] Executing: ${command}\n[Mock] Output from container...\n[Mock] Command completed successfully`,
      exitCode: 0,
      timestamp: new Date().toISOString(),
      note: 'V1: Mock execution. Actual docker exec will be implemented in V2.',
    };
  }
}
