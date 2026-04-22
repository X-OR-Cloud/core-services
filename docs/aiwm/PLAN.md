# AIWM Service Implementation Plan

**Version:** 2.0
**Last Updated:** 2025-11-13
**Status:** 🟡 In Development (Phase 1 Completed, Phase 2 Design Approved)

---

## 📚 Documentation Structure

**Architecture & Design Documents:**
- **[AIWM.md](./AIWM.md)** - Requirements và specifications
- **[AIWM-ARCHITECTURE.md](./AIWM-ARCHITECTURE.md)** - Architecture decisions và system design ⭐
- **[AIWM-WEBSOCKET-PROTOCOL.md](./AIWM-WEBSOCKET-PROTOCOL.md)** - WebSocket message protocol specification ⭐
- **[AIWM-EXECUTION-DESIGN.md](./AIWM-EXECUTION-DESIGN.md)** - Execution orchestration design ⭐
- **[aiwm-plan.md](./aiwm-plan.md)** - Implementation plan và progress tracking (this document)

**Generated at Runtime:**
- **Swagger API Docs** - `http://localhost:3003/api-docs` (when service running)

---

## Overview

AIWM (AI Workflow Management) service là một platform AI Ops cho phép quản lý và triển khai AI/ML workloads trên multi-GPU infrastructure. Service này được xây dựng theo chuẩn thiết kế của hydra-services repository.

**Core Capabilities:**
- 🖥️ **GPU Node Management** - Register, monitor, và control GPU worker nodes
- 🤖 **Model Registry** - Store và manage AI/ML models (HuggingFace, custom models)
- 🚀 **Deployment Orchestration** - Deploy models to nodes với multi-step workflows
- 🤝 **AI Agent Framework** - Run AI agents with MCP tools integration
- 📡 **Real-time Communication** - WebSocket cho node commands và telemetry
- 📊 **Event-Driven Architecture** - Pure event-based orchestration với Execution entity

---

## Key Architecture Decisions

**Finalized Design Choices:** (See [AIWM-ARCHITECTURE.md](./AIWM-ARCHITECTURE.md))

### 1. **Orchestration Pattern** ✅
- ✅ **Pure Event-Based Orchestration** with **Execution Entity**
- ✅ **NO BullMQ for orchestration** (BullMQ only for NOTI queue)
- ✅ **MongoDB single source of truth** for all state
- ✅ **Real-time progress tracking** via WebSocket events

**Rationale:**
- Simpler architecture (no Redis dependency for orchestration)
- Event-driven native (fits WebSocket model)
- Transparent state (all in MongoDB)
- Sufficient for AIWM use cases

### 2. **Entity Naming** ✅
- ✅ **Execution** (not Task) - For system orchestration
- ✅ **ExecutionStep** (not SubTask) - Individual steps in workflow
- ✅ **AgentTask** (future) - For agent work assignments
- Clear separation between infrastructure operations and agent tasks

### 3. **Communication Architecture** ✅
- ✅ **NOTI Service** - User-facing notifications (`/notifications` namespace)
- ✅ **AIWM Service** - Node communication (`/ws/node` namespace)
- ✅ **Worker-initiated WebSocket** - NAT-friendly for nodes behind firewalls
- ✅ **Resource-based commands** - `{resource}.{action}` pattern (e.g., `deployment.create`)

### 4. **Storage** ✅
- ✅ **MongoDB** - Metadata storage (nodes, models, deployments, executions, agents)
- ✅ **MinIO** - S3-compatible object storage for model files
- ✅ **Redis** - Only for NOTI queue (not for orchestration)

**Reference Documents:**
- [AIWM-WEBSOCKET-PROTOCOL.md](./AIWM-WEBSOCKET-PROTOCOL.md) - WebSocket protocol
- [AIWM-EXECUTION-DESIGN.md](./AIWM-EXECUTION-DESIGN.md) - Execution orchestration

---

## Current Implementation Status

### ✅ Phase 1: Foundation Setup (COMPLETED)

#### 1.1 Service Structure ✅
- ✅ Cloned from template service
- ✅ Port assigned: 3003
- ✅ Database: `hydra-aiwm`
- ✅ Configuration files created
- ✅ Shared library updated (`ServiceName.AIWM`)

**Service Location:**
```
services/aiwm/
├── src/
│   ├── main.ts                           ✅
│   ├── app/
│   │   ├── app.module.ts                 ✅
│   │   ├── app.controller.ts             ✅
│   │   └── app.service.ts                ✅
│   ├── config/
│   │   ├── redis.config.ts               ✅ (Only for NOTI queue)
│   │   └── queue.config.ts               ✅ (Only for NOTI queue)
│   ├── modules/
│   │   ├── node/                         ✅ (Schema, Service, Controller, DTO)
│   │   ├── model/                        ✅ (Schema, Service, Controller, DTO)
│   │   ├── deployment/                   ✅ (Schema, Service, Controller, DTO)
│   │   └── agent/                        ✅ (Schema, Service, Controller, DTO)
│   └── queues/
│       ├── queue.module.ts               ✅ (Only NOTI queue)
│       └── noti.queue.ts                 ✅
├── .env                                  ✅
├── project.json                          ✅
└── README.md                             ⏳ (To be created)
```

#### 1.2 Core Entities ✅

**Implemented:**
- ✅ **Node** - GPU node management (schema, service, controller, DTOs)
- ✅ **Model** - AI model registry (schema, service, controller, DTOs)
- ✅ **Deployment** - Model deployments (schema, service, controller, DTOs)
- ✅ **Agent** - AI agents (schema, service, controller, DTOs)

