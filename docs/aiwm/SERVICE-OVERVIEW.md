# AIWM Service - AI Workload Manager

## Tổng Quan

**AIWM (AI Workload Manager)** là dịch vụ cốt lõi của nền tảng Kaisar AI Ops, chịu trách nhiệm quản lý và điều phối toàn bộ workload AI bao gồm models, agents, resources, deployments và execution tracking.

**Local Port:** 3003
**Production Ports:** 3330-3339 (API: 3330-3333, MCP: 3334-3336, WS: 3337-3338)
**Database:** `core_aiwm` (MongoDB)
**Service Name:** `aiwm`

> See [docs/PORT-ALLOCATION.md](../../docs/PORT-ALLOCATION.md) for complete port allocation strategy

**Dual Mode Operation:**
- **API Mode (default)**: Full HTTP/WebSocket API server cho web applications
- **MCP Mode**: MCP protocol server cho AI agent integration (Claude Desktop, etc.)

---

## Kiến Trúc và Modules

AIWM được tổ chức theo kiến trúc modular với 16 modules chính:

### 1. **Model Module** (`/modules/model`)
Quản lý AI models metadata và lifecycle.

**Chức năng:**
- CRUD operations cho models
- Hỗ trợ nhiều loại: LLM, Vision, Voice, Embedding
- Tracking provider, capabilities, pricing
- Status management (active, inactive, deprecated)

**Schema chính:**
- `name`: Tên model
- `type`: Loại model (llm, vision, voice, embedding)
- `provider`: Nhà cung cấp (OpenAI, Anthropic, Google, Local...)
- `modelId`: ID của model từ provider
- `capabilities`: Các khả năng của model
- `pricing`: Thông tin giá cả
- `status`: Trạng thái (active, inactive, deprecated)

**API Documentation:** [`docs/aiwm/API-MODEL.md`](../../docs/aiwm/API-MODEL.md)

---

### 2. **Agent Module** (`/modules/agent`)
Quản lý AI agents - các thực thể thực thi tasks với instructions và guardrails.

**Chức năng:**
- CRUD operations cho agents
- Link agents với instructions, guardrails, deployments
- Assign agents to nodes (managed type)
- Track agent status state machine: `inactive → idle → busy → suspended`
- Multi-channel integration (Discord, Telegram) với per-channel config
- JWT authentication cho agents (secret-based cho managed, user JWT cho autonomous)
- Heartbeat + next-work dispatch từ CBM
- Context injection (`@project:`, `@document:` references)
- Env config generation cho agent deployment

**Schema chính:**
- `name`, `description`: Thông tin agent
- `status`: `inactive | idle | busy | suspended`
- `type`: `managed | autonomous`
- `framework`: `claude-agent-sdk`
- `instructionId`, `guardrailId`, `deploymentId`: References
- `nodeId`: Node chạy agent (managed only)
- `role`: RBAC role (`organization.editor | organization.viewer`)
- `allowedToolIds`, `allowedFunctions`: Whitelist tools và functions
- `channels[]`: Structured channel configs (Discord/Telegram) — thay thế `settings.discord_*`
- `settings`: Runtime config (`auth_roles`, `claude_*`, legacy discord/telegram keys)
- `secret`: Hashed secret cho agent authentication
- `lastConnectedAt`, `lastHeartbeatAt`, `connectionCount`: Connection tracking

**Channel Config (`channels[]`):**
- Mỗi entry = 1 channel với `platform`, `token`, `channelId`, `botId`, `requireMentions`, `verboseLogging`, `verboseLoggingTarget`
- Session isolation: mỗi channel có session riêng (`{agentId}:{platform}:{channelId}`)
- Xem [`docs/aiwm/agents/AGENT-SETTINGS-STRUCTURE.md`](../../docs/aiwm/agents/AGENT-SETTINGS-STRUCTURE.md)

**API Documentation:** [`docs/aiwm/API-AGENT.md`](../../docs/aiwm/API-AGENT.md)

---

### 3. **Node Module** (`/modules/node`)
Quản lý compute nodes (servers) chạy AI workloads.

**Chức năng:**
- CRUD operations cho nodes
- Monitor capacity và load
- Health checks
- Resource allocation tracking
- Node status management

**Schema chính:**
- `name`: Tên node
- `host`: Hostname/IP
- `capacity`: Khả năng xử lý
- `currentLoad`: Load hiện tại
- `status`: Trạng thái (active, inactive, maintenance)
- `resources`: Tài nguyên khả dụng

