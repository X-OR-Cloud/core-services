# Agent Type Classification

## Overview

AIWM supports two types of agents with different capabilities and deployment models:

1. **Assistant Agents** (`assistant`) - In-process agents with no environment access, run by the Agent Worker (MODE=agt)
2. **Engineer Agents** (`engineer`) - Agents with full environment access (bash, file system, etc.), deployed either to a node by the system or self-deployed by the user

## Agent Types

### Assistant Agent (`type: 'assistant'`)

**Characteristics:**
- Runs in-process inside the AIWM Agent Worker (`nx run aiwm:agt`)
- No environment access — cannot run bash, read files, or interact with the OS
- Has secret-based authentication (bcrypt hashed)
- Connects to `/ws/chat` for autonomous conversation handling
- Scaled horizontally via Redis lock (one active runner per agent ID)

**Use Cases:**
- Managed conversational AI agents that respond to user chat messages
- Background AI workers that operate purely through MCP tools
- Agents that must run inside the AIWM infrastructure without external environment

**Configuration:**
```json
{
  "name": "Customer Support Bot",
  "type": "assistant",
  "status": "active",
  "instructionId": "...",
  "allowedToolIds": ["tool1", "tool2"],
  "settings": {
    "auth_roles": ["agent", "document.reader"],
    "claude_model": "claude-3-5-sonnet-latest",
    "claude_maxTurns": 100,
    "claude_permissionMode": "bypassPermissions",
    "claude_resume": true,
    "assistant_maxConcurrency": 5,
    "assistant_maxSteps": 10
  }
}
```

**Features:**
- Secret-based authentication (bcrypt hashed)
- JWT token generation (24h expiry)
- Heartbeat monitoring
- Connection tracking
- Connects to `/ws/chat` for autonomous operation

---

### Engineer Agent (`type: 'engineer'`)

**Characteristics:**
- Has full environment access (bash, file system, development tools, etc.)
- Has secret-based authentication (bcrypt hashed)
- Two deployment modes:
  - **With `nodeId`**: System-deployed to a specific node via WebSocket commands (`agent.start`/`agent.update`/`agent.delete`). AIWM manages the lifecycle.
  - **Without `nodeId`**: User self-deploys the agent to their own environment using downloaded credentials.

**Use Cases (node-managed, with `nodeId`):**
- Discord/Telegram bots running on dedicated nodes
- Background AI workers with shell access
- Agents deployed and managed by AIWM on infrastructure nodes

**Use Cases (self-deployed, without `nodeId`):**
- Developers running agents in their own local environment
- Agents using user's own infrastructure and tooling
- Quick agent setup where the user controls the runtime

**Configuration (node-managed):**
```json
{
  "name": "Infrastructure Bot",
  "type": "engineer",
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

**Configuration (self-deployed):**
```json
{
  "name": "Local Dev Agent",
  "type": "engineer",
  "status": "active",
  "instructionId": "...",
  "allowedToolIds": ["tool1", "tool2"]
}
```

**Features:**
- Secret-based authentication (bcrypt hashed)
- JWT token generation (24h expiry)
- `.env` configuration generation
- Installation script generation
- Heartbeat monitoring
- Connection tracking
- WebSocket command handling (`agent.start`, `agent.stop`) when `nodeId` is set

---

## Schema

### Agent Schema

```typescript
@Schema({ timestamps: true })
export class Agent extends BaseSchema {
  // ... existing fields

  @Prop({
    type: String,
    enum: ['assistant', 'engineer'],
    default: 'engineer'
  })
  type: string;

  // For engineer agents without nodeId - link to LLM deployment (self-deployed)
  @Prop({ type: String, ref: 'Deployment' })
  deploymentId?: string;

  // For engineer agents - node where agent is deployed (system-managed). Optional.
  @Prop({ required: false, type: String, ref: 'Node' })
  nodeId?: string;