**Schemas Only (Need Services/Controllers):**
- ⏳ **Tool** - MCP tools
- ⏳ **Conversation** - Chat conversations
- ⏳ **Message** - Chat messages

**Not Yet Created:**
- ⏳ **Execution** - Multi-step orchestration (Phase 2)
- ⏳ **ExecutionStep** - Individual workflow steps (embedded in Execution)

#### 1.3 NOTI Queue Integration ✅
- ✅ BullMQ configured with Redis
- ✅ NOTI queue for user notifications
- ✅ Queue name: `notifications`
- ✅ Event emitter patterns ready
- ⏳ Integration implementation (Phase 3)

#### 1.4 Build & Runtime Verification ✅
- ✅ Service builds successfully: `npx nx build aiwm`
- ✅ All TypeScript compilation errors fixed
- ✅ Mongoose schema type issues resolved
- ✅ Dependency injection working correctly
- ✅ Service starts successfully on port 3003
- ✅ Health endpoint working: `http://localhost:3003/api/health`
- ✅ MongoDB connection verified: `hydra-aiwm` database
- ✅ Swagger API documentation accessible: `http://localhost:3003/api-docs`
- ✅ All REST endpoints registered and functional

**Verification Commands:**
```bash
# Start service
npx nx serve aiwm

# Test health endpoint
curl http://localhost:3003/api/health

# View Swagger docs
open http://localhost:3003/api-docs
```

---

## 🚀 Implementation Phases

### 🎯 Phase 2.5: Instruction Module (PRIORITY - 2 days)

**Objective:** Implement simplified Instruction entity để agents có system prompts và guidelines

**Status:** 🎯 Next Priority (Before MinIO Integration)

**Rationale:**
- Instruction Module cần thiết cho AI Agent framework
- Agents hiện tại không có hướng dẫn rõ ràng về cách làm việc
- Simple implementation (chỉ 2 days) nhưng high value
- Không phụ thuộc vào MinIO hay NOTI, có thể làm độc lập

---

#### Tasks:

**Day 1:**
- [ ] Create `Instruction` schema (simplified: instructionId, name, description, systemPrompt, guidelines[], tags[], isActive)
- [ ] Create `InstructionService` (extends BaseService - no custom logic needed)
- [ ] Create `InstructionController` (standard CRUD)
- [ ] Create DTOs (CreateInstructionDto, UpdateInstructionDto)
- [ ] Update `Agent` schema - add `instructionId` field
- [ ] Update `Agent` DTOs

**Day 2:**
- [ ] Add populate support in AgentController
- [ ] Test CRUD operations with Swagger
- [ ] Test assign instruction to agent
- [ ] Update API documentation
- [ ] Update architecture docs

**Files to Create/Modify:**
```
services/aiwm/src/modules/instruction/
├── instruction.schema.ts          ✅ New (50 lines)
├── instruction.service.ts         ✅ New (30 lines)
├── instruction.controller.ts      ✅ New (80 lines)
├── instruction.dto.ts             ✅ New (40 lines)
├── instruction.module.ts          ✅ New (20 lines)

services/aiwm/src/modules/agent/
├── agent.schema.ts                📝 Modified (add 1 field)
├── agent.dto.ts                   📝 Modified (add to DTOs)
└── agent.controller.ts            📝 Modified (add populate)
```

**API Endpoints:**
```typescript
POST   /api/instructions           ✅ Create instruction
GET    /api/instructions           ✅ List with pagination
GET    /api/instructions/:id       ✅ Get by ID
PUT    /api/instructions/:id       ✅ Update
DELETE /api/instructions/:id       ✅ Soft delete

// Agent integration
PUT    /api/agents/:id             📝 Updated - can set instructionId
GET    /api/agents/:id?populate=instruction  📝 Get with instruction
```

**Total:** ~220 lines of new code + 10 lines modified

---

### 🟡 Phase 2: WebSocket Gateway + Worker Client + Execution Orchestration (COMPLETED - 5-6 days)

**Objective:** Implement WebSocket communication với nodes, worker client, và pure event-based orchestration

**Status:** 🎯 Design Approved, Ready to Implement

**Architecture Decision:** ✅ Worker will be **TypeScript/Node.js** in monorepo (`services/aiwm-worker`)

**Key Benefits:**
- ✅ Type safety end-to-end (shared protocol types)
- ✅ Single codebase (easier to maintain)
- ✅ No context switching (same language, same tools)
- ✅ Shared libraries (`@hydrabyte/shared`)
- ✅ Consistent testing (Jest for both)

---

#### Part A: Shared Protocol Types (0.5 day)

**Tasks:**
- [ ] Create shared protocol types in `@hydrabyte/shared`
- [ ] Define WebSocket message DTOs
- [ ] Define command/telemetry interfaces
- [ ] Export from shared library

**Files to Create:**
```
libs/shared/src/lib/
├── dto/
│   └── websocket/
│       ├── node-register.dto.ts          ⏳
│       ├── node-heartbeat.dto.ts         ⏳
│       ├── node-metrics.dto.ts           ⏳
│       ├── command.dto.ts                ⏳
│       ├── command-ack.dto.ts            ⏳
│       ├── command-result.dto.ts         ⏳
│       └── index.ts                      ⏳
├── interfaces/
│   └── websocket/
│       ├── gpu-device.interface.ts       ⏳
│       ├── os-info.interface.ts          ⏳
│       ├── container-info.interface.ts   ⏳
│       └── index.ts                      ⏳
└── enum/
    └── websocket/
        ├── message-type.enum.ts          ⏳
        ├── command-status.enum.ts        ⏳
        └── index.ts                      ⏳
```

