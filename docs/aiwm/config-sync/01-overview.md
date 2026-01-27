# Config Sync - Node System Configuration Synchronization

**Feature**: Automatic detection and manual synchronization of Node system configuration changes

**Version**: 1.0
**Date**: 2026-01-27
**Status**: Design

---

## 📋 Overview

Tính năng **Config Sync** cho phép hệ thống tự động phát hiện sự thay đổi cấu hình phần cứng của Node (CPU, RAM, GPU, disk, network) và cung cấp công cụ để admin đồng bộ cấu hình một cách an toàn.

### **Problem Statement**

Khi Node hoạt động, cấu hình phần cứng có thể thay đổi do:
- ✅ **Hardware upgrade** - Admin nâng cấp RAM, thêm GPU, thay CPU
- ⚠️ **Detection error** - Lần đầu detect sai, lần sau mới đúng
- ⚠️ **Dynamic changes** - Hotplug GPU, memory balloon (VM), hotplug network interface
- ❌ **Metric collection bug** - Code metric bị lỗi báo sai thông tin

Hiện tại:
- `Node.systemInfo` = Static baseline (set khi register, ít thay đổi)
- `MetricData.systemInfo` = Current reality (dynamic, từ metrics gửi về)

**Vấn đề**: Khi 2 cái khác nhau → Không biết nên tin cái nào?

---

## 🎯 Goals

1. ✅ **Detect config drift** - Tự động phát hiện khi `Node.systemInfo` khác `MetricData.systemInfo`
2. ✅ **Alert admin** - Thông báo khi có sự thay đổi cấu hình
3. ✅ **Manual sync** - Cung cấp API để admin review và sync config
4. ✅ **Audit trail** - Log đầy đủ mọi thay đổi cấu hình
5. ❌ **NO auto-sync** - Không tự động update (tránh bug metric làm hỏng data)

---

## 🏗️ Architecture

### **Data Flow**

```
┌─────────────┐
│   Worker    │
│   (Node)    │
└──────┬──────┘
       │ Push metrics every 1min
       │ (includes systemInfo)
       ▼
┌─────────────────────┐
│  MONA Service       │
│  /metrics/nodes API │ ◄─── AIWM calls this API
└──────┬──────────────┘
       │ Store in MetricData collection
       │
       ▼
┌─────────────────────┐
│  AIWM Service       │
│  Node Module        │
└──────┬──────────────┘
       │
       ├─── 1. Fetch latest metric from MONA
       │
       ├─── 2. Compare with Node.systemInfo
       │
       ├─── 3. If drift detected → Create alert
       │
       └─── 4. Admin can sync via API
```

### **Components**

1. **MONA Service** (Metrics & Monitoring)
   - Receives metrics from worker nodes
   - Stores in `MetricData` collection
   - Provides API: `GET /metrics/nodes/:nodeId/latest`

2. **AIWM Service** (Node Management)
   - Stores `Node.systemInfo` (baseline)
   - Calls MONA API to check for drift
   - Provides sync API: `POST /nodes/:id/sync-config`
   - Creates alerts when drift detected

3. **Worker (hydra-worker)**
   - Pushes metrics to MONA every 1 minute
   - Includes current `systemInfo` in payload

---

## 📊 Config Drift Detection

### **Fields to Monitor**

```typescript
interface ConfigDrift {
  hasChanges: boolean;
  changes: Array<{
    field: string;        // 'cpu.totalCores', 'memory.total', 'gpu.count'
    baseline: any;        // Value in Node.systemInfo
    current: any;         // Value in latest metric
    severity: string;     // 'critical' | 'warning' | 'info'
  }>;
  timestamp: Date;
}
```

### **Monitored Fields**

| Field | Severity | Description |
|-------|----------|-------------|
| `cpu.totalCores` | Critical | CPU core count changed |
| `cpu.model` | Warning | CPU model changed (upgrade/replace) |
| `memory.total` | Critical | Total RAM changed |
| `disk.total` | Warning | Total disk space changed |
| `gpu.length` | Critical | GPU count changed (add/remove) |
| `gpu[].model` | Warning | GPU model changed |
| `network.publicIp` | Info | Public IP changed |
| `network.clusterIp` | Warning | Cluster IP changed |

---

## 🔄 Sync Workflow

### **Step 1: Detection**

```typescript
// AIWM calls MONA API to get latest metric
const latestMetric = await monaClient.get(`/metrics/nodes/${nodeId}/latest`);

// Compare with Node.systemInfo
const drift = detectConfigDrift(node.systemInfo, latestMetric.systemInfo);

if (drift.hasChanges) {
  // Create alert
  await alertService.create({
    type: 'config-drift',
    severity: 'warning',
    nodeId,
    message: `Hardware config changed on node ${node.name}`,
    details: drift,
  });
}
```

### **Step 2: Admin Review**

Admin receives alert in dashboard:

```
⚠️ Config Drift Detected on "gpu-worker-01"

Changes:
  - CPU cores: 32 → 64 (doubled!)
  - RAM: 128GB → 256GB (upgraded)
  - GPU count: 2 → 3 (added GPU-2)

Last detected: 5 minutes ago
Source: Latest metric from MONA

[Review Details] [Sync Config] [Dismiss]
```

### **Step 3: Manual Sync**

Admin clicks "Sync Config" → AIWM calls:

```bash
POST /nodes/:id/sync-config

Response:
{
  "success": true,
  "message": "Node config synced from latest metrics",
  "changes": [
    { "field": "cpu.totalCores", "baseline": 32, "current": 64 },
    { "field": "memory.total", "baseline": 137438953472, "current": 274877906944 }
  ],
  "syncedAt": "2026-01-27T10:30:00Z",
  "syncedBy": "user_admin_01"
}
```

---

## 🔌 API Integration

