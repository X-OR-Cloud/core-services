# Agent Type Classification

## Overview

AIWM supports two types of agents with different management models:

1. **Managed Agents** (`managed`) - System-managed agents deployed to nodes, with secret-based authentication
2. **Autonomous Agents** (`autonomous`) - User-controlled agents via UI, using user JWT and LLM deployment

## Agent Types

### Managed Agent (`type: 'managed'`)

**Characteristics:**
- System-managed agents deployed to specific nodes
- Has secret-based authentication (bcrypt hashed)
- AIWM manages lifecycle: start/stop/restart via WebSocket commands
- Runs on node infrastructure (Discord/Telegram bots, background workers)
- When created with `nodeId`, AIWM sends `agent.start` event to node via WebSocket

**Use Cases:**
- Discord/Telegram bots running on dedicated nodes
- Background AI workers
- Customer-deployed agents on infrastructure
- Agents requiring custom runtime environment

**Configuration:**
```json
{
  "name": "Customer Support Bot",
  "type": "managed",
  "status": "active",
  "instructionId": "...",
  "nodeId": "...",
  "allowedToolIds": ["tool1", "tool2"],
  "settings": {
    "auth_roles": ["agent", "document.reader"],
    "claude_model": "claude-3-5-sonnet-latest",
    "claude_maxTurns": 100,
    "claude_permissionMode": "bypassPermissions",
    "claude_resume": true,
    "discord_token": "...",
    "discord_channelIds": ["..."]
  }
}
```

**Features:**
- Secret-based authentication (bcrypt hashed)
- JWT token generation (24h expiry)
- `.env` configuration generation
- Installation script generation
- Heartbeat monitoring
- Connection tracking
- WebSocket command handling (`agent.start`, `agent.stop`)

---

### Autonomous Agent (`type: 'autonomous'`)

**Characteristics:**
- User-controlled agents via chat UI
- Uses `deploymentId` to link to LLM deployment
- No secret/credential management needed
- Frontend calls LLM directly (client-side execution)
- Uses MCP tools via HTTP transport

**Use Cases:**
- Chat UI assistants
- Interactive agent playground
- Client-side AI chatbots with Vercel AI SDK
- Quick agent setup without infrastructure

**Configuration:**
```json
{
  "name": "Finance Assistant",
  "type": "autonomous",
  "status": "active",
  "instructionId": "...",
  "deploymentId": "...",
  "allowedToolIds": ["tool1", "tool2"]
}
```

**Limitations:**
- Cannot connect via `/agents/:id/connect` endpoint with secret
- No credential regeneration (no `/credentials/regenerate`)
- No deployment scripts or installation scripts
- No WebSocket lifecycle management

---

## Schema

### Agent Schema

```typescript
@Schema({ timestamps: true })
export class Agent extends BaseSchema {
  // ... existing fields

  @Prop({
    type: String,
    enum: ['managed', 'autonomous'],
    default: 'autonomous'
  })
  type: string;

  // For autonomous agents - link to LLM deployment
  @Prop({ type: String, ref: 'Deployment' })
  deploymentId?: string;

  // For managed agents - node where agent is deployed
  @Prop({ required: false, type: String, ref: 'Node' })
  nodeId?: string;

  // Authentication & Connection Management (managed agents only)
  @Prop({ required: false, select: false })
  secret?: string; // Hashed secret (managed only)

  @Prop({ type: [String], ref: 'Tool', default: [] })
  allowedToolIds: string[];

  @Prop({ type: Object, default: {} })
  settings: Record<string, unknown>;

  // Connection tracking (managed only)
  @Prop()
  lastConnectedAt?: Date;

  @Prop()
  lastHeartbeatAt?: Date;

  @Prop({ default: 0 })
  connectionCount: number;
}
```

### Indexes

Added index for efficient filtering by type:
```typescript
AgentSchema.index({ type: 1 });
```

---

## Important: Type Changes Are NOT Allowed

You CANNOT change agent type after creation.

Once an agent is created with a specific type (`managed` or `autonomous`), the type field is **immutable**.

**Why?**
- **Data Integrity**: Switching types would require secret generation/deletion, causing connection issues
- **Deployment Conflicts**: Managed agents deployed on nodes cannot be migrated to autonomous
- **Complexity**: Too many edge cases and potential failures during migration
- **User Safety**: Prevents accidental breaking of running agents

