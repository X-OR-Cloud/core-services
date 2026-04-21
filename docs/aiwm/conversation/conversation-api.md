# Conversation API — AIWM Service

Base URL: `http://localhost:3003` (dev) · `https://api.x-or.cloud/dev/aiwm` (prod, port 3330–3339)  
Tất cả endpoint đều yêu cầu header `Authorization: Bearer <jwt_token>`.

---

## 1. Entity Schema

**Conversation** đại diện cho một phiên hội thoại giữa user và agent. Lịch sử tin nhắn được lưu dưới dạng các `Action` riêng biệt, không nhúng trực tiếp vào conversation.

### Enums

#### `status`
| Giá trị | Ý nghĩa |
|---------|---------|
| `active` | Hội thoại đang hoạt động |
| `archived` | Đã lưu trữ, không còn hiển thị mặc định |
| `closed` | Đã đóng, không tiếp nhận tin nhắn mới |

#### `conversationType`
| Giá trị | Ý nghĩa |
|---------|---------|
| `chat` | Hội thoại thông thường (mặc định) |
| `support` | Hội thoại hỗ trợ kỹ thuật |
| `workflow` | Hội thoại gắn với workflow tự động |

#### `userType`
| Giá trị | Ý nghĩa |
|---------|---------|
| `authenticated` | User đã đăng nhập, có userId hệ thống |
| `anonymous` | User vãng lai, dùng anonymousId |

### Fields

| Trường | Kiểu | Bắt buộc | Ý nghĩa | Ví dụ |
|--------|------|----------|---------|-------|
| `_id` | string (ObjectId) | auto | ID hội thoại | `"684a1f77bcf86cd799439011"` |
| `title` | string | ✅ | Tiêu đề hội thoại | `"Phân tích doanh thu Q1"` |
| `description` | string | — | Mô tả ngắn | `"Thảo luận về hiệu suất Q1 2025"` |
| `agentId` | string (ObjectId) | ✅ | ID agent chính xử lý hội thoại | `"507f1f77bcf86cd799439011"` |
| `conversationType` | string (enum) | — | Loại hội thoại | `"chat"` |
| `status` | string (enum) | — | Trạng thái | `"active"` |
| `totalTokens` | number | — | Tổng token đã tiêu thụ | `1250` |
| `totalMessages` | number | — | Tổng số tin nhắn | `8` |
| `totalCost` | number | — | Chi phí tính theo USD | `0.0034` |
| `participants` | array | — | Danh sách người tham gia | xem bên dưới |
| `lastMessage` | object | — | Preview tin nhắn cuối (tối đa 100 ký tự) | xem bên dưới |
| `userId` | string | — | userId hệ thống hoặc anonymousId | `"user_abc123"` |
| `connectionId` | string | — | ID connection nguồn (Discord/Telegram) | `"conn_xyz789"` |
| `userType` | string (enum) | — | Loại user | `"authenticated"` |
| `tags` | string[] | — | Nhãn phân loại | `["sales", "q1-2025"]` |
| `contextSummary` | string | — | Tóm tắt ngữ cảnh, tự động sinh mỗi 10 tin nhắn | `"User hỏi về doanh thu Q1..."` |
| `createdAt` | string (ISO 8601) | auto | Thời điểm tạo | `"2025-04-21T08:00:00.000Z"` |
| `updatedAt` | string (ISO 8601) | auto | Thời điểm cập nhật gần nhất | `"2025-04-21T09:30:00.000Z"` |

#### Nested: `participants[]`

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `type` | `"user"` \| `"agent"` | Loại người tham gia |
| `id` | string | userId hoặc agentId |
| `joined` | string (ISO 8601) | Thời điểm tham gia |

#### Nested: `lastMessage`

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `content` | string | Nội dung tin nhắn (tối đa 100 ký tự) |
| `role` | string | `"user"` hoặc `"agent"` |
| `createdAt` | string (ISO 8601) | Thời điểm gửi |

#### Trường kế thừa từ BaseSchema

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `owner.orgId` | string | ID tổ chức sở hữu |
| `owner.userId` | string | userId sở hữu |
| `owner.agentId` | string | agentId liên kết |
| `isDeleted` | boolean | Soft delete flag (luôn `false` trong response) |
| `createdBy` | string | userId tạo bản ghi |
| `updatedBy` | string | userId cập nhật gần nhất |

---

## 2. API Endpoints

---

