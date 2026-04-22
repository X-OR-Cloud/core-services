# Chat WebSocket: Agent & User Support

## Overview

ChatGateway now supports **both User and Agent** connections with proper token handling and presence tracking.

## Token Types

### User Token (from IAM login)
```json
{
  "sub": "691eba08517f917943ae1fa1",
  "username": "admin@x-or.cloud",
  "type": "user",  // or omitted
  "userId": "691eba08517f917943ae1fa1",
  "roles": ["organization.owner"],
  "orgId": "691eb9e6517f917943ae1f9d"
}
```

### Agent Token (from `/agents/:id/connect`)
```json
{
  "sub": "69520162e1abb06986fdcee5",
  "username": "agent:69520162e1abb06986fdcee5",
  "type": "agent",
  "agentId": "69520162e1abb06986fdcee5",
  "userId": "",  // empty for agents
  "roles": ["organization.viewer"],
  "orgId": "691eb9e6517f917943ae1f9d"
}
```

## Token Authentication Methods

The gateway accepts tokens via **3 methods**:

### 1. Query Parameter (Postman-friendly)
```
ws://localhost:3003/chat?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. Auth Object (Socket.IO client)
```javascript
const socket = io('http://localhost:3003/chat', {
  auth: { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }
});
```

### 3. Authorization Header
```javascript
const socket = io('http://localhost:3003/chat', {
  extraHeaders: {
    Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  }
});
```

## Connection Handling

### Agent Connection
```typescript
// Token detection
const isAgent = payload.type === 'agent' || !!payload.agentId;

// Socket data stored
client.data = {
  type: 'agent',
  userId: null,
  agentId: '69520162e1abb06986fdcee5',
  roles: ['organization.viewer'],
  orgId: '691eb9e6517f917943ae1f9d'
};

// Redis presence tracking
await chatService.setAgentOnline(agentId, socketId);

// Log output
// [ChatGateway] Client xxx connected (agent: 69520162e1abb06986fdcee5)
```

### User Connection
```typescript
// Socket data stored
client.data = {
  type: 'user',
  userId: '691eba08517f917943ae1fa1',
  agentId: null,
  roles: ['organization.owner'],
  orgId: '691eb9e6517f917943ae1f9d'
};

// Redis presence tracking
await chatService.setUserOnline(userId, socketId);

// Log output
// [ChatGateway] Client xxx connected (user: 691eba08517f917943ae1fa1)
```

## Event Payloads

All WebSocket events now include `type` field to distinguish users from agents.

### presence:update
```json
{
  "type": "agent",  // or "user"
  "userId": null,
  "agentId": "69520162e1abb06986fdcee5",
  "status": "online",
  "timestamp": "2025-12-29T08:39:33.000Z"
}
```

### user:joined
```json
{
  "type": "agent",
  "userId": null,
  "agentId": "69520162e1abb06986fdcee5",
  "conversationId": "695201a8e1abb06986fdcef0",
  "timestamp": "2025-12-29T08:40:00.000Z"
}
```

### user:left
```json
{
  "type": "user",
  "userId": "691eba08517f917943ae1fa1",
  "agentId": null,
  "conversationId": "695201a8e1abb06986fdcef0",
  "timestamp": "2025-12-29T08:41:00.000Z"
}
```

### user:typing
```json
{
  "type": "agent",
  "userId": null,
  "agentId": "69520162e1abb06986fdcee5",
  "conversationId": "695201a8e1abb06986fdcef0",
  "isTyping": true,
  "timestamp": "2025-12-29T08:42:00.000Z"
}
```

### message:read
```json
{
  "type": "user",
  "userId": "691eba08517f917943ae1fa1",
  "agentId": null,
  "messageId": "695201e0e1abb06986fdcf00",
  "conversationId": "695201a8e1abb06986fdcef0",
  "timestamp": "2025-12-29T08:43:00.000Z"
}
```

## Request Context

When sending messages, the gateway creates a `RequestContext` with proper agent/user identification:

### Agent Context
```typescript
const context = {
  userId: '',  // empty for agents
  agentId: '69520162e1abb06986fdcee5',
  roles: ['organization.viewer'],
  orgId: '691eb9e6517f917943ae1f9d',
  groupId: '',
  appId: ''
};
```

### User Context
```typescript
const context = {
  userId: '691eba08517f917943ae1fa1',
  agentId: '',  // empty for users
  roles: ['organization.owner'],
  orgId: '691eb9e6517f917943ae1f9d',
  groupId: '',
  appId: ''
};
```

## Redis Presence Keys

### User Presence
```
presence:user:{userId} → Set of socket IDs
```

### Agent Presence
```
presence:agent:{agentId} → Set of socket IDs
```

### Conversation Participants
```
conversation:{conversationId}:users → Set of user/agent IDs
```

## Testing Agent Connection

### Step 1: Get Agent Token
```bash
curl -X POST http://localhost:3003/agents/69520162e1abb06986fdcee5/connect \
  -H "Authorization: Bearer <USER_TOKEN>"

