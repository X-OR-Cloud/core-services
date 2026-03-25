# Hướng dẫn tích hợp Chat Bot vào Web App

**Dành cho:** Đối tác X-OR Cloud
**API Base URL:** `https://xsai-api.x-or.cloud/aiwm`
**SDK:** [`@xorcloud/stack-ai-chat-sdk`](https://www.npmjs.com/package/@xorcloud/stack-ai-chat-sdk)

---

## Tổng quan

Luồng tích hợp gồm 2 phần:

1. **Backend** — Dùng API Key để tạo Anonymous Token cho từng người dùng cuối
2. **Frontend** — Dùng Anonymous Token để khởi tạo widget chat qua SDK

```
Backend (server của đối tác)
  └─ POST /agents/:agentId/anonymous-token  (dùng API Key)
       └─ trả về anonymous JWT token

Frontend (web app của đối tác)
  └─ StackAIChat.init({ token: anonymousJwt })
       └─ kết nối WebSocket tới agent
```

---

## Sơ đồ luồng

### Luồng khởi tạo phiên chat

```
Người dùng         Frontend (Web App)       Backend (Server đối tác)     X-OR Cloud API           X-OR WebSocket
     │                     │                          │                        │                        │
     │  Truy cập trang web │                          │                        │                        │
     │────────────────────>│                          │                        │                        │
     │                     │ Lấy / tạo anonymousId    │                        │                        │
     │                     │ (localStorage / user ID) │                        │                        │
     │                     │                          │                        │                        │
     │                     │  GET /api/chat-token     │                        │                        │
     │                     │─────────────────────────>│                        │                        │
     │                     │                          │  POST /aiwm/agents/:id/anonymous-token          │
     │                     │                          │  Authorization: Bearer API_KEY                  │
     │                     │                          │  { anonymousId, expiresIn }                     │
     │                     │                          │───────────────────────>│                        │
     │                     │                          │                        │                        │
     │                     │                          │  { token, expiresAt }  │                        │
     │                     │                          │<───────────────────────│                        │
     │                     │   { token, expiresAt }   │                        │                        │
     │                     │<─────────────────────────│                        │                        │
     │                     │                          │                        │                        │
     │                     │ StackAIChat.init({ wsUrl, token })                │                        │
     │                     │──────────────────────────────────────────────────────────────────────────>│
     │                     │                          │                        │  presence:update        │
     │                     │                          │                        │  { conversationId }     │
     │                     │<──────────────────────────────────────────────────────────────────────────│
     │  Widget hiển thị    │                          │                        │                        │
     │<────────────────────│                          │                        │                        │
```

---

### Luồng nhắn tin

```
Người dùng       SDK Widget          X-OR WebSocket          AI Agent
     │                │                     │                    │
     │  Gửi tin nhắn  │                     │                    │
     │───────────────>│                     │                    │
     │                │  message:send       │                    │
     │                │  { conversationId,  │                    │
     │                │    content }        │                    │
     │                │────────────────────>│                    │
     │                │                     │  message:new       │
     │                │                     │───────────────────>│
     │                │                     │                    │ Xử lý,
     │                │                     │                    │ sinh phản hồi
     │                │                     │  message:send      │
     │                │                     │  { role: assistant,│
     │                │                     │    content }       │
     │                │                     │<───────────────────│
     │                │  message:new        │                    │
     │                │<────────────────────│                    │
     │  Hiển thị      │                     │                    │
     │  phản hồi      │                     │                    │
     │<───────────────│                     │                    │
```

---

### Luồng resume phiên chat (người dùng quay lại)

```
Người dùng         Frontend               Backend            X-OR Cloud API
     │                 │                     │                     │
     │  Quay lại       │                     │                     │
     │ trang web       │                     │                     │
     │────────────────>│                     │                     │
     │                 │ Đọc anonymousId     │                     │
     │                 │ từ localStorage     │                     │
     │                 │ (cùng ID lần trước) │                     │
     │                 │                     │                     │
     │                 │  GET /api/chat-token (anonymousId cũ)     │
     │                 │────────────────────>│                     │
     │                 │                     │  POST /anonymous-token
     │                 │                     │  { anonymousId: "id cũ" }
     │                 │                     │────────────────────>│
     │                 │                     │  token mới          │
     │                 │                     │  (cùng anonymousId) │
     │                 │                     │<────────────────────│
     │                 │      { token }      │                     │
     │                 │<────────────────────│                     │
     │                 │                     │                     │
     │                 │ StackAIChat.init({ token })               │
     │                 │  → Agent nhận ra anonymousId              │
     │                 │  → Tự động tiếp tục conversation cũ       │
```

---

## Bước 1: Lấy thông tin từ X-OR Cloud

Liên hệ X-OR Cloud để nhận:

| Thông tin | Ví dụ | Mô tả |
|-----------|-------|-------|
| **API Key** | `xai_abc12345.xxxxxxxxxxxxxxxx` | Dùng để gọi Management API từ backend |
| **Agent ID** | `67abc123def456789` | ID của agent chatbot |
| **WebSocket URL** | `wss://xsai-api.x-or.cloud/aiwm` | URL kết nối SDK |

> **Lưu ý bảo mật:** API Key chỉ được dùng ở **backend server**. Tuyệt đối không nhúng API Key vào frontend/client-side code.

---

## Bước 2: Tạo Anonymous Token (Backend)

Mỗi khi người dùng cuối mở trang web, backend cần gọi API để tạo một anonymous token cho phiên chat đó.

### Endpoint

```
POST https://xsai-api.x-or.cloud/aiwm/agents/:agentId/anonymous-token
```

### Authentication

Truyền API Key qua header:

```
Authorization: Bearer xai_abc12345.xxxxxxxxxxxxxxxx
```

hoặc:

```
x-api-key: xai_abc12345.xxxxxxxxxxxxxxxx
```

### Request Body

```json
{
  "anonymousId": "user-uuid-cố-định-của-người-dùng",
  "expiresIn": 86400
}
```

| Field | Bắt buộc | Mô tả |
|-------|----------|-------|
| `anonymousId` | Không | UUID định danh người dùng. Nếu không truyền, server tự tạo. **Nên truyền để quản lý phiên theo user.** |
| `expiresIn` | Không | Thời gian sống của token tính bằng giây. Mặc định: `86400` (24 giờ) |

### Response

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "anonymousId": "user-uuid-cố-định-của-người-dùng",
  "tokenId": "a1b2c3d4-...",
  "expiresIn": 86400,
  "expiresAt": "2025-03-25T10:00:00.000Z"
}
```

### Quản lý phiên chat theo người dùng

**Dùng `anonymousId` để liên kết phiên chat với người dùng của hệ thống.** Khi cùng một `anonymousId` được dùng nhiều lần, agent sẽ nhận ra và tiếp tục ngữ cảnh hội thoại.

**Chiến lược tạo `anonymousId`:**

- **Người dùng đã đăng nhập:** Dùng user ID từ hệ thống của bạn (hash nếu cần ẩn danh hóa)
- **Khách (guest):** Tạo UUID ngẫu nhiên, lưu vào `localStorage` để dùng lại cho các lần sau

```javascript
// Ví dụ: lấy hoặc tạo anonymousId cho khách
function getAnonymousId() {
  const key = 'xor_chat_user_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
```

### Ví dụ gọi API (Node.js)

```javascript
async function createAnonymousToken(anonymousId) {
  const response = await fetch(
    'https://xsai-api.x-or.cloud/aiwm/agents/YOUR_AGENT_ID/anonymous-token',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        anonymousId,
        expiresIn: 86400,
      }),
    }
  );

  const data = await response.json();
  return data.token;
}
```

> **Lưu ý:** Token chỉ được trả về **một lần duy nhất** khi tạo. Lưu lại token nếu cần dùng trong cùng một phiên, hoặc tạo token mới khi phiên hết hạn.

---

## Bước 3: Tích hợp SDK vào Frontend

### Cài đặt

```bash
npm install @xorcloud/stack-ai-chat-sdk
```

> **Yêu cầu:** React >= 18.0.0

### Khởi tạo widget

Gọi `StackAIChat.init()` sau khi backend trả về token:

```tsx
import { StackAIChat } from '@xorcloud/stack-ai-chat-sdk';