### POST /conversations

Tạo mới một hội thoại.

**Body**

| Trường | Kiểu | Bắt buộc | Ý nghĩa | Ví dụ |
|--------|------|----------|---------|-------|
| `title` | string | ✅ | Tiêu đề hội thoại | `"Phân tích doanh thu Q1"` |
| `agentId` | string | ✅ | ID agent xử lý | `"507f1f77bcf86cd799439011"` |
| `description` | string | — | Mô tả ngắn | `"Thảo luận về hiệu suất Q1 2025"` |
| `tags` | string[] | — | Nhãn phân loại | `["sales", "q1"]` |

**Request Sample**

```json
{
  "title": "Phân tích doanh thu Q1 2025",
  "agentId": "507f1f77bcf86cd799439011",
  "description": "Thảo luận về hiệu suất kinh doanh quý 1",
  "tags": ["sales", "q1-2025"]
}
```

**Response**

`201 Created` — Tạo thành công

```json
{
  "_id": "684a1f77bcf86cd799430001",
  "title": "Phân tích doanh thu Q1 2025",
  "description": "Thảo luận về hiệu suất kinh doanh quý 1",
  "agentId": "507f1f77bcf86cd799439011",
  "conversationType": "chat",
  "status": "active",
  "totalTokens": 0,
  "totalMessages": 0,
  "totalCost": 0,
  "participants": [
    { "type": "user", "id": "user_abc123", "joined": "2025-04-21T08:00:00.000Z" },
    { "type": "agent", "id": "507f1f77bcf86cd799439011", "joined": "2025-04-21T08:00:00.000Z" }
  ],
  "userId": "",
  "connectionId": "",
  "userType": "authenticated",
  "tags": ["sales", "q1-2025"],
  "owner": { "orgId": "org_xyz", "userId": "user_abc123", "agentId": "507f1f77bcf86cd799439011" },
  "createdAt": "2025-04-21T08:00:00.000Z",
  "updatedAt": "2025-04-21T08:00:00.000Z"
}
```

`400 Bad Request` — Thiếu hoặc sai trường bắt buộc

```json
{
  "statusCode": 400,
  "message": ["title should not be empty", "agentId should not be empty"],
  "error": "Bad Request"
}
```

`401 Unauthorized` — Thiếu hoặc sai JWT

```json
{ "statusCode": 401, "message": "Unauthorized" }
```

---

### GET /conversations

Lấy danh sách hội thoại có phân trang và thống kê. Hỗ trợ nhiều loại filter kết hợp.

**Query Parameters**

| Param | Kiểu | Ý nghĩa | Ví dụ |
|-------|------|---------|-------|
| `page` | number | Trang hiện tại (mặc định: `1`) | `2` |
| `limit` | number | Số bản ghi mỗi trang (mặc định: `10`) | `20` |
| `keyword` | string | Tìm kiếm trong nội dung tin nhắn (type=message), không phân biệt hoa thường | `"doanh thu"` |
| `unanswered` | boolean | `true` — lọc các hội thoại có tin nhắn cuối của user gửi cách đây hơn 30 giây mà agent chưa phản hồi | `true` |
| `lowResponseRate` | boolean | `true` — lọc các hội thoại có số lượt phản hồi của agent ít hơn số lượt nhắn của user | `true` |
| `userId` | string | Lọc theo userId hệ thống hoặc anonymousId | `"user_abc123"` |
| `agentId` | string | Lọc theo agentId (tìm trong mảng `participants`) | `"507f1f77bcf86cd799439011"` |
| `status` | string | Lọc theo trạng thái | `"active"` |
| `status:in` | string | Lọc nhiều trạng thái, cách nhau bằng dấu phẩy | `"active,archived"` |
| `createdAt:gte` | string (ISO 8601) | Từ ngày (bao gồm) | `"2025-01-01T00:00:00.000Z"` |
| `createdAt:lte` | string (ISO 8601) | Đến ngày (bao gồm) | `"2025-03-31T23:59:59.999Z"` |
| `sort` | string | Sắp xếp, format `field:asc\|desc` (mặc định: `updatedAt:desc`) | `"createdAt:desc"` |

> **Lưu ý toán tử `parseQueryString`:** Các filter thông thường hỗ trợ `:gt`, `:gte`, `:lt`, `:lte`, `:ne`, `:in`, `:nin`, `:regex` áp dụng trực tiếp lên field của Conversation. Ví dụ: `totalMessages:gte=5`, `tags:in=sales,q1`.