# Response:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400
}
```

### Step 2: Connect via Postman
```
URL: ws://localhost:3003/chat?token=<AGENT_TOKEN>
```

Expected log:
```
[ChatGateway] Client xxx connected (agent: 69520162e1abb06986fdcee5)
[ChatService] Agent 69520162e1abb06986fdcee5 is now online (socket: xxx)
```

### Step 3: Join Conversation
```json
// Event: conversation:join
{
  "conversationId": "695201a8e1abb06986fdcef0"
}

// Response:
{
  "success": true,
  "conversationId": "695201a8e1abb06986fdcef0"
}
```

Expected log:
```
[ChatGateway] Agent 69520162e1abb06986fdcee5 joined conversation 695201a8e1abb06986fdcef0
```

### Step 4: Send Message
```json
// Event: message:send
{
  "conversationId": "695201a8e1abb06986fdcef0",
  "role": "assistant",
  "content": "Hello from agent!",
  "attachments": []
}
```

Expected log:
```
[ChatGateway] Message sent in conversation 695201a8e1abb06986fdcef0 by agent 69520162e1abb06986fdcee5
```

All clients in the room will receive:
```json
// Event: message:new
{
  "_id": "695201e0e1abb06986fdcf00",
  "conversationId": "695201a8e1abb06986fdcef0",
  "role": "assistant",
  "content": "Hello from agent!",
  "createdBy": "69520162e1abb06986fdcee5",
  "createdAt": "2025-12-29T08:44:00.000Z"
}
```

## Changes Summary

### ChatGateway (`chat.gateway.ts`)

1. **Token extraction** - Added query parameter support:
   ```typescript
   const token =
     client.handshake.auth?.token ||
     client.handshake.headers?.authorization?.replace('Bearer ', '') ||
     client.handshake.query?.token;  // NEW
   ```

2. **Connection handling** - Detect agent vs user:
   ```typescript
   const isAgent = payload.type === 'agent' || !!payload.agentId;
   client.data.type = isAgent ? 'agent' : 'user';
   client.data.userId = isAgent ? null : (payload.sub || payload.userId);
   client.data.agentId = isAgent ? (payload.agentId || payload.sub) : null;
   ```

3. **Presence tracking** - Separate methods:
   ```typescript
   if (isAgent) {
     await chatService.setAgentOnline(agentId, socketId);
   } else {
     await chatService.setUserOnline(userId, socketId);
   }
   ```

4. **Event payloads** - Include type/userId/agentId in all events
5. **Request context** - Populate both userId and agentId fields
6. **Logging** - Show "agent" or "user" in all log messages

## Benefits

1. ✅ **Clear separation** - Users and agents are tracked separately
2. ✅ **Flexible auth** - 3 methods to pass tokens (query/auth/header)
3. ✅ **Type safety** - All events include `type` field for client-side logic
4. ✅ **Better logs** - Immediately see if connection is user or agent
5. ✅ **RBAC support** - RequestContext has proper userId/agentId for permissions
6. ✅ **Redis tracking** - Separate presence keys for users and agents