**API Documentation:** [`docs/aiwm/API-NODE.md`](../../docs/aiwm/API-NODE.md)

---

### 4. **Resource Module** (`/modules/resource`)
Quản lý phân bổ tài nguyên compute cho models.

**Chức năng:**
- CRUD operations cho resources
- Link resources với models và nodes
- Configure GPU, memory, replicas
- Track resource utilization
- Status management

**Schema chính:**
- `name`: Tên resource
- `modelId`: Model sử dụng resource
- `nodeId`: Node chạy resource
- `config`: Cấu hình (gpu, memory, replicas)
- `status`: Trạng thái (active, inactive, error)

**API Documentation:** [`docs/aiwm/API-RESOURCE.md`](../../docs/aiwm/API-RESOURCE.md)

---

### 5. **Deployment Module** (`/modules/deployment`)
Quản lý deployment của models lên production environment.

**Chức năng:**
- CRUD operations cho deployments
- Link deployments với resources
- Manage endpoints và routing
- Version control
- Health monitoring
- Auto-scaling configuration
- Blue-green deployment support

**Schema chính:**
- `name`: Tên deployment
- `modelId`: Model được deploy
- `resourceId`: Resource sử dụng
- `endpoint`: URL endpoint
- `version`: Version của deployment
- `config`: Cấu hình scaling, routing
- `status`: Trạng thái (pending, running, stopped, error)

**API Documentation:** [`docs/aiwm/API-DEPLOYMENT.md`](../../docs/aiwm/API-DEPLOYMENT.md)

---

### 6. **Instruction Module** (`/modules/instruction`)
Quản lý system prompts và instructions cho agents.

**Chức năng:**
- CRUD operations cho instructions
- Template library cho use cases phổ biến
- Version control
- Status management
- Tagging và categorization

**Schema chính:**
- `name`: Tên instruction
- `content`: Nội dung system prompt
- `description`: Mô tả
- `status`: Trạng thái (active, inactive, draft)
- `tags`: Tags để phân loại
- `version`: Version tracking

**API Documentation:** [`docs/aiwm/API-INSTRUCTION.md`](../../docs/aiwm/API-INSTRUCTION.md)

---

### 7. **PII Module** (`/modules/pii`)
Quản lý patterns phát hiện và bảo vệ thông tin cá nhân (Personally Identifiable Information).

**Chức năng:**
- CRUD operations cho PII patterns
- Hỗ trợ nhiều loại: email, phone, credit card, SSN, API keys...
- Locale-specific patterns (global, VN, US...)
- Enable/disable patterns
- Custom replacement strings

**Schema chính:**
- `name`: Tên pattern
- `type`: Loại PII (email, phone, creditCard, ssn...)
- `pattern`: Regex pattern
- `replacement`: String thay thế
- `locale`: Locale áp dụng (global, VN, US...)
- `enabled`: Bật/tắt pattern

**Features:**
- Automatic PII detection in input/output
- Redaction before sending to models
- Compliance với GDPR, HIPAA, PCI-DSS

**API Documentation:** [`docs/aiwm/API-PII-GUARDRAILS.md`](../../docs/aiwm/API-PII-GUARDRAILS.md)

---

### 8. **Guardrail Module** (`/modules/guardrail`)
Quản lý content filtering và safety guardrails cho agents.

**Chức năng:**
- CRUD operations cho guardrails
- Keyword và topic blocking
- Custom violation messages
- Reusable configs cho nhiều agents
- Multi-level filtering (strict, moderate, minimal)
- Dependency validation (check agents sử dụng guardrail)

**Schema chính:**
- `name`: Tên guardrail
- `description`: Mô tả
- `enabled`: Bật/tắt
- `blockedKeywords`: Danh sách keywords bị chặn
- `blockedTopics`: Danh sách topics bị chặn
- `customMessage`: Message hiển thị khi vi phạm
- `status`: Trạng thái (active, inactive)
- `tags`: Tags để phân loại

**Features:**
- Input validation (chặn trước khi gửi model)
- Output validation (chặn kết quả không phù hợp)
- Audit trails cho violations

**API Documentation:** [`docs/aiwm/API-PII-GUARDRAILS.md`](../../docs/aiwm/API-PII-GUARDRAILS.md)

---

### 9. **Tool Module** (`/modules/tool`)
Quản lý tools và functions mà agents có thể sử dụng.

**Chức năng:**
- CRUD operations cho tools
- Function definitions và parameters
- Tool execution tracking
- Integration với external APIs
- Lookup available functions by agent framework và tool IDs

