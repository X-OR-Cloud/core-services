# Chat Slash Command — Implementation Plan

## Overview

Upgrade slash command handling in `/ws/chat` from plain-text string matching inside `AgentRunner.handleMessage()` to a proper event-driven architecture. Commands are intercepted at the **gateway**, emitted as structured events **directly to the agent socket** (not broadcast to the room), and significant commands are **stored in DB** for audit trail.

This plan also fixes an event naming inconsistency (`chat:heartbeat` → `agent:heartbeat`).

---

## Current State (Problems)

| Problem | Detail |
|---------|--------|
| Slash commands travel as chat messages | `/stop`, `/reload` go through `message:send` → room broadcast → `message:new` → `AgentRunner.handleMessage()` string match |
| Visible to all room participants | Commands appear as regular messages before the agent handles them |
| No structured payload | `/stop` cannot carry `reason`; matching is exact string only |
| Inconsistent event naming | `chat:heartbeat` uses `chat:` prefix but the sender is always an agent — should be `agent:heartbeat` |
| No audit trail | No DB record of who stopped the agent, when, or why |

---

## Proposed Architecture

```
User / Anonymous / Connection Worker
        │
        │  command:send { command, conversationId, reason? }
        ▼
  ChatGateway (/ws/chat)
        │  1. Validate sender & payload
        │  2. Save Action (type=command) to DB
        │  3. Emit command:result ack to requester
        │
        │  agent:command { type, conversationId, reason? }
        ▼
  AgentRunner (connected as agent socket)
        │  Handles by type: stop / reload / inspect
        │
        │  message:send (system type) OR command:result
        ▼
  Conversation room (system message visible to all)
```

---

## Event Naming (Final)

### Client → Server

| Event | Sender | Payload | Change |
|-------|--------|---------|--------|
| `agent:connect` | user | `{ agentId }` | no change |
| `conversation:join` | user / anonymous | `{ conversationId }` | no change |
| `conversation:leave` | user / anonymous | `{ conversationId }` | no change |
| `conversation:online` | any | `{ conversationId }` | no change |
| `message:send` | user / anonymous / agent | `{ conversationId, role, content, ... }` | gateway intercepts `/ignore <text>` prefix |
| `message:typing` | user / agent | `{ conversationId, isTyping }` | no change |
| `message:read` | user | `{ conversationId, messageId }` | no change |
| `agent:heartbeat` | agent | `{ status, metrics? }` | **renamed** from `chat:heartbeat` |
| `command:send` | user / anonymous | `{ command, conversationId, reason? }` | **new** |

### Server → Client

| Event | Receiver | Payload | Change |
|-------|----------|---------|--------|
| `message:new` | room | `{ conversationId, role, content, ... }` | no change |
| `message:sent` | sender | `{ success, messageId, timestamp }` | no change |
| `message:error` | sender | `{ success, error, timestamp }` | no change |
| `agent:typing` | room | `{ conversationId, isTyping, ... }` | no change |
| `user:typing` | room | `{ conversationId, isTyping, ... }` | no change |
| `presence:update` | all | `{ type, status, ... }` | no change |
| `user:joined` | room | `{ userId, conversationId, ... }` | no change |
| `user:left` | room | `{ userId, conversationId, ... }` | no change |
| `command:result` | requester only | `{ command, success, data?, error? }` | **new** |

### Server → Agent socket (direct, not broadcast)

| Event | Receiver | Payload | Change |
|-------|----------|---------|--------|
| `agent:command` | agent socket(s) | `{ type, conversationId, reason? }` | **new** |

---

## Commands

### `/stop` → `agent:command { type: 'stop' }`

**Purpose:** Abort the current LLM generation for a conversation if the agent is busy.

**Payload:**
```json
{
  "command": "stop",
  "conversationId": "<required>",
  "reason": "<optional string>"
}
```

**Process:**
1. Gateway validates `conversationId` is present
2. Gateway saves `ActionType.COMMAND` to DB (actor = requester, content = `/stop`, metadata.reason)
3. Gateway looks up agent socket IDs via `chatService.getAgentSocketIds(agentId)`
4. Gateway emits `agent:command { type: 'stop', conversationId, reason }` to agent sockets
5. Gateway acks requester with `command:result { command: 'stop', success: true }`
6. AgentRunner receives `agent:command`, calls `abortMap.get(conversationId)?.abort()`
7. AgentRunner emits system message to conversation: `"Đã dừng. Bạn có thể tiếp tục nhắn tin bất cứ lúc nào."`

**DB stored:** ✅ Yes

---

### `/reload` → `agent:command { type: 'reload' }`

**Purpose:** Tell the agent to re-fetch its config (instruction, deployment, settings, MCP servers) from AIWM without reconnecting.

**Payload:**
```json
{
  "command": "reload",
  "conversationId": "<optional — for ack routing>"
}
```

**Process:**
1. Gateway saves `ActionType.COMMAND` to DB (content = `/reload`)
2. Gateway emits `agent:command { type: 'reload' }` to agent sockets
3. Gateway acks requester with `command:result { command: 'reload', success: true }`
4. AgentRunner receives `agent:command`, calls existing `reload()` method (calls `connectInternal`)
5. AgentRunner emits system message to conversation: success or failure feedback

**DB stored:** ✅ Yes

---

### `/ignore <text>` — message:send with skipAgent flag

**Purpose:** User sends a message visible to all participants in the conversation but the agent does **not** process it. For human-to-human side discussion in an agent conversation.

