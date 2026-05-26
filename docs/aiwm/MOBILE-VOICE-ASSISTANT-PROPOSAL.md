# Mobile Voice Assistant — Proposal

## Tổng quan

Mobile app cho phép người dùng tương tác **voice hands-free** với hệ thống AIWM/CBM — truy vấn dữ liệu, giao tiếp với agent, quản lý công việc bằng giọng nói.

Use case chính: người dùng sử dụng khi lái xe, không thể nhìn/chạm màn hình.

---

## Kiến trúc tổng thể

```
Mobile App (mic/speaker)
  │  1. Đăng nhập IAM → JWT
  │  2. Fetch deployments, tools từ AIWM API
  │  3. Kết nối VWS (Socket.IO + JWT)
  ▼
AIWM VWS Gateway                    wss://skt.x-or.cloud/voice
  │  Proxy audio bidirectional
  ▼
Google Gemini Live API              (API key giữ server-side)
  │  tool_call
  ▼
Mobile App executes tool            app tự gọi AIWM/CBM REST API
  │  tool_result
  ▼
Gemini Live → audio response → user nghe
```

**Nguyên tắc:**
- Gemini API key nằm hoàn toàn server-side, app không tiếp xúc
- Tool execution phía app — gọi AIWM/CBM REST API bằng JWT của user
- VWS là pure relay: proxy audio + forward tool_call/tool_result

---

## 1. Authentication — IAM

### 1.1 Login

```
POST https://xsai-api.x-or.cloud/iam/auth/login
Content-Type: application/json
```

**Request body:**
```json
{
  "username": "user@example.com",
  "password": "YourPassword123!"
}
```

**Response 200:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OWE5NzMxZGM3N2JiZjdkYzIxZDZlOGMiLCJ1c2VybmFtZSI6ImR1bmcuaHZAeC1vci5jbG91ZCIsInN0YXR1cyI6ImFjdGl2ZSIsInJvbGVzIjpbIm9yZ2FuaXphdGlvbi5vd25lciJdLCJvcmdJZCI6IjY5MWViOWU2NTE3ZjkxNzk0M2FlMWY5ZCIsImxpY2Vuc2VzIjp7ImlhbSI6ImZ1bGwiLCJjYm0iOiJmdWxsIiwiYWl3bSI6ImZ1bGwifSwiaWF0IjoxNzQ4MjM0NTY3LCJleHAiOjE3NDgyMzgxNjd9.signature",
  "expiresIn": 3600,
  "refreshToken": "0583c49a8ff26132464091da3e1e48d7ae7901af1bd1b6874d3a9c8f2e1b5d7a",
  "refreshExpiresIn": 604800,
  "tokenType": "Bearer"
}
```

**Response 401:**
```json
{
  "statusCode": 401,
  "message": "Invalid credentials"
}
```

> Lưu `accessToken` dùng cho tất cả API calls và VWS connection. Token hết hạn sau `expiresIn` giây.

---

### 1.2 Refresh Token

```
POST https://xsai-api.x-or.cloud/iam/auth/refresh-token
Content-Type: application/json
```

**Request body:**
```json
{
  "refreshToken": "0583c49a8ff26132464091da3e1e48d7ae7901af1bd1b6874d3a9c8f2e1b5d7a"
}
```

**Response 200:** Cùng format với login response — trả về `accessToken` mới.

---

### 1.3 Lấy thông tin user (cho system instruction)

```
GET https://xsai-api.x-or.cloud/iam/auth/profile
Authorization: Bearer {accessToken}
```

**Response 200:**
```json
{
  "_id": "69a9731dc77bbf7dc21d6e8c",
  "username": "dung.hv@x-or.cloud",
  "fullname": "Hoàng Việt Dũng",
  "phonenumbers": ["0987654321"],
  "address": "Hà Nội"
}
```

> `fullname` và `username` dùng để build system instruction.

---

## 2. AIWM API — Lấy dữ liệu cấu hình

Base URL: `https://xsai-api.x-or.cloud/aiwm`

Tất cả requests cần header: `Authorization: Bearer {accessToken}`

### 2.1 Lấy danh sách Voice Deployment

```
GET /deployments?status=running
```

App lọc client-side lấy deployments có model `type=voice` và `protocol=ws`.

> Hoặc gọi `GET /deployments/{id}/endpoint-info` để lấy VWS URL cho deployment đã chọn.

