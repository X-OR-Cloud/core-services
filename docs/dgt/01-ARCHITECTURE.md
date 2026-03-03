# DGT Service - Architecture Design

**Version:** 1.0 | **Date:** 03/03/2026 | **Status:** Draft

---

## I. Tổng quan

DGT (Digital Gold Trader) là service quản lý giao dịch vàng tự động, nằm trong monorepo hydra-services.

- **Port:** 3007 (local) | 3370-3379 (production)
- **Database:** MongoDB `core_dgt`
- **Framework:** NestJS (theo Template Service pattern)
- **Modes:** API, Worker (scheduler + data-ingestion)

---

## II. Service Modes

DGT chạy ở 3 modes, mỗi mode là 1 process riêng biệt:

```
┌──────────────────────────────────────────────────────────────┐
│                      DGT Service                              │
├──────────────┬──────────────────┬────────────────────────────┤
│  API Mode    │  Worker:Scheduler│  Worker:Data-Ingestion     │
│  (Port 3007) │  (No port)       │  (No port)                 │
│              │                  │                             │
│  REST API    │  Load schedules  │  Consume queue              │
│  Swagger     │  from config     │  dgt-data-ingestion         │
│  CRUD        │  Emit jobs to    │  Switch by datasource type  │
│  WebSocket   │  BullMQ queue    │  Fetch → Transform → Save   │
│  (future)    │  on interval     │                             │
└──────────────┴──────────────────┴────────────────────────────┘
         │              │                      │
         └──────────────┴──────────────────────┘
                        │
                   MongoDB (core_dgt)
                   Redis (BullMQ)
```

### Nx Targets

```bash
nx run dgt:api          # REST API server
nx run dgt:wrk:shd      # Worker mode: Scheduler
nx run dgt:wrk:ing      # Worker mode: Data Ingestion
```

---

## III. Module Structure

### Sơ đồ module

```
services/dgt/src/
├── main.ts                          # Bootstrap (API mode)
├── main-worker.ts                   # Bootstrap (Worker mode)
├── app/
│   ├── app.module.ts                # Root module (API)
│   ├── app-worker.module.ts         # Root module (Worker)
│   ├── app.controller.ts
│   └── app.service.ts
│
├── modules/
│   │
│   │── account/                     # Group 1: User & Account
│   │   ├── account.schema.ts
│   │   ├── account.service.ts
│   │   ├── account.controller.ts
│   │   ├── account.dto.ts
│   │   └── account.module.ts
│   │
│   │── risk-profile/
│   │   └── ... (same pattern)
│   │
│   │── market-price/                # Group 2: Market Data (shared)
│   │   └── ...
│   │
│   │── technical-indicator/
│   │   └── ...
│   │
│   │── macro-indicator/
│   │   └── ...
│   │
│   │── sentiment-signal/
│   │   └── ...
│   │
│   │── order/                       # Group 3: Trading (paper)
│   │   └── ...
│   │
│   │── trade/
│   │   └── ...
│   │
│   └── position/
│       └── ...
│
├── shared/                          # Shared data service (no RBAC)
│   └── shared-data.service.ts
│
├── collectors/                      # Datasource collectors (worker mode)
│   ├── base.collector.ts
│   ├── fred.collector.ts
│   ├── goldapi.collector.ts
│   ├── yahoo-finance.collector.ts
│   ├── binance-spot.collector.ts
│   ├── binance-futures.collector.ts
│   ├── okx.collector.ts
│   ├── bitfinex.collector.ts
│   ├── newsapi.collector.ts
│   ├── bytetree.collector.ts
│   └── collectors.module.ts
│
├── queues/
│   ├── queue.module.ts
│   ├── scheduler.processor.ts
│   ├── data-ingestion.processor.ts
│   └── processors.module.ts
│
└── config/
    ├── datasources.config.ts
    └── redis.config.ts
```

---

## IV. Module Groups & Dependencies

### Dependency diagram (MVP)

