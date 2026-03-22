# Chat Monitor API — Specification

**Endpoint:** `GET /ws/monitor`
**Service:** AIWM
**Module:** Chat
**Auth:** None (internal debug tool)

---

## Mục đích

API này được thiết kế để hỗ trợ **debug và phân tích hoạt động real-time** của toàn bộ hệ thống chat — bao gồm agent, user, và conversation đang diễn ra.

Các vấn đề thường gặp mà API này giải quyết:

| Triệu chứng | Nguyên nhân API có thể chỉ ra |
|-------------|-------------------------------|
| User gửi tin nhưng không nhận reply | `participant.sockets = []` → FE chưa connect WebSocket |
| Agent không phản hồi | `agent.isOnline = false` → Agent runner chưa khởi động |
| Agent online nhưng im lặng | `agentStatus = idle` dù có tin nhắn mới → Agent nhận message nhưng không xử lý |
| Agent đang bận conversation khác | `agentStatus = busy`, `lastHeartbeat` gần đây |
| Tin nhắn từ Discord/Telegram không vào WS room | Agent không join room → Connection Worker chưa publish `agent:join-room` |
| Conversation bị treo | `lastSent` của user có, `lastReceived` của agent không có → message chưa đến agent |
| User WS và Discord tạo 2 conversation riêng | 2 conversation cùng `agentId` + `userId`, `mode` khác nhau |

Frontend polling API này mỗi **10 giây** để hiển thị dashboard giám sát.

---

## Nguồn dữ liệu

API tổng hợp từ 3 nguồn:

```
Redis                          MongoDB
──────────────────────         ───────────────────────────────
socket:session:{socketId}  →   Conversation (status=active)
conversation:sockets:{id}  →   Action (lastSent / lastReceived)
presence:agent:{agentId}   →   Connection (tên, platform)
presence:user:{userId}
agent:status:{agentId}
```

---

## Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | string | No | Lọc theo agent ID |
| `connectionId` | string | No | Lọc theo connection ID (Discord/Telegram bot) |

---

## Response

### Top-level

```typescript
{
  generatedAt: string;        // ISO 8601 timestamp
  summary: {
    totalActiveConversations: number;
    totalOnlineUsers: number;
    totalOnlineAgents: number;
  };
  conversations: ConversationMonitorItem[];
}
```

### `ConversationMonitorItem`

```typescript
{
  conversationId: string;
  title: string;
  mode: "user" | "connection" | "shared";
  conversationType: string;     // "chat" | "support" | "workflow"
  status: string;               // "active" | "archived" | "closed"
  agentId: string;
  connectionId?: string;        // undefined nếu mode = "user"
  connectionName?: string;      // tên Connection (Discord/Telegram bot)
  platform?: string;            // "discord" | "telegram" | "teams"
  createdAt: string;
  lastMessage?: {
    content: string;
    role: string;
    createdAt: string;
  };
  participants: ParticipantMonitorItem[];
}
```

**Cách derive `mode`:**
- `connectionId` rỗng → `"user"`
- `connectionId` có, `userId` rỗng → `"shared"`
- Cả hai đều có → `"connection"`

### `ParticipantMonitorItem`

```typescript
{
  type: "user" | "agent";
  id: string;                   // userId hoặc agentId
  joinedConversation: string;   // ISO 8601 — thời điểm join từ conversation.participants

  isOnline: boolean;            // true nếu có ít nhất 1 socket active trong Redis
  sockets: SocketInfo[];        // danh sách socket đang kết nối của participant này

  // Chỉ có khi type = "agent"
  agentStatus?: "idle" | "busy" | "unknown";
  lastHeartbeat?: string;       // ISO 8601 — thời điểm heartbeat gần nhất

  // Activity
  lastSent?: {
    content: string;
    createdAt: string;          // ISO 8601
  };
  lastReceived?: {
    content: string;
    createdAt: string;          // ISO 8601
  };
}
```

- `lastSent`: tin nhắn cuối cùng participant này **gửi** trong conversation
- `lastReceived`: tin nhắn cuối cùng của participant **khác** trong cùng conversation (proxy cho "đã nhận")

