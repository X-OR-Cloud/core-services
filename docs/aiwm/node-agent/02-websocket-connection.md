# WebSocket Connection

## Connection Setup

- **Protocol**: Socket.IO (not raw WebSocket)
- **Namespace**: `/ws/node`
- **Transport**: `websocket` (preferred), fallback `polling`
- **Auth**: JWT token trong `auth.token`

```
URL:  ws://<AIWM_HOST>:<PORT>/ws/node
Auth: { token: "<JWT_TOKEN>" }
```

## Connection Flow

### Step 1: Connect

Kết nối Socket.IO với JWT token:

```
Connect → Server verifies JWT → handleConnection()
```

**JWT errors (disconnect ngay lập tức):**

| Error | Meaning |
|-------|---------|
| `TOKEN_MISSING` | Không có token trong handshake |
| `TOKEN_INVALID` | Token không hợp lệ |
| `TOKEN_EXPIRED` | Token đã hết hạn |

### Step 2: Receive `connection.ack`

Sau khi connect thành công, server gửi `connection.ack`:

**Success:**
```json
{
  "type": "connection.ack",
  "messageId": "uuid",
  "timestamp": "2026-02-22T00:00:00.000Z",
  "status": "success",
  "nodeId": "699a418e3e8a035f1d16eac3",
  "controllerId": "controller-main",
  "serverVersion": "1.0.0"
}
```

**Error:**
```json
{
  "type": "connection.ack",
  "messageId": "uuid",
  "timestamp": "2026-02-22T00:00:00.000Z",
  "status": "error",
  "error": {
    "code": "NODE_NOT_FOUND",
    "message": "Node ID not found in database",
    "timestamp": "2026-02-22T00:00:00.000Z"
  }
}
```

**Error codes:**

| Code | Description |
|------|-------------|
| `NODE_NOT_FOUND` | Node không tồn tại trong DB |
| `NODE_INACTIVE` | Node bị disabled (status = inactive hoặc banned) |
| `INTERNAL_ERROR` | Lỗi server |

### Step 3: Node Register (Optional)

Gửi thông tin hardware specs của node. Không bắt buộc trong flow connect, chỉ gửi khi:
- Lần đầu kết nối
- Hardware thay đổi (thêm GPU, thay RAM, etc.)

**Event**: `node.register`

**Request:**
```json
{
  "type": "node.register",
  "messageId": "uuid",
  "timestamp": "2026-02-22T00:00:00.000Z",
  "data": {
    "systemInfo": {
      "os": {
        "name": "Ubuntu",
        "version": "22.04",
        "kernel": "5.15.0-91-generic",
        "arch": "x86_64"
      },
      "architecture": {
        "platform": "linux",
        "arch": "x86_64",
        "containerRuntime": null
      },
      "hardware": {
        "cpu": {
          "model": "Intel Xeon Gold 6348",
          "cores": 32,
          "threads": 64,
          "details": [
            { "model": "Intel Xeon Gold 6348", "cores": 32, "threads": 64, "clockSpeed": 2600 }
          ]
        },
        "memory": {
          "total": 137438953472,
          "available": 120000000000
        },
        "disk": {
          "total": 2199023255552,
          "available": 1800000000000,
          "devices": [
            { "name": "nvme0n1", "type": "nvme", "total": 2199023255552, "available": 1800000000000 }
          ]
        },
        "network": {
          "hostname": "gpu-node-01",
          "privateIp": "10.8.0.5",
          "publicIp": "203.0.113.45",
          "interfaces": [
            { "name": "eth0", "type": "ethernet", "ipAddress": "10.8.0.5", "speed": 10000 }
          ],
          "connectivity": {
            "internetAccess": true,
            "reachableFrom": ["lan", "vpn"]
          }
        },
        "gpu": [
          {
            "deviceId": "0",
            "model": "NVIDIA RTX 4090",
            "vendor": "NVIDIA",
            "memoryTotal": 25769803776,
            "capabilities": ["cuda-12.2", "tensor-cores"]
          }
        ]
      }
    }
  }
}
```

**Response** (`register.ack`):
```json
{
  "type": "register.ack",
  "messageId": "uuid",
  "timestamp": "2026-02-22T00:00:00.000Z",
  "data": {
    "status": "success",
    "nodeId": "699a418e3e8a035f1d16eac3",
    "registeredAt": "2026-02-22T00:00:00.000Z",
    "controllerInfo": {
      "controllerId": "controller-main",
      "heartbeatInterval": 30000,
      "metricsInterval": 60000,
      "timezone": "UTC"
    },
    "pendingCommands": []
  }
}
```

**Lưu ý**: `controllerInfo.heartbeatInterval` và `metricsInterval` (ms) dùng để configure các loop.

## Heartbeat

Gửi heartbeat định kỳ để báo node còn sống.

**Event**: `telemetry.heartbeat`

```json
{
  "type": "telemetry.heartbeat",
  "messageId": "uuid",
  "timestamp": "2026-02-22T00:05:00.000Z",
  "data": {
    "nodeId": "699a418e3e8a035f1d16eac3",
    "status": "online",
    "uptimeSeconds": 86400,
    "activeDeployments": 2,
    "cpuUsage": 45.8,
    "ramUsage": 68.5,
    "gpuStatus": [
      {
        "deviceId": "0",
        "utilization": 85.5,
        "status": "active"
      }
    ]
  }
}
```

- **Interval**: 30 giây (hoặc theo `controllerInfo.heartbeatInterval`)
- **Fire-and-forget**: Không có response
- Server cập nhật `lastHeartbeat` và trạng thái node

## Disconnect

Khi node disconnect (intentional hoặc mất kết nối):

1. Server tự detect qua Socket.IO disconnect event
2. Node bị remove khỏi connection tracking
3. Node status cập nhật thành `offline`

**Reconnect strategy:**
1. Token còn hạn → reconnect trực tiếp với token cũ
2. Token hết hạn < 5min → refresh token → reconnect
3. Token hết hạn > 5min → re-login → reconnect
4. Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (max)

## State Changes

| Event | Node Status | lastHeartbeat |
|-------|-------------|---------------|
| Connect thành công | `online` | Set to now |
| Heartbeat | Giữ nguyên hoặc update | Set to now |
| Disconnect | `offline` | Giữ nguyên |
| Register | Giữ nguyên | Không thay đổi |
