# CLAUDE.md

This file provides guidance to AI Agent when working with code in this repository.

## Agent Info
1. **Agent Name**: `backend-dev`

## Project IDs
Projects sử dụng `mcp__Builtin_CreateDocument` để tạo tài liệu:

| Project ID | Services |
|------------|----------|
| `69a10fc73f11383f63de96e6` | dgt, iam |

## Development Workflow Principles

### Handling Change Requests
When there are mandatory change requests, follow these steps:
1. **Discuss** - Gather all necessary information and requirements
2. **Propose** - Present implementation method and detailed plan
3. **Approve** - Get confirmation before proceeding
4. **Create Branch** - Create a new git branch for the implementation
5. **Implement** - Execute the approved plan
6. **Update** - Modify related documentation and tests

### Task Management
- **Use micro-task principle**: Break down complex tasks into small, manageable todos to avoid output token limits (6k limit)
- Create granular todo items for each discrete action (e.g., separate todos for each file to edit, each function to implement)
- Mark todos as completed immediately after finishing each micro-task
- Keep responses concise by focusing on one micro-task at a time

### Development Request Workflow
When receiving new development requests, follow this workflow:

1. **Discuss** - Clarify all requirements and constraints
2. **Propose** - Create documentation in `docs/<service>/<feature>/` (or user-specified location)
3. **Approve** - Wait for user review and confirmation
4. **Implement** - Execute the approved plan
5. **Verify** - Build, test, and validate changes

#### Response Guidelines
- Keep responses concise and focused
- Avoid lengthy explanations unless requested
- Do not provide sample code unless specifically asked
- Focus on addressing the specific question or task

#### Common Request Types
- API Development/Modification
- Module Addition
- Bug Investigation
- New Service Creation

## Common Development Commands

### Build
```bash
# Build specific service
nx run <service>:build

# Examples
nx run iam:build
nx run aiwm:build
nx run cbm:build
```

### Run Services
```bash
# API mode (REST API server)
nx run <service>:api

# MCP mode (for AIWM - MCP server)
nx run aiwm:mcp

# Worker mode (microservices worker)
nx run <service>:wrk
```

## High-Level Architecture

### Monorepo Structure
This is an Nx monorepo using NestJS framework for microservices architecture with the following key components:

**Services** (`/services/`):
- **Template** (Service Template) - Port 3000
  - Reference implementation for new services
  - CRUD operations with event-driven architecture
  - BullMQ queue processing examples
  - See [`services/template/README.md`](services/template/README.md) for details

- **IAM** (Identity & Access Management) - Port 3001
  - User management with MongoDB/Mongoose
  - Organization management
  - JWT authentication strategy (local + Google OAuth 2.0 SSO)
  - Password encryption utilities
  - See [`services/iam/CLAUDE.md`](services/iam/CLAUDE.md) for Google SSO details

- **NOTI** (Notification Service) - Port 3002
  - Real-time notifications via WebSocket
  - System events and agent actions
  - REST API + WebSocket dual mode

- **AIWM** (AI Workload Manager) - Port 3003
  - Core service for AI operations at scale
  - 16 modules: Model, Agent, Node, Resource, Deployment, Instruction, PII, Guardrail, Execution, Reports, etc.
  - Multi-mode: API, MCP, Worker
  - See [`services/aiwm/README.md`](services/aiwm/README.md) for detailed documentation

- **CBM** (Core Business Management) - Port 3004
  - Project management with member-based access control (project.lead / project.member roles)
  - Work item management (epic/task/subtask) with state machine, recurring schedules, and next-work priority
  - Document management with advanced content operations and time-limited share links
  - See [`services/cbm/CLAUDE.md`](services/cbm/CLAUDE.md) and [`docs/cbm/CBM-ENTITIES-AND-API.md`](docs/cbm/CBM-ENTITIES-AND-API.md) for details

- **MONA** (Monitoring & Analytics) - Port 3005
  - Metrics aggregation and monitoring
  - Dashboard data collection
  - System health tracking

- **AIVP** (AI Video Processing) - Port 3007
  - AI-powered video processing and analysis
  - See [`services/aivp/README.md`](services/aivp/README.md) for details

