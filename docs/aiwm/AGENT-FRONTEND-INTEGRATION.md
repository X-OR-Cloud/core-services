# Agent API - Frontend Integration Guide

## Overview

AIWM Agent API cung cap endpoints de quan ly AI agents (managed va autonomous) va lay configuration cho client-side chat implementation.

**Base URL:** `https://api.x-or.cloud/dev/aiwm` hoac `http://localhost:3003`

**Authentication:** Tat ca endpoints yeu cau Bearer token (JWT) trong header `Authorization: Bearer <token>`

---

## Agent Types

### Managed Agent
- **Purpose:** System-managed agents, deploy to node, chay background
- **Characteristics:**
  - Co `secret` de authenticate khi connect
  - He thong quan ly lifecycle (start/stop via WebSocket)
  - Tu dong xu ly messages tu chat platform (Discord/Telegram)
  - Chay tren node infrastructure
  - Su dung MCP tools builtin

### Autonomous Agent
- **Purpose:** User-controlled agents cho chat UI
- **Characteristics:**
  - **KHONG co** `secret` (user khong connect truc tiep)
  - Can `deploymentId` link toi LLM deployment
  - Frontend goi LLM truc tiep (khong qua server)
  - Client-side execution voi Vercel AI SDK
  - Su dung MCP tools qua HTTP transport

---

## Entities Reference

### Agent Entity

