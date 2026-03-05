# Agent Management API Specification - Frontend Integration

## Overview

This document provides API specifications for frontend developers to implement Agent Management UI in AIWM platform.

## Base URL

```
Production: https://api.x-or.cloud/dev/aiwm
Development: http://localhost:3305
```

## Authentication

All endpoints require JWT authentication:

```
Authorization: Bearer {admin-jwt-token}
```

---

## API Endpoints

### 1. List Agents

**GET** `/agents`

Get paginated list of agents with filtering and sorting.

**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 10)
- `sort` (string, optional): Sort field, prefix with `-` for descending (e.g., `-createdAt`, `name`)
- `status` (string, optional): Filter by status (`inactive`, `idle`, `busy`, `suspended`)
- `type` (string, optional): Filter by type (`managed`, `autonomous`)
- `name:regex` (string, optional): Filter by name (partial match)
- `tags:in` (string, optional): Filter by tags (comma-separated)

**Response:**
```json
{
  "data": [
    {
      "_id": "agent-id-1",
      "name": "Customer Support Agent",
      "description": "AI agent for customer support",
      "status": "idle",
      "type": "autonomous",
      "framework": "claude-agent-sdk",
      "instructionId": "instruction-id",
      "guardrailId": null,
      "nodeId": null,
      "role": "organization.viewer",
      "tags": ["support", "production"],
      "allowedToolIds": ["tool-id-1", "tool-id-2"],
      "allowedFunctions": [],
      "settings": {
        "claude_model": "claude-3-5-haiku-latest",
        "claude_maxTurns": 100,
        "claude_permissionMode": "bypassPermissions",
        "claude_resume": true,
        "auth_roles": ["agent"]
      },
      "channels": [
        {
          "platform": "discord",
          "label": "Support Channel",
          "enabled": true,
          "token": "***",
          "botId": "1234567890",
          "channelId": "9876543210",
          "requireMentions": true,
          "verboseLogging": false,
          "verboseLoggingTarget": "channel"
        }
      ],
      "lastConnectedAt": "2025-01-15T10:30:00.000Z",
      "lastHeartbeatAt": "2025-01-15T12:45:00.000Z",
      "connectionCount": 42,
      "metadata": {},
      "owner": { "orgId": "org-id" },
      "createdBy": "user-id",
      "updatedBy": "user-id",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-15T12:45:00.000Z",
      "isDeleted": false
    }
  ],
  "pagination": {
    "total": 25,
    "page": 1,
    "limit": 10,
    "totalPages": 3
  },
  "statistics": {
    "total": 25,
    "byStatus": {
      "idle": 10,
      "inactive": 8,
      "busy": 5,
      "suspended": 2
    },
    "byType": {
      "autonomous": 18,
      "managed": 7
    },
    "byFramework": {
      "claude-agent-sdk": 25
    }
  }
}
```

**UI Implementation Notes:**
- Status badges: `idle` = green, `inactive` = gray, `busy` = yellow, `suspended` = red
- Display last heartbeat as relative time (e.g., "5 minutes ago")
- Show connection count as badge
- Mask sensitive data: `token` fields in `channels[]` shown as `***`
- `channels[]` length = number of active channel integrations for this agent

---

### 2. Get Agent Details

**GET** `/agents/:id`

Get detailed information about a specific agent.

**Query Parameters:**
- `populate` (string, optional): Set to `instruction` to include full instruction object

