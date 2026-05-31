# Conversation Management — Chat WebSocket Integration Guide

**Dành cho:** Frontend team tích hợp Chat Client SDK  
**Gateway:** CWS — `wss://skt.x-or.cloud/chat` (namespace `/`)  
**Phiên bản:** v2.14.0+

---

## Tổng quan

Từ v2.14.0, Chat WebSocket hỗ trợ 3 event mới để user quản lý conversation trực tiếp từ giao diện:

| Event (client → server) | Mục đích |
|---|---|
| `conv:list` | Lấy danh sách conversation gần nhất |
| `conv:new` | Tạo conversation mới (context trắng) |
| `conv:switch` | Chuyển sang conversation cũ theo số thứ tự |

Server trả kết quả qua 4 event:

| Event (server → client) | Khi nào |
|---|---|
| `conv:list` | Response của `conv:list` |
| `conv:new` | Response của `conv:new` (thành công) |
| `conv:switch` | Response của `conv:switch` (thành công) |
| `conv:error` | Lỗi từ bất kỳ conv:* command nào |

> **Điều kiện:** Socket phải đang trong session có `agentId` — tức là đã emit `agent:connect` hoặc là anonymous user đã connect với `agentId` trong token.

---

## Conversation Numbering

Mỗi conversation được đánh số `#num` theo thứ tự tạo:
- `#1` = conversation đầu tiên user tạo với agent đó
- `#2`, `#3`... = các conversation tiếp theo
- Số này **bất biến** — không thay đổi khi tạo thêm conversation mới

Số `num` dùng để switch: `conv:switch { num: 2 }` → chuyển sang `#2`.

---

## Events

### `conv:list` — Lấy danh sách conversation

**Emit:**
```json
{ "limit": 10 }
```

| Field | Type | Required | Default | Mô tả |
|---|---|---|---|---|
| `limit` | number | No | 10 | Số conversation trả về, tối đa 20 |

**Server response — emit `conv:list` về đúng socket:**
```json
{
  "conversations": [
    {
      "id": "685a1f2c3d4e5f6a7b8c9d0e",
      "num": 5,
      "title": "Conversation with agent ...",
      "summary": "Thảo luận về kiến trúc microservices và cách tối ưu...",
      "lastMessage": {
        "content": "Cảm ơn bạn, tôi đã hiểu rồi!",
        "role": "user",
        "createdAt": "2026-05-31T10:23:00.000Z"
      },
      "updatedAt": "2026-05-31T10:23:00.000Z",
      "isCurrent": true
    },
    {
      "id": "685a0e1b2c3d4e5f6a7b8c9d",
      "num": 4,
      "title": "Conversation with agent ...",
      "summary": "Debug Redis connection timeout sau khi upgrade v7...",
      "lastMessage": {
        "content": "Đã fix xong, cảm ơn!",
        "role": "user",
        "createdAt": "2026-05-30T15:10:00.000Z"
      },
      "updatedAt": "2026-05-30T15:10:00.000Z",
      "isCurrent": false
    }
  ]
}
```

| Field | Type | Mô tả |
|---|---|---|
| `id` | string | MongoDB ObjectId của conversation |
| `num` | number | Số thứ tự (dùng để switch) |
| `title` | string | Tiêu đề conversation |
| `summary` | string | Tóm tắt nội dung (contextSummary hoặc lastMessage preview) |
| `lastMessage` | object \| null | Tin nhắn cuối cùng |
| `updatedAt` | string | ISO timestamp |
| `isCurrent` | boolean | `true` nếu đây là conversation socket đang ở |

List trả về **newest-first** (mới nhất trước). `num` giảm dần từ đầu đến cuối.

---

### `conv:new` — Tạo conversation mới

**Emit:**
```json
{}
```
Không cần payload.

**Server response — emit `conv:new` về đúng socket:**
```json
{
  "conversationId": "685b3c4d5e6f7a8b9c0d1e2f",
  "num": 6,
  "title": "Conversation with agent ..."
}
```

| Field | Type | Mô tả |
|---|---|---|
| `conversationId` | string | ID của conversation mới |
| `num` | number | Số thứ tự của conversation mới |
| `title` | string | Tiêu đề |

**Side effects:**
- Socket tự động leave room cũ (`conversation:<oldId>`) và join room mới (`conversation:<newId>`)
- `client.data.conversationId` được cập nhật
- Các `message:new` tiếp theo sẽ broadcast vào room mới

---

### `conv:switch` — Chuyển sang conversation theo số thứ tự

**Emit:**
```json
{ "num": 3 }
```

| Field | Type | Required | Mô tả |
|---|---|---|---|
| `num` | number | Yes | Số thứ tự conversation muốn chuyển sang |

**Server response (thành công) — emit `conv:switch` về đúng socket:**
```json
{
  "conversationId": "685a0d0c1b2a3b4c5d6e7f80",
  "num": 3,
  "title": "Conversation with agent ...",
  "summary": "Phân tích requirements module CBM và thiết kế schema..."
}
```

**Side effects:** Tương tự `conv:new` — leave room cũ, join room mới.

---

### `conv:error` — Lỗi

Emit về đúng socket khi bất kỳ conv:* command nào thất bại:

