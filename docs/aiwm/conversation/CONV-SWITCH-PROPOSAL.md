# Conversation Switch Feature — Design Proposal

**Service:** aiwm  
**Feature:** Multi-conversation management với `/conv` slash command và WS events  
**Status:** Pending review

---

## Bối cảnh

Hiện tại mỗi lần user gửi message qua connection (Discord, Telegram...) hoặc Chat SDK, hệ thống tự động resolve conversation theo `conversationMode` của agent:

| Mode | Behavior |
|---|---|
| `shared` | Tất cả user cùng 1 conversation |
| `per-user` | Mỗi user 1 conversation cố định |
| `per-session` | Mỗi user 1 conversation, auto-tạo mới khi timeout |

Chưa có cơ chế để user chủ động:
- Xem lại các conversation cũ
- Tạo conversation mới (clear context)
- Quay về conversation cũ

---

## Mục tiêu

1. User có thể **list** conversation gần nhất
2. User có thể **tạo mới** conversation (context trắng hoàn toàn)
3. User có thể **switch** sang conversation cụ thể
4. Hoạt động trên **tất cả mode** — kể cả `shared`
5. Nhất quán giữa connection channel và Chat SDK

---

## Thiết kế

### 1. Nguyên tắc "pin" conversation

Thêm một lớp override cá nhân lên trên conversation mode:

```
Redis key: cnv:pin:{orgId}:{agentId}:{userId}
Value:      conversationId
TTL:        none (persistent)
```

`resolveConversation` sẽ check Redis pin **trước** rồi mới dùng mode logic:

```
resolveConversation():
  1. Lấy pinnedId từ Redis
  2. Nếu pinnedId tồn tại và conversation vẫn còn → dùng conv đó
  3. Không có pin → fallback về mode logic (shared / per-user / per-session) như cũ
```

**Lợi ích:** User trong `shared` mode vẫn có thể branch ra conversation riêng cho mình, trong khi conv shared gốc vẫn hoạt động bình thường cho các user khác.

---

### 2. Conversation numbering — không cần thêm field

Số thứ tự (`#1`, `#2`...) được tính theo **vị trí trong sorted list cố định**, không lưu vào DB.

**Canonical sort:** `{ createdAt: 1, _id: 1 }`

- `createdAt asc` — thứ tự tạo
- `_id asc` — tie-break khi cùng millisecond (ObjectId encode timestamp + random nên deterministic)

Số này ổn định miễn là không hard-delete (soft-delete chỉ dùng `isDeleted: false` filter).

---

### 3. Query scope theo conversation mode

List và switch dùng cùng scope — đảm bảo `#K` trong list luôn match đúng `skip(K-1)` khi switch:

| Mode | Query scope |
|---|---|
| `shared` | `{ orgId, agentId }` — không lọc userId, hiện tất cả conv của agent trong org |
| `per-user` | `{ orgId, agentId, userId }` |
| `per-session` | `{ orgId, agentId, userId }` |

**Switch `/conv K`:**
```
find(<scope>)
  .sort({ createdAt: 1, _id: 1 })
  .skip(K - 1)
  .limit(1)
```

**List (10 gần nhất):**
```
// Bước 1: đếm total trong scope
total = count(<scope>)

// Bước 2: lấy 10 mới nhất
convs = find(<scope>).sort({ createdAt: -1, _id: -1 }).limit(10)

// Bước 3: gán số — conv[0] (mới nhất) = #total, conv[1] = #(total-1)...
convs[i].num = total - i
```

**Không thêm field, không migration.**

---

### 4. Schema thay đổi

**Không có.** Không cần thêm field hay index mới.

---

### 5. ConversationService — methods mới

```typescript
// List conv gần nhất theo scope của mode (shared: orgId+agentId, khác: +userId)
listConversations(params: {
  orgId: string;
  agentId: string;
  userId: string;
  mode: AgentConversationMode;
  limit?: number;         // default 10, max 20
  currentConvId?: string; // để đánh dấu isCurrent
}): Promise<ConvSummary[]>
// ConvSummary: { id, num, title, summary, lastMessage, updatedAt, isCurrent }

// Tạo conv mới và set pin
createAndPin(params: {
  orgId: string;
  agentId: string;
  userId: string;
  mode: AgentConversationMode;
  userType: 'authenticated' | 'anonymous';
}): Promise<{ conv: Conversation; num: number }>

// Tìm conv theo vị trí trong scope của mode, validate rồi set pin
pinByPosition(params: {
  orgId: string;
  agentId: string;
  userId: string;
  mode: AgentConversationMode;
  num: number;
}): Promise<Conversation>

// Internal helpers
getPinnedConversationId(orgId: string, agentId: string, userId: string): Promise<string | null>
setPinnedConversationId(orgId: string, agentId: string, userId: string, convId: string): Promise<void>
```

