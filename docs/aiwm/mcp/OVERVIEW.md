# MCP Module - Technical Overview

> Last updated: 2026-02-24
> Fixes applied: P0-1 (MCP_PORT), P0-2 (tool filter), P0-4 (registeredAgents cache poisoning)

## 1. File Structure

There are **two separate MCP implementations** in AIWM:

### 1a. HTTP MCP Module (NestJS module — API mode)

```
services/aiwm/src/modules/mcp/
├── mcp.schema.ts       # (none — no Mongoose schema, uses Agent + Tool models directly)
├── mcp.dto.ts          # JSON-RPC 2.0 + MCP protocol DTOs
├── mcp.service.ts      # Business logic: listTools(), executeTool(), buildHttpRequest()
├── mcp.controller.ts   # REST endpoint: POST /mcp (JSON-RPC dispatch)
└── mcp.module.ts       # NestJS module (imports AgentModel + ToolModel + HttpModule)
```

### 1b. Standalone MCP Server (SDK-based — MCP mode)

```
services/aiwm/src/bootstrap-mcp.ts        # MCP server startup (nx run aiwm:mcp)
services/aiwm/src/mcp/
├── index.ts                               # Re-exports: types, utils, builtin
├── types.ts                               # ExecutionContext, ToolDefinition, ToolResponse
├── utils.ts                               # makeServiceRequest(), formatToolResponse(), getServiceBaseUrl()
├── README.md                              # Architecture guide + how-to for adding new tools
└── builtin/
    ├── index.ts                           # BuiltInTools registry + getBuiltInToolsByCategory()
    ├── cbm/
    │   ├── document-management/           # 14 tools (tools.ts, executors.ts, schemas.ts)
    │   └── work-management/               # 14 tools (tools.ts, executors.ts, schemas.ts)
    ├── iam/
    │   └── user-management/               # 1 tool  (tools.ts, executors.ts, schemas.ts)
    └── aiwm/
        └── agent-management/              # 1 tool  (tools.ts, executors.ts, schemas.ts)
```

---

## 2. Two MCP Implementations — When to Use Which

| | HTTP MCP Module | Standalone MCP Server |
|--|--|--|
| **Mode** | API mode (`nx run aiwm:api`) | MCP mode (`nx run aiwm:mcp`) |
| **Transport** | JSON-RPC 2.0 over HTTP (`POST /mcp`) | Streamable HTTP (POST + SSE) via `@modelcontextprotocol/sdk` |
| **Port** | 3003 (API port) | `MCP_PORT` env (default `3355`) |
| **Auth** | `JwtAuthGuard` (NestJS guard) | Manual JWT Bearer validation per request |
| **Tool types served** | `api` only | `builtin`, `api`, `mcp` (stub), `custom` (stub) |
| **CORS** | `localhost:6274` (hardcoded) | `*` (all origins) |
| **Sessions** | Stateless (no session tracking) | In-memory Map, 30-minute timeout |
| **Tool registration** | On-demand per `tools/list` call | Per-agent (keyed by `orgId:agentId`), one-time |

---

## 3. HTTP MCP Module (`src/modules/mcp/`)

### Endpoint

`POST /mcp` — JSON-RPC 2.0 dispatch. Auth: `JwtAuthGuard` (agent JWT required, `agentId` extracted from token).

Supported methods:

| Method | Description |
|--------|-------------|
| `initialize` | Returns server capabilities (`tools: {}`) and version info |
| `tools/list` | Returns active `api`-type tools from agent's `allowedToolIds` |
| `tools/call` | Executes a named tool via HTTP proxy |

Protocol version returned: `2025-11-25`.

### `listTools(agentId)` — `McpService`

1. Load agent by `agentId` (checks `isDeleted: false`)
2. Query: `{ _id: { $in: allowedObjectIds }, type: 'api', status: 'active', isDeleted: false }`
3. Return tools in MCP format: `{ name, description, inputSchema }`

> **Scope**: Only `api` type tools are returned. `builtin`, `mcp`, `custom` tools are not visible via HTTP MCP module.

