# Metrics Module - API Design

**Version**: 2.0
**Date**: 2026-01-14
**Status**: Updated for v2.0 Schema

---

## 📋 Table of Contents

1. [API Overview](#api-overview)
2. [Push API Endpoints](#push-api-endpoints)
3. [Query API Endpoints](#query-api-endpoints)
4. [Error Handling](#error-handling)
5. [API Examples](#api-examples)

---

## 1. API Overview

### 1.1 Base URL

```
http://localhost:3003/metrics
```

### 1.2 Authentication

**All endpoints require JWT authentication** via `Authorization` header:

```
Authorization: Bearer <JWT_TOKEN>
```

### 1.3 Endpoint Categories

| Category | Purpose | Primary Users |
|----------|---------|---------------|
| **Push API** | Receive metrics từ external systems | Node daemons, Container runtimes |
| **Query API** | Query metrics data | Frontend apps, External monitoring tools |
| **Admin API** | Management operations | Platform admins (Phase 2) |

---

## 2. Push API Endpoints

### 2.1 Push Node Metrics

**Endpoint**: `POST /metrics/push/node`

**Purpose**: Node daemon push hardware metrics lên server.

**Authentication**: JWT với `nodeId` claim (validates ownership)

**Request Body**:

```typescript
interface PushNodeMetricsDto {
  nodeId: string;              // Must match JWT claim
  timestamp: string;           // ISO 8601 UTC timestamp
  interval?: string;           // Optional, default '1min'

  cpu: {
    usage: number;             // % (0-100)
    cores: number;
    loadAverage: [number, number, number]; // [1min, 5min, 15min]

    // Optional: Multi-socket CPU details (v2.0)
    sockets?: number;
    coresPerSocket?: number;
    threadsPerCore?: number;
    details?: Array<{
      socketId: number;
      model: string;           // e.g., "Intel Xeon Gold 6348"
      vendor: string;
      frequency: number;       // MHz
      cacheSize?: number;      // L3 cache in KB
      cores: number;
      usage?: number;          // Per-socket usage
    }>;
  };

  memory: {
    total: number;             // bytes
    used: number;
    free: number;
    cached: number;
  };

  disk: {
    total: number;             // bytes
    used: number;
    free: number;
    readBytesPerSec: number;
    writeBytesPerSec: number;
    readOpsPerSec?: number;
    writeOpsPerSec?: number;
  };

  network: {
    rxBytesPerSec: number;
    txBytesPerSec: number;

    // Optional: Per-interface details (v2.0)
    interfaces?: Array<{
      name: string;            // e.g., "eth0", "docker0"
      type: string;            // "ethernet", "wifi", "bridge", "vpn"
      ipAddress?: string;      // Local IP: "192.168.1.100"
      ipv6Address?: string;
      macAddress?: string;
      publicIp?: string;       // Public IP tracking
      netmask?: string;
      gateway?: string;
      mtu?: number;
      speed?: number;          // Link speed in Mbps
      duplex?: string;         // "full" | "half"
      state: string;           // "up" | "down"
      rxBytesPerSec: number;
      txBytesPerSec: number;
    }>;

    // Deprecated (kept for backward compatibility)
    rxPacketsPerSec?: number;
    txPacketsPerSec?: number;
    rxDropped?: number;
    txDropped?: number;
  };

  gpu?: Array<{
    deviceId: string;
    model: string;
    utilization: number;       // % (0-100)
    memoryUsed: number;        // bytes
    memoryTotal: number;
    temperature: number;       // Celsius
    powerDraw?: number;        // Watts
    fanSpeed?: number;         // % (0-100)
  }>;

  status: 'online' | 'offline' | 'maintenance';
  websocketConnected: boolean;
  uptime: number;              // seconds

  // Optional: System information (v2.0)
  systemInfo?: {
    os: {
      name: string;            // "Ubuntu", "CentOS"
      version: string;         // "22.04 LTS"
      kernel: string;          // "5.15.0-91-generic"
      platform: string;        // "linux", "darwin", "win32"
    };
    architecture: {
      cpu: string;             // "x86_64", "aarch64", "arm64"
      bits: number;            // 32 or 64
      endianness: string;      // "LE" or "BE"
    };
    containerRuntime?: {
      type: string;            // "docker", "containerd", "podman"
      version: string;         // "24.0.7"
      apiVersion?: string;
      storage: {
        driver: string;        // "overlay2", "btrfs"
        filesystem: string;    // "ext4", "xfs"
      };
    };
    virtualization?: {
      type: string;            // "kvm", "vmware", "hyperv", "none"
      role: string;            // "host" or "guest"
    };
  };
}
```

**Response**: `201 Created`

```json
{
  "success": true,
  "message": "Node metrics received successfully",
  "data": {
    "metricId": "65a1b2c3d4e5f6g7h8i9j0k1",
    "nodeId": "65a0000000000000000000001",
    "timestamp": "2026-01-14T10:00:00.000Z",
    "interval": "1min"
  }
}
```

**Error Responses**:

- `400 Bad Request`: Invalid data format hoặc validation failed
- `401 Unauthorized`: Missing hoặc invalid JWT token
- `403 Forbidden`: nodeId không match với JWT claim
- `422 Unprocessable Entity`: Business logic validation failed

**Rate Limiting**: 1 request/minute per node (configurable)

**Example cURL**:

```bash
curl -X POST http://localhost:3003/metrics/push/node \
  -H "Authorization: Bearer $NODE_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "nodeId": "65a0000000000000000000001",
    "timestamp": "2026-01-14T10:00:00.000Z",
    "cpu": {
      "usage": 45.8,
      "cores": 16,
      "loadAverage": [2.5, 2.8, 3.1]
    },
    "memory": {
      "total": 68719476736,
      "used": 34359738368,
      "free": 30359738368,
      "cached": 4000000000
    },
    "disk": {
      "total": 1099511627776,
      "used": 549755813888,
      "free": 549755813888,
      "readBytesPerSec": 10485760,
      "writeBytesPerSec": 5242880
    },
    "network": {
      "rxBytesPerSec": 1048576,
      "txBytesPerSec": 524288
    },
    "gpu": [{
      "deviceId": "GPU-0",
      "model": "NVIDIA A100",
      "utilization": 85.5,
      "memoryUsed": 68719476736,
      "memoryTotal": 85899345920,
      "temperature": 72
    }],
    "status": "online",
    "websocketConnected": true,
    "uptime": 86400
  }'
```

---

### 2.2 Push Resource Metrics

**Endpoint**: `POST /metrics/push/resource`

**Purpose**: Container runtime hoặc VM hypervisor push resource metrics.

**Authentication**: JWT với appropriate permissions

**Request Body**:

```typescript
interface PushResourceMetricsDto {
  resourceId: string;          // Resource._id
  timestamp: string;           // ISO 8601 UTC timestamp
  interval?: string;           // Optional, default '5min'

  containerId?: string;        // For containers
  vmId?: string;               // For VMs
  resourceType: 'inference-container' | 'application-container' | 'virtual-machine';

  cpu: {
    usagePercent: number;      // % (0-100)
    limitCores: number;
    throttledTime?: number;    // nanoseconds
  };

  memory: {
    usageBytes: number;
    limitBytes: number;
    cacheBytes?: number;
  };

  network?: {
    rxBytes: number;
    txBytes: number;
    rxPackets?: number;
    txPackets?: number;
  };

  disk?: {
    readBytes: number;
    writeBytes: number;
  };

  restartCount: number;
  uptime: number;              // seconds
  status: 'running' | 'stopped' | 'restarting' | 'error';
}
```

**Response**: `201 Created`

```json
{
  "success": true,
  "message": "Resource metrics received successfully",
  "data": {
    "metricId": "65a1b2c3d4e5f6g7h8i9j0k2",
    "resourceId": "65a0000000000000000000002",
    "timestamp": "2026-01-14T10:05:00.000Z",
    "interval": "5min"
  }
}
```

**Rate Limiting**: 1 request/5 minutes per resource

**Example cURL**:

```bash
curl -X POST http://localhost:3003/metrics/push/resource \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceId": "65a0000000000000000000002",
    "timestamp": "2026-01-14T10:05:00.000Z",
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
      "cacheBytes": 1073741824
    },
    "network": {
      "rxBytes": 1048576000,
      "txBytes": 524288000
    },
    "restartCount": 0,
    "uptime": 3600,
    "status": "running"
  }'
```

---

### 2.3 Batch Push Metrics (Optional - Phase 2)

**Endpoint**: `POST /metrics/push/batch`

**Purpose**: Push multiple metrics trong một request (reduce network overhead).

**Request Body**:

```typescript
interface PushBatchMetricsDto {
  metrics: Array<{
    type: 'node' | 'resource';
    data: PushNodeMetricsDto | PushResourceMetricsDto;
  }>;
}
```

**Response**: `207 Multi-Status`

```json
{
  "success": true,
  "message": "Batch metrics processed",
  "results": [
    {
      "index": 0,
      "status": 201,
      "metricId": "65a1b2c3d4e5f6g7h8i9j0k1"
    },
    {
      "index": 1,
      "status": 400,
      "error": "Invalid data format"
    }
  ],
  "summary": {
    "total": 10,
    "success": 9,
    "failed": 1
  }
}
```

---

## 3. Query API Endpoints

### 3.1 Query Node Metrics

**Endpoint**: `GET /metrics/nodes/:nodeId`

**Purpose**: Query metrics history cho một node cụ thể.

**Authentication**: JWT với read permissions

**Query Parameters**:

```typescript
interface QueryNodeMetricsDto {
  startTime: string;           // ISO 8601 UTC timestamp (required)
  endTime: string;             // ISO 8601 UTC timestamp (required)
  interval?: '1min' | '5min' | '1hour' | '1day'; // Optional, default '1min'
  fields?: string;             // Comma-separated, e.g., 'cpu,memory,gpu'
  page?: number;               // Default 1
  limit?: number;              // Default 100, max 1000
}
```

**Response**: `200 OK`

```json
{
  "success": true,
  "data": {
    "nodeId": "65a0000000000000000000001",
    "nodeName": "gpu-worker-01",
    "interval": "1min",
    "timeRange": {
      "start": "2026-01-14T09:00:00.000Z",
      "end": "2026-01-14T10:00:00.000Z"
    },
    "metrics": [
      {
        "timestamp": "2026-01-14T09:00:00.000Z",
        "cpu": {
          "usage": 45.8,
          "cores": 16,
          "loadAverage": [2.5, 2.8, 3.1]
        },
        "memory": {
          "total": 68719476736,
          "used": 34359738368,
          "free": 30359738368,
          "cached": 4000000000,
          "usagePercent": 50.0
        },
        "gpu": [{
          "deviceId": "GPU-0",
          "utilization": 85.5,
          "memoryPercent": 80.0,
          "temperature": 72
        }]
      }
      // ... more data points
    ],
    "pagination": {
      "page": 1,
      "limit": 100,
      "total": 61,
      "pages": 1
    }
  }
}
```

**Example cURL**:

```bash
curl -X GET "http://localhost:3003/metrics/nodes/65a0000000000000000000001?startTime=2026-01-14T09:00:00.000Z&endTime=2026-01-14T10:00:00.000Z&interval=1min&fields=cpu,memory,gpu" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

---

### 3.2 Query Resource Metrics

**Endpoint**: `GET /metrics/resources/:resourceId`

**Purpose**: Query metrics history cho một resource cụ thể.

**Query Parameters**: Same as Node Metrics

**Response**: `200 OK`

```json
{
  "success": true,
  "data": {
    "resourceId": "65a0000000000000000000002",
    "resourceName": "llama-inference-01",
    "resourceType": "inference-container",
    "interval": "5min",
    "timeRange": {
      "start": "2026-01-14T09:00:00.000Z",
      "end": "2026-01-14T10:00:00.000Z"
    },
    "metrics": [
      {
        "timestamp": "2026-01-14T09:00:00.000Z",
        "cpu": {
          "usagePercent": 75.5,
          "limitCores": 8
        },
        "memory": {
          "usageBytes": 17179869184,
          "limitBytes": 21474836480,
          "usagePercent": 80.0
        },
        "status": "running",
        "uptime": 3600
      }
      // ... more data points
    ],
    "pagination": {
      "page": 1,
      "limit": 100,
      "total": 13,
      "pages": 1
    }
  }
}
```

---

### 3.3 Query Deployment Metrics

**Endpoint**: `GET /metrics/deployments/:deploymentId`

**Purpose**: Query inference performance metrics cho một deployment.

**Query Parameters**: Same as Node Metrics

**Response**: `200 OK`

```json
{
  "success": true,
  "data": {
    "deploymentId": "65a0000000000000000000003",
    "deploymentName": "llama-3.1-8b-production",
    "modelName": "Llama-3.1-8B",
    "interval": "5min",
    "timeRange": {
      "start": "2026-01-14T09:00:00.000Z",
      "end": "2026-01-14T10:00:00.000Z"
    },
    "metrics": [
      {
        "timestamp": "2026-01-14T09:00:00.000Z",
        "requestCount": 150,
        "requestRate": 0.5,
        "errorCount": 3,
        "errorRate": 2.0,
        "latency": {
          "p50": 250,
          "p95": 800,
          "p99": 1200,
          "avg": 350
        },
        "tokens": {
          "input": 75000,
          "output": 50000,
          "total": 125000
        },
        "cost": 0.25,
        "healthStatus": "healthy"
      }
      // ... more data points
    ],
    "pagination": {
      "page": 1,
      "limit": 100,
      "total": 13,
      "pages": 1
    }
  }
}
```

---

### 3.4 Query System Metrics

**Endpoint**: `GET /metrics/system`

**Purpose**: Query platform-wide aggregated metrics.

**Query Parameters**: Same as Node Metrics (no entityId needed)

**Response**: `200 OK`

```json
{
  "success": true,
  "data": {
    "interval": "5min",
    "timeRange": {
      "start": "2026-01-14T09:00:00.000Z",
      "end": "2026-01-14T10:00:00.000Z"
    },
    "metrics": [
      {
        "timestamp": "2026-01-14T09:00:00.000Z",
        "totalNodes": 10,
        "nodesOnline": 9,
        "nodesOffline": 1,
        "totalResources": 25,
        "resourcesRunning": 22,
        "totalDeployments": 15,
        "deploymentsRunning": 12,
        "totalRequests": 5000,
        "totalTokens": 2500000,
        "totalCost": 12.5,
        "avgLatency": 450,
        "errorRate": 1.5
      }
      // ... more data points
    ],
    "pagination": {
      "page": 1,
      "limit": 100,
      "total": 13,
      "pages": 1
    }
  }
}
```

---

### 3.5 Query Multi-Entity Metrics (Optional)

**Endpoint**: `GET /metrics/query`

**Purpose**: Query metrics cho multiple entities cùng lúc (advanced queries).

**Query Parameters**:

```typescript
interface QueryMultiMetricsDto {
  type: 'node' | 'resource' | 'deployment';
  entityIds: string;           // Comma-separated IDs
  startTime: string;
  endTime: string;
  interval?: string;
  aggregation?: 'avg' | 'sum' | 'min' | 'max'; // Aggregate across entities
  fields?: string;
  page?: number;
  limit?: number;
}
```

**Response**: `200 OK`

```json
{
  "success": true,
  "data": {
    "type": "node",
    "aggregation": "avg",
    "interval": "1min",
    "timeRange": {
      "start": "2026-01-14T09:00:00.000Z",
      "end": "2026-01-14T10:00:00.000Z"
    },
    "entities": [
      {
        "entityId": "65a0000000000000000000001",
        "entityName": "gpu-worker-01"
      },
      {
        "entityId": "65a0000000000000000000002",
        "entityName": "gpu-worker-02"
      }
    ],
    "metrics": [
      {
        "timestamp": "2026-01-14T09:00:00.000Z",
        "cpu": {
          "usage": 48.5  // Average across all entities
        },
        "memory": {
          "usagePercent": 55.0
        }
      }
      // ... more aggregated data points
    ],
    "pagination": {
      "page": 1,
      "limit": 100,
      "total": 61,
      "pages": 1
    }
  }
}
```

**Example cURL**:

```bash
curl -X GET "http://localhost:3003/metrics/query?type=node&entityIds=65a0001,65a0002&startTime=2026-01-14T09:00:00Z&endTime=2026-01-14T10:00:00Z&aggregation=avg&fields=cpu,memory" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

---

### 3.6 Get Latest Metrics

**Endpoint**: `GET /metrics/:type/:entityId/latest`

**Purpose**: Get most recent metric snapshot cho một entity (for real-time displays).

**Path Parameters**:
- `type`: `node` | `resource` | `deployment`
- `entityId`: Entity identifier

**Response**: `200 OK`

```json
{
  "success": true,
  "data": {
    "type": "node",
    "entityId": "65a0000000000000000000001",
    "entityName": "gpu-worker-01",
    "timestamp": "2026-01-14T10:00:00.000Z",
    "interval": "1min",
    "metrics": {
      "cpu": {
        "usage": 45.8,
        "cores": 16
      },
      "memory": {
        "usagePercent": 50.0
      },
      "gpu": [{
        "deviceId": "GPU-0",
        "utilization": 85.5,
        "temperature": 72
      }],
      "status": "online"
    }
  }
}
```

**Example cURL**:

```bash
curl -X GET http://localhost:3003/metrics/node/65a0000000000000000000001/latest \
  -H "Authorization: Bearer $JWT_TOKEN"
```

---

## 4. Error Handling

### 4.1 Standard Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid metric data format",
    "details": {
      "field": "cpu.usage",
      "constraint": "must be between 0 and 100",
      "received": 150
    },
    "timestamp": "2026-01-14T10:00:00.000Z",
    "correlationId": "abc-123-def-456"
  }
}
```

### 4.2 Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input data format |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Entity not found |
| `CONFLICT` | 409 | Duplicate metric data |
| `UNPROCESSABLE_ENTITY` | 422 | Business logic validation failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_SERVER_ERROR` | 500 | Server error |

### 4.3 Validation Error Details

**Example: Invalid CPU Usage**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Metric validation failed",
    "details": [
      {
        "field": "cpu.usage",
        "constraint": "must be between 0 and 100",
        "received": 150
      },
      {
        "field": "memory.used",
        "constraint": "must not exceed memory.total",
        "received": { "used": 100, "total": 80 }
      }
    ]
  }
}
```

---

## 5. API Examples

### 5.1 Node Daemon Push Workflow

**Scenario**: Node daemon push metrics every minute

```bash
#!/bin/bash
# Node daemon script

NODE_ID="65a0000000000000000000001"
NODE_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
API_URL="http://localhost:3003/metrics/push/node"

while true; do
  # Collect metrics
  CPU_USAGE=$(get_cpu_usage)
  MEMORY_STATS=$(get_memory_stats)
  GPU_STATS=$(get_gpu_stats)

  # Build payload
  PAYLOAD=$(cat <<EOF
{
  "nodeId": "$NODE_ID",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "cpu": $CPU_USAGE,
  "memory": $MEMORY_STATS,
  "disk": $(get_disk_stats),
  "network": $(get_network_stats),
  "gpu": $GPU_STATS,
  "status": "online",
  "websocketConnected": true,
  "uptime": $(cat /proc/uptime | cut -d' ' -f1)
}
EOF
)

  # Push to server
  curl -X POST "$API_URL" \
    -H "Authorization: Bearer $NODE_JWT" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD"

  # Wait 1 minute
  sleep 60
done
```

---

### 5.2 Frontend Query Workflow

**Scenario**: Frontend dashboard query node metrics for last hour

```typescript
// Frontend TypeScript code

interface MetricsQueryParams {
  nodeId: string;
  startTime: string;
  endTime: string;
  interval: string;
  fields?: string;
}

async function fetchNodeMetrics(params: MetricsQueryParams) {
  const { nodeId, startTime, endTime, interval, fields } = params;

  const queryString = new URLSearchParams({
    startTime,
    endTime,
    interval,
    ...(fields && { fields }),
  }).toString();

  const response = await fetch(
    `http://localhost:3003/metrics/nodes/${nodeId}?${queryString}`,
    {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('jwt')}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  return response.json();
}

// Usage
const now = new Date();
const oneHourAgo = new Date(now.getTime() - 3600000);

const metricsData = await fetchNodeMetrics({
  nodeId: '65a0000000000000000000001',
  startTime: oneHourAgo.toISOString(),
  endTime: now.toISOString(),
  interval: '1min',
  fields: 'cpu,memory,gpu',
});

console.log('Node Metrics:', metricsData);
```

---

### 5.3 Container Runtime Push Workflow

**Scenario**: Docker daemon push container metrics every 5 minutes

```python
# Python script for container metrics push

import docker
import requests
import time
from datetime import datetime

AIWM_API = "http://localhost:3003/metrics/push/resource"
JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

client = docker.from_env()

def get_container_metrics(container):
    stats = container.stats(stream=False)

    # Calculate CPU usage
    cpu_delta = stats['cpu_stats']['cpu_usage']['total_usage'] - \
                stats['precpu_stats']['cpu_usage']['total_usage']
    system_delta = stats['cpu_stats']['system_cpu_usage'] - \
                   stats['precpu_stats']['system_cpu_usage']
    cpu_percent = (cpu_delta / system_delta) * 100.0

    # Memory stats
    memory_usage = stats['memory_stats']['usage']
    memory_limit = stats['memory_stats']['limit']
    memory_percent = (memory_usage / memory_limit) * 100.0

    # Network stats
    networks = stats.get('networks', {})
    rx_bytes = sum(net['rx_bytes'] for net in networks.values())
    tx_bytes = sum(net['tx_bytes'] for net in networks.values())

    return {
        'cpu': {
            'usagePercent': round(cpu_percent, 2),
            'limitCores': 8,
        },
        'memory': {
            'usageBytes': memory_usage,
            'limitBytes': memory_limit,
            'usagePercent': round(memory_percent, 2),
        },
        'network': {
            'rxBytes': rx_bytes,
            'txBytes': tx_bytes,
        },
        'status': container.status,
    }

def push_metrics(resource_id, container_id, metrics):
    payload = {
        'resourceId': resource_id,
        'containerId': container_id,
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'resourceType': 'inference-container',
        'restartCount': 0,
        'uptime': 3600,
        **metrics,
    }

    response = requests.post(
        AIWM_API,
        json=payload,
        headers={
            'Authorization': f'Bearer {JWT_TOKEN}',
            'Content-Type': 'application/json',
        },
    )

    return response.json()

# Main loop
while True:
    containers = client.containers.list(
        filters={'label': 'hydra.resource.id'}
    )

    for container in containers:
        resource_id = container.labels['hydra.resource.id']
        metrics = get_container_metrics(container)
        result = push_metrics(resource_id, container.id, metrics)
        print(f"Pushed metrics for {resource_id}: {result}")

    time.sleep(300)  # Wait 5 minutes
```

---

## 6. Rate Limiting

### 6.1 Rate Limit Headers

All API responses include rate limit headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1705234800
```

### 6.2 Rate Limit Policies

| Endpoint Pattern | Limit | Window |
|------------------|-------|--------|
| `POST /metrics/push/node` | 1 request | 1 minute per node |
| `POST /metrics/push/resource` | 1 request | 5 minutes per resource |
| `GET /metrics/**` | 60 requests | 1 minute per user |
| `POST /metrics/push/batch` | 10 requests | 1 minute per user |

### 6.3 Rate Limit Exceeded Response

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please retry after 60 seconds.",
    "retryAfter": 60,
    "timestamp": "2026-01-14T10:00:00.000Z"
  }
}
```

---

## 7. Pagination

### 7.1 Pagination Parameters

```
?page=1&limit=100
```

- `page`: Page number (default: 1, min: 1)
- `limit`: Items per page (default: 100, max: 1000)

### 7.2 Pagination Response

```json
{
  "pagination": {
    "page": 1,
    "limit": 100,
    "total": 250,
    "pages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

## 8. Swagger Documentation

All endpoints sẽ được document đầy đủ trong Swagger UI:

```
http://localhost:3003/api-docs
```

**Swagger Tags**:
- `Metrics - Push API`: Push endpoints cho external systems
- `Metrics - Query API`: Query endpoints cho frontend
- `Metrics - Admin`: Admin endpoints (Phase 2)

---

**Next**: [04-aggregation-strategy.md](./04-aggregation-strategy.md) - Data Aggregation & Retention