**Example Shared Types:**
```typescript
// libs/shared/src/lib/dto/websocket/node-register.dto.ts
export class NodeRegisterDto {
  nodeId: string;
  name: string;
  hostname: string;
  ipAddress: string;
  publicIpAddress?: string;
  os: OsInfo;
  cpuCores: number;
  cpuModel: string;
  ramTotal: number;
  gpuDevices: GpuDevice[];
  containerRuntime: ContainerRuntime;
}

// libs/shared/src/lib/enum/websocket/message-type.enum.ts
export enum MessageType {
  // Controller → Worker
  DEPLOYMENT_CREATE = 'deployment.create',
  DEPLOYMENT_STOP = 'deployment.stop',
  MODEL_DOWNLOAD = 'model.download',
  SYSTEM_HEALTH_CHECK = 'system.healthCheck',

  // Worker → Controller
  NODE_REGISTER = 'node.register',
  TELEMETRY_HEARTBEAT = 'telemetry.heartbeat',
  TELEMETRY_METRICS = 'telemetry.metrics',
  COMMAND_ACK = 'command.ack',
  COMMAND_RESULT = 'command.result'
}
```

---

#### Part B: WebSocket Gateway - Controller Side (2 days)

**Tasks:**
- [ ] Create `NodeGateway` class với `/ws/node` namespace
- [ ] Implement JWT authentication middleware for WebSocket
- [ ] Connection/disconnection handlers
- [ ] Node registration handler (with enhanced fields: OS info, public IP)
- [ ] Heartbeat handler (30-second interval)
- [ ] Telemetry/metrics handler (GPU stats, container stats)
- [ ] Command sender (`deployment.create`, `model.download`, `system.healthCheck`, etc.)
- [ ] Command acknowledgment handler (`command.ack`, `command.result`)
- [ ] Connection state tracking (online/offline map)
- [ ] Socket-to-Node ID mapping
- [ ] Error handling và reconnection support

**Files to Create:**
```
services/aiwm/src/modules/node/
├── node.gateway.ts                       ⏳ Main gateway class
├── node.gateway.spec.ts                  ⏳ Unit tests
├── dto/
│   ├── node-register.dto.ts              ⏳ Registration payload
│   ├── node-heartbeat.dto.ts             ⏳ Heartbeat payload
│   ├── node-metrics.dto.ts               ⏳ Telemetry payload
│   └── node-command.dto.ts               ⏳ Command structure
└── guards/
    └── ws-jwt-auth.guard.ts              ⏳ WebSocket JWT guard
```

**WebSocket Events to Handle:**
```typescript
// Controller → Worker
- deployment.create
- deployment.stop
- deployment.restart
- model.download
- model.delete
- system.healthCheck
- system.restart

// Worker → Controller
- node.register
- telemetry.heartbeat
- telemetry.metrics
- deployment.status
- deployment.logs
- model.downloadProgress
- command.ack
- command.result
```

**Reference:** [AIWM-WEBSOCKET-PROTOCOL.md](./AIWM-WEBSOCKET-PROTOCOL.md)

---

#### Part C: Worker Client - Worker Side (2 days, can parallel with Part B)

**Objective:** Implement worker node client trong monorepo

**Tasks:**
- [ ] Create `aiwm-worker` service trong monorepo
- [ ] Setup project configuration (project.json, tsconfig, etc.)
- [ ] Implement WebSocket client với Socket.IO
- [ ] Implement authentication với JWT
- [ ] Implement command handlers (deployment, model, system)
- [ ] Implement telemetry senders (heartbeat, metrics)
- [ ] Implement Docker operations với dockerode
- [ ] Implement GPU monitoring (nvidia-smi exec)
- [ ] Add configuration management
- [ ] Add error handling và reconnection logic

**Files to Create:**
```
services/aiwm-worker/
├── src/
│   ├── main.ts                           ⏳ Entry point
│   ├── app/
│   │   ├── worker.module.ts              ⏳
│   │   └── worker.service.ts             ⏳
│   ├── client/
│   │   ├── websocket-client.ts           ⏳ Socket.IO client
│   │   ├── auth.service.ts               ⏳ JWT handling
│   │   └── message-handler.ts            ⏳ Route messages to handlers
│   ├── handlers/
│   │   ├── deployment.handler.ts         ⏳ Handle deployment.* commands
│   │   ├── model.handler.ts              ⏳ Handle model.* commands
│   │   ├── system.handler.ts             ⏳ Handle system.* commands
│   │   └── base.handler.ts               ⏳ Base handler class
│   ├── operations/
│   │   ├── docker.manager.ts             ⏳ Docker operations (dockerode)
│   │   ├── gpu.monitor.ts                ⏳ GPU monitoring (nvidia-smi)
│   │   ├── model.downloader.ts           ⏳ Download models
│   │   └── telemetry.service.ts          ⏳ Send heartbeat & metrics
│   └── config/
│       ├── worker.config.ts              ⏳ Configuration
│       └── env.validation.ts             ⏳ Env validation
├── project.json                          ⏳
├── tsconfig.json                         ⏳
├── tsconfig.app.json                     ⏳
├── Dockerfile                            ⏳
├── .env.example                          ⏳
└── README.md                             ⏳
```

