# Metrics Module - Changelog v2.0

**Date**: 2026-01-14
**Status**: Schema Updates Approved

---

## 🎯 Summary of Changes

Based on feedback from Anh Dzung, the following changes have been made to the Metrics Module design:

### ✅ 1. Field Name Changes

| Old Name | New Name | Reason |
|----------|----------|--------|
| `metricType` | `type` | Shorter, cleaner, still semantic |

**Impact**: All references to `metricType` changed to `type` across:
- Schema definitions
- API endpoints
- Query parameters
- Code examples
- Index definitions

---

### ✅ 2. Schema Structure Changes

#### Before (v1.0):
```typescript
class MetricSnapshot {
  metricType: string;

  // Separate optional objects per type
  node?: {
    cpu: { ... },
    memory: { ... },
    // ...
  };
  resource?: { ... };
  deployment?: { ... };
  system?: { ... };
}
```

#### After (v2.0):
```typescript
class MetricSnapshot {
  type: string; // 'node' | 'resource' | 'deployment' | 'system'

  // Single consolidated metrics object
  metrics: {
    // Structure depends on 'type'
    cpu?: { ... },
    memory?: { ... },
    // ...
  };
}
```

**Benefits**:
- ✅ Cleaner schema structure
- ✅ Consistent query paths: `metrics.cpu.usage` thay vì `node.cpu.usage`
- ✅ Easier to extend với new metric types
- ✅ Flexible schema validation per type

---

### ✅ 3. Enhanced CPU Schema

#### New Fields Added:

```typescript
cpu: {
  // Existing (unchanged)
  usage: number;
  cores: number;
  loadAverage: [number, number, number];

  // NEW: CPU topology
  sockets?: number;
  coresPerSocket?: number;
  threadsPerCore?: number;

  // NEW: Detailed CPU info per socket
  details?: Array<{
    socketId: number;
    model: string;           // e.g., "Intel Xeon Gold 6348"
    vendor: string;          // e.g., "Intel", "AMD"
    frequency: number;       // MHz
    cacheSize?: number;      // L3 cache in KB
    cores: number;
    usage?: number;          // Per-socket usage if available
  }>;
}
```

**Use Cases**:
- Track multi-socket server performance
- Identify per-socket hotspots
- CPU model identification for inventory
- Architecture-aware resource allocation

---

### ✅ 4. Enhanced Network Schema

#### New Fields Added:

```typescript
network: {
  // Existing aggregated metrics (unchanged)
  rxBytesPerSec: number;
  txBytesPerSec: number;

  // NEW: Detailed per-interface metrics
  interfaces?: Array<{
    name: string;            // e.g., "eth0", "docker0"
    type: string;            // "ethernet", "wifi", "bridge", "vpn"

    // NEW: IP addressing
    ipAddress?: string;      // Local IP: "192.168.1.100"
    ipv6Address?: string;    // IPv6: "fe80::1"
    macAddress?: string;     // MAC: "00:1B:44:11:3A:B7"
    publicIp?: string;       // Public IP: "203.0.113.45"
    netmask?: string;        // "255.255.255.0"
    gateway?: string;        // "192.168.1.1"

    // NEW: Interface details
    mtu?: number;            // 1500
    speed?: number;          // Link speed in Mbps
    duplex?: string;         // "full" | "half"
    state: string;           // "up" | "down"

    // Per-interface traffic
    rxBytesPerSec: number;
    txBytesPerSec: number;
  }>;
}
```

**Use Cases**:
- Track public IP changes for dynamic IPs
- Monitor per-interface bandwidth usage
- Network topology mapping
- Identify network bottlenecks per interface
- Multi-homed server monitoring

---

### ✅ 5. New Top-Level Field: systemInfo

#### Complete System Information:

```typescript
systemInfo?: {
  os: {
    name: string;            // "Ubuntu", "CentOS"
    version: string;         // "22.04 LTS"
    kernel: string;          // "5.15.0-91-generic"
    platform: string;        // "linux", "darwin", "win32"
  };

  architecture: {
    cpu: string;             // "x86_64", "aarch64", "arm64"
    bits: number;            // 32 or 64
    endianness: string;      // "LE" or "BE"
  };

  containerRuntime?: {
    type: string;            // "docker", "containerd", "podman"
    version: string;         // "24.0.7"
    apiVersion?: string;     // "1.43"
    storage: {
      driver: string;        // "overlay2", "btrfs"
      filesystem: string;    // "ext4", "xfs"
    };
  };

  virtualization?: {
    type: string;            // "kvm", "vmware", "hyperv", "none"
    role: string;            // "host" or "guest"
  };
}
```

**Use Cases**:
- Platform inventory management
- Architecture-specific optimizations (ARM vs x86)
- Container runtime compatibility checks
- OS version tracking for security patches
- Virtualization layer detection

---

### ✅ 6. Timestamp Handling Clarification

**In MongoDB**:
- Store as `Date` type (native MongoDB type)
- Enables TTL indexes
- Efficient range queries

**In API Response**:
- Expose **multiple formats** for convenience:

```typescript
{
  timestamp: 1705234800000,                    // Unix milliseconds
  timestampIso: "2026-01-14T10:00:00.000Z",   // ISO 8601 string
  timestampReadable: "1/14/2026, 10:00:00 AM" // Human-readable (optional)
}
```

**Benefits**:
- ✅ Best of both worlds: DB efficiency + API flexibility
- ✅ No client-side conversion needed
- ✅ Time zone handling clear (always UTC)

