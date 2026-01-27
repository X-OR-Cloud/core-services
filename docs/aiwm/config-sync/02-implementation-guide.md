# Config Sync - Implementation Guide

**Version**: 1.0
**Date**: 2026-01-27

---

## 🎯 Implementation Overview

Tính năng Config Sync được triển khai theo **Hybrid Approach**:
- **Node.systemInfo** = Static baseline (chỉ update khi admin confirm)
- **MetricData.systemInfo** = Current reality (dynamic, có thể khác)
- **Auto-detect** discrepancies → Alert admin
- **Manual sync** via API (admin click button để update)

---

## 📦 Components

### **1. MONA Service API Client**

```typescript
// services/aiwm/src/clients/mona-client.ts

import { Injectable, HttpService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MonaClient {
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get('MONA_SERVICE_URL') || 'http://localhost:3004';
  }

  /**
   * Get latest metric for a node
   */
  async getLatestNodeMetric(nodeId: string, interval = '1min') {
    const response = await this.httpService.axiosRef.get(
      `${this.baseUrl}/metrics/nodes/${nodeId}/latest`,
      { params: { interval } }
    );

    return response.data;
  }

  /**
   * Get metrics history for drift analysis
   */
  async getNodeMetricsHistory(nodeId: string, limit = 10) {
    const response = await this.httpService.axiosRef.get(
      `${this.baseUrl}/metrics/nodes/${nodeId}`,
      { params: { limit, interval: '1min' } }
    );

    return response.data;
  }
}
```

### **2. Config Drift Detector**

```typescript
// services/aiwm/src/modules/node/config-drift.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { SystemInfo } from './node.interface';

export interface ConfigDriftChange {
  field: string;
  baseline: any;
  current: any;
  severity: 'critical' | 'warning' | 'info';
}

export interface ConfigDrift {
  hasChanges: boolean;
  changes: ConfigDriftChange[];
  timestamp: Date;
}

@Injectable()
export class ConfigDriftService {
  private readonly logger = new Logger(ConfigDriftService.name);

  /**
   * Detect configuration drift between baseline and current systemInfo
   */
  detectDrift(baseline: SystemInfo, current: SystemInfo): ConfigDrift {
    const changes: ConfigDriftChange[] = [];

    // Check CPU changes
    if (baseline.hardware.cpu.totalCores !== current.hardware.cpu.totalCores) {
      changes.push({
        field: 'cpu.totalCores',
        baseline: baseline.hardware.cpu.totalCores,
        current: current.hardware.cpu.totalCores,
        severity: 'critical',
      });
    }

    if (baseline.hardware.cpu.model !== current.hardware.cpu.model) {
      changes.push({
        field: 'cpu.model',
        baseline: baseline.hardware.cpu.model,
        current: current.hardware.cpu.model,
        severity: 'warning',
      });
    }

    // Check Memory changes
    if (baseline.hardware.memory.total !== current.hardware.memory.total) {
      changes.push({
        field: 'memory.total',
        baseline: baseline.hardware.memory.total,
        current: current.hardware.memory.total,
        severity: 'critical',
      });
    }

    // Check Disk changes
    if (baseline.hardware.disk.total !== current.hardware.disk.total) {
      changes.push({
        field: 'disk.total',
        baseline: baseline.hardware.disk.total,
        current: current.hardware.disk.total,
        severity: 'warning',
      });
    }

    // Check GPU changes
    const baselineGPUs = baseline.hardware.gpu?.length || 0;
    const currentGPUs = current.hardware.gpu?.length || 0;

    if (baselineGPUs !== currentGPUs) {
      changes.push({
        field: 'gpu.count',
        baseline: baselineGPUs,
        current: currentGPUs,
        severity: 'critical',
      });
    }

    // Check individual GPU models
    if (baseline.hardware.gpu && current.hardware.gpu) {
      const minLength = Math.min(baselineGPUs, currentGPUs);
      for (let i = 0; i < minLength; i++) {
        if (baseline.hardware.gpu[i].model !== current.hardware.gpu[i].model) {
          changes.push({
            field: `gpu[${i}].model`,
            baseline: baseline.hardware.gpu[i].model,
            current: current.hardware.gpu[i].model,
            severity: 'warning',
          });
        }
      }
    }

    // Check Network changes
    if (baseline.hardware.network.publicIp !== current.hardware.network.publicIp) {
      changes.push({
        field: 'network.publicIp',
        baseline: baseline.hardware.network.publicIp,
        current: current.hardware.network.publicIp,
        severity: 'info',
      });
    }

    if (baseline.hardware.network.clusterIp !== current.hardware.network.clusterIp) {
      changes.push({
        field: 'network.clusterIp',
        baseline: baseline.hardware.network.clusterIp,
        current: current.hardware.network.clusterIp,
        severity: 'warning',
      });
    }

    return {
      hasChanges: changes.length > 0,
      changes,
      timestamp: new Date(),
    };
  }

  /**
   * Format drift changes for human-readable display
   */
  formatDriftMessage(drift: ConfigDrift): string {
    if (!drift.hasChanges) {
      return 'No configuration changes detected';
    }

    const lines = drift.changes.map(change => {
      const icon = {
        critical: '🔴',
        warning: '⚠️',
        info: 'ℹ️',
      }[change.severity];

      return `${icon} ${change.field}: ${this.formatValue(change.baseline)} → ${this.formatValue(change.current)}`;
    });

    return lines.join('\n');
  }

  private formatValue(value: any): string {
    if (typeof value === 'number') {
      // Format bytes to GB
      if (value > 1024 * 1024 * 1024) {
        return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      }
      return value.toString();
    }
    return String(value);
  }
}
```