// Lấy token từ backend của bạn
const token = await fetchTokenFromYourBackend();

StackAIChat.init({
  wsUrl: 'wss://xsai-api.x-or.cloud/aiwm',
  token: token,

  // Giao diện
  title: 'Hỗ trợ khách hàng',
  subtitle: 'Thường phản hồi trong vài phút',
  position: 'bottom-right',

  // Theme
  theme: {
    mode: 'auto',
    primaryColor: '#0066FF',
  },

  // Callbacks
  onConnected: () => console.log('Đã kết nối'),
  onConversationJoined: (id) => console.log('Conversation ID:', id),
  onError: (msg) => console.error('Lỗi:', msg),
});
```

> **Anonymous Flow:** Khi token có `type: 'anonymous'`, server tự động tạo conversation. SDK nhận `conversationId` qua sự kiện `presence:update`. Không cần truyền `conversationId` thủ công.

---

## Ví dụ tích hợp hoàn chỉnh

### Backend (Express.js)

```javascript
// routes/chat-token.js
app.get('/api/chat-token', async (req, res) => {
  try {
    // Lấy anonymousId: user đăng nhập dùng userId, khách dùng session ID
    const anonymousId = req.user?.id ?? req.session.id;

    const response = await fetch(
      'https://xsai-api.x-or.cloud/aiwm/agents/YOUR_AGENT_ID/anonymous-token',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.XOR_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ anonymousId, expiresIn: 86400 }),
      }
    );

    const data = await response.json();
    res.json({ token: data.token, expiresAt: data.expiresAt });
  } catch (err) {
    res.status(500).json({ error: 'Không thể tạo token chat' });
  }
});
```

### Frontend (React)

```tsx
import { useEffect } from 'react';
import { StackAIChat } from '@xorcloud/stack-ai-chat-sdk';