### **MONA Service API**

AIWM sẽ gọi API này để lấy metric mới nhất:

```typescript
// MONA endpoint
GET /metrics/nodes/:nodeId/latest?interval=1min

Response:
{
  "nodeId": "node_001",
  "timestamp": "2026-01-27T10:00:00Z",
  "interval": "1min",
  "systemInfo": {
    "os": { "name": "Ubuntu", "version": "22.04 LTS" },
    "hardware": {
      "cpu": { "totalCores": 64, "model": "Intel Xeon Platinum 8380" },
      "memory": { "total": 274877906944 },
      "gpu": [
        { "deviceId": "GPU-0", "model": "NVIDIA A100 80GB" },
        { "deviceId": "GPU-1", "model": "NVIDIA A100 80GB" },
        { "deviceId": "GPU-2", "model": "NVIDIA A100 80GB" }
      ]
    }
  }
}
```

### **AIWM Service API**

Cung cấp cho frontend/admin:

```typescript
// Check drift status
GET /nodes/:id/config-drift

Response:
{
  "nodeId": "node_001",
  "hasChanges": true,
  "changes": [
    { "field": "cpu.totalCores", "baseline": 32, "current": 64, "severity": "critical" },
    { "field": "memory.total", "baseline": 137438953472, "current": 274877906944, "severity": "critical" }
  ],
  "lastChecked": "2026-01-27T10:00:00Z"
}

// Sync config
POST /nodes/:id/sync-config

Response:
{
  "success": true,
  "message": "Node config synced from latest metrics",
  "changes": [...],
  "syncedAt": "2026-01-27T10:30:00Z",
  "syncedBy": "user_admin_01"
}
```

---

## 🛡️ Safety Mechanisms

### **1. Manual Approval Required**

- ❌ **NO auto-sync** - Tránh bug metric làm hỏng data
- ✅ Admin must review and approve changes
- ✅ Show clear diff before sync

### **2. Audit Trail**

```typescript
// Log every config sync
{
  "action": "config-sync",
  "nodeId": "node_001",
  "nodeName": "gpu-worker-01",
  "changes": [...],
  "syncedBy": "user_admin_01",
  "syncedAt": "2026-01-27T10:30:00Z",
  "source": "mona-metric",
  "metricTimestamp": "2026-01-27T10:00:00Z"
}
```

### **3. Rollback Support**

- Store previous `systemInfo` before sync
- Allow rollback if sync was mistake

```typescript
// Rollback API
POST /nodes/:id/rollback-config

Body:
{
  "rollbackTo": "2026-01-27T09:00:00Z" // Timestamp of previous config
}
```

---

## 📈 Use Cases

### **UC1: Hardware Upgrade**

**Scenario**: Admin nâng cấp RAM từ 128GB → 256GB

1. Worker detects new RAM, pushes metric to MONA
2. AIWM calls MONA API, detects drift
3. Alert: "RAM upgraded: 128GB → 256GB"
4. Admin clicks "Sync Config"
5. `Node.systemInfo.hardware.memory.total` updated
6. Alert dismissed

### **UC2: False Positive (Metric Bug)**

**Scenario**: Metric code bị bug, báo sai CPU cores

1. Worker pushes metric với CPU cores = 128 (sai, thực tế là 64)
2. AIWM detects drift: "CPU cores: 64 → 128"
3. Admin reviews: "Hmm, không có nâng cấp CPU gì cả?"
4. Admin clicks "Dismiss" (không sync)
5. Alert dismissed, `Node.systemInfo` giữ nguyên

### **UC3: GPU Hotplug**

**Scenario**: Admin hotplug thêm GPU-2

1. Worker detects new GPU, pushes metric
2. AIWM detects drift: "GPU count: 2 → 3"
3. Admin verifies: "Đúng rồi, vừa cắm thêm GPU"
4. Admin clicks "Sync Config"
5. `Node.systemInfo.hardware.gpu` updated với GPU-2

---

## 🚀 Implementation Plan

### **Phase 1: MONA API (Prerequisites)**

- [ ] MONA service implements `GET /metrics/nodes/:nodeId/latest`
- [ ] MONA service stores `systemInfo` in each metric snapshot
- [ ] Test MONA API với sample data

### **Phase 2: Drift Detection (AIWM)**

- [ ] Implement `detectConfigDrift()` function
- [ ] Integrate with MONA API client
- [ ] Create alerts when drift detected
- [ ] Add periodic drift check job (every 5 minutes)

### **Phase 3: Sync API (AIWM)**

- [ ] Implement `POST /nodes/:id/sync-config`
- [ ] Implement `GET /nodes/:id/config-drift`
- [ ] Add audit logging
- [ ] Add rollback support

### **Phase 4: Frontend Integration**

- [ ] Alert component for config drift
- [ ] Config diff viewer
- [ ] Sync/Dismiss buttons
- [ ] Audit log viewer

---

## 📝 Technical Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| **Auto-sync** | ❌ NO | Too risky, prefer manual review |
| **Metric source** | MONA service | Separation of concerns |
| **Drift check frequency** | Every 5 minutes | Balance freshness vs load |
| **Alert severity** | Warning | Not critical, needs review |
| **Rollback support** | ✅ YES | Safety mechanism |

---

## 🔗 Related Documents

- [Node Schema Design](../node-schema-upgrade.md)
- [MetricData Schema](../metric-features/02-schema-design.md)
- [MONA Service Integration](../mona-integration.md)

---

## 📊 Metrics & Monitoring

**Success Metrics**:
- Number of drift detections per day
- Sync success rate
- False positive rate (dismissed alerts)
- Average time from detection to sync

**Monitoring**:
- Alert on repeated drift (possible metric bug)
- Alert on failed MONA API calls
- Track sync audit logs