- **DGT** (Digital Gold Trader) - Port 3008
  - Paper trading and market data for gold & crypto assets
  - 9 entity modules: Account, RiskProfile, MarketPrice, TechnicalIndicator, MacroIndicator, SentimentSignal, Order, Trade, Position
  - 9 data collectors (Binance, OKX, Bitfinex, Yahoo, GoldAPI, FRED, NewsAPI+LLM, ByteTree)
  - Three modes: api, shd (scheduler), ing (data ingestion)
  - See [`services/dgt/CLAUDE.md`](services/dgt/CLAUDE.md) for details

**Libraries** (`/libs/`):
- **base** - Shared base classes and utilities
  - Base DTOs, controllers, services, and schemas
  - JWT strategy and auth guards
  - Reusable NestJS components
  
- **shared** - Cross-service shared code
  - Service configuration (ports, hosts, database URIs)
  - Common constants and enums (roles, service names)
  - Authentication utilities and logging helpers
  - TypeScript types for auth and services

### Service Communication Pattern
- Services are configured to run on different ports (IAM: 3001, CBM: 3004)
- Each service has its own MongoDB database with a common prefix pattern
- Authentication is handled centrally through the IAM service
- Shared libraries ensure consistent interfaces and utilities across services

### Database Architecture
- MongoDB with Mongoose ODM
- Each service has its own database: `{COMMON_CONFIG.DatabaseNamePrefix}{serviceName}`
- Base schemas provide common fields and patterns
- Connection URI from environment variable: `MONGODB_URI`

### Testing Strategy
- Unit tests alongside source files (`*.spec.ts`)
- E2E tests in separate projects (`*-e2e`)
- Jest configuration with TypeScript support
- Test setup includes global setup/teardown for E2E tests

### Configuration Management
- Environment variables via `@nestjs/config`
- Service-specific configurations in `shared` library
- Global configuration accessible across all services
- MongoDB URI and other secrets via environment variables

---

## 🚀 Creating New Services

### Quick Reference
When creating new microservices, use these prompt templates:

**📋 Detailed Guide:**
- File: `docs/PROMPT-NEW-SERVICE-CREATION.md`
- Use for: Complex services with multiple entities and special requirements

**⚡ Quick Template:**
- File: `docs/QUICK-PROMPT-NEW-SERVICE.md`
- Use for: Simple services with standard CRUD operations

### Standard Service Template
All new services MUST follow the **Template Service** pattern (`services/template/`):

**✅ Required Features (All Mandatory):**
1. **Health Check** - `/health` endpoint with database monitoring
2. **Error Standardization** - GlobalExceptionFilter with correlation IDs
3. **RBAC Integration** - BaseService with permission checks
4. **Audit Trail** - createdBy/updatedBy tracking
5. **Modern Controllers** - @CurrentUser decorator, no BaseController
6. **Swagger Documentation** - Full OpenAPI specs with error decorators
7. **JWT Authentication** - JwtStrategy + PassportModule
8. **Pagination Support** - PaginationQueryDto for list endpoints
9. **Soft Delete** - All entities support soft delete
10. **Correlation ID** - CorrelationIdMiddleware for request tracking

**📚 Reference Implementation:**
- **Primary Reference:** `services/template/` - Production-ready example
- **Upgraded Service:** `services/iam/` - Recently upgraded to new pattern
- **Documentation:** `docs/TEMPLATE-SERVICE-UPGRADE.md` - Feature details
- **Test Results:** `docs/TEST-RESULTS-PHASE2.md` - Example test scenarios

### Service Creation Workflow
1. **Read Prompt Templates** - Review `docs/QUICK-PROMPT-NEW-SERVICE.md`
2. **Customize Prompt** - Replace placeholders with service details
3. **Submit to Agent** - Paste prompt to Claude Code
4. **Confirm Understanding** - Wait for Agent to outline structure
5. **Incremental Development** - Agent creates service step-by-step
6. **Verify Build** - Run `npx nx build [SERVICE_NAME]`
7. **Test Endpoints** - Verify health check and APIs
8. **Review Documentation** - Check README has curl examples

### Common Patterns

**Schema Pattern:**
```typescript
import { BaseSchema } from '@hydrabyte/base';

@Schema({ timestamps: true })
export class MyEntity extends BaseSchema {
  @Prop({ required: true })
  name: string;
  // ... entity-specific fields
}
```