### **3. Node Service Extensions**

```typescript
// services/aiwm/src/modules/node/node.service.ts

import { MonaClient } from '../../clients/mona-client';
import { ConfigDriftService } from './config-drift.service';

@Injectable()
export class NodeService extends BaseService<Node> {
  constructor(
    @InjectModel(Node.name) nodeModel: Model<Node>,
    private readonly monaClient: MonaClient,
    private readonly configDriftService: ConfigDriftService,
    // ... other dependencies
  ) {
    super(nodeModel as any);
  }

  /**
   * Check config drift for a specific node
   */
  async checkConfigDrift(nodeId: string) {
    // Get node from DB
    const node = await this.model.findById(nodeId);
    if (!node || !node.systemInfo) {
      throw new NotFoundException('Node not found or systemInfo missing');
    }

    // Get latest metric from MONA
    const latestMetric = await this.monaClient.getLatestNodeMetric(nodeId);
    if (!latestMetric || !latestMetric.systemInfo) {
      throw new NotFoundException('No metric data found for this node');
    }

    // Detect drift
    const drift = this.configDriftService.detectDrift(
      node.systemInfo,
      latestMetric.systemInfo
    );

    return {
      nodeId,
      nodeName: node.name,
      hasChanges: drift.hasChanges,
      changes: drift.changes,
      lastChecked: new Date(),
      metricTimestamp: latestMetric.timestamp,
    };
  }

  /**
   * Sync node config from latest metrics (admin action)
   */
  async syncConfigFromMetrics(nodeId: string, context: RequestContext) {
    // Get drift status first
    const driftStatus = await this.checkConfigDrift(nodeId);

    if (!driftStatus.hasChanges) {
      return {
        success: false,
        message: 'No configuration changes to sync',
        changes: [],
      };
    }

    // Get latest metric again (ensure fresh data)
    const latestMetric = await this.monaClient.getLatestNodeMetric(nodeId);

    // Store previous systemInfo for rollback
    const node = await this.model.findById(nodeId);
    const previousSystemInfo = node.systemInfo;

    // Update systemInfo
    await this.model.updateOne(
      { _id: nodeId },
      {
        $set: {
          systemInfo: latestMetric.systemInfo,
          'metadata.previousSystemInfo': previousSystemInfo,
          'metadata.lastConfigSync': new Date(),
          updatedAt: new Date(),
          updatedBy: context.userId,
        },
      }
    );

    // Log sync action
    this.logger.log(
      `Node ${nodeId} config synced from metrics by ${context.userId}`,
      {
        nodeId,
        nodeName: node.name,
        changes: driftStatus.changes,
        syncedBy: context.userId,
        syncedAt: new Date(),
        metricSource: 'mona',
        metricTimestamp: latestMetric.timestamp,
      }
    );

    return {
      success: true,
      message: 'Node config synced from latest metrics',
      changes: driftStatus.changes,
      syncedAt: new Date(),
      syncedBy: context.userId,
      metricTimestamp: latestMetric.timestamp,
    };
  }

  /**
   * Rollback to previous config
   */
  async rollbackConfig(nodeId: string, context: RequestContext) {
    const node = await this.model.findById(nodeId);
    if (!node) {
      throw new NotFoundException('Node not found');
    }

    const previousSystemInfo = (node.metadata as any)?.previousSystemInfo;
    if (!previousSystemInfo) {
      throw new BadRequestException('No previous config to rollback to');
    }

    // Rollback systemInfo
    await this.model.updateOne(
      { _id: nodeId },
      {
        $set: {
          systemInfo: previousSystemInfo,
          updatedAt: new Date(),
          updatedBy: context.userId,
        },
        $unset: {
          'metadata.previousSystemInfo': '',
        },
      }
    );

    this.logger.log(
      `Node ${nodeId} config rolled back by ${context.userId}`
    );

    return {
      success: true,
      message: 'Config rolled back successfully',
      rolledBackAt: new Date(),
      rolledBackBy: context.userId,
    };
  }
}
```

