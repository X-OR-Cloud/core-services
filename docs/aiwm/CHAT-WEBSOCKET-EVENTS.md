# Chat WebSocket — Event & Payload Reference

Namespace: **`/ws/chat`** (Socket.IO)
Gateway: `services/aiwm/src/modules/chat/chat.gateway.ts`
Agent client: `services/aiwm/src/modules/agent-worker/agent-runner.ts`

---

## Connection & Authentication

All clients must provide a JWT on connect. The gateway identifies client type from the token payload.

### URL parsing

The WebSocket URL (`wss://host/ws/chat`) must be split into **origin** and **namespace** before passing to Socket.IO — otherwise the path is treated as the server origin and the connection fails.

```ts
// ops-portal: src/components/aiwm/GlobalAgentChat/hooks/useGlobalChatSocket.ts
function parseWsUrl(wsUrl: string): { origin: string; namespace: string } {
  const u = new URL(wsUrl);
  const namespace = u.pathname && u.pathname !== '/' ? u.pathname : '/';
  const origin = `${u.protocol}//${u.host}`;
  return { origin, namespace };
}

const { origin, namespace } = parseWsUrl('wss://skt.x-or.cloud/ws/chat');
// origin    → 'wss://skt.x-or.cloud'
// namespace → '/ws/chat'

const socket = io(`${origin}${namespace}`, {
  auth: { token },     // primary — read by gateway from handshake.auth.token
  query: { token },    // fallback — read from handshake.query.token
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
});
```

> Token is sent in both `auth` and `query` for compatibility with proxies that strip headers. The gateway reads whichever is present first: `handshake.auth.token` → `handshake.headers.authorization` → `handshake.query.token`.

### Connection lifecycle (user client)

```ts
socket.on('connect', () => {
  // 1. Pick an agent — creates/resumes conversation
  socket.emit('agent:connect', { agentId }, (res) => {
    // res.conversationId — store this for subsequent message:send calls
  });
});

// 2. If conversationId is known (resume existing), join directly instead
socket.emit('conversation:join', { conversationId }, (res) => { ... });

// 3. Switch agent at runtime — re-emit agent:connect
socket.emit('agent:connect', { agentId: newAgentId }, (res) => { ... });

// 4. Listen for incoming messages
socket.on('message:new', (msg) => { ... });
socket.on('agent:typing', (data) => { ... });
socket.on('presence:update', (data) => { ... });

// 5. Send a message
socket.emit('message:send', {
  conversationId,
  role: 'user',
  content: 'Hello!',
  references: [],   // optional
}, (ack) => {
  // ack.success / ack.error
});

// 6. Cleanup on unmount
socket.disconnect();
```

### Token types

| Token type | JWT fields | Client type set |
|-----------|------------|-----------------|
| User JWT | `sub` (userId), `orgId`, `roles`, `username` | `user` |
| Agent JWT | `sub` or `agentId`, `orgId`, `type: 'agent'` | `agent` |
| Anonymous JWT | `type: 'anonymous'`, `anonymousId`, `agentId`, `orgId`, `tokenId` | `anonymous` |

On connect success, the gateway emits `presence:update` to all clients.
On failure (missing/invalid token), the socket is disconnected immediately with no error event.

**Agent-specific:** The raw JWT is stored as `client.data.token` for use in `agent:heartbeat` → CBM work queries.

---

## Client → Server Events

### `agent:connect`
**Who:** `user` only
**Purpose:** Pick an agent to chat with. Creates or resumes the conversation.

```json
// emit
{ "agentId": "507f1f77bcf86cd799439011" }

// ack
{ "success": true, "conversationId": "507f1f77bcf86cd799439012" }
{ "success": false, "error": "..." }
```

Side effects: joins `conversation:<id>` room, notifies room with `user:joined`.

---

### `conversation:join`
**Who:** `user`, `anonymous`, `agent`
**Purpose:** Resume an existing conversation by ID.

```json
// emit
{ "conversationId": "507f1f77bcf86cd799439012" }

// ack
{ "success": true, "conversationId": "507f1f77bcf86cd799439012" }
{ "success": false, "error": "Conversation ... not found" }
```

Side effects: joins `conversation:<id>` room, notifies room with `user:joined`.

---

### `conversation:leave`
**Who:** `user`, `anonymous`, `agent`
**Purpose:** Leave a conversation room.

```json
// emit
{ "conversationId": "507f1f77bcf86cd799439012" }