**Response:**
```json
{
  "_id": "agent-id",
  "name": "Customer Support Agent",
  "description": "AI agent for customer support",
  "status": "idle",
  "type": "autonomous",
  "framework": "claude-agent-sdk",
  "instructionId": "instruction-id",
  "guardrailId": null,
  "nodeId": null,
  "role": "organization.viewer",
  "tags": ["support", "production"],
  "allowedToolIds": ["tool-id-1", "tool-id-2"],
  "allowedFunctions": ["Bash", "Read", "mcp__Builtin__CreateWork"],
  "settings": {
    "auth_roles": ["agent"],
    "claude_model": "claude-3-5-haiku-latest",
    "claude_maxTurns": 100,
    "claude_permissionMode": "bypassPermissions",
    "claude_resume": true,
    "claude_oauthToken": "***"
  },
  "channels": [
    {
      "platform": "discord",
      "label": "Support Channel",
      "enabled": true,
      "token": "***",
      "botId": "1234567890",
      "channelId": "9876543210",
      "requireMentions": true,
      "verboseLogging": false,
      "verboseLoggingTarget": "channel"
    },
    {
      "platform": "telegram",
      "label": "Telegram Group",
      "enabled": true,
      "token": "***",
      "botId": "@my_support_bot",
      "channelId": "-1001234567890",
      "requireMentions": false,
      "verboseLogging": true,
      "verboseLoggingTarget": "thread"
    }
  ],
  "lastConnectedAt": "2025-01-15T10:30:00.000Z",
  "lastHeartbeatAt": "2025-01-15T12:45:00.000Z",
  "connectionCount": 42,
  "metadata": {},
  "owner": { "orgId": "org-id" },
  "createdBy": "user-id",
  "updatedBy": "user-id",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-15T12:45:00.000Z",
  "isDeleted": false
}
```

**With `populate=instruction`:**
```json
{
  "_id": "agent-id",
  "name": "Customer Support Agent",
  "instructionId": {
    "_id": "instruction-id",
    "name": "Support Agent Instruction",
    "systemPrompt": "You are a helpful assistant...",
    "guidelines": ["Be polite", "Be accurate"],
    "status": "active"
  }
}
```

---

### 3. Create Agent

**POST** `/agents`

Create a new agent.

**Request Body:**
```json
{
  "name": "Customer Support Agent",
  "description": "AI agent for customer support",
  "type": "autonomous",
  "framework": "claude-agent-sdk",
  "instructionId": "instruction-id",
  "guardrailId": null,
  "nodeId": null,
  "role": "organization.viewer",
  "tags": ["support", "production"],
  "secret": "optional-custom-secret",
  "allowedToolIds": ["tool-id-1", "tool-id-2"],
  "allowedFunctions": [],
  "settings": {
    "auth_roles": ["agent"],
    "claude_model": "claude-3-5-haiku-latest",
    "claude_maxTurns": 100,
    "claude_permissionMode": "bypassPermissions",
    "claude_resume": true,
    "claude_oauthToken": "optional-oauth-token"
  },
  "channels": [
    {
      "platform": "discord",
      "label": "Support Channel",
      "enabled": true,
      "token": "discord-bot-token",
      "botId": "1234567890",
      "channelId": "9876543210",
      "requireMentions": true,
      "verboseLogging": false,
      "verboseLoggingTarget": "channel"
    }
  ]
}
```

**Field Descriptions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Agent display name |
| `description` | string | Yes | Agent description |
| `type` | enum | Yes | `managed` (system-deployed) or `autonomous` (user-deployed) |
| `framework` | enum | No | `claude-agent-sdk` (default) |
| `instructionId` | string | No | ID of instruction (system prompt) to assign |
| `guardrailId` | string | No | ID of guardrail (content filter) to assign |
| `nodeId` | string | No | Node ID — required only for `managed` type |
| `role` | enum | No | RBAC role: `organization.editor` or `organization.viewer` (default) |
| `tags` | string[] | No | Tags for categorization |
| `secret` | string | No | Custom secret for auth (hashed). Random if omitted |
| `allowedToolIds` | string[] | No | Whitelist of MCP tool set IDs |
| `allowedFunctions` | string[] | No | Whitelist of runtime functions (e.g. `["Bash", "Read"]`). Empty = all allowed |
| `settings` | object | No | Runtime config (see Settings Keys below) |
| `channels` | ChannelConfig[] | No | Structured channel configs for Discord/Telegram |

**Settings Keys:**

| Key | Type | Description |
|-----|------|-------------|
| `auth_roles` | string[] | Agent RBAC roles (default: `["agent"]`) |
| `claude_model` | string | Claude model (e.g. `claude-3-5-haiku-latest`) |
| `claude_maxTurns` | number | Max conversation turns (default: 100) |
| `claude_permissionMode` | string | `bypassPermissions` for managed agents |
| `claude_resume` | boolean | Enable resume capability |
| `claude_oauthToken` | string | OAuth token for Claude API (optional) |