  // Authentication & Connection Management (all non-user-deployed agents)
  @Prop({ required: false, select: false })
  secret?: string; // Hashed secret

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

Once an agent is created with a specific type (`assistant` or `engineer`), the type field is **immutable**.

**Why?**
- **Data Integrity**: Switching types would require secret generation/deletion, causing connection issues
- **Deployment Conflicts**: Engineer agents deployed on nodes cannot be migrated to assistant
- **Complexity**: Too many edge cases and potential failures during migration
- **User Safety**: Prevents accidental breaking of running agents

**Attempting to change type will result in:**
```json
{
  "statusCode": 400,
  "message": "Cannot change agent type from 'engineer' to 'assistant'. Please delete and recreate the agent with the desired type."
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
  "type": "engineer",
  "instructionId": "...",
  "nodeId": "...",
  "allowedToolIds": ["..."],
  "settings": { ... }
}
```

**Behavior:**
- If `type: 'engineer'`:
  - Secret is auto-generated and hashed (or use provided secret)
  - Agent can connect via connection API
  - If `nodeId` specified, `agent.start` event sent to node via WebSocket
  - If no `nodeId`, agent uses downloaded credentials to self-deploy
- If `type: 'assistant'` (default):
  - Secret is auto-generated; agent connects via `/ws/chat` when run by the Agent Worker
  - Runs in-process inside `MODE=agt`, no environment access

---

### 2. Update Agent

**Endpoint:** `PUT /agents/:id`

**Request Body:**
```json
{
  "name": "Updated Name",
  "status": "inactive",
  "type": "engineer"
}
```

**Type Change Validation:**
- Same type or type not included: Update allowed
- Different type: Returns 400 Bad Request

---

### 3. Agent Connection (engineer / assistant)

**Endpoint:** `POST /agents/:id/connect`

**Request Body:**
```json
{
  "secret": "agent-secret-here"
}
```

**Validation:**
- Works for both `type: 'engineer'` and `type: 'assistant'`
- Both types use secret-based authentication

---

### 4. Regenerate Credentials (engineer / assistant)

**Endpoint:** `POST /agents/:id/credentials/regenerate`

**Validation:**
- Works for both `type: 'engineer'` and `type: 'assistant'`
- Returns new secret, envConfig, and installScript

---

### 5. Get Agent Config (engineer self-deployed only)

**Endpoint:** `GET /agents/:id/config`

For self-deployed engineer agents (no `nodeId`) to get LLM deployment info, instruction, and MCP tools.

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
      "idle": 70,
      "inactive": 20,
      "suspended": 10
    },
    "byType": {
      "engineer": 40,
      "assistant": 60
    }
  }
}
```

---

## Frontend Integration

### UI Labels (Vietnamese)

```typescript
const AGENT_TYPE_LABELS = {
  assistant: 'Agent trợ lý (in-process)',
  engineer: 'Agent kỹ sư (có môi trường)'
};

const AGENT_TYPE_DESCRIPTIONS = {
  assistant: 'Chạy trong AIWM Agent Worker, không có quyền truy cập môi trường, kết nối /ws/chat',
  engineer: 'Có quyền truy cập môi trường. Node-managed nếu có nodeId, tự triển khai nếu không có nodeId'
};
```

### Agent Creation Form

```tsx
<Form.Item label="Loại Agent" name="type">
  <Radio.Group>
    <Radio value="assistant">
      <Space direction="vertical" size={0}>
        <Text strong>Agent trợ lý (in-process)</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Chạy trong AIWM Worker, không có môi trường, kết nối /ws/chat
        </Text>
      </Space>
    </Radio>
    <Radio value="engineer">
      <Space direction="vertical" size={0}>
        <Text strong>Agent kỹ sư (có môi trường)</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Có quyền truy cập bash/file. Deploy to node nếu có nodeId, hoặc tự triển khai
        </Text>
      </Space>
    </Radio>
  </Radio.Group>
</Form.Item>

{/* Show credentials button for all agent types */}
<Button onClick={handleRegenerateCredentials}>
  Tao lai Credentials
</Button>
```

### Agent List Filters

```tsx
<Select
  placeholder="Loc theo loai"
  onChange={(value) => setFilter({ ...filter, type: value })}
  allowClear
>
  <Option value="assistant">Agent tro ly (in-process)</Option>
  <Option value="engineer">Agent ky su (co moi truong)</Option>