### `SocketInfo`

```typescript
{
  socketId: string;       // Socket.IO socket ID
  connectedAt: string;    // ISO 8601 — thời điểm socket kết nối
  status: "connected";    // chỉ hiển thị socket đang live
}
```

---

## Ví dụ Response

### Conversation mode `user` — WS Chat UI

```json
{
  "generatedAt": "2026-03-22T10:00:00.000Z",
  "summary": {
    "totalActiveConversations": 2,
    "totalOnlineUsers": 1,
    "totalOnlineAgents": 1
  },
  "conversations": [
    {
      "conversationId": "67de1a2b3c4d5e6f7a8b9c0d",
      "title": "Conversation with agent assistant-01",
      "mode": "user",
      "conversationType": "chat",
      "status": "active",
      "agentId": "agent-assistant-01",
      "createdAt": "2026-03-22T09:00:00.000Z",
      "lastMessage": {
        "content": "How can I help you today?",
        "role": "assistant",
        "createdAt": "2026-03-22T09:55:00.000Z"
      },
      "participants": [
        {
          "type": "agent",
          "id": "agent-assistant-01",
          "joinedConversation": "2026-03-22T09:00:00.000Z",
          "isOnline": true,
          "sockets": [
            {
              "socketId": "Xk92mAbC3",
              "connectedAt": "2026-03-22T08:59:00.000Z",
              "status": "connected"
            }
          ],
          "agentStatus": "idle",
          "lastHeartbeat": "2026-03-22T09:59:45.000Z",
          "lastSent": {
            "content": "How can I help you today?",
            "createdAt": "2026-03-22T09:55:00.000Z"
          },
          "lastReceived": {
            "content": "Hello!",
            "createdAt": "2026-03-22T09:54:30.000Z"
          }
        },
        {
          "type": "user",
          "id": "user-abc123",
          "joinedConversation": "2026-03-22T09:01:00.000Z",
          "isOnline": true,
          "sockets": [
            {
              "socketId": "Ry73nZqP1",
              "connectedAt": "2026-03-22T09:01:00.000Z",
              "status": "connected"
            }
          ],
          "lastSent": {
            "content": "Hello!",
            "createdAt": "2026-03-22T09:54:30.000Z"
          },
          "lastReceived": {
            "content": "How can I help you today?",
            "createdAt": "2026-03-22T09:55:00.000Z"
          }
        }
      ]
    }
  ]
}
```

### Conversation mode `shared` — Discord bot, nhiều user chung 1 conversation

```json
{
  "conversationId": "67de1a2b3c4d5e6f7a8b9c0e",
  "title": "Shared conversation with agent engineer-01",
  "mode": "shared",
  "conversationType": "chat",
  "status": "active",
  "agentId": "agent-engineer-01",
  "connectionId": "67de000000000000000000aa",
  "connectionName": "XOR Discord Bot",
  "platform": "discord",
  "createdAt": "2026-03-22T08:00:00.000Z",
  "lastMessage": {
    "content": "Task completed.",
    "role": "assistant",
    "createdAt": "2026-03-22T09:58:00.000Z"
  },
  "participants": [
    {
      "type": "agent",
      "id": "agent-engineer-01",
      "joinedConversation": "2026-03-22T08:00:00.000Z",
      "isOnline": true,
      "sockets": [
        {
          "socketId": "Wm44kLpQ9",
          "connectedAt": "2026-03-22T07:59:00.000Z",
          "status": "connected"
        }
      ],
      "agentStatus": "busy",
      "lastHeartbeat": "2026-03-22T09:59:50.000Z",
      "lastSent": {
        "content": "Task completed.",
        "createdAt": "2026-03-22T09:58:00.000Z"
      },
      "lastReceived": {
        "content": "Please run the deploy script.",
        "createdAt": "2026-03-22T09:57:00.000Z"
      }
    },
    {
      "type": "user",
      "id": "discord:123456789",
      "joinedConversation": "2026-03-22T08:05:00.000Z",
      "isOnline": false,
      "sockets": [],
      "lastSent": {
        "content": "Please run the deploy script.",
        "createdAt": "2026-03-22T09:57:00.000Z"
      },
      "lastReceived": {
        "content": "Task completed.",
        "createdAt": "2026-03-22T09:58:00.000Z"
      }
    },
    {
      "type": "user",
      "id": "discord:987654321",
      "joinedConversation": "2026-03-22T08:10:00.000Z",
      "isOnline": false,
      "sockets": [],
      "lastSent": null,
      "lastReceived": {
        "content": "Task completed.",
        "createdAt": "2026-03-22T09:58:00.000Z"
      }
    }
  ]
}
```

