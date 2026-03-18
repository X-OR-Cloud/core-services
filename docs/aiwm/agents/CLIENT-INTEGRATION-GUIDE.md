# Agent Client Integration Guide - AIWM

## Overview

This guide explains how to integrate an AI agent client with AIWM (AI Workload Manager) controller. The integration follows a simple flow:

1. Agent connects to AIWM with agentId + secret
2. AIWM validates credentials and returns JWT token + configuration
3. Agent uses configuration to initialize Claude Code SDK
4. Agent connects to `/ws/chat` WebSocket to receive messages and send responses
5. Agent sends periodic heartbeat to report status

## Integration Architecture

```
┌─────────────────┐                  ┌──────────────────┐
│  Agent Client   │                  │  AIWM Controller │
│  (Your Code)    │                  │                  │
└────────┬────────┘                  └────────┬─────────┘
         │                                    │
         │  1. POST /agents/:id/connect       │
         │     { secret: "..." }              │
         ├───────────────────────────────────>│
         │                                    │
         │  2. Validate credentials           │
         │     Check secret hash              │
         │     Check agent status             │
         │                                    │
         │  3. Return configuration           │
         │     { token, instruction,          │
         │       tools, settings }            │
         │<───────────────────────────────────┤
         │                                    │
         │  4. Initialize agent with config   │
         │     - Claude Code SDK              │
         │     - Platform (Discord/Telegram)  │
         │                                    │
         │  5. Connect WebSocket /ws/chat     │
         │     Authorization: Bearer {token} │
         ├───────────────────────────────────>│
         │                                    │
         │  6. Emit conversation:join         │
         │     { conversationId }             │
         ├───────────────────────────────────>│
         │                                    │
         │  7. Listen message:new             │
         │     (apply filter rules below)     │
         │<───────────────────────────────────┤
         │                                    │
         │  8. Emit message:send (response)   │
         │     { role: "assistant", ... }     │
         ├───────────────────────────────────>│
         │                                    │
         │  9. agent:heartbeat (every 30s)    │
         │     { status: "idle"|"busy" }      │
         ├───────────────────────────────────>│
         │                                    │
```

## API Specification

### 1. Agent Connection API

**Endpoint:** `POST /agents/:id/connect`

**Authentication:** None (public endpoint)

