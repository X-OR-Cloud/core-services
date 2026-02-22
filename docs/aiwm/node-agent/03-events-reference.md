# WebSocket Events Reference

## Message Structure

Tất cả WebSocket messages tuân theo cấu trúc chung:

```json
{
  "type": "message.type",
  "messageId": "uuid-v4",
  "timestamp": "ISO-8601",
  "resource": { "type": "resource-type", "id": "resource-id" },
  "data": { },
  "metadata": {
    "priority": "normal",
    "executionId": "exec-123",
    "stepIndex": 0,
    "timeout": 300
  }
}
```

- `messageId`: UUID v4, unique cho mỗi message
- `timestamp`: ISO 8601 format
- `resource`: Chỉ có trong command messages (Server → Node)
- `metadata`: Optional, dùng cho execution tracking

## Event Types

### Server → Node (Commands)

Node Agent cần **lắng nghe** các events này:

| Event | Description | Status |
|-------|-------------|--------|
| `agent.start` | Start agent trên node | Implemented |
| `agent.stop` | Stop agent trên node | Future |
| `agent.execute` | Execute agent task | Future |
| `agent.query` | Query agent status | Future |
| `deployment.create` | Tạo deployment (container) | Defined |
| `deployment.stop` | Stop deployment | Defined |
| `deployment.restart` | Restart deployment | Defined |
| `deployment.update` | Update deployment config | Defined |
| `deployment.delete` | Xóa deployment | Defined |
| `deployment.query` | Query deployment info | Defined |
| `model.download` | Download model | Defined |
| `model.cache` | Cache model locally | Defined |
| `model.delete` | Xóa model | Defined |
| `model.list` | List models trên node | Defined |
| `system.healthCheck` | Health check request | Future |
| `system.restart` | Restart node agent | Future |
| `system.update` | Update node agent | Future |

### Node → Server (Events & Responses)

Node Agent cần **gửi** các events này:

| Event | Description | Khi nào gửi |
|-------|-------------|-------------|
| `node.register` | Đăng ký hardware specs | Sau connect (optional) |
| `telemetry.heartbeat` | Heartbeat | Mỗi 30s |
| `telemetry.metrics` | System metrics | Mỗi 60s |
| `command.ack` | Xác nhận đã nhận command | Ngay khi nhận command |
| `command.result` | Kết quả thực thi command | Khi command hoàn thành |
| `deployment.status` | Cập nhật trạng thái deployment | Khi status thay đổi |
| `deployment.logs` | Gửi logs từ deployment | Định kỳ hoặc khi có log mới |

## Command Handling Flow

Khi nhận command từ server, Node Agent xử lý theo flow:

```
1. Nhận command (e.g. agent.start)
   │
2. Gửi command.ack (xác nhận đã nhận)
   │
3. Xử lý command
   │
4. Gửi command.result (kết quả: success/error)
```

### command.ack

Gửi ngay sau khi nhận command để xác nhận:

```json
{
  "type": "command.ack",
  "messageId": "uuid",
  "timestamp": "ISO-8601",
  "data": {
    "originalMessageId": "uuid-của-command-nhận-được",
    "status": "acknowledged",
    "estimatedDuration": 120
  },
  "metadata": {
    "executionId": "exec-123",
    "stepIndex": 0
  }
}
```

- `originalMessageId`: messageId của command đã nhận
- `estimatedDuration`: Ước tính thời gian xử lý (giây, optional)
- `metadata`: Copy từ command nếu có

### command.result

Gửi khi command xử lý xong:

**Success:**
```json
{
  "type": "command.result",
  "messageId": "uuid",
  "timestamp": "ISO-8601",
  "data": {
    "originalMessageId": "uuid-của-command",
    "deploymentId": "deployment-id (nếu có)",
    "status": "success",
    "result": {
      "containerId": "abc123",
      "endpoint": "http://localhost:8000"
    },
    "progress": 100
  },
  "metadata": {
    "executionId": "exec-123",
    "stepIndex": 0
  }
}
```

**Error:**
```json
{
  "type": "command.result",
  "messageId": "uuid",
  "timestamp": "ISO-8601",
  "data": {
    "originalMessageId": "uuid-của-command",
    "status": "error",
    "error": {
      "code": "2006",
      "message": "Failed to start container",
      "details": { "reason": "port already in use" },
      "retryable": true,
      "retryAfter": 30
    }
  },
  "metadata": {
    "executionId": "exec-123",
    "stepIndex": 0
  }
}
```

## Deployment Events

### deployment.create (Server → Node)

```json
{
  "type": "deployment.create",
  "messageId": "uuid",
  "timestamp": "ISO-8601",
  "resource": { "type": "deployment", "id": "deploy-123" },
  "data": {
    "modelId": "model-123",
    "modelPath": "s3://bucket/path/model.tar.gz",
    "containerName": "inference-model-v1",
    "containerImage": "nvidia/cuda:12.0-runtime",
    "containerPort": 8000,
    "gpuDeviceId": "0",
    "gpuMemoryLimit": 20480,
    "environment": {
      "MODEL_NAME": "llama-7b",
      "BATCH_SIZE": "32"
    },
    "healthCheckPath": "/health",
    "healthCheckInterval": 30
  },
  "metadata": {
    "priority": "normal",
    "executionId": "exec-123",
    "stepIndex": 0,
    "timeout": 300
  }
}
```

### deployment.stop (Server → Node)

```json
{
  "type": "deployment.stop",
  "messageId": "uuid",
  "timestamp": "ISO-8601",
  "resource": { "type": "deployment", "id": "deploy-123" },
  "data": {
    "force": false,
    "timeout": 30
  }
}
```

### deployment.status (Node → Server)

Gửi khi trạng thái deployment thay đổi:

```json
{
  "type": "deployment.status",
  "messageId": "uuid",
  "timestamp": "ISO-8601",
  "data": {
    "deploymentId": "deploy-123",
    "nodeId": "node-id",
    "status": "running",
    "previousStatus": "starting",
    "containerId": "abc123",
    "endpoint": "http://10.8.0.5:8000",
    "gpuDeviceId": "0",
    "gpuMemoryUsed": 20480,
    "uptimeSeconds": 3600,
    "healthStatus": "healthy"
  }
}
```

**Deployment status values**: `queued`, `starting`, `running`, `stopping`, `stopped`, `failed`, `restarting`

### deployment.logs (Node → Server)

```json
{
  "type": "deployment.logs",
  "messageId": "uuid",
  "timestamp": "ISO-8601",
  "data": {
    "deploymentId": "deploy-123",
    "logs": [
      {
        "timestamp": "ISO-8601",
        "level": "info",
        "source": "stdout",
        "message": "Model loaded successfully"
      }
    ],
    "moreAvailable": false
  }
}
```

## Enums & Constants

### Error Codes

| Range | Category | Examples |
|-------|----------|---------|
| 1xxx | Authentication | TOKEN_MISSING, TOKEN_INVALID, TOKEN_EXPIRED, NODE_NOT_FOUND, NODE_INACTIVE |
| 2xxx | Command | COMMAND_INVALID, GPU_NOT_AVAILABLE, INSUFFICIENT_MEMORY, CONTAINER_START_FAILED |
| 3xxx | System | INTERNAL_ERROR, TIMEOUT, RESOURCE_EXHAUSTED, NETWORK_ERROR |

### Priority

| Value | Description |
|-------|-------------|
| `low` | Background tasks |
| `normal` | Default |
| `high` | Urgent commands |

### Resource Types

`deployment`, `model`, `job`, `agent`, `container`, `system`, `node`