**Response:**
```json
{
  "_id": "newly-created-agent-id",
  "name": "Customer Support Agent",
  "status": "inactive",
  "channels": [...],
  "createdAt": "2025-01-15T13:00:00.000Z",
  "updatedAt": "2025-01-15T13:00:00.000Z"
}
```

> **Note:** `secret` is hashed and NOT returned. Use `/credentials/regenerate` to retrieve credentials.

---

### 4. Update Agent

**PATCH** `/agents/:id`

Update an existing agent. All fields are optional (partial update).

**Request Body:**
```json
{
  "name": "Updated Agent Name",
  "status": "inactive",
  "instructionId": "new-instruction-id",
  "role": "organization.editor",
  "allowedToolIds": ["tool-id-3"],
  "allowedFunctions": ["Bash", "Read", "mcp__Builtin__CreateWork"],
  "settings": {
    "claude_model": "claude-3-5-sonnet-latest",
    "claude_maxTurns": 50
  },
  "channels": [
    {
      "platform": "discord",
      "label": "Updated Channel",
      "enabled": true,
      "token": "new-discord-bot-token",
      "botId": "1234567890",
      "channelId": "9876543210",
      "requireMentions": false,
      "verboseLogging": true,
      "verboseLoggingTarget": "thread"
    }
  ]
}
```

> **Note:** `channels[]` replaces the **entire** channels array when provided. To disable one channel, send the full array with `enabled: false` on that entry.

**Response:** Updated agent object (same shape as Get Agent Details).

---

### 5. Delete Agent

**DELETE** `/agents/:id`

Soft delete an agent (sets `isDeleted: true`).

**Response:**
```json
{
  "message": "Agent deleted successfully"
}
```

---

### 6. Regenerate Agent Credentials

**POST** `/agents/:id/credentials/regenerate`

Generate new credentials for an agent. This is the **only** way to retrieve the plain text secret.

**Response:**
```json
{
  "agentId": "agent-id",
  "secret": "f8e7d6c5b4a39281706f5e4d3c2b1a09",
  "envConfig": "# ===== AIWM Integration =====\nAIWM_ENABLED=true\nAIWM_BASE_URL=https://api.x-or.cloud/dev/aiwm\nAIWM_AGENT_ID=agent-id\nAIWM_AGENT_SECRET=f8e7d6c5b4a39281706f5e4d3c2b1a09\n\n# ===== Agent Info =====\nAGENT_NAME=Customer Support Agent\n\n# ===== Claude SDK Configuration =====\nCLAUDE_MODEL=claude-3-5-haiku-latest\nCLAUDE_MAX_TURNS=100\nCLAUDE_PERMISSION_MODE=bypassPermissions\nCLAUDE_RESUME=true\n\n# ===== Discord Channel: Support Channel =====\nDISCORD_TOKEN=discord-token\nDISCORD_CHANNEL_ID=9876543210\nDISCORD_BOT_ID=1234567890\nDISCORD_REQUIRE_MENTIONS=true\nDISCORD_VERBOSE_LOGGING=false\nDISCORD_VERBOSE_LOGGING_TARGET=channel\n",
  "installScript": "#!/bin/bash\n# Agent Installation Script\n..."
}
```

---

### 7. Agent Statistics (from List Response)

The `GET /agents` response includes `statistics` with breakdowns by status, type, and framework:

```json
{
  "statistics": {
    "total": 25,
    "byStatus": {
      "idle": 10,
      "inactive": 8,
      "busy": 5,
      "suspended": 2
    },
    "byType": {
      "autonomous": 18,
      "managed": 7
    },
    "byFramework": {
      "claude-agent-sdk": 25
    }
  }
}
```

---

## Data Structures

### Agent