// ack
{ "success": true, "conversationId": "507f1f77bcf86cd799439012" }
```

Side effects: leaves room, notifies room with `user:left`.

---

### `conversation:online`
**Who:** any
**Purpose:** Query which participants are currently online in a conversation.

```json
// emit
{ "conversationId": "507f1f77bcf86cd799439012" }

// ack
{ "success": true, "onlineUsers": ["userId1", "userId2"] }
```

No side effects.

---

### `message:send`
**Who:** `user`, `anonymous`, `agent`
**Purpose:** Send a chat message. Saved to DB as `Action`, broadcast to conversation room as `message:new`.

```json
// emit
{
  "conversationId": "507f...",        // optional if already joined
  "role": "user" | "assistant",
  "content": "Hello!",
  "type": "message" | "system" | "tool_use" | "tool_result" | "thinking",  // optional, default: message
  "attachments": [                    // optional
    { "type": "image", "url": "https://...", "filename": "photo.png", "mimeType": "image/png", "size": 204800 }
  ],
  "references": [                     // optional
    { "resourceType": "document", "resourceId": "abc", "label": "Spec v2", "content": "..." }
  ]
}

// ack (message:sent emitted to sender)
{ "success": true, "messageId": "<actionId>", "timestamp": "2026-03-18T..." }

// on error (message:error emitted to sender)
{ "success": false, "error": "...", "timestamp": "2026-03-18T..." }
```

**`/ignore` intercept:** If content starts with `/ignore ` (authorized `user` only), the prefix is stripped, the message is saved with `metadata.skipAgent: true`, and broadcast with `skipAgent: true`. The agent skips processing it.

**`type` → `ActionType` mapping:**

| `type` field | ActionType stored |
|-------------|-------------------|
| `system` | `notice` |
| `tool_use` | `tool_use` |
| `tool_result` | `tool_result` |
| `thinking` | `thinking` |
| _(anything else)_ | `message` |

**Agent response bridging:** When `role === 'assistant'`, the gateway also publishes to Redis channel `outbound:message` for the Connection Worker (Discord/Telegram).

---

### `message:typing`
**Who:** `user`, `anonymous`, `agent`
**Purpose:** Typing indicator. Not stored in DB.

```json
// emit
{ "conversationId": "507f...", "isTyping": true }

// ack
{ "success": true }
```

Gateway re-emits to the room as `agent:typing` (if sender is agent) or `user:typing` (if user/anonymous).

---

### `message:read`
**Who:** `user`, `anonymous`
**Purpose:** Mark a message as read. Not stored in DB.

```json
// emit
{ "conversationId": "507f...", "messageId": "<actionId>" }

// ack
{ "success": true }
```

Gateway re-emits `message:read` to the rest of the room.

---

### `agent:heartbeat`
**Who:** `agent` only
**Purpose:** Keep-alive + working status update. Mirrors `POST /agents/heartbeat`. Updates `lastHeartbeatAt` in DB. When `status: 'idle'`, server queries CBM for next work assignment and pending reminders.

```json
// emit
{
  "status": "idle" | "busy",
  "metrics": { "cpu": 12.5, "ram": 45.0 }   // optional
}

// ack (same shape as POST /agents/heartbeat response)
{ "success": true }

// ack with work assignment (when idle and work available)
{
  "success": true,
  "work": { "id": "...", "title": "...", "type": "task", "status": "todo", "priorityLevel": 2 },
  "systemMessage": "Bạn có công việc mới: ...",
  "systemTask": { "type": "work", "id": "...", "title": "..." }
}

// ack with pending reminders (when idle, no work, but reminders exist)
{
  "success": true,
  "systemMessage": "Bạn có 2 reminder đang chờ xử lý:\n- [id1] content\n...",
  "systemTask": { "type": "reminders", "reminders": [{ "id": "...", "content": "..." }] }
}
```

Not stored in DB. Uses `client.data.token` to authenticate CBM queries.

#### Working status via heartbeat

There is no separate `agent:busy` / `agent:idle` event. Status transitions are reported through `agent:heartbeat` using two firing patterns:

| Trigger | `status` sent | Why |
|---------|--------------|-----|
| Periodic timer (every 30s) | current state | Keep-alive + DB sync |
| `busy → idle` transition (end of `handleMessage`) | `'idle'` | Immediately triggers CBM next-work query without waiting up to 30s |

The **immediate idle heartbeat** fires in the `finally` block of `handleMessage` when `processingMap` becomes fully empty (no active conversations). This ensures the server picks up the next work item right away rather than on the next timer tick.

```
handleMessage finally:
  processingMap.set(conversationId, false)
  if (!this.isBusy) → heartbeatInternal(agentId, 'idle')  // immediate
