# Node Module - Technical Overview

> Last updated: 2026-02-23

## 1. File Structure

```
services/aiwm/src/modules/node/
├── node.schema.ts              # MongoDB schema (extends BaseSchema)
├── node.interface.ts           # SystemInfo TypeScript interfaces
├── node.dto.ts                 # DTOs: Create, Update, Login, RefreshToken
├── node.service.ts             # Business logic (extends BaseService)
├── node.controller.ts          # REST API endpoints
├── node.gateway.ts             # WebSocket gateway (/ws/node)
├── node-connection.service.ts  # In-memory connection tracking (Map)
└── node.module.ts              # NestJS module (imports: QueueModule, JwtModule)
```

## 2. Node Roles & Status

### Roles (array — node can have multiple)

| Role | Description |
|------|-------------|
| `controller` | Orchestrates other nodes |
| `worker` | Runs agents and model deployments |
| `proxy` | Traffic routing / load balancing |
| `storage` | Data and model artifact storage |

### Status (state machine)

| Status | Meaning | Set by | When |
|--------|---------|--------|------|
| `pending` | Created, not yet configured | System | On create |
| `installing` | Being set up | Manual / future automation | Setup flow |
| `online` | WebSocket connected | Gateway | On WS connect + first heartbeat |
| `offline` | WebSocket disconnected | Gateway | On WS disconnect |
| `maintenance` | Taken offline for maintenance | User (API) | Manual update |

**State transitions:**
```
create          → pending
ws.connect      → online
ws.disconnect   → offline
user sets       → maintenance (from any)
```

> **Note**: Gateway code also checks for `inactive` and `banned` statuses (not in schema). See ROADMAP P0-1.

## 3. Schema Fields

```
Node extends BaseSchema:
  name: string (required)
  role: string[] (enum: 'controller' | 'worker' | 'proxy' | 'storage')
  status: string (enum: 'pending' | 'installing' | 'online' | 'offline' | 'maintenance', default: 'pending')
  lastHeartbeat: Date (default: now)
  lastMetricsAt?: Date
  systemInfo?: SystemInfo (see node.interface.ts for full structure)
  tokenMetadata?: { tokenGeneratedAt, tokenExpiresAt, tokenLastUsed }
  apiKey?: string (UUID, unique, sparse index — used for node login)
  secretHash?: string (bcrypt hashed, select: false)
  lastAuthAt?: Date
  // Inherited from BaseSchema: owner, createdBy, updatedBy, isDeleted, metadata, timestamps
```

**Deprecated fields** (kept for backward compatibility, use `systemInfo` instead):
- `gpuDevices[]` → use `systemInfo.hardware.gpu`
- `cpuCores`, `cpuModel` → use `systemInfo.hardware.cpu`
- `ramTotal` → use `systemInfo.hardware.memory.total`
- `ramFree`, `cpuUsage`, `ramUsage`, `uptimeSeconds` → dynamic data, move to MetricData
- `hostname`, `ipAddress`, `publicIpAddress`, `os` → use `systemInfo`
- `daemonVersion` → kept for version tracking
- `containerRuntime` → use `systemInfo.containerRuntime`

### SystemInfo structure (node.interface.ts)

```
SystemInfo:
  os: { name, version, kernel, platform }
  architecture: { cpu, bits, endianness }
  hardware:
    cpu: { model, vendor, sockets, coresPerSocket, threadsPerCore, totalCores, frequency, cacheSize, details[] }
    memory: { total }
    disk: { total, devices[] }
    network: { publicIp, clusterIp, ports, interfaces[], connectivity }
    gpu?: [{ deviceId, model, vendor, memoryTotal, capabilities[] }]
  containerRuntime?: { type, version, apiVersion, storage }
  virtualization?: { type, role }
```

## 4. API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/nodes` | User JWT | Create node → auto-gen apiKey + secret (shown ONCE) |
| GET | `/nodes` | User JWT | List nodes + statistics (byStatus) |
| GET | `/nodes/:id` | User JWT | Get node by ID |
| POST | `/nodes/:id/regenerate-credentials` | User JWT (org.owner only) | Regenerate apiKey + secret. Old credentials invalidated immediately |
| POST | `/nodes/auth/login` | Public (apiKey + secret) | Node login → JWT token (expires 1h) |
| POST | `/nodes/auth/refresh` | Public (JWT) | Refresh node JWT (grace period: 5min after expiry) |

> **Not yet implemented** (commented out): `PUT /nodes/:id`, `DELETE /nodes/:id`, `POST /nodes/:id/token`

### Create Response Example

```json
{
  "node": { "_id": "...", "name": "gpu-node-01", "role": ["worker"], "status": "pending" },
  "credentials": {
    "apiKey": "d9721cea-803a-45b3-9381-93972d512d69",
    "secret": "e95ec1e2-a295-4373-972d-0db949df7e2a"
  },
  "warning": "Secret shown only ONCE. Save it now!"
}
```

## 5. Node Connection Lifecycle

### Full Flow