`resolveConversation` update để check pin trước (2 dòng thêm ở đầu hàm).

---

### 6. Connection channels — Slash commands

**File:** `connection-runner.ts`

Thêm vào bảng lệnh hiện có (`/stop`, `/start`...):

| Command | Hành động |
|---|---|
| `/conv` | List 10 conversation gần nhất |
| `/conv new` | Tạo conversation mới, set pin, xác nhận |
| `/conv <num>` | Switch sang conv số `<num>`, set pin, xác nhận |

Response trả qua outbound handler (cùng pattern lệnh hiện tại).

**Format response `/conv`:**
```
📋 Conversations với [Agent Name]:
#15 ✅ Hỏi về kiến trúc microservices  (hôm nay)
#14    Debug Redis connection timeout   (hôm qua)
#13    Phân tích requirements module    (3 ngày trước)

Dùng /conv new để tạo mới, /conv 14 để chuyển sang #14
```

**Format response `/conv new`:**
```
✅ Đã tạo conversation mới #16 và chuyển sang đây.
```

**Format response `/conv <num>`:**
```
✅ Đã chuyển sang conversation #14 — "Debug Redis connection timeout"
```

**Error cases:**
```
❌ Không tìm thấy conversation #99
❌ /conv chỉ nhận số nguyên dương (vd: /conv 2)
```

---

### 7. Chat SDK — WebSocket events

**File:** `chat.gateway.ts`

#### `conv:list` (client → server)

```typescript
// Payload (optional)
{ limit?: number }  // default 10, max 20

// Response: emit 'conv:list' back to client
{
  conversations: [
    {
      id: string,
      num: number,         // vị trí theo canonical sort (#1, #2...)
      title: string,
      summary: string,     // contextSummary hoặc lastMessage.content cắt ngắn
      lastMessage: { content: string, role: string, createdAt: Date },
      updatedAt: Date,
      isCurrent: boolean   // true nếu đang là conv hiện tại của socket
    }
  ]
}
```

#### `conv:new` (client → server)

```typescript
// Không cần payload

// Response: emit 'conv:new' back to client
{
  conversationId: string,
  num: number,
  title: string
}

// Side effect: leave room cũ, join room mới, update client.data.conversationId
```

#### `conv:switch` (client → server)

```typescript
// Payload
{ num: number }

// Response on success: emit 'conv:switch' back to client
{
  conversationId: string,
  num: number,
  title: string,
  summary: string
}

// Response on failure: emit 'conv:error' back to client
{ code: 'CONV_NOT_FOUND' | 'CONV_ACCESS_DENIED', message: string }

// Side effect: leave room cũ, join room mới, update client.data.conversationId
```

**Room switching logic** (áp dụng cho cả `conv:new` và `conv:switch`):

```typescript
const oldConvId = client.data.conversationId;
// ...resolve new conversation...
client.leave(`conversation:${oldConvId}`);
client.join(`conversation:${newConvId}`);
client.data.conversationId = newConvId;
```

---

### 8. Access control

- `per-user` / `per-session`: chỉ switch sang conversation trong scope `(orgId, agentId, userId)` của user đó
- `shared`: switch sang bất kỳ conv nào trong scope `(orgId, agentId)` — không giới hạn theo userId
- Anonymous user: `userId` = `anonymousId` từ session
- Authenticated user: `userId` = IAM user ID từ JWT

---

## Files cần thay đổi

| File | Thay đổi |
|---|---|
| `conversation/conversation.service.ts` | Thêm `listForUser`, `createAndPin`, `pinByPosition`, Redis pin helpers; update `resolveConversation` |
| `connection-worker/connection-runner.ts` | Thêm case `/conv`, `/conv new`, `/conv <num>` |
| `chat-gateway/chat.gateway.ts` | Thêm 3 WS event handlers |

---

## Không thay đổi

- Schema `conversation.schema.ts` — không thêm field, không thêm index
- `conversationMode` logic trong agent — vẫn là default khi không có pin
- Các slash command hiện có (`/stop`, `/start`, `/sleep`...)
- Schema của các collection khác
- REST API (conversation management qua WS events thay thế hoàn toàn)