```

The periodic timer heartbeat continues independently and handles the `idle → busy` status update (sent on next tick after work starts) as well as regular keep-alive when no state change occurs.

---

### `command:send`
**Who:** `user` only (anonymous is rejected)
**Purpose:** Issue a slash command to the agent. Gateway validates, optionally saves to DB, then emits `agent:command` directly to agent socket(s). Does **not** broadcast to the conversation room.

```json
// emit
{
  "command": "stop" | "reload" | "inspect",
  "conversationId": "507f...",   // required for stop; optional for reload/inspect
  "reason": "Taking too long"    // optional, only meaningful for stop
}

// ack
{ "success": true, "command": "stop" }
{ "success": false, "error": "Agent is not connected" }
{ "success": false, "error": "Unauthorized: anonymous clients cannot issue commands" }
{ "success": false, "error": "No agent associated with this connection" }
```

**DB storage per command:**

| Command | Agent online | DB write |
|---------|-------------|----------|
| `stop` | ✅ | `ActionType.COMMAND` |
| `stop` | ❌ (offline) | ❌ |
| `reload` | ✅ | `ActionType.COMMAND` |
| `reload` | ❌ (offline) | `ActionType.COMMAND` (audit trail) |
| `inspect` | ✅ | ❌ |
| `inspect` | ❌ (offline) | ❌ |

---

## Server → Client Events

### `message:new`
**To:** all participants in `conversation:<id>` room
**Trigger:** `message:send` from any client, or inbound from Connection Worker via Redis `chat:message-new`.

```json
{
  "_id": "<actionId>",
  "conversationId": "507f...",
  "role": "user" | "assistant",
  "content": "Hello!",
  "type": "message" | "system" | "tool_use" | "tool_result" | "thinking",
  "userId": "...",           // present if sender is user/anonymous
  "username": "john",        // present if sender is user
  "skipAgent": true,         // present only for /ignore messages
  "attachments": [...],      // if any
  "references": [...]        // if any
}
```

> **Agent deduplication:** `AgentRunner` tracks `seenMessageIds` (max 200) to drop duplicates caused by multi-room membership. Messages where `role === 'assistant'` or `agentId === this.config.agentId` are also skipped.

---

### `message:sent`
**To:** sender only
**Trigger:** successful `message:send`.

```json
{ "success": true, "messageId": "<actionId>", "timestamp": "2026-03-18T..." }
```

---

### `message:error`
**To:** sender only
**Trigger:** error during `message:send`.

```json
{ "success": false, "error": "No conversation found. Please emit agent:connect or conversation:join first.", "timestamp": "2026-03-18T..." }
```

---

### `message:read`
**To:** all other participants in the room
**Trigger:** `message:read` from a client.

```json
{
  "type": "user" | "anonymous",
  "userId": "...",
  "agentId": null,
  "messageId": "<actionId>",
  "conversationId": "507f...",
  "timestamp": "2026-03-18T..."
}
```

---

### `agent:typing`
**To:** all participants in the room (except sender)
**Trigger:** `message:typing` from an agent client.

```json
{
  "type": "agent",
  "userId": null,
  "agentId": "507f...",
  "conversationId": "507f...",
  "isTyping": true,
  "timestamp": "2026-03-18T..."
}
```

---

### `user:typing`
**To:** all participants in the room (except sender)
**Trigger:** `message:typing` from a user/anonymous client.

```json
{
  "type": "user" | "anonymous",
  "userId": "...",
  "agentId": null,
  "conversationId": "507f...",
  "isTyping": false,
  "timestamp": "2026-03-18T..."
}
```

---

### `presence:update`
**To:** all connected clients (global broadcast)
**Trigger:** any client connects or disconnects.

```json
// user/agent connected
{ "type": "user" | "agent", "userId": "...", "agentId": "...", "status": "online", "timestamp": "..." }