**Attempting to change type will result in:**
```json
{
  "statusCode": 400,
  "message": "Cannot change agent type from 'managed' to 'autonomous'. Please delete and recreate the agent with the desired type."
}
```

**Recommendation:**
If you need to change agent type:
1. Create a new agent with the desired type
2. Migrate configuration (instruction, tools, settings)
3. Test the new agent
4. Delete the old agent

---

## API Changes

### 1. Create Agent

**Endpoint:** `POST /agents`

**Request Body:**
```json
{
  "name": "My Agent",
  "description": "...",
  "status": "active",
  "type": "managed",
  "instructionId": "...",
  "nodeId": "...",
  "allowedToolIds": ["..."],
  "settings": { ... }
}
```

**Behavior:**
- If `type: 'managed'`:
  - Secret is auto-generated and hashed (or use provided secret)
  - Agent can connect via connection API
  - If `nodeId` specified, `agent.start` event sent to node via WebSocket
- If `type: 'autonomous'` (default):
  - No secret generated
  - Cannot use connection/credentials APIs
  - Requires `deploymentId` for LLM deployment

---

### 2. Update Agent

**Endpoint:** `PUT /agents/:id`

**Request Body:**
```json
{
  "name": "Updated Name",
  "status": "inactive",
  "type": "managed"
}
```

**Type Change Validation:**
- Same type or type not included: Update allowed
- Different type: Returns 400 Bad Request

---

### 3. Agent Connection (Managed Only)

**Endpoint:** `POST /agents/:id/connect`

**Request Body:**
```json
{
  "secret": "agent-secret-here"
}
```

**Validation:**
- Works for `type: 'managed'`
- Returns 400 for `type: 'autonomous'`

**Error Response for Autonomous Agents:**
```json
{
  "statusCode": 400,
  "message": "Only managed agents can connect via this endpoint"
}
```

---

### 4. Regenerate Credentials (Managed Only)

**Endpoint:** `POST /agents/:id/credentials/regenerate`

**Validation:**
- Works for `type: 'managed'`
- Returns 400 for `type: 'autonomous'`

**Error Response for Autonomous Agents:**
```json
{
  "statusCode": 400,
  "message": "Only managed agents have credentials to regenerate"
}
```

---

### 5. Get Agent Config (Autonomous Only)

**Endpoint:** `GET /agents/:id/config`

For autonomous agents to get LLM deployment info, instruction, and MCP tools.

---

### 6. List Agents with Statistics

**Endpoint:** `GET /agents`

**Response:**
```json
{
  "data": [...],
  "pagination": {...},
  "statistics": {
    "total": 100,
    "byStatus": {
      "active": 70,
      "inactive": 20,
      "suspended": 10
    },
    "byType": {
      "managed": 40,
      "autonomous": 60
    }
  }
}
```

---

## Frontend Integration

### UI Labels (Vietnamese)

```typescript
const AGENT_TYPE_LABELS = {
  managed: 'Agent hệ thống quản lý',
  autonomous: 'Agent người dùng tự quản lý'
};

const AGENT_TYPE_DESCRIPTIONS = {
  managed: 'Hệ thống tự deploy và quản lý trên node, có secret, chạy background',
  autonomous: 'Người dùng tự triển khai qua UI, sử dụng LLM deployment'
};
```

### Agent Creation Form

```tsx
<Form.Item label="Loại Agent" name="type">
  <Radio.Group>
    <Radio value="managed">
      <Space direction="vertical" size={0}>
        <Text strong>Agent hệ thống quản lý</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Deploy to node, có credentials, chạy background
        </Text>
      </Space>
    </Radio>
    <Radio value="autonomous">
      <Space direction="vertical" size={0}>
        <Text strong>Agent người dùng tự quản lý</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Qua UI, sử dụng LLM deployment
        </Text>
      </Space>
    </Radio>
  </Radio.Group>
</Form.Item>

{/* Show credentials button only for managed agents */}
{agent.type === 'managed' && (
  <Button onClick={handleRegenerateCredentials}>
    Tao lai Credentials
  </Button>
)}
```

### Agent List Filters

```tsx
<Select
  placeholder="Loc theo loai"
  onChange={(value) => setFilter({ ...filter, type: value })}
  allowClear
>
  <Option value="managed">Agent he thong quan ly</Option>
  <Option value="autonomous">Agent nguoi dung tu quan ly</Option>
</Select>
```

### Agent Card Badge

