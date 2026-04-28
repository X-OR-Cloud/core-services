# CLAUDE_VSM.md

Guidance for AI Agent dedicated to maintaining the **VSM (Voice Service Management)** service.

---

## Your Role

You are the dedicated maintainer of the VSM service (`services/vsm/`). Your scope is limited to this service and its related documentation under `docs/vsm/`. You may read (but not modify) shared libraries at `libs/base/` and `libs/shared/` when needed for context.

---

## Development Workflow

1. **Discuss** — Gather requirements, clarify scope
2. **Propose** — Create plan at `docs/vsm/<feature>/`
3. **Approve** — Wait for confirmation before coding
4. **Branch** — Create git branch for the change
5. **Implement** — Execute the plan
6. **Verify** — Build, type-check, test

### Task Management

- Break work into micro-tasks (one file, one function per task)
- Mark each task done immediately after completion
- Keep responses concise, focused on current task

---

## Khi Gặp Vướng Mắc

Nếu gặp bất cứ vướng mắc nào trong quá trình thực hiện công việc:
- Thử tối đa **3 lần** để giải quyết vấn đề
- Nếu cả 3 lần đều thất bại → mention <@1074993237363802122> để hỗ trợ, rồi **dừng lại**, không tiếp tục thực hiện

---

## Lesson Learned

Quy trình capture lesson learned sau mỗi feature ship prod:

**Ngay khi phát hiện lesson có tính chung:**
- Ảnh hưởng cách làm việc → update Instruction
- Là kiến thức kỹ thuật / context dự án → lưu vào memory (`lessons` category)

---

## Communication Protocol

**Trước khi thực hiện bất kỳ tool call nào**, dùng `mcp__Chat__SendMessage` để gửi thông báo cho user biết em đang làm gì.

Flow chuẩn:
```
thinking → SendMessage (ack) → tools → final message
```

Ví dụ:
- "Đang kiểm tra build log..."
- "Đang restart PM2 processes..."
- "Đang SSH vào prod để deploy..."

---

## Service Overview

| Key | Value |
|-----|-------|
| Path | `services/vsm/` |
| Port (dev) | 3009 |
| Port (prod) | 3390–3399 |
| Database | `core_vsm` (MongoDB + Mongoose) |
| Modes | `api`, `ami` |
| Entry | `src/main.ts` → routes to bootstrap file based on `MODE` env |

VSM là **control plane** cho hệ thống telephony dựa trên Asterisk PBX. Service **không** xử lý media trực tiếp — Asterisk đảm nhiệm toàn bộ RTP/SRTP. VSM chỉ lưu trữ cấu hình, cung cấp API, nhận event từ AMI bridge, và ghi log.

---

## Commands

```bash
# Build & verify
nx run vsm:build
npx tsc --noEmit -p services/vsm/tsconfig.app.json
nx lint vsm
nx test vsm

# Run modes
nx run vsm:api    # REST API server (port 3009)
nx run vsm:ami    # AMI Bridge worker — kết nối Asterisk :5038

# Quick health check
curl http://localhost:3009/health
open http://localhost:3009/api-docs
```

---

## Run Modes

| Mode | Bootstrap File | Description |
|------|---------------|-------------|
| **api** | `bootstrap-api.ts` | REST API server (default) |
| **ami** | `bootstrap-ami.ts` | AMI Bridge — kết nối Asterisk, nhận events, thực thi commands |

### AMI Bridge Worker

Worker `ami` chạy **trên cùng server với Asterisk** (hoặc cùng network segment) để đảm bảo TCP latency thấp đến AMI port `:5038`. Là **thin layer** — không có business logic, không ghi DB trực tiếp.

**Responsibilities:**
- Duy trì AMI TCP connection (auto-reconnect)
- Nhận events → forward về VSM API via HTTP webhook
- Consume BullMQ queue `vsm:ami:commands` → thực thi AMI actions

---

## Modules

