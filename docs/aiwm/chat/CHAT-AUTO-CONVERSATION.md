# Chat WebSocket: Auto-Create Conversation for Agents

## Overview

When an agent connects to the WebSocket chat gateway, the system automatically finds or creates a conversation for that agent. This enables agents to start chatting immediately without manual conversation setup.

## How It Works

### 1. Agent Connects to WebSocket

```javascript
// Agent gets token from /agents/:id/connect
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";

// Connect to chat WebSocket
const socket = io('http://localhost:3003/chat', {
  auth: { token }
  // or query: ws://localhost:3003/chat?token=...
});
```

### 2. Auto-Create or Reuse Conversation

**Backend Flow** (ChatGateway.handleConnection):

```typescript
if (isAgent) {
  // Step 1: Find existing active conversation for this agent
  const conversation = await conversationService.findOrCreateForAgent(
    agentId,
    orgId
  );

  // Step 2: Auto-join the conversation room
  await client.join(`conversation:${conversationId}`);
  client.data.conversationId = conversationId;

  // Step 3: Track in Redis
  await chatService.joinConversation(conversationId, agentId);

  // Log: Agent xxx auto-joined conversation yyy
}
```

### 3. Agent Can Send Messages Immediately

```javascript
// No need to emit 'conversation:join' manually!
// Agent is already in the conversation

socket.emit('message:send', {
  conversationId: socket.data.conversationId, // Auto-assigned
  role: 'assistant',
  content: 'Hello! How can I help you?'
});
```

## Database Logic

### ConversationService.findOrCreateForAgent()

```typescript
async findOrCreateForAgent(agentId: string, orgId: string): Promise<Conversation> {
  // 1. Find existing active conversation for this agent
  const existing = await this.model.findOne({
    agentId: agentId,
    status: 'active',
    orgId: orgId,
    isDeleted: false,
  });

  if (existing) {
    // Reuse existing conversation
    return existing;
  }

  // 2. Create new conversation (system-initiated)
  const newConversation = await this.model.create({
    title: `Agent ${agentId} - Auto Conversation`,
    description: 'Automatically created conversation for agent',
    agentId: agentId,
    conversationType: 'chat',
    status: 'active',
    totalTokens: 0,
    totalMessages: 0,
    totalCost: 0,
    participants: [
      {
        type: 'agent',
        id: agentId,
        joined: new Date(),
      },
    ],
    orgId: orgId,
    createdBy: agentId, // Agent creates its own conversation
    updatedBy: agentId,
  });

  return newConversation;
}
```

## Rules

### When Conversation is Created:
- ✅ **First connection**: Agent has no active conversation → Create new
- ✅ **System-initiated**: No user in participants (user can join later)
- ✅ **Auto-named**: Title = "Agent {agentId} - Auto Conversation"

### When Conversation is Reused:
- ✅ **Subsequent connections**: Agent already has active conversation → Reuse
- ✅ **Same org**: Must match agentId + orgId
- ✅ **Active status**: Only reuse conversations with status='active'

### One Conversation Per Agent:
- ✅ Each agent has **exactly one active conversation**
- ✅ If agent disconnects and reconnects → same conversation
- ✅ If conversation is closed/archived → new one created on next connect

## Example Logs

### First Connection (Create New)
```
[ChatGateway] Client abc123 connected (agent: 69520162e1abb06986fdcee5)
[ConversationService] Created new conversation 695201a8e1abb06986fdcef0 for agent 69520162e1abb06986fdcee5
[ChatGateway] Agent 69520162e1abb06986fdcee5 auto-joined conversation 695201a8e1abb06986fdcef0
[ChatService] Agent 69520162e1abb06986fdcee5 is now online (socket: abc123)
```

### Subsequent Connection (Reuse Existing)
```
[ChatGateway] Client xyz789 connected (agent: 69520162e1abb06986fdcee5)
[ConversationService] Reusing existing conversation 695201a8e1abb06986fdcef0 for agent 69520162e1abb06986fdcee5
[ChatGateway] Agent 69520162e1abb06986fdcee5 auto-joined conversation 695201a8e1abb06986fdcef0
[ChatService] Agent 69520162e1abb06986fdcee5 is now online (socket: xyz789)
```

## Client-Side Usage

### Simple Agent Client