### **4. Node Controller APIs**

```typescript
// services/aiwm/src/modules/node/node.controller.ts

@Controller('nodes')
export class NodeController {
  constructor(private readonly nodeService: NodeService) {}

  /**
   * Check config drift status
   */
  @Get(':id/config-drift')
  @ApiOperation({
    summary: 'Check config drift status',
    description: 'Compare Node.systemInfo with latest metric from MONA',
  })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async getConfigDrift(@Param('id') id: string) {
    return this.nodeService.checkConfigDrift(id);
  }

  /**
   * Sync config from latest metrics
   */
  @Post(':id/sync-config')
  @ApiOperation({
    summary: 'Sync node config from latest metrics',
    description: 'Update Node.systemInfo based on latest metric data from MONA (admin action)',
  })
  @RequireUniverseRole()
  @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async syncConfig(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.nodeService.syncConfigFromMetrics(id, context);
  }

  /**
   * Rollback to previous config
   */
  @Post(':id/rollback-config')
  @ApiOperation({
    summary: 'Rollback to previous config',
    description: 'Restore systemInfo to state before last sync',
  })
  @RequireUniverseRole()
  @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async rollbackConfig(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.nodeService.rollbackConfig(id, context);
  }
}
```

### **5. Periodic Drift Check Job**

```typescript
// services/aiwm/src/modules/node/node-drift-check.job.ts

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NodeService } from './node.service';
import { AlertService } from '../alert/alert.service';

@Injectable()
export class NodeDriftCheckJob {
  private readonly logger = new Logger(NodeDriftCheckJob.name);

  constructor(
    private readonly nodeService: NodeService,
    private readonly alertService: AlertService,
  ) {}

  /**
   * Check config drift for all active nodes every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkAllNodesDrift() {
    this.logger.log('Starting config drift check for all nodes');

    // Get all active nodes
    const nodes = await this.nodeService.model.find({
      status: { $in: ['online', 'maintenance'] },
      isDeleted: false,
    });

    for (const node of nodes) {
      try {
        const drift = await this.nodeService.checkConfigDrift(node._id.toString());

        if (drift.hasChanges) {
          // Create alert
          await this.alertService.create({
            type: 'config-drift',
            severity: 'warning',
            nodeId: node._id,
            nodeName: node.name,
            message: `Hardware config changed on node ${node.name}`,
            details: drift,
            actionRequired: 'Review and sync config if change is legitimate',
          });

          this.logger.warn(
            `Config drift detected for node ${node.name}`,
            { changes: drift.changes }
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to check drift for node ${node.name}`,
          error.stack
        );
      }
    }

    this.logger.log('Config drift check completed');
  }
}
```

---

## 🔧 Module Setup

```typescript
// services/aiwm/src/modules/node/node.module.ts