```
1. Node Agent starts
   └─► POST /nodes/auth/login (apiKey + secret)
       └─► Returns JWT token (expires 1h)
           └─► WS connect to /ws/node (JWT in auth.token / header / query)
               └─► afterInit middleware verifies JWT
                   └─► handleConnection:
                       ├─► findByObjectId(nodeId from JWT)
                       ├─► Block if status = 'inactive' | 'banned'
                       ├─► NodeConnectionService.addConnection()
                       ├─► nodeService.updateStatus(nodeId, 'online')
                       └─► Send connection.ack (success)
                           └─► Node sends node.register (systemInfo)
                               └─► Server sends register.ack (intervals config)
                                   └─► Node starts loops:
                                       ├─► Heartbeat (every 30s)
                                       ├─► Metrics push to MONA (every 60s)
                                       └─► Token refresh (before expiry)

5. On disconnect (WS close / error)
   └─► handleDisconnect:
       ├─► NodeConnectionService.removeConnection()
       └─► nodeService.updateStatus(nodeId, 'offline')
```

### Token Refresh

- Node JWT expires in **1 hour** (`NODE_TOKEN_EXPIRES_IN = 3600`)
- Refresh allowed within **5 min** after expiry (`NODE_TOKEN_REFRESH_GRACE_PERIOD = 300`)
- Refresh endpoint: `POST /nodes/auth/refresh` with current token

## 6. WebSocket Gateway (/ws/node)

### Events: Node → Server

| Event | MessageType | Handler | Description |
|-------|-------------|---------|-------------|
| `node.register` | `NODE_REGISTER` | `handleNodeRegister` | Send system info on connect. Supports new `systemInfo` object OR legacy flat fields |
| `telemetry.heartbeat` | `TELEMETRY_HEARTBEAT` | `handleHeartbeat` | Periodic heartbeat (every 30s). Updates `lastHeartbeat` in NodeConnectionService + DB |
| `telemetry.metrics` | `TELEMETRY_METRICS` | `handleMetrics` | Detailed metrics (every 60s). Currently just updates `lastMetricsAt` — TODO: MetricData |
| `command.ack` | `COMMAND_ACK` | `handleCommandAck` | Node acknowledges receiving a command. Forwards to ExecutionOrchestrator if `executionId` present |
| `command.result` | `COMMAND_RESULT` | `handleCommandResult` | Node reports command execution result. Forwards to ExecutionOrchestrator |
| `deployment.status` | `DEPLOYMENT_STATUS` | `handleDeploymentStatus` | Deployment status update — TODO: update DB |
| `deployment.logs` | `DEPLOYMENT_LOGS` | `handleDeploymentLogs` | Deployment logs — TODO: store/forward |

### Events: Server → Node

Sent via `sendCommandToNode(nodeId, commandType, resource, data, metadata?)`:

| Command | Description |
|---------|-------------|
| `agent.start` | Start an agent on the node |
| `agent.update` | Update a running agent |
| `agent.delete` | Stop and remove an agent |
| `deployment.create` | Create a model deployment |
| `deployment.stop` | Stop a deployment |
| `model.download` | Download a model |

Sent via `broadcastToAllNodes(type, data)`:
- Broadcasts to all connected nodes simultaneously

### Connection Tracking (NodeConnectionService)

- In-memory `Map<nodeId, NodeConnection>`
- Each connection: `{ nodeId, socketId, socket, username, connectedAt, lastHeartbeat, status, orgId, groupId }`
- If same node reconnects: old socket is forcibly disconnected
- `findStaleConnections(timeoutMs)`: Find nodes with no heartbeat in X ms — **not yet called anywhere**

## 7. Dependencies

- **NodeProducer**: Emit BullMQ events (node.created, node.updated, node.deleted)
- **JwtService**: Sign/verify node JWT tokens (HS256, uses JWT_SECRET env)
- **NodeConnectionService**: In-memory WebSocket connection tracking
- **ExecutionOrchestrator**: Injected via setter (avoids circular dep). Receives command ACK/result for workflow step tracking

## 8. Queue Events

Producer: `NodeProducer` → `nodes.queue`
- `node.created` — full node data (emitted in `createWithCredentials`)
- `node.updated` — full node data (emitted in `updateNode` — currently commented out)
- `node.deleted` — `{ id }` (emitted in `remove` — currently commented out)

**Note**: No NodeProcessor exists yet. Events are produced but not consumed.

## 9. Related Modules

- **Agent module** (`src/modules/agent/`): Calls `NodeGateway.sendCommandToNode()` for agent.start / agent.update / agent.delete commands. Validates node status before creating managed agents.
- **Execution module** (`src/modules/execution/`): Uses `NodeGateway.sendCommandToNode()` for workflow step execution. Provides `ExecutionOrchestrator` to handle command ACK/result callbacks.
- **Deployment module** (`src/modules/deployment/`): Receives deployment.status and deployment.logs events from nodes via NodeGateway handlers (TODO: implementation pending).

## 10. Existing Documentation

- `docs/aiwm/node-agent/README.md` — Node Agent integration overview (from agent's perspective)
- `docs/aiwm/node-agent/01-authentication.md` — Login, token refresh, credentials
- `docs/aiwm/node-agent/02-websocket-connection.md` — WebSocket connect, register, heartbeat
- `docs/aiwm/node-agent/03-events-reference.md` — All WebSocket events and message structures
- `docs/aiwm/node-agent/04-metrics-mona.md` — MONA metrics push API
- `docs/aiwm/node-agent/05-agent-commands.md` — Agent lifecycle commands
