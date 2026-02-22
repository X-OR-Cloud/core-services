# MONA Metrics Push

Node Agent gửi metrics trực tiếp đến MONA service qua REST API.

## Endpoint

```
POST /metrics/push/node
Host: <MONA_HOST>:<MONA_PORT>
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

- **Auth**: Dùng chung JWT token từ AIWM login (cùng JWT_SECRET)
- **Rate limit**: 1 request / 60 giây
- **Interval recommend**: 60 giây (hoặc theo `controllerInfo.metricsInterval`)

## Request Body

```json
{
  "nodeId": "699a418e3e8a035f1d16eac3",
  "timestamp": "2026-02-22T00:00:00.000Z",
  "interval": "1min",
  "cpu": {
    "usage": 45.8,
    "cores": 8,
    "loadAverage": [1.2, 1.5, 1.8],
    "sockets": 1,
    "coresPerSocket": 8,
    "threadsPerCore": 1,
    "details": [
      {
        "socketId": 0,
        "model": "Apple M2",
        "vendor": "Apple",
        "frequency": 3500,
        "cacheSize": 16384,
        "cores": 8,
        "usage": 45.8
      }
    ]
  },
  "memory": {
    "total": 17179869184,
    "used": 9000000000,
    "free": 8179869184,
    "cached": 2000000000
  },
  "disk": {
    "total": 494384795648,
    "used": 344384795648,
    "free": 150000000000,
    "readBytesPerSec": 5242880,
    "writeBytesPerSec": 2621440,
    "readOpsPerSec": 100,
    "writeOpsPerSec": 50
  },
  "network": {
    "rxBytesPerSec": 1048576,
    "txBytesPerSec": 524288,
    "interfaces": [
      {
        "name": "eth0",
        "type": "ethernet",
        "ipAddress": "10.8.0.5",
        "state": "up",
        "speed": 10000,
        "rxBytesPerSec": 1048576,
        "txBytesPerSec": 524288
      }
    ],
    "rxPacketsPerSec": 1000,
    "txPacketsPerSec": 800,
    "rxDropped": 0,
    "txDropped": 0
  },
  "gpu": [
    {
      "deviceId": "GPU-0",
      "model": "NVIDIA RTX 4090",
      "utilization": 85.5,
      "memoryUsed": 20000000000,
      "memoryTotal": 25769803776,
      "temperature": 72,
      "powerDraw": 250,
      "fanSpeed": 75
    }
  ],
  "status": "online",
  "websocketConnected": true,
  "uptime": 86400,
  "systemInfo": {
    "os": {
      "name": "Ubuntu",
      "version": "22.04",
      "kernel": "5.15.0",
      "platform": "linux"
    },
    "architecture": {
      "cpu": "x86_64",
      "bits": 64,
      "endianness": "LE"
    }
  }
}
```

## Field Reference

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `nodeId` | string | Node ID (MongoDB _id) |
| `timestamp` | string | ISO 8601 timestamp |
| `cpu` | object | CPU metrics |
| `cpu.usage` | number | CPU usage % (0-100) |
| `cpu.cores` | number | Số cores (>= 1) |
| `cpu.loadAverage` | [n, n, n] | Load average 1/5/15 min (đúng 3 phần tử) |
| `memory` | object | Memory metrics |
| `memory.total` | number | Tổng RAM (bytes) |
| `memory.used` | number | RAM đã dùng (bytes) |
| `memory.free` | number | RAM trống (bytes) |
| `memory.cached` | number | RAM cached (bytes) |
| `disk` | object | Disk metrics |
| `disk.total` | number | Tổng dung lượng (bytes) |
| `disk.used` | number | Đã dùng (bytes) |
| `disk.free` | number | Còn trống (bytes) |
| `disk.readBytesPerSec` | number | Tốc độ đọc (bytes/s) |
| `disk.writeBytesPerSec` | number | Tốc độ ghi (bytes/s) |
| `network` | object | Network metrics |
| `network.rxBytesPerSec` | number | Tốc độ nhận (bytes/s) |
| `network.txBytesPerSec` | number | Tốc độ gửi (bytes/s) |
| `status` | enum | `online`, `offline`, `maintenance` |
| `websocketConnected` | boolean | WebSocket đang kết nối |
| `uptime` | number | Thời gian uptime (giây) |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `interval` | enum | `1min`, `5min`, `15min`, `1h`, `1d` |
| `cpu.sockets` | number | Số CPU sockets |
| `cpu.coresPerSocket` | number | Cores mỗi socket |
| `cpu.threadsPerCore` | number | Threads mỗi core |
| `cpu.details[]` | array | Chi tiết từng CPU socket |
| `disk.readOpsPerSec` | number | IOPS đọc |
| `disk.writeOpsPerSec` | number | IOPS ghi |
| `network.interfaces[]` | array | Chi tiết từng network interface |
| `gpu[]` | array | GPU metrics (nếu có) |
| `systemInfo` | object | System info tĩnh (gửi lần đầu hoặc khi thay đổi) |

### GPU Fields (mỗi item trong `gpu[]`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `deviceId` | string | Yes | GPU device ID |
| `model` | string | Yes | Tên GPU |
| `utilization` | number | Yes | GPU usage % (0-100) |
| `memoryUsed` | number | Yes | VRAM đã dùng (bytes) |
| `memoryTotal` | number | Yes | Tổng VRAM (bytes) |
| `temperature` | number | Yes | Nhiệt độ (°C) |
| `powerDraw` | number | No | Công suất tiêu thụ (W) |
| `fanSpeed` | number | No | Tốc độ quạt % (0-100) |

## Response

**Success (201):**
```json
{
  "success": true,
  "message": "Node metrics received successfully",
  "data": {
    "metricId": "699a42c46ad024be93799d6a",
    "nodeId": "699a418e3e8a035f1d16eac3",
    "timestamp": "2026-02-22T00:00:00.000Z",
    "interval": "1min"
  }
}
```

**Error (429):** Rate limit exceeded (1 req/min).

**Error (401):** Token invalid hoặc expired.

## Query Metrics (Verify)

Sau khi push, có thể query lại để verify:

```
GET /metrics/nodes/<nodeId>?startTime=<ISO>&endTime=<ISO>
Authorization: Bearer <JWT_TOKEN>
```

Response trả về danh sách metrics đã lưu.
