# Zalo Bot — Webhook Event Payloads

Tài liệu ghi lại cấu trúc payload thực tế từ Zalo Bot API (bot.zapps.me), dựa trên log test ngày 2026-04-23.

---

## Cấu trúc chung

Tất cả event đều có dạng **flat** tại root — không có wrapper `result`:

```json
{
  "event_name": "<event-type>",
  "message": { ... }
}
```

> **Lưu ý:** Tài liệu Zalo Bot docs mô tả payload có `{ "ok": true, "result": { ... } }` nhưng thực tế webhook gửi trực tiếp không có wrapper đó.

### `message` object — các trường chung

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `message_id` | `string` | ID duy nhất của message — dùng để dedup |
| `date` | `number` | Unix timestamp (milliseconds) |
| `from.id` | `string` | Zalo user ID của người gửi |
| `from.display_name` | `string` | Tên hiển thị của người gửi |
| `from.is_bot` | `boolean` | `true` nếu người gửi là bot |
| `chat.id` | `string` | ID của cuộc trò chuyện |
| `chat.chat_type` | `string` | `"PRIVATE"` hoặc `"GROUP"` |

> **PRIVATE chat:** `chat.id === from.id` — cùng một giá trị.

---

## Event Types

### 1. `message.text.received`

Người dùng gửi tin nhắn văn bản thường.

```json
{
  "event_name": "message.text.received",
  "message": {
    "date": 1776919152762,
    "chat": {
      "chat_type": "PRIVATE",
      "id": "a0c01dfe32b3dbed82a2"
    },
    "message_id": "94691c36aef84aa113ee",
    "from": {
      "id": "a0c01dfe32b3dbed82a2",
      "is_bot": false,
      "display_name": "Dzung Hoang"
    },
    "text": "bé ơi"
  }
}
```

**Trường đặc thù:**

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `text` | `string` | Nội dung tin nhắn |

---

### 2. `message.image.received`

Người dùng gửi ảnh (có hoặc không có caption).

```json
{
  "event_name": "message.image.received",
  "message": {
    "date": 1776919226470,
    "chat": {
      "chat_type": "PRIVATE",
      "id": "a0c01dfe32b3dbed82a2"
    },
    "message_id": "85c8e9ee1320f779ae36",
    "message_type": "CHAT_PHOTO",
    "from": {
      "id": "a0c01dfe32b3dbed82a2",
      "is_bot": false,
      "display_name": "Dzung Hoang"
    },
    "caption": "",
    "photo_url": "https://photo-stal-29.zdn.vn/no/jpg/bccf2cc441c88096d9d9/1234858379660747898.jpg"
  }
}
```

**Trường đặc thù:**

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `photo_url` | `string` | URL ảnh trên CDN Zalo |
| `caption` | `string` | Caption kèm ảnh (có thể rỗng `""`) |
| `message_type` | `string` | `"CHAT_PHOTO"` |

---

### 3. `message.sticker.received`

Người dùng gửi sticker.

```json
{
  "event_name": "message.sticker.received",
  "message": {
    "date": 1776919269873,
    "chat": {
      "chat_type": "PRIVATE",
      "id": "a0c01dfe32b3dbed82a2"
    },
    "message_id": "71b03d14f9da1d8344cc",
    "message_type": "CHAT_STICKER",
    "from": {
      "id": "a0c01dfe32b3dbed82a2",
      "is_bot": false,
      "display_name": "Dzung Hoang"
    },
    "sticker": "2be893baafff46a11fee",
    "url": "https://zalo-api.zadn.vn/api/emoticon/oasticker?eid=2702697498474438568&size=130"
  }
}
```

**Trường đặc thù:**

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `sticker` | `string` | Sticker ID |
| `url` | `string` | URL hình ảnh của sticker |
| `message_type` | `string` | `"CHAT_STICKER"` |

---

### 4. `message.unsupported.received`

Các loại message mà Zalo Bot API không expose nội dung: **file, contact, location, quote tin nhắn, reaction, v.v.** Payload chỉ có metadata, **không có trường content.**

> Đã xác nhận qua test thực tế: file và contact đều trả về `message.unsupported.received` không có data.

```json
{
  "event_name": "message.unsupported.received",
  "message": {
    "date": 1776919215412,
    "chat": {
      "chat_type": "PRIVATE",
      "id": "a0c01dfe32b3dbed82a2"
    },
    "message_id": "07188fd77e199a40c30f",
    "from": {
      "id": "a0c01dfe32b3dbed82a2",
      "is_bot": false,
      "display_name": "Dzung Hoang"
    }
  }
}
```

**Xử lý:** Skip — không có nội dung để forward cho agent.

---

## Mapping sang `NormalizedInbound`

| `NormalizedInbound` | Nguồn từ payload | Ghi chú |
|---------------------|------------------|---------|
| `externalUserId` | `message.from.id` | |
| `externalUsername` | `message.from.display_name` | |
| `externalMessageId` | `message.message_id` | Dùng để dedup |
| `serverId` | `message.chat.id` | Send target — dùng để reply |
| `channelId` | `undefined` | Zalo Bot không có thread/topic |
| `text` | `message.text` | Text only; image/sticker cần extract riêng |
| `attachments` | `message.photo_url` hoặc `message.url` | Xem bên dưới |
| `isMention` | `false` | Zalo Bot API không expose mention info |

**Attachments từ image:**
```typescript
{ type: 'image', url: message.photo_url }
```

**Attachments từ sticker:**
```typescript
{ type: 'image', url: message.url, fileId: message.sticker }
```

---

## Routing với `serverId`

Trong PRIVATE chat: `chat.id === from.id`. Để route tin nhắn từ một user cụ thể, dùng `serverId = chat.id`:

```json
{
  "serverId": "a0c01dfe32b3dbed82a2",
  "agentId": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

Để nhận từ **tất cả** user (catch-all), không set `serverId`:
```json
{
  "agentId": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

---

## Bug đã xác nhận (cần fix)

`ZaloBotAdapter.processWebhook()` hiện đang parse sai path:

```typescript
// ❌ Hiện tại — sai
const msg = body?.result?.message;

// ✅ Đúng — payload webhook là flat
const msg = body?.message;
```

Dẫn đến tất cả webhook event bị bỏ qua (không emit message). Cần fix trước khi webhook mode hoạt động được.