```
                    ┌─────────────┐
                    │     IAM     │  (external service)
                    │  User Auth  │
                    └──────┬──────┘
                           │ JWT token contains userId, orgId
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    DGT Service (MVP)                      │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Group 1: User & Account                          │    │
│  │  Account ◄── RiskProfile                         │    │
│  └──────────────────────┬──────────────────────────┘    │
│                         │                                │
│  ┌──────────────────────▼──────────────────────────┐    │
│  │ Group 2: Market Data (shared, write by workers)  │    │
│  │  MarketPrice  TechnicalIndicator                 │    │
│  │  MacroIndicator  SentimentSignal                 │    │
│  └──────────────────────┬──────────────────────────┘    │
│                         │                                │
│  ┌──────────────────────▼──────────────────────────┐    │
│  │ Group 3: Trading (paper trading)                 │    │
│  │  Order ──► Trade                                 │    │
│  │  Position                                        │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Collectors + Queues (Worker mode only)            │    │
│  │  Scheduler ──► dgt-data-ingestion queue           │    │
│  │                    │                              │    │
│  │         ┌──────────┼──────────┐                   │    │
│  │         ▼          ▼          ▼                   │    │
│  │  FredCollector  BinanceCollector  ...              │    │
│  │         │          │          │                   │    │
│  │         └──────────┼──────────┘                   │    │
│  │                    ▼                              │    │
│  │            MongoDB (Group 2 entities)              │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Module import rules

| Module | Imports (depends on) |
|--------|---------------------|
| `account` | - (standalone, link IAM user via JWT context) |
| `risk-profile` | `account` |
| `market-price` | - (shared, written by collectors) |
| `technical-indicator` | - (shared, computed from market-price) |
| `macro-indicator` | - (shared, written by collectors) |
| `sentiment-signal` | - (shared, written by collectors) |
| `order` | `account` |
| `trade` | `order` |
| `position` | `account`, `order` |
| `collectors` | `market-price`, `macro-indicator`, `sentiment-signal` |

---

## V. Authentication & Multi-tenancy

### User identity
- User **không** lưu trong DGT, dùng JWT token từ IAM service
- JWT payload chứa `userId`, `orgId`, `roles` → extract bằng `@CurrentUser()` decorator
- `Account` entity link user qua `owner.userId` (từ BaseSchema)

### Data isolation
- BaseService tự động filter theo `owner.orgId` + `owner.userId` dựa trên RBAC scope
- Market data (Group 2) là shared data, không filter theo user → cần custom logic hoặc role universe

---

## VI. External Dependencies

| Dependency | Mục đích | Giao tiếp |
|------------|---------|-----------|
| **IAM Service** | User authentication | JWT token (không gọi API trực tiếp) |
| **MongoDB** | Primary database | Mongoose ODM |
| **Redis** | BullMQ queues, caching (future) | ioredis |
| **FRED API** | Macro economic data | HTTP (API key) |
| **GoldAPI.io** | Gold spot price | HTTP (API key) |
| **Yahoo Finance** | OHLCV, VIX, DXY | `yahoo-finance2` npm |
| **Binance API** | Spot + Futures data | HTTP (public endpoints) |
| **OKX API** | PAXG cross-exchange price | HTTP (public) |
| **Bitfinex API** | XAUT price | HTTP (public) |
| **NewsAPI.org** | Financial news | HTTP (API key) |
| **ByteTree BOLD** | ETF gold flows | HTTP (public) |
| **LLM Provider** | News sentiment analysis | OpenAI-compatible API |

---

## VII. Environment Variables

```env
# MongoDB
MONGODB_URI=mongodb://10.10.0.100:27017/hydra-dgt

# Redis (BullMQ)
REDIS_HOST=10.10.0.100
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Service
PORT=3007
NODE_ENV=development
MODE=api                    # api | shd | ing

# Encryption
ENCRYPTION_KEY=             # AES-256 key for ApiKey encryption
```

> **Lưu ý:** Các API keys datasource (FRED, GoldAPI, NewsAPI) và LLM config (base URL, API key, model) được lưu trong **Settings** (đọc từ database qua API), không dùng environment variables. Điều này cho phép thay đổi config runtime mà không cần restart worker.

---

## VIII. Production Deployment

```
┌─────────────────────────────────────────────────┐
│              Production (PM2)                    │
│                                                  │
│  core.dgt.api00    (3370)  ──┐                  │
│  core.dgt.api01    (3371)  ──┤── Nginx LB       │
│  core.dgt.api02    (3372)  ──┤                  │
│  core.dgt.api03    (3373)  ──┘                  │
│                                                  │
│  core.dgt.shd00            ── MODE=shd            │
│  core.dgt.ing00            ── MODE=ing            │
│  core.dgt.ing01            ── MODE=ing            │
└─────────────────────────────────────────────────┘
```

- **API**: 4 instances (3370-3373), load balanced
- **Scheduler (shd)**: 1 instance (singleton, emit jobs)
- **Data Ingestion (ing)**: 1-2 instances (consume jobs, scale theo load)

---

*Tài liệu tiếp theo: [02-ENTITY-DESIGN.md](02-ENTITY-DESIGN.md) - Thiết kế entity chi tiết*
