# LCM — Kiến trúc Service

## 1. Tổng quan

LCM là một NestJS service tiêu chuẩn trong hydra-services monorepo, chạy ở 2 mode độc lập: `api` (REST HTTP) và `wrk` (BullMQ worker). Không dùng RabbitMQ microservice transport.

```
┌─────────────────────────────────────────────────────┐
│                   LCM Service                        │
│                                                      │
│  ┌──────────────┐       ┌───────────────────────┐   │
│  │  API Mode    │       │    Worker Mode         │   │
│  │  (port 3011) │       │    (no port)           │   │
│  │              │       │                        │   │
│  │  REST API    │       │  ImportProcessorJob    │   │
│  │  Swagger     │       │  PaymentSyncJob        │   │
│  │  Auth (JWT)  │       │  DataSyncJob           │   │
│  └──────┬───────┘       └──────────┬─────────────┘   │
│         │                          │                  │
└─────────┼──────────────────────────┼──────────────────┘
          │                          │
    ┌─────▼──────┐           ┌───────▼──────┐
    │  MongoDB   │           │    Redis      │
    │  core_lcm  │           │  (BullMQ)     │
    └────────────┘           └──────────────┘
                                    │
                             ┌──────▼──────┐
                             │   MSSQL     │
                             │  (payment   │
                             │   source)   │
                             └─────────────┘
```

## 2. App Modes

| Mode | Lệnh | Mô tả |
|------|------|-------|
| `api` | `nx run lcm:api` | REST HTTP server, port 3011 |
| `wrk` | `nx run lcm:wrk` | BullMQ worker, không có HTTP port |

**`main.ts` bootstrap logic:**

```typescript
const mode = process.env.APP_MODE ?? 'api';

if (mode === 'api') {
  // NestFactory.create() → HTTP server
} else if (mode === 'wrk') {
  // NestFactory.createApplicationContext() → no HTTP, chỉ workers
}
```

## 3. Cấu trúc Module

```
services/lcm/src/
├── main.ts
├── app.module.ts
│
├── modules/
│   ├── partner/
│   ├── customer/
│   ├── contract/
│   ├── activity/
│   ├── result/
│   ├── transaction/
│   ├── investigation/
│   ├── reference/
│   ├── staff/
│   ├── team/
│   ├── performance/
│   ├── import-data/
│   ├── export-data/
│   └── report/
│
└── workers/
    ├── import-processor/      # BullMQ: xử lý file import
    ├── payment-sync/          # BullMQ: đồng bộ từ MSSQL
    └── data-sync/             # BullMQ: sync nội bộ (optional)
```

**Mỗi module có cấu trúc chuẩn:**

```
modules/<name>/
├── <name>.module.ts
├── <name>.controller.ts
├── <name>.service.ts
├── <name>.schema.ts          # Mongoose schema, kế thừa BaseSchema
└── dto/
    ├── create-<name>.dto.ts
    └── update-<name>.dto.ts
```

## 4. Database

- **MongoDB database**: `core_lcm`
- **Connection**: dùng chung `MONGODB_URI` từ root `.env`
- **Collection naming**: prefix `lcm_` để tránh xung đột với services khác

```typescript
// Ví dụ khai báo collection tường minh
@Schema({ timestamps: true, collection: 'lcm_contracts' })
export class Contract extends BaseSchema { ... }
```

## 5. BullMQ Queue Names

| Queue | Job | Trigger |
|-------|-----|---------|
| `lcm:import` | `ImportProcessorJob` | API call khi user bấm "Process" |
| `lcm:payment-sync` | `PaymentSyncJob` | Cron mỗi 30 giây |
| `lcm:data-sync` | `DataSyncJob` | Cron mỗi 5 phút (optional) |

## 6. Environment Variables

```bash
# App mode
APP_MODE=api          # hoặc wrk

# Database
MONGODB_URI=mongodb+srv://...    # Dùng chung với toàn monorepo
MSSQL_URI=mssql://...            # Chỉ dùng cho PaymentSyncJob

# Auth (dùng chung với IAM)
JWT_SECRET=...

# Service port (chỉ dùng ở api mode)
PORT=3011
```

## 7. PM2 Config (production)

```javascript
// ecosystem.config.js
{
  name: 'core.lcm.api00',
  script: './dist/services/lcm/main.js',
  env: { PORT: 3410, APP_MODE: 'api', NODE_ENV: 'production' }
},
{
  name: 'core.lcm.api01',
  script: './dist/services/lcm/main.js',
  env: { PORT: 3411, APP_MODE: 'api', NODE_ENV: 'production' }
},
{
  name: 'core.lcm.worker00',
  script: './dist/services/lcm/main.js',
  env: { APP_MODE: 'wrk', NODE_ENV: 'production' }
}
```

## 8. Health Check

```
GET /health

Response:
{
  "status": "ok",
  "mongodb": "connected",
  "uptime": 12345
}
```
