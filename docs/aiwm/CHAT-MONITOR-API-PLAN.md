# Chat Monitor API — Implementation Plan

**Service:** AIWM
**Module:** Chat
**Branch:** `feat/chat-monitor`
**Status:** Planning
**Goal:** Single polling API cho phép debug toàn bộ trạng thái conversation đang active — ai online, socket nào, agent đang làm gì, tin nhắn bị stuck ở đâu.

---

## 1. Bối cảnh & Vấn đề

### Hiện trạng Redis tracking

| Redis Key | Nội dung | Thiếu |
|-----------|----------|-------|
| `presence:agent:{agentId}` | Set socketIds của agent | Không biết socket join room nào |
| `presence:user:{userId}` | Set socketIds của user | Không biết socket join room nào |
| `conversation:{conversationId}:users` | Set participantIds online | Không biết socketId cụ thể |

→ Không thể join ngược: conversation → socket → participant → trạng thái kết nối.

### Các kịch bản debug không giải quyết được hiện tại

1. User gửi tin nhưng agent không reply → không biết agent có nhận được không
2. Agent online nhưng không xử lý → không biết đang busy hay idle
3. Tin nhắn từ Discord không đến được WS room → không trace được
4. User không nhận được reply → không biết user có socket không
5. Conversation stuck ở `processing` → không biết bị lỗi ở đâu

---

## 2. Giải pháp Tổng thể

Ba lớp bổ sung, có thể dùng độc lập hoặc kết hợp:

```
Layer 1: Socket Session Registry  — ai đang kết nối, vào room nào
Layer 2: Agent Heartbeat Tracking — agent đang làm gì
Layer 3: Conversation Processing State — message đang ở bước nào
```

---

## 3. Layer 1: Socket Session Registry

### Redis keys mới

```
socket:session:{socketId}           Hash, TTL 1hr
  type          'user' | 'agent' | 'anonymous'
  actorId       userId hoặc agentId
  conversationId  '' nếu chưa join room
  connectedAt   ISO timestamp

conversation:sockets:{convId}       Set of socketIds, TTL 24hr
```

### Ghi / Xóa

| Sự kiện | Hành động |
|---------|-----------|
| `handleConnection` (agent/user/anon) | HSET `socket:session:{socketId}` với conversationId='' |
| `_joinConversationRoom` | HSET conversationId vào session + SADD vào `conversation:sockets:{convId}` |
| `handleLeaveConversation` | HSET conversationId='' + SREM khỏi `conversation:sockets:{convId}` |
| `handleDisconnect` | DEL `socket:session:{socketId}` + SREM khỏi `conversation:sockets:{convId}` |

### Methods thêm vào `ChatService`

```typescript
setSocketSession(socketId: string, data: SocketSessionData): Promise<void>
updateSocketConversation(socketId: string, conversationId: string): Promise<void>
removeSocketSession(socketId: string, conversationId?: string): Promise<void>
getSocketSession(socketId: string): Promise<SocketSessionData | null>
addSocketToConversation(conversationId: string, socketId: string): Promise<void>
removeSocketFromConversation(conversationId: string, socketId: string): Promise<void>
getConversationSockets(conversationId: string): Promise<string[]>
getAllActiveConversationIds(): Promise<string[]>  // KEYS conversation:sockets:*
```

---

## 4. Layer 2: Agent Heartbeat Tracking

### Redis key mới

```
agent:status:{agentId}              Hash, TTL 5min (tự expire nếu agent mất kết nối)
  status          'idle' | 'busy'
  lastHeartbeat   ISO timestamp
  conversationId  conversationId đang xử lý (nếu busy)
  metrics         JSON string (optional)
```

### Ghi / Xóa

| Sự kiện | Hành động |
|---------|-----------|
| `handleHeartbeat` (agent:heartbeat event) | HSET `agent:status:{agentId}`, reset TTL 5min |
| `handleDisconnect` (agent) | DEL `agent:status:{agentId}` |

### Methods thêm vào `ChatService`

```typescript
setAgentStatus(agentId: string, status: AgentStatusData): Promise<void>
getAgentStatus(agentId: string): Promise<AgentStatusData | null>
clearAgentStatus(agentId: string): Promise<void>
```