**Request:**
```json
{
  "secret": "agent-secret-from-admin"
}
```

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "instruction": "You are a helpful AI assistant...\n\n## Guidelines\n1. Be polite\n2. Be accurate",
  "tools": [
    {
      "_id": "tool-id-1",
      "name": "read-file",
      "type": "builtin",
      "description": "Read files from filesystem",
      "category": "productivity",
      "schema": {
        "inputSchema": { "type": "object", "properties": { "path": { "type": "string" } } },
        "outputSchema": { "type": "object", "properties": { "content": { "type": "string" } } }
      }
    }
  ],
  "agent": {
    "id": "agent-id",
    "name": "My Agent",
    "orgId": "org-id"
  },
  "settings": {
    "claudeModel": "claude-3-5-haiku-latest",
    "maxTurns": 100,
    "permissionMode": "bypassPermissions",
    "resume": true,
    "claudeOAuthToken": "oauth-token-here",
    "discord": {
      "token": "discord-token",
      "channelIds": ["123456789"],
      "botId": "bot-id"
    },
    "telegram": {
      "token": "telegram-token",
      "groupIds": ["-1001234567890"],
      "botUsername": "my_bot"
    }
  }
}
```

**Response Fields:**
- `token` (string): JWT token for authenticating subsequent requests (expires in 24h)
- `instruction` (string): Merged instruction text (systemPrompt + guidelines)
- `tools` (array): List of tools agent is allowed to use (whitelist)
- `agent` (object): Basic agent information
- `settings` (object, optional): Runtime configuration including Claude SDK settings and platform tokens

**Error Responses:**
- `401 Unauthorized`: Invalid secret or agent is suspended
- `404 Not Found`: Agent does not exist

**Processing Logic:**
1. Validate agentId exists and not deleted
2. Check agent status is not 'suspended'
3. Verify secret using bcrypt comparison
4. Generate JWT token with 24h expiry
5. Fetch instruction by instructionId
6. Format instruction: systemPrompt + numbered guidelines
7. Fetch allowed tools by allowedToolIds (only active tools)
8. Update agent.lastConnectedAt and increment agent.connectionCount
9. Return all configuration

### 2. Agent Heartbeat API

**Endpoint:** `POST /agents/:id/heartbeat`

**Authentication:** Required (Bearer token from connect response)

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Request:**
```json
{
  "status": "online",
  "metrics": {
    "cpu": 45,
    "memory": 60,
    "uptime": 3600,
    "activeConnections": 3
  }
}
```

**Request Fields:**
- `status` (string, required): Agent status - "online", "busy", or "idle"
- `metrics` (object, optional): Custom metrics to report

**Response (200 OK):**
```json
{
  "success": true
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid or expired JWT token
- `404 Not Found`: Agent does not exist

**Processing Logic:**
1. Validate JWT token
2. Find agent by ID
3. Update agent.lastHeartbeatAt to current timestamp
4. Log heartbeat with status and metrics
5. Return success

**Recommended Frequency:** Every 60 seconds

### 3. Regenerate Credentials API (Admin Only)

**Endpoint:** `POST /agents/:id/credentials/regenerate`

**Authentication:** Required (Admin JWT token)

**Response (200 OK):**
```json
{
  "agentId": "agent-id",
  "secret": "new-randomly-generated-secret-here",
  "envConfig": "# ===== AIWM Integration =====\nAIWM_ENABLED=true\n...",
  "installScript": "#!/bin/bash\n# Installation script\n..."
}
```

**Response Fields:**
- `agentId` (string): Agent ID
- `secret` (string): Plain text secret (only shown once, not stored)
- `envConfig` (string): Pre-formatted .env configuration snippet
- `installScript` (string): Installation script (placeholder/sample)

**Processing Logic:**
1. Generate new random secret (32 bytes hex)
2. Hash secret with bcrypt (10 rounds)
3. Update agent.secret in database
4. Build .env configuration snippet with:
   - AIWM integration settings
   - Claude Code SDK settings from agent.settings
   - Platform tokens from agent.settings
5. Build installation script (placeholder)
6. Return credentials (secret is plain text)

## Integration Flow

### Phase 1: Admin Setup (AIWM)

1. Admin creates agent in AIWM via API or dashboard
2. Admin assigns instruction to agent (instructionId)
3. Admin assigns tools to agent (allowedToolIds array)
4. Admin configures settings (Claude SDK configs, platform tokens)
5. Admin calls regenerate credentials API
6. Admin provides .env configuration to agent developer

### Phase 2: Agent Client Implementation

**Step 1: Environment Configuration**

Agent developer receives `.env` file from admin:

```bash
# Core AIWM settings
AIWM_ENABLED=true
AIWM_BASE_URL=https://api.x-or.cloud/dev/aiwm
AIWM_AGENT_ID=693f3a2c8d1e5b4a7c9f1d3e
AIWM_AGENT_SECRET=a1b2c3d4e5f6...

# Agent info
AGENT_NAME=Customer Support Agent

# Claude Code SDK (provided by AIWM settings)
CLAUDE_MODEL=claude-3-5-haiku-latest
CLAUDE_MAX_TURNS=100
CLAUDE_PERMISSION_MODE=bypassPermissions
CLAUDE_RESUME=true
CLAUDE_CODE_OAUTH_TOKEN=oauth-token-if-configured

# Platform tokens (provided by AIWM settings)
DISCORD_TOKEN=discord-token-if-configured
DISCORD_CHANNEL_ID=channel-ids-comma-separated
TELEGRAM_BOT_TOKEN=telegram-token-if-configured
TELEGRAM_GROUP_ID=group-ids-comma-separated
```

**Step 2: Agent Startup Flow**

```
1. Agent starts
   ↓
2. Load .env configuration
   ↓
3. Call AIWM connect API
   POST /agents/{AIWM_AGENT_ID}/connect
   { secret: AIWM_AGENT_SECRET }
   ↓
4. Receive response:
   - JWT token (save for heartbeat)
   - instruction (use for Claude SDK)
   - tools (use for Claude SDK)
   - settings (use for Claude SDK + platforms)
   ↓
5. Initialize Claude Code SDK:
   - model: settings.claudeModel || env.CLAUDE_MODEL
   - maxTurns: settings.maxTurns || env.CLAUDE_MAX_TURNS
   - instruction: response.instruction
   - allowedTools: response.tools.map(t => t.name)
   - permissionMode: settings.permissionMode
   - resume: settings.resume
   - oauthToken: settings.claudeOAuthToken
   ↓
6. Initialize platforms (Discord/Telegram):
   - Use settings.discord.token || env.DISCORD_TOKEN
   - Use settings.telegram.token || env.TELEGRAM_BOT_TOKEN
   ↓
7. Start heartbeat (every 60 seconds):
   POST /agents/{AIWM_AGENT_ID}/heartbeat
   Headers: { Authorization: "Bearer {JWT_TOKEN}" }
   Body: { status: "online", metrics: {...} }
   ↓
8. Agent is ready to operate
```

**Step 3: Connect to WebSocket `/ws/chat`**

After obtaining the token from the connect API, agent must connect to `/ws/chat` to receive and respond to messages:

```ts
import { io } from 'socket.io-client';

// Parse WS URL correctly — origin and namespace must be split
const wsUrl = process.env.AIWM_WS_URL; // e.g. wss://skt.x-or.cloud/ws/chat
const u = new URL(wsUrl);
const origin = `${u.protocol}//${u.host}`;
const namespace = u.pathname; // '/ws/chat'

const socket = io(`${origin}${namespace}`, {
  auth: { token: connectResponse.token },
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 5000,
});

socket.on('connect', () => {
  // Join the conversation room
  socket.emit('conversation:join', { conversationId }, (res) => {
    if (!res.success) console.error('Failed to join conversation:', res.error);
  });
});

// Dedup set — prevents processing same message twice (multi-socket delivery)
const seenIds = new Set<string>();

socket.on('message:new', (msg) => {
  // 1. Dedup by actionId
  if (msg._id && seenIds.has(msg._id)) return;
  if (msg._id) {
    seenIds.add(msg._id);
    if (seenIds.size > 200) seenIds.delete(seenIds.values().next().value);
  }

  // 2. Skip non-user messages (agent echo, notices, internal steps)
  if (msg.role === 'assistant') return;       // own response echoed back
  if (msg.skipAgent === true) return;          // /ignore command
  if (msg.type && msg.type !== 'message') return; // system/tool_use/tool_result/thinking

  // 3. Process user message
  handleUserMessage(msg);
});

socket.on('disconnect', (reason) => {
  console.warn('WS disconnected:', reason);
  // socket.io reconnection handles reconnect automatically
});

// Send response back
async function handleUserMessage(msg: any) {
  const response = await runAgent(msg.content); // your Claude SDK call
  socket.emit('message:send', {
    conversationId: msg.conversationId,
    role: 'assistant',
    content: response,
  });
}
```

**Why filtering is required:** The gateway broadcasts **all** `message:new` events to every socket in the room — including the agent's own responses (`role=assistant`), internal step notifications (`type=system/tool_use/tool_result/thinking`), and `/ignore` messages. Without filtering, the agent will receive and attempt to process its own output, causing cascading busy-rejects or duplicate LLM invocations.

**Step 4: Heartbeat via WebSocket**

Prefer `agent:heartbeat` over `POST /agents/:id/heartbeat` when connected to `/ws/chat` — it avoids an extra HTTP round-trip and triggers immediate CBM work assignment when the agent becomes idle:

```ts
// Periodic heartbeat (every 30 seconds)
setInterval(() => {
  socket.emit('agent:heartbeat', { status: isBusy ? 'busy' : 'idle' }, (res) => {
    if (res.systemMessage) {
      // Work assignment or reminder injected by server
      console.log('Server system message:', res.systemMessage);
    }
  });
}, 30_000);

// Immediate idle heartbeat after finishing a task
async function handleUserMessage(msg: any) {
  isBusy = true;
  try {
    const response = await runAgent(msg.content);
    socket.emit('message:send', { conversationId: msg.conversationId, role: 'assistant', content: response });
  } finally {
    isBusy = false;
    // Notify server immediately — triggers next work assignment without waiting 30s
    socket.emit('agent:heartbeat', { status: 'idle' });
  }
}
```

**Step 5: Runtime Behavior**

- **Heartbeat**: `agent:heartbeat` every 30 seconds via WebSocket (fallback: `POST /agents/:id/heartbeat` every 60 seconds if WS unavailable)
- **Token Refresh**: JWT expires in 24h, reconnect WS with new token every 23h
- **Error Handling**: If AIWM connection fails, fallback to local configuration
- **Graceful Shutdown**: Leave conversation room, disconnect socket, stop heartbeat on SIGINT/SIGTERM

**Step 4: Configuration Updates**

When admin updates instruction/tools/settings in AIWM:
1. Admin makes changes in AIWM
2. Agent must restart to receive new configuration
3. On restart, agent calls connect API and gets updated config

## Implementation Requirements

### Required Components

1. **AIWM Client Module**
   - Connect to AIWM (`POST /agents/:id/connect`)
   - Store JWT token for WS auth and heartbeat
   - Handle errors (401, 404, timeout)

2. **Configuration Manager**
   - Load .env variables
   - Parse AIWM response
   - Merge AIWM settings with env vars (AIWM takes precedence)
   - Provide config to Claude SDK and platforms

3. **WebSocket Client (`/ws/chat`)**
   - Connect with agent JWT token
   - Emit `conversation:join` on connect
   - Listen to `message:new` with correct filter rules (see above)
   - Emit `message:send` with `role: 'assistant'` for responses
   - Emit `agent:heartbeat` every 30 seconds + immediately after each task completes
   - Reconnect automatically on disconnect

4. **Message Dedup Set**
   - Track `_id` of received `message:new` events (max 200 entries, rotate oldest)
   - Prevents double-processing when agent has multiple sockets across WS instances

5. **Auto-Reconnect Service**
   - Reconnect WS every 23 hours (before 24h token expiry) with fresh token from `connect` API
   - Handle `disconnect` events and re-join conversation room after reconnect

6. **Graceful Shutdown**
   - Emit `conversation:leave` before disconnecting
   - Disconnect WebSocket
   - Stop heartbeat timer
   - Log final status

### Configuration Priority

When same setting exists in multiple places:

1. **AIWM settings** (highest priority) - from connect API response
2. **Environment variables** - from .env file
3. **Default values** (lowest priority) - hardcoded fallbacks

Example:
```typescript
const claudeModel =
  aiwmResponse?.settings?.claudeModel ||  // Priority 1: AIWM
  process.env.CLAUDE_MODEL ||              // Priority 2: .env
  'claude-3-5-haiku-latest';               // Priority 3: default
```

## Data Structures

### Agent Settings Object

The `settings` field in agent can contain any JSON-serializable data. Common structure:

```typescript
{
  // Claude Code SDK configuration
  claudeModel?: string;              // e.g., "claude-3-5-haiku-latest"
  maxTurns?: number;                 // e.g., 100
  permissionMode?: string;           // e.g., "bypassPermissions"
  resume?: boolean;                  // e.g., true
  claudeOAuthToken?: string;         // e.g., "oauth-token-here"

  // Discord platform
  discord?: {
    token?: string;                  // Discord bot token
    channelIds?: string[];           // Array of channel IDs
    botId?: string;                  // Discord bot ID
  };

  // Telegram platform
  telegram?: {
    token?: string;                  // Telegram bot token
    groupIds?: string[];             // Array of group IDs
    botUsername?: string;            // Bot username
  };

  // Custom settings (any additional fields)
  [key: string]: any;
}
```

### Tool Schema Object

Each tool in the `tools` array has this structure:

```typescript
{
  _id: string;                       // Tool ID (MongoDB ObjectId)
  name: string;                      // Tool name (unique identifier)
  type: string;                      // "builtin", "custom", "mcp", "api"
  description: string;               // Human-readable description
  category: string;                  // "productivity", "communication", "data", etc.
  status: string;                    // "active" (only active tools are returned)
  schema: {
    inputSchema: object;             // JSON Schema for input
    outputSchema: object;            // JSON Schema for output
  };
}
```

## Error Handling

### Connection Errors

**401 Unauthorized:**
- **Causes:** Invalid secret, agent suspended, wrong agentId
- **Actions:**
  - Verify AIWM_AGENT_ID and AIWM_AGENT_SECRET
  - Contact admin to check agent status
  - Request new credentials if secret is wrong

**404 Not Found:**
- **Causes:** Agent doesn't exist, wrong agentId
- **Actions:**
  - Verify AIWM_AGENT_ID is correct
  - Contact admin to confirm agent exists

**Network Errors:**
- **Causes:** AIWM server down, network issues, timeout
- **Actions:**
  - Implement retry with exponential backoff (3 attempts)
  - Fallback to local configuration if all retries fail
  - Log error and continue with degraded functionality

### Heartbeat Errors

**401 Unauthorized:**
- **Causes:** JWT token expired (>24h), invalid token
- **Actions:**
  - Reconnect to get new token
  - Implement auto-reconnect every 23h to prevent expiry

**404 Not Found:**
- **Causes:** Agent deleted from AIWM
- **Actions:**
  - Stop heartbeat
  - Log critical error
  - Alert admin

**Network Errors:**
- **Causes:** Temporary network issues
- **Actions:**
  - Log error but continue operating
  - Don't throw error (allow agent to continue working)
  - Next heartbeat will retry

### Fallback Strategy

If AIWM connection fails on startup:

1. Log warning that AIWM is unavailable
2. Load instruction from local file (if exists)
3. Use environment variables for configuration
4. Use default values as last resort
5. Agent operates with local config
6. Periodically retry AIWM connection (every 5 minutes)

## Testing

### Manual Testing Steps

1. **Test Connection:**
   ```bash
   curl -X POST http://localhost:3305/agents/{AGENT_ID}/connect \
     -H "Content-Type: application/json" \
     -d '{"secret": "your-secret"}'
   ```

   Expected: 200 OK with token, instruction, tools, settings

2. **Test Heartbeat:**
   ```bash
   curl -X POST http://localhost:3305/agents/{AGENT_ID}/heartbeat \
     -H "Authorization: Bearer {JWT_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"status": "online"}'
   ```

   Expected: 200 OK with {"success": true}

3. **Test Invalid Secret:**
   ```bash
   curl -X POST http://localhost:3305/agents/{AGENT_ID}/connect \
     -H "Content-Type: application/json" \
     -d '{"secret": "wrong-secret"}'
   ```

   Expected: 401 Unauthorized

### Automated Test Script

Use the provided test script to verify AIWM backend:

```bash
./scripts/test-agent-connection.sh
```

This script tests:
- Creating instruction
- Creating tools
- Creating node
- Creating agent with settings
- Regenerating credentials
- Agent connection
- Heartbeat
- Verifying agent details

## Security Considerations

### Secret Management
- **Never commit** secrets to git (.env in .gitignore)
- **Never log** full secrets (only first 10 chars for debugging)
- **Rotate secrets** periodically via regenerate credentials API
- **Store secrets** in environment variables or secret managers

### JWT Token Management
- **Tokens expire** in 24 hours
- **Reconnect** before expiry (recommend 23h interval)
- **Don't share** tokens between agents
- **Don't log** full tokens in production

### Network Security
- **Use HTTPS** in production (not HTTP)
- **Validate SSL** certificates
- **Set timeouts** for all HTTP requests (10s recommended)
- **Handle failures** gracefully without exposing internals

## Best Practices

1. **Auto-Reconnect:** Implement reconnect every 23h to refresh token before 24h expiry
2. **Retry Logic:** Use exponential backoff for connection retries (1s, 2s, 4s)
3. **Graceful Degradation:** Fallback to local config if AIWM unavailable
4. **Heartbeat Resilience:** Don't crash agent if heartbeat fails
5. **Config Validation:** Validate AIWM response before using
6. **Logging:** Log all AIWM interactions with correlation IDs
7. **Health Check:** Expose /health endpoint showing AIWM connection status
8. **Metrics:** Track connection success rate, heartbeat failures, config updates

## Monitoring

### Agent Metrics to Track

- `aiwm_connection_success_total` - Total successful AIWM connections
- `aiwm_connection_failure_total` - Total failed AIWM connections
- `aiwm_heartbeat_success_total` - Total successful heartbeats
- `aiwm_heartbeat_failure_total` - Total failed heartbeats
- `aiwm_token_refresh_total` - Total token refreshes
- `aiwm_config_update_total` - Total config updates received

### AIWM Dashboard (Future)

Admins will be able to monitor:
- Agent connection status (online/offline)
- Last heartbeat timestamp
- Connection count
- Heartbeat failure rate
- Agent health metrics

## Reference

- Full API Documentation: http://localhost:3305/api-docs
- Backend Architecture: [AGENT-CONNECTION-FLOW.md](../../AGENT-CONNECTION-FLOW.md)
- Example Code: [example-integration.ts](./example-integration.ts)
- Test Script: [test-agent-connection.sh](../../../scripts/test-agent-connection.sh)
