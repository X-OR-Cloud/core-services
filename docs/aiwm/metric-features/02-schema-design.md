# Metrics Module - Schema Design

**Version**: 2.0
**Date**: 2026-01-14
**Status**: Draft - Pending Review

**Changelog v2.0**:
- Changed `metricType` → `type` for brevity
- Consolidated `node`, `resource`, `deployment`, `system` → single `metrics` object
- Enhanced CPU schema: added model, multiple sockets support
- Enhanced Network schema: added IP addresses, multiple interfaces
- Added `systemInfo` for OS, architecture, container runtime
- Clarified `timestamp` handling (Date in DB, both formats in API)

---

## 📋 Table of Contents

1. [Collection Overview](#collection-overview)
2. [MetricSnapshot Schema](#metricsnapshot-schema)
3. [Metric Types](#metric-types)
4. [Indexes](#indexes)
5. [Data Samples](#data-samples)

---

## 1. Collection Overview

### 1.1 MongoDB Collection

**Collection Name**: `metrics`

**Purpose**: Lưu trữ time-series metrics data cho nodes, resources, deployments và system-wide stats.

**Design Pattern**: Single collection với discriminator field (`type`) để phân biệt các loại metrics khác nhau. Metrics data được lưu trong flexible `metrics` object.

**Why Single Collection?**
- ✅ Simpler to manage (1 collection vs 4)
- ✅ Easier to query across metric types
- ✅ Better for aggregation và reporting
- ✅ Consistent TTL và retention policies
- ⚠️ Trade-off: Larger documents (but acceptable)

**Why Consolidated `metrics` Object?**
- ✅ Cleaner schema structure
- ✅ Consistent query paths: `metrics.cpu.usage`
- ✅ Easier to extend với new metric types
- ✅ Flexible schema validation per type

### 1.2 Aggregation Levels

Metrics được lưu với 4 levels:

| Interval | Description | Retention | Use Case |
|----------|-------------|-----------|----------|
| `1min` | Raw metrics | 7 days | Real-time monitoring, debugging |
| `5min` | 5-minute avg | 30 days | Recent trend analysis |
| `1hour` | Hourly avg | 90 days | Historical analysis |
| `1day` | Daily avg | 365 days | Long-term trends, reports |

---

## 2. MetricSnapshot Schema

### 2.1 Base Schema

```typescript
import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type MetricSnapshotDocument = MetricSnapshot & Document;

/**
 * MetricType - Discriminator cho loại metrics (nguồn phát sinh)
 */
export enum MetricType {
  NODE = 'node',
  RESOURCE = 'resource',
  DEPLOYMENT = 'deployment',
  SYSTEM = 'system',
}

/**
 * AggregationInterval - Granularity của metrics
 */
export enum AggregationInterval {
  ONE_MIN = '1min',
  FIVE_MIN = '5min',
  ONE_HOUR = '1hour',
  ONE_DAY = '1day',
}

/**
 * MetricSnapshot - Time-series metrics storage
 * Single collection design với type discriminator
 */
@Schema({ timestamps: true })
export class MetricSnapshot extends BaseSchema {
  // ============= Discriminator & Classification =============

  @Prop({
    required: true,
    enum: Object.values(MetricType),
    index: true,
  })
  type!: string; // 'node' | 'resource' | 'deployment' | 'system'

  @Prop({
    required: true,
    enum: ['node', 'resource', 'deployment', 'agent', 'model', 'system'],
    index: true,
  })
  entityType!: string; // Type của entity được monitor

  @Prop({ required: true, index: true })
  entityId!: string; // Reference to Node._id, Resource._id, Deployment._id, etc.

  @Prop({ index: true })
  entityName?: string; // Optional: tên entity cho easier debugging

  // ============= Timestamp & Interval =============

  @Prop({ required: true, type: Date, index: true })
  timestamp!: Date; // Thời điểm snapshot (UTC)

  @Prop({
    required: true,
    enum: Object.values(AggregationInterval),
    index: true,
  })
  interval!: string; // '1min' | '5min' | '1hour' | '1day'

  // ============= System Information (mostly static) =============

  @Prop(
    raw({
      os: {
        name: { type: String }, // e.g., "Ubuntu", "CentOS"
        version: { type: String }, // e.g., "22.04 LTS"
        kernel: { type: String }, // e.g., "5.15.0-91-generic"
        platform: { type: String }, // e.g., "linux", "darwin", "win32"
      },
      architecture: {
        cpu: { type: String }, // e.g., "x86_64", "aarch64", "arm64"
        bits: { type: Number }, // 32 or 64
        endianness: { type: String }, // "LE" or "BE"
      },
      containerRuntime: {
        type: { type: String }, // "docker", "containerd", "podman"
        version: { type: String }, // e.g., "24.0.7"
        apiVersion: { type: String }, // e.g., "1.43"
        storage: {
          driver: { type: String }, // "overlay2", "btrfs"
          filesystem: { type: String }, // "ext4", "xfs"
        },
      },
      virtualization: {
        type: { type: String }, // "kvm", "vmware", "hyperv", "none"
        role: { type: String }, // "host" or "guest"
      },
    })
  )
  systemInfo?: {
    os: {
      name: string;
      version: string;
      kernel: string;
      platform: string;
    };
    architecture: {
      cpu: string;
      bits: number;
      endianness: string;
    };
    containerRuntime?: {
      type: string;
      version: string;
      apiVersion?: string;
      storage: {
        driver: string;
        filesystem: string;
      };
    };
    virtualization?: {
      type: string;
      role: string;
    };
  };

  // ============= Metrics Data (flexible structure based on type) =============

  @Prop({ type: Object, required: true })
  metrics!: Record<string, any>;

  // Structure of 'metrics' depends on 'type':
  // - type='node': NodeMetrics
  // - type='resource': ResourceMetrics
  // - type='deployment': DeploymentMetrics
  // - type='system': SystemMetrics

  // BaseSchema provides: owner (orgId, userId, groupId), createdBy, updatedBy, etc.
}

export const MetricSnapshotSchema = SchemaFactory.createForClass(MetricSnapshot);
```

### 2.2 NodeMetrics Structure

**When `type = 'node'`**, the `metrics` object contains:

```typescript
interface NodeMetrics {
  cpu: {
    // Aggregated metrics (average across all sockets)
    usage: number; // % average (0-100)
    cores: number; // Total cores across all sockets
    loadAverage: [number, number, number]; // [1min, 5min, 15min]

    // CPU topology
    sockets?: number; // Number of physical CPUs
    coresPerSocket?: number; // Cores per socket
    threadsPerCore?: number; // Threads per core (hyperthreading)

    // CPU details (array if multiple sockets)
    details?: Array<{
      socketId: number; // Socket number (0, 1, 2...)
      model: string; // e.g., "Intel Xeon Gold 6248R"
      vendor: string; // e.g., "Intel", "AMD"
      frequency: number; // MHz
      cacheSize?: number; // L3 cache in KB
      cores: number; // Cores in this socket
      usage?: number; // % usage for this socket (if available)
    }>;
  };

  memory: {
    total: number; // bytes
    used: number;
    free: number;
    cached: number;
    usagePercent: number; // 0-100
    available?: number; // Available memory (free + cached)
    buffers?: number; // Buffer cache
    swap?: {
      total: number;
      used: number;
      free: number;
      usagePercent: number;
    };
  };

  disk: {
    total: number; // bytes
    used: number;
    free: number;
    usagePercent: number; // 0-100
    readBytesPerSec: number;
    writeBytesPerSec: number;
    readOpsPerSec?: number;
    writeOpsPerSec?: number;
    ioutil?: number; // I/O utilization % (0-100)

    // Disk devices (array)
    devices?: Array<{
      name: string; // e.g., "sda", "nvme0n1"
      mountPoint: string; // e.g., "/", "/data"
      total: number;
      used: number;
      free: number;
      usagePercent: number;
      filesystem: string; // e.g., "ext4", "xfs"
    }>;
  };

  network: {
    // Aggregated metrics (sum across all interfaces)
    rxBytesPerSec: number; // Total ingress
    txBytesPerSec: number; // Total egress
    rxPacketsPerSec?: number;
    txPacketsPerSec?: number;
    rxDropped?: number;
    txDropped?: number;
    rxErrors?: number;
    txErrors?: number;

    // Network interfaces (array)
    interfaces?: Array<{
      name: string; // e.g., "eth0", "ens3", "wlan0"
      type: string; // e.g., "ethernet", "wifi", "vpn", "bridge"
      ipAddress?: string; // Local IP: "192.168.1.100"
      ipv6Address?: string; // IPv6: "fe80::1"
      macAddress?: string; // MAC: "00:1B:44:11:3A:B7"
      publicIp?: string; // Public IP (if applicable): "203.0.113.45"
      netmask?: string; // Subnet mask: "255.255.255.0"
      gateway?: string; // Gateway IP: "192.168.1.1"
      mtu?: number; // MTU size: 1500
      speed?: number; // Link speed in Mbps: 1000
      duplex?: string; // "full" | "half"
      state: string; // "up" | "down"
      rxBytesPerSec: number; // Interface-specific ingress
      txBytesPerSec: number; // Interface-specific egress
      rxPackets?: number;
      txPackets?: number;
    }>;
  };

  gpu?: Array<{
    deviceId: string; // e.g., "GPU-0"
    model: string; // e.g., "NVIDIA A100 80GB"
    vendor?: string; // e.g., "NVIDIA", "AMD"
    utilization: number; // % (0-100)
    memoryUsed: number; // bytes
    memoryTotal: number;
    memoryPercent: number; // 0-100
    temperature: number; // Celsius
    powerDraw?: number; // Watts
    powerLimit?: number; // Watts
    fanSpeed?: number; // % (0-100)
    clockSpeed?: number; // MHz
    maxClockSpeed?: number; // MHz
    processes?: Array<{
      pid: number;
      name: string;
      memoryUsed: number;
    }>;
  }>;

  status: 'online' | 'offline' | 'maintenance';
  websocketConnected: boolean;
  uptime: number; // seconds
}
```

### 2.3 ResourceMetrics Structure

**When `type = 'resource'`**, the `metrics` object contains:

```typescript
interface ResourceMetrics {
  containerId?: string; // For containers
  vmId?: string; // For VMs
  resourceType: 'inference-container' | 'application-container' | 'virtual-machine';

  cpu: {
    usagePercent: number; // % (0-100)
    limitCores: number;
    throttledTime?: number; // nanoseconds
    throttledPeriods?: number; // Number of throttling periods
  };

  memory: {
    usageBytes: number;
    limitBytes: number;
    usagePercent: number; // 0-100
    cacheBytes?: number;
    rssBytes?: number; // Resident set size
    swapBytes?: number; // Swap usage
  };

  network?: {
    rxBytes: number;
    txBytes: number;
    rxPackets?: number;
    txPackets?: number;
    rxDropped?: number;
    txDropped?: number;
  };

  disk?: {
    readBytes: number;
    writeBytes: number;
    readOps?: number;
    writeOps?: number;
  };

  restartCount: number;
  uptime: number; // seconds
  status: 'running' | 'stopped' | 'restarting' | 'error';

  // Container-specific
  exitCode?: number; // Last exit code if stopped
  oomKilled?: boolean; // Out of memory killed
}
```

### 2.4 DeploymentMetrics Structure

**When `type = 'deployment'`**, the `metrics` object contains:

```typescript
interface DeploymentMetrics {
  modelId: string;
  modelName: string;

  requestCount: number;
  requestRate: number; // requests/sec

  errorCount: number;
  errorRate: number; // % (0-100)

  latency: {
    p50: number; // ms
    p95: number;
    p99: number;
    avg: number;
    max: number;
    min: number;
  };

  tokens: {
    input: number;
    output: number;
    total: number;
  };

  cost: number; // USD

  healthStatus: 'healthy' | 'degraded' | 'unhealthy';

  // Additional metrics
  throughput?: number; // tokens/sec
  concurrentRequests?: number; // Current concurrent requests
  queueDepth?: number; // Requests waiting in queue
}
```

### 2.5 SystemMetrics Structure

**When `type = 'system'`**, the `metrics` object contains:

```typescript
interface SystemMetrics {
  totalNodes: number;
  nodesOnline: number;
  nodesOffline: number;

  totalResources: number;
  resourcesRunning: number;
  resourcesStopped: number;

  totalDeployments: number;
  deploymentsRunning: number;
  deploymentsStopped: number;

  totalRequests: number;
  totalTokens: number;
  totalCost: number; // USD

  avgLatency: number; // ms
  errorRate: number; // % (0-100)

  // Aggregated hardware
  totalCpuCores?: number;
  totalMemoryBytes?: number;
  totalGpuDevices?: number;
}
```

---

## 3. Metric Types

### 3.1 Node Metrics (`type = 'node'`)

**Purpose**: Track hardware và OS-level metrics của compute nodes.

**Key Features**:
- ✅ Multi-socket CPU support với per-socket metrics
- ✅ Multiple network interfaces với IP tracking
- ✅ GPU device monitoring
- ✅ Disk device monitoring
- ✅ System information (OS, architecture, runtime)

**Collection Interval**: 1 minute

**Push Source**: Node daemon (hydra-worker)

**Example Use Cases**:
- Monitor CPU spikes across sockets
- Track GPU temperature và utilization
- Alert on high memory usage
- Analyze network bandwidth per interface
- Track public IP changes

---

### 3.2 Resource Metrics (`type = 'resource'`)

**Purpose**: Track container/VM resource consumption.

**Key Features**:
- ✅ Container/VM-specific metrics
- ✅ Resource limits tracking
- ✅ Throttling detection
- ✅ OOM kill detection
- ✅ Restart count tracking

**Collection Interval**: 5 minutes

**Push Source**: Container runtime (Docker, containerd) hoặc VM hypervisor

**Example Use Cases**:
- Track container resource limits vs usage
- Monitor container restarts và OOM kills
- Analyze resource efficiency
- Identify resource-hungry containers

---

### 3.3 Deployment Metrics (`type = 'deployment'`)

**Purpose**: Track inference performance và usage statistics.

**Key Features**:
- ✅ Request rate và latency tracking
- ✅ Token consumption tracking
- ✅ Cost calculation
- ✅ Error rate monitoring
- ✅ Health status assessment

**Collection Interval**: 5 minutes (aggregated from executions)

**Collection Source**: Internal aggregation from Execution collection

**Example Use Cases**:
- Monitor inference latency trends
- Track token consumption và cost
- Analyze error rates
- Health monitoring
- SLA compliance checking

---

### 3.4 System Metrics (`type = 'system'`)

**Purpose**: Platform-wide aggregated statistics.

**Key Features**:
- ✅ Platform-wide counts (nodes, resources, deployments)
- ✅ Aggregated usage statistics
- ✅ Platform health overview

**Collection Interval**: 5 minutes

**Collection Source**: Internal aggregation

**Example Use Cases**:
- Dashboard overview
- Executive reports
- Capacity planning
- SLA monitoring

---

## 4. Indexes

### 4.1 Primary Indexes

```typescript
// Compound index for time-range queries
MetricSnapshotSchema.index(
  { type: 1, entityId: 1, timestamp: -1 },
  { name: 'metrics_time_range_query' }
);

// Compound index for aggregation queries
MetricSnapshotSchema.index(
  { type: 1, interval: 1, timestamp: -1 },
  { name: 'metrics_aggregation_query' }
);

// Index for entity lookup
MetricSnapshotSchema.index(
  { entityType: 1, entityId: 1 },
  { name: 'metrics_entity_lookup' }
);

// Index for organization-scoped queries
MetricSnapshotSchema.index(
  { 'owner.orgId': 1, type: 1, timestamp: -1 },
  { name: 'metrics_org_query' }
);

// TTL index for automatic cleanup (expire after 365 days)
MetricSnapshotSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: 31536000, // 365 days
    name: 'metrics_ttl_cleanup',
  }
);

// Index for latest metric queries
MetricSnapshotSchema.index(
  { type: 1, entityId: 1, timestamp: -1 },
  { name: 'metrics_latest_lookup' }
);
```

### 4.2 Index Strategy

**Query Patterns**:
1. Get node metrics for specific nodeId trong time range
2. Get all node metrics trong time range (dashboard)
3. Get aggregated metrics by interval
4. Get system-wide metrics
5. Get latest snapshot per entity

**Index Coverage**:
- ✅ All queries covered by compound indexes
- ✅ TTL index for automatic cleanup
- ✅ Efficient sorting on timestamp (descending)

---

## 5. Data Samples

### 5.1 Node Metric Sample (1min interval)

```json
{
  "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
  "type": "node",
  "entityType": "node",
  "entityId": "65a0000000000000000000001",
  "entityName": "gpu-worker-01",
  "timestamp": "2026-01-14T10:00:00.000Z",
  "interval": "1min",

  "systemInfo": {
    "os": {
      "name": "Ubuntu",
      "version": "22.04.3 LTS",
      "kernel": "5.15.0-91-generic",
      "platform": "linux"
    },
    "architecture": {
      "cpu": "x86_64",
      "bits": 64,
      "endianness": "LE"
    },
    "containerRuntime": {
      "type": "docker",
      "version": "24.0.7",
      "apiVersion": "1.43",
      "storage": {
        "driver": "overlay2",
        "filesystem": "ext4"
      }
    },
    "virtualization": {
      "type": "kvm",
      "role": "guest"
    }
  },

  "metrics": {
    "cpu": {
      "usage": 65.5,
      "cores": 64,
      "loadAverage": [8.5, 9.2, 10.1],
      "sockets": 2,
      "coresPerSocket": 32,
      "threadsPerCore": 1,
      "details": [
        {
          "socketId": 0,
          "model": "Intel Xeon Gold 6348",
          "vendor": "Intel",
          "frequency": 2600,
          "cacheSize": 42240,
          "cores": 32,
          "usage": 68.2
        },
        {
          "socketId": 1,
          "model": "Intel Xeon Gold 6348",
          "vendor": "Intel",
          "frequency": 2600,
          "cacheSize": 42240,
          "cores": 32,
          "usage": 62.8
        }
      ]
    },
    "memory": {
      "total": 137438953472,
      "used": 103079215104,
      "free": 27917287424,
      "cached": 6442450944,
      "usagePercent": 75.0,
      "available": 34359738368
    },
    "disk": {
      "total": 2199023255552,
      "used": 1099511627776,
      "free": 1099511627776,
      "usagePercent": 50.0,
      "readBytesPerSec": 104857600,
      "writeBytesPerSec": 52428800,
      "readOpsPerSec": 500,
      "writeOpsPerSec": 250,
      "devices": [
        {
          "name": "nvme0n1",
          "mountPoint": "/",
          "total": 1099511627776,
          "used": 549755813888,
          "free": 549755813888,
          "usagePercent": 50.0,
          "filesystem": "ext4"
        },
        {
          "name": "nvme1n1",
          "mountPoint": "/data",
          "total": 1099511627776,
          "used": 549755813888,
          "free": 549755813888,
          "usagePercent": 50.0,
          "filesystem": "xfs"
        }
      ]
    },
    "network": {
      "rxBytesPerSec": 15728640,
      "txBytesPerSec": 7864320,
      "rxPacketsPerSec": 10000,
      "txPacketsPerSec": 8000,
      "interfaces": [
        {
          "name": "eth0",
          "type": "ethernet",
          "ipAddress": "192.168.1.100",
          "ipv6Address": "fe80::a00:27ff:fe4e:66a1",
          "macAddress": "08:00:27:4e:66:a1",
          "publicIp": "203.0.113.45",
          "netmask": "255.255.255.0",
          "gateway": "192.168.1.1",
          "mtu": 1500,
          "speed": 1000,
          "duplex": "full",
          "state": "up",
          "rxBytesPerSec": 10485760,
          "txBytesPerSec": 5242880
        },
        {
          "name": "docker0",
          "type": "bridge",
          "ipAddress": "172.17.0.1",
          "macAddress": "02:42:7f:c8:73:91",
          "mtu": 1500,
          "state": "up",
          "rxBytesPerSec": 5242880,
          "txBytesPerSec": 2621440
        }
      ]
    },
    "gpu": [
      {
        "deviceId": "GPU-0",
        "model": "NVIDIA A100 80GB",
        "vendor": "NVIDIA",
        "utilization": 95.5,
        "memoryUsed": 68719476736,
        "memoryTotal": 85899345920,
        "memoryPercent": 80.0,
        "temperature": 78,
        "powerDraw": 350,
        "fanSpeed": 75
      },
      {
        "deviceId": "GPU-1",
        "model": "NVIDIA A100 80GB",
        "vendor": "NVIDIA",
        "utilization": 88.2,
        "memoryUsed": 60129542144,
        "memoryTotal": 85899345920,
        "memoryPercent": 70.0,
        "temperature": 75,
        "powerDraw": 320,
        "fanSpeed": 70
      }
    ],
    "status": "online",
    "websocketConnected": true,
    "uptime": 259200
  },

  "owner": {
    "orgId": "org_001",
    "userId": "user_001"
  },
  "createdBy": "system",
  "createdAt": "2026-01-14T10:00:00.000Z",
  "updatedAt": "2026-01-14T10:00:00.000Z"
}
```

### 5.2 Resource Metric Sample (5min interval)

```json
{
  "_id": "65a1b2c3d4e5f6g7h8i9j0k2",
  "type": "resource",
  "entityType": "resource",
  "entityId": "65a0000000000000000000002",
  "entityName": "llama-inference-01",
  "timestamp": "2026-01-14T10:05:00.000Z",
  "interval": "5min",

  "metrics": {
    "containerId": "abc123def456",
    "resourceType": "inference-container",
    "cpu": {
      "usagePercent": 75.5,
      "limitCores": 8,
      "throttledTime": 1000000
    },
    "memory": {
      "usageBytes": 17179869184,
      "limitBytes": 21474836480,
      "usagePercent": 80.0,
      "cacheBytes": 1073741824
    },
    "network": {
      "rxBytes": 1048576000,
      "txBytes": 524288000,
      "rxPackets": 10000,
      "txPackets": 8000
    },
    "disk": {
      "readBytes": 104857600,
      "writeBytes": 52428800
    },
    "restartCount": 0,
    "uptime": 3600,
    "status": "running"
  },

  "owner": {
    "orgId": "org_001",
    "userId": "user_001"
  },
  "createdBy": "system",
  "createdAt": "2026-01-14T10:05:00.000Z",
  "updatedAt": "2026-01-14T10:05:00.000Z"
}
```

### 5.3 Deployment Metric Sample (5min interval)

```json
{
  "_id": "65a1b2c3d4e5f6g7h8i9j0k3",
  "type": "deployment",
  "entityType": "deployment",
  "entityId": "65a0000000000000000000003",
  "entityName": "llama-3.1-8b-production",
  "timestamp": "2026-01-14T10:05:00.000Z",
  "interval": "5min",

  "metrics": {
    "modelId": "65a0000000000000000000004",
    "modelName": "Llama-3.1-8B",
    "requestCount": 150,
    "requestRate": 0.5,
    "errorCount": 3,
    "errorRate": 2.0,
    "latency": {
      "p50": 250,
      "p95": 800,
      "p99": 1200,
      "avg": 350,
      "max": 1500,
      "min": 100
    },
    "tokens": {
      "input": 75000,
      "output": 50000,
      "total": 125000
    },
    "cost": 0.25,
    "healthStatus": "healthy"
  },

  "owner": {
    "orgId": "org_001",
    "userId": "user_001"
  },
  "createdBy": "system",
  "createdAt": "2026-01-14T10:05:00.000Z",
  "updatedAt": "2026-01-14T10:05:00.000Z"
}
```

### 5.4 System Metric Sample (5min interval)

```json
{
  "_id": "65a1b2c3d4e5f6g7h8i9j0k4",
  "type": "system",
  "entityType": "system",
  "entityId": "platform",
  "entityName": "AIWM Platform",
  "timestamp": "2026-01-14T10:05:00.000Z",
  "interval": "5min",

  "metrics": {
    "totalNodes": 10,
    "nodesOnline": 9,
    "nodesOffline": 1,
    "totalResources": 25,
    "resourcesRunning": 22,
    "resourcesStopped": 3,
    "totalDeployments": 15,
    "deploymentsRunning": 12,
    "deploymentsStopped": 3,
    "totalRequests": 5000,
    "totalTokens": 2500000,
    "totalCost": 12.5,
    "avgLatency": 450,
    "errorRate": 1.5
  },

  "owner": {
    "orgId": "org_001",
    "userId": "system"
  },
  "createdBy": "system",
  "createdAt": "2026-01-14T10:05:00.000Z",
  "updatedAt": "2026-01-14T10:05:00.000Z"
}
```

---

## 6. Storage Estimates

### 6.1 Document Size Estimates

| Metric Type | Avg Size | Fields Count | Notes |
|-------------|----------|--------------|-------|
| Node (minimal) | ~2 KB | 60-70 fields | Single CPU, no GPU |
| Node (full) | ~4 KB | 100+ fields | Multi-socket CPU, 2+ GPUs, multiple NICs |
| Resource | ~1 KB | 30-40 fields | Container metrics |
| Deployment | ~0.7 KB | 25-30 fields | Inference metrics |
| System | ~0.4 KB | 15-20 fields | Platform-wide stats |

### 6.2 Storage Growth Projection (100 nodes)

**Assumptions**:
- 100 nodes pushing metrics every 1 minute
- 500 resources pushing metrics every 5 minutes
- 100 deployments with metrics every 5 minutes
- 1 system metric every 5 minutes

**Daily Storage**:
- Node metrics: 100 nodes × 1440 min/day × 4 KB = **576 MB/day**
- Resource metrics: 500 resources × 288 intervals/day × 1 KB = **144 MB/day**
- Deployment metrics: 100 deployments × 288 intervals/day × 0.7 KB = **20 MB/day**
- System metrics: 1 × 288 intervals/day × 0.4 KB = **0.1 MB/day**

**Total**: ~**740 MB/day** = **22 GB/month** (raw data only)

With aggregation và retention:
- 1min (7 days): 5.2 GB
- 5min (30 days): 2.2 GB
- 1hour (90 days): 660 MB
- 1day (365 days): 270 MB

**Total Storage**: ~**8.3 GB** (stable after initial fill-up)

---

## 7. Schema Validation Rules

### 7.1 Required Fields Validation

```typescript
// All metrics must have these fields
const requiredFields = [
  'type',
  'entityType',
  'entityId',
  'timestamp',
  'interval',
  'metrics',
  'owner.orgId',
];

// Type-specific validation
if (type === 'node') {
  requiredFields.push('metrics.cpu', 'metrics.memory', 'metrics.status');
}
if (type === 'resource') {
  requiredFields.push('metrics.cpu', 'metrics.memory', 'metrics.status');
}
if (type === 'deployment') {
  requiredFields.push('metrics.requestCount', 'metrics.latency');
}
if (type === 'system') {
  requiredFields.push('metrics.totalNodes', 'metrics.nodesOnline');
}
```

### 7.2 Data Type Validation

- All percentages: 0-100 (float)
- All byte values: >= 0 (integer)
- All timestamps: Valid ISO 8601 Date
- All rates: >= 0 (float)
- All counts: >= 0 (integer)

### 7.3 Business Logic Validation

```typescript
// Memory validation
if (metrics.memory.used + metrics.memory.free > metrics.memory.total * 1.1) {
  throw new Error('Invalid memory stats: used+free exceeds total');
}

// GPU validation
if (metrics.gpu) {
  metrics.gpu.forEach((gpu) => {
    if (gpu.memoryUsed > gpu.memoryTotal) {
      throw new Error('Invalid GPU memory: used exceeds total');
    }
    if (gpu.temperature > 150 || gpu.temperature < 0) {
      throw new Error('Invalid GPU temperature: out of range');
    }
  });
}

// Deployment validation
if (metrics.errorCount > metrics.requestCount) {
  throw new Error('Invalid deployment stats: errors exceed requests');
}
```

---

## 8. API Response Formatting

### 8.1 Timestamp Handling

**In MongoDB**: Store as `Date` type
**In API Response**: Expose both formats

```typescript
// API Response Transform
{
  timestamp: metric.timestamp.getTime(), // Unix milliseconds: 1705234800000
  timestampIso: metric.timestamp.toISOString(), // ISO string: "2026-01-14T10:00:00.000Z"
  timestampReadable: metric.timestamp.toLocaleString('en-US', { timeZone: 'UTC' }) // "1/14/2026, 10:00:00 AM"
}
```

### 8.2 Field Filtering

Clients can request specific fields via `fields` query parameter:

```
GET /metrics/nodes/abc123?fields=cpu,memory,gpu
```

Response includes only requested fields:
```json
{
  "metrics": {
    "cpu": { ... },
    "memory": { ... },
    "gpu": [ ... ]
  }
}
```

---

## 9. Migration Strategy

### 9.1 Initial Setup

1. Create `metrics` collection
2. Create indexes (see section 4.1)
3. Set up TTL index for automatic cleanup
4. Seed with sample data for testing

### 9.2 Schema Versioning

```typescript
// Add schema version field for future migrations
@Prop({ default: 2 })
schemaVersion: number;
```

### 9.3 Backward Compatibility

- New optional fields can be added without migration
- Existing documents remain valid
- Aggregation queries should handle missing fields gracefully
- Old `metricType` field can coexist with new `type` during transition

---

**Next**: [03-api-design.md](./03-api-design.md) - REST API Endpoints