**How it works:** Handled entirely in `message:send` — no `command:send`, no `agent:command`. The gateway detects the `/ignore ` prefix, strips it, and sets `metadata.skipAgent = true` on the saved Action.

**Flow:**
```
User sends: message:send { content: '/ignore Hey can you check this?' }
  → Gateway detects /ignore prefix
  → Strips prefix → content = 'Hey can you check this?'
  → Saves ActionType.MESSAGE, metadata.skipAgent = true
  → Broadcasts message:new { content: 'Hey can you check this?', skipAgent: true, ... }
  → AgentRunner.handleMessage() sees skipAgent === true → returns early (no LLM call)
  → Other users in room see the message normally
```

**Constraints:**
- Only `user` type clients (authorized JWT). Anonymous clients cannot use `/ignore`.
- The stripped content (after `/ignore `) must be non-empty, otherwise gateway rejects with `message:error`.
- No `command:result` ack — the normal `message:sent` ack is returned.

**DB stored:** ✅ Yes — as `ActionType.MESSAGE` with `metadata.skipAgent = true`

**Why not `command:send`?** Because the message needs to appear in conversation history and be visible to all participants. Commands produce system/ack events, not chat messages.

---

### `/inspect` → `agent:command { type: 'inspect' }`

**Purpose:** Request the agent worker to report its current runtime config. Read-only, no side effects.

**Payload:**
```json
{
  "command": "inspect",
  "conversationId": "<optional>"
}
```

**Process:**
1. Gateway emits `agent:command { type: 'inspect' }` to agent sockets (no DB write)
2. AgentRunner receives, emits sanitized runtime config as a `system` type `message:send` back to conversation

**Response shape (as system message in conversation):**
```json
{
  "agentId": "...",
  "agentName": "...",
  "deployment": { "model": "...", "provider": "..." },
  "settings": { "maxConcurrency": 5, "maxSteps": 10, "heartbeatIntervalMs": 30000 },
  "allowedFunctionsCount": 12,
  "isBusy": false,
  "isConnected": true,
  "isReloading": false
}
```

> Note: `accessToken`, `mcpServers` headers, and other secrets are **never** included.

**DB stored:** ❌ No

---

## DB Changes

### `action.enum.ts` — add `COMMAND`

```typescript
export enum ActionType {
  // Content
  MESSAGE = 'message',
  THINKING = 'thinking',
  TOOL_USE = 'tool_use',
  TOOL_RESULT = 'tool_result',
  ERROR = 'error',

  // Command (new)
  COMMAND = 'command',

  // Event
  JOINED = 'joined',
  LEFT = 'left',
  HANDOFF = 'handoff',
  NOTICE = 'notice',
}
```

### Action record for commands

No schema changes needed. `ActionMetadata` already has an open `any` shape. Command metadata uses:

```typescript
// For /stop and /reload
metadata: {
  commandName: 'stop' | 'reload',   // which command
  reason?: string,                   // optional reason from payload
  targetConversationId?: string,     // conversationId the command targets
}

// For /ignore (ActionType.MESSAGE, not COMMAND)
metadata: {
  skipAgent: true,                   // agent must not process this message
}
```

---

## Files to Change

| File | Change |
|------|--------|
| `services/aiwm/src/modules/action/action.enum.ts` | Add `COMMAND = 'command'` |
| `services/aiwm/src/modules/chat/chat.gateway.ts` | Rename `chat:heartbeat` → `agent:heartbeat`; add `command:send` handler; intercept `/ignore` prefix in `message:send` handler |
| `services/aiwm/src/modules/agent-worker/agent-runner.ts` | Add `socket.on('agent:command', ...)` handler; remove `/stop` and `/reload` string match from `handleMessage()`; skip messages where `skipAgent === true` |

---

## What is NOT changed

- `message:send` — commands no longer travel through this path (no backward compat needed; AgentRunner is internal)
- `ActionSchema` — no new fields, `metadata` is already flexible
- Connection Worker — can use `command:send` event the same as any WS client

---

## Decisions

### 1. Who can issue commands?
**Only authorized (JWT) users.** Anonymous clients cannot emit `command:send`. Gateway rejects with `command:result { success: false, error: 'Unauthorized' }` if `client.data.type === 'anonymous'`.

### 2. `/inspect` response visibility
**Visible to all participants in the conversation** as a `type: 'system'` message. AgentRunner is responsible for masking sensitive fields (`accessToken`, MCP server headers, secrets) before emitting.

### 3. Agent offline behavior

"Agent offline" means `chatService.getAgentSocketIds(agentId)` returns an empty array — the agent has no active socket connections to `/ws/chat`.

Each command is handled differently:

#### `/stop` — error immediately
If agent is offline there is nothing to abort. No DB write (nothing happened).
```
command:result { success: false, error: 'Agent is not connected' }
```

#### `/reload` — error immediately
If agent is offline, queuing is not useful: when AgentRunner reconnects it already calls `connectInternal()` as part of the `connect()` flow, so it will pick up fresh config automatically.
```
command:result { success: false, error: 'Agent is not connected' }
```
> The DB Action record is still saved so there is an audit trail that a reload was requested while the agent was offline.

#### `/inspect` — error immediately
Cannot get runtime state from a disconnected runner.
```
command:result { success: false, error: 'Agent is not connected' }
```
> No DB write for `/inspect` (read-only command).

#### Summary table

| Command | Agent offline behavior | DB write |
|---------|----------------------|----------|
| `/stop` | Error immediately, no DB write | ❌ |
| `/reload` | Error immediately, **DB write** (audit: reload was requested) | ✅ |
| `/inspect` | Error immediately, no DB write | ❌ |
