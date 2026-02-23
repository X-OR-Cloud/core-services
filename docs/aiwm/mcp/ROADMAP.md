# MCP Module - Roadmap

> Last updated: 2026-02-24
> Status: Planning — awaiting implementation

---

## Decisions Made

### D1 — Two MCP Implementations Are Intentional

AIWM has two separate MCP implementations:
- **HTTP MCP** (`modules/mcp/`): Simple JSON-RPC bridge for API mode. Serves `api` type tools only.
- **Standalone MCP Server** (`bootstrap-mcp.ts`): Full MCP SDK implementation for MCP mode. Serves all tool types including `builtin`.

These serve different agent integration patterns and should remain separate. The standalone server is the primary path for production agent integration.

---

## Implementation Plan

### P0 — Must Fix (Bugs)

#### P0-1: Fix `MCP_PORT` Environment Variable Bug

`bootstrap-mcp.ts` line 31:
```typescript
// CURRENT — wrong priority
const MCP_PORT = process.env.MCP_PORT
  ? parseInt(process.env.PORT || process.env.MCP_PORT, 10)
  : 3355;
```

When `PORT` is set (common in containerized deployments for the API server), the MCP server will bind to the API server's port instead of its own.

```typescript
// FIX
const MCP_PORT = parseInt(process.env.MCP_PORT || '3355', 10);
```

- [x] `bootstrap-mcp.ts`: Fix `MCP_PORT` parsing — use `MCP_PORT` directly, fallback to `3355`

#### P0-2: Uncomment MongoDB Filter in `registerToolsForAgent`

`bootstrap-mcp.ts` around line 287:
```typescript
const toolFilter = {
  //_id: { $in: toolObjectIds },  // ← commented out
  status: 'active',
  //"owner.orgId": orgId,         // ← commented out
  //isDeleted: false,              // ← commented out
};
```

The `_id` filter is commented out, causing `findAll()` to return **all active tools** in the DB, which are then JS-filtered. This is inefficient (full table scan) and could be a security concern (fetches tools belonging to other orgs).

- [x] Convert `agent.allowedToolIds` (string[]) to `Types.ObjectId[]` before passing to `$in`
- [x] Add `_id: { $in: toolObjectIds }` to MongoDB filter — `owner.orgId` and `isDeleted: false` are handled automatically by `BaseService.findAll()` via context

#### P0-3: Fix HTTP MCP CORS Hardcoded to `localhost:6274`

`mcp.controller.ts`:
```typescript
// OPTIONS handler — hardcoded
res.setHeader('Access-Control-Allow-Origin', 'http://localhost:6274');
```

This only works for MCP Inspector in local development. Production deployments and other MCP clients will fail CORS preflight.

- [ ] Replace hardcoded origin with configurable `MCP_CORS_ORIGIN` env var
- [ ] Or: move CORS config to app-level middleware

### P1 — Important Improvements

#### P1-1: Implement `mcp` Tool Type Execution (Standalone Server)

`bootstrap-mcp.ts` — `mcp` type returns stub:
```typescript
} else if (tool.type === 'mcp') {
  return {
    content: [{ type: 'text', text: `MCP tool ${tool.name} execution not yet implemented` }],
  };
}
```

For `mcp` type tools, the agent needs to call an **external MCP server**. The `tool.execution` config should include the target MCP server's connection details.

- [ ] Define execution config shape for `mcp` type tools (URL, transport type, auth)
- [ ] Implement `mcp` client forwarding in standalone bootstrap: connect to external MCP server, proxy `tools/call`
- [ ] Document the `execution` config schema for `mcp` type in `docs/aiwm/tool/`

#### P1-2: Implement `custom` Tool Type Execution (Standalone Server)

`bootstrap-mcp.ts` — `custom` type returns stub:
```typescript
} else if (tool.type === 'custom') {
  return {
    content: [{ type: 'text', text: `Custom tool ${tool.name} execution not yet implemented` }],
  };
}
```

- [ ] Decide execution model for `custom` type (webhook? inline JS? separate runner?)
- [ ] Implement or document as planned-only

#### P1-3: Cache Service URLs in Standalone MCP Server

`bootstrap-mcp.ts` — `fetchServiceUrls()` is called **on every builtin tool execution**:
```typescript
const serviceUrls = await fetchServiceUrls(tokenPayload.orgId, context);
```

This makes 3 DB queries (`configService.findByKey()` × 3) per tool call.