> **Kết hợp filter:** Khi dùng `keyword`, `unanswered`, `lowResponseRate` cùng nhau, hệ thống lấy **giao** (intersection) của các tập kết quả, sau đó áp dụng tiếp các filter thông thường.

**Request Samples**

```
GET /conversations?page=1&limit=20
GET /conversations?keyword=doanh+thu&status=active
GET /conversations?unanswered=true&agentId=507f1f77bcf86cd799439011
GET /conversations?lowResponseRate=true&createdAt:gte=2025-01-01T00:00:00.000Z
GET /conversations?userId=user_abc123&status:in=active,archived
```

**Response**

`200 OK`

```json
{
  "data": [
    {
      "_id": "684a1f77bcf86cd799430001",
      "title": "Phân tích doanh thu Q1 2025",
      "description": "Thảo luận về hiệu suất kinh doanh quý 1",
      "agentId": "507f1f77bcf86cd799439011",
      "conversationType": "chat",
      "status": "active",
      "totalTokens": 1250,
      "totalMessages": 8,
      "totalCost": 0.0034,
      "participants": [
        { "type": "user", "id": "user_abc123", "joined": "2025-04-21T08:00:00.000Z" },
        { "type": "agent", "id": "507f1f77bcf86cd799439011", "joined": "2025-04-21T08:00:00.000Z" }
      ],
      "lastMessage": {
        "content": "Doanh thu Q1 tăng 12% so với cùng kỳ năm ngoái",
        "role": "agent",
        "createdAt": "2025-04-21T09:25:00.000Z"
      },
      "userId": "user_abc123",
      "connectionId": "",
      "userType": "authenticated",
      "tags": ["sales", "q1-2025"],
      "contextSummary": "User hỏi về doanh thu Q1 2025. Agent phân tích số liệu và chỉ ra mức tăng trưởng 12%.",
      "owner": { "orgId": "org_xyz", "userId": "user_abc123", "agentId": "507f1f77bcf86cd799439011" },
      "createdAt": "2025-04-21T08:00:00.000Z",
      "updatedAt": "2025-04-21T09:25:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42
  },
  "statistics": {
    "total": 42,
    "byStatus": {
      "active": 35,
      "archived": 5,
      "closed": 2
    },
    "byConversationType": {
      "chat": 38,
      "support": 3,
      "workflow": 1
    }
  }
}
```

`401 Unauthorized`

```json
{ "statusCode": 401, "message": "Unauthorized" }
```

---

### GET /conversations/my-conversations

Lấy danh sách hội thoại của user hiện tại (dựa theo `participants.id`). Không phân trang — trả về toàn bộ, sắp xếp `updatedAt` mới nhất trước.

**Query Parameters**

| Param | Kiểu | Ý nghĩa | Ví dụ |
|-------|------|---------|-------|
| `status` | string | Lọc theo trạng thái | `"active"` |

**Request Sample**

```
GET /conversations/my-conversations?status=active
```

**Response**

`200 OK`

```json
[
  {
    "_id": "684a1f77bcf86cd799430001",
    "title": "Phân tích doanh thu Q1 2025",
    "agentId": "507f1f77bcf86cd799439011",
    "status": "active",
    "totalMessages": 8,
    "lastMessage": {
      "content": "Doanh thu Q1 tăng 12% so với cùng kỳ năm ngoái",
      "role": "agent",
      "createdAt": "2025-04-21T09:25:00.000Z"
    },
    "tags": ["sales", "q1-2025"],
    "createdAt": "2025-04-21T08:00:00.000Z",
    "updatedAt": "2025-04-21T09:25:00.000Z"
  }
]
```

---

### GET /conversations/agent/:agentId

Lấy danh sách hội thoại theo agentId. Không phân trang, sắp xếp `updatedAt` mới nhất trước.

**Path Parameters**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `agentId` | string (ObjectId) | ID của agent |

**Query Parameters**

| Param | Kiểu | Ý nghĩa | Ví dụ |
|-------|------|---------|-------|
| `status` | string | Lọc theo trạng thái | `"active"` |

**Request Sample**

```
GET /conversations/agent/507f1f77bcf86cd799439011?status=active
```

**Response**

`200 OK` — Mảng Conversation (cùng cấu trúc như `GET /conversations` nhưng không có `pagination` và `statistics`)