import { Module, HttpModule } from '@nestjs/common';
import { MonaClient } from '../../clients/mona-client';
import { ConfigDriftService } from './config-drift.service';
import { NodeDriftCheckJob } from './node-drift-check.job';

@Module({
  imports: [
    HttpModule,
    // ... other imports
  ],
  providers: [
    NodeService,
    MonaClient,
    ConfigDriftService,
    NodeDriftCheckJob,
    // ... other providers
  ],
  controllers: [NodeController],
})
export class NodeModule {}
```

---

## 🧪 Testing

### **Test Cases**

```typescript
// services/aiwm/src/modules/node/__tests__/config-drift.service.spec.ts

describe('ConfigDriftService', () => {
  let service: ConfigDriftService;

  beforeEach(() => {
    service = new ConfigDriftService();
  });

  it('should detect CPU core changes', () => {
    const baseline = createSystemInfo({ cpu: { totalCores: 32 } });
    const current = createSystemInfo({ cpu: { totalCores: 64 } });

    const drift = service.detectDrift(baseline, current);

    expect(drift.hasChanges).toBe(true);
    expect(drift.changes).toHaveLength(1);
    expect(drift.changes[0].field).toBe('cpu.totalCores');
    expect(drift.changes[0].severity).toBe('critical');
  });

  it('should detect GPU count changes', () => {
    const baseline = createSystemInfo({ gpu: [{}, {}] }); // 2 GPUs
    const current = createSystemInfo({ gpu: [{}, {}, {}] }); // 3 GPUs

    const drift = service.detectDrift(baseline, current);

    expect(drift.hasChanges).toBe(true);
    const gpuChange = drift.changes.find(c => c.field === 'gpu.count');
    expect(gpuChange).toBeDefined();
    expect(gpuChange.baseline).toBe(2);
    expect(gpuChange.current).toBe(3);
  });

  it('should not detect changes when configs are identical', () => {
    const baseline = createSystemInfo({ cpu: { totalCores: 32 } });
    const current = createSystemInfo({ cpu: { totalCores: 32 } });

    const drift = service.detectDrift(baseline, current);

    expect(drift.hasChanges).toBe(false);
    expect(drift.changes).toHaveLength(0);
  });
});
```

---

## 📝 Environment Variables

```env
# .env
MONA_SERVICE_URL=http://localhost:3004
CONFIG_DRIFT_CHECK_INTERVAL=5 # minutes
```

---

## 🚀 Deployment Checklist

- [ ] MONA service deployed và accessible
- [ ] MONA API endpoint `/metrics/nodes/:nodeId/latest` available
- [ ] MonaClient configured với correct URL
- [ ] ConfigDriftService registered in module
- [ ] Periodic drift check job enabled
- [ ] Alert service configured
- [ ] Frontend integrated with new APIs

---

## 📊 Example Usage

```bash
# Check drift status
curl -X GET http://localhost:3003/nodes/node_001/config-drift \
  -H "Authorization: Bearer $TOKEN"

# Response:
{
  "nodeId": "node_001",
  "nodeName": "gpu-worker-01",
  "hasChanges": true,
  "changes": [
    {
      "field": "cpu.totalCores",
      "baseline": 32,
      "current": 64,
      "severity": "critical"
    }
  ],
  "lastChecked": "2026-01-27T10:00:00Z",
  "metricTimestamp": "2026-01-27T09:59:00Z"
}

# Sync config
curl -X POST http://localhost:3003/nodes/node_001/sync-config \
  -H "Authorization: Bearer $TOKEN"

# Response:
{
  "success": true,
  "message": "Node config synced from latest metrics",
  "changes": [...],
  "syncedAt": "2026-01-27T10:01:00Z",
  "syncedBy": "user_admin_01"
}
```