- [ ] Cache service URLs per `orgId` (in-memory Map or short TTL)
- [ ] Invalidate when configuration is updated (or use TTL of ~60 seconds)

#### P1-4: Reload Tools on Config Change (Standalone Server)

`registeredAgents` Set prevents re-registration:
```typescript
if (!registeredAgents.has(agentKey)) {
  await registerToolsForAgent(userContext, bearerToken);
  registeredAgents.add(agentKey);
}
```

If an agent's `allowedToolIds` changes or a tool's config is updated, the standalone server will serve stale tool registrations until restart.

- [ ] Add a TTL to `registeredAgents` entries (e.g., 10 minutes)
- [ ] Or: expose admin endpoint to clear the registration cache for specific agents

#### P1-5: Expose HTTP MCP `tools/list` for `builtin` Type

Currently, `McpService.listTools()` filters to `type: 'api'` only. Agents using HTTP MCP mode cannot discover their `builtin` tools.

Options:
- **Option A**: Keep HTTP MCP as `api` only — agents needing `builtin` tools must use standalone server
- **Option B**: Extend `listTools()` to return `builtin` tool categories + expand to their sub-tools

- [ ] Decide which option to use (discuss)
- [ ] If Option B: import `getBuiltInToolsByCategory()` into `McpService` and expand tool list

### P2 — Planned (Needs Coordination)

#### P2-1: Redis-Based Session Persistence (Standalone Server)

Sessions are currently tracked in-memory:
```typescript
const sessions = new Map<string, StreamableHTTPServerTransport>();
```

This means sessions are lost on server restart and cannot be shared across multiple MCP server instances (horizontal scaling).

- [ ] Store session metadata in Redis
- [ ] Transport itself cannot be serialized — consider stateless transport per request (depends on SDK support)
- [ ] Or: use sticky sessions at load balancer level + keep in-memory Map

#### P2-2: Add More Builtin Tool Categories

Current coverage is limited:
- UserManagement: 1 tool (`ListUsers`)
- AgentManagement: 1 tool (`ListAgents`)

Potential additions:
- [ ] `UserManagement`: `GetUser`, `UpdateUser`, `InviteUser`
- [ ] `AgentManagement`: `GetAgent`, `CreateAgent`, `UpdateAgent`
- [ ] `ConversationManagement` (AIWM): list/get/create conversations, add messages
- [ ] `ModelManagement` (AIWM): list available models and deployments
- [ ] Pattern: follow existing `tools.ts` / `executors.ts` / `schemas.ts` structure

#### P2-3: MCP Server Multi-Instance Support

The standalone MCP server is designed as single-instance. For production scale:
- `registeredAgents` Set and `sessions` Map are in-memory
- Tool registrations on `McpServer` instance are in-memory

- [ ] Evaluate: sticky session routing at load balancer (simplest)
- [ ] Or: per-instance tool registration (acceptable if sessions are sticky)
- [ ] Document recommended deployment topology

### P3 — Future

#### P3-1: Resources and Prompts Support

Current MCP server only exposes `tools` capability (`capabilities: { tools: {} }`). MCP protocol also supports:
- **Resources**: expose files, DB records, etc. as readable resources
- **Prompts**: pre-built prompt templates agents can call

- [ ] Evaluate: add `resources` capability (expose documents from CBM?)
- [ ] Evaluate: add `prompts` capability (expose system instructions?)
- [ ] Implement using SDK `mcpServer.registerResource()` / `mcpServer.registerPrompt()`

#### P3-2: Streaming Tool Responses

Current tool execution returns complete response at once. For long-running tools:
- [ ] Use MCP streaming (SSE) for tools that generate output incrementally
- [ ] Design progress reporting protocol

---

## Notes

- HTTP MCP module (`modules/mcp/`) imports `AgentModel` and `ToolModel` directly (not via AgentModule/ToolModule). If Agent or Tool schema changes, MCP module is unaffected by module-level changes but may need updated queries.
- Standalone MCP server uses `ToolService.findAll()` (not direct model access) — benefits from BaseService filtering automatically.
- `executeTool` in HTTP MCP validates `allowedToolIds` twice: once at query time (`$in: allowedObjectIds`) and once explicitly (`agent.allowedToolIds.includes(toolIdStr)`). The second check is redundant but harmless.
- The builtin tool `executor` functions receive the full agent bearer token in `ExecutionContext.token` — they forward this token to downstream services. This means builtin tools operate with the agent's identity and permissions.
