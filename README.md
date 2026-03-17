# Core Services

Nx monorepo containing backend microservices for the core platform, built on NestJS.

## Tech Stack

- **Runtime**: Node.js 18+, TypeScript ~5.9
- **Framework**: NestJS v11, Nx v21 (monorepo)
- **Database**: MongoDB 8 + Mongoose (each service has its own database)
- **Cache / Queue**: Redis + BullMQ (job queues, pub/sub)
- **Auth**: JWT + Passport (local, Google OAuth 2.0)
- **Real-time**: Socket.IO v4 + Redis adapter
- **AI / MCP**: Vercel AI SDK, LangChain, Model Context Protocol SDK
- **API Docs**: Swagger / OpenAPI

## Services

| Service | Port (Dev) | Port (Prod) | Description |
|---------|-----------|-------------|-------------|
| **template** | 3000 | 3300–3309 | Reference implementation — CRUD, BullMQ, RBAC |
| **iam** | 3001 | 3310–3319 | Identity & Access Management — JWT, Google SSO |
| **noti** | 3002 | 3320–3329 | Notification — WebSocket, BullMQ events |
| **aiwm** | 3003 | 3330–3339 | AI Workload Manager — 22 modules, MCP server, hosted agents |
| **cbm** | 3004 | 3340–3349 | Core Business Management — projects, work items, documents |
| **mona** | 3005 | 3350–3359 | Monitoring & Analytics |
| **aivp** | 3007 | 3370–3379 | AI Video Processing |
| **dgt** | 3008 | 3380–3389 | Digital Gold Trader — paper trading, AI signals, 9 data collectors |

Services in development: `schd` (Scheduler), `pag` (Personal Agent Gateway).

### Run Modes

Each service supports one or more run modes:

```bash
nx run <service>:api    # REST API server
nx run <service>:wrk    # BullMQ worker

# AIWM-specific
nx run aiwm:mcp         # MCP server (port 3355)
nx run aiwm:agt         # Hosted agent worker
nx run aiwm:con         # Connection worker (Discord / Telegram)
```

## Libraries

| Library | Path | Description |
|---------|------|-------------|
| `@core/base` | `libs/base` | BaseSchema, BaseService (CRUD + RBAC), JWT guard, pagination, Swagger decorators |
| `@core/shared` | `libs/shared` | Constants, enums, service config, logger utilities |

## Quick Start

```bash
# Install dependencies
npm install

# Build a service
nx run iam:build

# Run a service in dev mode
nx run iam:api

# Health check
curl http://localhost:3001/health

# API docs
open http://localhost:3001/api-docs
```

## Environment Variables

```env
MONGODB_URI=mongodb://localhost:27017
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your-secret
```

## Directory Structure

```
hydra-services/
├── services/           # Microservices
│   ├── template/       # Reference implementation
│   ├── iam/
│   ├── noti/
│   ├── aiwm/
│   ├── cbm/
│   ├── mona/
│   ├── aivp/
│   └── dgt/
├── libs/
│   ├── base/           # @core/base
│   └── shared/         # @core/shared
└── docs/               # Architecture & API documentation
```

## Documentation

- [CLAUDE.md](CLAUDE.md) — AI agent guidance and development workflow
- [docs/PORT-ALLOCATION.md](docs/PORT-ALLOCATION.md) — Port allocation strategy
- `services/<name>/CLAUDE.md` — Per-service detailed documentation
- `docs/<service>/` — API specs and module design

## Development Commands

```bash
# TypeScript check
npx tsc --noEmit -p services/<service>/tsconfig.app.json

# Dependency graph
npx nx graph

# Lint / Test
nx lint <service>
nx test <service>
```
