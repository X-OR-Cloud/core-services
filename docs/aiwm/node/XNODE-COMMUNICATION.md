# AIWM ↔ xnode Communication Reference

> Last updated: 2026-04-07

Tài liệu mô tả toàn bộ các endpoint (REST API, WebSocket) mà **xnode CLI** kết nối đến AIWM, mục đích sử dụng, payload, response, và các action gửi qua lại giữa hai bên.

---

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [REST API — Authentication & Bootstrap](#2-rest-api--authentication--bootstrap)
3. [WebSocket — Kết nối & Lifecycle](#3-websocket--kết-nối--lifecycle)
4. [Actions: xnode → AIWM (Inbound)](#4-actions-xnode--aiwm-inbound)
5. [Actions: AIWM → xnode (Outbound)](#5-actions-aiwm--xnode-outbound)
6. [Agent Actions qua Node](#6-agent-actions-qua-node)
7. [Luồng giao tiếp tổng hợp](#7-luồng-giao-tiếp-tổng-hợp)

---

## 1. Tổng quan kiến trúc

```
┌──────────────────────┐         REST API          ┌──────────────────────┐
│                      │◄─── /nodes/auth/login ────►│                      │
│                      │◄─── /nodes/auth/refresh ──►│                      │
│                      │◄─── /nodes/auth/bootstrap ►│                      │
│       xnode CLI      │                            │     AIWM Server      │
│    (trên mỗi VPS)    │      WebSocket /ws/node    │    (NestJS)          │
│                      │◄══════════════════════════►│                      │
│                      │   (bidirectional, JWT auth) │                      │
└──────────────────────┘                            └──────────────────────┘
         │                                                    │
         │  POST /agents/:id/connect                          │
         │  POST /agents/heartbeat                            │
         ▼                                                    ▼
   Agent Process                                     Agent Module
   (spawned by xnode)                                (quản lý lifecycle)
```

**Giao thức:**
- **REST API**: Xác thực, bootstrap, token refresh
- **WebSocket** (`/ws/node`): Giao tiếp realtime — heartbeat, telemetry, nhận lệnh, báo kết quả
- **Agent REST API**: Agent process kết nối riêng sau khi được xnode spawn

---

## 2. REST API — Authentication & Bootstrap

### 2.1. Bootstrap — Đăng ký node lần đầu

> Mục đích: Install script trên VPS gọi endpoint này để đổi setup token lấy node secret.

**`POST /nodes/auth/bootstrap`** (Public — không cần JWT)

**Request:**
```json
{
  "setupToken": "eyJhbGciOiJIUzI1NiJ9..."
}
```

**Response 200:**
```json
{
  "nodeId": "507f1f77bcf86cd799439011",
  "secret": "e95ec1e2-a295-4373-972d-0db949df7e2a",
  "warning": "This secret is shown ONLY ONCE. Save it securely."
}
```

**Hành vi:**
- Setup token là JWT 24h, dùng 1 lần duy nhất
- Sau khi gọi thành công, node chuyển status → `installing`
- xnode lưu `nodeId` + `secret` vào config cục bộ (ví dụ `/etc/xnode/config.json`)

---

### 2.2. Login — Xác thực node

> Mục đích: xnode dùng nodeId + secret để lấy JWT access token cho WebSocket.

**`POST /nodes/auth/login`** (Public)

**Request:**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "secret": "e95ec1e2-a295-4373-972d-0db949df7e2a"
}
```

**Response 200:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "expiresIn": 3600,
  "tokenType": "Bearer",
  "node": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "gpu-node-01",
    "status": "online",
    "roles": ["worker"],
    "orgId": "691eb9e6517f917943ae1f9a"
  }
}
```

**JWT payload (decoded):**
```json
{
  "sub": "507f1f77bcf86cd799439011",
  "type": "node",
  "username": "gpu-node-01",
  "status": "online",
  "roles": ["worker"],
  "orgId": "691eb9e6517f917943ae1f9a"
}
```

---

### 2.3. Refresh Token

> Mục đích: Gia hạn JWT trước hoặc ngay sau khi hết hạn (grace period 5 phút).

**`POST /nodes/auth/refresh`** (Public)

**Request:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9..."
}
```

**Response 200:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9.new...",
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

**Lưu ý:** xnode nên refresh token trước khi hết hạn (ví dụ ở phút 55/60). Nếu quá 5 phút sau khi hết hạn → phải login lại.

---

### 2.4. Remote Update — Trigger cập nhật xnode từ xa

> Mục đích: Người dùng trigger update xnode từ web UI thay vì phải SSH vào node chạy `xnode update` thủ công. AIWM gửi lệnh `system.update` qua WebSocket xuống node.

**`POST /nodes/:id/update`** (User JWT — org.owner hoặc node creator)

**Request:**
```json
{
  "version": "1.2.0"
}
```

| Field | Type | Required | Mô tả |
|-------|------|----------|--------|
| `version` | string | No | Version cần update. Mặc định: `"latest"` |

**Response 200:**
```json
{
  "messageId": "cmd-uuid",
  "nodeId": "507f1f77bcf86cd799439011",
  "nodeName": "gpu-node-01",
  "version": "1.2.0",
  "message": "Update command sent to node \"gpu-node-01\". The node will disconnect temporarily during the update and reconnect with the new version."
}
```

**Response 400 — node không online:**
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Node must be online to receive update command (current: offline)"
}
```

**Response 403 — không phải owner/creator:**
```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Only organization owner or node creator can trigger node update"
}
```

**Hành vi:**
- API gửi `system.update` command qua WebSocket đến node
- xnode nhận lệnh → chạy `xnode update [version]` → daemon restart
- Node sẽ tạm disconnect (status → `offline`) → reconnect với version mới (status → `online`)
- Không có trạng thái `updating` riêng — chấp nhận offline/online cycle bình thường

---

## 3. WebSocket — Kết nối & Lifecycle

### 3.1. Thông tin kết nối

| Thuộc tính | Giá trị |
|-----------|---------|
| **Namespace** | `/ws/node` |
| **Transports** | `websocket`, `polling` |
| **Auth** | JWT trong `socket.handshake.auth.token` hoặc header `Authorization: Bearer <token>` hoặc `query.token` |

### 3.2. Luồng kết nối

```
xnode                                    AIWM
  │                                        │
  │── WS connect /ws/node (JWT) ──────────►│
  │                                        │── verify JWT
  │                                        │── check node status (block nếu inactive/banned)
  │                                        │── addConnection (in-memory Map)
  │                                        │── updateStatus → "online"
  │◄── connection.ack ────────────────────│
  │                                        │
  │── node.register (systemInfo) ─────────►│
  │                                        │── lưu systemInfo vào DB
  │◄── register.ack (intervals config) ───│
  │                                        │
  │── [loop] telemetry.heartbeat (30s) ───►│
  │── [loop] telemetry.metrics (60s) ─────►│
  │── [loop] token refresh (trước hết hạn)─►│ (qua REST API)
  │                                        │
  │    ... nhận commands từ AIWM ...        │
  │◄── deployment.create / agent.start ────│
  │── command.ack ────────────────────────►│
  │── command.result ─────────────────────►│
  │                                        │
  │── WS disconnect ──────────────────────►│
  │                                        │── removeConnection
  │                                        │── updateStatus → "offline"
```

### 3.3. Register Ack — Config từ server

Sau khi xnode gửi `node.register`, server trả về config:

```json
{
  "controllerInfo": {
    "heartbeatInterval": 30000,
    "metricsInterval": 60000,
    "timezone": "UTC"
  }
}
```

xnode sử dụng các interval này để cấu hình vòng lặp heartbeat và metrics.

---

## 4. Actions: xnode → AIWM (Inbound)

### 4.1. `node.register` — Đăng ký thông tin hệ thống

> Mục đích: Gửi thông tin phần cứng, OS, container runtime khi kết nối lần đầu.

**MessageType:** `NODE_REGISTER`

**Payload:**
```json
{
  "type": "node.register",
  "messageId": "uuid-v4",
  "timestamp": "2026-04-07T10:00:00.000Z",
  "data": {
    "nodeId": "507f1f77bcf86cd799439011",
    "name": "gpu-node-01",
    "systemInfo": {
      "os": { "name": "Ubuntu", "version": "22.04 LTS", "kernel": "5.15.0-91", "platform": "linux" },
      "architecture": { "cpu": "x86_64", "bits": 64, "endianness": "LE" },
      "hardware": {
        "cpu": {
          "model": "Intel Xeon Gold 6348",
          "vendor": "Intel",
          "totalCores": 64,
          "frequency": 2600
        },
        "memory": { "total": 137438953472 },
        "disk": { "total": 2000000000000 },
        "network": {
          "publicIp": "203.0.113.50",
          "clusterIp": "10.0.1.5",
          "ports": { "ssh": 22, "agent": 8080 }
        },
        "gpu": [
          {
            "deviceId": "0",
            "model": "NVIDIA A100",
            "vendor": "NVIDIA",
            "memoryTotal": 85899345920,
            "capabilities": ["compute_8.0", "tensor_cores"]
          }
        ]
      },
      "containerRuntime": {
        "type": "docker",
        "version": "24.0.7",
        "storage": { "driver": "overlay2" }
      }
    }
  }
}
```

**Server response (ack):**
```json
{
  "controllerInfo": {
    "heartbeatInterval": 30000,
    "metricsInterval": 60000,
    "timezone": "UTC"
  }
}
```

---

### 4.2. `telemetry.heartbeat` — Heartbeat định kỳ

> Mục đích: Báo node còn sống, gửi metrics cơ bản (CPU, RAM, GPU usage).

**MessageType:** `TELEMETRY_HEARTBEAT`

**Interval:** Mỗi 30 giây (cấu hình qua `register.ack`)

**Payload:**
```json
{
  "type": "telemetry.heartbeat",
  "messageId": "uuid-v4",
  "timestamp": "2026-04-07T10:00:30.000Z",
  "data": {
    "nodeId": "507f1f77bcf86cd799439011",
    "status": "online",
    "uptimeSeconds": 86400,
    "activeDeployments": 2,
    "cpuUsage": 45.2,
    "ramUsage": 68.7,
    "gpuStatus": [
      {
        "deviceId": "0",
        "memoryUsed": 42949672960,
        "memoryTotal": 85899345920,
        "utilization": 78,
        "temperature": 72
      }
    ]
  }
}
```

**Hành vi server:**
- Cập nhật `lastHeartbeat` trong DB và in-memory connection
- Cập nhật `status` nếu thay đổi

---

### 4.3. `telemetry.metrics` — Metrics chi tiết

> Mục đích: Gửi metrics chi tiết hơn (disk I/O, network, per-process).

**MessageType:** `TELEMETRY_METRICS`

**Interval:** Mỗi 60 giây

**Payload:**
```json
{
  "type": "telemetry.metrics",
  "messageId": "uuid-v4",
  "timestamp": "2026-04-07T10:01:00.000Z",
  "data": {
    "nodeId": "507f1f77bcf86cd799439011"
  }
}
```

> **Note:** Format metrics chi tiết đang được thiết kế. Hiện tại server chỉ cập nhật `lastMetricsAt`.

---

### 4.4. `command.ack` — Xác nhận đã nhận lệnh

> Mục đích: xnode báo đã nhận command từ server, đang xử lý.

**MessageType:** `COMMAND_ACK`

**Payload:**
```json
{
  "type": "command.ack",
  "messageId": "uuid-v4",
  "timestamp": "2026-04-07T10:02:00.000Z",
  "data": {
    "originalMessageId": "cmd-uuid-from-server",
    "status": "acknowledged",
    "estimatedDuration": 30
  },
  "metadata": {
    "executionId": "exec-uuid",
    "stepIndex": 0
  }
}
```

| Field | Mô tả |
|-------|--------|
| `originalMessageId` | ID của command đang ack |
| `status` | Luôn là `"acknowledged"` |
| `estimatedDuration` | Ước tính thời gian xử lý (giây), optional |
| `metadata.executionId` | ID execution workflow (nếu command từ workflow) |

---

### 4.5. `command.result` — Báo kết quả thực thi

> Mục đích: xnode báo kết quả sau khi thực thi xong một command.

**MessageType:** `COMMAND_RESULT`

**Payload (thành công):**
```json
{
  "type": "command.result",
  "messageId": "uuid-v4",
  "timestamp": "2026-04-07T10:02:30.000Z",
  "data": {
    "originalMessageId": "cmd-uuid-from-server",
    "status": "success",
    "deploymentId": "deploy-507f...",
    "result": {
      "containerId": "abc123",
      "endpoint": "http://10.0.1.5:8080",
      "gpuDeviceId": "0"
    },
    "progress": 100
  },
  "metadata": {
    "executionId": "exec-uuid",
    "stepIndex": 0
  }
}
```

**Payload (lỗi):**
```json
{
  "type": "command.result",
  "messageId": "uuid-v4",
  "timestamp": "2026-04-07T10:02:30.000Z",
  "data": {
    "originalMessageId": "cmd-uuid-from-server",
    "status": "error",
    "error": {
      "code": "CONTAINER_START_FAILED",
      "message": "Failed to start container: OOM killed",
      "details": { "exitCode": 137 }
    }
  },
  "metadata": {
    "executionId": "exec-uuid",
    "stepIndex": 0
  }
}
```

| Field | Mô tả |
|-------|--------|
| `status` | `"success"` hoặc `"error"` |
| `result` | Dữ liệu kết quả (khi success) |
| `error` | Chi tiết lỗi (khi error) |
| `progress` | 0-100, optional |

---

### 4.6. `deployment.status` — Cập nhật trạng thái deployment

> Mục đích: xnode báo khi deployment thay đổi trạng thái (starting → running, running → stopped, v.v.)

**MessageType:** `DEPLOYMENT_STATUS`

**Payload:**
```json
{
  "type": "deployment.status",
  "messageId": "uuid-v4",
  "timestamp": "2026-04-07T10:05:00.000Z",
  "data": {
    "deploymentId": "deploy-507f...",
    "nodeId": "507f1f77bcf86cd799439011",
    "status": "running",
    "previousStatus": "starting",
    "containerId": "abc123",
    "containerName": "llama-70b-deploy",
    "endpoint": "http://10.0.1.5:8080",
    "gpuDeviceId": "0",
    "gpuMemoryUsed": 42949672960,
    "cpuCores": 4,
    "totalInferences": 1250,
    "averageLatency": 145,
    "uptimeSeconds": 3600,
    "lastHealthCheck": "2026-04-07T10:04:55.000Z",
    "healthStatus": "healthy",
    "events": [
      {
        "type": "status_change",
        "message": "Deployment started successfully",
        "timestamp": "2026-04-07T10:05:00.000Z"
      }
    ]
  }
}
```

**Deployment Status enum:**
| Status | Mô tả |
|--------|--------|
| `queued` | Đang chờ xử lý |
| `starting` | Đang khởi động container |
| `running` | Đang chạy |
| `stopping` | Đang dừng |
| `stopped` | Đã dừng |
| `failed` | Lỗi |
| `restarting` | Đang restart |

---

### 4.7. `deployment.logs` — Gửi logs deployment

> Mục đích: Gửi logs từ container/process deployment về AIWM.

**MessageType:** `DEPLOYMENT_LOGS`

**Payload:**
```json
{
  "type": "deployment.logs",
  "messageId": "uuid-v4",
  "timestamp": "2026-04-07T10:05:30.000Z",
  "data": {
    "deploymentId": "deploy-507f...",
    "logs": [
      {
        "timestamp": "2026-04-07T10:05:28.000Z",
        "level": "info",
        "message": "Model loaded successfully, serving on port 8080"
      },
      {
        "timestamp": "2026-04-07T10:05:29.000Z",
        "level": "info",
        "message": "Health check endpoint ready"
      }
    ],
    "moreAvailable": false
  }
}
```

---

## 5. Actions: AIWM → xnode (Outbound)

Tất cả outbound commands được gửi qua WebSocket với format chung:

```json
{
  "type": "<message_type>",
  "messageId": "uuid-v4",
  "timestamp": "2026-04-07T10:00:00.000Z",
  "data": { ... },
  "metadata": {
    "executionId": "exec-uuid",
    "stepIndex": 0
  }
}
```

xnode **phải** trả lời mỗi command bằng:
1. `command.ack` — ngay khi nhận được
2. `command.result` — khi hoàn thành hoặc lỗi

---

### 5.1. Deployment Commands

#### `deployment.create` — Tạo deployment

> Mục đích: Yêu cầu xnode tạo container chạy model inference.

```json
{
  "type": "deployment.create",
  "messageId": "cmd-uuid",
  "data": {
    "deploymentId": "deploy-507f...",
    "modelId": "model-123",
    "modelName": "llama-3-70b",
    "image": "registry.x-or.cloud/inference/vllm:latest",
    "config": {
      "gpuDeviceId": "0",
      "cpuCores": 4,
      "memoryLimit": "32Gi",
      "port": 8080,
      "env": {
        "MODEL_PATH": "/models/llama-3-70b",
        "MAX_BATCH_SIZE": "32"
      }
    }
  }
}
```

#### `deployment.stop` — Dừng deployment

```json
{
  "type": "deployment.stop",
  "data": {
    "deploymentId": "deploy-507f..."
  }
}
```

#### `deployment.restart` — Restart deployment

```json
{
  "type": "deployment.restart",
  "data": {
    "deploymentId": "deploy-507f..."
  }
}
```

#### `deployment.update` — Cập nhật config deployment

```json
{
  "type": "deployment.update",
  "data": {
    "deploymentId": "deploy-507f...",
    "config": {
      "env": { "MAX_BATCH_SIZE": "64" }
    }
  }
}
```

#### `deployment.delete` — Xóa deployment

```json
{
  "type": "deployment.delete",
  "data": {
    "deploymentId": "deploy-507f..."
  }
}
```

#### `deployment.query` — Truy vấn deployments đang chạy

```json
{
  "type": "deployment.query",
  "data": {}
}
```

---

### 5.2. Model Commands

#### `model.download` — Tải model về node

```json
{
  "type": "model.download",
  "data": {
    "modelId": "model-123",
    "modelName": "llama-3-70b",
    "source": "huggingface",
    "url": "meta-llama/Llama-3-70B",
    "storagePath": "/models/llama-3-70b"
  }
}
```

#### `model.cache` — Cache model

```json
{
  "type": "model.cache",
  "data": {
    "modelId": "model-123",
    "modelName": "llama-3-70b"
  }
}
```

#### `model.delete` — Xóa model khỏi node

```json
{
  "type": "model.delete",
  "data": {
    "modelId": "model-123"
  }
}
```

#### `model.list` — Liệt kê models trên node

```json
{
  "type": "model.list",
  "data": {}
}
```

---

### 5.3. System Commands

#### `system.healthCheck` — Kiểm tra sức khỏe hệ thống

```json
{
  "type": "system.healthCheck",
  "data": {}
}
```

#### `system.restart` — Restart xnode daemon

```json
{
  "type": "system.restart",
  "data": {
    "graceful": true,
    "timeoutSeconds": 30
  }
}
```

#### `system.update` — Cập nhật phiên bản xnode

> Mục đích: Yêu cầu xnode tự update lên version mới mà không cần SSH vào node.

**Trigger:** User gọi `POST /nodes/:id/update` → AIWM gửi command qua WebSocket.

```json
{
  "type": "system.update",
  "messageId": "cmd-uuid",
  "timestamp": "2026-04-07T10:00:00.000Z",
  "data": {
    "version": "1.2.0"
  },
  "metadata": {
    "priority": "normal"
  }
}
```

| Field | Mô tả |
|-------|--------|
| `version` | Version cần update. `"latest"` = bản mới nhất |

**xnode phải:**
1. Gửi `command.ack`
2. Chạy lệnh update tương đương `xnode update [version]`
3. Gửi `command.result` (success/error)
4. Nếu success → restart daemon (xnode sẽ disconnect tạm → reconnect với version mới)

**Luồng kỳ vọng:**
```
AIWM                                     xnode
  │                                        │
  │══ system.update { version } ══════════►│
  │◄═ command.ack ═════════════════════════│
  │                                        │── download new version
  │                                        │── verify integrity
  │◄═ command.result (success) ════════════│
  │                                        │── restart daemon
  │◄── WS disconnect ─────────────────────│  (status → offline)
  │                                        │── ... daemon restarts ...
  │◄═══ WS reconnect (new version) ═══════│  (status → online)
  │◄── node.register (daemonVersion mới) ──│
```

---

## 6. Agent Actions qua Node

Khi một **engineer agent** được tạo với `nodeId`, AIWM sẽ gửi lệnh qua WebSocket đến xnode để quản lý lifecycle của agent process trên node đó.

### 6.1. `agent.start` — Khởi động agent trên node

> Mục đích: xnode nhận lệnh spawn một agent process mới.

**Khi nào gửi:**
- User tạo agent với `nodeId` (`POST /agents`)
- User start lại agent đã bị stop (`POST /agents/:id/start`)

**Payload:**
```json
{
  "type": "agent.start",
  "messageId": "cmd-uuid",
  "data": {
    "agentId": "agent-507f...",
    "code": "jack-bold",
    "name": "Code Review Bot",
    "description": "Reviews pull requests",
    "status": "inactive",
    "type": "engineer",
    "framework": "claude-agent-sdk",
    "secret": "plaintext-secret-shown-once",
    "instructionId": "instr-123",
    "guardrailId": "guard-456",
    "deploymentId": "deploy-789",
    "settings": {
      "maxConcurrentTasks": 3,
      "idleTimeoutMs": 300000
    }
  }
}
```

| Field | Mô tả |
|-------|--------|
| `agentId` | MongoDB ObjectId của agent |
| `code` | Mã unique, immutable (ví dụ `jack-bold`) |
| `secret` | Secret plaintext — xnode dùng để agent connect lại AIWM |
| `framework` | `claude-agent-sdk` hoặc `vercel-ai-sdk` |
| `instructionId` | ID instruction (system prompt) |
| `guardrailId` | ID guardrail (PII filter, content policy) |
| `deploymentId` | ID deployment model mà agent sử dụng |
| `settings` | Config tùy chỉnh |

**xnode phải:**
1. Gửi `command.ack`
2. Spawn agent process (systemd unit hoặc container)
3. Truyền config (agentId, secret, AIWM URL) cho agent process
4. Gửi `command.result` khi agent process đã start thành công hoặc lỗi

**Agent process sau khi start:**
- Gọi `POST /agents/:id/connect` với `{ secret }` để lấy JWT + full config
- Bắt đầu heartbeat loop qua `POST /agents/heartbeat`
- Nhận work items khi heartbeat trả về `{ work: {...} }`

---

### 6.2. `agent.stop` — Dừng agent

> Mục đích: Dừng agent process trên node. Agent status → `suspended`.

**Khi nào gửi:**
- User gọi `POST /agents/:id/stop`

**Payload:**
```json
{
  "type": "agent.stop",
  "data": {
    "agentId": "agent-507f...",
    "code": "jack-bold",
    "name": "Code Review Bot"
  }
}
```

**xnode phải:**
1. Gửi `command.ack`
2. Gracefully stop agent process (SIGTERM → wait → SIGKILL)
3. Gửi `command.result`

---

### 6.3. `agent.restart` — Restart agent với config mới

> Mục đích: Restart agent khi config thay đổi (instruction, guardrail, settings, v.v.)

**Khi nào gửi:**
- User update agent (`PUT /agents/:id`) khi agent có `nodeId`

**Payload:** Giống `agent.start` — gửi full config mới.

```json
{
  "type": "agent.restart",
  "data": {
    "agentId": "agent-507f...",
    "code": "jack-bold",
    "name": "Code Review Bot (v2)",
    "description": "Updated description",
    "status": "inactive",
    "type": "engineer",
    "framework": "claude-agent-sdk",
    "secret": "same-or-new-secret",
    "instructionId": "instr-456",
    "guardrailId": "guard-789",
    "deploymentId": "deploy-789",
    "settings": {
      "maxConcurrentTasks": 5
    }
  }
}
```

**xnode phải:**
1. Gửi `command.ack`
2. Stop agent process hiện tại
3. Start lại với config mới
4. Gửi `command.result`

---

### 6.4. `agent.update` — Cập nhật phiên bản agent

> Mục đích: Yêu cầu xnode update agent lên version mới (tương tự `system.update` nhưng cho agent process).

**Payload:**
```json
{
  "type": "agent.update",
  "data": {
    "agentId": "agent-507f...",
    "code": "jack-bold",
    "version": "2.1.0"
  }
}
```

| Field | Mô tả |
|-------|--------|
| `agentId` | ID agent cần update |
| `code` | Mã unique của agent |
| `version` | Version mới. `"latest"` = bản mới nhất |

**xnode phải:**
1. Gửi `command.ack`
2. Tải/cập nhật agent lên version mới
3. Restart agent process với version mới
4. Gửi `command.result`

---

### 6.5. `agent.delete` — Xóa agent khỏi node

> Mục đích: Dừng và xóa hoàn toàn agent process + config trên node.

**Khi nào gửi:**
- User xóa agent (`DELETE /agents/:id`) khi agent có `nodeId`

**Payload:**
```json
{
  "type": "agent.delete",
  "data": {
    "agentId": "agent-507f...",
    "code": "jack-bold",
    "name": "Code Review Bot"
  }
}
```

**xnode phải:**
1. Gửi `command.ack`
2. Stop agent process
3. Xóa systemd unit / container + config files
4. Gửi `command.result`

---

### 6.6. `agent.execute` — Thực thi task trên agent

> Mục đích: Gửi lệnh thực thi cụ thể cho agent (qua workflow hoặc manual trigger).

**Payload:**
```json
{
  "type": "agent.execute",
  "data": {
    "agentId": "agent-507f...",
    "task": {
      "type": "code_review",
      "payload": { "prUrl": "https://github.com/org/repo/pull/123" }
    }
  },
  "metadata": {
    "executionId": "exec-uuid",
    "stepIndex": 2
  }
}
```

---

## 7. Luồng giao tiếp tổng hợp

### 7.1. Provisioning — Từ tạo node đến online

```
User (Web UI)                  AIWM Server                 VPS (xnode)
     │                              │                           │
     │── POST /nodes ──────────────►│                           │
     │◄── { status: "pending" } ────│                           │
     │                              │                           │
     │── POST /nodes/:id/setup-guide►│                          │
     │◄── { installCommand } ───────│                           │
     │                              │                           │
     │── SSH vào VPS, chạy command ─┼──────────────────────────►│
     │                              │                           │── curl install script
     │                              │◄── POST /auth/bootstrap ──│
     │                              │── { nodeId, secret } ────►│── lưu credentials
     │                              │                           │
     │                              │◄── POST /auth/login ──────│
     │                              │── { accessToken } ───────►│
     │                              │                           │
     │                              │◄═══ WS connect ═══════════│
     │                              │── connection.ack ────────►│
     │                              │◄── node.register ─────────│
     │                              │── register.ack ──────────►│
     │                              │                           │── start heartbeat loop
     │                              │◄── telemetry.heartbeat ───│  (mỗi 30s)
```

### 7.2. Deploy model trên node

```
User                           AIWM Server                 xnode
  │                              │                           │
  │── POST /deployments ────────►│                           │
  │                              │══ deployment.create ═════►│
  │                              │◄═ command.ack ════════════│
  │                              │                           │── pull image
  │                              │                           │── start container
  │                              │◄═ deployment.status ══════│  (starting)
  │                              │◄═ deployment.status ══════│  (running)
  │                              │◄═ command.result (success)═│
  │◄── { deployment: running } ──│                           │
  │                              │                           │
  │                              │◄═ deployment.logs ════════│  (streaming)
  │                              │◄═ telemetry.heartbeat ════│  (activeDeployments: 1)
```

### 7.3. Agent lifecycle trên node

```
User                           AIWM Server                 xnode              Agent Process
  │                              │                           │                      │
  │── POST /agents ─────────────►│                           │                      │
  │   { nodeId, type: engineer } │                           │                      │
  │                              │══ agent.start ═══════════►│                      │
  │                              │◄═ command.ack ════════════│                      │
  │                              │                           │── spawn process ────►│
  │                              │                           │                      │── POST /agents/:id/connect
  │                              │                           │                      │◄── { jwt, config }
  │                              │                           │                      │── POST /agents/heartbeat (loop)
  │                              │                           │                      │◄── { work: {...} } (nếu có)
  │                              │◄═ command.result (success)═│                      │
  │◄── { agent: active } ────────│                           │                      │
  │                              │                           │                      │
  │── PUT /agents/:id ──────────►│                           │                      │
  │   { settings: {...} }        │                           │                      │
  │                              │══ agent.restart ═════════►│                      │
  │                              │                           │── stop process ─────►│ (SIGTERM)
  │                              │                           │── spawn process ────►│ (new config)
  │                              │                           │                      │── POST /agents/:id/connect
  │                              │◄═ command.result ═════════│                      │
  │                              │                           │                      │
  │── DELETE /agents/:id ───────►│                           │                      │
  │                              │══ agent.delete ══════════►│                      │
  │                              │                           │── kill process ─────►│ ✗
  │                              │                           │── cleanup files       │
  │                              │◄═ command.result ═════════│                      │
```

---

## Phụ lục: Message Envelope Format

Mọi message WebSocket giữa AIWM và xnode đều có format chung:

```typescript
interface WebSocketMessage {
  type: string;           // MessageType enum value
  messageId: string;      // UUID v4, unique per message
  timestamp: string;      // ISO 8601
  data: Record<string, any>;
  metadata?: {
    executionId?: string; // Workflow execution tracking
    stepIndex?: number;   // Step trong workflow
  };
}
```

### Command Status Enum

| Status | Mô tả |
|--------|--------|
| `pending` | Command đang chờ gửi |
| `sent` | Đã gửi qua WebSocket |
| `acknowledged` | xnode đã nhận (command.ack) |
| `success` | Thực thi thành công |
| `error` | Thực thi lỗi |
| `timeout` | Hết thời gian chờ |
| `cancelled` | Đã hủy |

### MessageType Enum — Tổng hợp

| MessageType | Hướng | Mô tả |
|-------------|-------|--------|
| `connection.ack` | AIWM → xnode | Xác nhận kết nối WS |
| `node.register` | xnode → AIWM | Đăng ký thông tin hệ thống |
| `register.ack` | AIWM → xnode | Trả config (intervals) |
| `telemetry.heartbeat` | xnode → AIWM | Heartbeat định kỳ |
| `telemetry.metrics` | xnode → AIWM | Metrics chi tiết |
| `command.ack` | xnode → AIWM | Xác nhận đã nhận lệnh |
| `command.result` | xnode → AIWM | Kết quả thực thi lệnh |
| `deployment.create` | AIWM → xnode | Tạo deployment |
| `deployment.stop` | AIWM → xnode | Dừng deployment |
| `deployment.restart` | AIWM → xnode | Restart deployment |
| `deployment.update` | AIWM → xnode | Cập nhật deployment |
| `deployment.delete` | AIWM → xnode | Xóa deployment |
| `deployment.query` | AIWM → xnode | Truy vấn deployments |
| `deployment.status` | xnode → AIWM | Báo trạng thái deployment |
| `deployment.logs` | xnode → AIWM | Gửi logs deployment |
| `model.download` | AIWM → xnode | Tải model |
| `model.cache` | AIWM → xnode | Cache model |
| `model.delete` | AIWM → xnode | Xóa model |
| `model.list` | AIWM → xnode | Liệt kê models |
| `agent.start` | AIWM → xnode | Khởi động agent |
| `agent.stop` | AIWM → xnode | Dừng agent |
| `agent.restart` | AIWM → xnode | Restart agent |
| `agent.update` | AIWM → xnode | Cập nhật agent config |
| `agent.delete` | AIWM → xnode | Xóa agent |
| `agent.execute` | AIWM → xnode | Thực thi task |
| `system.healthCheck` | AIWM → xnode | Kiểm tra sức khỏe |
| `system.restart` | AIWM → xnode | Restart xnode daemon |
| `system.update` | AIWM → xnode | Cập nhật phiên bản xnode |