**Response 200:**
```json
{
  "data": [
    {
      "_id": "6a15cfcdca4d8fedaf0e591c",
      "name": "Gemini Live Voice",
      "description": "Voice WS deployment for mobile assistant",
      "modelId": "6a15ce6fca4d8fedaf0e5912",
      "status": "running"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

### 2.2 Lấy danh sách API Tools

```
GET /tools?type=api&limit=100
```

App fetch schema của các tools này để build function declarations cho Gemini.

**Response 200:**
```json
{
  "data": [
    {
      "_id": "tool_id_1",
      "name": "GetWork",
      "description": "Lấy danh sách công việc",
      "type": "api",
      "inputSchema": {
        "type": "object",
        "properties": {
          "projectId": { "type": "string", "description": "ID của project" },
          "status": { "type": "string", "description": "Trạng thái: todo, in_progress, done" }
        }
      },
      "endpoint": {
        "method": "GET",
        "path": "/works",
        "baseService": "cbm"
      }
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 100
}
```

> App dùng `inputSchema` để convert sang Gemini `FunctionDeclaration` format. Khi Gemini gọi tool, app tự thực hiện HTTP call theo `endpoint`.

---

## 3. Voice Session — VWS

### 3.1 Kết nối

**URL:** `wss://skt.x-or.cloud/voice`

**Thư viện:** Socket.IO client (v4)

```javascript
const socket = io('https://skt.x-or.cloud', {
  path: '/voice/socket.io',
  auth: { token: accessToken },
  transports: ['websocket'],
});
```

> Token được verify phía server. Nếu token hết hạn hoặc sai, server ngắt kết nối ngay.

---

### 3.2 Khởi tạo session

Sau khi `connect`, emit event `start`:

```javascript
socket.emit('start', {
  deploymentId: '6a15cfcdca4d8fedaf0e591c',
  toolSchemas: [
    // Gemini FunctionDeclaration format — convert từ AIWM tool inputSchema
    {
      name: 'GetWork',
      description: 'Lấy danh sách công việc',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'ID của project' },
          status: { type: 'string', description: 'Trạng thái: todo, in_progress, done' }
        }
      }
    },
    // Built-in tools (xem mục 4)
    { name: 'SendMessageToAgent', ... },
    { name: 'DisplayContent', ... },
    { name: 'SwitchContext', ... },
  ],
  systemInstruction: '<xem mục 5>'
}, (ack) => {
  if (ack.success) {
    // Chờ event 'ready' từ server
  }
});
```

Server emit `ready` khi Gemini Live session đã khởi tạo xong:

```javascript
socket.on('ready', () => {
  // Bắt đầu stream audio từ mic
});
```

---

### 3.3 Event Protocol

#### App → VWS

| Event | Payload | Mô tả |
|-------|---------|-------|
| `start` | `{ deploymentId, toolSchemas[], systemInstruction }` | Khởi tạo session |
| `audio` | `{ data: string }` | PCM audio chunk, base64, 16kHz 16-bit mono |
| `tool_result` | `{ callId: string, result: any }` | Kết quả thực thi tool |
| `interrupt` | — | Ngắt lời model đang nói |

#### VWS → App

| Event | Payload | Mô tả |
|-------|---------|-------|
| `ready` | — | Session sẵn sàng, bắt đầu stream audio |
| `audio` | `{ data: string }` | Audio response từ Gemini, base64 PCM |
| `tool_call` | `{ callId: string, name: string, args: object }` | Gemini yêu cầu thực thi tool |
| `transcript` | `{ text: string, role: 'user'\|'assistant' }` | Bản text của audio (optional) |
| `turn_complete` | — | Gemini kết thúc một lượt trả lời |
| `error` | `{ message: string }` | Lỗi session |

---

### 3.4 Audio format

| Chiều | Format | Chi tiết |
|-------|--------|---------|
| App → VWS (input) | PCM raw | 16kHz, 16-bit, mono, little-endian, base64 encoded |
| VWS → App (output) | PCM raw | 24kHz, 16-bit, mono, little-endian, base64 encoded |

---

### 3.5 Tool execution flow

```
VWS → app: tool_call { callId: "abc", name: "GetWork", args: { status: "in_progress" } }
  ↓
App: gọi AIWM/CBM REST API theo tool definition
  GET https://xsai-api.x-or.cloud/cbm/works?status=in_progress
  Authorization: Bearer {accessToken}
  ↓
App → VWS: tool_result { callId: "abc", result: { works: [...] } }
  ↓
Gemini nhận kết quả → tiếp tục tạo audio response
```

> Gemini tự suspend (không generate audio) trong khi chờ `tool_result`. Nếu tool xử lý lâu >30s, trả intermediate result `{ status: "pending", message: "Đang xử lý..." }` để tránh timeout.

---

## 4. Built-in App Tools

App tự định nghĩa và xử lý 3 tools sau, không thông qua API:

### `SendMessageToAgent`

Gửi message tới agent qua CWS WebSocket, chờ response.

```json
{
  "name": "SendMessageToAgent",
  "description": "Gửi yêu cầu tới một AI agent và chờ kết quả. Dùng khi cần agent xử lý task phức tạp hoặc tóm tắt thông tin.",
  "parameters": {
    "type": "object",
    "properties": {
      "agentId": { "type": "string", "description": "ID của agent" },
      "message": { "type": "string", "description": "Nội dung yêu cầu" }
    },
    "required": ["agentId", "message"]
  }
}
```

**App thực thi:**

```
1. Kết nối CWS: wss://skt.x-or.cloud/chat  (Socket.IO, path: /chat/socket.io)
   auth: { token: accessToken }
   → Duy trì 1 connection duy nhất trong suốt voice session

2. Emit agent:connect { agentId }
   → Nhận ack: { success: true, conversationId: "..." }

3. Emit message:send { conversationId, role: "user", content: message }

4. Lắng nghe event message:new
   → Lọc: role === "assistant" && conversationId khớp
   → Đây là response của agent

5. Trả tool_result { response: content }
```

---

### `DisplayContent`

Hiển thị nội dung chi tiết lên màn hình, Gemini chỉ đọc tóm tắt bằng giọng nói.

```json
{
  "name": "DisplayContent",
  "description": "Hiển thị nội dung chi tiết lên màn hình app để user xem khi tiện. Dùng khi dữ liệu quá nhiều để đọc hết bằng giọng nói.",
  "parameters": {
    "type": "object",
    "properties": {
      "title": { "type": "string", "description": "Tiêu đề của nội dung" },
      "content": { "type": "string", "description": "Nội dung chi tiết (markdown)" },
      "type": {
        "type": "string",
        "enum": ["list", "markdown", "table"],
        "description": "Kiểu hiển thị"
      }
    },
    "required": ["title", "content", "type"]
  }
}
```

**App thực thi:** Render content lên UI (card/panel), trả `tool_result { success: true }` ngay lập tức. Gemini tiếp tục đọc tóm tắt.

---

### `SwitchContext`

Load một resource cụ thể vào context để Gemini tập trung thảo luận sâu hơn.

```json
{
  "name": "SwitchContext",
  "description": "Chuyển focus sang một tài nguyên cụ thể (document, project, work item) để thảo luận chi tiết hơn về nó.",
  "parameters": {
    "type": "object",
    "properties": {
      "type": {
        "type": "string",
        "enum": ["document", "project", "work", "agent", "default"],
        "description": "Loại tài nguyên"
      },
      "resourceId": { "type": "string", "description": "ID của tài nguyên (bỏ trống nếu type=default)" }
    },
    "required": ["type"]
  }
}
```

**App thực thi:**
1. Nếu có `resourceId`: fetch nội dung từ CBM/AIWM API
2. Trả `tool_result` với nội dung resource kèm hướng dẫn focus
3. Đồng thời mở resource viewer trên UI

---

## 5. System Instruction

App tự build system instruction khi khởi tạo session, không để user chọn:

```
Bạn là trợ lý voice hỗ trợ {user.fullname} trong công việc hàng ngày.
Tổ chức: {org.name}. Vai trò: {user.roles}.

Quy tắc trả lời:
- Trả lời bằng ngôn ngữ tự nhiên, ngắn gọn 1-3 câu
- Không dùng markdown, code block, bullet point, URL
- Khi dữ liệu nhiều hoặc phức tạp: gọi DisplayContent để hiển thị lên màn hình,
  chỉ đọc tóm tắt điểm chính (tối đa 2 câu)
- Hỏi lại khi chưa rõ yêu cầu

{persona}   ← optional, user tự nhập khi setup
```

> `user.fullname` và `org.name` lấy từ `GET /iam/auth/profile` và JWT payload (`orgId`).

---

## 6. App Setup Flow

1. **Login** — `POST /iam/auth/login` → lưu `accessToken` + `refreshToken`
2. **Lấy profile** — `GET /iam/auth/profile` → lưu `fullname`, `username`
3. **Chọn deployment** — `GET /aiwm/deployments` → filter `type=voice, protocol=ws` → user chọn
4. **Chọn tools** — `GET /aiwm/tools?type=api` → user chọn tools cần dùng
5. **Nhập persona** — optional free text
6. App sẵn sàng

---

## 7. Voice Session Flow

```
User tap "Bắt đầu"
  → App connect VWS (wss://skt.x-or.cloud/voice)
  → Build systemInstruction + toolSchemas
  → Emit start { deploymentId, toolSchemas, systemInstruction }
  → Nhận event ready
  → Bắt đầu stream mic audio

User nói → App gửi audio chunks → VWS relay → Gemini xử lý
Gemini gọi tool → App nhận tool_call → gọi API → gửi tool_result
Gemini phát âm → App nhận audio chunks → phát qua speaker

User tap "Dừng" hoặc app background
  → App disconnect VWS
  → Gemini Live session đóng phía server
```

---

## 8. Tính năng chính

| Tính năng | Mô tả |
|-----------|-------|
| Hands-free query | Hỏi về project, task, document bằng giọng nói |
| Agent messaging | Gửi task cho agent, chờ kết quả, nghe tóm tắt |
| Display card | Nội dung dài hiển thị màn hình, giọng nói tóm tắt |
| Context switch | Focus vào một document/project để thảo luận sâu |
| Auto token refresh | App tự refresh JWT khi gần hết hạn |

---

## 9. Deployment status

| Phase | Status | Nội dung |
|-------|--------|---------|
| **Phase 1 — BE** | ✅ Done | Model `protocol` field, VWS gateway (port 3410), PM2 config |
| **Phase 2 — App** | Pending | Mobile app (Flutter/React Native) |
