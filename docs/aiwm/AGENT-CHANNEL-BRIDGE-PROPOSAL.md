# Agent Channel Bridge - Phân tích & Đề xuất

## 1. Hiện trạng

### 1.1 Kiến trúc hiện tại

AIWM hiện có hai luồng giao tiếp hoàn toàn tách biệt:

**Hosted Agent (`type=hosted`)**
```
User ←→ /ws/chat (AIWM) ←→ AgentRunner (in-process) ←→ LLM
```
- Agent chạy trong AIWM worker (`agt` mode)
- Kết nối qua WebSocket `/ws/chat` với JWT token
- Toàn bộ message, action được lưu vào DB qua `MessageService`
- Full audit trail, presence tracking, RBAC enforcement

**Managed Agent (`type=managed`)**
```
Discord/Telegram User ←→ Discord/Telegram API ←→ Agent (external process) ←→ LLM
```
- Agent tự kết nối trực tiếp Discord/Telegram Bot API
- Bypass hoàn toàn AIWM infrastructure
- Không có log conversation trong AIWM
- Không thể verify/audit user đang chat
- Không thể kiểm soát hành động của agent

### 1.2 Vấn đề

| Capability | Hosted | Managed |
|------------|--------|---------|
| Conversation history lưu DB | ✅ | ❌ |
| Audit trail đầy đủ | ✅ | ❌ |
| Verify identity user | ✅ | ❌ |
| Rate limiting / throttle | ✅ | ❌ |
| Enforce guardrails tập trung | ✅ | ❌ |
| `/stop`, `/reload` commands | ✅ | ❌ |
| Presence tracking | ✅ | ❌ |
| Cross-channel conversation | ❌ | ❌ |

---

## 2. Giải pháp đề xuất: Channel Bridge Pattern

### 2.1 Nguyên lý

Thay vì để managed agent tự kết nối Discord/Telegram, AIWM đóng vai trò **trung gian (bridge)**. Tất cả message từ mọi kênh đều đi qua AIWM pipeline thống nhất.

```
Discord User  ─┐
Telegram User ─┼─→ [Channel Adapter] ─→ /ws/chat (AIWM) ─→ AgentRunner ─→ LLM
Web User      ─┘
```

### 2.2 Channel Adapter

Một `ChannelAdapter` là component chạy trong AIWM worker, đảm nhiệm:

1. **Kết nối** external platform (Discord Bot API / Telegram Bot API)
2. **Nhận message** từ external user
3. **Map identity**: `discord:userId` → AIWM conversation/anonymous session
4. **Forward** message vào AIWM pipeline (qua `createMessageDirect` hoặc WebSocket)
5. **Forward response** từ AIWM ngược ra external platform

### 2.3 External User Identity Mapping

Lần đầu user nhắn tin qua Discord/Telegram:
- Auto-create anonymous session hoặc link với AIWM account (nếu user đã verify)
- Lưu mapping: `{ platform: 'discord', externalId: '12345', conversationId: '...' }`
- Tất cả message sau đó được gắn với conversation này → full audit

---

## 3. Phương án triển khai

### Phương án A: Channel Adapter trong AgentRunner ⭐ Recommended

Mở rộng `AgentRunner` để support thêm channel adapters bên cạnh WebSocket.

```
AgentRunner
├── WebSocket connection (/ws/chat)   ← hiện tại
├── DiscordAdapter                    ← mới
└── TelegramAdapter                   ← mới
```

**Cách hoạt động:**
- `AgentRunner` khởi tạo adapters dựa trên `agent.channels` config
- Mỗi adapter lắng nghe message từ external platform
- Adapter nhận message → tạo/reuse AIWM conversation → gọi `createMessageDirect()`
- LLM response → adapter forward ngược ra platform

**Pros:**
- Tái sử dụng hoàn toàn AgentRunner logic (LLM, MCP tools, guardrails)
- Ít thay đổi kiến trúc tổng thể
- Conversation context nhất quán