```json
[
  {
    "_id": "684a1f77bcf86cd799430001",
    "title": "Hỗ trợ khách hàng #1042",
    "agentId": "507f1f77bcf86cd799439011",
    "status": "active",
    "totalMessages": 5,
    "userId": "user_def456",
    "updatedAt": "2025-04-21T10:00:00.000Z"
  }
]
```

---

### GET /conversations/:id

Lấy chi tiết một hội thoại theo ID.

**Path Parameters**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | string (ObjectId) | ID hội thoại |

**Response**

`200 OK`

```json
{
  "_id": "684a1f77bcf86cd799430001",
  "title": "Phân tích doanh thu Q1 2025",
  "description": "Thảo luận về hiệu suất kinh doanh quý 1",
  "agentId": "507f1f77bcf86cd799439011",
  "conversationType": "chat",
  "status": "active",
  "totalTokens": 1250,
  "totalMessages": 8,
  "totalCost": 0.0034,
  "participants": [
    { "type": "user", "id": "user_abc123", "joined": "2025-04-21T08:00:00.000Z" },
    { "type": "agent", "id": "507f1f77bcf86cd799439011", "joined": "2025-04-21T08:00:00.000Z" }
  ],
  "lastMessage": {
    "content": "Doanh thu Q1 tăng 12% so với cùng kỳ năm ngoái",
    "role": "agent",
    "createdAt": "2025-04-21T09:25:00.000Z"
  },
  "userId": "user_abc123",
  "connectionId": "",
  "userType": "authenticated",
  "tags": ["sales", "q1-2025"],
  "contextSummary": "User hỏi về doanh thu Q1. Agent phân tích và chỉ ra mức tăng 12%.",
  "owner": { "orgId": "org_xyz", "userId": "user_abc123", "agentId": "507f1f77bcf86cd799439011" },
  "createdAt": "2025-04-21T08:00:00.000Z",
  "updatedAt": "2025-04-21T09:25:00.000Z"
}
```

`404 Not Found`

```json
{
  "statusCode": 404,
  "message": "Not found",
  "correlationId": "req_abc123"
}
```

---

### PUT /conversations/:id

Cập nhật thông tin hội thoại.

**Path Parameters**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | string (ObjectId) | ID hội thoại |

**Body**

| Trường | Kiểu | Bắt buộc | Ý nghĩa | Ví dụ |
|--------|------|----------|---------|-------|
| `title` | string | — | Tiêu đề mới | `"Q1 2025 — Final Review"` |
| `description` | string | — | Mô tả mới | `"Đã hoàn thành phân tích"` |
| `status` | string (enum) | — | Trạng thái mới: `active`, `archived`, `closed` | `"archived"` |
| `tags` | string[] | — | Nhãn mới (ghi đè toàn bộ) | `["sales", "done"]` |

**Request Sample**

```json
{
  "title": "Q1 2025 — Final Review",
  "tags": ["sales", "done"],
  "status": "archived"
}
```

**Response**

`200 OK` — Conversation object đã cập nhật (cùng cấu trúc `GET /conversations/:id`)

`404 Not Found` — ID không tồn tại

---

### DELETE /conversations/:id

Soft delete hội thoại (đánh dấu `isDeleted: true`, không xóa khỏi database).

**Path Parameters**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | string (ObjectId) | ID hội thoại |

**Response**

`204 No Content` — Xóa thành công, không có body

`404 Not Found`

```json
{
  "statusCode": 404,
  "message": "Not found",
  "correlationId": "req_abc123"
}
```

---

### DELETE /conversations/:id/history

Xóa toàn bộ lịch sử chat (soft delete tất cả Action records) và reset bộ đếm về 0.

> **Quyền:** Chỉ role `organization.owner` hoặc `universe.*` mới được thực hiện.

**Path Parameters**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | string (ObjectId) | ID hội thoại |

**Response**

`200 OK`

```json
{
  "deletedActions": 24
}
```

`403 Forbidden` — Không đủ quyền

```json
{
  "statusCode": 403,
  "message": "Only organization.owner or universe.* roles can clear conversation history",
  "correlationId": "req_abc123"
}
```

`404 Not Found` — ID không tồn tại

---

### POST /conversations/:id/participants

Thêm người tham gia vào hội thoại.

**Path Parameters**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | string (ObjectId) | ID hội thoại |

**Body**