---

## 5. Layer 3: Conversation Processing State

### Thêm fields vào `Conversation` schema

```typescript
processingState?: 'idle' | 'processing' | 'error'  // default: 'idle'
lastProcessedAt?: Date
lastErrorAt?: Date
lastErrorMessage?: string
```

### Ai cập nhật

| Nơi cập nhật | Hành động |
|-------------|-----------|
| AgentRunner (agent-worker) — khi nhận message:new | `processingState = 'processing'` |
| AgentRunner — khi reply xong | `processingState = 'idle'`, `lastProcessedAt = now` |
| AgentRunner — khi lỗi | `processingState = 'error'`, `lastErrorAt`, `lastErrorMessage` |
| ConnectionRunner — khi nhận inbound | `processingState = 'processing'` |

### Methods thêm vào `ConversationService`

```typescript
setProcessingState(conversationId: string, state: ProcessingStateUpdate): Promise<void>
```

---

## 6. Monitor API Endpoint

### `GET /ws/monitor`

Không cần auth (internal tool). FE polling mỗi 10 giây.

Query params (optional):
- `?agentId=X` — filter theo agent
- `?connectionId=X` — filter theo connection
- `?mode=user|connection|shared` — filter theo conversation mode

### Response Shape

```typescript
interface MonitorResponse {
  generatedAt: string;          // ISO timestamp
  summary: {
    totalActiveConversations: number;
    totalOnlineUsers: number;
    totalOnlineAgents: number;
    totalProcessing: number;    // conversations đang processing
    totalError: number;         // conversations đang error state
  };
  conversations: ConversationMonitorItem[];
}

interface ConversationMonitorItem {
  conversationId: string;
  title: string;
  mode: 'user' | 'connection' | 'shared';   // derived từ userId/connectionId
  conversationType: string;
  status: string;                            // active | archived | closed
  processingState: 'idle' | 'processing' | 'error' | 'unknown';
  lastProcessedAt?: string;
  lastErrorAt?: string;
  lastErrorMessage?: string;
  agentId: string;
  connectionId?: string;
  connectionName?: string;                   // lookup từ Connection collection
  platform?: string;                         // discord | telegram | teams
  createdAt: string;
  lastMessage?: {
    content: string;
    role: string;
    createdAt: string;
  };
  participants: ParticipantMonitorItem[];
}

interface ParticipantMonitorItem {
  type: 'user' | 'agent';
  id: string;                               // userId hoặc agentId
  joinedConversation: string;               // từ conversation.participants[].joined
  isOnline: boolean;                        // có socket active không
  // Layer 2: chỉ có với type='agent'
  agentStatus?: 'idle' | 'busy' | 'unknown';
  lastHeartbeat?: string;
  // Socket info (Layer 1)
  sockets: SocketInfo[];
  // Activity
  lastSent?: {                              // tin nhắn cuối participant gửi
    content: string;
    createdAt: string;
  };
  lastReceived?: {                          // tin nhắn cuối participant nhận
    content: string;
    createdAt: string;
  };
}

interface SocketInfo {
  socketId: string;
  connectedAt: string;
  status: 'connected';                      // chỉ có connected mới hiển thị
}
```

### Cách derive `mode`

```typescript
function deriveMode(conversation: Conversation): 'user' | 'connection' | 'shared' {
  if (!conversation.connectionId) return 'user';
  if (!conversation.userId) return 'shared';
  return 'connection';
}
```

### Cách lấy `lastSent` / `lastReceived` per participant

Batch query Action collection, tránh N+1:

```typescript
// Lấy tất cả conversationIds cần monitor
// 1 query aggregate để lấy last message per (conversationId, actor.role):
Action.aggregate([
  { $match: {
    conversationId: { $in: conversationIds },
    type: 'message'
  }},
  { $sort: { createdAt: -1 } },
  { $group: {
    _id: { conversationId: '$conversationId', actorId: { $ifNull: ['$actor.userId', '$actor.agentId'] } },
    lastAction: { $first: '$$ROOT' }
  }}
])
```

### Logic `getMonitorData()` trong `ChatService`

