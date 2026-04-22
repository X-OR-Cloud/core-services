# Agent Connection Flow - AIWM

## Overview

This document describes the agent management and connection flow implemented in AIWM service. This feature allows AI agents to connect, authenticate, and receive configuration (instructions + tools) from AIWM controller.

## Architecture

```
┌─────────────┐                  ┌──────────────┐
│   Agent     │◄────Connect──────┤    AIWM      │
│   Client    │                  │  Controller  │
│             │                  │              │
│  - Discord  │◄───JWT Token─────┤  - Agents    │
│  - Telegram │                  │  - Instruc.  │
│  - ...      │◄─Instruction─────┤  - Tools     │
│             │                  │              │
│             │◄────Tools────────┤              │
│             │                  │              │
│             │────Heartbeat────►│              │
└─────────────┘                  └──────────────┘
```

## Features Implemented

### 1. Agent Schema Updates

**New fields added to Agent schema:**
- `secret` (string, hashed): Authentication secret
- `allowedToolIds` (string[]): Whitelist of tool IDs agent can use
- `settings` (object): Runtime configuration (Discord token, Telegram config, etc.)
- `lastConnectedAt` (Date): Last successful connection timestamp
- `lastHeartbeatAt` (Date): Last heartbeat timestamp
- `connectionCount` (number): Total connection attempts
- `status`: Updated enum to include `'suspended'`

### 2. New API Endpoints

#### 2.1 Agent Connection (Public Endpoint)

```http
POST /agents/:agentId/connect
Content-Type: application/json

{
  "secret": "agent-secret-key"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "instruction": "You are a helpful AI assistant...\n\n## Guidelines\n1. ...",
  "tools": [
    {
      "_id": "tool-id-1",
      "name": "read-file",
      "description": "Read files from filesystem",
      "type": "builtin",
      "category": "productivity",
      "schema": { ... }
    }
  ],
  "agent": {
    "id": "agent-id",
    "name": "My Agent",
    "orgId": "org-id"
  }
}
```

**Features:**
- Public endpoint (no auth required)
- Validates agentId + secret
- Returns JWT token (24h expiry)
- Returns merged instruction text
- Returns allowed tools (whitelist)
- Updates connection tracking

#### 2.2 Agent Heartbeat (Authenticated)

```http
POST /agents/:agentId/heartbeat
Authorization: Bearer {agent-jwt-token}
Content-Type: application/json

{
  "status": "online",
  "metrics": {
    "cpu": 45,
    "memory": 60,
    "activeConnections": 3
  }
}
```

**Response:**
```json
{
  "success": true
}
```

#### 2.3 Regenerate Credentials (Admin Only)

```http
POST /agents/:agentId/credentials/regenerate
Authorization: Bearer {admin-token}
```

**Response:**
```json
{
  "agentId": "agent-id",
  "secret": "new-secret-here-show-only-once",
  "envConfig": "# .env configuration\nAIWM_ENABLED=true\n...",
  "installScript": "#!/bin/bash\n# Installation script\n..."
}
```

**Features:**
- Admin only endpoint
- Generates new random secret
- Returns plain text secret (show only once)
- Returns .env configuration snippet
- Returns installation script (placeholder/sample)

### 3. Instruction Merge Logic

**MVP Implementation:**
- Returns instruction's `systemPrompt` + formatted `guidelines`
- Single instruction per agent

**Future Enhancements (TODO):**
```
Global Instruction (Org-level)
    ↓
Agent Instruction (Specific)
    ↓
Context Instruction (Project/Feature)
    ↓
Final Merged Instruction
```

### 4. Tool Assignment (Whitelist)

**How it works:**
1. Admin creates tools in AIWM
2. Admin assigns specific tool IDs to agent (`allowedToolIds`)
3. On connection, agent receives only allowed tools
4. Tools must be `status: 'active'` and not deleted

### 5. Security Features

**Authentication:**
- Secret hashed with bcrypt (10 rounds)
- JWT token with 24h expiry
- Agent status check (reject if `suspended`)

**JWT Payload:**
```json
{
  "sub": "agent-id",
  "type": "agent",
  "orgId": "organization-id",
  "exp": 1234567890
}
```

## Usage Guide

### Step 1: Create Instruction

```bash
curl -X POST http://localhost:3003/instructions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Support Agent",
    "systemPrompt": "You are a helpful customer support agent.",
    "guidelines": [
      "Be polite and professional",
      "Provide clear answers"
    ],
    "status": "active"
  }'
```