| Trường | Kiểu | Bắt buộc | Ý nghĩa | Ví dụ |
|--------|------|----------|---------|-------|
| `type` | `"user"` \| `"agent"` | ✅ | Loại người tham gia | `"user"` |
| `participantId` | string | ✅ | userId hoặc agentId | `"user_def456"` |

**Request Sample**

```json
{
  "type": "user",
  "participantId": "user_def456"
}
```

**Response**

`200 OK` — Conversation object đã cập nhật

> Nếu participant đã tồn tại trong mảng, hệ thống bỏ qua và trả về conversation không thay đổi.

---

### DELETE /conversations/:id/participants/:type/:participantId

Xóa người tham gia khỏi hội thoại.

**Path Parameters**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | string (ObjectId) | ID hội thoại |
| `type` | `"user"` \| `"agent"` | Loại người tham gia |
| `participantId` | string | userId hoặc agentId cần xóa |

**Request Sample**

```
DELETE /conversations/684a1f77bcf86cd799430001/participants/user/user_def456
```

**Response**

`200 OK` — Conversation object đã cập nhật

---

### POST /conversations/:id/archive

Chuyển trạng thái hội thoại sang `archived`.

**Path Parameters**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | string (ObjectId) | ID hội thoại |

**Response**

`200 OK` — Conversation object với `status: "archived"`

---

### POST /conversations/:id/close

Chuyển trạng thái hội thoại sang `closed`. Hội thoại đã đóng không tiếp nhận tin nhắn mới.

**Path Parameters**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | string (ObjectId) | ID hội thoại |

**Response**

`200 OK` — Conversation object với `status: "closed"`

---

### GET /conversations/:id/metrics

Lấy chỉ số SLA của một hội thoại: thời gian phản hồi, số tin nhắn, lỗi, token tiêu thụ.

**Path Parameters**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | string (ObjectId) | ID hội thoại |

**Response**

`200 OK`

```json
{
  "conversationId": "684a1f77bcf86cd799430001",
  "agentId": "507f1f77bcf86cd799439011",
  "status": "active",
  "createdAt": "2025-04-21T08:00:00.000Z",
  "durationSeconds": 5400,
  "totalMessages": 8,
  "userMessages": 4,
  "agentMessages": 4,
  "systemMessages": 0,
  "firstResponseTime": {
    "ms": 1240,
    "slaBreached": false
  },
  "avgResponseTimeMs": 1850,
  "p90ResponseTimeMs": 3200,
  "errorCount": 0,
  "tokenUsage": {
    "inputTokens": 840,
    "outputTokens": 410
  }
}
```

**Mô tả các trường metrics**

| Trường | Ý nghĩa |
|--------|---------|
| `durationSeconds` | Tổng thời gian hội thoại (giây). Hội thoại đang active tính đến thời điểm gọi API; hội thoại đóng/lưu trữ tính đến `updatedAt` |
| `firstResponseTime.ms` | Thời gian (ms) từ tin nhắn đầu tiên của user đến phản hồi đầu tiên của agent. `null` nếu agent chưa phản hồi |
| `firstResponseTime.slaBreached` | `true` nếu thời gian phản hồi đầu vượt ngưỡng SLA |
| `avgResponseTimeMs` | Trung bình thời gian agent phản hồi sau mỗi lượt user. `null` nếu chưa đủ dữ liệu |
| `p90ResponseTimeMs` | Phân vị 90% thời gian phản hồi. `null` nếu chưa đủ dữ liệu |
| `errorCount` | Số action có `type = "error"` |

`404 Not Found` — ID không tồn tại hoặc không thuộc org của token

---

### POST /conversations/:id/summary

Tự động sinh tóm tắt ngữ cảnh hội thoại bằng AI và lưu vào trường `contextSummary`.

**Path Parameters**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | string (ObjectId) | ID hội thoại |

**Response**

`200 OK`

```json
{
  "summary": "User hỏi về hiệu suất kinh doanh Q1 2025. Agent đã phân tích dữ liệu và cho thấy doanh thu tăng 12%, chủ yếu từ kênh online."
}
```

`404 Not Found` — ID không tồn tại

---

## 3. Tìm kiếm Action trong hội thoại

Lịch sử hội thoại (tin nhắn, sự kiện) được lưu trong module `Action`, không nhúng trong Conversation. Để tìm kiếm action, dùng endpoint `GET /actions` với các query param sau.

---

### GET /actions — Tìm kiếm action theo hội thoại