export function ChatWidget() {
  useEffect(() => {
    let initialized = false;

    async function initChat() {
      try {
        const res = await fetch('/api/chat-token');
        const { token } = await res.json();

        StackAIChat.init({
          wsUrl: 'wss://xsai-api.x-or.cloud/aiwm',
          token,
          title: 'Hỗ trợ khách hàng',
          subtitle: 'Thường phản hồi trong vài phút',
          position: 'bottom-right',
          theme: { mode: 'auto', primaryColor: '#0066FF' },
          session: { persist: true, storageKey: 'xor_chat_session', ttl: 86400 },
          onConversationJoined: (id) => {
            // Lưu lại conversationId nếu cần resume sau này
            sessionStorage.setItem('xor_chat_conv', id);
          },
          onError: (msg) => console.error('[Chat]', msg),
        });

        initialized = true;
      } catch (err) {
        console.error('Không thể khởi tạo chat:', err);
      }
    }

    initChat();

    return () => {
      if (initialized) StackAIChat.destroy();
    };
  }, []);

  return null; // Widget tự render vào DOM
}
```

---

## Quản lý token và phiên chat

### Token hết hạn

Token có thời hạn (`expiresAt`). Khi hết hạn, WebSocket sẽ ngắt kết nối. Để xử lý:

```tsx
StackAIChat.init({
  // ...
  onDisconnected: async () => {
    // Tạo token mới và reinit
    StackAIChat.destroy();
    const res = await fetch('/api/chat-token');
    const { token } = await res.json();
    StackAIChat.init({ /* config với token mới */ });
  },
});
```

### Resume hội thoại cũ

Khi người dùng quay lại, dùng cùng `anonymousId` — server sẽ tự động tiếp tục conversation cũ. Không cần lưu `conversationId` thủ công.

---

## Tùy chỉnh giao diện

### Pre-chat Form

Thu thập thông tin người dùng trước khi bắt đầu chat:

```tsx
StackAIChat.init({
  // ...
  fields: [
    { name: 'fullName', label: 'Họ và tên',    type: 'text',  required: true  },
    { name: 'phone',    label: 'Số điện thoại', type: 'tel',   required: true  },
    { name: 'email',    label: 'Email',          type: 'email', required: false },
  ],
  session: {
    persist: true,       // Lưu form vào localStorage, không hỏi lại lần sau
    storageKey: 'xor_chat_user',
    ttl: 86400,
  },
  onFormSubmit: (data) => {
    // Gửi dữ liệu form về backend của bạn nếu cần
    console.log('Thông tin người dùng:', data);
  },
});
```

### File đính kèm

```tsx
StackAIChat.init({
  // ...
  attachments: {
    enabled: true,
    maxSize: 5,                              // MB
    accept: ['image/*', 'application/pdf'],
    maxCount: 3,
  },
});
```

---

## API Methods

| Method | Mô tả |
|--------|-------|
| `StackAIChat.init(config)` | Khởi tạo widget. Chỉ gọi một lần. |
| `StackAIChat.open()` | Mở cửa sổ chat |
| `StackAIChat.close()` | Đóng cửa sổ chat |
| `StackAIChat.destroy()` | Hủy widget, giải phóng tài nguyên |
| `StackAIChat.setReference(text)` | Chèn văn bản trích dẫn vào ô nhập liệu |
| `StackAIChat.updateConfig(partial)` | Cập nhật config sau khi init |

---

## Quản lý token qua API (tùy chọn)

### Xem danh sách token đã tạo

```
GET /agents/:agentId/anonymous-tokens
Authorization: Bearer YOUR_API_KEY
```

### Thu hồi token

```
DELETE /agents/:agentId/anonymous-tokens/:tokenId
Authorization: Bearer YOUR_API_KEY
```

---

## Câu hỏi thường gặp

**Q: Mỗi lần page load có cần tạo token mới không?**
A: Không bắt buộc. Nếu token chưa hết hạn, có thể cache lại phía backend hoặc frontend. Tuy nhiên, đơn giản nhất là tạo token mới mỗi lần load và để server tự resume conversation theo `anonymousId`.

**Q: Một người dùng có thể có nhiều conversation không?**
A: Có. Conversation được quản lý bởi agent. Cùng `anonymousId` sẽ được agent nhận ra là cùng một người dùng.

**Q: API Key có thể dùng cho nhiều agent không?**
A: Tùy scope khi API Key được tạo. Scope `all` dùng được cho tất cả agent trong org. Liên hệ X-OR Cloud để biết scope của API Key được cấp cho bạn.

---

## Hỗ trợ

Liên hệ đội kỹ thuật X-OR Cloud qua email hoặc kênh hỗ trợ được cung cấp khi onboarding.