**Schema chính:**
- `name`: Tên tool (category name cho builtin, e.g., "DocumentManagement")
- `description`: Mô tả
- `type`: Loại tool (mcp, builtin, custom, api)
- `category`: Phân loại (productivity, data, system, communication)
- `schema`: Input/output JSON Schema definitions
- `status`: Trạng thái (active, inactive, error)
- `scope`: Access control (public, org, private)

**Builtin Tool Categories:**
- `DocumentManagement`: 14 functions (CRUD + content operations)
- `WorkManagement`: 14 functions (CRUD + workflow transitions)
- `ProjectManagement`: 10 functions (CRUD + lifecycle actions)
- `AgentManagement`: 1 function (ListAgents)
- `UserManagement`: 1 function (ListUsers)

**Functions Lookup API:**
```bash
GET /tools/functions?framework=claude-agent-sdk&toolIds=id1,id2,id3
```
Returns available functions grouped by tool category, including framework-native functions and builtin tool functions.

**API Documentation:** [`docs/aiwm/API-TOOL.md`](../../docs/aiwm/API-TOOL.md)

---

### 10. **Configuration Module** (`/modules/configuration`)
Quản lý system configurations và settings.

**Chức năng:**
- CRUD operations cho configurations
- Environment-specific settings
- Feature flags
- Dynamic configuration updates

---

### 11. **Execution Module** (`/modules/execution`)
Tracking và logging mọi agent execution.

**Chức năng:**
- Log mọi request/response
- Track tokens, latency, cost
- Store execution metadata
- Query execution history
- Performance analytics

**Schema chính:**
- `agentId`: Agent thực thi
- `input`: Input data (after PII redaction)
- `output`: Output data (after PII redaction)
- `tokens`: Số tokens sử dụng
- `cost`: Chi phí
- `latency`: Thời gian xử lý
- `status`: Trạng thái (success, failed)
- `error`: Thông tin lỗi nếu có

**API Documentation:** [`docs/aiwm/API-EXECUTION.md`](../../docs/aiwm/API-EXECUTION.md)

---

### 12. **Reports Module** (`/modules/reports`)
Generate reports và analytics cho hệ thống.

**Chức năng:**
- System overview dashboard
- Model/Agent/Node statistics
- Cost analysis
- Usage patterns
- Performance metrics
- Custom reports

**API Documentation:** [`docs/aiwm/API-REPORTS.md`](../../docs/aiwm/API-REPORTS.md)

---

### 13. **MCP Module** (`/modules/mcp`)
Quản lý MCP (Model Context Protocol) integration để agents có thể sử dụng tools.

**Chức năng:**
- List tools available cho agents (filtered by allowedToolIds)
- Execute tools bằng cách proxy requests tới CBM service
- Transform responses sang MCP protocol format
- Support JSON-RPC 2.0 protocol
- Agent JWT authentication

**Schema chính:**
- Sử dụng Tool schema từ Tool Module
- MCP-specific DTOs cho protocol compliance

**Features:**
- Tool authorization checking
- HTTP request building với path parameter substitution
- Error handling và transformation
- Support GET/POST/PATCH/PUT/DELETE methods

**API Documentation:** [`docs/aiwm/MCP-*.md`](../../docs/aiwm/)

---

### 14. **Conversation Module** (`/modules/conversation`)
Quản lý conversations giữa users và agents.

**Chức năng:**
- Track multi-turn conversations
- Link conversations với agents và models
- Store conversation metadata
- Track token usage và message count
- Support multiple participants

**Schema chính:**
- `conversationId`: Unique conversation identifier
- `title`: Conversation title
- `description`: Conversation description
- `agentId`: Link đến agent
- `modelId`: Link đến model
- `conversationType`: Loại conversation
- `status`: Trạng thái conversation
- `totalTokens`: Tổng tokens sử dụng
- `totalMessages`: Tổng số messages
- `participants`: Danh sách participants với roles

**Note:** Module chưa có controller/service - chỉ có schema và DTO definitions

---

### 15. **Message Module** (`/modules/message`)
Quản lý individual messages trong conversations.

**Chức năng:**
- Store messages trong conversations
- Track message role (user, assistant, system)
- Store function calls và tool calls
- Track token usage per message
- Store response metadata (latency, error)

**Schema chính:**
- `conversationId`: Link đến conversation
- `agentId`: Link đến agent
- `role`: Message role (user/assistant/system)
- `content`: Message content
- `functionCall`: Function call data (nếu có)
- `toolCalls`: Array of tool calls
- `toolResults`: Array of tool results
- `usage`: Token usage tracking
- `latency`: Response time
- `error`: Error message (nếu có)

