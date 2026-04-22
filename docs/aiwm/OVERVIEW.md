# AI Ops Platform MVP v2.0 - Requirements Document

## Overview

AI Ops Platform MVP v2.0 là hệ thống quản lý và triển khai AI/ML workloads trên multi-GPU infrastructure. Platform cung cấp khả năng quản lý GPU nodes (on-premise/cloud), Model Registry, triển khai model inference APIs, và orchestration cho AI agents với MCP tools. Hệ thống hỗ trợ deployment linh hoạt: single-node (controller + GPU), multi-node (separated controller và GPU nodes), hoặc hybrid.

**Target Users:** DevOps teams, ML Engineers, AI product teams cần centralized platform để deploy và manage AI workloads.

---

## Core Features

1. **Multi-GPU Node Management**
   - Register và monitor GPU nodes (on-prem + cloud)
   - Real-time health check (GPU metrics, memory, utilization)
   - Flexible deployment: single-node, multi-node, hybrid modes
   - Auto node discovery và remote orchestration qua WebSocket

2. **Model Registry**
   - Download models từ HuggingFace Hub
   - Centralized storage (MinIO) với versioning
   - Metadata tracking: framework, size, parameters
   - Model distribution tới GPU nodes

3. **Model Deployment & Inference APIs**
   - Deploy models as containerized inference services
   - Support Triton Inference Server (CV, NLP, ASR/TTS) và vLLM (LLM)
   - Dynamic routing: `/models/{model_name}/{instance_id}/v1/inference`
   - Auto GPU allocation với manual override option

4. **AI Agent Framework**
   - Container-based agents với WebSocket communication
   - Agent configuration: LLM model, instruction templates, tools
   - Reusable instruction templates (system prompts + guidelines)
   - MCP tool integration (SSE/HTTP transports)
   - Room-based messaging (agent ↔ users ↔ system)

5. **MCP Tool Registry**
   - Khai báo và deploy MCP servers as containers
   - Support SSE và HTTP transports (stdio excluded in MVP)
   - Tool discovery và assignment to agents
   - Centralized tool management on controller node

6. **Web SDK (Vanilla JS/TS)**
   - Framework-agnostic chat SDK
   - WebSocket connection management
   - File upload (HTTP → MinIO → URL)
   - Message rendering (text, tool calls, system notifications)

7. **IAM & Access Control**
   - JWT-based authentication
   - Role-based permissions: 6 roles (uni/org × owner/editor/viewer)
   - Deploy actions restricted to owner/editor roles
   - Integration với existing IAM service

8. **PII Protection** (Post-MVP)
   - Automatic detection of sensitive data (email, phone, SSN, credit cards, API keys)
   - Real-time redaction before data storage
   - Regex-based pattern matching with configurable patterns
   - Detection logging and audit trail
   - Admin alerts for critical PII exposure

9. **AI Guardrails** (Post-MVP)
   - Content filtering with keyword blacklists
   - Topic restriction enforcement
   - Toxicity detection and blocking
   - Medical/legal advice prevention
   - Configurable per-agent guardrails
   - Violation logging and monitoring

---

## User Roles & Permissions

### Role Structure

**Universal Scope (toàn bộ organizations):**
- `universe.owner`: Full system admin
- `universe.editor`: Manage resources across orgs
- `universe.viewer`: Read-only access to all orgs

**Organization Scope (trong org cụ thể):**
- `organization.owner`: Full control within org
- `organization.editor`: Manage org resources
- `organization.viewer`: Read-only within org

### Permission Matrix

| Action | Required Roles |
|--------|----------------|
| Deploy models | universe.owner, universe.editor, organization.owner, organization.editor |
| Register GPU nodes | universe.owner, universe.editor, organization.owner, organization.editor |
| Create agents | universe.owner, universe.editor, organization.owner, organization.editor |
| View metrics | All roles |
| Deploy MCP tools | universe.owner, universe.editor, organization.owner, organization.editor |
| Chat with agents | All roles |

---

## Tech Stack

### Backend
- **Framework:** NestJS v10+ (TypeScript)
- **Database:** MongoDB v7+ (metadata storage)
- **Message Queue:** BullMQ v5+ (job scheduling)
- **WebSocket:** Socket.io v4+ (agent/node communication)
- **Object Storage:** MinIO (model artifacts)
- **Proxy:** Nginx v1.24+ (inference routing)

### Model Serving
- **Triton Inference Server:** v2.40+ (CV, NLP, ASR/TTS)
- **vLLM:** v0.6+ (LLM inference)
- **Container Runtime:** Docker v24+ with NVIDIA Container Toolkit v1.17+

### Networking
- **VPN:** WireGuard (self-hosted on controller for multi-node deployment)
- **Communication:** WebSocket for control plane, HTTP for data plane

### GPU Sharing
- **Method:** NVIDIA MPS (Time-slicing)
- **Future:** MIG support (A100/H100)

### MCP Tools
- **Transport:** SSE + HTTP only (stdio excluded)
- **SDK:** @modelcontextprotocol/sdk (TypeScript)
- **Deployment:** Docker containers on controller node

### Web SDK
- **Type:** Vanilla JavaScript/TypeScript library
- **Dependencies:** Socket.io-client, Axios
- **Build:** ES modules + UMD
- **Framework:** Agnostic (React, Vue, Angular compatible)

### Node Daemon
- **Language:** Node.js v20+ hoặc Python 3.11+
- **Role:** Simple executor (no embedded agent in MVP)
- **APIs:** HTTP REST endpoints cho system operations

---

## Architecture

### Domain & URL Structure

**Domain Planning:**
- `api.<proxy domain>` → Backend API (no `/api` sub-path)
  - Example: `api.aiops.xorcloud.vn/deployments`
  - All REST endpoints served directly at root
- `ws.<proxy domain>` → WebSocket Gateway
  - `/agent` → Agent ↔ Backend communication
  - `/system` → System notifications to users/agents
  - Example: `ws://ws.aiops.xorcloud.vn/agent`, `ws://ws.aiops.xorcloud.vn/system`
- `storage.<proxy domain>` → MinIO Object Storage
  - Example: `https://storage.aiops.xorcloud.vn/models/whisper-v3/model.bin`
  - S3-compatible API for model artifacts, files, conversation attachments
- `<proxy domain>` → Web Application (Frontend)
  - Example: `https://aiops.xorcloud.vn`

**API Endpoint URLs (updated):**
- Auth: `POST https://api.aiops.xorcloud.vn/auth/login`
- Nodes: `GET https://api.aiops.xorcloud.vn/nodes`
- Deployments: `POST https://api.aiops.xorcloud.vn/deployments`
- Agents: `GET https://api.aiops.xorcloud.vn/agents`
- Tools: `GET https://api.aiops.xorcloud.vn/tools`

**WebSocket URLs:**
- Agent Gateway: `ws://ws.aiops.xorcloud.vn/agent`
- System Notifications: `ws://ws.aiops.xorcloud.vn/system`

**Storage URLs:**
- Model Artifacts: `https://storage.aiops.xorcloud.vn/models/{modelId}/{file}`
- Uploaded Files: `https://storage.aiops.xorcloud.vn/files/{fileId}`
- S3 API Endpoint: `https://storage.aiops.xorcloud.vn` (S3-compatible)

### Deployment Models

**Model 1: Single-Node (Controller + GPU)**
```
┌────────────────────────────────────────┐
│ Single Node (localhost)                │
├────────────────────────────────────────┤
│ • NestJS Backend + MongoDB + MinIO    │
│ • MCP Tool Containers                  │
│ • Agent Containers                     │
│ • Node Daemon (localhost connection)  │
│ • Triton + vLLM Containers (GPU)      │
└────────────────────────────────────────┘
```

**Model 2: Multi-Node (Separated)**
```
┌─────────────────────────────────────┐
│ Controller Node (Public IP)         │
│ • NestJS Backend                    │
│ • MongoDB + MinIO                   │
│ • MCP Tool Containers               │
│ • Agent Containers                  │
│ • Nginx Proxy                       │
└─────────────────────────────────────┘
         ↕ WireGuard VPN
┌─────────────────────────────────────┐
│ GPU Node 1 (Private, VPN IP)        │
│ • Node Daemon                       │
│ • Triton + vLLM Containers          │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ GPU Node 2 (Private, VPN IP)        │
│ • Node Daemon                       │
│ • Triton + vLLM Containers          │
└─────────────────────────────────────┘
```

**Model 3: Hybrid (Controller có GPU + Remote Nodes)**
```
┌─────────────────────────────────────┐
│ Controller + GPU Node               │
│ • Backend + Local GPU workloads     │
└─────────────────────────────────────┘
         ↕ WireGuard VPN
┌─────────────────────────────────────┐
│ Remote GPU Nodes                    │
└─────────────────────────────────────┘
```