---

## Debug Scenarios — Hướng dẫn đọc kết quả

### Scenario 1: User không nhận được tin nhắn từ agent

```
participant(type=user).isOnline = false
participant(type=user).sockets = []
```
→ **FE chưa kết nối WebSocket**, hoặc socket đã bị disconnect mà không reconnect.

---

### Scenario 2: Agent không reply dù đã nhận tin

```
participant(type=agent).isOnline = true
participant(type=agent).agentStatus = "idle"
participant(type=agent).lastReceived có tin nhắn mới
participant(type=agent).lastSent.createdAt < lastReceived.createdAt
```
→ **Agent đang idle nhưng không xử lý** — kiểm tra AgentRunner logs, có thể bị stuck hoặc message bị filter (skipAgent=true, role=assistant...).

---

### Scenario 3: Agent không online

```
participant(type=agent).isOnline = false
participant(type=agent).sockets = []
participant(type=agent).agentStatus = "unknown"  // không có heartbeat
```
→ **Agent runner chưa khởi động** hoặc đã crash — kiểm tra `nx run aiwm:agt`.

---

### Scenario 4: Tin nhắn Discord không đến agent

```
participant(type=agent).sockets có socketId
// nhưng socketId đó không join room conversation này
participant(type=user).lastSent có tin nhắn mới
participant(type=agent).lastReceived.createdAt cũ hơn nhiều
```
→ **Agent chưa join room** — Connection Worker có thể chưa publish `agent:join-room`, hoặc Redis pub/sub bị gián đoạn.

---

### Scenario 5: Hai conversation trùng lặp cho cùng user + agent

```
conversations có 2 items cùng agentId + participants[].id
mode của 2 items khác nhau: "user" vs "connection"
```
→ **User chat qua cả WS UI lẫn Discord** — đây là behavior đúng theo thiết kế (xem `docs/aiwm/CHAT-MONITOR-API-PLAN.md`). Nếu muốn hợp nhất, cần route Discord về mode `user`.

---

## Redis Keys liên quan

| Key | Type | TTL | Mô tả |
|-----|------|-----|-------|
| `socket:session:{socketId}` | Hash | 1hr | Session data của 1 socket: type, actorId, conversationId, connectedAt |
| `conversation:sockets:{convId}` | Set | 24hr | Tất cả socketId đang trong room của conversation |
| `presence:agent:{agentId}` | Set | 1hr | Tất cả socketId của agent (cross-instance) |
| `presence:user:{userId}` | Set | 1hr | Tất cả socketId của user |
| `agent:status:{agentId}` | Hash | 5min | Trạng thái agent từ heartbeat: status, lastHeartbeat, conversationId, metrics |

---

## Limitations

- `KEYS conversation:sockets:*` được dùng để scan active conversations từ Redis. Với số lượng lớn (>10.000 conversations active đồng thời), nên chuyển sang `SCAN` để tránh block Redis.
- `lastSent` / `lastReceived` được tính từ Action collection — chỉ bao gồm `type=message`, không tính `tool_use`, `thinking`, `command`.
- `agentStatus` chỉ available khi agent đang gửi heartbeat qua WS event `agent:heartbeat`. Agent không gửi heartbeat sẽ hiển thị `"unknown"`.
- API không có auth — chỉ nên expose trên internal network hoặc thêm `X-Internal-Key` header nếu cần bảo mật.