| Module | Endpoint prefix | Mô tả |
|--------|----------------|-------|
| **nodes** | `/nodes` | Asterisk node: hostname, AMI credentials, trạng thái kết nối |
| **accounts** | `/accounts` | Tài khoản SIP/WebRTC — MongoDB `_id` làm SIP username |
| **trunks** | `/trunks` | Trunk/gateway ra ngoài (SIP provider, PSTN, VoIP carrier) |
| **phone-numbers** | `/phone-numbers` | DID numbers gọi vào, caller ID gọi ra |
| **routes** | `/routes` | Luật định tuyến inbound/outbound theo ưu tiên |
| **dialplans** | `/dialplans` | Cấu hình dialplan Asterisk (context, extensions) |
| **call-logs** | `/call-logs` | CDR log, thống kê cuộc gọi, signed recording URL |
| **webhooks** | `/webhooks/ami` | Internal endpoint nhận events từ AMI bridge |

### Module Dependencies

```
nodes
    ├── accounts    (account gắn vào node)
    ├── trunks      (trunk gắn vào node)
    └── dialplans   (dialplan gắn vào node)

routes
    ├── accounts    (from account)
    ├── trunks      (to trunk)
    └── dialplans   (to dialplan)

call-logs
    ├── nodes
    ├── accounts    (from/to)
    ├── trunks
    ├── phone-numbers
    └── dialplans
```

---

## Schema Conventions

### Encrypted Fields

Các field nhạy cảm phải lưu encrypted và **không được trả về trong GET responses**:

| Module | Field ẩn |
|--------|----------|
| nodes | `ami.secret` |
| accounts | `password` |
| trunks | `password` |

### Sync Status

Các module cần sync lên Asterisk (`accounts`, `trunks`, `dialplans`) đều có:

```typescript
syncStatus: 'pending' | 'synced' | 'error'
syncedAt: Date
```

Lifecycle: `pending` (khi create/update) → `synced` (sau khi AMI bridge xác nhận) | `error`.

### Call Log — Chỉ tạo qua webhook

`call-logs` **không** được tạo qua REST API client. Chỉ được tạo/cập nhật bởi AMI bridge qua `POST /webhooks/ami`. Ngoại lệ duy nhất: `POST /call-logs/originate` để khởi tạo outbound call (tạo call-log với `result=queued` rồi enqueue command).

---

## AMI Bridge — Event Handling

### Events Subscribed

```typescript
const SUBSCRIBED_EVENTS = ['Cdr', 'DialBegin', 'DialEnd', 'Hangup', 'PeerStatus', 'DeviceStateChange'];
```

### Event Processing tại VSM API

| AMI Event | VSM xử lý |
|-----------|----------|
| `Cdr` | Parse Disposition → result; tính duration, answeredDuration; lưu `recordingFile = s3Key`; tạo call-log |
| `PeerStatus` | Extract accountId từ `PJSIP/<accountId>-<hex>`; update `account.status` |
| `DeviceStateChange` | Map state → `idle`/`ringing`/`in_call`; update `account.state` |
| `DialBegin` | Update call-log state nếu có matching UniqueID |
| `DialEnd` | Update call-log state theo DialStatus |
| `Hangup` | Finalize call-log nếu CDR chưa về |

### CDR Disposition Mapping

| Asterisk Disposition | VSM Result |
|---------------------|-----------|
| `ANSWERED` | `answered` |
| `NO ANSWER` | `no_answer` |
| `BUSY` | `busy` |
| `FAILED` / `CONGESTION` | `failed` |

### RecordingFile — S3 Key Extraction

Bridge strip prefix trước khi gửi về VSM:

```
CDR.RecordingFile = "/var/spool/asterisk/monitor/recordings/2026/04/19/<id>.wav"
                                             ↓ strip prefix
call-log.recordingFile = "recordings/2026/04/19/<id>.wav"   ← S3 key
```

---

## AMI Bridge — Command Service

VSM API → BullMQ queue `vsm:ami:commands` → AMI Bridge thực thi AMI actions.

### Command Types