**Note:** Module chưa có controller/service - chỉ có schema và DTO definitions

---

### 16. **Util Module** (`/modules/util`)
Cung cấp utility functions cho hệ thống.

**Chức năng:**
- Text generation sử dụng OpenAI Responses API
- AI-powered field generation cho forms
- Smart text processing và post-processing
- Configuration-based API key management

**Features:**
- Generate text với constraints (maxLength, no greetings, concise)
- Remove Vietnamese greetings và salutations
- Smart truncation tại sentence boundaries
- OpenAI GPT-5-nano integration
- Configurable through Configuration Module

**API Endpoint:**
- `POST /util/generate-text` - Generate text based on field description

**Use Cases:**
- Auto-fill form fields với AI
- Generate descriptions, summaries
- Content suggestions

---

## Queue System

AIWM sử dụng message queue (Bull + Redis) để xử lý async tasks:

**Queues:**
- Job processing queue (`/queues/queue.module.ts`)
- Processors cho background jobs (`/queues/processors.module.ts`)

**Use cases:**
- Model deployment tasks
- Batch execution
- Report generation
- Cleanup tasks

---

## Database Configuration

**Connection String:**
```
mongodb://{MONGODB_URI}/core_aiwm
```

**Collections:**
- `models` - AI models metadata
- `agents` - AI agents
- `nodes` - Compute nodes
- `resources` - Resource allocations
- `deployments` - Production deployments
- `instructions` - System prompts
- `pii_patterns` - PII detection patterns
- `guardrails` - Content filtering configs
- `tools` - Available tools
- `configurations` - System settings
- `executions` - Execution logs
- `reports` - Generated reports
- `conversations` - Agent conversations
- `messages` - Conversation messages

**Base Schema Pattern:**
All collections extend `BaseSchema` với các fields:
- `createdBy` - User tạo record
- `updatedBy` - User update record
- `orgId` - Organization owner
- `groupId` - Group (optional)
- `isDeleted` - Soft delete flag
- `createdAt` - Timestamp
- `updatedAt` - Timestamp

---

## Development Guide

### Prerequisites
- Node.js 18+
- MongoDB running on configured host
- Redis (for queue system)
- Nx CLI installed globally

### Installation
```bash
# Install dependencies
npm install
```

### Running the Service

#### Development Mode (with hot reload)
```bash
# API mode (default)
npx nx serve aiwm

# MCP mode
MODE=mcp npx nx serve aiwm
```

#### Production Mode
```bash
# Build first
npx nx build aiwm --configuration=production

# Run API mode (default)
node dist/services/aiwm/main.js

# Run MCP mode
MODE=mcp node dist/services/aiwm/main.js
```

### Building
```bash
# Development build
npx nx build aiwm

# Production build
npx nx build aiwm --configuration=production
```

### Testing
```bash
# Unit tests
npx nx test aiwm

# E2E tests
npx nx test aiwm-e2e

# Test coverage
npx nx test aiwm --coverage
```

### Linting
```bash
# Check for errors
npx nx lint aiwm

# Auto-fix issues
npx nx lint aiwm --fix
```

---

## Seed Data

### Available Seed Scripts

#### 1. Seed Instructions
```bash
node scripts/seed-instructions.js
```

**Creates:**
- VTV Customer Support Assistant
- VTV News Summarizer
- VTV Education Assistant

#### 2. Seed PII Patterns
```bash
node scripts/seed-pii-patterns.js
```

**Creates:**
- Email pattern
- Vietnam phone pattern
- Credit card pattern
- SSN pattern
- API key pattern
- JWT token pattern
- Vietnam CCCD pattern
- Vietnam bank account pattern

#### 3. Seed Guardrails
```bash
node scripts/seed-guardrails.js
```

**Creates:**
- VTV Safe Content Filter (strict)
- Education Content Filter (moderate)
- News Content Filter (minimal)

#### 4. Seed VTV Agents
```bash
node scripts/seed-vtv-agents.js
```

**Creates:**
- Complete data chain: Node → Instructions → Guardrails → Agents
- 3 agents ready for VTV use case

#### 5. Seed Tools
```bash
node scripts/seed-tools.js
# or
node scripts/seed-tools-fetch.js  # With real tools data
```

**Creates:**
- Common tools for agents
- Web search, calculator, weather, etc.