```
1. getAllActiveConversationIds() từ Redis (conversation:sockets:*)
   UNION với
   ConversationService.findAllActive() từ MongoDB (status='active', updatedAt > 24h)
   → Đảm bảo không bỏ sót conversation không có socket (mode=shared, tất cả qua Discord)

2. Fetch conversation documents từ MongoDB

3. Lookup Connection names (batch) cho các conversationId có connectionId

4. Với mỗi conversation:
   a. derive mode
   b. Với mỗi participant:
      - getConversationSockets(conversationId) → filter sockets thuộc participant này
      - Lấy session info từ socket:session:{socketId}
      - isOnline = sockets.length > 0 || isUserOnline/isAgentOnline (Redis presence)
      - Nếu type='agent': getAgentStatus(agentId)

5. Batch query Action cho lastSent/lastReceived

6. Build response
```

---

## 7. Các thay đổi Implementation

### Files cần sửa / thêm

| File | Loại | Thay đổi |
|------|------|----------|
| `chat/chat.service.ts` | Sửa | Thêm Layer 1 + Layer 2 methods + `getMonitorData()` |
| `chat/chat.gateway.ts` | Sửa | Gọi Layer 1 methods tại connect/join/leave/disconnect; gọi Layer 2 tại handleHeartbeat |
| `chat/chat.controller.ts` | Sửa | Thêm `GET /ws/monitor` endpoint |
| `chat/chat.module.ts` | Sửa | Import ConnectionModule để lookup connection names |
| `conversation/conversation.schema.ts` | Sửa | Thêm Layer 3 fields: processingState, lastProcessedAt, lastErrorAt, lastErrorMessage |
| `conversation/conversation.service.ts` | Sửa | Thêm `setProcessingState()` |
| `agent-worker/agent-runner.ts` | Sửa | Gọi `setProcessingState` khi start/end/error |
| `connection-worker/connection-runner.ts` | Sửa | Gọi `setProcessingState` khi nhận inbound message |

### Không cần tạo file mới — tất cả nằm trong module hiện tại.

---

## 8. Debug Coverage sau khi implement

| Kịch bản | Layer cần | Có thể kết luận |
|----------|-----------|-----------------|
| User không nhận reply | Layer 1 | `user.sockets = []` → FE chưa connect WS |
| Agent offline | Layer 1 | `agent.isOnline = false` → runner chưa start |
| Agent online nhưng không reply | Layer 1 + 2 | agent có socket, `agentStatus = idle` → agent nhận message nhưng không xử lý |
| Agent đang bận conversation khác | Layer 2 | `agentStatus = busy`, `conversationId ≠ current` |
| Message từ Discord không đến WS | Layer 1 | agent không join room → connection worker chưa publish `agent:join-room` |
| Conversation stuck processing | Layer 3 | `processingState = processing`, `lastProcessedAt` lâu → agent bị stuck hoặc crash |
| LLM error | Layer 3 | `processingState = error`, `lastErrorMessage` có nội dung lỗi |
| User chat WS vs Discord tạo 2 conversation | Layer 1 | thấy 2 conversation cùng agentId+userId, mode khác nhau |

**Ước tính coverage: ~85-90% debug scenarios thực tế.**

---

## 9. Implementation Order

1. **Layer 1** — Socket Session Registry (chat.service + chat.gateway)
2. **Monitor endpoint** — GET /ws/monitor (chat.controller + getMonitorData)
3. **Layer 2** — Heartbeat tracking (chat.service + chat.gateway handleHeartbeat)
4. **Layer 3** — Processing state (conversation.schema + agent-runner + connection-runner)
5. **Verify** — build + TypeScript check

---

## 10. Considerations

- `KEYS conversation:sockets:*` dùng trong getMonitorData — nếu production có hàng nghìn conversation active thì cần đổi sang `SCAN`. Hiện tại chấp nhận được.
- Layer 3 fields trên Conversation schema cần MongoDB migration nếu production đang có data (thêm optional fields, không breaking).
- `GET /ws/monitor` không có auth — chỉ expose trên internal network hoặc thêm `X-Internal-Key` header nếu cần.