// anonymous connected (includes conversationId — auto-assigned)
{ "type": "anonymous", "userId": "<anonymousId>", "agentId": "...", "conversationId": "...", "status": "online", "timestamp": "..." }

// agent already online when user joins room (sent to joining client only)
{ "type": "agent", "agentId": "...", "status": "online", "timestamp": "..." }

// any client disconnected
{ "type": "user" | "agent" | "anonymous", "userId": "...", "agentId": "...", "status": "offline", "timestamp": "..." }
```

---

### `user:joined`
**To:** other participants in the room
**Trigger:** `agent:connect` or `conversation:join`.

```json
{
  "type": "user" | "anonymous" | "agent",
  "userId": "...",
  "agentId": "...",
  "conversationId": "507f...",
  "timestamp": "2026-03-18T..."
}
```

---

### `user:left`
**To:** other participants in the room
**Trigger:** `conversation:leave`.

```json
{
  "type": "user" | "anonymous" | "agent",
  "userId": "...",
  "agentId": "...",
  "conversationId": "507f...",
  "timestamp": "2026-03-18T..."
}
```

---

## Server → Agent (Direct, Not Broadcast)

### `agent:command`
**To:** agent socket(s) only (via `server.in(agentSocketIds).emit(...)`)
**Trigger:** `command:send` from an authorized user.

```json
{ "type": "stop",    "conversationId": "507f...", "reason": "Taking too long" }
{ "type": "reload",  "conversationId": "507f..." }
{ "type": "inspect", "conversationId": "507f..." }
```

**AgentRunner handling:**

| `type` | Action |
|--------|--------|
| `stop` | Calls `abortMap.get(conversationId)?.abort()`. Emits system message to conversation. |
| `reload` | Calls `connectInternal(agentId)` to re-fetch config from AIWM. Emits system message with result. |
| `inspect` | Emits sanitized runtime config as system message to conversation. Never includes `accessToken` or MCP server headers. |

**`inspect` response shape** (emitted as `message:send` type `system` by agent):
```json
{
  "agentId": "507f...",
  "agentName": "My Agent",
  "deployment": { "model": "gpt-4o", "provider": "openai" },
  "settings": { "maxConcurrency": 5, "maxSteps": 10, "heartbeatIntervalMs": 30000, "reconnectDelayMs": 5000 },
  "allowedFunctionsCount": 12,
  "isBusy": false,
  "isConnected": true,
  "isReloading": false
}
```

---

## Redis Internal Channels

These are internal to the AIWM service — not exposed to clients.

| Channel | Publisher | Subscriber | Purpose |
|---------|-----------|-----------|---------|
| `agent:join-room` | Connection Worker | ChatGateway | Force agent sockets to join a conversation room when a new conversation starts via Discord/Telegram |
| `chat:message-new` | Connection Worker | ChatGateway | Broadcast inbound Discord/Telegram messages to the conversation room |
| `outbound:message` | ChatGateway | Connection Worker | Bridge agent responses back to Discord/Telegram |

Distributed lock keys:
- `lock:chat-msg:<msgNonce>` — prevents duplicate processing of inbound messages across WS instances
- `lock:outbound:<actionId>` — prevents duplicate outbound bridging across WS instances

---

## DB Storage Summary

| Event | ActionType | Actor | Stored? |
|-------|-----------|-------|---------|
| `message:send` (message) | `message` | user / agent | ✅ |
| `message:send` (system) | `notice` | user / agent | ✅ |
| `message:send` (tool_use) | `tool_use` | agent | ✅ |
| `message:send` (tool_result) | `tool_result` | agent | ✅ |
| `message:send` (thinking) | `thinking` | agent | ✅ |
| `message:send` (/ignore) | `message` + `metadata.skipAgent: true` | user | ✅ |
| `command:send` (stop/reload) | `command` + `metadata.commandName` | user | ✅ |
| `command:send` (inspect) | — | — | ❌ |
| `agent:heartbeat` | — | — | ❌ (uses `Agent.lastHeartbeatAt`) |
| `message:typing` | — | — | ❌ |
| `message:read` | — | — | ❌ |
| `conversation:join/leave` | — | — | ❌ |
