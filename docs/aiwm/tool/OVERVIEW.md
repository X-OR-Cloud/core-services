# Tool Module - Technical Overview

> Last updated: 2026-02-23

## 1. File Structure

```
services/aiwm/src/modules/tool/
├── tool.schema.ts      # MongoDB schema (extends BaseSchema)
├── tool.dto.ts         # DTOs: Create, Update, ToolSchema
├── tool.service.ts     # Business logic (extends BaseService)
├── tool.controller.ts  # REST API endpoints
└── tool.module.ts      # NestJS module (imports: AgentModule for dependency check)
```

## 2. Tool Types

| Type | Execution Location | Deployment | Use Case |
|------|--------------------|------------|----------|
| `builtin` | Agent container (pre-packaged) | None | Claude Code SDK standard tools (Read, Write, Bash...) |
| `mcp` | External MCP server | Docker container | Third-party MCP protocol tools |
| `api` | AIWM proxy → internal service | Internal service | CBM / internal API tools — proxied via McpService |
| `custom` | Agent code (user-defined) | None | Agent-specific custom logic |

> **MCP mode**: Only `type: 'api'` tools are listed and executed via `McpService`. Other types are served via Agent connect/config response only.

## 3. Schema Fields

```
Tool extends BaseSchema:
  name: string (required, max 100)
  type: 'mcp' | 'builtin' | 'custom' | 'api' (required)
  description: string (required, max 500)
  category: 'productivity' | 'data' | 'system' | 'communication' (required)
  status: 'active' | 'inactive' | 'error' (default: 'active')
  scope: 'public' | 'org' | 'private' (default: 'public')
  schema: { inputSchema: object, outputSchema: object } (required)

  // MCP-specific (required when type='mcp')
  transport?: 'sse' | 'http'
  endpoint?: string        // URL of MCP server or AIWM proxy path (api type)
  dockerImage?: string     // e.g., 'aiops/mcp-web-search:latest'
  containerId?: string     // Set when container is running
  port?: number            // Container port (1024–65535)
  environment?: Record<string, string>
  healthEndpoint?: string
  lastHealthCheck?: Date

  // API-specific (required when type='api')
  execution?: {
    method?: string        // HTTP method: GET | POST | PUT | PATCH | DELETE
    baseUrl?: string       // e.g., 'http://cbm:3004'
    path?: string          // Path template, e.g., '/projects/{id}'
    headers?: Record<string, string>
    authRequired?: boolean // Pass agent JWT to downstream service
    timeout?: number       // ms, default 30000
  }

  // Inherited: owner, createdBy, updatedBy, isDeleted, metadata, timestamps
```

**Indexes:**
```typescript
ToolSchema.index({ type: 1, status: 1 });
ToolSchema.index({ category: 1 });
ToolSchema.index({ name: 'text', description: 'text' }); // Text search
```

## 4. API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/tools` | User JWT + **UniverseRole** | Create tool |
| GET | `/tools` | User JWT | List with pagination + statistics (byStatus) |
| GET | `/tools/:id` | User JWT | Get by ID |
| PATCH | `/tools/:id` | User JWT + **UniverseRole** | Partial update. Cannot deactivate if used by agents → 409 |
| DELETE | `/tools/:id` | User JWT + **UniverseRole** | Soft delete. Cannot delete if used by agents → 409 |

> Write endpoints require `UniverseRole` guard — only universe-level admins can create/update/delete tools.
> Read endpoints are available to all authenticated users.

> **Note**: `UpdateToolDto` is missing the `execution` field — `execution` config cannot be updated via PATCH. See ROADMAP P0-2.

## 5. Business Logic

### Dependency Guard

`checkActiveAgentDependencies(toolId)` — queries Agent model:
```typescript
Agent.find({ toolIds: toolId.toString(), isDeleted: false })
// ⚠️ BUG: field is 'allowedToolIds', not 'toolIds' — always returns []
// See ROADMAP P0-1
```

Called before:
- `update()` — when `status` is being changed to `'inactive'`
- `softDelete()` — always

Throws `ToolInUseException` (from `@hydrabyte/shared`) → HTTP 409 with:
```json
{
  "statusCode": 409,
  "details": { "activeAgents": [{ "id", "name" }], "action": "deactivate" | "delete" }
}
```

> **Due to the bug above, this guard is currently non-functional.** Tools can be deleted/deactivated even when agents reference them.

### findAll() Statistics

Aggregates by `status` only. `byType` is always `{}` (not implemented). See ROADMAP P1-1.

## 6. How Tools Are Used

### Agent Connect / Config Response (`AgentService`)

`getAllowedTools(agent)` — called in `connect()` and `getAgentConfig()`:
```typescript
Tool.find({
  _id: { $in: agent.allowedToolIds },
  isDeleted: false,
  status: 'active',
})
// Returns ALL types (builtin, mcp, api, custom)
```
Result is included in `AgentConnectResponseDto.tools[]` — agent receives the full tool list on connect.

### MCP Mode (`McpService`)

Used when AIWM runs in MCP mode (`nx run aiwm:mcp`):

**List tools** (`listTools(agentId)`):
```typescript
Tool.find({
  _id: { $in: agent.allowedToolIds },
  type: 'api',       // ← Only api type
  status: 'active',
  isDeleted: false,
})
```

**Execute tool** (`executeTool(agentId, agentToken, request)`):
1. Find tool by `name` field (not by ID) — see ROADMAP P1-2
2. Validate tool is in `agent.allowedToolIds`
3. Call `buildHttpRequest(tool, args)`:
   - Replace path params: `/documents/{id}` → `/documents/12345`
   - GET/DELETE → args become query params
   - POST/PATCH/PUT → args become request body
4. Forward HTTP request to `tool.execution.baseUrl + path` with agent JWT
5. Return MCP-format response: `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`

### Bootstrap MCP (`bootstrap-mcp.ts`)

Reads tools directly via `ToolService` during MCP server startup to register tools with the MCP framework.

## 7. Access Control

| Scope | Visibility |
|-------|-----------|
| `public` | All orgs can read and use |
| `org` | Only same org (enforced by BaseService `owner.orgId`) |
| `private` | Creator only |

> Currently, scope filtering in queries is handled by `BaseService` RBAC. The `scope` field is stored but enforcement details depend on `BaseService` implementation.

## 8. Dependencies

- **AgentModule** (imported): Provides `AgentModel` for dependency check before deactivate/delete
- **ToolService** (exported): Used by `AgentService` (`getAllowedTools`), `McpService` (`listTools`, `executeTool`), `bootstrap-mcp.ts`
- **MongooseModule** (exported): `ToolModel` needed by `AgentModule` (for tool queries in `AgentService`)

## 9. Queue Events

None. Tool module does not produce or consume BullMQ events.

## 10. Related Modules

- **Agent module** (`src/modules/agent/`): References `allowedToolIds: string[]` in schema. Calls `getAllowedTools()` to build tool payload for connect/config responses.
- **MCP module** (`src/modules/mcp/`): Uses `ToolModel` directly for `type: 'api'` tool listing and execution proxy to CBM.
- **CBM service**: Target of `api`-type tool execution via AIWM proxy.

## 11. Existing Documentation

- `docs/aiwm/tools/TOOL-TYPES-AND-EXECUTION.md` — Tool types comparison, execution flows, CBM integration guide, implementation roadmap