```tsx
{agent.type === 'managed' ? (
  <Badge color="blue">He thong quan ly</Badge>
) : (
  <Badge color="green">Tu quan ly</Badge>
)}
```

---

## Migration Guide

### Existing Agents

Default type is now `autonomous`:
```typescript
@Prop({
  type: String,
  enum: ['managed', 'autonomous'],
  default: 'autonomous'
})
type: string;
```

**Behavior:**
- Existing agents without `type` field -> treated as `autonomous`
- Existing agents with `secret` -> **should be manually updated** to `type: 'managed'`

### Updating Existing Managed Agents

If you have existing agents that use connection API:

```bash
# Update agent type to 'managed'
curl -X PUT "http://localhost:3305/agents/{AGENT_ID}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "managed"}'
```

---

## Testing

### Test Script Updated

[scripts/test-agent-connection.sh](../../../scripts/test-agent-connection.sh) now creates agents with `type: 'managed'`.

### Manual Testing

**1. Test Type Change Prevention:**
```bash
# Create managed agent
AGENT_ID=$(curl -s -X POST "http://localhost:3305/agents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Managed Agent",
    "type": "managed",
    "status": "active",
    "instructionId": "...",
    "nodeId": "..."
  }' | python3 -c "import sys, json; print(json.load(sys.stdin)['_id'])")

# Try to change to autonomous (should fail)
curl -X PUT "http://localhost:3305/agents/$AGENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "autonomous"}'
```

**Expected:** 400 Bad Request

**2. Create Managed Agent:**
```bash
curl -X POST "http://localhost:3305/agents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Managed Agent Test",
    "type": "managed",
    "status": "active",
    "nodeId": "...",
    "settings": {
      "discord_token": "...",
      "discord_channelIds": ["..."]
    }
  }'
```

**3. Connect Managed Agent (Should Work):**
```bash
curl -X POST "http://localhost:3305/agents/{MANAGED_AGENT_ID}/connect" \
  -H "Content-Type: application/json" \
  -d '{"secret": "secret-from-regenerate"}'
```

**Expected:** 200 OK with token, instruction, tools, settings

**4. Create Autonomous Agent:**
```bash
curl -X POST "http://localhost:3305/agents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Autonomous Agent Test",
    "type": "autonomous",
    "status": "active",
    "deploymentId": "..."
  }'
```

**5. Try to Connect Autonomous Agent (Should Fail):**
```bash
curl -X POST "http://localhost:3305/agents/{AUTONOMOUS_AGENT_ID}/connect" \
  -H "Content-Type: application/json" \
  -d '{"secret": "any-secret"}'
```

**Expected:** 400 Bad Request - "Only managed agents can connect via this endpoint"

**6. Regenerate Credentials for Managed Agent (Should Work):**
```bash
curl -X POST "http://localhost:3305/agents/{MANAGED_AGENT_ID}/credentials/regenerate" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** 200 OK with secret, envConfig, installScript

---

## MCP Tool Integration

When managed agents connect, they receive an MCP endpoint for tool discovery and execution.

### Agent Workflow

1. **Agent connects**: `POST /agents/:id/connect` with secret
2. **Receives configuration**:
   - `accessToken` - JWT for authentication
   - `mcpEndpoint` - URL for MCP protocol (`http://localhost:3305/mcp`)
   - `instruction` - Agent instructions
   - `tools` - Legacy tool list (deprecated, use MCP endpoint instead)
   - `settings` - Runtime configuration

3. **Agent discovers tools**: `POST /mcp/tools/list` with agent JWT
4. **Agent executes tools**: `POST /mcp/tools/call` with agent JWT

---

## Summary

**Semantic Definitions:**
- `managed` = System-managed: hệ thống tự quản lý, deploy to node, có secret, WebSocket lifecycle
- `autonomous` = User-controlled: người dùng tự triển khai qua UI, dùng JWT user, LLM deployment

**Key Differences:**

| Feature | Managed | Autonomous |
|---------|---------|------------|
| Quản lý bởi | Hệ thống (AIWM) | Người dùng |
| Secret | Có (bcrypt hashed) | Không |
| Deploy | Tới node via WebSocket | Qua UI |
| DeploymentId | Không cần | Cần (link tới LLM) |
| NodeId | Cần (chạy trên node) | Không cần |
| Connect API | Có | Không |
| Config API | Không | Có |
| WebSocket events | agent.start/stop | Không |