### Running All Seeds
```bash
# Run in sequence
node scripts/seed-instructions.js && \
node scripts/seed-pii-patterns.js && \
node scripts/seed-guardrails.js && \
node scripts/seed-vtv-agents.js && \
node scripts/seed-tools.js
```

---

## Common Development Tasks

### Check Models, Resources, Deployments Status
```bash
./scripts/check-models-resources-deployments.sh
```

**Output:**
- All active models with their resources and deployments
- Summary statistics
- Models without resources/deployments

### Check VTV Data
```bash
./scripts/check-vtv-data.sh
```

**Output:**
- VTV-specific agents, guardrails, instructions

### Health Check
```bash
curl http://localhost:3003/health
```

**Response:**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

### Swagger API Documentation
```
http://localhost:3003/api-docs
```

### Test Authentication
```bash
# Get token from IAM service first
TOKEN="your-jwt-token-here"

# Test protected endpoint
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3003/agents
```

---

## API Endpoints Overview

### Core Resources
- `POST /agents` - Create agent
- `GET /agents` - List agents (with pagination)
- `GET /agents/:id` - Get agent by ID
- `PUT /agents/:id` - Update agent
- `DELETE /agents/:id` - Soft delete agent

Similar patterns for:
- `/models`
- `/nodes`
- `/resources`
- `/deployments`
- `/instructions`
- `/pii-patterns`
- `/guardrails`
- `/tools`
- `/executions`
- `/reports`
- `/configurations`

### Tool Functions Lookup
- `GET /tools/functions?framework=claude-agent-sdk&toolIds=id1,id2` - Lookup available functions by framework and tool IDs

### MCP-Specific Endpoints
- `POST /mcp/agents/:agentId/tools/list` - List tools cho agent
- `POST /mcp/agents/:agentId/tools/call` - Execute tool via MCP protocol
- `POST /mcp` - JSON-RPC 2.0 endpoint cho MCP protocol

### Utility Endpoints
- `POST /util/generate-text` - Generate text using OpenAI

### Pagination
All list endpoints support pagination:
```bash
GET /agents?page=1&limit=10
```

### Population
Some endpoints support populate:
```bash
GET /agents/:id?populate=instruction
GET /agents/:id?populate=guardrail
GET /agents/:id?populate=instruction,guardrail
```

### Filtering
```bash
GET /agents?status=active
GET /models?type=llm&provider=openai
```

---

## Security Features

### 1. Authentication
- JWT-based authentication
- Token validation on every request
- Integration với IAM service

### 2. Authorization (RBAC)
- Role-based access control
- Hierarchical permissions: Universe → Org → Group → Agent → App
- Permission checks in BaseService

### 3. PII Protection
- Automatic detection và redaction
- Applied on input/output
- Compliance ready

### 4. Content Guardrails
- Input/output validation
- Keyword and topic blocking
- Violation logging

### 5. Audit Trails
- Every action logged with userId
- Correlation IDs for request tracking
- Execution history for debugging

### 6. Rate Limiting
- Per-user rate limits
- Per-organization quotas
- DDoS protection

---

## Monitoring and Observability

### Health Endpoint
```bash
GET /health
```

### Logs
- Structured logging với correlation IDs
- Log levels: debug, info, warn, error
- Integration với log aggregation tools

### Metrics
- Execution count per agent/model
- Average latency
- Token consumption
- Cost tracking
- Success/failure rates

### Dashboards
Access via Reports endpoint:
```bash
GET /reports/dashboard
```

---

## Troubleshooting

### Service Won't Start

**Issue:** Port already in use
```
Error: listen EADDRINUSE: address already in use :::3003
```

**Solution:**
```bash
# Find process using port
lsof -i :3003

# Kill the process
kill -9 <PID>
```

### Database Connection Failed

**Issue:** Cannot connect to MongoDB
```
MongoNetworkError: connect ECONNREFUSED
```

**Solution:**
1. Check MongoDB is running:
```bash
mongosh mongodb://172.16.3.20:27017
```

2. Verify MONGODB_URI in `.env`:
```
MONGODB_URI=mongodb://172.16.3.20:27017
```

### Build Errors

**Issue:** TypeScript compilation errors

**Solution:**
```bash
# Clean cache
npx nx reset

# Rebuild
npx nx build aiwm
```

### Seed Scripts Fail

**Issue:** Duplicate key error
```
E11000 duplicate key error
```