**Worker Configuration (.env):**
```bash
# Controller Connection
CONTROLLER_URL=ws://localhost:3003/ws/node
NODE_TOKEN=your-jwt-token
NODE_ID=worker-node-001

# Node Information
NODE_NAME=GPU Node 01
NODE_HOSTNAME=gpu-node-01.local

# Heartbeat
HEARTBEAT_INTERVAL=30000
METRICS_INTERVAL=60000

# Docker
DOCKER_SOCKET=/var/run/docker.sock

# GPU Mock (for testing without GPU)
GPU_MOCK_MODE=false

# Logging
LOG_LEVEL=info
```

**Example Worker Implementation:**
```typescript
// services/aiwm-worker/src/client/websocket-client.ts
import { io, Socket } from 'socket.io-client';
import { MessageType, NodeRegisterDto } from '@hydrabyte/shared';

export class WebSocketClient {
  private socket: Socket;
  private nodeId: string;

  constructor(
    private readonly controllerUrl: string,
    private readonly token: string
  ) {}

  connect(): void {
    this.socket = io(this.controllerUrl, {
      auth: { token: this.token },
      reconnection: true,
      reconnectionDelay: 5000,
      reconnectionAttempts: Infinity
    });

    this.socket.on('connect', () => this.handleConnect());
    this.socket.on('disconnect', () => this.handleDisconnect());
    this.socket.on('message', (msg) => this.handleMessage(msg));
  }

  private async handleConnect(): Promise<void> {
    console.log('Connected to controller');
    await this.register();
  }

  private async register(): Promise<void> {
    const registerData: NodeRegisterDto = {
      nodeId: this.nodeId,
      name: process.env.NODE_NAME,
      hostname: os.hostname(),
      // ... collect system info
    };

    this.socket.emit(MessageType.NODE_REGISTER, registerData);
  }

  private handleMessage(message: any): void {
    // Route to appropriate handler based on message.type
  }
}
```

**Dependencies to Add:**
```json
{
  "dependencies": {
    "socket.io-client": "^4.7.0",
    "dockerode": "^4.0.0",
    "@nestjs/config": "^3.1.0",
    "class-validator": "^0.14.0",
    "class-transformer": "^0.5.1"
  }
}
```

**Reference:** [AIWM-WEBSOCKET-PROTOCOL.md](./AIWM-WEBSOCKET-PROTOCOL.md)

---

#### Part D: Execution Orchestration Module (2 days)

**Tasks:**
- [ ] Create `Execution` schema với embedded `ExecutionStep[]`
- [ ] Create `ExecutionService` (CRUD + state management)
- [ ] Create `ExecutionOrchestrator` (event-driven execution engine)
- [ ] Create `ExecutionTimeoutMonitor` (cron job every 30s)
- [ ] Implement `ExecutionController` (REST API)
- [ ] Implement step dependency resolution (`dependsOn` field)
- [ ] Implement parallel step execution
- [ ] Implement retry logic (configurable max retries)
- [ ] Integrate with `NodeGateway` for command sending
- [ ] Integrate with `DeploymentService` for resource updates
- [ ] Add NOTI event emission on completion/failure

**Files to Create:**
```
services/aiwm/src/modules/execution/
├── execution.schema.ts                   ⏳ Execution + ExecutionStep
├── execution.service.ts                  ⏳ CRUD + state management
├── execution.orchestrator.ts             ⏳ Execution engine
├── execution-timeout.monitor.ts          ⏳ Timeout monitoring (cron)
├── execution.controller.ts               ⏳ REST API
├── execution.module.ts                   ⏳ Module definition
├── dto/
│   ├── create-execution.dto.ts           ⏳
│   ├── update-execution.dto.ts           ⏳
│   └── execution-query.dto.ts            ⏳
└── execution.spec.ts                     ⏳ Unit tests
```

**MongoDB Collection:**
- Collection: `executions`
- Indexes: `executionId`, `status`, `resourceType+resourceId`, `timeoutAt`

**API Endpoints:**
```typescript
POST   /api/executions                    // Create execution
GET    /api/executions                    // List executions (with filters)
GET    /api/executions/:id                // Get execution detail
PATCH  /api/executions/:id                // Update execution
DELETE /api/executions/:id                // Cancel execution
POST   /api/executions/:id/retry          // Retry failed execution
GET    /api/executions/:id/steps          // Get execution steps
```

**Key Features:**
- Multi-step workflows với dependency management
- Parallel execution support (steps without dependencies run concurrently)
- Optional steps (can fail without failing entire execution)
- Automatic retry với exponential backoff
- Real-time progress tracking (0-100%)
- Timeout monitoring per execution and per step
- Complete audit trail (all WebSocket messages tracked)

**Reference:** [AIWM-EXECUTION-DESIGN.md](./AIWM-EXECUTION-DESIGN.md)

---

#### Integration Points

**NodeGateway ↔ ExecutionOrchestrator:**
```typescript
// ExecutionOrchestrator sends commands via NodeGateway
await nodeGateway.sendCommandToNode(nodeId, {
  type: 'deployment.create',
  messageId: 'msg-001',
  resource: { type: 'deployment', id: 'deploy-123' },
  data: {
    executionId: 'exec-xyz789',
    stepIndex: 0,
    // ... command data
  }
});

// NodeGateway receives results and notifies ExecutionOrchestrator
@SubscribeMessage('command.result')
async handleCommandResult(message) {
  const { executionId, stepIndex, ...result } = message.data;
  await executionOrchestrator.handleStepCompletion(
    executionId,
    stepIndex,
    result,
    message.messageId
  );
}
```

**Example Workflow (Deploy Model):**
1. User calls `POST /api/deployments`
2. `DeploymentService` creates Deployment record
3. `DeploymentService` creates Execution with 3 steps:
   - Step 0: Download model (gpu-node-01)
   - Step 1: Start container (gpu-node-01)
   - Step 2: Configure proxy (proxy-node-01)