```typescript
interface Agent {
  _id: string;
  name: string;
  description: string;
  status: 'inactive' | 'idle' | 'busy' | 'suspended';
  type: 'managed' | 'autonomous';
  framework: 'claude-agent-sdk';
  instructionId?: string;
  guardrailId?: string;
  nodeId?: string;                  // required for managed agents
  role: 'organization.editor' | 'organization.viewer';
  tags: string[];
  allowedToolIds: string[];
  allowedFunctions: string[];       // empty = all functions allowed
  settings: Record<string, unknown>;
  channels: ChannelConfig[];
  lastConnectedAt?: string;         // ISO date
  lastHeartbeatAt?: string;         // ISO date
  connectionCount: number;
  metadata: Record<string, unknown>;
  owner: { orgId: string };
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}
```

### ChannelConfig

```typescript
interface ChannelConfig {
  platform: 'discord' | 'telegram';
  label?: string;                   // Human-readable label, e.g. "Support Channel"
  enabled: boolean;                 // Whether this channel is active
  token: string;                    // Bot token (masked as *** in responses)
  botId?: string;                   // Discord: bot user ID (numeric); Telegram: @botUsername
  channelId: string;                // Discord: channel ID; Telegram: group ID (negative number string)
  requireMentions: boolean;         // true = respond only when @mentioned
  verboseLogging: boolean;          // true = emit step-by-step action logs to channel
  verboseLoggingTarget: string;     // 'channel' | 'thread' | '<specific-channel-id>'
}
```

---

## UI/UX Recommendations

### Agent List Page

**Columns to Display:**
- Status badge (`idle`=green, `inactive`=gray, `busy`=yellow, `suspended`=red)
- Name
- Type badge (`managed` / `autonomous`)
- Description (truncated)
- Instruction (link to detail)
- Channels (icons: Discord/Telegram count)
- Last Heartbeat (relative time)
- Connection Count (badge)
- Actions (View, Edit, Delete, Regenerate Credentials)

**Filters:**
- Status dropdown (`all`, `idle`, `inactive`, `busy`, `suspended`)
- Type dropdown (`all`, `managed`, `autonomous`)
- Search by name

**Sorting:**
- Name (A-Z, Z-A)
- Created date (newest, oldest)
- Last heartbeat (most recent, least recent)
- Connection count (high to low)

### Agent Detail Page

**Sections:**

1. **Basic Information**
   - Name, Description, Status dropdown, Type, Tags

2. **Configuration**
   - Instruction (dropdown)
   - Node (dropdown, only for `managed` type)
   - Role (dropdown)
   - Tools (multi-select)
   - Allowed Functions (multi-select or free text list)

3. **Claude SDK Settings**
   - Model, Max Turns, Permission Mode, Resume, OAuth Token

4. **Channel Integrations** (`channels[]`)
   - List of channel cards (Discord/Telegram)
   - Each card: platform icon, label, enabled toggle, channelId, requireMentions, verboseLogging
   - Add/remove channel buttons
   - Token shown as masked field with "show/edit" toggle

5. **Connection Status** (read-only)
   - Last Connected, Last Heartbeat, Connection Count
   - Online indicator: heartbeat < 5 min ago = online

6. **Credentials**
   - Button: "Regenerate Credentials"
   - Warning: invalidates current secret

7. **Audit Trail** (read-only)
   - Created by/at, Updated by/at

### Agent Create/Edit Form

```
┌─────────────────────────────────────┐
│ Basic Information                   │
├─────────────────────────────────────┤
│ Name: [___________________]         │
│ Description: [______________]       │
│ Type: [autonomous ▼]               │
│ Status: [inactive ▼]               │
│ Role: [organization.viewer ▼]      │
│ Tags: [tag1] [tag2] [+ Add]         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Configuration                       │
├─────────────────────────────────────┤
│ Instruction: [Select ▼]            │
│ Node: [Select ▼] (managed only)    │
│ Tools: [☑ tool1] [☐ tool2]          │
│ Allowed Functions: [+ Add]          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Claude SDK Settings                 │
├─────────────────────────────────────┤
│ Model: [claude-3-5-haiku-latest ▼] │
│ Max Turns: [100]                    │
│ Permission Mode: [bypassPermissions]│
│ Resume: [☑ Enabled]                 │
│ OAuth Token: [***]  [✎ Edit]        │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Channel Integrations          [+ Add]│
├─────────────────────────────────────┤
│ 🎮 Discord — Support Channel  [✎][🗑]│
│   Channel ID: 9876543210            │
│   Require Mentions: ✓               │
│   Verbose Logging: ✗               │
│                                     │
│ ✈️  Telegram — Telegram Group  [✎][🗑]│
│   Group ID: -1001234567890          │
│   Require Mentions: ✗               │
│   Verbose Logging: ✓ → thread       │
└─────────────────────────────────────┘

[Cancel] [Save Agent]
```