**Solution:**
```bash
# Drop collections and re-seed
mongosh mongodb://172.16.3.20:27017/core_aiwm --eval "
  db.agents.drop();
  db.guardrails.drop();
  db.instructions.drop();
"

# Re-run seed
node scripts/seed-vtv-agents.js
```

---

## Environment Variables

### Required
```bash
# MongoDB connection
MONGODB_URI=mongodb://172.16.3.20:27017

# Service port (optional, default: 3003)
PORT=3003

# Redis (for queue system)
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT secret (shared with IAM)
JWT_SECRET=your-secret-here
```

### Optional
```bash
# Logging level
LOG_LEVEL=info

# Enable debug mode
DEBUG=true

# Node environment
NODE_ENV=development
```

---

## Project Structure

```
services/aiwm/
├── src/
│   ├── app/                      # Main app module
│   │   ├── app.module.ts        # Root module with all imports
│   │   ├── app.controller.ts    # Root controller
│   │   └── app.service.ts       # Root service
│   ├── modules/                  # Feature modules
│   │   ├── agent/               # Agent module (full CRUD)
│   │   ├── model/               # Model module (full CRUD)
│   │   ├── node/                # Node module (full CRUD + WebSocket)
│   │   ├── resource/            # Resource module (full CRUD)
│   │   ├── deployment/          # Deployment module (full CRUD + proxy)
│   │   ├── instruction/         # Instruction module (full CRUD)
│   │   ├── pii/                 # PII module (full CRUD)
│   │   ├── guardrail/           # Guardrail module (full CRUD)
│   │   ├── tool/                # Tool module (full CRUD)
│   │   ├── configuration/       # Configuration module (full CRUD)
│   │   ├── execution/           # Execution module (full CRUD + orchestrator)
│   │   ├── reports/             # Reports module (read-only analytics)
│   │   ├── mcp/                 # MCP module (tool integration)
│   │   ├── conversation/        # Conversation module (schemas only)
│   │   ├── message/             # Message module (schemas only)
│   │   └── util/                # Util module (AI utilities)
│   ├── queues/                   # Queue system
│   │   ├── queue.module.ts      # Queue configuration
│   │   └── processors.module.ts # Job processors
│   ├── bootstrap-api.ts          # API server bootstrap
│   ├── bootstrap-mcp.ts          # MCP server bootstrap
│   └── main.ts                   # Entry point (dual mode)
├── test/                         # E2E tests
├── scripts/                      # Seed scripts
│   ├── seed-models.js
│   ├── seed-instructions.js
│   ├── seed-pii-patterns.js
│   ├── seed-guardrails.js
│   ├── seed-vtv-agents.js
│   └── seed-tools.js
├── project.json                  # Nx project configuration
├── tsconfig.json                 # TypeScript config
├── tsconfig.app.json            # App-specific TS config
└── README.md                     # This file
```

---

## Related Documentation

### Product Overview
- [Kaisar AI Ops Overview](../../docs/KAISAR-AI-OPS-OVERVIEW.md) - Comprehensive product documentation

### API Documentation
- [Agent API](../../docs/aiwm/API-AGENT.md) - Agent CRUD operations
- [PII & Guardrails API](../../docs/aiwm/API-PII-GUARDRAILS.md) - Security features
- [Model API](../../docs/aiwm/API-MODEL.md) - Model management
- [Node API](../../docs/aiwm/API-NODE.md) - Node management
- [Resource API](../../docs/aiwm/API-RESOURCE.md) - Resource management
- [Deployment API](../../docs/aiwm/API-DEPLOYMENT.md) - Deployment management

### Development Guides
- [CLAUDE.md](../../CLAUDE.md) - AI agent development instructions
- [Template Service Guide](../../docs/TEMPLATE-SERVICE-UPGRADE.md) - Service creation guide

---

## Contributing

### Code Style
- Follow existing patterns in template service
- Use TypeScript strict mode
- Write tests for new features
- Update documentation

### Commit Messages
```
feat(agent): add support for multi-model agents
fix(pii): resolve regex pattern escaping issue
docs(api): update agent endpoint documentation
```

### Pull Request Process
1. Create feature branch from main
2. Make changes with tests
3. Run linter and fix issues
4. Build successfully
5. Create PR with description
6. Wait for review and approval

---

## Support and Contact

### Issues
Report issues at: [GitHub Issues](https://github.com/your-org/hydra-services/issues)

### Documentation
Full documentation: [docs/](../../docs/)

### Team
- Backend Team: AIWM service development
- DevOps Team: Infrastructure and deployment
- Product Team: Feature requirements
