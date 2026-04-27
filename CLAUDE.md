# CLAUDE.md

Guidance for AI Agent when working with this repository.

## Behavioral Guidelines

Reduce common LLM coding mistakes. **Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Development Workflow

### Handling Change Requests

1. **Discuss** — Gather all necessary information and requirements
2. **Propose** — Create a plan document at `docs/<service>/<feature>/`
3. **Approve** — Wait for confirmation before proceeding
4. **Create Branch** — Create a new git branch for the feature/fix
5. **Implement** — Execute the approved plan
6. **Verify** — Build, test, and validate

### Task Management

- Use **micro-task principle**: break complex tasks into small, granular todos
- Each todo = one concrete action (one file, one function)
- Mark todos as completed immediately after finishing each micro-task
- Keep responses concise, focused on one task at a time

### Response Guidelines

- Keep responses short and focused on the specific question or task
- Avoid lengthy explanations unless requested
- Do not provide sample code unless specifically asked

---

## Common Development Commands

```bash
# Build service (dùng local nx, không cần global install)
./node_modules/.bin/nx run <service>:build

# Run modes
./node_modules/.bin/nx run <service>:api   # REST API server
./node_modules/.bin/nx run <service>:wrk   # BullMQ worker

# AIWM-specific modes
./node_modules/.bin/nx run aiwm:mcp        # MCP server (port 3355)
./node_modules/.bin/nx run aiwm:agt        # Hosted agent worker
./node_modules/.bin/nx run aiwm:con        # Connection worker (Discord/Telegram)
./node_modules/.bin/nx run aiwm:aws        # Agent WS gateway (port 3400) — new
./node_modules/.bin/nx run aiwm:nws        # Node WS gateway (port 3403) — new
./node_modules/.bin/nx run aiwm:cws        # Chat WS gateway (port 3407) — new

# DGT-specific modes
./node_modules/.bin/nx run dgt:shd         # Scheduler
./node_modules/.bin/nx run dgt:ing         # Data ingestion
./node_modules/.bin/nx run dgt:sig         # Signal generation
./node_modules/.bin/nx run dgt:mon         # SL/TP monitoring

# TypeScript check
npx tsc --noEmit -p services/<service>/tsconfig.app.json

# Lint / Test
./node_modules/.bin/nx lint <service>
./node_modules/.bin/nx test <service>
```

---

## Architecture Overview

### Monorepo Structure

```
core-services/
├── services/     # Microservices (NestJS)
├── libs/
│   ├── base/     # @core/base  — BaseSchema, BaseService, guards, decorators
│   └── shared/   # @core/shared — constants, enums, service config, logger
└── docs/         # Architecture & API documentation
```

### Services

| Service | Port (Dev) | Port (Prod) | Description |
|---------|-----------|-------------|-------------|
| **template** | 3000 | 3300–3309 | Reference implementation — CRUD, BullMQ, RBAC |
| **iam** | 3001 | 3310–3319 | Identity & Access Management — JWT, Google SSO |
| **noti** | 3002 | 3320–3329 | Notification — WebSocket, BullMQ events |
| **aiwm** | 3003 | 3330–3339 | AI Workload Manager — MCP, hosted agents, WS gateways (aws/nws/cws) |
| **cbm** | 3004 | 3340–3349 | Core Business Management — projects, work items, documents |
| **mona** | 3005 | 3350–3359 | Monitoring & Analytics |
| **pag** | 3006 | 3360–3369 | Personal Agent Gateway |
| **aivp** | 3007 | 3370–3379 | AI Video Processing |
| **dgt** | 3008 | 3380–3389 | Digital Gold Trader — paper trading, AI signals |
| **schd** | 3009 | 3390–3399 | Scheduler |
| **vbx** | 3010 | 3400–3409 | Video Box |
| **aiwm-worker** | — | — | Agent connection worker (standalone, has own Dockerfile) |

Next available ports: 3011, 3012, ...

See [`services/<name>/CLAUDE.md`] and [`docs/PORT-ALLOCATION.md`](docs/PORT-ALLOCATION.md) for details.

### Libraries

**`@hydrabyte/base`** (`libs/base/`)
- `BaseSchema` — base Mongoose schema (createdBy, updatedBy, orgId, isDeleted, timestamps)
- `BaseService` — CRUD + automatic RBAC enforcement
- `JwtAuthGuard`, `CombinedAuthGuard` — auth guards
- `@CurrentUser()` — decorator to access request context
- `parseQueryString` — parse query string into `FindManyOptions` (see operators below)
- `GlobalExceptionFilter` — standardized error responses with correlationId
- `CorrelationIdMiddleware` — request tracking
- Swagger decorators: `ApiCreateErrors`, `ApiReadErrors`, etc.