```typescript
{
  _id: string;                    // MongoDB ObjectId
  name: string;                   // Ten agent
  description: string;            // Mo ta chuc nang
  status: 'active' | 'inactive' | 'busy' | 'suspended';
  type: 'managed' | 'autonomous'; // IMMUTABLE - khong thay doi sau khi tao

  // References
  instructionId?: string;         // Link to Instruction document
  guardrailId?: string;           // Link to Guardrail document
  deploymentId?: string;          // Link to Deployment (for autonomous agents)
  nodeId?: string;                // Link to Node (for managed agents)

  // RBAC
  role: 'organization.owner' | 'organization.editor' | 'organization.viewer';
  // Default: 'organization.viewer'
  // Determines agent's permissions for MCP tools

  // Metadata
  tags: string[];                 // For categorization/filtering
  allowedToolIds: string[];       // Whitelist of tool IDs (empty = all tools allowed)

  // Runtime configuration (flat structure with prefixes)
  settings: {
    // For managed agents
    auth_roles?: string[];        // DEPRECATED - use `role` field instead
    claude_model?: string;        // e.g., 'claude-3-5-sonnet-latest'
    claude_maxTurns?: number;     // Default: 100
    claude_permissionMode?: string;
    discord_token?: string;
    discord_channelIds?: string[];
    discord_botId?: string;
    telegram_token?: string;
    telegram_groupIds?: string[];
    // ... extensible for future platforms
  };

  // Connection tracking (managed only)
  lastConnectedAt?: Date;
  lastHeartbeatAt?: Date;
  connectionCount: number;

  // BaseSchema fields
  owner: { orgId: string };
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Deployment Entity (Referenced by autonomous agents)

```typescript
{
  _id: string;
  name: string;
  modelId: string;                // Link to Model document
  status: 'running' | 'stopped' | 'failed' | ...;
  // ... other deployment fields
}
```

### Model Entity (Contains provider info)

```typescript
{
  _id: string;
  name: string;
  type: 'llm' | 'vision' | 'embedding' | 'voice';
  deploymentType: 'api-based' | 'self-hosted';

  // For api-based models (used by autonomous agents)
  provider?: 'anthropic' | 'openai' | 'google' | 'azure' | 'cohere';
  apiEndpoint?: string;           // e.g., "https://api.anthropic.com/v1/messages"
  modelIdentifier?: string;       // e.g., "claude-3-5-sonnet-20241022", "gpt-4-turbo"
  apiConfig?: {
    apiKey: string;               // API key for provider
    // ... other provider-specific config
  };
}
```

---

## API Endpoints

### 1. List Agents

**Endpoint:** `GET /agents`

**Purpose:** Lay danh sach agents voi pagination va filtering

**Query Parameters:**
- `page` (number, default: 1) - Trang hien tai
- `limit` (number, default: 10) - So items per page
- `search` (string, optional) - Tim kiem theo name/description
- `filter[status]` (string, optional) - Filter by status: `active`, `inactive`, `busy`, `suspended`
- `filter[type]` (string, optional) - Filter by type: `managed`, `autonomous`
- `sort` (string, optional) - Sort field, prefix `-` for descending (e.g., `-createdAt`, `name`)
- `populate` (string, optional) - Set to `instruction` de include instruction details

**Response:**
```typescript
{
  data: Agent[];                  // Array of agent objects
  pagination: {
    total: number;                // Total number of agents
    page: number;                 // Current page
    limit: number;                // Items per page
    totalPages: number;           // Total pages
  };
  statistics?: {                  // Agent count by status
    active: number;
    inactive: number;
    busy: number;
    suspended: number;
  };
}
```

**Use Cases:**
- Agent management dashboard
- Agent selector dropdown
- Monitoring agent status

---

### 2. Create Autonomous Agent

**Endpoint:** `POST /agents`

**Purpose:** Tao autonomous agent cho chat UI

**Required Fields:**
```typescript
{
  name: string;                   // Ten agent (max 100 chars)
  description: string;            // Mo ta chuc nang
  type: 'autonomous';             // MUST be 'autonomous'
  deploymentId: string;           // REQUIRED - Link to LLM deployment
  instructionId?: string;         // Optional - System prompt
  role?: string;                  // Optional - Default: 'organization.viewer'
  tags?: string[];                // Optional - For categorization
  allowedToolIds?: string[];      // Optional - Tool whitelist (empty = all allowed)
  settings?: Record<string, any>; // Optional - Custom config
}
```

**KHONG can fields:**
- `secret` - Autonomous agents khong dung secret authentication
- `status` - Auto-set to 'active'
- `nodeId` - Khong can node cho autonomous agents
- `lastConnectedAt`, `connectionCount` - Khong relevant cho autonomous agents

**Response:** Agent object (201 Created)

**Validation:**
- `deploymentId` MUST point to valid Deployment voi `status: 'running'`
- Deployment's Model MUST have `deploymentType: 'api-based'`
- `role` MUST be one of: `organization.owner`, `organization.editor`, `organization.viewer`

**Use Case:**
User tao chatbot moi -> Frontend call POST /agents -> Nhan agent ID -> Dung de call /agents/:id/config

---

### 3. Create Managed Agent

**Endpoint:** `POST /agents`

**Purpose:** Tao managed agent cho Discord/Telegram bot (system-managed)

**Required Fields:**
```typescript
{
  name: string;
  description: string;
  type: 'managed';                // MUST be 'managed'
  secret?: string;                // Optional - Plain text secret (will be hashed). Auto-generated if not provided
  instructionId?: string;         // Optional - System prompt
  role?: string;                  // Optional - Default: 'organization.viewer'
  nodeId: string;                 // REQUIRED - Node where agent will be deployed
  tags?: string[];
  allowedToolIds?: string[];

  // Platform-specific settings
  settings: {
    claude_model?: string;        // e.g., 'claude-3-5-sonnet-latest'
    claude_maxTurns?: number;     // Default: 100
    discord_token?: string;       // Discord bot token
    discord_channelIds?: string[];
    discord_botId?: string;
    telegram_token?: string;
    telegram_groupIds?: string[];
    // ... other platform configs
  };
}
```

**KHONG can field:**
- `deploymentId` - Managed agents khong dung deployment (dung Claude Code SDK tren node)

**Response:** Agent object voi `secret` da duoc hash (201 Created)

**Side Effect:** If `nodeId` specified and node is connected, AIWM sends `agent.start` event via WebSocket to the node.

**Security:**
- `secret` se duoc hash bang bcrypt truoc khi luu
- Response KHONG tra ve plaintext secret
- Save secret securely - se can cho agent authentication

**Use Case:**
Admin setup Discord bot -> Create managed agent -> AIWM sends agent.start to node -> Node Agent starts bot

---

### 4. Update Agent

**Endpoint:** `PUT /agents/:id`

**Purpose:** Cap nhat agent configuration va metadata

**Allowed Fields:**
```typescript
{
  name?: string;                  // Update name
  description?: string;           // Update description
  status?: string;                // Change status: active/inactive/busy/suspended
  instructionId?: string;         // Change instruction
  guardrailId?: string;           // Add/change guardrail
  deploymentId?: string;          // For autonomous: change LLM deployment
  role?: string;                  // Change RBAC role
  tags?: string[];                // Update tags
  allowedToolIds?: string[];      // Update tool whitelist
  settings?: Record<string, any>; // Update runtime config
}
```

**IMMUTABLE Fields (KHONG duoc thay doi):**
- `type` - Agent type cannot be changed after creation
- `nodeId` - Infrastructure assignment is permanent
- `owner`, `createdBy`, `createdAt` - System-managed fields

**Response:** Updated Agent object (200 OK)

**Business Rules:**
- Autonomous agent: `deploymentId` co the update sang deployment khac
- Managed agent: Khong nen update `settings.discord_*` khi agent dang connect (status: active)
- Changing `status` to `suspended` se disconnect active agent
- `role` update se anh huong toi MCP tool permissions ngay lap tuc

**Use Cases:**
- Switch autonomous agent to different LLM model
- Update managed agent's Discord channels
- Temporarily suspend misbehaving agent
- Upgrade agent's RBAC permissions

---

### 5. Delete Agent

**Endpoint:** `DELETE /agents/:id`

**Purpose:** Soft delete agent (set `deletedAt`)

**Response:**
```typescript
{
  message: "Agent deleted successfully"
}
```

**Behavior:**
- Soft delete: Agent van ton tai trong DB voi `deletedAt` timestamp
- Deleted agents KHONG xuat hien trong list/get queries
- Active connections se bi terminate
- Co the restore bang cach unset `deletedAt` (admin operation)

---

### 6. Agent Config (For Autonomous Agents)

**Endpoint:** `GET /agents/:id/config`

**Purpose:** Lay complete configuration cho client-side chat implementation voi Vercel AI SDK

**Authentication:** Bearer token (user JWT)

**Response for Autonomous Agent:**
```typescript
{
  // MCP Tools Configuration
  mcpServers: {
    "Builtin": {
      type: "http";
      url: string;                // MCP HTTP endpoint (e.g., http://localhost:3306)
      headers: {
        Authorization: string;    // "Bearer <accessToken>"
      };
    };
  };

  // System Prompt
  instruction: string;            // Merged instruction text for agent

  // Runtime Settings
  settings: Record<string, any>;  // Agent's settings object

  // LLM Deployment Info (for autonomous agents)
  deployment: {
    id: string;                   // Deployment ID
    provider: string;             // 'anthropic' | 'openai' | 'google'
    model: string;                // Model identifier (e.g., 'claude-3-5-sonnet-20241022')
    apiEndpoint: string;          // Full API endpoint URL
  };
}
```

**Field Purposes:**

1. **mcpServers** - MCP tool server configuration:
   - `url`: Endpoint to call MCP tools
   - `headers.Authorization`: Include in every MCP request

2. **instruction** - System prompt:
   - Pass to LLM as `system` message
   - Contains agent's behavioral instructions

3. **deployment** - LLM configuration:
   - `provider`: Which SDK to use (@anthropic-ai/sdk, openai, @ai-sdk/google)
   - `model`: Model name to request
   - `apiEndpoint`: API base URL

**Error Responses:**
- `401 Unauthorized` - Invalid token or agent suspended
- `404 Not Found` - Agent not found
- `400 Bad Request` - Managed agent does not support this endpoint

---

### 7. Agent Connect (For Managed Agents)

**Endpoint:** `POST /agents/:id/connect`

**Purpose:** Managed agent authentication and retrieve full config

**Authentication:** Agent secret (in body)

**Request Body:**
```typescript
{
  secret: string;   // Agent secret
}
```

**Response:**
```typescript
{
  accessToken: string;
  expiresIn: number;              // 86400 (24h)
  refreshToken: null;
  refreshExpiresIn: 0;
  tokenType: "bearer";
  mcpEndpoint: string;            // MCP endpoint URL
  instruction: string;
  tools: [...];
  settings: Record<string, any>;
}
```

**Validation:**
- Works for `type: 'managed'`
- Returns 400 for `type: 'autonomous'`

---

## Integration Flow: Autonomous Agent Chat

### Setup Flow

1. **Create Autonomous Agent**
   ```
   POST /agents
   {
     name: "Finance Assistant",
     type: "autonomous",
     deploymentId: "507f...",  // Points to Claude deployment
     instructionId: "608f...",  // Finance domain instructions
     role: "organization.owner"
   }
   ```

2. **Get Agent Config**
   ```
   GET /agents/{agentId}/config
   Authorization: Bearer <userJWT>

   -> Response contains:
     - deployment.provider = "anthropic"
     - deployment.model = "claude-3-5-sonnet-20241022"
     - deployment.apiEndpoint = "https://api.anthropic.com/v1/messages"
     - instruction = "You are a finance assistant..."
     - mcpServers.Builtin.url = "http://localhost:3306"
   ```

3. **Frontend Implementation with Vercel AI SDK**

   Frontend su dung response data de:

   a. **Initialize LLM Client**
   - Use `deployment.provider` to select SDK
   - Configure with `deployment.model` va `deployment.apiEndpoint`

   b. **Setup System Prompt**
   - Pass `instruction` as system message

   c. **Configure MCP Tools**
   - Call `mcpServers.Builtin.url` de list available tools
   - Map MCP tools to Vercel AI SDK tool format

   d. **Tool Execution**
   - When LLM requests tool use
   - Frontend calls MCP endpoint voi tool name + arguments
   - Return tool result to LLM

### MCP Tool Call Format

**List Tools:**
```
POST {mcpServers.Builtin.url}
Headers: { Authorization: "Bearer {accessToken}" }
Body: {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/list",
  params: {}
}

