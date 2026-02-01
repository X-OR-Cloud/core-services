# SYS - System Service

> System Infrastructure Service - Quản lý cấu hình, secrets và audit log cho toàn bộ hệ thống

**Port:** 3007

---

## Tổng quan

SYS là service cung cấp các chức năng infrastructure-level cho toàn bộ hệ thống Hydra Services. Đây là nơi tập trung quản lý các thành phần dùng chung mà tất cả services khác đều cần.

```
┌─────────────────────────────────────────────────────┐
│                    SYS Service                       │
│              (System Infrastructure)                 │
├───────────────┬───────────────┬─────────────────────┤
│    Configs    │    Secrets    │     Audit Log       │
│  Management   │  Management   │   (Centralized)     │
├───────────────┴───────────────┴─────────────────────┤
│              Service Registry (Future)               │
└─────────────────────────────────────────────────────┘
```

---

## Modules

### 1. Config Management

Quản lý cấu hình tập trung cho tất cả services.

**Entities:**
- **Config** - Lưu trữ cấu hình theo service/environment

**Features:**
- CRUD configs theo service
- Environment-specific (dev/staging/prod)
- Hot reload notification qua Redis pub/sub
- Config versioning & rollback
- Config validation schema

**Ví dụ use case:**
- AIWM cần config `MAX_CONCURRENT_JOBS=10`
- CBM cần config `DOCUMENT_RETENTION_DAYS=365`

---

### 2. Secret Management

Quản lý secrets/credentials được mã hóa.

**Entities:**
- **Secret** - Lưu trữ secrets đã encrypt

**Features:**
- AES-256 encryption at rest
- Secret rotation support
- Access audit logging
- Expiration & auto-rotation policies
- Masking trong API responses

**Ví dụ use case:**
- API keys cho external services (OpenAI, AWS)
- Database credentials
- JWT signing keys

---

### 3. Audit Log (Centralized)

Thu thập và lưu trữ audit log từ tất cả services.

**Entities:**
- **AuditLog** - Lưu trữ audit events

**Features:**
- Receive audit events từ các services khác (qua Redis queue)
- Structured logging với correlation ID
- Search & filter theo service, user, action, time range
- Retention policies
- Export to external systems (future)

**Audit Event Structure:**
```typescript
{
  service: string;       // "iam", "aiwm", "cbm"
  action: string;        // "user.create", "document.delete"
  actor: {
    userId: string;
    orgId: string;
  };
  target: {
    type: string;        // "user", "document"
    id: string;
  };
  changes: object;       // Before/after diff
  metadata: object;      // Request context
  correlationId: string;
  timestamp: Date;
}
```

---

### 4. Service Registry (Future)

Service discovery và health aggregation.

**Features (Planned):**
- Service registration & heartbeat
- Health status aggregation
- Service dependency mapping
- Load balancer integration

---

## API Endpoints (Draft)

### Config Management
```
POST   /configs                    # Create config
GET    /configs                    # List all configs (paginated)
GET    /configs/:id                # Get config by ID
PATCH  /configs/:id                # Update config
DELETE /configs/:id                # Soft delete config
GET    /configs/service/:name      # Get all configs for a service
POST   /configs/reload/:service    # Trigger config reload
```

### Secret Management
```
POST   /secrets                    # Create secret
GET    /secrets                    # List secrets (masked values)
GET    /secrets/:id                # Get secret (masked)
PATCH  /secrets/:id                # Update secret
DELETE /secrets/:id                # Soft delete secret
GET    /secrets/service/:name      # Get secrets for a service
POST   /secrets/:id/rotate         # Rotate secret value
```

### Audit Log
```
GET    /audit-logs                 # Search audit logs (paginated)
GET    /audit-logs/:id             # Get audit log detail
GET    /audit-logs/stats           # Aggregated statistics
POST   /audit-logs/export          # Export to file (async)
```

---

## Integration Pattern

### Services lấy config/secret

```typescript
// Option 1: HTTP call khi startup
const configs = await fetch('http://sys:3007/configs/service/aiwm');

// Option 2: Redis cache + pub/sub for hot reload
redis.subscribe('sys:config:aiwm', (newConfig) => {
  applyConfig(newConfig);
});
```

### Services gửi audit log

```typescript
// Push to Redis queue - SYS worker sẽ consume
await redis.lpush('sys:audit-logs', JSON.stringify({
  service: 'aiwm',
  action: 'agent.create',
  actor: { userId, orgId },
  target: { type: 'agent', id: agentId },
  changes: { name: 'New Agent' },
  correlationId: req.correlationId,
}));
```

---

## Phân biệt với các service khác

| Service | Scope | Ví dụ |
|---------|-------|-------|
| **SYS** | System Infrastructure | Configs, Secrets, Audit |
| **IAM** | Identity & Access | Users, Orgs, Roles, Permissions |
| **MONA** | Monitoring | Metrics, Dashboards, Alerts |

---

## Tech Stack

- **Framework:** NestJS
- **Database:** MongoDB
- **Cache:** Redis
- **Encryption:** AES-256-GCM
- **Queue:** BullMQ (for audit log ingestion)

---

## Roadmap

### Phase 1 (MVP)
- [ ] Config Management module
- [ ] Secret Management module (basic)
- [ ] Health check endpoint

### Phase 2
- [ ] Audit Log module
- [ ] Redis pub/sub for config reload
- [ ] Secret rotation

### Phase 3
- [ ] Service Registry
- [ ] Config validation schemas
- [ ] Audit log export

---

**Status:** Planning
**Last Updated:** 2025-02-01