**`@hydrabyte/shared`** (`libs/shared/`)
- Service config (ports, hosts, DB URIs)
- Common constants, enums (roles, service names)
- Auth utilities, logging helpers (`createLogger`, `logInfo`, `logDebug`, `logWarn`, `logError`)

### Database & Infrastructure

- **MongoDB**: each service has its own database — `{DatabaseNamePrefix}{serviceName}`
- **Redis**: shared instance — BullMQ queues, Socket.IO adapter, caching
- **BullMQ**: async job processing, event-driven architecture

### MongoDB Access

Connection string is in the root `.env` file (`MONGODB_URI`). Use it to inspect data directly when the user asks to check or debug data in any service database.

Known databases:

| Database | Service |
|----------|---------|
| `core_aiwm` | aiwm |
| `core_iam` | iam |
| `core_cbm` | cbm |
| `core_mona` | mona |

Example queries via `mongosh`:
```bash
# Connect
mongosh "$(grep MONGODB_URI .env | cut -d= -f2-)"

# List collections in a db
use core_aiwm
show collections

# Query documents
db.<collection>.find({ ... }).limit(10)
```

---

## Creating New Services

### Required Features

1. Health Check — `/health` endpoint with database monitoring
2. Error Standardization — `GlobalExceptionFilter` with correlationId
3. RBAC — `BaseService` with permission checks
4. Audit Trail — `createdBy`/`updatedBy` tracking
5. Modern Controllers — `@CurrentUser()`, no `BaseController`
6. Swagger — Full OpenAPI specs
7. JWT Auth — `JwtStrategy` + `PassportModule`
8. Pagination — `PaginationQueryDto` for list endpoints
9. Soft Delete — all entities must support it
10. Correlation ID — `CorrelationIdMiddleware`

Reference: [`services/template/`](services/template/) — production-ready example.

### Common Patterns

**Schema:**
```typescript
import { BaseSchema } from '@hydrabyte/base';

// ⚠️ Luôn khai báo collection tường minh
// Nếu không có, Mongoose dùng class name → bị obfuscate thành _0x* khi build production
@Schema({ timestamps: true, collection: 'my_entities' })
export class MyEntity extends BaseSchema {
  @Prop({ required: true })
  name: string;
}
```

**Service:**
```typescript
import { BaseService } from '@hydrabyte/base';

@Injectable()
export class MyEntityService extends BaseService<MyEntity> {
  constructor(@InjectModel(MyEntity.name) model: Model<MyEntity>) {
    super(model);
  }
}
```

**Controller:**
```typescript
import { JwtAuthGuard, CurrentUser, parseQueryString, ApiReadErrors } from '@hydrabyte/base';

@Controller('my-entities')
export class MyEntityController {
  constructor(private readonly service: MyEntityService) {}

  @Get()
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: Record<string, any>, @CurrentUser() context: RequestContext) {
    return this.service.findAll(parseQueryString(query), context);
  }
}
```

**`parseQueryString` operators:**
```
?field=value              → exact match
?field:gt=18              → $gt
?field:gte=18             → $gte
?field:lt=65              → $lt
?field:lte=65             → $lte
?field:ne=inactive        → $ne
?field:in=a,b,c           → $in array
?field:nin=a,b            → $nin array
?field:regex=john         → $regex (case-insensitive)
?sort=createdAt:desc,name:asc
?page=1&limit=20
```

### Verification Checklist

```bash
./node_modules/.bin/nx build [SERVICE_NAME]
npx tsc --noEmit -p services/[SERVICE_NAME]/tsconfig.app.json
./node_modules/.bin/nx run [SERVICE_NAME]:api
curl http://localhost:[PORT]/health
open http://localhost:[PORT]/api-docs
```

---

## Related Docs

- [`docs/PORT-ALLOCATION.md`](docs/PORT-ALLOCATION.md) — Port allocation strategy
- [`docs/PROMPT-NEW-SERVICE-CREATION.md`](docs/PROMPT-NEW-SERVICE-CREATION.md) — Detailed prompt for new services
- [`docs/QUICK-PROMPT-NEW-SERVICE.md`](docs/QUICK-PROMPT-NEW-SERVICE.md) — Quick prompt template
- [`docs/TEMPLATE-SERVICE-UPGRADE.md`](docs/TEMPLATE-SERVICE-UPGRADE.md) — Template feature details
- `services/<name>/CLAUDE.md` — Per-service detailed documentation