| Command | AMI Actions |
|---------|------------|
| `originate` | `Originate` với `VSM_CALL_ID` channel variable |
| `syncAccount` | `UpdateConfig pjsip.conf` + `ModuleReload res_pjsip` |
| `syncTrunk` | `UpdateConfig pjsip.conf` + `ModuleReload res_pjsip` |
| `syncDialplan` | Ghi `extensions.conf` + `Command: dialplan reload` |
| `hangupChannel` | `Hangup` |

### Job Retry Policy

| Thông số | Giá trị |
|----------|---------|
| Attempts | 3 |
| Backoff | exponential, base 2s |
| Timeout | 10s per attempt |
| On failure | POST `/webhooks/ami/sync-result` `{ status: 'error' }` |

---

## Recording Pipeline

Asterisk ghi recording **trực tiếp lên S3/MinIO** qua `s3fs` FUSE mount — không cần transfer file.

```
Asterisk /var/spool/asterisk/monitor/   ← s3fs mount
                    │ FUSE
                    ▼
         S3/MinIO bucket: vsm-recordings/
                    recordings/2026/04/19/<callLogId>.wav
```

- Dialplan dùng `MixMonitor(recordings/%Y/%m/%d/${VSM_CALL_ID}.wav,b)`
- `VSM_CALL_ID` được pass qua channel variable khi originate
- Recording URL cho FE: `GET /call-logs/:id/recording-url` → presigned URL (TTL 15 phút)
- FE stream audio trực tiếp từ S3 — không đi qua VSM backend

---

## BullMQ Queues

| Queue | Producer | Consumer |
|-------|----------|---------|
| `vsm:ami:commands` | VSM API (accounts/trunks/dialplans/call-logs) | AMI Bridge worker |

---

## Webhook Security

`POST /webhooks/ami` xác thực bằng **service token riêng** (`AMI_BRIDGE_TOKEN`), không dùng JWT:

```
Authorization: Bearer <AMI_BRIDGE_TOKEN>
```

Guard riêng cho webhook endpoints — tách biệt với `JwtAuthGuard`.

---

## External Integrations

| System | Config | Purpose |
|--------|--------|---------|
| MongoDB | `MONGODB_URI` | Database `core_vsm` |
| Redis | `REDIS_URL` | BullMQ queues |
| Asterisk AMI | `AMI_HOST`, `AMI_PORT` | Telephony control (ami mode only) |
| S3/MinIO | `S3_*` | Recording storage + presigned URL generation |

---

## Environment Variables

### API Mode

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | ✅ | — | JWT signing secret |
| `MONGODB_URI` | ✅ | — | MongoDB connection string |
| `REDIS_URL` | ✅ | — | Redis URL cho BullMQ |
| `PORT` | ❌ | `3009` | HTTP server port |
| `MODE` | ❌ | `api` | Run mode: `api\|ami` |
| `AMI_BRIDGE_TOKEN` | ✅ | — | Service token cho webhook `/webhooks/ami` |
| `S3_ENDPOINT` | ✅ | — | MinIO/S3 endpoint URL |
| `S3_ACCESS_KEY` | ✅ | — | S3 access key |
| `S3_SECRET_KEY` | ✅ | — | S3 secret key |
| `S3_BUCKET` | ✅ | — | S3 bucket name (vd: `vsm-recordings`) |
| `S3_PRESIGN_TTL` | ❌ | `900` | Presigned URL TTL (giây), mặc định 15 phút |

### AMI Bridge Mode (thêm vào)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ID` | ✅ | — | MongoDB ObjectId của Asterisk node này |
| `AMI_HOST` | ✅ | — | IP/hostname Asterisk (`127.0.0.1` nếu cùng server) |
| `AMI_PORT` | ❌ | `5038` | AMI port |
| `AMI_USERNAME` | ✅ | — | AMI username |
| `AMI_SECRET` | ✅ | — | AMI secret |
| `AMI_RECORDING_PREFIX` | ❌ | `/var/spool/asterisk/monitor/` | Prefix strip khi extract S3 key |
| `VSM_API_URL` | ✅ | — | Base URL của VSM API |
| `AMI_RECONNECT_DELAY` | ❌ | `5000` | Delay reconnect ms |

---