4. `ExecutionOrchestrator` starts execution
5. Sends WebSocket commands to nodes (steps run sequentially based on `dependsOn`)
6. Nodes return `command.result` for each step
7. `ExecutionOrchestrator` updates progress
8. When all steps complete, updates Deployment status to `running`
9. Emits notification to NOTI queue

---

#### Part E: Integration & Testing (1 day)

**Tasks:**
- [ ] Test controller ↔ worker communication
- [ ] Test full deployment workflow
- [ ] Test error scenarios (disconnect, timeout, failure)
- [ ] Test retry logic
- [ ] Test with mock GPU mode
- [ ] Write integration tests

**Test Approach:**
```bash
# Terminal 1: Start controller
npx nx serve aiwm

# Terminal 2: Start worker (mock GPU mode)
npx nx serve aiwm-worker

# Terminal 3: Run integration tests
npx nx test aiwm-e2e
```

**Integration Test Example:**
```typescript
// apps/aiwm-e2e/src/integration/worker-communication.spec.ts
describe('Worker Communication (E2E)', () => {
  it('should register worker and send commands', async () => {
    // Start worker
    const worker = await startWorker({
      controllerUrl: 'ws://localhost:3003/ws/node',
      mockGpu: true
    });

    // Wait for registration
    await waitFor(() => {
      const nodes = await getNodes();
      return nodes.length === 1;
    });

    // Create deployment
    const deployment = await createDeployment({
      modelId: 'test-model',
      nodeId: worker.nodeId
    });

    // Wait for deployment to complete
    await waitFor(() => {
      return getDeploymentStatus(deployment.id) === 'running';
    }, { timeout: 30000 });

    expect(deployment.status).toBe('running');
  });
});
```

---

### ⏳ Phase 3: Node Token Generation & Enhanced APIs (2 days)

**Objective:** Implement node token generation và enhanced REST APIs

#### Part A: Node Token Generation (1 day)

**Tasks:**
- [ ] Add JWT signing capability to AIWM service
- [ ] Create `POST /api/nodes/:nodeId/token` endpoint
- [ ] Token validation và expiration management
- [ ] Token metadata tracking (in Node schema)

**API Endpoint:**
```typescript
POST   /api/nodes/:nodeId/token           // Generate node JWT token

// Request
{
  "expiresIn": 86400,                     // Seconds (default 24h)
  "description": "Production GPU Node 01"
}

// Response
{
  "nodeId": "node-abc123",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2025-11-14T10:00:00Z",
  "expiresIn": 86400
}
```

**Node Schema Enhancement:**
```typescript
@Prop({ type: Object })
tokenMetadata?: {
  lastGenerated?: Date;
  expiresAt?: Date;
  description?: string;
};
```