**Service Pattern:**
```typescript
import { BaseService } from '@hydrabyte/base';

@Injectable()
export class MyEntityService extends BaseService<MyEntity> {
  constructor(@InjectModel(MyEntity.name) model: Model<MyEntity>) {
    super(model);
  }
  // Override methods if needed
}
```

**Controller Pattern (Modern - NO BaseController):**
```typescript
import { JwtAuthGuard, CurrentUser, parseQueryString,
         ApiCreateErrors, ApiReadErrors } from '@hydrabyte/base';

@Controller('my-entities')
export class MyEntityController {
  constructor(private readonly service: MyEntityService) {}

  @Get()
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext
  ) {
    const options = parseQueryString(query);
    return this.service.findAll(options, context);
  }
}
```

**Query String Filtering (via `parseQueryString` utility):**

`parseQueryString` from `@hydrabyte/base` parses query string into `FindManyOptions` with MongoDB operator support. Use this in modern controllers instead of `BaseController.handleQueryStringForFindMany`.

Supported operators:
```
?field=value              → { field: "value" }           # Exact match
?field:gt=18              → { field: { $gt: "18" } }     # Greater than
?field:gte=18             → { field: { $gte: "18" } }    # Greater than or equal
?field:lt=65              → { field: { $lt: "65" } }     # Less than
?field:lte=65             → { field: { $lte: "65" } }    # Less than or equal
?field:ne=inactive        → { field: { $ne: "inactive" } } # Not equal
?field:in=a,b,c           → { field: { $in: ["a","b","c"] } } # In array
?field:nin=a,b             → { field: { $nin: ["a","b"] } }   # Not in array
?field:regex=john          → { field: { $regex: "john", $options: "i" } } # Regex
?sort=createdAt:desc,name:asc  # Sorting
?page=1&limit=20               # Pagination
```

### Port Allocation

**⚠️ See [docs/PORT-ALLOCATION.md](docs/PORT-ALLOCATION.md) for complete port allocation strategy.**

#### Local Development Ports (30XX)
Services are organized by priority: Template (reference) → Core services → Business services

| Service | Port | Type | Description |
|---------|------|------|-------------|
| **Template** | 3000 | Reference | Service template (reference implementation) |
| **IAM** | 3001 | Core | Identity & Access Management |
| **NOTI** | 3002 | Core | Notification Service |
| **AIWM** | 3003 | Business | AI Workload Manager |
| **CBM** | 3004 | Business | Core Business Management |
| **MONA** | 3005 | Business | Monitoring & Analytics |
| **AIVP** | 3007 | Business | AI Video Processing |
| **DGT** | 3008 | Business | Digital Gold Trader |

**Next available ports:** 3009, 3010, etc.

#### Production Ports (33XX-39XX)
Each service gets 10 ports: 4 for API instances, 6 for MCP/WS/other modes

| Service | API Instances | MCP/WS/Other | Total Range |
|---------|---------------|--------------|-------------|
| Template | 3300-3303 | 3304-3309 | 3300-3309 |
| IAM | 3310-3313 | 3314-3319 | 3310-3319 |
| NOTI | 3320-3323 | 3324-3329 | 3320-3329 |
| AIWM | 3330-3333 | 3334-3339 | 3330-3339 |
| CBM | 3340-3343 | 3344-3349 | 3340-3349 |
| MONA | 3350-3353 | 3354-3359 | 3350-3359 |
| AIVP | 3370-3373 | 3374-3379 | 3370-3379 |
| DGT | 3380-3383 | 3384-3389 | 3380-3389 |

**Example - AIWM Production Deployment:**
- API: 3330, 3331, 3332, 3333 (4 instances)
- MCP: 3334, 3335, 3336 (3 instances)
- WebSocket: 3337, 3338 (2 instances)
- Reserved: 3339

### Verification Checklist
After service creation:
```bash
# Build without errors
npx nx build [SERVICE_NAME]

# TypeScript compilation check
npx tsc --noEmit -p services/[SERVICE_NAME]/tsconfig.app.json

# Start service
npx nx serve [SERVICE_NAME]

# Test health endpoint
curl http://localhost:[PORT]/health

# View API documentation
open http://localhost:[PORT]/api-docs
```