### Component Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    CONTROLLER NODE                        │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │          NestJS Backend Services                 │    │
│  ├─────────────────────────────────────────────────┤    │
│  │ • API Gateway (REST + WebSocket)                │    │
│  │ • IAM Middleware (JWT validation)               │    │
│  │ • Node Manager Service                          │    │
│  │ • Model Registry Service                        │    │
│  │ • Deployment Orchestrator (BullMQ)              │    │
│  │ • Agent Manager Service                         │    │
│  │ • MCP Tool Manager                              │    │
│  │ • Auto GPU Selector                             │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   MongoDB    │  │    MinIO     │  │    BullMQ    │  │
│  │  (metadata)  │  │  (models)    │  │   (jobs)     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │        MCP Tool Containers (SSE/HTTP)            │    │
│  │  ├─ web-search-tool                             │    │
│  │  ├─ calculator-tool                             │    │
│  │  └─ database-query-tool                         │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │           Agent Containers                       │    │
│  │  ├─ customer-support-agent                      │    │
│  │  ├─ code-review-agent                           │    │
│  │  └─ data-analyst-agent                          │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │        Nginx (Inference Proxy)                   │    │
│  │  Route: /models/{name}/{id}/* → GPU Nodes       │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
└──────────────────────────────────────────────────────────┘
                         ↕
          WebSocket (outbound) + WireGuard VPN
                         ↕
┌──────────────────────────────────────────────────────────┐
│                      GPU NODE                             │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │          Node Daemon (Executor)                  │    │
│  ├─────────────────────────────────────────────────┤    │
│  │ • WebSocket Client → Controller                 │    │
│  │ • HTTP REST APIs:                               │    │
│  │   - GET /health                                 │    │
│  │   - GET /metrics                                │    │
│  │   - POST /deploy                                │    │
│  │   - DELETE /stop/{container_id}                 │    │
│  │   - GET /logs/{container_id}                    │    │
│  │ • Docker Client (manage containers)             │    │
│  │ • MinIO Sync (model cache)                      │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │      Inference Containers (NVIDIA runtime)       │    │
│  │  ├─ Triton: whisper-v3 (ASR)                    │    │
│  │  ├─ Triton: yolov8 (CV)                         │    │
│  │  ├─ vLLM: llama-3-8b                            │    │
│  │  └─ vLLM: mistral-7b                            │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
│  GPU Resources: Tesla P40 x6 (MPS enabled)               │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### Network Topology

**Single-Node:**
- All components: `localhost` or Docker network bridge
- No VPN required

**Multi-Node:**
- Controller: Public IP or private IP with VPN access
- GPU Nodes: WireGuard VPN IPs (10.8.0.x)
- Node Daemon → Controller: Outbound WebSocket over VPN (no direct inbound ports)
- Inference requests: Nginx proxy → VPN IP → Node daemon → Local container

---

## Main Workflows

### 1. Model Deployment Workflow

**Actors:** User (organization.editor), Backend, GPU Node

**Steps:**
1. User submits model deployment request via UI/API
   - Model: `whisper-v3`
   - Target node: Auto-select (hoặc manual)
2. Backend validates permissions (check JWT roles)
3. Backend selects best GPU node (if auto):
   - Query node metrics (free memory, current load, latency)
   - Rank nodes, select optimal
4. Backend checks model availability:
   - If not in MinIO → download from HuggingFace → save MinIO
5. Backend creates job in BullMQ
6. Job processor sends WebSocket command to Node Daemon:
   ```json
   {
     "type": "system.node.deployModel",
     "requestId": "req-123",
     "jobId": "job-456",
     "modelId": "whisper-v3",
     "framework": "triton",
     "containerConfig": {
       "image": "nvcr.io/nvidia/tritonserver:24.01",
       "gpuDevice": "0",
       "memoryLimit": "8g",
       "ports": "8001:8000"
     },
     "modelPath": "s3://mlflow-artifacts/whisper-v3"
   }
   ```
7. Node Daemon:
   - Downloads model từ MinIO (if not cached)
   - Starts Docker container với NVIDIA runtime
   - Reports back status: `deploying` → `running` | `failed`
8. Backend updates deployment record và sends notification:
   ```json
   {
     "type": "system.deploymentStatus",
     "deploymentId": "deploy-789",
     "status": "running",
     "endpoint": "/models/whisper-v3/abc123/v1/inference"
   }
   ```
9. Backend configures Nginx proxy rule dynamically
10. User receives deployment success notification

**Error Handling:**
- Model download fails → retry 3 times → notify user
- Container start fails → rollback, report logs
- GPU OOM → suggest smaller model or different node

---

### 2. Agent Creation & Chat Workflow

**Actors:** User, Backend, Agent Container, MCP Tools

**Phase A: Agent Creation**

1. User creates agent via UI:
   - Name: "Customer Support Bot"
   - LLM Model: Select from deployed models (e.g., `llama-3-8b/instance-abc`)
   - Instruction: "You are a helpful customer support agent..."
   - Tools: Select from registry (e.g., `web-search`, `database-query`)
   - Working directory: `/workspace/customer-data`
2. Backend validates and saves agent config to MongoDB
3. Backend deploys agent container:
   - Base image: `aiops/agent-runtime:latest`
   - Environment:
     ```
     AGENT_ID=agent-123
     LLM_ENDPOINT=http://controller/models/llama-3-8b/instance-abc/v1/chat
     TOOLS=web-search,database-query
     WS_SERVER=ws://controller/agent-gateway
     ```
   - Mount working directory (if specified)
4. Agent container starts:
   - Connects to Backend WebSocket: `ws://controller/agent-gateway`
   - Sends registration message:
     ```json
     {
       "type": "agent.register",
       "agentId": "agent-123",
       "status": "ready",
       "capabilities": ["chat", "toolUse"]
     }
     ```
   - Discovers MCP tools:
     - GET `http://controller/mcp-registry/tools?ids=web-search,database-query`
     - Connects to tool SSE endpoints
5. Backend creates agent room: `room:agent-123`

**Phase B: User Chat Session**

1. User opens chat UI → Web SDK connects WebSocket
2. SDK sends join room message:
   ```json
   {
     "type": "user.joinConversation",
     "conversationId": "conv-456",
     "agentId": "agent-123",
     "userId": "user-789"
   }
   ```
3. Backend routes user to agent room
4. User sends message:
   ```json
   {
     "type": "user.message",
     "messageId": "msg-001",
     "conversationId": "conv-456",
     "content": "What's the weather in Paris?",
     "timestamp": 1738056000000
   }
   ```
5. Agent receives message:
   - Sends to LLM with system instruction + tools definition
   - LLM responds with tool call
   - Agent sends tool start event:
     ```json
     {
       "type": "agent.toolCall.start",
       "messageId": "msg-002",
       "conversationId": "conv-456",
       "agentId": "agent-123",
       "toolName": "web_search",
       "toolInput": {"query": "weather Paris"},
       "timestamp": 1738056001000
     }
     ```
6. Agent invokes MCP tool (SSE request):
   - POST `http://controller/mcp/web-search/invoke`
   - Body: `{"query": "weather Paris"}`
   - Tool returns: `{"result": "Sunny, 18°C"}`
7. Agent sends tool end event:
   ```json
   {
     "type": "agent.toolCall.end",
     "messageId": "msg-002",
     "conversationId": "conv-456",
     "agentId": "agent-123",
     "toolName": "web_search",
     "toolOutput": {"result": "Sunny, 18°C"},
     "status": "success",
     "durationMs": 1250,
     "timestamp": 1738056002250
   }
   ```
8. Agent sends final message to user:
   ```json
   {
     "type": "agent.message",
     "messageId": "msg-003",
     "conversationId": "conv-456",
     "agentId": "agent-123",
     "content": "The weather in Paris is sunny, 18°C.",
     "timestamp": 1738056003000
   }
   ```
9. Backend saves conversation to MongoDB
10. Web SDK renders messages in UI

**Phase C: File Upload (Optional)**

1. User uploads file (image/document):
   - Web SDK: POST `http://controller/api/files/upload`
   - Multipart form data
2. Backend saves to MinIO → returns URL
3. SDK sends message with file URL:
   ```json
   {
     "type": "user.message",
     "messageId": "msg-004",
     "content": "Analyze this image",
     "files": [{
       "url": "https://minio/files/image.png",
       "filename": "screenshot.png",
       "mimetype": "image/png"
     }]
   }
   ```
4. Agent downloads file → processes (if needed) → responds

---

### 3. MCP Tool Registration Workflow

**Actors:** Admin User, Backend

1. Admin navigates to Tool Registry UI
2. Clicks "Register New MCP Tool"
3. Fills form:
   - Name: `web-search`
   - Description: "Search the web using DuckDuckGo"
   - Transport: `SSE`
   - Docker Image: `aiops/mcp-web-search:latest`
   - Port: `3100`
   - Environment variables: `API_KEY=xxx`
4. Backend validates và saves tool config to MongoDB
5. Backend creates deployment job:
   - Pulls Docker image
   - Starts container on controller node:
     ```bash
     docker run -d \
       --name mcp-web-search \
       -p 3100:3100 \
       -e API_KEY=xxx \
       aiops/mcp-web-search:latest
     ```
   - Waits for health check: `GET http://localhost:3100/health`
6. Backend updates tool status: `active`
7. Tool appears in Agent configuration dropdown
8. When agent selects tool → Backend provides SSE endpoint URL to agent container

**Tool Invocation by Agent:**
- Agent sends HTTP POST to tool endpoint
- Tool processes request → returns result
- Agent forwards result to LLM

---

## Data Models

### MongoDB Collections Overview

**Core Collections (MVP):**
1. **`nodes`** - Infrastructure nodes (controller, worker, proxy, storage)
2. **`models`** - AI/ML model registry
3. **`deployments`** - Model deployment records
4. **`agents`** - AI agent configurations
5. **`tools`** - MCP and built-in tools
6. **`instructions`** - Reusable instruction templates for agents
7. **`connections`** - Connection endpoints for agents (web-sdk, discord, telegram, webhook)
8. **`conversations`** - Conversation metadata (separated from messages)
9. **`messages`** - Individual messages in conversations

**Additional Collections (Post-MVP):**
10. **`datasets`** - Training datasets for fine-tuning
11. **`finetuneJobs`** - Fine-tuning job tracking
12. **`checkpoints`** - Training checkpoints
13. **`piiPatterns`** - PII detection patterns
14. **`piiDetections`** - PII detection audit log
15. **`guardrails`** - Content filtering and safety rules
16. **`guardrailViolations`** - Guardrail violation logs

**Key Changes from v2.5 (Simplified MVP):**
- Simplified `instructions` collection - Reduced from 6 fields (role, context, task, examples, toolsGuidance, outputFormat) to 2 core fields (systemPrompt, guidelines[])
- Removed version tracking, usageCount, and category from Instruction entity (can add later if needed)
- Focus on MVP: Simple, reusable system prompts for agents

**Key Changes from v2.4:**
- Added `instructions` collection - Reusable instruction templates (simplified from original complex structure)
- Added `connections` collection - Connection endpoints for agents (web-sdk, discord, telegram, webhook)
- Updated `agents` schema to reference `instructionId` instead of inline instruction string

**Key Changes from v2.3:**
- Added universal fields: `owner` (orgId, userId), `createdAt`, `changedAt`, `deletedAt`, `isDeleted` to all entities
- Split `conversations` into `conversations` (metadata) and `messages` (individual messages) for query optimization
- Removed `agentActions` collection (redundant - `messages` with type="tool" already track tool calls)

**Key Changes from v1:**
- `gpuNodes` → `nodes` (supports multiple roles: controller/worker/proxy/storage)
- `mcpTools` → `tools` (supports both MCP and built-in tool types)
- All fields use camelCase naming convention

---

#### 1. `nodes` - Infrastructure nodes
```typescript
{
  _id: ObjectId,                    // MongoDB primary key
  nodeId: string,                   // Unique node identifier, e.g., "node-001" | required | indexed
  name: string,                     // Display name | required | max 255 chars
  role: string[],                   // Node roles | required | enum: ["controller", "worker", "proxy", "storage"]
                                    // Multiple roles allowed (e.g., ["controller", "worker"])
  status: string,                   // Node status | required | enum: ["online", "offline", "maintenance"]

  // Connection info
  isLocal: boolean,                 // Same machine as controller | required | default: false
  vpnIp?: string,                   // WireGuard VPN IP address | optional | format: "10.8.0.x"
  websocketConnected: boolean,      // WebSocket connection status | required | default: false
  lastHeartbeat: Date,              // Last heartbeat timestamp | required | updated every 30s

  // Hardware specs
  gpuDevices?: [{
    deviceId: string,               // GPU device ID | required if GPU present | e.g., "0", "1"
    model: string,                  // GPU model name | required | e.g., "Tesla P40", "A100"
    memoryTotal: number,            // Total GPU memory in MB | required | positive integer
    memoryFree: number,             // Free GPU memory in MB | required | 0 <= value <= memoryTotal
    utilization: number,            // GPU utilization % | required | 0-100
    temperature: number             // GPU temperature in Celsius | required | typically 0-100
  }],                               // Optional - only present if role includes "worker" AND has GPU
  cpuCores: number,                 // CPU core count | required | positive integer
  ramTotal: number,                 // Total RAM in MB | required | positive integer
  ramFree: number,                  // Free RAM in MB | required | 0 <= value <= ramTotal

  // Configuration
  config: {
    controllerEndpoint: string,     // Controller WebSocket URL | required | format: "ws://host:port"
    workingDirectory: string        // Working directory path | required | absolute path
  },

  // Ownership & Audit
  owner: {
    orgId: ObjectId,                // Organization ID | required | reference to organizations
    userId: ObjectId                // Owner user ID | required | reference to users
  },
  createdAt: Date,                  // Record creation timestamp | auto-generated
  changedAt: Date,                  // Last modification timestamp | auto-updated
  deletedAt?: Date,                 // Soft delete timestamp | optional | set when isDeleted=true
  isDeleted: boolean                // Soft delete flag | required | default: false
}
```

#### 2. `models` - AI/ML Model Registry
```typescript
{
  _id: ObjectId,                    // MongoDB primary key (NO custom modelId)

  // Core fields (both deployment types)
  name: string,                     // Model display name | required | max 100 chars | e.g., "GPT-4 Turbo", "Llama-3-8B"
  type: string,                     // Model type | required | enum: ["llm", "embedding", "diffusion", "classifier"]
  description: string,              // Model description | required | max 500 chars
  version: string,                  // Model version | required | e.g., "1.0", "2024-11-20"
  deploymentType: string,           // Deployment type | required | enum: ["self-hosted", "api-based"]
                                    // "self-hosted": Download from HuggingFace and deploy on GPU nodes
                                    // "api-based": Forward requests to external AI provider APIs

  // Status lifecycle
  status: string,                   // Model status | required | enum: ["active", "inactive", "queued", "downloading", "deploying", "error"]
                                    // "active": Ready for inference
                                    // "inactive": Disabled by user
                                    // "queued": Waiting for processing
                                    // "downloading": Downloading from HuggingFace (self-hosted only)
                                    // "deploying": Deploying to GPU node (self-hosted only)
                                    // "error": Failed deployment or error state
                                    // Default: "queued"

  // Self-hosted model fields (required if deploymentType = "self-hosted")
  repository?: string,              // HuggingFace repository | optional | e.g., "meta-llama/Llama-3-8B"
  framework?: string,               // Model framework | optional | enum: ["pytorch", "tensorflow", "onnx", "huggingface"]
  fileName?: string,                // Model file name | optional | e.g., "model.safetensors"
  fileSize?: number,                // File size in bytes | optional | positive integer
  downloadPath?: string,            // Local/MinIO path after download | optional | e.g., "/models/llama-3-8b"
  nodeId?: ObjectId,                // GPU node reference | optional | reference to nodes collection

  // API-based model fields (required if deploymentType = "api-based")
  provider?: string,                // AI provider | optional | e.g., "openai", "anthropic", "google", "azure", "cohere"
  apiEndpoint?: string,             // API endpoint URL | optional | e.g., "https://api.openai.com/v1"
  modelIdentifier?: string,         // API model name | optional | e.g., "gpt-4-turbo", "claude-3-sonnet-20240229"
  requiresApiKey?: boolean,         // API key required | optional | default: true

  // Access control
  scope: string,                    // Access scope | required | enum: ["public", "org", "private"] | default: "public"

  // Ownership & Audit (from BaseSchema)
  owner: {
    orgId: ObjectId,                // Organization ID | required | reference to organizations
    groupId: string,                // Group ID | optional
    userId: ObjectId,               // Owner user ID | required | reference to users
    agentId: string,                // Agent ID | optional
    appId: string                   // App ID | optional
  },
  createdBy: ObjectId,              // Creator user ID | required | reference to users
  updatedBy: ObjectId,              // Last updater user ID | required | reference to users
  createdAt: Date,                  // Record creation timestamp | auto-generated
  updatedAt: Date,                  // Last modification timestamp | auto-updated
  deletedAt?: Date                  // Soft delete timestamp | optional | set when soft deleted
}
```

#### 3. `deployments` - Model Deployment Records
```typescript
{
  _id: ObjectId,                    // MongoDB primary key
  deploymentId: string,             // Unique deployment identifier | required | indexed
  instanceId: string,               // Unique instance identifier | required | indexed | for multi-instance deployments
  modelId: ObjectId,                // Model reference | required | reference to models collection
  nodeId: ObjectId,                 // Node reference | required | reference to nodes collection

  // Container info
  containerId: string,              // Docker container ID | required | set after deployment
  containerName: string,            // Container name | required | format: "model-{modelId}-{instanceId}"
  image: string,                    // Docker image used | required | e.g., "nvcr.io/nvidia/tritonserver:24.01"

  // GPU allocation
  gpuDevice: string,                // GPU device IDs | required | format: "0" or "0,1" for multi-GPU
  memoryAllocated: number,          // Allocated GPU memory in MB | required | positive integer

  // Networking
  port: number,                     // Container port | required | 1024-65535
  endpoint: string,                 // API endpoint path | required | format: "/models/{model}/{instance}/v1/inference"

  // Status
  status: string,                   // Deployment status | required | enum: ["deploying", "running", "stopped", "failed"]
  healthStatus: string,             // Health status | required | enum: ["healthy", "unhealthy", "unknown"]
  errorMessage?: string,            // Error message | optional | set if status="failed"

  // Metrics
  requestCount: number,             // Total request count | required | default: 0 | incremented on each request
  avgLatencyMs: number,             // Average latency in ms | required | default: 0 | updated on requests
  lastRequestAt?: Date,             // Last request timestamp | optional | updated on requests

  deployedBy: ObjectId,             // Deployer user ID | required | reference to users collection
  deployedAt: Date,                 // Deployment timestamp | required | set when status="running"
  stoppedAt?: Date,                 // Stop timestamp | optional | set when status="stopped"

  // Ownership & Audit
  owner: {
    orgId: ObjectId,                // Organization ID | required | reference to organizations
    userId: ObjectId                // Owner user ID | required | reference to users
  },
  createdAt: Date,                  // Record creation timestamp | auto-generated
  changedAt: Date,                  // Last modification timestamp | auto-updated
  deletedAt?: Date,                 // Soft delete timestamp | optional | set when isDeleted=true
  isDeleted: boolean                // Soft delete flag | required | default: false
}
```

#### 4. `agents` - AI Agent Configurations
```typescript
{
  _id: ObjectId,                    // MongoDB primary key
  agentId: string,                  // Unique agent identifier | required | indexed
  name: string,                     // Agent display name | required | max 255 chars
  description: string,              // Agent description | required | max 1000 chars

  // LLM Configuration
  llmModel: {
    deploymentId: ObjectId,         // Deployment reference | optional | reference to deployments collection
    provider: string,               // LLM provider | required | enum: ["internal", "openai", "anthropic"]
    modelName: string,              // Model name | required | e.g., "llama-3-8b", "gpt-4"
    endpoint?: string               // Custom endpoint | optional | override default endpoint
  },

  // Instruction Configuration
  instructionId?: ObjectId,         // Instruction template reference | optional | reference to instructions collection
  instructionOverride?: string,     // Override instruction inline | optional | max 10000 chars
                                    // If both instructionId and instructionOverride present, override takes priority

  tools: ObjectId[],                // Tool references | required | array of tool IDs from tools collection
                                    // Supports both MCP and builtin tools

  workingDirectory?: string,        // Working directory path | optional | absolute path | mounted to container

  // Runtime
  containerId?: string,             // Container ID | optional | set when agent is running
  status: string,                   // Agent status | required | enum: ["stopped", "starting", "running", "error"]
  websocketConnected: boolean,      // WebSocket connection status | required | default: false
  roomId: string,                   // Chat room ID | required | format: "room:agent-{agentId}"

  // Statistics
  conversationCount: number,        // Total conversation count | required | default: 0
  messageCount: number,             // Total message count | required | default: 0

  // Ownership & Audit
  owner: {
    orgId: ObjectId,                // Organization ID | required | reference to organizations
    userId: ObjectId                // Owner user ID | required | reference to users
  },
  createdAt: Date,                  // Record creation timestamp | auto-generated
  changedAt: Date,                  // Last modification timestamp | auto-updated
  deletedAt?: Date,                 // Soft delete timestamp | optional | set when isDeleted=true
  isDeleted: boolean                // Soft delete flag | required | default: false
}
```

#### 5. `tools` - MCP and Built-in Tools
```typescript
{
  _id: ObjectId,                    // MongoDB primary key
  toolId: string,                   // Unique tool identifier | required | indexed
  name: string,                     // Tool name | required | max 100 chars | e.g., "webSearch", "listAgents"
  type: string,                     // Tool type | required | enum: ["mcp", "builtin"]
  description: string,              // Tool description | required | max 500 chars
  category: string,                 // Tool category | required | enum: ["productivity", "data", "system", "communication"]

  // MCP-specific fields (only if type = "mcp")
  transport?: string,               // Transport protocol | optional | enum: ["sse", "http"] | required if type="mcp"
  endpoint?: string,                // Tool endpoint URL | optional | format: "http://host:port/path" | required if type="mcp"
  dockerImage?: string,             // Docker image name | optional | e.g., "aiops/mcp-web-search:latest" | required if type="mcp"
  containerId?: string,             // Running container ID | optional | set when deployed
  port?: number,                    // Container port | optional | 1024-65535 | required if type="mcp"
  environment?: Record<string, string>, // Environment variables | optional | key-value pairs
  healthEndpoint?: string,          // Health check URL | optional | format: "/health"
  lastHealthCheck?: Date,           // Last health check time | optional | updated on check

  // Built-in specific fields (only if type = "builtin")
  // Built-in tools are pre-packaged in agent container, no deployment needed

  // Common fields
  status: string,                   // Tool status | required | enum: ["active", "inactive", "error"]
  schema: {
    inputSchema: object,            // JSON Schema for input | required | JSON Schema format
    outputSchema: object            // JSON Schema for output | required | JSON Schema format
  },

  // Access control
  scope: string,                    // Access scope | required | enum: ["public", "org", "private"]
  allowedOrgs?: ObjectId[],         // Allowed organization IDs | optional | only if scope="org"

  // Ownership & Audit
  owner: {
    orgId: ObjectId,                // Organization ID | required | reference to organizations
    userId: ObjectId                // Owner user ID | required | reference to users
  },
  createdAt: Date,                  // Record creation timestamp | auto-generated
  changedAt: Date,                  // Last modification timestamp | auto-updated
  deletedAt?: Date,                 // Soft delete timestamp | optional | set when isDeleted=true
  isDeleted: boolean                // Soft delete flag | required | default: false
}

// Built-in Tools Examples (pre-configured in agent container):
// - webSearch: Search internet using DuckDuckGo
// - listAgents: Get all agents in organization
// - findDocuments: Search documents by query
// - readDocument: Read document content by ID
// - findTasks: Search assigned tasks
// - getTaskDetails: Get task information
```

#### 6. `instructions` - Reusable Instruction Templates (SIMPLIFIED MVP)
```typescript
{
  _id: ObjectId,                    // MongoDB primary key
  instructionId: string,            // Unique instruction identifier | required | indexed | e.g., "inst-1731744000"
  name: string,                     // Template name | required | max 255 chars | e.g., "Customer Support Agent"
  description?: string,             // Template description | optional | max 500 chars

  // Core Content (MVP - Simplified from v2.4)
  systemPrompt: string,             // Complete system prompt | required | max 10000 chars
                                    // Combines role, context, task, examples into single prompt
                                    // Example: "You are a professional customer support agent. Your goal is to..."

  guidelines?: string[],            // Simple bullet-point guidelines | optional | array of strings
                                    // Example: ["Greet warmly", "Listen actively", "Provide clear solutions"]

  // Metadata (Minimal)
  tags?: string[],                  // Tags for filtering | optional | array of strings | e.g., ["support", "customer-service"]
  isActive: boolean,                // Enable/disable instruction | required | default: true

  // Ownership & Audit
  owner: {
    orgId: ObjectId,                // Organization ID | required | reference to organizations
    userId: ObjectId                // Owner user ID | required | reference to users
  },
  createdAt: Date,                  // Record creation timestamp | auto-generated
  changedAt: Date,                  // Last modification timestamp | auto-updated
  deletedAt?: Date,                 // Soft delete timestamp | optional | set when isDeleted=true
  isDeleted: boolean                // Soft delete flag | required | default: false
}
```

#### 7. `connections` - Agent Connection Endpoints
```typescript
{
  _id: ObjectId,                    // MongoDB primary key
  connectionId: string,             // Unique connection identifier | required | indexed
  name: string,                     // Connection name | required | max 255 chars | e.g., "Company Website Chat"
  type: string,                     // Connection type | required | enum: ["web-sdk", "discord", "telegram", "webhook"]

  agentId: ObjectId,                // Agent reference | required | reference to agents collection

  // Type-specific configuration
  config: {
    // For type="web-sdk"
    allowedOrigins?: string[],      // CORS allowed origins | optional | array of URLs

    // For type="discord"
    botToken?: string,              // Discord bot token | optional | encrypted
    guildId?: string,               // Discord server ID | optional
    channelIds?: string[],          // Allowed channel IDs | optional

    // For type="telegram"
    botToken?: string,              // Telegram bot token | optional | encrypted
    allowedUserIds?: number[],      // Allowed Telegram user IDs | optional

    // For type="webhook"
    webhookUrl?: string,            // Webhook callback URL | optional
    secret?: string,                // Webhook secret for verification | optional | encrypted
    headers?: Record<string, string> // Custom headers | optional
  },

  // Status
  status: string,                   // Connection status | required | enum: ["active", "inactive", "error"]
  lastActiveAt?: Date,              // Last activity timestamp | optional

  // Statistics
  messageCount: number,             // Total messages received | required | default: 0
  errorCount: number,               // Total errors | required | default: 0

  // Ownership & Audit
  owner: {
    orgId: ObjectId,                // Organization ID | required | reference to organizations
    userId: ObjectId                // Owner user ID | required | reference to users
  },
  createdAt: Date,                  // Record creation timestamp | auto-generated
  changedAt: Date,                  // Last modification timestamp | auto-updated
  deletedAt?: Date,                 // Soft delete timestamp | optional | set when isDeleted=true
  isDeleted: boolean                // Soft delete flag | required | default: false
}
```

#### 8. `conversations` - Conversation Metadata
```typescript
{
  _id: ObjectId,                    // MongoDB primary key
  conversationId: string,           // Unique conversation identifier | required | indexed
  agentId: ObjectId,                // Agent reference | required | reference to agents collection
  userId: ObjectId,                 // User reference | required | reference to users collection
  connectionId?: ObjectId,          // Connection reference | optional | reference to connections collection
                                    // Tracks which connection endpoint initiated this conversation

  // Metadata
  title?: string,                   // Conversation title | optional | auto-generated or user-set
  channel?: string,                 // Communication channel | optional | enum: ["web-sdk", "discord", "telegram", "webhook"]
  channelMetadata?: object,         // Channel-specific metadata | optional
                                    // Discord: {guildId, channelId, threadId}
                                    // Telegram: {chatId, userId}
                                    // Webhook: {sourceIp, headers}

  // Statistics
  messageCount: number,             // Total message count | required | default: 0 | incremented on new messages
  lastMessageAt?: Date,             // Last message timestamp | optional | updated on new messages

  status: string,                   // Conversation status | required | enum: ["active", "archived"]

  // Ownership & Audit
  owner: {
    orgId: ObjectId,                // Organization ID | required | reference to organizations
    userId: ObjectId                // Owner user ID | required | reference to users (same as userId above)
  },
  createdAt: Date,                  // Record creation timestamp | auto-generated
  changedAt: Date,                  // Last modification timestamp | auto-updated
  deletedAt?: Date,                 // Soft delete timestamp | optional | set when isDeleted=true
  isDeleted: boolean                // Soft delete flag | required | default: false
}
```

#### 7. `messages` - Individual Chat Messages
```typescript
{
  _id: ObjectId,                    // MongoDB primary key
  messageId: string,                // Unique message identifier | required | indexed
  conversationId: ObjectId,         // Conversation reference | required | indexed | reference to conversations

  // Message metadata
  type: string,                     // Message type | required | enum: ["user", "agent", "system", "tool"]
  senderId: ObjectId,               // Sender ID | required | user/agent/system ID
  senderType: string,               // Sender type | required | enum: ["user", "agent", "system"]

  // Content (varies by type)
  content?: string,                 // Message content | optional | required for user/agent/system types
  files?: [{
    url: string,                    // File URL | required | MinIO URL
    filename: string,               // Original filename | required
    mimetype: string,               // MIME type | required | e.g., "image/png"
    size: number                    // File size in bytes | required | positive integer
  }],

  // Tool use (if type = "tool")
  toolName?: string,                // Tool name | optional | required if type="tool"
  toolInput?: object,               // Tool input parameters | optional | JSON object
  toolOutput?: object,              // Tool output result | optional | JSON object
  toolStatus?: string,              // Tool execution status | optional | enum: ["pending", "success", "error"]
  durationMs?: number,              // Tool execution duration | optional | positive integer

  // Agent thinking (optional)
  thinking?: string,                // Agent internal reasoning | optional | for debugging/transparency

  // Ownership & Audit
  owner: {
    orgId: ObjectId,                // Organization ID | required | reference to organizations
    userId: ObjectId                // Owner user ID | required | reference to users
  },
  createdAt: Date,                  // Message timestamp | auto-generated | indexed for sorting
  changedAt: Date,                  // Last modification timestamp | auto-updated
  deletedAt?: Date,                 // Soft delete timestamp | optional | set when isDeleted=true
  isDeleted: boolean                // Soft delete flag | required | default: false
}
```

#### 10. `piiPatterns` - PII Detection Patterns (Post-MVP)
```typescript
{
  _id: ObjectId,
  patternId: string,                // Unique identifier | required | indexed
  name: string,                     // Pattern name | required | e.g., "Email", "SSN"
  type: string,                     // Detection type | required | enum: ["regex", "ai-based"]
  category: string,                 // PII category | required | enum: ["contact", "financial", "medical", "identity"]

  // Pattern definition
  regex?: string,                   // Regex pattern | optional | required if type="regex"
  flags?: string,                   // Regex flags | optional | e.g., "gi"
  nerLabels?: string[],             // NER labels | optional | required if type="ai-based"

  // Redaction configuration
  redactionMethod: string,          // Redaction method | required | enum: ["mask", "hash", "remove", "token"]
  maskChar: string,                 // Masking character | required | default: "*"
  preserveLength: boolean,          // Preserve original length | required | default: true

  isActive: boolean,                // Pattern active status | required | default: true
  severity: string,                 // Severity level | required | enum: ["low", "medium", "high", "critical"]

  owner: { orgId, userId },
  createdAt, changedAt, deletedAt, isDeleted
}
```

#### 11. `piiDetections` - PII Detection Audit Log (Post-MVP)
```typescript
{
  _id: ObjectId,
  detectionId: string,              // Unique identifier | required | indexed

  // Source reference
  sourceType: string,               // Source type | required | enum: ["message", "dataset", "file"]
  sourceId: ObjectId,               // Reference to source | required
  conversationId?: ObjectId,        // Conversation reference | optional

  // Detection details
  patternId: ObjectId,              // Pattern used | required | reference to piiPatterns
  detectedText: string,             // Original text | required | encrypted at rest
  redactedText: string,             // Redacted version | required
  position: {
    start: number,                  // Character offset start | required
    end: number                     // Character offset end | required
  },

  // Action taken
  action: string,                   // Action | required | enum: ["redacted", "blocked", "logged", "alerted"]
  alertSent: boolean,               // Admin alert sent | required | default: false

  detectedAt: Date,                 // Detection timestamp | required | indexed
  owner: { orgId, userId }
}
```

#### 12. `guardrails` - Content Safety Rules (Post-MVP)
```typescript
{
  _id: ObjectId,
  guardrailId: string,              // Unique identifier | required | indexed
  name: string,                     // Guardrail name | required | max 255 chars
  description: string,              // Description | required | max 1000 chars
  type: string,                     // Guardrail type | required | enum: ["content-filter", "topic-restriction", "sentiment", "toxicity"]

  // Configuration
  config: {
    blockedKeywords?: string[],     // Blocked keywords | optional
    allowedTopics?: string[],       // Allowed topics | optional
    minSentiment?: number,          // Min sentiment score | optional | -1.0 to 1.0
    maxSentiment?: number,          // Max sentiment score | optional | -1.0 to 1.0
    maxToxicity?: number,           // Max toxicity score | optional | 0.0 to 1.0
    validationPrompt?: string,      // LLM validation prompt | optional
    validationModel?: string        // Model for validation | optional
  },

  // Action configuration
  action: string,                   // Action to take | required | enum: ["block", "warn", "rephrase", "escalate"]
  blockMessage?: string,            // Message when blocked | optional | max 500 chars

  // Scope
  appliesTo: string[],              // Application scope | required | enum: ["user-input", "agent-output", "both"]
  agentIds?: ObjectId[],            // Specific agents | optional | null = all agents

  isActive: boolean,                // Guardrail active | required | default: true
  severity: string,                 // Severity level | required | enum: ["low", "medium", "high"]

  owner: { orgId, userId },
  createdAt, changedAt, deletedAt, isDeleted
}
```

#### 13. `guardrailViolations` - Guardrail Violation Logs (Post-MVP)
```typescript
{
  _id: ObjectId,
  violationId: string,              // Unique identifier | required | indexed

  // References
  guardrailId: ObjectId,            // Guardrail reference | required | reference to guardrails
  conversationId: ObjectId,         // Conversation reference | required
  messageId: ObjectId,              // Message reference | required

  // Violation details
  violationType: string,            // Violation type | required | same as guardrail.type
  originalText: string,             // Original text | required
  detectedIssue: string,            // Issue detected | required | max 500 chars
  confidence: number,               // Detection confidence | required | 0.0-1.0

  // Action taken
  actionTaken: string,              // Action executed | required | enum: ["blocked", "warned", "rephrased", "escalated"]
  modifiedText?: string,            // Modified text | optional | if rephrased

  // User response
  userOverride: boolean,            // User bypassed warning | required | default: false

  detectedAt: Date,                 // Detection timestamp | required | indexed
  owner: { orgId, userId }
}
```

---

## WebSocket Message Patterns

### Base Message Schema

```typescript
interface BaseMessage {
  type: string // "user.message", "agent.toolCall.start", etc.
  timestamp: number

  // Correlation IDs
  messageId?: string // unique ID for this message
  requestId?: string // for request/response pairs (node commands)
  conversationId?: string // chat context

  // Source tracking
  userId?: string
  agentId?: string
  nodeId?: string

  // Optional metadata
  metadata?: Record<string, any>
}
```

---

### USER Events (from Web SDK)

**Connection:**
```typescript
{
  type: "user.connect",
  userId: string,
  metadata: {
    client: "web" | "mobile",
    version: string
  }
}

{
  type: "user.disconnect",
  userId: string,
  reason?: string
}

{
  type: "user.joinConversation",
  userId: string,
  conversationId: string,
  agentId: string,
  timestamp: number
}

{
  type: "user.leaveConversation",
  userId: string,
  conversationId: string,
  timestamp: number
}
```

**Messaging:**
```typescript
{
  type: "user.message",
  messageId: string,
  conversationId: string,
  userId: string,
  content: string,
  files?: [{
    url: string,
    filename: string,
    mimetype: string
  }],
  timestamp: number
}

{
  type: "user.typing",
  conversationId: string,
  userId: string,
  isTyping: boolean,
  timestamp: number
}
```

---

### AGENT Events (from Agent Containers)

**Lifecycle:**
```typescript
{
  type: "agent.register",
  agentId: string,
  status: "ready",
  capabilities: string[],
  toolsConnected: string[],
  timestamp: number
}

{
  type: "agent.statusChange",
  agentId: string,
  status: "ready" | "busy" | "error" | "offline",
  reason?: string,
  timestamp: number
}

{
  type: "agent.heartbeat",
  agentId: string,
  timestamp: number,
  stats?: {
    activeConversations: number,
    uptimeSeconds: number
  }
}
```

**Messaging:**
```typescript
{
  type: "agent.message",
  messageId: string,
  conversationId: string,
  agentId: string,
  content: string,
  thinking?: string, // internal reasoning (optional)
  timestamp: number
}

{
  type: "agent.typing",
  conversationId: string,
  agentId: string,
  isTyping: boolean,
  timestamp: number
}
```

**Tool Execution:**
```typescript
{
  type: "agent.toolCall.start",
  messageId: string,
  conversationId: string,
  agentId: string,
  toolName: string,
  toolInput: object,
  timestamp: number
}

{
  type: "agent.toolCall.end",
  messageId: string,
  conversationId: string,
  agentId: string,
  toolName: string,
  toolOutput?: object,
  status: "success" | "error",
  error?: string,
  durationMs: number,
  timestamp: number
}
```

---

### SYSTEM Events (from Backend/Infrastructure)

**Notifications:**
```typescript
{
  type: "system.notification",
  level: "info" | "warning" | "error" | "success",
  title: string,
  message: string,
  action?: string, // "deploymentStarted", "modelReady", etc.
  metadata?: object,
  timestamp: number
}

{
  type: "system.broadcast",
  message: string,
  severity: "low" | "medium" | "high",
  timestamp: number
}
```

**Resource Events:**
```typescript
{
  type: "system.deploymentCreated",
  deploymentId: string,
  modelId: string,
  nodeId: string,
  createdBy: string,
  timestamp: number
}

{
  type: "system.deploymentStatus",
  deploymentId: string,
  status: "deploying" | "running" | "stopped" | "failed",
  progress?: number,
  error?: string,
  timestamp: number
}

{
  type: "system.modelDownloaded",
  modelId: string,
  sizeMb: number,
  durationSeconds: number,
  timestamp: number
}
```

**Connection:**
```typescript
{
  type: "system.connectionEstablished",
  connectionId: string,
  userId: string,
  timestamp: number
}

{
  type: "system.connectionLost",
  connectionId: string,
  reason: "timeout" | "clientClose" | "serverError",
  timestamp: number
}

{
  type: "system.rateLimit",
  userId: string,
  limit: number,
  resetAt: number,
  timestamp: number
}
```

**Errors:**
```typescript
{
  type: "system.error",
  errorCode: string, // "TOOL_TIMEOUT", "MODEL_OOM", etc.
  message: string,
  context?: {
    conversationId?: string,
    deploymentId?: string,
    agentId?: string
  },
  retryAfter?: number,
  timestamp: number
}
```

---

### SYSTEM.NODE Events (GPU Node Daemon)

**Lifecycle:**
```typescript
{
  type: "system.node.register",
  nodeId: string,
  name: string,
  isLocal: boolean,
  gpuDevices: [{
    deviceId: string,
    model: string,
    memoryTotal: number
  }],
  config: object,
  timestamp: number
}

{
  type: "system.node.heartbeat",
  nodeId: string,
  timestamp: number,
  metrics: {
    gpuDevices: [{
      deviceId: string,
      memoryFree: number,
      utilization: number,
      temperature: number
    }],
    ramFree: number,
    diskFree: number
  }
}

{
  type: "system.node.disconnect",
  nodeId: string,
  reason?: string,
  timestamp: number
}

{
  type: "system.node.online",
  nodeId: string,
  nodeName: string,
  gpuCount: number,
  timestamp: number
}

{
  type: "system.node.offline",
  nodeId: string,
  reason?: string,
  lastSeen: number,
  timestamp: number
}
```

**Commands (Server → Node Daemon):**
```typescript
{
  type: "system.node.deployModel",
  requestId: string,
  nodeId: string,
  jobId: string,
  modelId: string,
  framework: "triton" | "vllm",
  containerConfig: {
    image: string,
    gpuDevice: string, // "0" or "0,1"
    memoryLimit: string, // "8g"
    ports: string, // "8001:8000"
    environment?: Record<string, string>
  },
  modelPath: string // MinIO S3 path
}

{
  type: "system.node.stopContainer",
  requestId: string,
  nodeId: string,
  containerId: string
}

{
  type: "system.node.getLogs",
  requestId: string,
  nodeId: string,
  containerId: string,
  lines?: number,
  since?: number
}
```

**Responses (Node Daemon → Server):**
```typescript
{
  type: "system.node.commandAck",
  requestId: string,
  nodeId: string,
  status: "accepted" | "rejected",
  reason?: string,
  timestamp: number
}

{
  type: "system.node.deploymentProgress",
  requestId: string,
  jobId: string,
  status: "downloading" | "extracting" | "starting" | "running" | "failed",
  progress?: number, // 0-100
  containerId?: string,
  error?: string,
  timestamp: number
}

{
  type: "system.node.logsResponse",
  requestId: string,
  containerId: string,
  logs: string,
  timestamp: number
}

{
  type: "system.node.containerEvent",
  nodeId: string,
  containerId: string,
  event: "started" | "stopped" | "died" | "oom",
  exitCode?: number,
  error?: string,
  timestamp: number
}
```

---

## Message Flow Examples

### Example 1: User Chat Flow
```
1. user.message → Backend
2. Backend → agent.message (forward to agent container)
3. agent.typing → Users (broadcast)
4. agent.toolCall.start → Users
5. agent.toolCall.end → Users
6. agent.message → Users (final response)
```

### Example 2: Model Deployment Flow
```
1. HTTP POST /api/deployments (not WebSocket)
2. system.deploymentCreated → User
3. system.node.deployModel → GPU Node Daemon
4. system.node.commandAck → Backend
5. system.node.deploymentProgress (downloading 45%) → Backend → User
6. system.node.deploymentProgress (running) → Backend → User
7. system.deploymentStatus (running) → User
8. system.notification (Model ready) → User
```

---

## API Endpoints

**Note:** All REST API endpoints are served on `api.<proxy domain>` without `/api` prefix.

### Authentication & Users
- `POST /auth/login` - Login (JWT)
- `POST /auth/refresh` - Refresh token
- `GET /users/me` - Current user info
- `PATCH /users/me` - Update profile

### GPU Nodes
- `GET /nodes` - List nodes (with metrics)
- `GET /nodes/:nodeId` - Node details
- `POST /nodes` - Register node
- `PATCH /nodes/:nodeId` - Update node config
- `DELETE /nodes/:nodeId` - Remove node
- `GET /nodes/:nodeId/metrics` - Real-time metrics
- `GET /nodes/:nodeId/containers` - List containers on node

### Models
- `GET /models` - List models with pagination
  - Query: `?page=1&limit=10`
  - Returns: List of both self-hosted and API-based models
- `GET /models/:id` - Get model details by MongoDB _id
- `POST /models` - Create new model (both self-hosted and API-based)
  - Body (self-hosted): `{name, type, description, version, deploymentType: "self-hosted", repository, framework, fileName, fileSize, downloadPath?, nodeId?, status?, scope?}`
  - Body (API-based): `{name, type, description, version, deploymentType: "api-based", provider, apiEndpoint, modelIdentifier, requiresApiKey?, status?, scope?}`
  - Status defaults to "queued" for both types
- `PUT /models/:id` - Update model (partial update allowed)
  - Body: Any updatable fields (name, description, version, status, etc.)
- `DELETE /models/:id` - Soft delete model
  - Sets deletedAt timestamp, excludes from queries

### Deployments
- `GET /deployments` - List deployments
- `GET /deployments/:deploymentId` - Deployment details
- `POST /deployments` - Deploy model
  - Body: `{modelId, nodeId?, gpuDevice?, port?}`
- `DELETE /deployments/:deploymentId` - Stop deployment
- `GET /deployments/:deploymentId/logs` - Container logs
- `GET /deployments/:deploymentId/metrics` - Performance metrics

### Agents
- `GET /agents` - List agents
- `GET /agents/:agentId` - Agent details
- `POST /agents` - Create agent
  - Body: `{name, llmModel, instructionId?, instructionOverride?, tools[], workingDir?}`
- `PATCH /agents/:agentId` - Update agent config
- `DELETE /agents/:agentId` - Delete agent
- `POST /agents/:agentId/start` - Start agent container
- `POST /agents/:agentId/stop` - Stop agent container

### Instructions
- `GET /instructions` - List instruction templates (filter by category, tags)
- `GET /instructions/:instructionId` - Template details
- `POST /instructions` - Create new template
  - Body: `{name, description, role, context, task, examples?, toolsGuidance?, outputFormat?, category?, tags?}`
- `PATCH /instructions/:instructionId` - Update template
- `DELETE /instructions/:instructionId` - Delete template
- `GET /instructions/:instructionId/agents` - List agents using this template

### Connections
- `GET /connections` - List all connections (filter by type, agentId)
- `GET /connections/:connectionId` - Connection details
- `POST /connections` - Create new connection
  - Body: `{name, type, agentId, config}`
- `PATCH /connections/:connectionId` - Update connection
- `DELETE /connections/:connectionId` - Delete connection
- `POST /connections/:connectionId/test` - Test connection configuration

### Tools (MCP & Built-in)
- `GET /tools` - List all tools (filter by type: mcp/builtin)
- `GET /tools/:toolId` - Tool details
- `POST /tools` - Register new MCP tool
  - Body: `{name, type: "mcp", transport, dockerImage, port, environment}`
  - Note: Built-in tools are pre-configured, cannot be created via API
- `PATCH /tools/:toolId` - Update tool (MCP only)
- `DELETE /tools/:toolId` - Remove tool (MCP only)
- `POST /tools/:toolId/restart` - Restart tool container (MCP only)
- `GET /tools/:toolId/health` - Health check (MCP only)

### Conversations
- `GET /conversations` - List user's conversations
- `GET /conversations/:conversationId` - Conversation history
- `DELETE /conversations/:conversationId` - Delete conversation

### Files
- `POST /files/upload` - Upload file to MinIO
  - Returns: `{url, filename, size}`
- `GET /files/:fileId` - Download file

### System
- `GET /system/health` - System health
- `GET /system/stats` - Platform statistics
  - Returns: node count, deployment count, active agents, etc.

### PII Protection (Post-MVP)
- `POST /pii/detect` - Detect PII in text
  - Body: `{text, returnRedacted?}`
- `POST /pii/redact` - Redact PII from text
  - Body: `{text, patterns?}`
- `GET /pii/patterns` - List PII detection patterns
  - Query: `?category=financial&isActive=true`
- `POST /pii/patterns` - Create custom PII pattern
  - Body: `{name, regex, category, redactionMethod}`
- `GET /pii/detections` - List PII detections (audit log)
  - Query: `?conversationId=xxx&severity=high`

### Guardrails (Post-MVP)
- `POST /guardrails/validate` - Validate text against guardrails
  - Body: `{text, context?, agentId?}`
- `GET /guardrails` - List guardrails
  - Query: `?agentId=xxx&type=content-filter`
- `POST /guardrails` - Create new guardrail
  - Body: `{name, type, config, action, appliesTo}`
- `PATCH /guardrails/:id` - Update guardrail
- `GET /guardrails/violations` - List violations (audit log)
  - Query: `?conversationId=xxx&severity=high`

### WebSocket Gateway
- `WS ws.<proxy domain>/agent` - Agent ↔ Backend communication
- `WS ws.<proxy domain>/system` - System notifications to users/agents

---

## Security

### Authentication
- JWT tokens (access + refresh)
- Token expiry: 15 minutes (access), 7 days (refresh)
- Stored in httpOnly cookies (web) or localStorage (SDK)

### Authorization
- Role-based middleware on all protected routes
- Check JWT claims: `roles: ["organization.editor", ...]`
- Deployment actions require owner/editor roles

### Network Security

**Multi-Node Communication:**
- WireGuard VPN (self-hosted on controller node)
- Controller: VPN server on port 51820/UDP
- GPU nodes: VPN clients (outbound connection only)

**Firewall Policies (Customer DC Deployment):**

*Inbound to Controller:*
```
Port 51820/UDP: WireGuard VPN (worker nodes + ops team access)
Port 443/TCP: HTTPS (Web Portal + Inference APIs from users)
```

*Outbound from DC Nodes:*
```
Port 443/TCP: HTTPS to specific CIDRs
  - npm registry (registry.npmjs.org)
  - Docker Hub (registry-1.docker.io)
  - GitHub (github.com, api.github.com)
  - AI API providers (api.openai.com, api.anthropic.com)
  - Package managers (pypi.org, packages.ubuntu.com)
Port 53/UDP: DNS resolution (to public DNS servers)
Port 123/UDP: NTP time sync (to pool.ntp.org)
```

*Internal DC Traffic (between nodes):*
```
All traffic allowed between nodes in same subnet
```

**GPU Nodes Security:**
- No inbound ports from Internet required
- All connections outbound: VPN + WebSocket to controller
- Access via VPN tunnel only

**Controller Node Security:**
- Nginx reverse proxy with SSL/TLS (Let's Encrypt or custom cert)
- Internal Docker network for backend services
- WireGuard server for secure remote access
- SSH access restricted to VPN clients only

### Container Isolation
- Non-root users in containers
- Resource limits (CPU, memory, GPU)
- Read-only root filesystem (where possible)
- Seccomp profiles

### Secrets Management
- Environment variables for sensitive configs
- MinIO credentials in `.env` files (not in code)
- Docker secrets for production

---

## Deployment & Scaling

### MVP Deployment

**Single-Node Setup:**
1. Install Docker + NVIDIA Container Toolkit
2. Deploy MongoDB + MinIO (docker-compose)
3. Deploy NestJS backend
4. Deploy Node Daemon (localhost mode)
5. Configure Nginx
6. Start first agent + MCP tools

**Multi-Node Setup:**
1. Setup Controller node (as above)
2. Setup WireGuard VPN server on controller:
   - Install: `apt install wireguard`
   - Generate keys: `wg genkey | tee privatekey | wg pubkey > publickey`
   - Configure `/etc/wireguard/wg0.conf` with server settings
   - Start: `wg-quick up wg0` and enable: `systemctl enable wg-quick@wg0`
3. On each GPU node:
   - Install Docker + NVIDIA Toolkit
   - Install WireGuard client: `apt install wireguard`
   - Generate client keys and add to controller's allowed peers
   - Configure `/etc/wireguard/wg0.conf` with client settings
   - Start VPN: `wg-quick up wg0`
   - Deploy Node Daemon (remote mode)
   - Configure connection to controller via VPN IP (e.g., 10.8.0.1)

### Scaling Strategies

**Horizontal Scaling (Post-MVP):**
- Add more GPU nodes → register in platform
- Backend auto-detects new nodes
- Load balancer for inference requests

**Vertical Scaling:**
- Upgrade GPU cards (A100, H100) → enable MIG
- Increase node RAM/CPU

**Service Scaling:**
- Backend: multiple NestJS instances (PM2/K8s)
- MongoDB: replica sets
- MinIO: distributed mode

### Monitoring (Future)
- Prometheus metrics from nodes
- Grafana dashboards
- Alert rules: GPU temp, OOM, container crashes

---

## PII Protection & Guardrails (Post-MVP)

### Overview

**PII Protection** ensures sensitive data is automatically detected and redacted before storage or processing, preventing data leaks and ensuring compliance with privacy regulations.

**Guardrails** enforce content safety and behavioral boundaries for AI agents, preventing harmful outputs and ensuring agents stay within defined operational scopes.

### Message Processing Flow

**PII Detection Pipeline:**
```
User Input → PII Detection → Redaction → Save to DB → Forward to Agent
                 ↓
          Log Detection (if found)
                 ↓
          Alert Admin (if severity=critical)
```

**Guardrail Validation Pipeline:**
```
User Input → Guardrail Check → (Pass) → Agent Processing
                 ↓ (Fail)
            Block/Warn/Rephrase → Return to User
                 ↓
            Log Violation
```

**Combined Flow (Messages):**
```
1. User sends message
   ↓
2. PII Middleware: Detect & redact sensitive data
   ↓
3. Guardrail Middleware (User Input): Validate against rules
   ↓
4. Save redacted message to database
   ↓
5. Forward to Agent
   ↓
6. Agent generates response
   ↓
7. Guardrail Middleware (Agent Output): Validate response
   ↓
8. Send to user (if passed) or block/rephrase (if failed)
```

### PII Detection Mechanisms

**Regex-based Patterns (MVP):**
- Email addresses: `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b`
- Phone numbers (US): `\b\d{3}[-.]?\d{3}[-.]?\d{4}\b`
- Credit cards: `\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b`
- SSN (US): `\b\d{3}-\d{2}-\d{4}\b`
- API keys/tokens: `\b[A-Za-z0-9_-]{32,}\b`

**Redaction Methods:**
- **Mask:** Replace with `***` (preserve length optional)
- **Hash:** One-way hash (SHA-256)
- **Remove:** Delete entirely
- **Token:** Replace with reversible token (for authorized access)

### Guardrail Types

**1. Content Filter (Keyword-based):**
- Block messages containing blacklisted keywords
- Case-insensitive matching
- Use cases: Profanity filter, sensitive topics

**2. Topic Restriction:**
- Enforce allowed topics only
- Block off-topic requests
- Use cases: Customer support agents, domain-specific bots

**3. Medical/Legal Advice Prevention:**
- Detect medical or legal advice patterns
- Block or rephrase dangerous content
- Use cases: General purpose chatbots

**4. Toxicity Detection:**
- Measure toxicity score (0.0-1.0)
- Block if exceeds threshold
- Use cases: Public-facing agents

### Actions on Violation

**PII Detection Actions:**
- **Redact:** Replace PII with masked text (default)
- **Block:** Reject message entirely
- **Log:** Record detection without modification
- **Alert:** Notify admin immediately

**Guardrail Actions:**
- **Block:** Reject message with error message
- **Warn:** Allow but display warning to user
- **Rephrase:** Automatically modify to safe version
- **Escalate:** Flag for human review

### Performance Considerations

**Target Latency:**
- PII detection (regex): < 50ms per message
- Guardrail validation (keyword): < 100ms per message
- Combined overhead: < 150ms total

**Optimization:**
- Cache active patterns/guardrails per agent (Redis, 5 min TTL)
- Batch validation for multi-turn conversations
- Async logging (non-blocking)

### Audit & Compliance

**Logging Requirements:**
- All PII detections logged with timestamp, pattern, severity
- All guardrail violations logged with context
- Encrypted storage for detected PII (original text)
- Retention policy: 90 days default (configurable)

**Admin Monitoring:**
- Real-time alerts for critical PII exposure
- Dashboard showing detection trends
- Violation reports by agent/user/time period

---

## Fine-Tuning Feature (Post-MVP)

### Overview

Model fine-tuning capability allows users to customize pre-trained models with their own datasets. This feature enables domain-specific model adaptation using LoRA (Low-Rank Adaptation) for efficient training on limited GPU resources.

**Use Cases:**
- Customize LLMs for company-specific terminology
- Adapt models to specialized domains (legal, medical, technical)
- Improve model performance on specific tasks
- Create proprietary models from open-source base models

---

### Additional Data Models

#### 9. `datasets` - Training Dataset Management
```typescript
{
  _id: ObjectId,                    // MongoDB primary key
  datasetId: string,                // Unique identifier | required | indexed
  name: string,                     // Dataset name | required | max 255 chars
  description: string,              // Dataset description | required | max 1000 chars

  // Storage
  minioPath: string,                // S3 path to dataset files | required | format: "s3://bucket/datasets/{id}"
  format: string,                   // File format | required | enum: ["jsonl", "csv", "parquet"]
  sizeMb: number,                   // Dataset size in MB | required | positive integer
  recordCount: number,              // Number of training examples | required | positive integer

  // Validation
  taskType: string,                 // Training task type | required | enum: ["text-generation", "classification", "chat", "instruction-following"]
  validationSplit: number,          // Validation split ratio | required | 0.0-1.0 | default: 0.2
  schemaValidated: boolean,         // Schema validation passed | required | default: false

  // Sample data
  sampleRecords: object[],          // First 5 records for preview | optional | max 5 items

  status: string,                   // Dataset status | required | enum: ["uploading", "validating", "ready", "error"]
  errorMessage?: string,            // Validation error details | optional | set if status="error"

  // Ownership & Audit
  owner: {
    orgId: ObjectId,                // Organization ID | required | reference to organizations
    userId: ObjectId                // Owner user ID | required | reference to users
  },
  createdAt: Date,                  // Record creation timestamp | auto-generated
  changedAt: Date,                  // Last modification timestamp | auto-updated
  deletedAt?: Date,                 // Soft delete timestamp | optional | set when isDeleted=true
  isDeleted: boolean                // Soft delete flag | required | default: false
}
```

#### 10. `finetuneJobs` - Fine-tuning Job Tracking
```typescript
{
  _id: ObjectId,                    // MongoDB primary key
  jobId: string,                    // Unique job identifier | required | indexed
  name: string,                     // Job name | required | max 255 chars
  description?: string,             // Job description | optional | max 500 chars

  // Source
  baseModelId: ObjectId,            // Base model reference | required | reference to models collection
  datasetId: ObjectId,              // Training dataset reference | required | reference to datasets collection

  // Training configuration
  hyperparameters: {
    epochs: number,                 // Training epochs | required | default: 3 | range: 1-10
    learningRate: number,           // Learning rate | required | default: 2e-5 | range: 1e-6 to 1e-3
    batchSize: number,              // Batch size per GPU | required | default: 4 | range: 1-32
    maxLength: number,              // Max token length | required | default: 512 | range: 128-4096
    warmupSteps?: number,           // Warmup steps | optional | default: 0
    loraR?: number,                 // LoRA rank | optional | default: 8 | range: 4-64
    loraAlpha?: number,             // LoRA alpha | optional | default: 16
    loraDropout?: number            // LoRA dropout | optional | default: 0.05 | range: 0-0.5
  },

  // Resources
  nodeId: ObjectId,                 // GPU node running training | required | reference to nodes collection
  gpuDevice: string,                // GPU device IDs | required | format: "0" or "0,1"
  containerId?: string,             // Training container ID | optional | set when job starts

  // Progress tracking
  status: string,                   // Job status | required | enum: ["pending", "initializing", "training", "completed", "failed", "cancelled"]
  progress: {
    currentEpoch: number,           // Current training epoch | required | 0-based
    totalEpochs: number,            // Total epochs | required
    currentStep: number,            // Current training step | required
    totalSteps: number,             // Total training steps | required
    loss?: number,                  // Current training loss | optional
    validationLoss?: number,        // Current validation loss | optional
    learningRate?: number,          // Current learning rate | optional
    tokensPerSecond?: number,       // Training speed | optional
    estimatedTimeRemaining?: number // Seconds remaining | optional
  },

  // Results
  outputModelId?: ObjectId,         // Fine-tuned model reference | optional | reference to models collection
  metrics: {
    finalLoss?: number,             // Final training loss | optional
    finalValidationLoss?: number,   // Final validation loss | optional
    bestValidationLoss?: number,    // Best validation loss | optional
    trainingTime?: number,          // Total training time in seconds | optional
    gpuMemoryUsed?: number          // Peak GPU memory in MB | optional
  },

  // Error handling
  errorMessage?: string,            // Error details | optional | set if status="failed"
  retriedCount: number,             // Retry attempts | required | default: 0

  // Timestamps
  startedAt?: Date,                 // Training start time | optional | set when status="training"
  completedAt?: Date,               // Training completion time | optional | set when status="completed"
  cancelledAt?: Date,               // Cancellation time | optional | set when status="cancelled"

  // Ownership & Audit
  owner: {
    orgId: ObjectId,                // Organization ID | required | reference to organizations
    userId: ObjectId                // Owner user ID | required | reference to users
  },
  createdAt: Date,                  // Record creation timestamp | auto-generated
  changedAt: Date,                  // Last modification timestamp | auto-updated
  deletedAt?: Date,                 // Soft delete timestamp | optional | set when isDeleted=true
  isDeleted: boolean                // Soft delete flag | required | default: false
}
```

#### 11. `checkpoints` - Training Checkpoints (Optional)
```typescript
{
  _id: ObjectId,                    // MongoDB primary key
  checkpointId: string,             // Unique checkpoint identifier | required | indexed
  jobId: ObjectId,                  // Fine-tune job reference | required | reference to finetuneJobs collection

  // Training state
  epoch: number,                    // Epoch number | required
  step: number,                     // Training step | required
  loss: number,                     // Training loss at checkpoint | required
  validationLoss?: number,          // Validation loss at checkpoint | optional

  // Storage
  minioPath: string,                // Checkpoint weights path | required | format: "s3://bucket/checkpoints/{jobId}/epoch-{N}"
  sizeMb: number,                   // Checkpoint size in MB | required | positive integer

  // Metadata
  isBest: boolean,                  // Best checkpoint (lowest validation loss) | required | default: false

  createdAt: Date                   // Checkpoint creation time | auto-generated
}
```

---

### API Endpoints

#### Datasets
```
POST   /datasets/upload
  - Upload training dataset
  - Multipart form data with file
  - Body: { name, description, taskType, validationSplit }
  - Returns: { datasetId, uploadUrl }

GET    /datasets
  - List all datasets
  - Query params: ?status=ready&taskType=text-generation

GET    /datasets/:datasetId
  - Get dataset details
  - Returns: metadata + sample records

DELETE /datasets/:datasetId
  - Delete dataset
  - Requires: owner/editor role

POST   /datasets/:datasetId/validate
  - Manually trigger validation
  - Checks JSONL format, required fields
```

#### Fine-tuning Jobs
```
POST   /finetune
  - Start fine-tuning job
  - Body: {
      name: string,
      baseModelId: string,
      datasetId: string,
      hyperparameters?: {
        epochs?: number,
        learningRate?: number,
        batchSize?: number,
        maxLength?: number
      },
      nodeId?: string  // Auto-select if not provided
    }
  - Returns: { jobId, status }

GET    /finetune
  - List fine-tuning jobs
  - Query params: ?status=training&userId=xxx

GET    /finetune/:jobId
  - Get job details and progress
  - Returns: full job object with real-time progress

DELETE /finetune/:jobId
  - Cancel running job
  - Stops training container gracefully
  - Requires: owner/editor role

GET    /finetune/:jobId/logs
  - Get training logs
  - Query params: ?lines=100&since=timestamp
  - Returns: container logs stream

GET    /finetune/:jobId/metrics
  - Get training metrics time series
  - Returns: { loss: [], validationLoss: [], learningRate: [] }

POST   /finetune/:jobId/retry
  - Retry failed job
  - Reuses same configuration
```

#### Checkpoints
```
GET    /finetune/:jobId/checkpoints
  - List checkpoints for a job

GET    /checkpoints/:checkpointId/download
  - Download checkpoint weights
```

---

### WebSocket Events

#### Fine-tuning Progress
```typescript
{
  type: "system.finetune.started",
  jobId: string,
  containerId: string,
  timestamp: number
}

{
  type: "system.finetune.progress",
  jobId: string,
  status: "training",
  progress: {
    currentEpoch: 2,
    totalEpochs: 3,
    currentStep: 450,
    totalSteps: 1500,
    loss: 0.234,
    validationLoss: 0.189,
    tokensPerSecond: 1200,
    estimatedTimeRemaining: 3600
  },
  timestamp: number
}

{
  type: "system.finetune.checkpointSaved",
  jobId: string,
  checkpointId: string,
  epoch: number,
  validationLoss: number,
  isBest: boolean,
  timestamp: number
}

{
  type: "system.finetune.completed",
  jobId: string,
  outputModelId: string,
  metrics: {
    finalLoss: 0.123,
    finalValidationLoss: 0.145,
    trainingTime: 3600
  },
  timestamp: number
}

{
  type: "system.finetune.failed",
  jobId: string,
  errorMessage: string,
  errorCode: string,  // "OOM", "DATA_ERROR", "CONTAINER_CRASH"
  timestamp: number
}

{
  type: "system.finetune.cancelled",
  jobId: string,
  cancelledBy: string,
  timestamp: number
}
```

---

### Backend Services

#### New NestJS Modules

**1. DatasetModule**
- `DatasetService`
  - Upload dataset to MinIO
  - Validate JSONL format:
    ```json
    {"prompt": "...", "completion": "..."}
    {"instruction": "...", "input": "...", "output": "..."}
    {"messages": [{"role": "user", "content": "..."}, ...]}
    ```
  - Calculate statistics (record count, token distribution)
  - Extract sample records for preview
  - Split into train/validation files

**2. FineTuneModule**
- `FineTuneService`
  - Create fine-tuning job
  - Auto-select GPU node (based on availability + model size)
  - Generate training command
  - Monitor job progress via WebSocket
  - Handle job cancellation
  - Create new model entry after completion

- `FineTuneOrchestrator` (BullMQ Worker)
  - Job queue: `finetune-queue`
  - Job types: `start-training`, `save-checkpoint`, `cleanup`
  - Retry logic: 3 attempts with exponential backoff
  - Send commands to Node Daemon
  - Track long-running jobs

**3. CheckpointModule**
- `CheckpointService`
  - Save periodic checkpoints
  - Mark best checkpoint (lowest validation loss)
  - Cleanup old checkpoints (keep best + last 3)

---

### Node Daemon Updates

#### New API Endpoints
```typescript
POST /finetune/start
  Body: {
    jobId: string,
    baseModelPath: string,      // MinIO S3 path
    datasetPath: string,         // MinIO S3 path
    outputPath: string,          // MinIO S3 path
    hyperparameters: {...},
    gpuDevice: string
  }
  - Downloads base model + dataset from MinIO
  - Starts training container with NVIDIA runtime
  - Returns: { containerId, status }

GET /finetune/:jobId/status
  - Returns current training progress
  - Reads metrics from container logs

POST /finetune/:jobId/cancel
  - Sends SIGTERM to training container
  - Waits for graceful shutdown (30s)
  - Uploads checkpoint before exit

GET /finetune/:jobId/logs
  - Streams container logs (stdout + stderr)
```

---

### Training Container

#### Dockerfile
```dockerfile
FROM pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime

# Install dependencies
RUN pip install transformers peft accelerate datasets

# Training script
COPY train.py /app/
WORKDIR /app

ENTRYPOINT ["python", "train.py"]
```

#### Training Script (train.py)
```python
import os
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer
from peft import LoraConfig, get_peft_model, TaskType
from datasets import load_dataset

# Load config from environment
base_model = os.getenv("BASE_MODEL")
dataset_path = os.getenv("DATASET_PATH")
output_path = os.getenv("OUTPUT_PATH")

# Hyperparameters
epochs = int(os.getenv("EPOCHS", "3"))
learning_rate = float(os.getenv("LEARNING_RATE", "2e-5"))
batch_size = int(os.getenv("BATCH_SIZE", "4"))

# Load model with LoRA
model = AutoModelForCausalLM.from_pretrained(base_model, torch_dtype=torch.float16)
lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=8,
    lora_alpha=16,
    lora_dropout=0.05
)
model = get_peft_model(model, lora_config)

# Load dataset
dataset = load_dataset("json", data_files=dataset_path)

# Training
training_args = TrainingArguments(
    output_dir=output_path,
    num_train_epochs=epochs,
    learning_rate=learning_rate,
    per_device_train_batch_size=batch_size,
    logging_steps=10,
    save_steps=100,
    evaluation_strategy="steps",
    eval_steps=100
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=dataset["train"],
    eval_dataset=dataset["validation"]
)

# Start training
trainer.train()

# Save adapter
model.save_pretrained(output_path)
```

---

### Storage Structure (MinIO)

```
/datasets/
  ├── {datasetId}/
  │   ├── original.jsonl           # User uploaded file
  │   ├── train.jsonl              # Training split
  │   ├── validation.jsonl         # Validation split
  │   └── metadata.json            # Statistics, schema

/models/
  ├── {baseModelId}/               # Base models (existing)
  └── {outputModelId}/             # Fine-tuned models
      ├── adapter_model.bin        # LoRA adapter weights
      ├── adapter_config.json      # LoRA config
      └── tokenizer/               # Tokenizer files

/checkpoints/
  └── {jobId}/
      ├── epoch-1/
      │   ├── adapter_model.bin
      │   └── training_state.json
      ├── epoch-2/
      └── epoch-3/
```

---

### Fine-tuning Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. DATASET PREPARATION                                       │
└─────────────────────────────────────────────────────────────┘
User uploads JSONL file
  ↓
Backend validates format
  ↓
Split into train/validation (80/20)
  ↓
Upload to MinIO
  ↓
Create dataset record (status: "ready")

┌─────────────────────────────────────────────────────────────┐
│ 2. JOB CREATION                                              │
└─────────────────────────────────────────────────────────────┘
User creates fine-tune job
  - Selects base model (e.g., Llama-2-7b)
  - Selects dataset
  - Sets hyperparameters (or use defaults)
  ↓
Backend validates resources
  ↓
Auto-select GPU node (criteria: GPU memory >= model size + 2GB)
  ↓
Create job record (status: "pending")
  ↓
Add to BullMQ queue

┌─────────────────────────────────────────────────────────────┐
│ 3. TRAINING EXECUTION                                        │
└─────────────────────────────────────────────────────────────┘
BullMQ worker picks job
  ↓
Send WebSocket command to Node Daemon:
  {
    type: "system.node.startFineTune",
    jobId: "job-123",
    baseModelPath: "s3://models/llama-2-7b",
    datasetPath: "s3://datasets/ds-456/train.jsonl",
    outputPath: "s3://models/ft-789",
    hyperparameters: {...}
  }
  ↓
Node Daemon:
  - Downloads base model (if not cached)
  - Downloads dataset
  - Starts training container with GPU
  - Monitors progress
  ↓
Training container:
  - Loads model + LoRA adapter
  - Loads dataset
  - Trains for N epochs
  - Logs progress every 10 steps
  - Saves checkpoint every 100 steps
  - Streams logs to Node Daemon
  ↓
Node Daemon forwards progress to Backend:
  WS event: "system.finetune.progress"
  ↓
Backend updates job record + broadcasts to user

┌─────────────────────────────────────────────────────────────┐
│ 4. COMPLETION                                                │
└─────────────────────────────────────────────────────────────┘
Training finishes
  ↓
Container uploads adapter weights to MinIO
  ↓
Node Daemon reports completion to Backend
  ↓
Backend:
  - Updates job status: "completed"
  - Creates new model entry:
    {
      modelId: "ft-model-789",
      name: "Llama-2-7b-CustomDomain",
      source: "finetuned",
      baseModelId: "llama-2-7b",
      finetuneJobId: "job-123",
      framework: "vllm",
      minioPath: "s3://models/ft-789"
    }
  - Broadcasts: "system.finetune.completed"
  ↓
User can now deploy fine-tuned model
```

---

### Tech Stack Additions

#### Training Frameworks

**Option A: vLLM (Recommended for MVP)**
- Pros: Same as inference stack, LoRA support built-in
- Cons: Less flexible than pure Transformers
- Usage:
  ```bash
  vllm fine-tune \
    --model meta-llama/Llama-2-7b \
    --dataset train.jsonl \
    --lora-r 8
  ```

**Option B: HuggingFace Transformers + PEFT**
- Pros: Most flexible, extensive documentation
- Cons: More complex setup
- Usage: Custom Python training script (see above)

**Option C: Axolotl (Production-grade)**
- Pros: Config-based, battle-tested, supports many techniques
- Cons: Heavier dependencies, steeper learning curve
- Usage:
  ```yaml
  base_model: meta-llama/Llama-2-7b
  dataset: train.jsonl
  adapter: lora
  lora_r: 8
  ```

**MVP Recommendation:** Option B (Transformers + PEFT) for flexibility and community support.

---

### UI Updates

#### New Pages

**1. Datasets Page** (`/datasets`)
- Dataset list table (name, size, records, status)
- Upload button → Upload modal
  - Drag-drop JSONL file
  - Name, description inputs
  - Task type selector
  - Validation split slider
- Dataset detail view
  - Metadata (size, records, task type)
  - Sample records preview (first 5)
  - Validation status
  - Actions: Delete, Use for Fine-tuning

**2. Fine-tuning Jobs Page** (`/finetune`)
- Job list table (name, base model, dataset, status, progress)
- Create job button → Wizard modal
  - Step 1: Select base model
  - Step 2: Select dataset
  - Step 3: Configure hyperparameters (with tooltips)
  - Step 4: Review & start
- Job detail view
  - Progress bar (% complete)
  - Real-time metrics chart (loss over time)
  - Current stats (epoch, step, tokens/sec)
  - Training logs (scrollable, auto-refresh)
  - Actions: Cancel, Retry (if failed)

**3. Model Registry Updates** (`/models`)
- Add "Fine-tuned" badge to models
- Filter: Base models vs Fine-tuned models
- Fine-tuned model detail shows:
  - Base model used
  - Dataset used
  - Training metrics
  - Link to fine-tune job

---

### Minimum Viable Fine-tuning (MVP-FT)

#### In-Scope

✅ **Dataset Management**
- Upload JSONL format only
- Auto-validation of schema
- Train/validation split (fixed 80/20)

✅ **Fine-tuning**
- LoRA adapter training only (not full fine-tune)
- Single hyperparameter preset ("recommended")
- Auto GPU node selection
- Real-time progress monitoring (loss, epoch, step)

✅ **Model Output**
- Auto-create model entry after training
- Deploy same as base models (vLLM with adapter)

✅ **UI**
- Basic upload, job creation, progress monitoring
- No advanced charting (simple progress bar + loss number)

#### Out-of-Scope (Post-MVP)

❌ **Advanced Features**
- Multiple dataset formats (CSV, Parquet, HuggingFace Hub)
- Custom hyperparameter tuning UI
- Checkpoint management (resume from checkpoint)
- Distributed training (multi-GPU across nodes)
- Full model fine-tuning (without LoRA)
- Quantization options (4-bit, 8-bit)

❌ **Advanced UI**
- Interactive loss curves (line charts)
- A/B testing fine-tuned models
- Dataset versioning
- Automated hyperparameter search

❌ **Enterprise Features**
- Training cost tracking
- Model evaluation benchmarks
- Model merging (combine multiple adapters)

---

### Effort Estimation

| Component | Tasks | Effort | Priority |
|-----------|-------|--------|----------|
| **Data Models** | 3 collections + indexes | 2 days | P0 |
| **Backend API** | 8 endpoints (datasets + finetune) | 3 days | P0 |
| **Backend Services** | DatasetService, FineTuneService, Orchestrator | 4 days | P0 |
| **Node Daemon** | 4 new endpoints + container management | 3 days | P0 |
| **Training Setup** | Dockerfile + training script + testing | 2 days | P0 |
| **WebSocket Events** | 6 new event types + handlers | 1 day | P0 |
| **Storage** | MinIO bucket structure + upload/download logic | 1 day | P0 |
| **UI - Datasets** | List, upload, detail pages | 2 days | P1 |
| **UI - Fine-tuning** | Job creation wizard, progress page | 3 days | P1 |
| **UI - Model Updates** | Fine-tuned model badges, filters | 1 day | P1 |
| **Testing** | Unit + integration tests | 2 days | P1 |
| **Documentation** | API docs, user guide | 1 day | P1 |
| **Total** | | **25 days** | |

**Estimated Timeline:** 5 weeks (1 month) for 1 full-time developer.

**Team Split Option:**
- Backend developer: 16 days (Data models, API, Services, Node Daemon, Training)
- Frontend developer: 6 days (UI pages)
- QA/DevOps: 3 days (Testing, deployment)
- **Total: 3 weeks** with 3-person team

---

### Success Criteria (Fine-tuning MVP)

Fine-tuning feature is successful when:
- ✅ User can upload JSONL dataset (min 100 records)
- ✅ Dataset validation catches malformed data
- ✅ User can create fine-tune job with default hyperparameters
- ✅ Training runs on GPU node without OOM
- ✅ Real-time progress updates visible in UI
- ✅ Training completes in reasonable time (< 2 hours for 7B model, 1k samples)
- ✅ Fine-tuned model automatically added to registry
- ✅ Fine-tuned model can be deployed as inference service
- ✅ Fine-tuned model shows improved performance on test prompts

---

## Out of Scope (Post-MVP)

- Multi-organization support
- Advanced routing (A/B testing, canary)
- Auto-scaling based on load
- Distributed training (Ray Train)
- Cost tracking per deployment
- MCP stdio transport
- Mobile SDK
- Voice/video streaming (realtime)
- Agent approval workflows

**Note:** Model fine-tuning is now scoped as a post-MVP feature with detailed specifications above.

---

## Success Criteria

MVP is successful when:
- ✅ 2+ GPU nodes registered and monitored
- ✅ 3+ models deployed (1 Triton, 1 vLLM, 1 ASR/TTS)
- ✅ 2+ agents created and responding via Web SDK
- ✅ 3+ MCP tools deployed and usable
- ✅ File upload → agent processing works
- ✅ Chat sessions persisted in MongoDB
- ✅ System runs stable for 7 days continuous
- ✅ Single-node and multi-node deployment both validated

---

**Document Version:** 2.7
**Created:** 2025-01-28
**Updated:** 2025-04-11
**Type:** MVP Requirements
**Status:** Ready for Implementation

**Changelog v2.7:**
- Added **PII Protection & Guardrails** as post-MVP security features
  - 4 new collections: `piiPatterns`, `piiDetections`, `guardrails`, `guardrailViolations`
  - 10 new API endpoints for PII detection and guardrail management
  - Message processing pipeline with middleware integration
  - Regex-based PII detection (email, phone, SSN, credit cards, API keys)
  - Content filtering, topic restriction, toxicity detection, medical/legal advice prevention
  - Redaction methods: mask, hash, remove, token
  - Guardrail actions: block, warn, rephrase, escalate
  - Performance targets: < 150ms combined overhead
  - Audit logging and compliance features
  - Effort estimation: 19 days (1 developer) or 2.5 weeks (3-person team)
- Added core features #8 (PII Protection) and #9 (AI Guardrails)
- Updated collection overview with 17 total collections (9 MVP + 8 Post-MVP)

**Changelog v2.6:**
- Added **Fine-tuning Feature** as post-MVP capability
  - 3 new collections: `datasets`, `finetuneJobs`, `checkpoints`
  - 8 new API endpoints for dataset management and fine-tuning
  - 6 new WebSocket events for training progress
  - Complete workflow: dataset upload → validation → training → model deployment
  - LoRA-based fine-tuning for efficient GPU usage
  - Training container specification (PyTorch + Transformers + PEFT)
  - UI specifications for dataset management and job monitoring
  - Effort estimation: 25 days (1 developer) or 3 weeks (3-person team)
  - Success criteria for fine-tuning MVP

**Changelog v2.5:**
- Added `instructions` collection - Reusable instruction templates for agents
  - Structured format: role, context, task, examples, toolsGuidance, outputFormat
  - Templates can be shared and versioned across agents
  - Category tagging and usage tracking
- Added `connections` collection - Connection endpoints for agents
  - Support multiple connection types: web-sdk, discord, telegram, webhook
  - Type-specific configurations (bot tokens, allowed origins, webhook secrets)
  - Connection status tracking and statistics
- Updated `agents` schema:
  - Changed from inline `instruction` to `instructionId` (reference) + `instructionOverride` (optional)
  - Supports both template-based and custom instructions
- Updated `conversations` schema:
  - Added `connectionId` to track which connection endpoint initiated conversation
  - Changed `channel` enum to match connection types
  - Added `channelMetadata` for platform-specific data (Discord guild/channel, Telegram chat, etc.)

**Changelog v2.4:**
- Added universal fields to all entities:
  - `owner: { orgId, userId }` - Ownership tracking
  - `createdAt, changedAt, deletedAt, isDeleted` - Audit trail and soft delete support
- Split `conversations` collection into:
  - `conversations` - Conversation metadata (title, statistics, status)
  - `messages` - Individual messages (optimized for query performance)
- Removed `agentActions` collection (redundant - `messages` with type="tool" already contains tool execution data including durationMs)
- Updated message schema with `senderId`, `senderType`, `durationMs` for tool calls

**Changelog v2.3:**
- Added Domain & URL Structure planning
  - `api.<proxy domain>` → Backend API (no `/api` prefix)
  - `ws.<proxy domain>` → WebSocket with `/agent` and `/system` paths
  - `storage.<proxy domain>` → MinIO Object Storage (S3-compatible)
  - `<proxy domain>` → Web Application
- Updated all API endpoint URLs (removed `/api` prefix)
- Updated WebSocket URLs to use subdomain structure
- Added storage URL patterns for models and files

**Changelog v2.2:**
- Renamed `gpuNodes` → `nodes` (support multiple roles: controller/worker/proxy/storage)
- Renamed `mcpTools` → `tools` (support both MCP and built-in tool types)
- Added detailed entity schemas with field descriptions, types, and constraints
- Updated API endpoints `/api/mcp-tools` → `/api/tools`
- All data models use camelCase naming convention