**Cons:**
- AgentRunner phức tạp hơn (mix WebSocket + external platforms)
- Cần refactor `start()`/`stop()` lifecycle để handle multiple connections

---

### Phương án B: Dedicated Channel Worker

Tạo worker mode mới (`chn`) riêng cho channel bridging.

```
[chn worker]
├── DiscordAdapter → createMessageDirect() → DB
├── TelegramAdapter → createMessageDirect() → DB
│
[agt worker]  (không thay đổi)
└── AgentRunner ← nhận message từ DB trigger hoặc event
```

**Cách hoạt động:**
- `chn` worker chạy độc lập, lắng nghe Discord/Telegram
- Bridge message vào AIWM DB và fire event
- `agt` worker (AgentRunner) nhận event, xử lý, ghi response
- Response → `chn` worker forward ra platform

**Pros:**
- Clean separation of concerns
- AgentRunner không thay đổi gì
- Scale từng worker độc lập

**Cons:**
- Thêm complexity vào message routing
- Latency cao hơn (event-driven async)
- Cần thêm event bus hoặc polling mechanism

---

### Phương án C: Unified Agent Type (Long-term)

Merge `managed` vào `hosted` type, channels chỉ là input/output adapters.

```
Agent (unified)
├── type: hosted (không còn managed)
├── channels: [discord, telegram, web]  ← tất cả là config
└── AgentRunner
    ├── input adapters  ← nhận từ mọi kênh
    └── output adapters ← gửi ra mọi kênh
```

**Pros:**
- Architecture sạch nhất về mặt concept
- Không còn sự phân biệt artificial giữa managed/hosted
- Single code path cho mọi loại agent

**Cons:**
- Breaking change lớn
- Migration effort cao cho existing agents
- Cần thay đổi schema, API, documentation

---

## 4. So sánh

| Tiêu chí | Phương án A | Phương án B | Phương án C |
|----------|-------------|-------------|-------------|
| Effort triển khai | Trung bình | Trung bình | Cao |
| Breaking changes | Thấp | Thấp | Cao |
| Architecture cleanliness | Tốt | Tốt | Tốt nhất |
| Audit capability | ✅ | ✅ | ✅ |
| Scale độc lập | Khó | Dễ | Trung bình |
| Latency | Thấp | Trung bình | Thấp |
| Phù hợp ngắn hạn | ✅ | ✅ | ❌ |

---

## 5. Lộ trình đề xuất

### Phase 1 (Ngắn hạn): Phương án A
- Thêm `DiscordAdapter` và `TelegramAdapter` vào `AgentRunner`
- External user identity mapping schema
- Conversation linkage cho external platforms

### Phase 2 (Trung hạn): Hoàn thiện
- Rate limiting per external user
- User verification flow (link Discord/Telegram account với AIWM account)
- Guardrail enforcement cho channel messages

### Phase 3 (Dài hạn): Phương án C
- Refactor agent type system
- Migration tool cho existing managed agents
- Unified channel configuration UI

---

## 6. Schema thay đổi dự kiến (Phase 1)

### ExternalUserMapping (collection mới)
```typescript
{
  platform: 'discord' | 'telegram',
  externalId: string,        // Discord userId / Telegram chatId
  externalUsername: string,  // Display name trên platform
  agentId: ObjectId,
  conversationId: ObjectId,  // AIWM conversation
  aiwmUserId?: ObjectId,     // Nếu đã link với AIWM account
  createdAt: Date,
  lastActivityAt: Date,
}
```

### Agent.channels (đã có, cần bổ sung)
```typescript
channels: [{
  platform: 'discord' | 'telegram',
  token: string,             // Bot token
  channelId?: string,        // Restrict to specific channel/chat
  verboseLogging: boolean,
  requireMentions: boolean,  // Discord only: require @bot mention
  // Thêm:
  welcomeMessage?: string,   // First-time user greeting
  rateLimitPerUser?: number, // Max messages per minute per user
}]
```
