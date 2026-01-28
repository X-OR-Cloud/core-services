# Node Schema Reference

**Version**: 2.0
**Date**: 2026-01-27

---

## Base Fields

| Field | Type | Required | Description | Example | Enum Values |
|-------|------|----------|-------------|---------|-------------|
| `_id` | ObjectId | Yes | Document ID | `"65a0000000000000000000001"` | - |
| `name` | string | Yes | Node display name | `"gpu-worker-01"` | - |
| `role` | string[] | Yes | Node roles | `["controller", "worker"]` | `controller`, `worker`, `proxy`, `storage` |
| `status` | string | Yes | Node status | `"online"` | `pending`, `installing`, `online`, `offline`, `maintenance` |
| `owner.userId` | ObjectId | Yes | Owner user ID | `"692ff5fa3371dad36b287ec4"` | - |
| `owner.orgId` | string | Yes | Organization ID | `"691eb9e6517f917943ae1f9d"` | - |
| `createdAt` | Date | Yes | Creation timestamp | `"2026-01-27T10:00:00Z"` | - |
| `updatedAt` | Date | Yes | Update timestamp | `"2026-01-27T10:00:00Z"` | - |
| `createdBy` | ObjectId | Yes | Creator user ID | `"692ff5fa3371dad36b287ec4"` | - |
| `updatedBy` | ObjectId | Yes | Last updater user ID | `"692ff5fa3371dad36b287ec4"` | - |
| `deletedAt` | Date | No | Deletion timestamp (soft delete) | `null` | - |
| `isDeleted` | boolean | Yes | Soft delete flag | `false` | - |
| `metadata` | object | No | Custom metadata | `{}` | - |

---

## Connection State

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `websocketConnected` | boolean | No | WebSocket connection status | `true` |
| `lastHeartbeat` | Date | No | Last heartbeat timestamp | `"2026-01-27T10:30:00Z"` |
| `lastMetricsAt` | Date | No | Last metrics received timestamp | `"2026-01-27T10:30:00Z"` |

---

## System Information (`systemInfo`)

### Operating System (`systemInfo.os`)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | string | OS name | `"Ubuntu"` |
| `version` | string | OS version | `"24.04.3 LTS"` |
| `kernel` | string | Kernel version | `"5.15.0-97-generic"` |
| `platform` | string | Platform architecture | `"x86_64"` |

### Architecture (`systemInfo.architecture`)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `cpu` | string | CPU architecture | `"x86_64"` |
| `bits` | number | Architecture bits | `64` |
| `endianness` | string | Byte order | `"LE"` |

### CPU (`systemInfo.hardware.cpu`)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `model` | string | CPU model name | `"Intel Xeon E7-8880 v4"` |
| `vendor` | string | CPU vendor | `"Intel"` |
| `sockets` | number | Number of CPU sockets | `2` |
| `coresPerSocket` | number | Cores per socket | `22` |
| `threadsPerCore` | number | Threads per core (HyperThreading) | `2` |
| `totalCores` | number | Total logical cores | `88` |
| `frequency` | number | Base frequency (MHz) | `2200` |
| `cacheSize` | number | Cache size (KB) | `55296` |
| `details` | array | Per-socket CPU details | See below |

**CPU Details Item**:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `socketId` | number | Socket index | `0` |
| `model` | string | CPU model | `"Intel Xeon E7-8880 v4"` |
| `vendor` | string | CPU vendor | `"Intel"` |
| `frequency` | number | Frequency (MHz) | `2200` |
| `cacheSize` | number | Cache size (KB) | `55296` |
| `cores` | number | Cores in this socket | `44` |

### Memory (`systemInfo.hardware.memory`)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `total` | number | Total RAM (bytes) | `137438953472` (128 GB) |

### Disk (`systemInfo.hardware.disk`)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `total` | number | Total disk space (bytes) | `1099511627776` (1 TB) |
| `devices` | array | Disk device array | See below |

**Disk Device Item**:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | string | Device name | `"/dev/sda1"` |
| `mountPoint` | string | Mount path | `"/"` |
| `total` | number | Device size (bytes) | `1099511627776` |
| `filesystem` | string | Filesystem type | `"ext4"` |

### Network (`systemInfo.hardware.network`)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `publicIp` | string | Public IP address | `"14.225.2.116"` |
| `clusterIp` | string | Internal cluster IP | `"10.10.2.111"` |
| `ports` | object | Service ports mapping | `{ "ssh": 22, "http": 80 }` |
| `interfaces` | array | Network interface array | See below |
| `connectivity` | object | Internet connectivity info | See below |

**Network Interface Item**:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | string | Interface name | `"eth0"` |
| `type` | string | Interface type | `"ethernet"` |
| `macAddress` | string | MAC address | `"00:1A:2B:3C:4D:5E"` |
| `ipAddress` | string | IPv4 address | `"10.10.2.111"` |
| `ipv6Address` | string | IPv6 address | `"fe80::21a:2bff:fe3c:4d5e"` |
| `netmask` | string | Network mask | `"255.255.255.0"` |
| `gateway` | string | Default gateway | `"10.10.2.1"` |
| `dns` | string[] | DNS servers | `["8.8.8.8", "8.8.4.4"]` |
| `mtu` | number | MTU size | `1500` |
| `speed` | number | Link speed (Mbps) | `10000` |
| `duplex` | string | Duplex mode | `"full"` |
| `state` | string | Interface state | `"UP"` |
| `isPrimary` | boolean | Is primary interface | `true` |
| `metric` | number | Route metric | `100` |
| `isVirtual` | boolean | Is virtual interface | `false` |
| `parentInterface` | string | Parent interface (if virtual) | `"eth0"` |
| `vlanId` | number | VLAN ID (if applicable) | `100` |
| `inboundPorts` | object | Inbound port mappings | `{ "http": 80 }` |