### `executeTool(agentId, agentToken, { name, arguments })` — `McpService`

1. Load agent, verify exists
2. Find tool by `name` (type='api', status='active')
3. Validate tool is in `agent.allowedToolIds`
4. Call `buildHttpRequest(tool, args)` → construct URL, headers, body/queryParams
5. Execute via `HttpService.request()` with agent JWT in Authorization header
6. Transform response to MCP content format: `{ content: [{ type: 'text', text: JSON.stringify(data) }] }`

### `buildHttpRequest()` — path param + body/query construction

- Path params: `{key}` → replaced with `encodeURIComponent(args[key])`, removed from args
- `GET` / `DELETE`: remaining args → `queryParams`
- `POST` / `PATCH` / `PUT`: remaining args → request `body`
- Timeout: `tool.execution.timeout || 30000`

---

## 4. Standalone MCP Server (`bootstrap-mcp.ts`)

Runs as separate process. Uses `@modelcontextprotocol/sdk` — `McpServer` + `StreamableHTTPServerTransport`.

### Startup

```
nx run aiwm:mcp
```

1. Creates NestJS application context (DI only, no HTTP server) from `AppModule`
2. Gets `JwtService`, `ToolService`, `AgentService`, `ConfigurationService` from DI
3. Starts Express HTTP server on `MCP_PORT` env (default `3355`)
4. Each `POST /` request: validate JWT → register tools (once per agent) → create/reuse session transport

### Authentication

- Per request: `Authorization: Bearer <token>` validated with `jwtService.verifyAsync()`
- Returns HTTP 401 with JSON-RPC error `{ code: -32001, message: 'Authentication required' }` on failure

### Tool Registration (`registerToolsForAgent`)

Returns `boolean`: `true` when tools were registered, `false` when skipped (agent not found or no `allowedToolIds`). The caller only adds to `registeredAgents` Set when return value is `true` — preventing cache poisoning when agent temporarily has no tools.

Runs **once per agent** (keyed by `orgId:agentId` in in-memory `Set`). Flow:

1. Fetch agent from DB using `agentService.findById(agentId, context)`
2. If `allowedToolIds` is empty → return `false` (do NOT cache — agent may get tools later)
3. Convert `allowedToolIds` (string[]) → `Types.ObjectId[]`, query via `toolService.findAll({ filter: { _id: { $in: toolObjectIds }, status: 'active' } })`
4. For each tool:
   - `builtin`: call `getBuiltInToolsByCategory(tool.name)` → register all sub-tools
   - `api`: convert `tool.schema.inputSchema` (JSON Schema) → Zod string fields → register
   - `mcp`: register stub returning "not yet implemented"
   - `custom`: register stub returning "not yet implemented"
5. Return `true`

### Builtin Tool Execution

For each builtin tool execution:
1. Fetch service URLs from `ConfigurationService` (CBM, IAM, AIWM base URLs) — fresh per call
2. Build `ExecutionContext`: `{ token, userId, orgId, agentId, groupId, roles, cbmBaseUrl, iamBaseUrl, aiwmBaseUrl }`
3. Call `builtinTool.executor(args, executionContext)`

### Session Management

- New session: `randomUUID()` session ID, new `StreamableHTTPServerTransport`
- Reuse: if `mcp-session-id` header present and found in sessions map
- Timeout: 30 minutes inactivity → `transport.close()` + cleanup
- All tracked in-memory (lost on restart)

### Service URL Resolution

URLs resolved dynamically from `ConfigurationService`:

| Config Key | Default fallback |
|------------|-----------------|
| `CBM_BASE_API_URL` | `http://localhost:3001` |
| `IAM_BASE_API_URL` | `http://localhost:3000` |
| `AIWM_BASE_API_URL` | `http://localhost:3003` |

---

## 5. Builtin Tools Catalog

Total: **30 builtin tools** across 4 categories.

### DocumentManagement (14 tools) — CBM service

