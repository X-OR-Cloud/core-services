# AIWM WebSocket Protocol Specification

**Version:** 1.0
**Last Updated:** 2025-11-13
**Status:** 🔵 Design Review

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Authentication & Handshake](#authentication--handshake)
3. [Message Protocol](#message-protocol)
4. [Message Types](#message-types)
5. [Connection Management](#connection-management)
6. [Error Handling](#error-handling)
7. [Security Considerations](#security-considerations)

---

## Overview

### Purpose
WebSocket protocol cho giao tiếp real-time giữa Worker Nodes (GPU nodes) và AIWM Controller Service.

### Key Requirements
- ✅ **Worker-initiated connections** (NAT-friendly)
- ✅ **JWT-based authentication** (tương thích với IAM service)
- ✅ **Bidirectional messaging** (commands & telemetry)
- ✅ **Automatic reconnection** với exponential backoff
- ✅ **Connection state tracking** (online/offline)

### Transport
- **Library:** Socket.IO v4+
- **Namespace:** `/ws/node`
- **Protocol:** WebSocket với fallback HTTP long-polling
- **Port:** 3003 (AIWM Service)

---

## Authentication & Handshake

### 1. Connection Flow

```
┌─────────────┐                                ┌──────────────────┐
│ Worker Node │                                │ AIWM Controller  │
└──────┬──────┘                                └────────┬─────────┘
       │                                                 │
       │  1. WebSocket Connect với JWT token            │
       ├────────────────────────────────────────────────>│
       │     auth: { token: "eyJhbGc..." }              │
       │                                                 │
       │                                   2. Validate JWT
       │                                   3. Check node exists
       │                                   4. Update node status
       │                                                 │
       │  5. connection.ack (success)                   │
       │<────────────────────────────────────────────────┤
       │                                                 │
       │  6. node.register (node info)                  │
       ├────────────────────────────────────────────────>│
       │                                                 │
       │  7. register.ack (controller info)             │
       │<────────────────────────────────────────────────┤
       │                                                 │
       │  ✅ Connection established                     │
       │                                                 │
```

### 2. JWT Token Requirements

**Token Structure:**
```typescript
interface NodeJWTPayload {
  sub: string;           // Node ID (e.g., "node-abc123")
  username: string;      // Node name (e.g., "gpu-node-01")
  status: 'active' | 'inactive';
  roles: string[];       // ['node.worker', 'node.gpu'] - RBAC roles
  orgId: string;         // Organization ID
  groupId?: string;      // Optional: Node group
  agentId?: string;      // Optional: Associated agent
  appId?: string;        // Optional: App context
  iat: number;           // Issued at
  exp: number;           // Expiration
}
```

**Token Generation Workflow:**

```
Admin                    AIWM Service              Worker Node
  │                           │                         │
  │  1. Create Node           │                         │
  │  POST /api/nodes          │                         │
  ├──────────────────────────>│                         │
  │  { name, specs, ... }     │                         │
  │                           │                         │
  │  <- Node created          │                         │
  │  { nodeId: "node-abc" }   │                         │
  │                           │                         │
  │  2. Generate Token        │                         │
  │  POST /api/nodes/{id}/token                         │
  ├──────────────────────────>│                         │
  │                           │                         │
  │  <- Token created         │                         │
  │  { token: "eyJ...",       │                         │
  │    expiresIn: 86400 }     │                         │
  │                           │                         │
  │  3. Deploy Worker         │                         │
  │  (manual/automation)      │                         │
  │───────────────────────────┼────────────────────────>│
  │  - Copy token             │                         │
  │  - Set NODE_TOKEN env     │                         │
  │  - Start worker daemon    │                         │
  │                           │                         │
  │                           │  4. Connect with token  │
  │                           │<────────────────────────┤
  │                           │                         │
```

**API Endpoint (AIWM Service):**
```bash
# Create node token (Admin only)
POST /api/nodes/{nodeId}/token
Authorization: Bearer <admin-token>
Content-Type: application/json

Request Body (optional):
{
  "expiresIn": 86400,        // seconds (default: 24h)
  "description": "Production GPU Node 01"
}

Response:
{
  "nodeId": "node-abc123",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2025-11-14T10:00:00Z",
  "expiresIn": 86400,
  "createdAt": "2025-11-13T10:00:00Z",
  "description": "Production GPU Node 01"
}
```

**Worker Configuration:**
```bash
# On worker node - Set environment variable
export NODE_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
export CONTROLLER_URL="wss://aiwm.domain.com:3003"

# Start worker daemon
./worker-daemon start
```

**Token Validation Rules:**
- ✅ Token must be valid JWT signed with `JWT_SECRET`
- ✅ Token must not be expired
- ✅ `sub` (Node ID) must exist in database
- ✅ Node `status` must be `'active'`
- ✅ `roles` must contain `'node.worker'` hoặc `'node.gpu'`

### 3. Connection Handshake

#### Step 1: WebSocket Connection (Client-side)

```typescript
import { io, Socket } from 'socket.io-client';

const socket: Socket = io('ws://controller.domain:3003/ws/node', {
  auth: {
    token: process.env.NODE_TOKEN, // JWT token
  },
  reconnection: true,
  reconnectionDelay: 5000,        // Start with 5s
  reconnectionDelayMax: 60000,    // Max 60s
  reconnectionAttempts: Infinity,
  transports: ['websocket', 'polling'],
});
```

#### Step 2: Connection Acknowledgment (Server → Client)

**Event:** `connection.ack`

```typescript
{
  status: 'success',
  timestamp: '2025-11-13T10:00:00Z',
  nodeId: 'node-abc123',
  controllerId: 'controller-main',
  serverVersion: '1.0.0'
}
```

**Hoặc nếu lỗi (connection rejected):**
```typescript
{
  status: 'error',
  error: {
    code: 'AUTH_FAILED',
    message: 'Invalid or expired token',
    timestamp: '2025-11-13T10:00:00Z'
  }
}
// Connection sẽ bị disconnect
```

#### Step 3: Node Registration (Client → Server)

**Event:** `node.register`

```typescript
{
  nodeId: 'node-abc123',
  name: 'GPU-Node-01',
  hostname: 'gpu-node-01.local',

  // Network info
  ipAddress: '192.168.1.100',      // Private/LAN IP
  publicIpAddress: '203.0.113.10', // Public IP (from ipify.org, icanhazip.com, etc.)

  // Operating System info
  os: {
    platform: 'linux',             // 'linux' | 'darwin' | 'win32'
    distro: 'Ubuntu',              // Ubuntu, CentOS, Windows Server, etc.
    version: '22.04 LTS',
    arch: 'x64',                   // 'x64' | 'arm64'
    kernel: '5.15.0-91-generic'
  },

  // Hardware specs
  cpuCores: 32,
  cpuModel: 'Intel Xeon Gold 6342',
  ramTotal: 131072,      // MB
  diskTotal: 2048000,    // MB

  // GPU devices
  gpuDevices: [
    {
      deviceId: '0',
      model: 'NVIDIA RTX 4090',
      memoryTotal: 24576,  // MB
      pcieBusId: '0000:01:00.0',
      cudaVersion: '12.2',
      driverVersion: '535.129.03'
    },
    {
      deviceId: '1',
      model: 'NVIDIA RTX 4090',
      memoryTotal: 24576,
      pcieBusId: '0000:02:00.0',
      cudaVersion: '12.2',
      driverVersion: '535.129.03'
    }
  ],

  // Runtime info
  daemonVersion: '1.0.0',
  nodeStatus: 'ready',
  uptimeSeconds: 3600,

  // Container runtime
  containerRuntime: {
    type: 'docker',              // 'docker' | 'containerd' | 'podman'
    version: '24.0.7',
    rootDir: '/var/lib/docker'
  }
}
```

**Public IP Detection (Worker-side):**
```typescript
// Worker daemon code - Get public IP
async function getPublicIp(): Promise<string> {
  const services = [
    'https://api.ipify.org?format=json',
    'https://icanhazip.com',
    'https://api.my-ip.io/ip'
  ];

  for (const service of services) {
    try {
      const response = await fetch(service, { timeout: 5000 });
      const data = await response.json();
      return data.ip || data;
    } catch (error) {
      continue; // Try next service
    }
  }

  return 'unknown'; // Fallback
}
```

#### Step 4: Registration Acknowledgment (Server → Client)

**Event:** `register.ack`

```typescript
{
  status: 'success',
  nodeId: 'node-abc123',
  registeredAt: '2025-11-13T10:00:00Z',

  // Controller info
  controllerInfo: {
    controllerId: 'controller-main',
    heartbeatInterval: 30000,    // ms - expect heartbeat every 30s
    metricsInterval: 60000,      // ms - expect metrics every 60s
    timezone: 'UTC'
  },

  // Pending commands (nếu có commands đang chờ)
  pendingCommands: [
    // Array of commands if any
  ]
}
```

### 4. Authentication Error Codes

| Code | Message | HTTP Equivalent | Action |
|------|---------|----------------|--------|
| `TOKEN_MISSING` | No authentication token provided | 401 | Disconnect |
| `TOKEN_INVALID` | Invalid JWT token format | 401 | Disconnect |
| `TOKEN_EXPIRED` | JWT token has expired | 401 | Disconnect |
| `NODE_NOT_FOUND` | Node ID not found in database | 404 | Disconnect |
| `NODE_INACTIVE` | Node status is not active | 403 | Disconnect |
| `ROLE_MISSING` | Missing required node role | 403 | Disconnect |
| `NODE_ALREADY_CONNECTED` | Node already has active connection | 409 | Disconnect old |

---

## Message Protocol

### Message Structure

Tất cả messages đều tuân theo cấu trúc chuẩn:

```typescript
interface BaseMessage {
  type: string;           // Message type (e.g., 'deployment.create', 'telemetry.heartbeat')
  messageId: string;      // Unique message ID (UUID v4)
  timestamp: string;      // ISO 8601 timestamp
  data: object;           // Message payload (type-specific)
  metadata?: {            // Optional metadata
    correlationId?: string;  // For request-response tracking
    priority?: 'low' | 'normal' | 'high';
    retryCount?: number;
  };
}
```

### Resource-Based Message Structure

**Design Principle:** Messages theo cấu trúc `{resource}.{action}` - Clean, concise, và extensible.

**Message Pattern:**
```typescript
{
  type: '{resource}.{action}',    // e.g., 'deployment.create', 'model.download'
  messageId: string,               // UUID v4
  timestamp: string,               // ISO 8601
  resource: {
    type: 'deployment' | 'model' | 'job' | 'agent' | 'container' | 'system',
    id: string                     // Resource ID
  },
  data: {
    // Resource-specific data
  },
  metadata?: {
    correlationId?: string,        // For request-response tracking
    priority?: 'low' | 'normal' | 'high',
    retryCount?: number
  }
}
```

**Message Type Conventions:**
- **Commands (Controller → Worker):** Action verbs (`create`, `stop`, `update`, `delete`)
- **Events (Worker → Controller):** State nouns (`status`, `logs`, `metrics`)
- **Direction:** Implicit from socket connection
- **Meta-messages:** Keep prefix (`command.ack`, `command.result`, `telemetry.*`)

### Message Direction

**Controller → Worker (Commands):**

**Deployment Commands:**
- `deployment.create` - Create new deployment
- `deployment.stop` - Stop deployment
- `deployment.restart` - Restart deployment
- `deployment.update` - Update config
- `deployment.delete` - Remove deployment
- `deployment.query` - Get deployment details

**Model Commands:**
- `model.download` - Download model from registry
- `model.cache` - Cache model locally
- `model.delete` - Remove cached model
- `model.list` - List cached models

**Job Commands:** (Future - batch processing)
- `job.start` - Start batch job
- `job.stop` - Stop job
- `job.cancel` - Cancel job
- `job.query` - Get job status

**Agent Commands:** (Future - AI agents)
- `agent.start` - Start agent
- `agent.stop` - Stop agent
- `agent.execute` - Execute agent task
- `agent.query` - Get agent status

**Container Commands:**
- `container.list` - List containers
- `container.inspect` - Inspect container
- `container.logs` - Get container logs
- `container.stats` - Get container stats

**System Commands:**
- `system.healthCheck` - Request health status
- `system.restart` - Restart daemon
- `system.update` - Update daemon version
- `system.query` - Get system info

**Worker → Controller (Events & Telemetry):**
- `telemetry.heartbeat` - Regular heartbeat (every 30s)
- `telemetry.metrics` - GPU/system metrics (every 60s)
- `deployment.status` - Deployment status update
- `deployment.logs` - Deployment logs stream
- `model.downloadProgress` - Model download progress
- `job.status` - Job status update
- `agent.message` - Agent message/output
- `command.ack` - Command acknowledgment (meta)
- `command.result` - Command execution result (meta)

### Message Acknowledgment Pattern

Mọi command từ controller đều expect acknowledgment:

```
Controller                                     Worker Node
    │                                               │
    │  deployment.create (msgId: 123)              │
    ├──────────────────────────────────────────────>│
    │                                               │
    │  command.ack (correlationId: 123)            │
    │<──────────────────────────────────────────────┤
    │  (acknowledged, processing...)                │
    │                                               │
    │  ... (processing: pull image, start) ...      │
    │                                               │
    │  command.result (correlationId: 123)         │
    │<──────────────────────────────────────────────┤
    │  (deployment created successfully)            │
    │                                               │
    │  deployment.status (updates)                  │
    │<──────────────────────────────────────────────┤
    │  (status: starting → running)                 │
```

**Timeout Rules by Resource:**
- **Deployment commands:** ACK within 5s, Result within 120s
- **Model commands:** ACK within 5s, Result within 300s (download can be slow)
- **Job commands:** ACK within 5s, Result within 60s
- **Agent commands:** ACK within 5s, Result within 30s
- **System commands:** ACK within 5s, Result within 10s
- Nếu timeout → command considered failed

---

## Message Types

### 1. Controller → Worker: Commands

#### 1.1. Deployment Commands

##### 1.1.1. `deployment.create`

**Purpose:** Tạo deployment mới - deploy một model lên GPU node

**Message Schema:**
```typescript
{
  type: 'deployment.create',
  messageId: 'cmd-550e8400-e29b-41d4-a716-446655440000',
  timestamp: '2025-11-13T10:00:00Z',

  // Resource identification
  resource: {
    type: 'deployment',
    id: 'deploy-abc123'              // Deployment ID
  },

  // Command data
  data: {
    modelId: 'whisper-large-v3',      // Model to deploy
    modelPath: 's3://bucket/models/whisper-large-v3.tar.gz',

    // Container config
    containerName: 'triton-whisper-v3',
    containerImage: 'nvcr.io/nvidia/tritonserver:24.01-py3',
    containerPort: 8000,

    // GPU allocation
    gpuDeviceId: '0',                 // Which GPU to use ('0', '1', etc.)
    gpuMemoryLimit: 16384,            // MB

    // Runtime config
    environment: {
      MODEL_NAME: 'whisper-large-v3',
      BATCH_SIZE: '8',
      MAX_QUEUE_DELAY: '100'
    },

    // Health check
    healthCheckPath: '/v2/health/ready',
    healthCheckInterval: 10           // seconds
  },
  metadata: {
    priority: 'high',
    correlationId: 'req-12345'
  }
}
```

**Field Validation:**

| Field | Type | Required | Validation Rules |
|-------|------|----------|-----------------|
| `deploymentId` | string | ✅ | Pattern: `^deploy-[a-z0-9]+$`, max 64 chars |
| `modelId` | string | ✅ | Must exist in model registry |
| `modelPath` | string | ✅ | Valid S3 URL or MinIO path |
| `containerName` | string | ✅ | Valid Docker container name |
| `containerImage` | string | ✅ | Valid Docker image reference |
| `containerPort` | number | ✅ | Range: 1024-65535 |
| `gpuDeviceId` | string | ✅ | Must match available GPU device |
| `gpuMemoryLimit` | number | ❌ | Range: 1024-100000 MB |
| `environment` | object | ❌ | Key-value pairs |

**Expected Response:**

1. **Immediate ACK (within 5s):**
```typescript
{
  type: 'command.ack',
  messageId: 'ack-xxx',
  timestamp: '2025-11-13T10:00:01Z',
  data: {
    originalMessageId: 'cmd-550e8400-...',
    status: 'acknowledged',
    estimatedDuration: 60  // seconds
  },
  metadata: {
    correlationId: 'req-12345'
  }
}
```

2. **Final Result (within 120s):**
```typescript
{
  type: 'command.result',
  messageId: 'result-yyy',
  timestamp: '2025-11-13T10:01:30Z',
  data: {
    originalMessageId: 'cmd-550e8400-...',
    deploymentId: 'deploy-abc123',
    status: 'success',
    result: {
      containerId: 'docker-container-id',
      endpoint: 'http://192.168.1.100:8000',
      gpuAllocated: '0',
      startedAt: '2025-11-13T10:00:45Z'
    }
  },
  metadata: {
    correlationId: 'req-12345'
  }
}
```

**Error Response:**
```typescript
{
  type: 'command.result',
  data: {
    originalMessageId: 'cmd-550e8400-...',
    status: 'error',
    error: {
      code: 'GPU_NOT_AVAILABLE',
      message: 'GPU device 0 is already in use',
      details: {
        gpuDeviceId: '0',
        currentUsage: 95  // percent
      }
    }
  }
}
```

##### 1.1.2. `deployment.stop`

**Purpose:** Dừng một deployment đang chạy

**Message Schema:**
```typescript
{
  type: 'deployment.stop',
  messageId: 'cmd-xxx',
  timestamp: '2025-11-13T10:00:00Z',

  resource: {
    type: 'deployment',
    id: 'deploy-abc123'
  },

  data: {
    force: false,              // true = kill immediately, false = graceful shutdown
    timeout: 30                // seconds to wait before force kill
  },
  metadata: {
    priority: 'normal'
  }
}
```

**Field Validation:**

| Field | Type | Required | Validation Rules |
|-------|------|----------|-----------------|
| `deploymentId` | string | ✅ | Must be running deployment |
| `force` | boolean | ❌ | Default: false |
| `timeout` | number | ❌ | Range: 5-300 seconds, default: 30 |

**Expected Response:**
```typescript
{
  type: 'command.result',
  data: {
    originalMessageId: 'cmd-xxx',
    deploymentId: 'deploy-abc123',
    status: 'success',
    result: {
      stoppedAt: '2025-11-13T10:00:15Z',
      gracefulShutdown: true,
      resourcesReleased: {
        gpuMemory: 8192,  // MB freed
        cpuCores: 4
      }
    }
  }
}
```

#### 1.2. System Commands

##### 1.2.1. `system.healthCheck`

**Purpose:** Request immediate system health status

**Message Schema:**
```typescript
{
  type: 'system.healthCheck',
  messageId: 'cmd-xxx',
  timestamp: '2025-11-13T10:00:00Z',

  resource: {
    type: 'system',
    id: 'node-abc123'
  },

  data: {
    includeMetrics: true,      // Include GPU metrics
    includeDeployments: true   // Include all deployment statuses
  }
}
```

**Expected Response:**
```typescript
{
  type: 'command.result',
  data: {
    originalMessageId: 'cmd-xxx',
    status: 'success',
    result: {
      nodeStatus: 'healthy',
      uptimeSeconds: 86400,
      timestamp: '2025-11-13T10:00:01Z',

      // If includeMetrics: true
      metrics: {
        cpuUsage: 45,          // percent
        ramUsed: 65536,        // MB
        diskUsed: 512000,      // MB
        gpuDevices: [/* ... */]
      },

      // If includeDeployments: true
      deployments: [
        {
          deploymentId: 'deploy-abc123',
          status: 'running',
          uptime: 3600
        }
      ]
    }
  }
}
```

##### 1.1.3. `deployment.restart`

**Purpose:** Restart một deployment

**Message Schema:**
```typescript
{
  type: 'deployment.restart',
  messageId: 'cmd-xxx',
  timestamp: '2025-11-13T10:00:00Z',

  resource: {
    type: 'deployment',
    id: 'deploy-abc123'
  },

  data: {
    preserveData: true,        // Keep container volumes
    timeout: 60                // Max time for restart
  }
}
```

##### 1.1.4. `deployment.update`

**Purpose:** Update deployment configuration without full restart

**Message Schema:**
```typescript
{
  type: 'deployment.update',
  messageId: 'cmd-xxx',
  timestamp: '2025-11-13T10:00:00Z',

  resource: {
    type: 'deployment',
    id: 'deploy-abc123'
  },

  data: {
    config: {
      environment: {
        BATCH_SIZE: '16',      // Updated value
        MAX_QUEUE_DELAY: '200'
      },
      healthCheckInterval: 15
    }
  }
}
```

#### 1.3. Model Commands

##### 1.3.1. `model.download`

**Purpose:** Download model từ registry (HuggingFace, custom) và cache locally

**Message Schema:**
```typescript
{
  type: 'model.download',
  messageId: 'cmd-xxx',
  timestamp: '2025-11-13T10:00:00Z',

  resource: {
    type: 'model',
    id: 'whisper-large-v3'
  },

  data: {
    source: 'huggingface',           // 'huggingface' | 'minio' | 'http'
    sourcePath: 'openai/whisper-large-v3',
    version: 'main',                 // Git branch/tag
    targetPath: '/models/whisper-large-v3',

    // Optional: Authentication
    credentials: {
      token: process.env.HF_TOKEN
    }
  }
}
```

##### 1.3.2. `model.delete`

**Purpose:** Xóa cached model khỏi worker node

**Message Schema:**
```typescript
{
  type: 'model.delete',
  messageId: 'cmd-xxx',
  timestamp: '2025-11-13T10:00:00Z',

  resource: {
    type: 'model',
    id: 'whisper-large-v3'
  },

  data: {
    modelPath: '/models/whisper-large-v3',
    force: false  // Force delete even if in use
  }
}
```

---

### 2. Worker → Controller: Telemetry

#### 2.1. `telemetry.heartbeat`

**Purpose:** Regular heartbeat để maintain connection và report basic status

**Frequency:** Every **30 seconds** (configurable)

**Message Schema:**
```typescript
{
  type: 'telemetry.heartbeat',
  messageId: 'hb-xxx',
  timestamp: '2025-11-13T10:00:00Z',
  data: {
    nodeId: 'node-abc123',
    status: 'healthy',         // 'healthy' | 'degraded' | 'error'
    uptimeSeconds: 86400,

    // Quick stats
    activeDeployments: 2,
    cpuUsage: 45,              // percent
    ramUsage: 50,              // percent

    // GPU summary
    gpuStatus: [
      { deviceId: '0', utilization: 85, status: 'active' },
      { deviceId: '1', utilization: 0, status: 'idle' }
    ]
  }
}
```

**Field Validation:**

| Field | Type | Required | Validation Rules |
|-------|------|----------|-----------------|
| `nodeId` | string | ✅ | Must match authenticated node |
| `status` | enum | ✅ | 'healthy' \| 'degraded' \| 'error' |
| `uptimeSeconds` | number | ✅ | >= 0 |
| `activeDeployments` | number | ✅ | >= 0 |
| `cpuUsage` | number | ✅ | Range: 0-100 |
| `ramUsage` | number | ✅ | Range: 0-100 |
| `gpuStatus` | array | ✅ | One entry per GPU device |

**Response:** No response expected (fire-and-forget)

**Monitoring:**
- Controller tracks last heartbeat timestamp
- If no heartbeat for **90 seconds** (3x interval) → mark node as `'offline'`
- If node reconnects → automatic status recovery

#### 2.2. `telemetry.metrics`

**Purpose:** Detailed system và GPU metrics

**Frequency:** Every **60 seconds** (configurable)

**Message Schema:**
```typescript
{
  type: 'telemetry.metrics',
  messageId: 'metrics-xxx',
  timestamp: '2025-11-13T10:00:00Z',
  data: {
    nodeId: 'node-abc123',

    // CPU metrics
    cpu: {
      usage: 45.5,             // percent
      cores: 32,
      loadAverage: [2.5, 2.3, 2.1]  // 1min, 5min, 15min
    },

    // Memory metrics
    memory: {
      total: 131072,           // MB
      used: 65536,
      free: 65536,
      cached: 32768,
      usage: 50                // percent
    },

    // Disk metrics
    disk: {
      total: 2048000,          // MB
      used: 512000,
      free: 1536000,
      usage: 25                // percent
    },

    // Network metrics
    network: {
      bytesReceived: 1024000000,  // bytes since boot
      bytesSent: 512000000,
      packetsReceived: 1000000,
      packetsSent: 500000
    },

    // GPU metrics (detailed)
    gpuDevices: [
      {
        deviceId: '0',
        model: 'NVIDIA RTX 4090',

        // Utilization
        utilization: 85,        // percent
        memoryUsed: 16384,      // MB
        memoryTotal: 24576,
        memoryUsage: 67,        // percent

        // Temperature & Power
        temperature: 72,        // Celsius
        powerDraw: 350,         // Watts
        powerLimit: 450,

        // Processes
        processes: [
          {
            pid: 12345,
            processName: 'triton-server',
            memoryUsed: 8192    // MB
          }
        ],

        // Health
        status: 'active',       // 'active' | 'idle' | 'error'
        errors: []              // Array of error strings if any
      }
    ]
  }
}
```

**Response:** No response expected

#### 2.3. `deployment.status`

**Purpose:** Update deployment status (state changes)

**Trigger:** Khi deployment status thay đổi

**Message Schema:**
```typescript
{
  type: 'deployment.status',
  messageId: 'status-xxx',
  timestamp: '2025-11-13T10:00:00Z',
  data: {
    deploymentId: 'deploy-abc123',
    nodeId: 'node-abc123',

    // Status info
    status: 'running',        // 'queued' | 'starting' | 'running' | 'stopping' | 'stopped' | 'failed'
    previousStatus: 'starting',

    // Runtime info
    containerId: 'docker-abc123',
    containerName: 'triton-whisper-v3',
    endpoint: 'http://192.168.1.100:8000',

    // Resource usage
    gpuDeviceId: '0',
    gpuMemoryUsed: 8192,      // MB
    cpuCores: 4,

    // Metrics
    totalInferences: 15000,
    averageLatency: 125,      // ms
    uptimeSeconds: 3600,

    // Health
    lastHealthCheck: '2025-11-13T09:59:50Z',
    healthStatus: 'healthy',

    // Events (optional)
    events: [
      {
        timestamp: '2025-11-13T10:00:00Z',
        event: 'status_changed',
        message: 'Deployment started successfully',
        severity: 'info'
      }
    ]
  }
}
```

**Status Values:**

| Status | Description | Next Valid States |
|--------|-------------|------------------|
| `queued` | Đang chờ resources | `starting`, `failed` |
| `starting` | Container đang khởi động | `running`, `failed` |
| `running` | Đang chạy bình thường | `stopping`, `failed` |
| `stopping` | Đang shutdown | `stopped` |
| `stopped` | Đã dừng | `starting` (restart) |
| `failed` | Lỗi | `starting` (retry) |

#### 2.4. `deployment.logs`

**Purpose:** Stream logs từ deployment

**Trigger:** Real-time hoặc on-demand

**Message Schema:**
```typescript
{
  type: 'deployment.logs',
  messageId: 'logs-xxx',
  timestamp: '2025-11-13T10:00:00Z',
  data: {
    deploymentId: 'deploy-abc123',
    logs: [
      {
        timestamp: '2025-11-13T09:59:58Z',
        level: 'info',        // 'debug' | 'info' | 'warn' | 'error'
        source: 'stdout',     // 'stdout' | 'stderr'
        message: 'Model loaded successfully'
      },
      {
        timestamp: '2025-11-13T09:59:59Z',
        level: 'info',
        source: 'stdout',
        message: 'Server listening on port 8000'
      }
    ],
    moreAvailable: false      // true if more logs exist
  }
}
```

---

## Connection Management

### 1. Heartbeat Mechanism

**Purpose:** Detect connection health và node liveness

**Implementation:**

```typescript
// Worker-side (client)
const HEARTBEAT_INTERVAL = 30000;  // 30 seconds

setInterval(() => {
  socket.emit('telemetry.heartbeat', {
    type: 'telemetry.heartbeat',
    messageId: generateUUID(),
    timestamp: new Date().toISOString(),
    data: {
      nodeId: NODE_ID,
      status: getNodeStatus(),
      uptimeSeconds: process.uptime(),
      activeDeployments: getActiveDeploymentCount(),
      cpuUsage: getCpuUsage(),
      ramUsage: getRamUsage(),
      gpuStatus: getGpuSummary()
    }
  });
}, HEARTBEAT_INTERVAL);
```

**Controller-side:**
```typescript
// Track last heartbeat
nodeConnectionMap.set(nodeId, {
  socketId: socket.id,
  lastHeartbeat: new Date(),
  status: 'online'
});

// Monitor heartbeats
setInterval(() => {
  const now = Date.now();
  const HEARTBEAT_TIMEOUT = 90000;  // 3x interval

  for (const [nodeId, connection] of nodeConnectionMap) {
    const timeSinceHeartbeat = now - connection.lastHeartbeat.getTime();

    if (timeSinceHeartbeat > HEARTBEAT_TIMEOUT) {
      // Mark as offline
      await updateNodeStatus(nodeId, 'offline');
      nodeConnectionMap.delete(nodeId);

      // Emit alert
      await emitToNoti({
        event: 'service.alert',
        data: {
          name: 'node.offline',
          nodeId,
          message: `Node ${nodeId} missed heartbeat`
        }
      });
    }
  }
}, 30000);
```

### 2. Reconnection Strategy

**Client-side reconnection config:**
```typescript
const socket = io(CONTROLLER_URL, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 5000,         // Start: 5s
  reconnectionDelayMax: 60000,     // Max: 60s
  randomizationFactor: 0.5         // Add jitter to prevent thundering herd
});

// Exponential backoff with jitter:
// Attempt 1: 5s ± 2.5s
// Attempt 2: 10s ± 5s
// Attempt 3: 20s ± 10s
// ...
// Max: 60s ± 30s
```

**Reconnection events:**
```typescript
socket.on('connect', () => {
  console.log('Connected to controller');
  // Re-register node
  socket.emit('node.register', getNodeInfo());
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  // Socket.IO will auto-reconnect
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  // Socket.IO will retry with backoff
});
```

### 3. Connection State Machine

```
┌──────────┐
│  INIT    │
└────┬─────┘
     │ connect()
     ↓
┌──────────────┐   auth failed   ┌──────────────┐
│ CONNECTING   ├────────────────>│ DISCONNECTED │
└────┬─────────┘                 └──────────────┘
     │ auth success                      ↑
     ↓                                   │
┌──────────────┐                         │
│ REGISTERING  │   register failed       │
└────┬─────────┘────────────────────────>│
     │ register success                  │
     ↓                                   │
┌──────────────┐                         │
│  CONNECTED   │   disconnect / error    │
└────┬─────────┘────────────────────────>│
     │ ↑                                 │
     │ │ heartbeat                       │
     └─┘                                 │
     │                                   │
     │ no heartbeat (90s timeout)        │
     └───────────────────────────────────┘
```

### 4. Graceful Shutdown

**Worker-side:**
```typescript
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');

  // 1. Stop accepting new commands
  socket.emit('node.status', {
    status: 'shutting_down'
  });

  // 2. Wait for in-flight commands
  await waitForPendingCommands(timeout: 30000);

  // 3. Stop all deployments gracefully
  await stopAllDeployments(graceful: true);

  // 4. Disconnect
  socket.disconnect();

  process.exit(0);
});
```

**Controller-side:**
```typescript
@OnGatewayDisconnect()
async handleDisconnect(client: Socket) {
  const nodeId = this.getNodeId(client);

  // Update node status
  await this.nodeService.updateStatus(nodeId, 'offline');

  // Emit notification
  await this.emitNodeOfflineAlert(nodeId);

  // Clean up connection tracking
  this.connections.delete(nodeId);
}
```

---

## Error Handling

### 1. Error Response Format

```typescript
interface ErrorResponse {
  type: 'error';
  messageId: string;
  timestamp: string;
  error: {
    code: string;           // Machine-readable error code
    message: string;        // Human-readable message
    details?: object;       // Additional context
    retryable: boolean;     // Can client retry?
    retryAfter?: number;    // Seconds to wait before retry
  };
  metadata?: {
    correlationId?: string;
    originalMessageId?: string;
  };
}
```

### 2. Error Codes

#### Authentication Errors (1xxx)
| Code | Message | Retryable |
|------|---------|-----------|
| `1001` | TOKEN_MISSING | No |
| `1002` | TOKEN_INVALID | No |
| `1003` | TOKEN_EXPIRED | Yes (get new token) |
| `1004` | NODE_NOT_FOUND | No |
| `1005` | NODE_INACTIVE | No |
| `1006` | ROLE_MISSING | No |
| `1007` | NODE_ALREADY_CONNECTED | No |

#### Command Errors (2xxx)
| Code | Message | Retryable |
|------|---------|-----------|
| `2001` | COMMAND_INVALID | No |
| `2002` | DEPLOYMENT_NOT_FOUND | No |
| `2003` | MODEL_NOT_FOUND | No |
| `2004` | GPU_NOT_AVAILABLE | Yes (retry later) |
| `2005` | INSUFFICIENT_MEMORY | Yes (retry later) |
| `2006` | CONTAINER_START_FAILED | Yes |
| `2007` | DEPLOYMENT_ALREADY_RUNNING | No |
| `2008` | DEPLOYMENT_NOT_RUNNING | No |

#### System Errors (3xxx)
| Code | Message | Retryable |
|------|---------|-----------|
| `3001` | INTERNAL_ERROR | Yes |
| `3002` | TIMEOUT | Yes |
| `3003` | RESOURCE_EXHAUSTED | Yes (retry later) |
| `3004` | NETWORK_ERROR | Yes |

### 3. Error Handling Examples

**Example 1: GPU Not Available**
```typescript
// Command
{
  type: 'deployment.create',
  messageId: 'cmd-123',
  resource: { type: 'deployment', id: 'deploy-123' },
  data: { gpuDeviceId: '0', /* ... */ }
}

// Error Response
{
  type: 'command.result',
  messageId: 'result-456',
  timestamp: '2025-11-13T10:00:05Z',
  data: {
    originalMessageId: 'cmd-123',
    status: 'error',
    error: {
      code: '2004',
      message: 'GPU_NOT_AVAILABLE',
      details: {
        gpuDeviceId: '0',
        currentUtilization: 98,
        memoryUsed: 24000,
        memoryTotal: 24576,
        runningDeployments: ['deploy-xyz']
      },
      retryable: true,
      retryAfter: 300  // Try again in 5 minutes
    }
  }
}
```

**Example 2: Model Not Found**
```typescript
{
  type: 'command.result',
  data: {
    originalMessageId: 'cmd-123',
    status: 'error',
    error: {
      code: '2003',
      message: 'MODEL_NOT_FOUND',
      details: {
        modelId: 'invalid-model',
        modelPath: 's3://bucket/models/invalid-model.tar.gz'
      },
      retryable: false
    }
  }
}
```

---

## Security Considerations

### 1. Authentication Security

✅ **JWT Token Security:**
- Tokens MUST be signed với `HS256` algorithm
- Secret key MUST be strong (min 32 characters)
- Token expiration MUST be enforced (recommend: 24h for nodes)
- Refresh token mechanism để avoid re-registration

✅ **Token Storage:**
- Worker nodes MUST store tokens securely (environment variables, secrets manager)
- Tokens MUST NOT be logged or exposed in error messages

### 2. Transport Security

✅ **TLS/SSL:**
- Production MUST use WSS (WebSocket Secure)
- Certificate validation enabled
- Minimum TLS 1.2

✅ **Origin Validation:**
```typescript
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Only allow registered node IPs or domain
      if (isAllowedNodeOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origin not allowed'));
      }
    }
  }
});
```

### 3. Rate Limiting

✅ **Connection Rate Limiting:**
- Max 5 connection attempts per minute per node
- Exponential backoff required

✅ **Message Rate Limiting:**
- Heartbeat: Max 1 per 30 seconds
- Metrics: Max 1 per 60 seconds
- Commands: Max 10 per minute
- Status updates: Max 100 per minute

### 4. Input Validation

✅ **All incoming messages MUST be validated:**
- Schema validation using class-validator
- Sanitize strings to prevent injection
- Validate enum values
- Check numeric ranges
- Validate UUIDs format

### 5. Audit Logging

✅ **Log all security-relevant events:**
- Connection attempts (success/failure)
- Authentication failures
- Command executions
- Deployment state changes
- Error conditions

**Log format:**
```json
{
  "timestamp": "2025-11-13T10:00:00Z",
  "event": "connection.auth_failed",
  "nodeId": "node-abc123",
  "ip": "192.168.1.100",
  "reason": "TOKEN_EXPIRED",
  "correlationId": "xxx"
}
```

---

## Implementation Checklist

### Phase 2.1: Basic WebSocket Gateway
- [ ] Create `NodeGateway` class with `/ws/node` namespace
- [ ] Implement JWT authentication middleware
- [ ] Connection/disconnection handlers
- [ ] Connection state tracking

### Phase 2.2: Message Handlers
- [ ] `node.register` handler
- [ ] `telemetry.heartbeat` handler
- [ ] `telemetry.metrics` handler
- [ ] `deployment.status` handler

### Phase 2.3: Command Senders
- [ ] `deployment.create` sender (controller → worker)
- [ ] `deployment.stop` sender
- [ ] `deployment.restart` sender
- [ ] `deployment.update` sender
- [ ] `model.download` sender
- [ ] `system.healthCheck` sender
- [ ] Command acknowledgment tracking
- [ ] Command timeout handling

### Phase 2.4: Connection Management
- [ ] Heartbeat monitoring
- [ ] Auto-reconnection handling
- [ ] Graceful shutdown
- [ ] Node status updates (online/offline)

### Phase 2.5: Error Handling & Validation
- [ ] Message validation with DTOs
- [ ] Error response formatting
- [ ] Rate limiting
- [ ] Audit logging

---

**Document Status:** Ready for Review
**Next Steps:** Review và approval before implementation
**Estimated Implementation:** 2-3 days