**Connectivity Object**:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `hasInternet` | boolean | Internet access status | `true` |
| `publicIpDetected` | string | Detected public IP | `"14.225.2.116"` |
| `lastChecked` | Date | Last connectivity check | `"2026-01-27T10:30:00Z"` |
| `reachableFrom` | string[] | Access sources | `["internet", "vpn"]` |

### GPU (`systemInfo.hardware.gpu`)

**Note**: Static GPU configuration only, not real-time metrics.

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `deviceId` | string | GPU device ID | `"0"` |
| `model` | string | GPU model name | `"NVIDIA Tesla P100"` |
| `vendor` | string | GPU vendor | `"NVIDIA"` |
| `memoryTotal` | number | VRAM size (bytes) | `16777216000` (16 GB) |
| `capabilities` | string[] | GPU capabilities | `["CUDA", "cuDNN", "TensorRT"]` |

### Container Runtime (`systemInfo.containerRuntime`)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `type` | string | Runtime type | `"Docker"` |
| `version` | string | Runtime version | `"28.5.1"` |
| `apiVersion` | string | API version | `"1.47"` |
| `storage.driver` | string | Storage driver | `"overlay2"` |
| `storage.filesystem` | string | Filesystem type | `"extfs"` |

### Virtualization (`systemInfo.virtualization`)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `type` | string | Hypervisor type | `"KVM"` |
| `role` | string | VM role | `"host"` or `"guest"` |

---

## Authentication

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `apiKey` | string | No | UUID-based API key for node authentication | `"a7b2c3d4-e5f6-4g7h-8i9j-0k1l2m3n4o5p"` |
| `secretHash` | string | No | Bcrypt hashed secret (never returned in API) | `"$2b$10$..."` |
| `lastAuthAt` | Date | No | Last authentication timestamp | `"2026-01-27T10:30:00Z"` |

**⚠️ Security Notes**:
- `secretHash` is NEVER returned in API responses
- Plain `secret` is shown ONLY ONCE during credential generation/regeneration
- Use `POST /nodes/:id/regenerate-credentials` to rotate credentials

---

## Token Management (Legacy)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `tokenMetadata.tokenGeneratedAt` | Date | Token generation time | `"2026-01-27T10:00:00Z"` |
| `tokenMetadata.tokenExpiresAt` | Date | Token expiration time | `"2027-01-27T10:00:00Z"` |
| `tokenMetadata.tokenLastUsed` | Date | Last token usage time | `"2026-01-27T10:30:00Z"` |

---

## Deprecated Fields (Backward Compatibility)

Use `systemInfo.*` instead. These fields are kept for backward compatibility only.

| Deprecated Field | Replacement | Type | Example |
|------------------|-------------|------|---------|
| `gpuDevices` | `systemInfo.hardware.gpu` | array | `[{deviceId: "0", model: "Tesla P100", ...}]` |
| `cpuCores` | `systemInfo.hardware.cpu.totalCores` | number | `88` |
| `cpuModel` | `systemInfo.hardware.cpu.model` | string | `"Intel Xeon E7-8880 v4"` |
| `cpuUsage` | Use MetricData collection | number | `45.5` |
| `ramTotal` | `systemInfo.hardware.memory.total` | number | `128000` (MB) |
| `ramFree` | Use MetricData collection | number | `64000` (MB) |
| `ramUsage` | Use MetricData collection | number | `50` (%) |
| `diskTotal` | `systemInfo.hardware.disk.total` | number | `730000` (MB) |
| `hostname` | `systemInfo.os.name` | string | `"multi-gpu-controller-001"` |
| `ipAddress` | `systemInfo.hardware.network.clusterIp` | string | `"10.10.2.111"` |
| `publicIpAddress` | `systemInfo.hardware.network.publicIp` | string | `"14.225.2.116"` |
| `os` | `systemInfo.os.*` | string | `"Ubuntu 24.04.3 LTS"` |
| `containerRuntime` | `systemInfo.containerRuntime.*` | string | `"Docker 28.5.1"` |
| `daemonVersion` | Keep as is | string | `"1.0.0"` |
| `lastSeenAt` | Use `lastHeartbeat` | Date | `"2026-01-27T10:30:00Z"` |
| `uptimeSeconds` | Use MetricData collection | number | `1209600` |
| `isLocal` | REMOVED | boolean | - |

---

## API Endpoints

### List Nodes
```
GET /nodes?page=1&limit=10&status=online
```

### Get Node by ID
```
GET /nodes/:id
```

### Regenerate Credentials (Organization Owner Only)
```
POST /nodes/:id/regenerate-credentials
Authorization: Bearer <org-owner-jwt-token>
```

**Permission**: Only organization owner can regenerate credentials for nodes in their organization.

**Response**:
```json
{
  "nodeId": "65a0000000000000000000001",
  "credentials": {
    "apiKey": "a7b2c3d4-e5f6-4g7h-8i9j-0k1l2m3n4o5p",
    "secret": "b8c3d4e5-f6g7-5h8i-9j0k-1l2m3n4o5p6q"
  },
  "warning": "Secret shown only ONCE. Save it now!"
}
```

---

## Conversion Helpers

```typescript
// Convert bytes to GB
const totalGB = Math.round(bytes / (1024 ** 3));

// Convert MB to GB
const totalGB = Math.round(mb / 1024);

// Check if node is online (heartbeat within 5 minutes)
const isOnline = (Date.now() - new Date(lastHeartbeat).getTime()) < 5 * 60 * 1000;
```
