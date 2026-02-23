# Tool Module - Roadmap

> Last updated: 2026-02-23
> Status: Planning — awaiting implementation

## Decisions Made

### UniverseRole for Write Operations (C1)

Tool creation/update/delete requires `UniverseRole` guard — only universe-level admins manage the tool catalog. Regular org users can read and assign tools to agents, but cannot add/modify tool definitions.

**This is correct and intentional.** No change needed.

### MCP Mode Only Serves `type: 'api'` Tools (C2)

`McpService.listTools()` filters by `type: 'api'` only. Other tool types (`builtin`, `mcp`, `custom`) are served via Agent connect/config response but not via the MCP protocol.

**Rationale**: MCP execution proxy only supports forwarding HTTP calls to internal services. Builtin and custom tools are handled by the agent client itself; MCP tool servers are accessed directly by the agent client using the endpoint from the connect response.

**This is correct.** No change needed for now.

---

## Implementation Plan

### P0 — Must Fix (Bugs)

#### P0-1: Fix `checkActiveAgentDependencies` — Wrong Field Name

**Bug**: `tool.service.ts` queries `{ toolIds: toolId.toString() }` but Agent schema field is `allowedToolIds`.

```typescript
// CURRENT (broken — always returns [])
Agent.find({ toolIds: toolId.toString(), isDeleted: false })

// CORRECT
Agent.find({ allowedToolIds: toolId.toString(), isDeleted: false })
```

**Impact**: The dependency guard is silently non-functional. Tools can be deleted/deactivated even when agents reference them. Agents would subsequently receive empty tools list on connect.

- [ ] Fix field name: `toolIds` → `allowedToolIds` in `checkActiveAgentDependencies()`
- [ ] Test: create agent with `allowedToolIds`, try to delete tool → should get 409

#### P0-2: Add `execution` to `UpdateToolDto`

`UpdateToolDto` is missing the `execution` field. Once a tool is created with an `execution` config, it cannot be updated via PATCH.

- [ ] Add `execution` optional object to `UpdateToolDto` with `@IsOptional()` and `@IsObject()` validation
- [ ] Mirror the same fields as in `CreateToolDto` (but all optional)

### P1 — Important Improvements

#### P1-1: Add `byType` Statistics to `findAll()`

`findAll()` aggregates by `status` only. `byType` is always `{}`. Tool type distribution is useful for the UI dashboard.

- [ ] Add second aggregation pipeline: `$group` by `type`
- [ ] Return `statistics: { total, byStatus, byType }` with actual values

#### P1-2: MCP `executeTool` — Find by ID, Not by Name

`McpService.executeTool()` finds the tool by `name` field:
```typescript
Tool.findOne({ name: request.name, type: 'api', ... })
```

This is fragile — renaming a tool would break all agents using it. The `allowedToolIds` whitelist already uses IDs.

- [ ] Change lookup: resolve tool name → ID from agent's `allowedToolIds` first, then fetch by `_id`
- [ ] Or: MCP tool list response should include tool ID, and `callTool` request should carry the tool ID

#### P1-3: `UpdateToolDto` Cannot Change `type`

`type` is correctly absent from `UpdateToolDto` (immutable after creation). Verify this is enforced at service level (BaseService `update()` should not overwrite `type` if not passed).

- [ ] Confirm BaseService does not allow type override via partial update
- [ ] If not enforced: add explicit guard in `ToolService.update()` to reject `type` changes

#### P1-4: Remove `byType: {}` Placeholder from `findAll()` (quick cleanup)

Until P1-1 is implemented, remove the empty `byType: {}` from statistics to avoid misleading API consumers.

- [ ] Remove `byType` key from statistics object until it's actually implemented

### P2 — Planned (Needs Coordination)

#### P2-1: Tool Execute Endpoint (REST)

`TOOL-TYPES-AND-EXECUTION.md` describes a `POST /tools/:toolId/execute` endpoint and a `ToolExecutorService`, but neither exists. Currently, tool execution is only available via MCP mode (`McpService`).

- [ ] Create `ToolExecutorService` with `executeApiTool()` method
- [ ] Add `POST /tools/:toolId/execute` REST endpoint (requires Agent JWT)
- [ ] Validate: tool must be in agent's `allowedToolIds`
- [ ] Forward request to `tool.execution.baseUrl + path` with agent JWT
- [ ] Log execution (toolId, agentId, input, output, duration, status)
- **Dependency**: Decide on auth model for REST execution (agent JWT vs user JWT)

#### P2-2: MCP Tool Container Lifecycle

`mcp`-type tools have `dockerImage`, `port`, `containerId` fields but no lifecycle management is implemented. Currently these fields are just stored metadata.

- [ ] Design: who manages MCP container startup/shutdown? (Node agent? AIWM directly?)
- [ ] Implement `POST /tools/:id/deploy` — start Docker container on target node
- [ ] Implement `POST /tools/:id/undeploy` — stop container
- [ ] Health check polling using `healthEndpoint` → update `status` + `lastHealthCheck`
- **Dependency**: Deployment module + Node module must support container management

#### P2-3: Tool Seeding Script

Pre-register built-in and commonly used tools (Claude SDK tools, CBM tools) via a seed script.

- [ ] Create `scripts/seed-tools.ts`
- [ ] Seed `builtin` tools: Read, Write, Bash, Grep, Glob, etc. (Claude Code SDK)
- [ ] Seed `api` tools: CBM document, project, work endpoints
- [ ] Idempotent: skip if `name` already exists

#### P2-4: Scope Enforcement Verification

`scope: 'public' | 'org' | 'private'` is stored but enforcement relies on `BaseService` RBAC. Verify:
- [ ] `public` tools: visible to all orgs — confirm BaseService doesn't filter by orgId for public tools
- [ ] `org` tools: only visible within same org
- [ ] `private` tools: only visible to creator
- [ ] If BaseService doesn't handle this: add `findAll()` override with scope-aware filter

### P3 — Future

#### P3-1: Tool Execution Logging

Audit trail for all tool executions (who called what, when, with what input/output).

- [ ] Design `ToolExecution` schema: `{ toolId, agentId, userId, input, output, status, duration, timestamp }`
- [ ] Write execution log in `McpService.executeTool()` and future `ToolExecutorService`
- [ ] Query API for Reports module

#### P3-2: Tool Versioning

Currently, updating a tool's `execution` config changes it for all agents immediately.

- [ ] Consider: `version: number` field + pin agents to specific tool versions
- [ ] Or: immutable tools — create new tool per change, deprecate old

#### P3-3: Rate Limiting per Tool

Control how frequently an agent can call a specific tool.

- [ ] Design: per-agent per-tool rate limit (e.g., max 100 calls/min)
- [ ] Implement: Redis-based counter in `McpService.executeTool()`
- **Dependency**: Redis must be available

---

## Notes

- `tool.service.ts` still has `// Agent schema has toolIds: string[] field` comment — this comment is wrong, should be `allowedToolIds`. Fix with P0-1.
- `TOOL-TYPES-AND-EXECUTION.md` describes a `ToolExecutorService` with sample code — this is design/proposal, not yet implemented. The actual execution proxy lives in `McpService`.
- `mcp.service.ts` uses `tool.execution.authRequired` field but always passes agent JWT regardless of this flag (`authRequired` is not checked). Consider honoring this flag in P2-1.