---

## 📊 Impact Assessment

### Files Updated

✅ **Already Updated**:
1. `02-schema-design.md` - Complete rewrite với v2.0

⏳ **Need Updates** (High Priority):
2. `03-api-design.md` - Update all DTOs với new field names
3. `04-aggregation-strategy.md` - Update aggregation logic references
4. `05-implementation-plan.md` - Update implementation tasks
5. `example-data.md` - Update all payload examples

⏳ **Need Updates** (Low Priority):
6. `01-overview.md` - Update architecture diagrams if needed
7. `README.md` - Add v2.0 changelog summary

---

## 🔄 Migration Path

### For Implementers

**If starting fresh (no existing data)**:
- ✅ Use v2.0 schema directly
- ✅ No migration needed

**If v1.0 already implemented**:
```typescript
// Migration script needed
db.metrics.updateMany(
  { metricType: { $exists: true } },
  [
    {
      $set: {
        type: '$metricType',
        metrics: {
          $switch: {
            branches: [
              { case: { $eq: ['$metricType', 'node'] }, then: '$node' },
              { case: { $eq: ['$metricType', 'resource'] }, then: '$resource' },
              { case: { $eq: ['$metricType', 'deployment'] }, then: '$deployment' },
              { case: { $eq: ['$metricType', 'system'] }, then: '$system' }
            ]
          }
        }
      }
    },
    {
      $unset: ['metricType', 'node', 'resource', 'deployment', 'system']
    }
  ]
);
```

---

## 📝 API Contract Changes

### Before (v1.0):
```json
{
  "metricType": "node",
  "node": {
    "cpu": { "usage": 50 }
  }
}
```

### After (v2.0):
```json
{
  "type": "node",
  "metrics": {
    "cpu": { "usage": 50 }
  }
}
```

### Query Changes:
```javascript
// Before
db.metrics.find({ metricType: 'node', 'node.cpu.usage': { $gt: 80 } })

// After
db.metrics.find({ type: 'node', 'metrics.cpu.usage': { $gt: 80 } })
```

---

## 💾 Storage Impact

### Size Estimates Updated

**v2.0 with Enhanced Fields**:
- Node (minimal): ~2 KB → **~2.5 KB** (+25% for systemInfo)
- Node (full): ~4 KB → **~5 KB** (+25% for multi-socket + network details)

**100 nodes projection**:
- v1.0: ~8.3 GB stable
- v2.0: ~**10 GB stable** (+20%)

**Acceptable because**:
- Enhanced monitoring capabilities worth the cost
- systemInfo is mostly static (compressed well)
- Multi-socket data only for relevant servers

---

## ✅ Testing Requirements

### Schema Validation Tests
```typescript
describe('MetricSnapshot v2.0 Schema', () => {
  it('should validate type field (renamed from metricType)', () => {
    const metric = new MetricSnapshot({ type: 'node', ... });
    expect(metric.type).toBe('node');
  });

  it('should store metrics in consolidated metrics object', () => {
    const metric = new MetricSnapshot({
      type: 'node',
      metrics: { cpu: { usage: 50 } }
    });
    expect(metric.metrics.cpu.usage).toBe(50);
  });

  it('should support multi-socket CPU data', () => {
    const metric = new MetricSnapshot({
      type: 'node',
      metrics: {
        cpu: {
          sockets: 2,
          details: [
            { socketId: 0, model: 'Intel Xeon' },
            { socketId: 1, model: 'Intel Xeon' }
          ]
        }
      }
    });
    expect(metric.metrics.cpu.details).toHaveLength(2);
  });

  it('should support network interface details', () => {
    const metric = new MetricSnapshot({
      type: 'node',
      metrics: {
        network: {
          interfaces: [
            { name: 'eth0', ipAddress: '192.168.1.100', publicIp: '203.0.113.45' }
          ]
        }
      }
    });
    expect(metric.metrics.network.interfaces[0].publicIp).toBe('203.0.113.45');
  });

  it('should include systemInfo for node metrics', () => {
    const metric = new MetricSnapshot({
      type: 'node',
      systemInfo: {
        os: { name: 'Ubuntu', version: '22.04' },
        architecture: { cpu: 'x86_64', bits: 64 }
      },
      metrics: { ... }
    });
    expect(metric.systemInfo.architecture.cpu).toBe('x86_64');
  });
});
```

---

## 🚀 Next Steps

### Immediate Actions:
1. ✅ Review and approve this changelog
2. ⏳ Update remaining documentation files (03, 04, 05, example-data)
3. ⏳ Update implementation plan với new DTOs
4. ⏳ Create example payloads for new schema

### Before Implementation:
- [ ] Finalize all documentation updates
- [ ] Get stakeholder sign-off
- [ ] Create migration script (if v1.0 exists)
- [ ] Update test suites

---

## 📞 Questions & Feedback

**For Anh Dzung**:
1. ✅ Schema structure changes OK?
2. ✅ Enhanced CPU/Network fields sufficient?
3. ✅ systemInfo placement OK (top-level vs inside metrics)?
4. ⏳ Any additional fields needed?
5. ⏳ Ready to proceed với updating remaining docs?

---

**Version History**:
- v1.0 (2026-01-14): Initial design
- v2.0 (2026-01-14): Schema enhancements based on feedback

**Status**: ✅ v2.0 Schema Approved - Documentation Updates In Progress
