# AIWM Service - Architecture Document

**Version:** 1.0
**Last Updated:** 2025-11-13
**Status:** 🟡 In Development

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Service Communication](#service-communication)
4. [Technology Stack](#technology-stack)
5. [Data Models](#data-models)
6. [Deployment Architecture](#deployment-architecture)
7. [Design Decisions](#design-decisions)

---

## Overview

AIWM (AI Workflow Management) là hệ thống quản lý và triển khai AI/ML workloads trên multi-GPU infrastructure. Service cung cấp khả năng:

- Quản lý GPU nodes (on-premise/cloud)
- Model Registry và deployment
- AI Agent framework với MCP tools
- Real-time communication với nodes và users

**Repository:** `hydra-services` monorepo
**Service Port:** 3003
**Database:** MongoDB (`hydra-aiwm`)
**Queue:** BullMQ (Redis)
**Storage:** MinIO (S3-compatible)

---

## High-Level Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Web Client (Browser/SDK)                                  │
│    - Socket.IO Client (NOTI)                               │
│    - HTTP/REST Client (AIWM)                               │
│    - File Upload (MinIO)                                   │
│                                                             │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┬────────────────┐
        │                     │                │
        ↓                     ↓                ↓
┌───────────────┐   ┌──────────────────┐   ┌─────────────┐
│  NOTI Service │   │  AIWM Service    │   │   MinIO     │
│  (Port 3002)  │   │  (Port 3003)     │   │ (Storage)   │
├───────────────┤   ├──────────────────┤   ├─────────────┤
│ • User WS     │   │ • REST API       │   │ • Models    │
│ • Notif       │   │ • Node WS        │   │ • Files     │
│ • Events      │   │ • BullMQ Jobs    │   │ • Artifacts │
└───────┬───────┘   └────────┬─────────┘   └─────────────┘
        │                    │
        │   BullMQ (Redis)   │
        └────────┬───────────┘
                 │
        ┌────────┴────────┬──────────────────┐
        │                 │                  │
        ↓                 ↓                  ↓
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ GPU Node 1   │  │ GPU Node 2   │  │ GPU Node N   │
│ (Worker)     │  │ (Worker)     │  │ (Worker)     │
├──────────────┤  ├──────────────┤  ├──────────────┤
│ • WS Client  │  │ • WS Client  │  │ • WS Client  │
│ • Daemon     │  │ • Daemon     │  │ • Daemon     │
│ • Triton/vLLM│  │ • Triton/vLLM│  │ • Triton/vLLM│
│ • Docker     │  │ • Docker     │  │ • Docker     │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## Service Communication

### 1. User ↔ System Communication

**Protocol:** WebSocket (via NOTI Service)
**Purpose:** User-facing notifications, chat messages, alerts
**Transport:** Socket.IO over WebSocket

```
User (Browser)
    ↓ WebSocket connection
NOTI Service (/notifications namespace)
    ↓ BullMQ events
AIWM Service (emit events to NOTI queue)
```

**Event Types:**
- `system.notification` - System announcements
- `service.event` - Service events (deployment status, model updates)
- `service.alert` - Critical alerts (GPU warnings, errors)
- `agent.event` - Agent messages, tool calls, responses

**Example Flow:**
```typescript
// AIWM emits deployment event
await notiQueue.add('service.event', {
  event: 'service.event',
  data: {
    name: 'model.deployment.started',
    data: { deploymentId, modelName, status: 'deploying' },
    recipients: { userIds: [userId] }
  }
});

// Client receives via WebSocket
socket.on('service.event', (event) => {
  if (event.name === 'model.deployment.started') {
    showDeploymentProgress(event.data);
  }
});
```

**Architecture Decision:**
- ✅ Centralized notification hub (NOTI Service)
- ✅ Reuse existing WebSocket infrastructure
- ✅ Consistent pattern across all services
- ✅ Easy scaling (only NOTI needs WebSocket capacity)

---

### 2. Worker Node ↔ Controller Communication

**Protocol:** WebSocket (AIWM Service)
**Purpose:** Infrastructure control plane (commands, telemetry)
**Transport:** Socket.IO over WebSocket

```
Worker Node (GPU Node Daemon)
    ↓ WebSocket connection (initiated by worker)
AIWM Service (/ws/node namespace)
    ↓ Bidirectional messaging
    - Controller → Worker: Commands
    - Worker → Controller: Telemetry
```

**Why WebSocket for Nodes?**

**Problem:** Worker nodes may not have public IPs (behind NAT/firewall)
- ❌ Controller CANNOT initiate HTTP requests to workers
- ✅ Workers CAN initiate outbound WebSocket connections
- ✅ Persistent bidirectional channel

**Message Types:**

**Controller → Worker (Commands):**
```typescript
{
  type: 'command.deploy',
  data: {
    deploymentId: 'deploy-123',
    modelId: 'whisper-v3',
    containerId: 'triton-001',
    gpuDeviceId: '0'
  }
}

{
  type: 'command.stop',
  data: { deploymentId: 'deploy-123' }
}

{
  type: 'command.healthCheck',
  data: {}
}
```

**Worker → Controller (Telemetry):**
```typescript
{
  type: 'telemetry.heartbeat',
  data: {
    timestamp: '2025-11-13T10:00:00Z',
    status: 'healthy',
    uptimeSeconds: 86400
  }
}

{
  type: 'telemetry.metrics',
  data: {
    gpuDevices: [{
      deviceId: '0',
      temperature: 72,
      memoryUsed: 8192,
      memoryTotal: 16384,
      utilization: 85
    }]
  }
}

{
  type: 'deployment.status',
  data: {
    deploymentId: 'deploy-123',
    status: 'running',
    endpoint: 'http://192.168.1.100:8000'
  }
}
```

**Connection Management:**
```typescript
// Worker initiates connection
const socket = io('wss://controller.domain:3003/ws/node', {
  auth: { token: NODE_TOKEN },
  reconnection: true,
  reconnectionDelay: 5000
});

// Auto-reconnect on disconnect
socket.on('disconnect', () => {
  console.log('Disconnected, will auto-reconnect...');
});

// Keep-alive heartbeat
setInterval(() => {
  socket.emit('telemetry.heartbeat', { ... });
}, 30000); // Every 30 seconds
```

**Architecture Decision:**
- ✅ Separate WebSocket namespace from user-facing
- ✅ Worker initiates connection (NAT-friendly)
- ✅ Real-time bidirectional (no polling delay)
- ✅ Connection state management (online/offline tracking)

---

### 3. Inter-Service Communication

**AIWM ↔ NOTI:**
- Protocol: BullMQ (Redis queue)
- Purpose: Emit notification events to users
- Pattern: Async event-driven

**AIWM ↔ IAM:**
- Protocol: HTTP/REST (future - if needed)
- Purpose: User validation, permission checks
- Pattern: Sync request-response

---

## Technology Stack

### Backend Framework
- **NestJS** v10+ (TypeScript)
- **Node.js** v20+

### Database & Storage
- **MongoDB** v7+ - Metadata storage (nodes, models, deployments, agents)
- **MinIO** - S3-compatible object storage (models, files, artifacts)

### Message Queue
- **BullMQ** v5+ - Job scheduling and event-driven architecture
- **Redis** v7+ - Backend for BullMQ

### Real-Time Communication
- **Socket.IO** v4+ - WebSocket library
- **@nestjs/websockets** - NestJS WebSocket support

**WebSocket Usage:**
1. **NOTI Service** - User-facing notifications (`/notifications`)
2. **AIWM Service** - Node communication (`/ws/node`)

### Model Serving (Worker Nodes)
- **Triton Inference Server** v2.40+ - CV, NLP, ASR/TTS models
- **vLLM** v0.6+ - LLM inference with GPU optimization
- **Docker** v24+ - Container runtime
- **NVIDIA Container Toolkit** v1.17+ - GPU support

### Networking (Optional)
- **WireGuard VPN** - Secure private network (handled by infrastructure)
- **HTTP/HTTPS** - Application layer (over VPN or direct)

### Authentication & Security
- **JWT** - Token-based authentication
- **RBAC** - Role-based access control (via BaseService)
- **Correlation ID** - Request tracing

---

## Data Models

### Core Entities

#### 1. Node (GPU Nodes)
```typescript
{
  nodeId: string,              // Unique identifier
  name: string,                // Display name
  role: string[],              // ['controller', 'worker', 'storage']
  status: string,              // 'online' | 'offline' | 'error'

  // Hardware specs
  cpuCores: number,
  ramTotal: number,
  diskTotal: number,

  // GPU devices
  gpuDevices: [{
    deviceId: string,
    model: string,
    memoryTotal: number,
    memoryFree: number,
    utilization: number,
    temperature: number
  }],

  // Network info
  ipAddress: string,
  hostname: string,

  // Monitoring
  lastHeartbeat: Date,

  // BaseSchema fields (owner, createdBy, etc.)
}
```

#### 2. Model (AI Models)
```typescript
{
  modelId: string,             // Unique identifier
  name: string,                // Model name
  description: string,

  // Source
  source: string,              // 'huggingface' | 'custom'
  huggingfaceRepo: string,     // 'openai/whisper-large-v3'
  version: string,             // Model version

  // Metadata
  framework: string,           // 'pytorch' | 'tensorflow' | 'onnx'
  taskType: string,            // 'asr' | 'tts' | 'llm' | 'cv'
  size: number,                // Bytes

  // Storage
  storagePath: string,         // MinIO path
  downloadStatus: string,      // 'pending' | 'downloading' | 'ready'

  // BaseSchema fields
}
```

#### 3. Deployment (Model Deployments)
```typescript
{
  deploymentId: string,
  name: string,
  description: string,

  // References
  modelId: string,             // Foreign key to Model
  nodeId: string,              // Foreign key to Node

  // Configuration
  environment: string,         // 'dev' | 'staging' | 'prod'
  deploymentType: string,      // 'single' | 'distributed'
  replicas: number,            // Number of instances
  hardwareProfile: string,     // 'cpu' | 'gpu' | 'multi-gpu'

  // Runtime info
  status: string,              // 'queued' | 'deploying' | 'running' | 'stopped' | 'failed'
  isRunning: boolean,
  containerName: string,
  containerPort: number,
  endpoint: string,            // Inference API URL

  // Metrics
  totalInferences: number,
  averageLatency: number,      // milliseconds
  uptime: number,              // seconds
  lastHealthCheck: Date,

  // Events log
  events: [{
    timestamp: Date,
    event: string,
    message: string,
    severity: 'info' | 'warning' | 'error'
  }],

  // BaseSchema fields
}
```

#### 4. Agent (AI Agents)
```typescript
{
  agentId: string,
  name: string,
  description: string,
  role: string,                // Agent role/purpose

  // Configuration
  status: string,              // 'active' | 'inactive' | 'busy'
  capabilities: string[],      // Agent capabilities
  nodeId: string,              // Where agent runs

  // Performance metrics
  totalTasks: number,
  completedTasks: number,
  failedTasks: number,
  averageResponseTime: number,

  // Monitoring
  lastTask: Date,
  lastHeartbeat: Date,
  isActive: boolean,

  // Access control
  permissions: string[],
  tags: string[],

  // BaseSchema fields
}
```

---

## Deployment Architecture

### Deployment Models

**Model 1: Single-Node (All-in-One)**
```
┌────────────────────────────────────────┐
│ Single Node (localhost)                │
├────────────────────────────────────────┤
│ • NestJS Backend (AIWM + NOTI)        │
│ • MongoDB + Redis + MinIO             │
│ • Agent Containers                     │
│ • Triton/vLLM Containers (GPU)        │
│ • Node Daemon (localhost connection)  │
└────────────────────────────────────────┘
```

**Model 2: Multi-Node (Separated Controller + Workers)**
```
┌─────────────────────────────────────┐
│ Controller Node (Public IP)         │
│ • AIWM Service                      │
│ • NOTI Service                      │
│ • MongoDB + Redis + MinIO           │
│ • Agent Containers                  │
└─────────────────────────────────────┘
         ↕ WebSocket (Worker initiates)
┌─────────────────────────────────────┐
│ GPU Worker Nodes (Private IP/NAT)  │
│ • Node Daemon (WebSocket client)   │
│ • Triton/vLLM Containers           │
│ • Docker + NVIDIA Runtime           │
└─────────────────────────────────────┘
```

**Model 3: Multi-Node with VPN (Production)**
```
┌─────────────────────────────────────┐
│ Controller (VPN Server)             │
│ • WireGuard VPN                     │
│ • AIWM + NOTI Services              │
└─────────────────────────────────────┘
         ↕ VPN Tunnel (Private Network)
┌─────────────────────────────────────┐
│ Workers (VPN Clients)               │
│ • WireGuard Client                  │
│ • Node Daemon (over VPN)            │
│ • Inference Containers              │
└─────────────────────────────────────┘
```

**Network Layers:**
- **Application Layer**: WebSocket, HTTP/REST
- **Network Layer (Optional)**: WireGuard VPN for secure tunnel
- **Physical Layer**: Internet, LAN, or cloud network

---

## Design Decisions

### 1. WebSocket Split: NOTI vs AIWM

**Decision:** Use 2 separate WebSocket namespaces

| Purpose | Service | Namespace | Clients |
|---------|---------|-----------|---------|
| **User Communication** | NOTI | `/notifications` | Web clients, mobile apps |
| **Node Communication** | AIWM | `/ws/node` | Worker node daemons |

**Rationale:**
- ✅ Separation of concerns (user-facing vs infrastructure)
- ✅ Different scalability requirements
- ✅ Different security models
- ✅ Independent deployment and monitoring

### 2. BullMQ over RabbitMQ

**Decision:** Use BullMQ + Redis (not RabbitMQ)

**Rationale:**
- ✅ Template service already uses BullMQ
- ✅ Consistent tech stack across services
- ✅ Simpler infrastructure (Redis already needed)
- ✅ Better for job scheduling use cases
- ✅ Sufficient for AIWM event patterns

### 3. Worker-Initiated WebSocket

**Decision:** Worker nodes initiate WebSocket connection to Controller

**Problem:** Worker nodes may not have public IPs (NAT/firewall)

**Solution:**
- ✅ Worker connects outbound to Controller (bypasses NAT)
- ✅ Persistent bidirectional channel
- ✅ Real-time command delivery (no polling)
- ✅ Connection state tracking

### 4. VPN as Optional Infrastructure

**Decision:** VPN (WireGuard) is optional, handled outside AIWM

**Rationale:**
- ✅ AIWM works with or without VPN
- ✅ WebSocket works over plain internet or VPN
- ✅ VPN setup is infrastructure responsibility
- ✅ AIWM focuses on application logic

### 5. MinIO for Object Storage

**Decision:** Use MinIO (S3-compatible) for model storage

**Rationale:**
- ✅ Self-hosted alternative to cloud storage
- ✅ S3-compatible API (standard interface)
- ✅ Works on-premise or cloud
- ✅ Scalable and reliable

---

## Related Documents

- **Requirements:** [AIWM.md](./AIWM.md)
- **Implementation Plan:** [aiwm-plan.md](./aiwm-plan.md)
- **API Documentation:** (Generated via Swagger at runtime)

---

**Document Owner:** Development Team
**Review Cycle:** Monthly or on major changes
**Last Reviewed:** 2025-11-13