</Select>
```

### Agent Card Badge

```tsx
{agent.type === 'engineer' ? (
  <Badge color="blue">Ky su</Badge>
) : (
  <Badge color="green">Tro ly</Badge>
)}
```

---

## Migration Guide

### Existing Agents

Default type is now `engineer`:
```typescript
@Prop({
  type: String,
  enum: ['assistant', 'engineer'],
  default: 'engineer'
})
type: string;
```

**Behavior:**
- Existing agents previously `managed` or `autonomous` (with `nodeId`) -> should be migrated to `type: 'engineer'`
- Existing agents previously `hosted` -> should be migrated to `type: 'assistant'`
- Existing agents with `secret` and no environment access -> migrate to `type: 'assistant'`

### Updating Existing Agents

If you have existing engineer agents that use the connection API:

```bash
# Update agent type to 'engineer'
curl -X PUT "http://localhost:3305/agents/{AGENT_ID}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "engineer"}'
```

---

## Testing

### Test Script Updated

[scripts/test-agent-connection.sh](../../../scripts/test-agent-connection.sh) now creates agents with `type: 'engineer'`.

### Manual Testing

**1. Test Type Change Prevention:**
```bash
# Create engineer agent
AGENT_ID=$(curl -s -X POST "http://localhost:3305/agents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Engineer Agent",
    "type": "engineer",
    "status": "active",
    "instructionId": "...",
    "nodeId": "..."
  }' | python3 -c "import sys, json; print(json.load(sys.stdin)['_id'])")

# Try to change to assistant (should fail)
curl -X PUT "http://localhost:3305/agents/$AGENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "assistant"}'
```

**Expected:** 400 Bad Request

**2. Create Engineer Agent (node-managed):**
```bash
curl -X POST "http://localhost:3305/agents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Engineer Agent Test",
    "type": "engineer",
    "status": "active",
    "nodeId": "...",
    "settings": {
      "discord_token": "...",
      "discord_channelIds": ["..."]
    }
  }'
```

**3. Connect Engineer Agent (Should Work):**
```bash
curl -X POST "http://localhost:3305/agents/{ENGINEER_AGENT_ID}/connect" \
  -H "Content-Type: application/json" \
  -d '{"secret": "secret-from-regenerate"}'
```

**Expected:** 200 OK with token, instruction, tools, settings

**4. Create Assistant Agent:**
```bash
curl -X POST "http://localhost:3305/agents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Assistant Agent Test",
    "type": "assistant",
    "status": "active",
    "instructionId": "...",
    "settings": {
      "assistant_maxConcurrency": 5,
      "assistant_maxSteps": 10
    }
  }'
```

**5. Connect Assistant Agent (Should Work):**
```bash
curl -X POST "http://localhost:3305/agents/{ASSISTANT_AGENT_ID}/connect" \
  -H "Content-Type: application/json" \
  -d '{"secret": "agent-secret"}'
```

**Expected:** 200 OK with token, instruction, tools, settings

**6. Regenerate Credentials for Engineer Agent (Should Work):**
```bash
curl -X POST "http://localhost:3305/agents/{ENGINEER_AGENT_ID}/credentials/regenerate" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** 200 OK with secret, envConfig, installScript

---

## MCP Tool Integration

When engineer or assistant agents connect, they receive an MCP endpoint for tool discovery and execution.

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
- `assistant` = In-process agent: chạy trong AIWM Agent Worker (MODE=agt), không có quyền truy cập môi trường, kết nối `/ws/chat`, có secret
- `engineer` = Agent có môi trường: có quyền truy cập bash/file. Nếu có `nodeId` thì AIWM quản lý lifecycle qua WebSocket. Nếu không có `nodeId` thì người dùng tự triển khai.

**Key Differences:**

| Feature | Engineer (node-managed) | Engineer (self-deployed) | Assistant |
|---------|------------------------|--------------------------|-----------|
| Môi trường | Có (bash, file, v.v.) | Có (bash, file, v.v.) | Không |
| Quản lý bởi | Hệ thống (AIWM via WebSocket) | Người dùng | AIWM Agent Worker |
| Secret | Có (bcrypt hashed) | Có (bcrypt hashed) | Có (bcrypt hashed) |
| NodeId | Có | Không | Không |
| Deploy | Tới node via WebSocket | Người dùng tự deploy | Chạy trong MODE=agt |
| Connect API | Có | Có | Có |
| Config API | Không | Có (lấy deployment info) | Không |
| WebSocket events | agent.start/stop | Không | Không |
| /ws/chat | Không | Không | Có |