```json
{ "code": "CONV_NOT_FOUND", "message": "Conversation #99 not found" }
{ "code": "CONV_ACCESS_DENIED", "message": "..." }
{ "code": "CONV_LIST_FAILED", "message": "..." }
{ "code": "CONV_NEW_FAILED", "message": "..." }
```

| Code | Nguyên nhân |
|---|---|
| `CONV_NOT_FOUND` | `num` không tồn tại (vượt quá tổng số conversation) |
| `CONV_ACCESS_DENIED` | Conversation không thuộc về user này |
| `CONV_LIST_FAILED` | Lỗi server khi list |
| `CONV_NEW_FAILED` | Lỗi server khi tạo mới |

---

## Luồng tích hợp điển hình

### 1. Mở sidebar "Conversations"

```
FE emit: conv:list {}
Server emit: conv:list { conversations: [...] }
→ Render danh sách, highlight conversation isCurrent=true
```

### 2. User click "New conversation"

```
FE emit: conv:new {}
Server emit: conv:new { conversationId, num, title }
→ Clear chat history UI
→ Cập nhật conversationId trong state
→ Đóng sidebar
```

### 3. User click vào conversation #3

```
FE emit: conv:switch { num: 3 }

Nếu thành công:
  Server emit: conv:switch { conversationId, num, title, summary }
  → Fetch history: emit conversation:history { conversationId }
  → Cập nhật conversationId trong state
  → Render lại chat

Nếu lỗi:
  Server emit: conv:error { code: "CONV_NOT_FOUND", message: "..." }
  → Hiển thị toast lỗi
```

---

## Ví dụ code (TypeScript / React)

### Hook quản lý conversation

```typescript
interface ConvSummary {
  id: string;
  num: number;
  title: string;
  summary: string;
  lastMessage: { content: string; role: string; createdAt: string } | null;
  updatedAt: string;
  isCurrent: boolean;
}

function useConversationManager(socket: Socket | null) {
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;

    socket.on('conv:list', ({ conversations }) => {
      setConversations(conversations);
      setLoading(false);
    });

    socket.on('conv:new', ({ conversationId, num }) => {
      // Conversation mới đã được join tự động bởi server
      // FE cần clear history và cập nhật state
      onConversationChanged(conversationId);
      setLoading(false);
    });

    socket.on('conv:switch', ({ conversationId, num }) => {
      // Conversation đã được switch tự động bởi server
      // FE cần load history của conversation mới
      onConversationChanged(conversationId);
      setLoading(false);
    });

    socket.on('conv:error', ({ code, message }) => {
      setError(message);
      setLoading(false);
    });

    return () => {
      socket.off('conv:list');
      socket.off('conv:new');
      socket.off('conv:switch');
      socket.off('conv:error');
    };
  }, [socket]);

  const listConversations = (limit = 10) => {
    setLoading(true);
    setError(null);
    socket?.emit('conv:list', { limit });
  };

  const createNew = () => {
    setLoading(true);
    setError(null);
    socket?.emit('conv:new', {});
  };

  const switchTo = (num: number) => {
    setLoading(true);
    setError(null);
    socket?.emit('conv:switch', { num });
  };

  return { conversations, loading, error, listConversations, createNew, switchTo };
}
```

### Fetch history sau khi switch

Sau khi nhận `conv:new` hoặc `conv:switch`, FE cần load lại history:

```typescript
socket.on('conv:switch', async ({ conversationId }) => {
  // Server đã tự join room mới, chỉ cần fetch history
  socket.emit('conversation:history', {
    conversationId,
    limit: 50,
  }, (res) => {
    // res.messages — render lại chat
  });
});
```

---

## Lưu ý khi tích hợp

**1. Không cần emit `conversation:join` sau khi switch/new**  
Server tự xử lý room switching. FE chỉ cần cập nhật UI và fetch history.

**2. `isCurrent` trong conv:list**  
Dùng field này để highlight conversation đang active trong sidebar. Chỉ một conversation có `isCurrent: true`.

**3. `message:new` vẫn chạy bình thường**  
Sau khi switch, tất cả message events (`message:new`, `agent:typing`...) tự động broadcast vào room mới — FE không cần re-register listener.

**4. Số `num` là 1-based và ổn định**  
`#1` luôn là conversation đầu tiên. Không thay đổi kể cả khi tạo thêm conversation mới. An toàn để cache hoặc bookmark.

**5. Conversation mode ảnh hưởng đến scope list**  
- `per-user` / `per-session`: chỉ hiện conversation của user đó với agent đó  
- `shared`: hiện tất cả conversation của org+agent (bao gồm của user khác)  
FE không cần xử lý khác biệt này — server tự filter đúng theo mode.

---

## Checklist tích hợp

- [ ] Register listener `conv:list`, `conv:new`, `conv:switch`, `conv:error` khi socket connect
- [ ] Unregister khi component unmount
- [ ] Sau `conv:new` / `conv:switch`: emit `conversation:history` để load lại chat
- [ ] Xử lý `conv:error` — hiển thị toast hoặc inline error
- [ ] Disable nút "New" / "Switch" khi `loading = true` để tránh double-emit
- [ ] Refresh list (`conv:list`) sau khi tạo mới thành công để cập nhật `num` mới nhất