**Reference:** [AIWM-WEBSOCKET-PROTOCOL.md#token-generation-workflow](./AIWM-WEBSOCKET-PROTOCOL.md)

---

#### Part B: Enhanced REST APIs (1 day)

**Tasks:**
- [ ] Add `/api/nodes/:id/metrics` (get latest metrics)
- [ ] Add `/api/nodes/:id/containers` (list containers on node)
- [ ] Add `/api/deployments/:id/logs` (get deployment logs)
- [ ] Add `/api/deployments/:id/metrics` (get deployment metrics)
- [ ] Add `/api/deployments/:id/restart` (restart deployment)

**New Endpoints:**
```typescript
// Node APIs
GET    /api/nodes/:id/metrics             ⏳ Latest GPU/system metrics
GET    /api/nodes/:id/containers          ⏳ Running containers

// Deployment APIs
GET    /api/deployments/:id/logs          ⏳ Container logs
GET    /api/deployments/:id/metrics       ⏳ Inference metrics
POST   /api/deployments/:id/restart       ⏳ Restart deployment
```

---

### ⏳ Phase 4: NOTI Integration (1-2 days)

**Objective:** Integrate with NOTI service for user-facing notifications

**Tasks:**
- [ ] Emit deployment events to NOTI queue
  - `deployment.started`
  - `deployment.completed`
  - `deployment.failed`
- [ ] Emit execution events to NOTI queue
  - `execution.started`
  - `execution.progress` (optional: every 25% milestone)
  - `execution.completed`
  - `execution.failed`
- [ ] Emit node events to NOTI queue
  - `node.connected`
  - `node.disconnected`
  - `node.warning` (GPU temperature, memory)
- [ ] Emit agent events to NOTI queue (future)
  - `agent.message`
  - `agent.tool.call`

**Event Structure:**
```typescript
await notiQueue.add('service.event', {
  event: 'service.event',
  data: {
    name: 'deployment.completed',
    data: {
      deploymentId: 'deploy-123',
      executionId: 'exec-789',
      modelName: 'whisper-v3',
      endpoint: 'https://api.domain/api/models/whisper-v3',
      duration: 270
    },
    recipients: {
      userIds: [userId],
      orgIds: [orgId]
    }
  }
});
```

**Reference:** [AIWM-ARCHITECTURE.md#1-user--system-communication](./AIWM-ARCHITECTURE.md)

---

### ⏳ Phase 5: MinIO Integration (2-3 days)

**Objective:** Implement MinIO for model storage

**Tasks:**
- [ ] Setup MinIO client configuration
- [ ] Implement model file upload to MinIO
  - Manual upload via `/api/models/upload`
  - File versioning support
- [ ] Implement HuggingFace model download
  - Download to MinIO bucket
  - Track download progress
  - Store metadata
- [ ] Implement model file download from MinIO
  - Generate signed URLs (expiration)
  - Support for streaming downloads
- [ ] Model versioning support
  - Multiple versions per model
  - Version tagging

**Files to Create:**
```
services/aiwm/src/config/
└── minio.config.ts                       ⏳

services/aiwm/src/modules/model/
├── model.service.ts                      📝 Add MinIO methods
└── minio.client.ts                       ⏳
```

**New API Endpoints:**
```typescript
POST   /api/models/upload                 ⏳ Manual model upload
POST   /api/models/download               ⏳ HuggingFace download
GET    /api/models/:id/download-url       ⏳ Get signed download URL
```

**Configuration (.env):**
```bash
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
MINIO_BUCKET=aiwm-models
```

**MinIO Bucket Structure:**
```
aiwm-models/
├── whisper-v3/
│   ├── model.safetensors
│   ├── config.json
│   └── metadata.json
├── llama-3-8b/
│   └── ...
```

---

### ⏳ Phase 6: Additional Entities (2-3 days)

**Objective:** Complete Tool, Conversation, Message entities

**Tasks:**
- [ ] Implement Tool CRUD APIs
- [ ] Implement Conversation CRUD APIs
- [ ] Implement Message CRUD APIs
- [ ] Agent ↔ Tool relationship
- [ ] Conversation ↔ Message relationship

**API Endpoints:**
```typescript
// Tool APIs
GET    /api/tools                         ⏳
POST   /api/tools                         ⏳
GET    /api/tools/:id                     ⏳
PATCH  /api/tools/:id                     ⏳
DELETE /api/tools/:id                     ⏳
POST   /api/tools/:id/restart             ⏳
GET    /api/tools/:id/health              ⏳

// Conversation APIs
GET    /api/conversations                 ⏳
POST   /api/conversations                 ⏳
GET    /api/conversations/:id             ⏳
DELETE /api/conversations/:id             ⏳
GET    /api/conversations/:id/messages    ⏳

// Message APIs
POST   /api/messages                      ⏳
GET    /api/messages/:id                  ⏳
DELETE /api/messages/:id                  ⏳
```

---

### ⏳ Phase 7: Testing & Quality Assurance (3-4 days)

**Objective:** Comprehensive testing suite

**Tasks:**
- [ ] Unit tests for all services (coverage > 80%)
  - ExecutionService
  - ExecutionOrchestrator
  - NodeGateway
  - All entity services
- [ ] Unit tests for all controllers
- [ ] Integration tests for WebSocket gateway
  - Mock node client
  - Connection flow
  - Message handling
- [ ] Integration tests for execution orchestration
  - Multi-step workflows
  - Dependency resolution
  - Retry logic
  - Timeout handling
- [ ] E2E tests for complete workflows
  - Full deployment workflow (model download → deploy → proxy config)
  - Node registration → heartbeat → command execution
  - Error scenarios and rollback
- [ ] Load testing
  - Multiple concurrent executions
  - Multiple WebSocket connections
  - Message throughput

**Test Files Structure:**
```
services/aiwm/src/modules/*/
├── *.service.spec.ts                     ⏳
├── *.controller.spec.ts                  ⏳
├── *.gateway.spec.ts                     ⏳
└── *.orchestrator.spec.ts                ⏳
```

**Test Scenarios:**
```typescript
// Example: Execution orchestration tests
describe('ExecutionOrchestrator', () => {
  it('should execute sequential steps with dependencies', async () => {
    // Create execution with 3 steps (0 → 1 → 2)
    // Verify steps execute in correct order
    // Verify progress updates
  });

  it('should execute parallel steps without dependencies', async () => {
    // Create execution with 2 parallel steps
    // Verify both start simultaneously
  });

  it('should retry failed executions', async () => {
    // Fail a step, verify retry
    // Verify max retry limit
  });

  it('should handle timeout', async () => {
    // Create execution with short timeout
    // Verify timeout detection and handling
  });
});
```

---

### ⏳ Phase 8: Documentation & Production Readiness (2-3 days)

**Objective:** Complete documentation và production preparation

#### Documentation Tasks
- [ ] README with quick start guide
- [ ] API documentation with curl examples
- [ ] WebSocket protocol examples (node client samples)
- [ ] Deployment guide (Docker, Kubernetes)
- [ ] Architecture diagrams
- [ ] Troubleshooting guide
- [ ] Performance tuning guide

**Files to Create:**
```
services/aiwm/
├── README.md                             ⏳ Main documentation
└── docs/
    ├── QUICK-START.md                    ⏳
    ├── API-EXAMPLES.md                   ⏳
    ├── WEBSOCKET-CLIENT.md               ⏳
    ├── DEPLOYMENT.md                     ⏳
    ├── TROUBLESHOOTING.md                ⏳
    └── PERFORMANCE.md                    ⏳
```

#### Production Readiness Tasks
- [ ] Health check implementation (with dependencies check)
- [ ] Logging với structured format
- [ ] Metrics collection (Prometheus-compatible)
- [ ] Error tracking integration
- [ ] Rate limiting for APIs
- [ ] Request timeout configuration
- [ ] Connection pool optimization
- [ ] Security audit
- [ ] Performance profiling

---

## Success Criteria

### Technical Criteria
- ✅ Service builds without errors
- ✅ TypeScript compilation successful
- ⏳ All unit tests passing (coverage > 80%)
- ⏳ All integration tests passing
- ⏳ All E2E tests passing
- ✅ Swagger documentation complete
- ✅ Health endpoint responding correctly

### Functional Criteria (MVP)
- ⏳ GPU nodes can register via WebSocket
- ⏳ Nodes report heartbeat and metrics every 30s
- ⏳ Controller can send commands to nodes
- ⏳ Models can be downloaded from HuggingFace
- ⏳ Models stored in MinIO
- ⏳ Multi-step deployment execution works
  - Download model → Start container → Configure proxy
- ⏳ Execution progress tracked in real-time
- ⏳ Failed executions automatically retry
- ⏳ Timeout detection works
- ⏳ User notifications sent to NOTI service
- ⏳ WebSocket connections stable with auto-reconnect
- ⏳ Node token generation API works

### Production Readiness (Post-MVP)
- ⏳ System runs stable for 7 days
- ⏳ Error rate < 0.1%
- ⏳ API response time < 200ms (p95)
- ⏳ WebSocket latency < 50ms (p95)
- ⏳ Execution orchestration latency < 100ms per step
- ⏳ Monitoring và alerting setup
- ⏳ Logging với correlation IDs
- ⏳ Rate limiting configured
- ⏳ Security audit completed

---

## Environment Configuration

### Required Environment Variables

```bash
# Service Configuration
PORT=3003
NODE_ENV=development
GIT_COMMIT_SHA=1acbbb8

# Database
MONGODB_URI=mongodb://10.10.0.100:27017/hydra-aiwm

# Redis (for NOTI queue only)
REDIS_HOST=10.10.0.100
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# MinIO Configuration
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
MINIO_BUCKET=aiwm-models

# JWT (for node tokens)
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=86400

# HuggingFace (for model downloads)
HUGGINGFACE_API_KEY=your-hf-token

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# WebSocket
WS_CORS_ORIGIN=*
WS_PING_INTERVAL=30000
WS_PING_TIMEOUT=10000

# Execution Configuration
EXECUTION_MAX_RETRIES=3
EXECUTION_TIMEOUT_CHECK_INTERVAL=30000
```

---

## Progress Timeline

| Phase | Description | Days | Status |
|-------|-------------|------|--------|
| **Phase 1** | Foundation Setup | 2 | ✅ COMPLETED |
| **Phase 2** | WebSocket + Worker + Execution | 5-6 | ✅ COMPLETED |
| **Phase 2.5** | Instruction Module (Simplified) | 2 | 🎯 NEXT (HIGH PRIORITY) |
| **Phase 3** | Node Token + Enhanced APIs | 2 | ⏳ Planned |
| **Phase 4** | NOTI Integration | 1-2 | ⏳ Planned |
| **Phase 5** | MinIO Integration | 2-3 | ⏳ Planned |
| **Phase 6** | Additional Entities (Tool, Conversation, Message) | 2-3 | ⏳ Planned |
| **Phase 7** | Testing & QA | 3-4 | ⏳ Planned |
| **Phase 8** | Documentation & Production | 2-3 | ⏳ Planned |
| **Total** | | **21-28 days** | |

**Current Progress:** Phase 1 & 2 completed (7-8 days), ~65% overall completion
**Next:** Phase 2.5 - Instruction Module (2 days)

**Phase 2 Breakdown:**
- Part A: Shared Protocol Types (0.5 day)
- Part B: WebSocket Gateway - Controller (2 days)
- Part C: Worker Client - Worker (2 days, can parallel with B)
- Part D: Execution Orchestration (2 days)
- Part E: Integration & Testing (1 day)

---

## Known Issues & Resolutions

### ✅ RESOLVED

1. **Mongoose Schema Type Errors**
   - **Issue:** Complex object types causing `CannotDetermineTypeError`
   - **Resolution:** Simplified schemas by removing complex nested objects
   - **Impact:** Clean schema definitions, complex configs moved to separate collections if needed

2. **Dependency Injection Errors**
   - **Issue:** Duplicate provider declarations
   - **Resolution:** Removed duplicates, proper module imports
   - **Impact:** Clean module dependencies

3. **Build Compilation Errors**
   - **Issue:** Missing imports, type mismatches
   - **Resolution:** Fixed all import paths, added missing decorators
   - **Impact:** Service builds successfully

4. **Environment Configuration**
   - **Issue:** Using template service values
   - **Resolution:** Updated `.env` to PORT=3003, database=hydra-aiwm
   - **Impact:** Service runs on correct configuration

5. **Build Cache Issues**
   - **Issue:** Webpack caching old versions
   - **Resolution:** Ran `npx nx reset`
   - **Impact:** Clean builds

### ⏳ PENDING

1. **Redis Connection**
   - **Status:** Redis server remote (10.10.0.100:6379)
   - **Impact:** NOTI queue will work when Redis is available
   - **Action Required:** Verify Redis accessibility for Phase 4

2. **MinIO Setup**
   - **Status:** MinIO not yet configured
   - **Impact:** Model storage will work when MinIO is available
   - **Action Required:** Setup MinIO for Phase 5

---

## Architecture Decisions Summary

### Final Architecture Choices

**1. Orchestration Pattern ❌ BullMQ → ✅ Pure Event-Based**

**Before:**
```typescript
// BullMQ Processor
@Processor(QUEUE_NAMES.DEPLOYMENTS)
export class DeploymentProcessor {
  @Process('deploy')
  async handleDeploy(job: Job) {
    // Orchestrate via BullMQ job
  }
}
```

**After:**
```typescript
// Event-driven Orchestrator
@Injectable()
export class ExecutionOrchestrator {
  async executeExecution(executionId: string) {
    // Orchestrate via WebSocket events + MongoDB state
  }
}
```

**Rationale:**
- Simpler architecture (no Redis for orchestration)
- Single source of truth (MongoDB)
- Real-time by design (WebSocket events)
- Transparent state (easy to query and debug)

---

**2. Entity Naming ❌ Task → ✅ Execution**

**Reason:** Avoid conflict with future "Agent Task" feature

| Old Name | New Name | Purpose |
|----------|----------|---------|
| Task | **Execution** | System orchestration (infrastructure operations) |
| SubTask | **ExecutionStep** | Individual steps in workflow |
| - | **AgentTask** (future) | Work assigned to AI agents |

---

**3. BullMQ Usage Scope**

**Before:** BullMQ for all async operations (orchestration, notifications, jobs)

**After:** BullMQ **ONLY** for NOTI queue (user notifications)

**Orchestration:** Pure event-based with Execution entity (no BullMQ)

---

**4. Worker Implementation ❌ Python → ✅ TypeScript/Node.js** (NEW DECISION)

**Initial Consideration:** Python (ML ecosystem, mature GPU libraries)

**Final Decision:** TypeScript/Node.js in monorepo

**Rationale:**
- ✅ Type safety end-to-end (shared protocol types)
- ✅ Single codebase (easier maintenance)
- ✅ No context switching (same language)
- ✅ Shared libraries from `@hydrabyte/shared`
- ✅ Worker operations are I/O-bound (Node.js excellent)
- ✅ Sufficient ecosystem (dockerode, nvidia-smi, socket.io-client)
- ✅ Faster development (team expertise)

**Worker Location:** `services/aiwm-worker` (in monorepo, NOT separate repo)

---

### What Stayed the Same

✅ WebSocket split (NOTI for users, AIWM for nodes)
✅ Worker-initiated WebSocket connections
✅ MinIO for model storage
✅ MongoDB for metadata
✅ Template service patterns (BaseService, RBAC, error handling)
✅ JWT authentication
✅ Swagger documentation

---

### Repository Structure (Final)

```
hydra-services/
├── services/
│   ├── aiwm/              # Controller (NestJS)
│   │   ├── src/
│   │   │   └── modules/
│   │   │       ├── node/
│   │   │       │   └── node.gateway.ts
│   │   │       └── execution/
│   │   └── project.json
│   │
│   └── aiwm-worker/       # Worker (NestJS/TypeScript) ← NEW
│       ├── src/
│       │   ├── client/
│       │   ├── handlers/
│       │   ├── operations/
│       │   └── config/
│       └── project.json
│
├── libs/
│   └── shared/
│       └── src/
│           └── lib/
│               ├── dto/
│               │   └── websocket/     # Shared protocol DTOs ← NEW
│               ├── interfaces/
│               │   └── websocket/     # Shared interfaces ← NEW
│               └── enum/
│                   └── websocket/     # Shared enums ← NEW
```

---

## Next Session TODO

**Immediate Next Steps (Priority Order):**

1. ⭐ **START Phase 2.5**: Instruction Module (2 days) - HIGH PRIORITY

   **Day 1 Tasks:**
   - Create `instruction.schema.ts` with simplified fields
   - Create `instruction.service.ts` (extends BaseService)
   - Create `instruction.controller.ts` (standard CRUD)
   - Create `instruction.dto.ts` (Create, Update DTOs)
   - Create `instruction.module.ts`
   - Update `agent.schema.ts` - add instructionId field
   - Update `agent.dto.ts` - add to DTOs

   **Day 2 Tasks:**
   - Update `agent.controller.ts` - add populate support
   - Test all CRUD operations via Swagger
   - Test assign/remove instruction from agent
   - Test populate instruction in agent GET
   - Update AIWM-API-DOCUMENTATION.md
   - Create example instructions (customer-support, code-review)

2. ⏭️ **Phase 3**: Node Token + Enhanced APIs (after Instruction)
   - Add JWT signing for node tokens
   - Create `/api/nodes/:nodeId/token` endpoint

3. ⏭️ **Phase 5**: MinIO Integration (high priority for model storage)
   - Setup MinIO client
   - Implement model upload/download

4. ⏭️ **Phase 4**: NOTI Integration
   - Emit deployment/execution events

**Before Starting Development:**
- [x] Architecture decisions finalized
- [x] Design documents reviewed and approved
- [x] Worker implementation language decided (TypeScript)
- [x] Worker location decided (monorepo)
- [ ] Ensure Redis is accessible (for NOTI queue)
- [x] Ensure MongoDB is accessible

**Development Setup:**
```bash
# Terminal 1: MongoDB
# Already running at 10.10.0.100:27017

# Terminal 2: Controller
npx nx serve aiwm

# Terminal 3: Worker (when ready)
npx nx serve aiwm-worker
```

---

## Related Documentation

- **Architecture:** [AIWM-ARCHITECTURE.md](./AIWM-ARCHITECTURE.md) ⭐
- **WebSocket Protocol:** [AIWM-WEBSOCKET-PROTOCOL.md](./AIWM-WEBSOCKET-PROTOCOL.md) ⭐
- **Execution Design:** [AIWM-EXECUTION-DESIGN.md](./AIWM-EXECUTION-DESIGN.md) ⭐
- **Requirements:** [AIWM.md](./AIWM.md)
- **Template Service:** `services/template/README.md`
- **NOTI Service:** `services/noti/README.md`

---

**Document Owner:** Development Team
**Last Updated:** 2025-11-13 (Architecture redesign completed)
**Next Review:** After Phase 2 completion