```javascript
const io = require('socket.io-client');

// 1. Get agent token
const agentToken = await getAgentToken(); // From /agents/:id/connect

// 2. Connect to chat WebSocket
const socket = io('http://localhost:3003/chat', {
  auth: { token: agentToken }
});

socket.on('connect', () => {
  console.log('Connected! conversationId:', socket.data?.conversationId);

  // 3. Send message immediately (no need to join manually)
  socket.emit('message:send', {
    conversationId: socket.data.conversationId,
    role: 'assistant',
    content: 'I am ready to help!'
  });
});

socket.on('message:new', (message) => {
  console.log('Received message:', message);

  // Process and respond
  socket.emit('message:send', {
    conversationId: socket.data.conversationId,
    role: 'assistant',
    content: `You said: ${message.content}`
  });
});
```

### Getting Conversation ID

The agent can access its conversation ID in two ways:

**Option 1: From socket.data (server-side)**
```typescript
// In ChatGateway
client.data.conversationId // Set during handleConnection
```

**Option 2: From presence:update event**
```javascript
socket.on('presence:update', (data) => {
  if (data.type === 'agent' && data.agentId === myAgentId) {
    console.log('My conversation:', data.conversationId);
  }
});
```

**Option 3: Query via REST API**
```bash
GET /conversations?filter[agentId]=69520162e1abb06986fdcee5&filter[status]=active

# Response:
{
  "data": [
    {
      "_id": "695201a8e1abb06986fdcef0",
      "title": "Agent 69520162e1abb06986fdcee5 - Auto Conversation",
      "agentId": "69520162e1abb06986fdcee5",
      "status": "active"
    }
  ]
}
```

## User Joining Agent Conversation

Users can join the auto-created agent conversation:

### Via REST API
```bash
POST /conversations/695201a8e1abb06986fdcef0/participants/add
{
  "participantType": "user",
  "participantId": "691eba08517f917943ae1fa1"
}
```

### Via WebSocket
```javascript
// User connects
const userSocket = io('http://localhost:3003/chat', {
  auth: { token: userToken }
});

// Join agent's conversation
userSocket.emit('conversation:join', {
  conversationId: '695201a8e1abb06986fdcef0'
});

// Now both agent and user are in the same conversation
```

## Benefits

1. ✅ **Zero setup**: Agents can chat immediately after connecting
2. ✅ **Stateful**: Same conversation persists across reconnections
3. ✅ **Simple**: No manual conversation creation needed
4. ✅ **Scalable**: Works with multiple agents (each has own conversation)
5. ✅ **Trackable**: All messages stored in MongoDB with full history
6. ✅ **Flexible**: Users can join agent conversations later

## Testing

### Test Auto-Create Flow

```bash
# 1. Get agent token
curl -X POST http://localhost:3003/agents/69520162e1abb06986fdcee5/connect \
  -H "Authorization: Bearer <USER_TOKEN>"

# Response: { "accessToken": "..." }

# 2. Connect via Postman WebSocket
# URL: ws://localhost:3003/chat?token=<AGENT_TOKEN>
# Check logs for "auto-joined conversation"

# 3. Send message (no conversation:join needed)
# Event: message:send
# Data: { "conversationId": "...", "role": "assistant", "content": "Hello!" }

# 4. Verify conversation in MongoDB
curl http://localhost:3003/conversations?filter[agentId]=69520162e1abb06986fdcee5
```

### Test Reuse Flow

```bash
# 1. Disconnect agent from WebSocket
# 2. Reconnect with same token
# 3. Check logs: "Reusing existing conversation"
# 4. Send message → should be in same conversation as before
```

## Implementation Files

- **conversation.service.ts**: `findOrCreateForAgent()` method
- **chat.gateway.ts**: Auto-create logic in `handleConnection()`
- **chat.module.ts**: Import ConversationModule
- **conversation.schema.ts**: Conversation model (unchanged)

## Migration Notes

### Before (Manual):
```javascript
// Create conversation manually
const conv = await fetch('/conversations', {
  method: 'POST',
  body: JSON.stringify({ title: '...', agentId: '...' })
});

// Connect WebSocket
socket.connect();

// Join conversation
socket.emit('conversation:join', { conversationId: conv._id });
```

### After (Auto):
```javascript
// Connect WebSocket (conversation auto-created & joined)
socket.connect();

// Start chatting immediately
socket.emit('message:send', { ... });
```

## Future Enhancements

1. **Multi-conversation support**: Allow agents to have multiple active conversations
2. **Conversation archiving**: Auto-archive old conversations after N days
3. **Context retention**: Load last N messages when agent reconnects
4. **Smart routing**: Route user to least-busy agent's conversation
5. **Conversation naming**: Allow agents to set custom conversation titles
