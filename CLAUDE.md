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

### Sync Before Coding

**Always pull latest code before making any changes.**

```bash
git pull
```

Run this before touching any file. In a monorepo with multiple contributors, local branch can be behind remote — editing stale code leads to version conflicts and overwritten changes at commit/push time.

### Task Management

- Use **micro-task principle**: break complex tasks into small, granular todos
- Each todo = one concrete action (one file, one function)
- Mark todos as completed immediately after finishing each micro-task
- Keep responses concise, focused on one task at a time

### Versioning Policy

This repo uses a **single monorepo-wide version** in the root `package.json`.

**Bump version automatically before every commit/push**, based on the scope of changes:

| Change type | Bump |
|---|---|
| Bug fix, small tweak, config, docs | `patch` (0.0.x) |
| New feature, new endpoint, new module | `minor` (0.x.0) |
| Breaking change, major architecture shift | `major` (x.0.0) |

**Trigger:** Any time the user says "commit" or "push".
**Skip trigger:** If the user says "commit nhanh", "commit tạm", or explicitly says no version bump.

### Changelog Policy

Mỗi version bump phải kèm theo một file changelog tại `docs/change-logs/v{version}.md`.

**Workflow khi commit/push:**
1. Xác định change type → chạy `npm version patch|minor|major --no-git-tag-version`
2. Tạo `docs/change-logs/v{version}.md` tóm tắt nội dung thay đổi
3. Stage cả `package.json` + changelog file vào cùng 1 commit

**Format file changelog:**

```markdown
# v{version} — {date YYYY-MM-DD}

## Features
- **scope**: mô tả ngắn gọn

## Fixes
- **scope**: mô tả ngắn gọn

## Notes (nếu cần)
- breaking changes, migration notes, deprecation...
```

**Quy tắc:**
- Chỉ ghi những thay đổi có ý nghĩa — bỏ qua test temp, debug log, minor refactor
- Dùng tiếng Việt hoặc tiếng Anh, nhất quán trong cùng 1 file
- Section `Fixes` / `Features` / `Notes` — bỏ section nào không có nội dung
- Changelog directory: [`docs/change-logs/`](docs/change-logs/)

### Protected Build (Ship cho khách hàng)

**Protected build** = build đầy đủ để ship cho khách hàng: compile + obfuscate + bake license secret.

```bash
# 1. Generate license cho khách hàng (chỉ làm 1 lần per customer)
node licenses/gen-license.js <slug> <expiry YYYY-MM-DD>
# → In ra LICENSE_SECRET, tạo licenses/output/<slug>.license

# 2. Build với LICENSE_SECRET
LICENSE_SECRET=<secret> ./node_modules/.bin/nx run <service>:build

# 3. Obfuscate
npx javascript-obfuscator dist/services/<service>/main.js \
  --output dist/services/<service>/main.js \
  --compact true --identifier-names-generator hexadecimal \
  --string-array true --string-array-encoding rc4 \
  --rename-globals false --self-defending false

# 4. Pre-install node_modules vào dist/ (Dockerfile không có npm ci bên trong)
# ⚠️ NODE_ENV=development bắt buộc — tránh skip devDependencies (class-validator, bcrypt...)
# ⚠️ Dùng npm install (không npm ci) — lockfile có thể thiếu packages mới
REPO=$(pwd)
cp $REPO/package.json $REPO/package-lock.json $REPO/dist/services/<service>/
[ -f "$REPO/.npmrc" ] && cp $REPO/.npmrc $REPO/dist/services/<service>/
(cd $REPO/dist/services/<service> && NODE_ENV=development npm install --ignore-scripts)

# 5. Docker build & export — dùng absolute path (CWD có thể lệch sau bước pre-install)
docker build -f $REPO/services/<service>/Dockerfile -t xai/<service>:latest $REPO
docker save xai/<service>:latest | gzip > $REPO/air-gap-builder/artifacts/images/services/<service>.tar.gz
```

**Lưu ý:**
- `licenses/customers.json` và `licenses/output/` đều gitignored — không bao giờ commit secrets
- File `.license` ship riêng lên server khách — mount tại `/app/.license` (K8s Secret hoặc `-v /path/.license:/app/.license:ro`)
- `NODE_ENV=production` trong môi trường build sẽ khiến npm skip devDeps → container fail khi start

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

# MONA-specific modes
./node_modules/.bin/nx run mona:agg        # Aggregation worker (BullMQ, no HTTP)

# TypeScript check
# Note: npx tsc không hoạt động trong workspace (thiếu TypeScript local)
# Dùng node với TypeScript từ ulva workspace thay thế:
node -e "
const ts = require('/usr/agents/ulva/workspace/code/node_modules/typescript');
const path = require('path');
const configPath = path.resolve('./services/<service>/tsconfig.app.json');
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
const program = ts.createProgram(config.fileNames, config.options);
const diagnostics = ts.getPreEmitDiagnostics(program);
const filtered = diagnostics.filter(d =>
  d.file && d.file.fileName.includes('/services/<service>/') && !d.file.fileName.includes('node_modules') &&
  !['class-validator','class-transformer','bcrypt'].some(x => ts.flattenDiagnosticMessageText(d.messageText,' ').includes(x))
);
if (filtered.length) {
  filtered.forEach(d => {
    const {line,character} = d.file.getLineAndCharacterOfPosition(d.start);
    console.log(d.file.fileName.split('/services/<service>/')[1]+':'+(line+1)+':'+(character+1)+' - '+ts.flattenDiagnosticMessageText(d.messageText,'\n'));
  });
  process.exit(1);
} else { console.log('No type errors!'); }
"

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
| **schd** | 3009 | 3390–3399 | Scheduler |

Next available ports: 3006, 3007, 3010, 3011, ...

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
# TypeScript check: dùng node thay vì npx tsc (xem hướng dẫn ở mục Common Development Commands)
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