**Query Parameters**

| Param | Kiểu | Ý nghĩa | Ví dụ |
|-------|------|---------|-------|
| `conversationId` | string (ObjectId) | **Bắt buộc khi tìm theo hội thoại.** Lọc action thuộc conversation cụ thể | `"684a1f77bcf86cd799430001"` |
| `content:regex` | string | Tìm theo từ khóa trong nội dung, không phân biệt hoa thường | `"doanh thu"` |
| `type` | string (enum) | Lọc theo loại action | `"message"` |
| `type:in` | string | Lọc nhiều loại, cách nhau dấu phẩy | `"message,notice"` |
| `actor.role` | string (enum) | Lọc theo vai trò người gửi: `user`, `agent`, `system` | `"user"` |
| `createdAt:gte` | string (ISO 8601) | Từ thời điểm (bao gồm) | `"2025-04-21T08:00:00.000Z"` |
| `createdAt:lte` | string (ISO 8601) | Đến thời điểm (bao gồm) | `"2025-04-21T18:00:00.000Z"` |
| `page` | number | Trang hiện tại (mặc định: `1`) | `2` |
| `limit` | number | Số bản ghi mỗi trang (mặc định: `10`) | `50` |
| `sort` | string | Sắp xếp (mặc định: `createdAt:desc`) | `"createdAt:asc"` |

**Enum `type`**

| Giá trị | Ý nghĩa |
|---------|---------|
| `message` | Tin nhắn thông thường của user hoặc agent |
| `notice` | Tin nhắn hệ thống hiển thị cho user |
| `thinking` | Khối reasoning nội bộ của agent (ẩn với user) |
| `tool_use` | Agent gọi một tool |
| `tool_result` | Kết quả trả về từ tool |
| `error` | Sự kiện lỗi |
| `command` | Slash command có hiệu lực (`/stop`, `/reload`) |
| `joined` | Người tham gia vào hội thoại |
| `left` | Người rời khỏi hội thoại |
| `handoff` | Chuyển giao hội thoại |

**Enum `actor.role`**

| Giá trị | Ý nghĩa |
|---------|---------|
| `user` | Tin nhắn từ người dùng (authenticated hoặc anonymous) |
| `agent` | Phản hồi từ AI agent |
| `system` | Sự kiện nội bộ hệ thống |

**Request Samples**

```
# Toàn bộ action của một hội thoại, sắp xếp cũ → mới
GET /actions?conversationId=684a1f77bcf86cd799430001&sort=createdAt:asc&limit=50

# Tìm tin nhắn chứa từ khóa
GET /actions?conversationId=684a1f77bcf86cd799430001&type=message&content:regex=doanh+thu

# Lọc theo khoảng thời gian
GET /actions?conversationId=684a1f77bcf86cd799430001&createdAt:gte=2025-04-21T08:00:00.000Z&createdAt:lte=2025-04-21T18:00:00.000Z

# Chỉ lấy tin nhắn user và agent (bỏ tool_use, thinking, v.v.)
GET /actions?conversationId=684a1f77bcf86cd799430001&type:in=message,notice&sort=createdAt:asc

# Kết hợp keyword + khoảng thời gian + phân trang
GET /actions?conversationId=684a1f77bcf86cd799430001&content:regex=báo+cáo&createdAt:gte=2025-04-01T00:00:00.000Z&page=1&limit=20
```

**Response**

`200 OK`

```json
{
  "data": [
    {
      "_id": "684a2f77bcf86cd799430010",
      "conversationId": "684a1f77bcf86cd799430001",
      "type": "message",
      "actor": {
        "role": "user",
        "userId": "user_abc123",
        "displayName": "Nguyễn Văn A"
      },
      "content": "Cho em hỏi về doanh thu Q1 2025 như thế nào?",
      "status": "completed",
      "createdAt": "2025-04-21T08:01:00.000Z",
      "updatedAt": "2025-04-21T08:01:00.000Z"
    },
    {
      "_id": "684a2f77bcf86cd799430011",
      "conversationId": "684a1f77bcf86cd799430001",
      "type": "message",
      "actor": {
        "role": "agent",
        "agentId": "507f1f77bcf86cd799439011",
        "displayName": "Sales Assistant"
      },
      "content": "Doanh thu Q1 2025 đạt 12 tỷ đồng, tăng 12% so với cùng kỳ năm ngoái.",
      "usage": {
        "inputTokens": 320,
        "outputTokens": 85,
        "duration": 1240
      },
      "status": "completed",
      "createdAt": "2025-04-21T08:01:02.000Z",
      "updatedAt": "2025-04-21T08:01:02.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 8
  },
  "statistics": {
    "total": 8,
    "byStatus": { "completed": 8 },
    "byType": { "message": 6, "tool_use": 1, "tool_result": 1 }
  }
}
```

