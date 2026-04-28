# NWS Refactor Plan — NodeGateway tách process riêng

## Mục tiêu

Tách `NodeGateway` ra process riêng (`MODE=nws`, `core.aiwm.nws00`) tương tự như `AgentGateway` (`MODE=aws`).

Dùng **Redis pub/sub làm backbone** thay vì Socket.IO rooms để decouple hoàn toàn API process khỏi NWS process.

---

## Quyết định kiến trúc

### 1. Loại bỏ ExecutionOrchestrator khỏi scope

`ExecutionOrchestrator` dùng để deploy VM/container — chưa thực sự hoạt động trong production. Giai đoạn này loại bỏ hoàn toàn:

- Bỏ setter injection `nodeGateway.setExecutionOrchestrator(this)`
- Bỏ `handleCommandAck` → orchestrator callback
- Bỏ `handleCommandResult` → orchestrator callback
- Bỏ `forwardRef(() => NodeModule)` trong ExecutionModule

`COMMAND_ACK` và `COMMAND_RESULT` chỉ log, không callback orchestrator.

### 2. Redis pub/sub thay vì direct method call

**Trước:**
```
AgentService → NodeGateway.sendCommandToNode() [direct import]
NodeController → NodeGateway.sendCommandToNode() [direct import]
ExecutionOrchestrator → NodeGateway.sendCommandToNode() [setter inject]
```

**Sau:**
```
AgentService → Redis.publish('node:cmd:{nodeId}', payload)
NodeController → Redis.publish('node:cmd:{nodeId}', payload)
NodeGateway → Redis.subscribe('node:cmd:*') → forward WS → Node
```

API process không import NodeModule nữa.

### 3. NodeGateway chỉ làm bridge

```
Redis pub/sub ←→ NodeGateway ←→ Node WS client
                      ↕
                  MongoDB (Node collection)
```

---

## Kiến trúc sau refactor

### NWS Process (`MODE=nws`, port 3401)

**`NodeGatewayModule`** (standalone, không phụ thuộc API modules):
```
imports:
  ConfigModule.forRoot({ isGlobal: true })
  MongooseModule.forRoot(...)
  MongooseModule.forFeature([Node])
  JwtModule.registerAsync(...)

providers:
  NodeGateway
  NodeConnectionService

Redis: ioredis client (subscribe + publish)
```

**`NodeGateway`** responsibilities:
- JWT auth middleware trong `afterInit`
- `handleConnection` / `handleDisconnect` → NodeConnectionService + MongoDB
- `NODE_REGISTER` → `updateNodeInfo`
- `TELEMETRY_HEARTBEAT` → `updateHeartbeat`
- `TELEMETRY_METRICS` → `storeMetrics`
- `COMMAND_ACK` → log
- `COMMAND_RESULT` → log (publish Redis nếu cần future)
- `DEPLOYMENT_STATUS` → `updateDeploymentStatus`
- `onModuleInit`: subscribe Redis `node:cmd:{nodeId}` → forward WS
- `sendCommandToNode(nodeId, type, data)` — internal, dùng khi nhận từ Redis

**`NodeConnectionService`** — giữ nguyên, in-memory tracking.

### API Process — thay đổi

**AgentService** (`agent.service.ts`):
- Bỏ inject `NodeGateway`
- Thay bằng publish Redis: `redis.publish('node:cmd:{nodeId}', JSON.stringify({type, data}))`

**NodeController** (`node.controller.ts`):
- Bỏ inject `NodeGateway`
- Thay bằng publish Redis

**NodeModule** (`node.module.ts`):
- Bỏ export `NodeGateway`
- `NodeGateway` và `NodeConnectionService` chuyển sang `NodeGatewayModule`
- `NodeModule` chỉ còn: `NodeService` + `NodeController` + Mongoose

**ExecutionModule**:
- Bỏ `forwardRef(() => NodeModule)`
- Bỏ `NodeGateway` inject khỏi `ExecutionOrchestrator`
- `ExecutionOrchestrator` không gửi command trong giai đoạn này

---

## Redis Channels

| Channel | Publisher | Subscriber | Payload |
|---|---|---|---|
| `node:cmd:{nodeId}` | AgentService, NodeController | NodeGateway | `{type, data, metadata}` |
| `node:result:{nodeId}` | NodeGateway | (future: ExecutionOrchestrator) | `{type, result, error, metadata}` |
| `node:online:{nodeId}` | NodeGateway | (optional: API, for presence check) | `{nodeId, instanceId, connectedAt}` |
| `node:offline:{nodeId}` | NodeGateway | (optional) | `{nodeId}` |

### Routing multi-instance NWS

Khi có nhiều NWS instances, tất cả đều subscribe `node:cmd:*`. Mỗi instance check local `NodeConnectionService`:
- Có node → forward WS
- Không có → ignore

Đơn giản, không cần routing phức tạp. Overhead tối thiểu vì pub/sub message nhỏ.

---

## Command Payload Format

Giữ nguyên format hiện tại để Node client không cần thay đổi:

```json
{
  "type": "agent:start | agent:stop | agent:restart | agent:update | agent:delete | system:update",
  "messageId": "<uuid>",
  "timestamp": "<ISO>",
  "resource": { "type": "agent | system", "id": "<id>" },
  "data": { ... },
  "metadata": {
    "priority": "normal"
  }
}
```

---

## Bootstrap

### Tạo `bootstrap-node-ws.ts`

Tương tự `bootstrap-agent-ws.ts`:
```typescript
export async function bootstrapNodeWsServer() {
  const app = await NestFactory.create(NodeGatewayModule);

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = process.env.PORT_NWS || process.env.PORT || 3401;
  await app.listen(port);

  Logger.log(`🚀 AIWM Node WS Server: ws://localhost:${port}`);
}
```

### Thêm vào `main.ts`
```typescript
} else if (MODE === 'nws') {
  const { bootstrapNodeWsServer } = await import('./bootstrap-node-ws');
  await bootstrapNodeWsServer();
}
```

### `nx run aiwm:nws` — thêm vào `project.json`

Tham khảo target `aws` trong `project.json`.

### `ecosystem.config.js` — thêm `core.aiwm.nws00`

```javascript
{
  name: 'core.aiwm.nws00',
  script: './dist/services/aiwm/main.js',
  instances: 1,
  exec_mode: 'cluster',
  env: {
    NODE_ENV: 'production',
    PORT: 3401,
    MODE: 'nws',
    SERVICE_NAME: 'aiwm',
  },
  env_file: '.env',
  ...
}
```

---

## Implementation Steps

### Bước 1 — Tạo NodeGatewayModule (standalone)
- Tạo `src/modules/node-gateway/node-gateway.module.ts`
- Copy `NodeGateway` logic cần thiết (không phải toàn bộ NodeModule)
- Inject Redis client (ioredis) trực tiếp — subscribe `node:cmd:*` trong `onModuleInit`
- `NodeConnectionService` copy hoặc share

> Verify: TypeScript clean, không import ExecutionModule

### Bước 2 — Tách NodeGateway khỏi NodeModule (API)
- `NodeModule` bỏ `NodeGateway` provider/export
- `AgentModule` bỏ inject `NodeGateway`, thay bằng Redis publish
- `NodeController` bỏ inject `NodeGateway`, thay bằng Redis publish
- `ExecutionModule` bỏ `forwardRef(NodeModule)` và `NodeGateway` inject

> Verify: `nx run aiwm:build` clean, không còn circular dep warning

### Bước 3 — Bootstrap + project.json + ecosystem.config.js
- Tạo `bootstrap-node-ws.ts`
- Thêm `nws` vào `main.ts`
- Thêm target `nws` vào `project.json`
- Thêm `core.aiwm.nws00` vào `ecosystem.config.js`

> Verify: `nx run aiwm:nws` khởi động, log sạch, kết nối Redis OK

### Bước 4 — Test end-to-end
- Node client connect → xác nhận auth, heartbeat OK
- AgentService create agent (có nodeId) → Redis publish → NWS forward → Node nhận
- pm2 deploy lên server: `source .env && pm2 start ecosystem.config.js --only core.aiwm.nws00 --update-env`

---

## Lessons Learned từ AWS (AgentGateway)

Áp dụng ngay để tránh lặp lại bug:

1. **`PresenceModule` / Redis config**: dùng `forRootAsync` với `useFactory`, KHÔNG dùng `forRoot` với constant evaluated tại import time.

2. **`onModuleInit` Redis connection**: đọc `process.env.REDIS_HOST/PORT/PASSWORD` trực tiếp trong hook, KHÔNG dùng `redisConfig` constant từ `redis.config.ts` (constant evaluate trước dotenv).

3. **`ecosystem.config.js` env block**: chỉ để hardcoded vars (`PORT`, `MODE`, `SERVICE_NAME`, `NODE_ENV`). KHÔNG dùng `process.env.*` — pm2 daemon không kế thừa shell env, sẽ là `undefined` và override `env_file`.

4. **Deploy**: `source .env && pm2 startOrRestart ecosystem.config.js --only core.aiwm.nws00 --update-env`

---

## Files cần tạo mới

```
src/modules/node-gateway/
  node-gateway.module.ts
  node.gateway.ts          (refactored, stripped ExecutionOrchestrator)
  node-connection.service.ts (copy/move từ node/)

src/bootstrap-node-ws.ts
```

## Files cần sửa

```
src/main.ts                          — thêm MODE=nws
src/modules/node/node.module.ts      — bỏ NodeGateway
src/modules/node/node.service.ts     — bỏ gì liên quan đến gateway (nếu có)
src/modules/agent/agent.module.ts    — bỏ NodeGateway inject
src/modules/agent/agent.service.ts   — thay sendCommandToNode → Redis publish
src/modules/node/node.controller.ts  — thay sendCommandToNode → Redis publish
src/modules/execution/execution.module.ts    — bỏ forwardRef NodeModule
src/modules/execution/execution.orchestrator.ts — bỏ NodeGateway inject + setter
project.json                         — thêm target nws
ecosystem.config.js                  — thêm core.aiwm.nws00
```

## Files cần xóa

```
src/modules/node/ws-jwt.adapter.ts   — legacy, không dùng
```