**Validation Rules:**
- `name`: required
- `description`: required
- `type`: required
- `channels[].platform`: required, `discord` or `telegram`
- `channels[].token`: required
- `channels[].channelId`: required (can be empty string if unknown yet)
- `channels[].enabled`, `requireMentions`, `verboseLogging`: required booleans
- `channels[].verboseLoggingTarget`: required, default `"channel"`
- `nodeId`: required only when `type = "managed"`

### Credentials Modal

When user clicks "Regenerate Credentials":

```
┌─────────────────────────────────────────────┐
│ ⚠️  Regenerate Agent Credentials            │
├─────────────────────────────────────────────┤
│ This will generate a NEW secret and         │
│ INVALIDATE the current one.                 │
│                                             │
│ • Agent must be restarted with new secret   │
│ • Current running agent will disconnect     │
│ • Secret is shown ONLY ONCE                 │
│                                             │
│ [Cancel]          [Yes, Regenerate]         │
└─────────────────────────────────────────────┘
```

After regeneration:

```
┌─────────────────────────────────────────────┐
│ ✅ Credentials Generated Successfully        │
├─────────────────────────────────────────────┤
│ ⚠️  Copy these NOW — not shown again         │
│                                             │
│ Agent ID:  [67f3a2c8d1e5b4a7c9f1d3e2]  📋  │
│ Secret:    [f8e7d6c5b4a39281706f5e4d3]  📋  │
│                                             │
│ [📥 Download .env File]                     │
│ [📥 Download Install Script]                │
│                                             │
│ Checklist:                                  │
│ ☐ Copied agent ID                           │
│ ☐ Copied secret                             │
│ ☐ Downloaded .env file                      │
│ ☐ Saved credentials securely                │
│                                             │
│                                   [Close]   │
└─────────────────────────────────────────────┘
```

---

## Error Handling

**400 Bad Request:**
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": ["name must be a string", "channels.0.platform must be discord or telegram"]
}
```

**401 Unauthorized:**
```json
{ "statusCode": 401, "message": "Unauthorized" }
```

**404 Not Found:**
```json
{ "statusCode": 404, "message": "Agent with ID 67f3a2c8d1e5b4a7c9f1d3e2 not found" }
```

**500 Internal Server Error:**
```json
{ "statusCode": 500, "message": "Internal server error", "correlationId": "req-123-456-789" }
```

---

## Real-time Updates

**Option 1: Polling** — Poll `/agents/:id` every 30–60 seconds for heartbeat status.

**Option 2: WebSocket (Recommended)** — Subscribe to agent status events via NOTI service (future).

---

## Changelog

### Version 2.0
- Added `channels[]` field (structured Discord/Telegram config per channel)
- Added `type` field: `managed` / `autonomous`
- Added `framework` field: `claude-agent-sdk`
- Added `role` field: RBAC role for MCP tool access
- Added `allowedFunctions` field: function-level access control
- Fixed status enum: `inactive | idle | busy | suspended` (removed deprecated `active`)
- `statistics` now includes `byType` and `byFramework` breakdowns
- Legacy `settings.discord_*` / `settings.telegram_*` deprecated (still functional, use `channels[]` instead)

### Version 1.0
- Initial release with basic CRUD operations
- Agent authentication via secret
- Credentials regeneration
- Settings configuration for Claude SDK and platforms
- Connection tracking (`lastConnectedAt`, `lastHeartbeatAt`, `connectionCount`)