-> Response: Array of available tools with schemas
```

**Call Tool:**
```
POST {mcpServers.Builtin.url}
Headers: { Authorization: "Bearer {accessToken}" }
Body: {
  jsonrpc: "2.0",
  id: 2,
  method: "tools/call",
  params: {
    name: "cbm_documents_list",
    arguments: {
      search: "finance",
      page: 1,
      limit: 10
    }
  }
}

-> Response: Tool execution result
```

---

## Best Practices

### For Autonomous Agents

1. **Deployment Selection**
   - Choose deployment based on:
     - Provider preference (Anthropic, OpenAI, Google)
     - Model capabilities (context window, tool calling support)
     - Cost considerations
   - Ensure deployment status is `running` before linking

2. **Instruction Design**
   - Keep instructions clear and specific
   - Include tool usage guidelines
   - Define agent's role and boundaries

3. **Role Assignment**
   - Start with `organization.viewer` for limited access
   - Grant `organization.editor` for write operations
   - Reserve `organization.owner` for administrative agents

4. **Tool Whitelisting**
   - Leave `allowedToolIds` empty for full access
   - Restrict to specific tools for focused agents

### For Managed Agents

1. **Secret Management**
   - Generate strong, unique secrets (min 32 chars)
   - Store plaintext secret securely (needed for agent deployment)
   - Never expose secret in logs or UI

2. **Platform Configuration**
   - Set appropriate `claude_maxTurns` to limit conversation length
   - Configure platform tokens (Discord/Telegram) in `settings`
   - Test platform integration before activating

3. **Node Assignment**
   - Assign to node with sufficient resources
   - Verify node is online before creating agent
   - AIWM sends `agent.start` automatically when creating

4. **Monitoring**
   - Track `lastHeartbeatAt` for health monitoring
   - Monitor `connectionCount` for usage patterns
   - Alert on status changes to `suspended` or connection drops

---

## Common Scenarios

### Scenario 1: Create Chat UI for Document Assistant

1. Create autonomous agent with `deploymentId` pointing to Claude deployment
2. Set `instructionId` with document assistant instructions
3. Set `role: "organization.viewer"` for read-only access
4. Frontend calls `GET /agents/:id/config` to get deployment info
5. Use Vercel AI SDK to setup chat with:
   - Claude API client (from deployment info)
   - System prompt (from instruction)
   - MCP tools for document access (from mcpServers)

### Scenario 2: Deploy Discord Bot

1. Create managed agent with Discord settings and `nodeId`
2. Include `discord_token`, `discord_channelIds`, `discord_botId` in settings
3. AIWM sends `agent.start` to node via WebSocket
4. Node Agent starts Discord bot with provided settings
5. Bot automatically handles messages from Discord channels

### Scenario 3: Switch Agent to Different LLM

1. User wants to switch from Claude to GPT-4
2. Create new Deployment with OpenAI model
3. Update autonomous agent: `PUT /agents/:id` with new `deploymentId`
4. Frontend re-fetches config to get updated deployment info
5. Chat UI now uses OpenAI client instead of Anthropic

### Scenario 4: Temporarily Disable Agent

1. Update agent status: `PUT /agents/:id` with `status: "suspended"`
2. Active connections terminated
3. New connection attempts rejected with 401
4. Re-enable: Update status back to `active`

---

## Error Handling

### Common Error Codes

- `400 Bad Request` - Invalid input, validation failed
- `401 Unauthorized` - Missing/invalid token, invalid secret, agent suspended
- `403 Forbidden` - Insufficient permissions (RBAC)
- `404 Not Found` - Agent/deployment not found
- `409 Conflict` - Type change attempted, constraint violation
- `500 Internal Server Error` - Server-side error

### Validation Errors

Response format:
```typescript
{
  statusCode: 400,
  message: string | string[],  // Error description(s)
  error: "Bad Request"
}
```

### Business Logic Errors

Examples:
- "Only managed agents can connect via this endpoint"
- "Agent is suspended"
- "Deployment not found or not running"
- "Cannot change agent type after creation"

---

## Security Considerations

### Authentication

- **User operations** (list, create, update, delete): Require JWT token voi valid org roles
- **Agent connect**: Requires agent secret (managed agents only)
- **Agent config**: Requires user JWT (autonomous agents only)

### Authorization (RBAC)

Agent's `role` field controls MCP tool access:
- `organization.viewer` - Read-only tools
- `organization.editor` - Read + write tools
- `organization.owner` - Full access including admin tools

### API Key Security

- Model API keys stored in Model.apiConfig (encrypted at rest)
- NEVER exposed in API responses
- Frontend NEVER sees provider API keys
- Backend handles API key injection for autonomous agents (future: proxy mode)

### Token Lifecycle

- Agent JWT tokens expire after 24 hours
- Frontend should handle token refresh (re-call /config or /connect)
- Suspended agents' tokens immediately invalid

---

## Performance Notes

### Pagination

- Default `limit: 10` items per page
- Maximum `limit: 100` enforced


## Version History

- **v1.0** - Initial release
  - Support managed and autonomous agents
  - Deployment integration for autonomous agents
  - Role-based MCP tool access
  - Config endpoint for frontend integration
- **v1.1** - Type semantics update
  - `managed` = system-managed (deploy to node, has secret, WebSocket lifecycle)
  - `autonomous` = user-controlled (via UI, uses deployment, no secret)