## PM2 Deploy Config

```javascript
// ecosystem.config.js — AMI bridge (một process per node)
{
  name: 'vsm-ami-hn01',
  script: 'dist/services/vsm/main.js',
  args: '--mode=ami',
  env: {
    NODE_ID: '<mongoObjectId>',
    AMI_HOST: '127.0.0.1',
    AMI_PORT: '5038',
    AMI_USERNAME: 'vsm-bridge',
    AMI_SECRET: '<secret>',
    VSM_API_URL: 'http://vsm-api-host:3009',
    AMI_BRIDGE_TOKEN: '<service-token>',
    REDIS_URL: 'redis://redis-host:6379',
  }
}
```

> Mỗi Asterisk node cần một AMI bridge process riêng với `NODE_ID` tương ứng.

---

## Shared Library Usage

### From `@hydrabyte/base` (`libs/base/`)

- `BaseSchema`, `BaseService` — base classes (RBAC + soft delete)
- `JwtAuthGuard`, `CombinedAuthGuard` — auth guards
- `@CurrentUser()` — request context decorator
- `parseQueryString` — query string to MongoDB filter
- `GlobalExceptionFilter`, `CorrelationIdMiddleware` — global middleware
- `HealthModule` — health check endpoint
- Swagger decorators: `ApiCreateErrors`, `ApiReadErrors`, etc.

### From `@hydrabyte/shared` (`libs/shared/`)

- `RequestContext` — user context type
- `COMMON_CONFIG.DatabaseNamePrefix` — DB name prefix (`core_`)
- `SERVICE_CONFIG.vsm` — VSM-specific config
- `buildMongoUri()` — MongoDB connection builder
- `ServiceName.VSM` — service enum

---

## Permission Matrix

| Role | nodes | accounts | trunks | phone-numbers | routes | dialplans | call-logs |
|------|-------|----------|--------|---------------|--------|-----------|-----------|
| `org.owner` | Full CRUD | Full CRUD | Full CRUD | Full CRUD | Full CRUD | Full CRUD | Read + Delete |
| `org.admin` | Full CRUD | Full CRUD | Full CRUD | Full CRUD | Full CRUD | Full CRUD | Read |
| `org.editor` | Read | Own only | Read | Read | Read | Read | Own only |
| `org.viewer` | Read | Own only | — | Read | — | — | Own only |

> **Own only:** Chỉ xem records liên quan đến `userId` của mình.

---

## Documentation Index

| Doc | Path |
|-----|------|
| Service overview | `docs/vsm/OVERVIEW.md` |
| Entities & API reference | `docs/vsm/ENTITIES-AND-API.md` |
| AMI bridge design | `docs/vsm/AMI-BRIDGE.md` |
| Port allocation | `docs/PORT-ALLOCATION.md` |

---

## Important Conventions

1. **Asterisk là media engine** — VSM không xử lý SIP/RTP, chỉ quản lý cấu hình và log
2. **AMI bridge là thin layer** — không có business logic, không ghi DB trực tiếp; toàn bộ xử lý tại VSM API
3. **Encrypted secrets không được trả về** — `ami.secret`, `accounts.password`, `trunks.password` chỉ lưu encrypted
4. **MongoDB `_id` là SIP username** — `account._id` (ObjectId) dùng trực tiếp làm section name trong `pjsip.conf`
5. **VSM_CALL_ID truyền qua channel variable** — để dialplan dùng làm tên file recording, đảm bảo S3 key match với call-log `_id`
6. **Call logs chỉ tạo qua webhook** — không nhận POST từ REST client ngoại trừ `/call-logs/originate`
7. **Một AMI bridge per node** — một process kết nối đến một Asterisk server; nhiều nodes cần nhiều processes
8. **Soft delete only** — tất cả entities dùng `isDeleted`, không hard delete
9. **Webhook auth dùng service token** — không dùng JWT; guard riêng cho `/webhooks/ami`
10. **s3fs mount trên Asterisk server** — recordings ghi thẳng lên S3, không cần upload step; presigned URL cho FE stream trực tiếp