### Step 2: Create Tools

```bash
curl -X POST http://localhost:3003/tools \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "read-file",
    "type": "builtin",
    "description": "Read files",
    "category": "productivity",
    "status": "active",
    "scope": "public",
    "schema": {
      "inputSchema": { ... },
      "outputSchema": { ... }
    }
  }'
```

### Step 3: Create Agent

```bash
curl -X POST http://localhost:3003/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Support Agent 01",
    "description": "Customer support agent",
    "status": "active",
    "instructionId": "instruction-id",
    "nodeId": "node-id",
    "secret": "my-secure-secret",
    "allowedToolIds": ["tool-id-1", "tool-id-2"],
    "settings": {
      "discord": {
        "token": "discord-token",
        "channelIds": ["123456"]
      }
    }
  }'
```

### Step 4: Get Credentials

```bash
curl -X POST http://localhost:3003/agents/{agent-id}/credentials/regenerate \
  -H "Authorization: Bearer $TOKEN"
```

**Response contains:**
- New secret
- .env configuration snippet
- Installation script

### Step 5: Configure Agent Client

Copy the `.env` configuration to your agent client:

```bash
# ===== AIWM Integration =====
AIWM_ENABLED=true
AIWM_BASE_URL=https://api.x-or.cloud/dev/aiwm
AIWM_AGENT_ID=agent-id-here
AIWM_AGENT_SECRET=secret-here

# ===== Platform Configuration =====
DISCORD_TOKEN=your-discord-token
TELEGRAM_BOT_TOKEN=your-telegram-token
```

### Step 6: Agent Connects

Agent client on startup:

```typescript
// Connect to AIWM
const response = await fetch(`${AIWM_BASE_URL}/agents/${AGENT_ID}/connect`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ secret: AGENT_SECRET })
});

const { token, instruction, tools } = await response.json();

// Use instruction for Claude
const agent = new ClaudeCode({
  instruction: instruction,
  allowedTools: tools.map(t => t.name),
  // ...
});

// Start heartbeat
setInterval(async () => {
  await fetch(`${AIWM_BASE_URL}/agents/${AGENT_ID}/heartbeat`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'online' })
  });
}, 60000); // Every minute
```

## Testing

### Automated Test Script

```bash
# Run the comprehensive test
./scripts/test-agent-connection.sh
```

This script tests:
1. Create instruction
2. Create tools
3. Create node
4. Create agent with secret + tools
5. Regenerate credentials
6. Agent connection
7. Heartbeat
8. Verify agent details

### Manual Testing

**Test connection:**
```bash
curl -X POST http://localhost:3003/agents/{agent-id}/connect \
  -H "Content-Type: application/json" \
  -d '{"secret": "your-secret"}'
```

**Test heartbeat:**
```bash
curl -X POST http://localhost:3003/agents/{agent-id}/heartbeat \
  -H "Authorization: Bearer {agent-token}" \
  -H "Content-Type: application/json" \
  -d '{"status": "online"}'
```

## Future Enhancements

### Phase 2: Global Instructions
- [ ] Create `GlobalInstruction` collection (org-level)
- [ ] Implement instruction merge logic
- [ ] Support instruction priorities/weights

### Phase 3: Context Instructions
- [ ] Support project/feature context
- [ ] Dynamic instruction composition
- [ ] Context variables replacement

### Phase 4: Advanced Features
- [ ] Agent health monitoring dashboard
- [ ] Auto-reconnect mechanism
- [ ] Token refresh endpoint
- [ ] Agent deployment automation
- [ ] Multi-tenant isolation

## Troubleshooting

### Connection Failed
- **401 Unauthorized**: Check secret is correct
- **404 Not Found**: Verify agent ID exists
- **Agent suspended**: Contact admin to reactivate

### No Tools Received
- Check `allowedToolIds` is not empty
- Verify tools exist and `status: 'active'`
- Ensure tools are not soft-deleted

### Instruction Empty
- Verify `instructionId` is set on agent
- Check instruction exists and not deleted
- Ensure instruction has `systemPrompt`

## Related Documentation

- [AIWM Service README](../services/aiwm/README.md)
- [Agent Module Documentation](../services/aiwm/src/modules/agent/README.md)
- [Instruction Module](../services/aiwm/src/modules/instruction/README.md)
- [Tool Module](../services/aiwm/src/modules/tool/README.md)

## API Reference

Full API documentation available at:
```
http://localhost:3003/api-docs
```

Navigate to **Agents** section for complete endpoint documentation.