| Tool | Description |
|------|-------------|
| `CreateDocument` | Create document with summary, content, type, labels |
| `ListDocuments` | List with pagination, search, filters (type, status, scope) |
| `GetDocument` | Get by ID with full metadata |
| `GetDocumentContent` | Get content by ID |
| `UpdateDocument` | Update metadata (summary, labels, status, scope) |
| `UpdateDocumentContent` | Update content: replace, find-replace, append operations |
| `DeleteDocument` | Soft delete |
| `ReplaceDocumentContent` | Replace entire content |
| `SearchAndReplaceTextInDocument` | Find/replace text (case-sensitive) |
| `SearchAndReplaceRegexInDocument` | Find/replace via regex |
| `ReplaceMarkdownSectionInDocument` | Replace a markdown section by heading |
| `AppendToDocument` | Append to end of document |
| `AppendAfterTextInDocument` | Append after specific text |
| `AppendToMarkdownSectionInDocument` | Append to end of markdown section |

### WorkManagement (14 tools) — CBM service

| Tool | Description |
|------|-------------|
| `CreateWork` | Create epic/task/subtask |
| `ListWorks` | List with pagination, filters |
| `GetWork` | Get by ID |
| `UpdateWork` | Update metadata (not status — use workflow actions) |
| `DeleteWork` | Soft delete (only when done or cancelled) |
| `StartWork` | todo → in_progress |
| `BlockWork` | in_progress → blocked (requires reason) |
| `UnblockWork` | blocked → in_progress |
| `RequestReviewForWork` | in_progress → review |
| `CompleteWork` | review → done |
| `ReopenWork` | done → in_progress |
| `CancelWork` | any → cancelled |
| `AssignAndTodoWork` | backlog → todo (with assignee) |
| `RejectReviewForWork` | review → todo (with feedback) |

### UserManagement (1 tool) — IAM service

| Tool | Description |
|------|-------------|
| `ListUsers` | List users with pagination and filters |

### AgentManagement (1 tool) — AIWM service

| Tool | Description |
|------|-------------|
| `ListAgents` | List agents with pagination and filters |

---

## 6. `ToolDefinition` Interface (`src/mcp/types.ts`)

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  type: 'builtin';
  category: string;            // e.g., 'DocumentManagement'
  inputSchema: ZodRawShape;    // Zod schema for MCP tool registration
  executor: (args, context: ExecutionContext) => Promise<ToolResponse>;
}

interface ExecutionContext {
  token: string;               // Agent Bearer token
  userId: string;
  orgId: string;
  agentId: string;
  groupId: string;
  roles: string[];
  cbmBaseUrl: string;
  iamBaseUrl: string;
  aiwmBaseUrl: string;
}
```

---

## 7. Dependencies

### HTTP MCP Module (`src/modules/mcp/mcp.module.ts`)
- `AgentModel` (Mongoose, direct import) — no AgentModule import
- `ToolModel` (Mongoose, direct import) — no ToolModule import
- `HttpModule` (`@nestjs/axios`) — for proxying tool execution

### Standalone MCP Server (`bootstrap-mcp.ts`)
- NestJS DI via `app.get()`:
  - `JwtService` — token validation
  - `ToolService` — `findAll()` for tool discovery
  - `AgentService` — `findById()` for agent lookup
  - `ConfigurationService` — service URL lookup

### External packages
- `@modelcontextprotocol/sdk` — standalone server only

---

## 8. Queue Events

None. MCP module does not produce or consume BullMQ events.

---

## 9. Related Modules

- **Tool module** (`src/modules/tool/`): Tool schema and service used by both MCP implementations. HTTP MCP module imports ToolModel directly (not via ToolModule).
- **Agent module** (`src/modules/agent/`): Agent schema and service. HTTP MCP module imports AgentModel directly (not via AgentModule).
- **Configuration module** (`src/modules/configuration/`): Standalone MCP server fetches service base URLs at runtime.

---

## 10. Existing Documentation

- `services/aiwm/src/mcp/README.md` — architecture overview + how-to guide for adding new builtin tools