`401 Unauthorized` — Thiếu hoặc sai JWT

---

### Khi nào dùng endpoint nào

| Mục đích | Endpoint |
|---------|---------|
| Lấy toàn bộ lịch sử chat theo thứ tự thời gian | `GET /actions/conversation/:conversationId` |
| Tìm kiếm từ khóa / lọc theo thời gian / phân trang linh hoạt | `GET /actions?conversationId=...&content:regex=...` |
| Lấy N tin nhắn gần nhất | `GET /actions/conversation/:conversationId/last/:count` |
| Thống kê số lượt theo role và type | `GET /actions/conversation/:conversationId/statistics` |

---

## 4. Bảng tóm tắt endpoints

| Method | URL | Mô tả |
|--------|-----|-------|
| `POST` | `/conversations` | Tạo mới hội thoại |
| `GET` | `/conversations` | Danh sách hội thoại (phân trang + filter nâng cao) |
| `GET` | `/conversations/my-conversations` | Hội thoại của user hiện tại |
| `GET` | `/conversations/agent/:agentId` | Hội thoại theo agentId |
| `GET` | `/conversations/:id` | Chi tiết hội thoại |
| `PUT` | `/conversations/:id` | Cập nhật tiêu đề, mô tả, status, tags |
| `DELETE` | `/conversations/:id` | Soft delete hội thoại |
| `DELETE` | `/conversations/:id/history` | Xóa toàn bộ lịch sử chat, reset bộ đếm |
| `POST` | `/conversations/:id/participants` | Thêm người tham gia |
| `DELETE` | `/conversations/:id/participants/:type/:participantId` | Xóa người tham gia |
| `POST` | `/conversations/:id/archive` | Lưu trữ hội thoại |
| `POST` | `/conversations/:id/close` | Đóng hội thoại |
| `GET` | `/conversations/:id/metrics` | Chỉ số SLA của hội thoại |
| `POST` | `/conversations/:id/summary` | Sinh tóm tắt ngữ cảnh bằng AI |
| `GET` | `/actions?conversationId=...` | Tìm kiếm action theo keyword, thời gian, phân trang |

---

## 5. Ghi chú đặc biệt

### Filter nâng cao trong GET /conversations

- **`keyword`**: Tìm kiếm trong collection `actions` (trường `content`, `type = "message"`), case-insensitive. Kết quả trả về các conversation chứa ít nhất một tin nhắn khớp từ khóa.
- **`unanswered=true`**: Lấy action cuối cùng của mỗi conversation (trong `actions` type=message), lọc ra conversation có action cuối `actor.role = "user"` và `createdAt < now - 30s`. Dùng để phát hiện user đang chờ agent phản hồi.
- **`lowResponseRate=true`**: Đếm số action theo `actor.role` cho từng conversation, lọc các conversation có `agentCount < userCount`. Dùng để phát hiện agent không phản hồi đủ lượt.
- Khi kết hợp nhiều filter nâng cao, hệ thống lấy **giao (intersection)** của các tập ID trước khi áp dụng filter thông thường và RBAC.

### Thứ tự ưu tiên endpoint

`GET /conversations/my-conversations` và `GET /conversations/agent/:agentId` phải được khai báo **trước** `GET /conversations/:id` trong routing để tránh NestJS hiểu `my-conversations` / `agent` là `:id`.

### Soft delete

Tất cả thao tác `DELETE` đều là soft delete — bản ghi vẫn tồn tại trong database với `isDeleted: true`. Các endpoint GET tự động lọc bỏ bản ghi đã xóa.

### lastMessage.content

Chỉ lưu tối đa 100 ký tự đầu của tin nhắn làm preview cho danh sách. Muốn lấy nội dung đầy đủ cần gọi `GET /actions?conversationId=:id`.

### Lịch sử chat (Actions)

Conversation không nhúng tin nhắn — lịch sử được lưu riêng trong module `Action`. Dùng `GET /actions?conversationId=:id` để lấy toàn bộ lịch sử hội thoại.
