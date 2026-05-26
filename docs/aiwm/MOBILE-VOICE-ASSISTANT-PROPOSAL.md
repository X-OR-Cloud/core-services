# Mobile Voice Assistant — Proposal

## Tổng quan

Xây dựng mobile app cho phép người dùng tương tác voice hands-free với hệ thống AIWM/CBM — truy vấn dữ liệu, giao tiếp với agent, quản lý công việc bằng giọng nói.

Use case chính: người dùng sử dụng khi lái xe, không thể nhìn/chạm màn hình.

---

## Kiến trúc tổng thể

```
Mobile App (mic/speaker)
  │  WebSocket + JWT
  ▼
AIWM VWS Gateway (:3410)         ← mode mới: aiwm:vws
  │  proxy audio bidirectional
  ▼
Google Gemini Live API
  │  tool_call
  ▼
Mobile App executes tool          ← app tự gọi AIWM/CBM REST API
  │  tool_result
  ▼
Gemini Live → audio response → user
```

**Nguyên tắc thiết khai:**
- API key Google giữ server-side (VWS), mobile không tiếp xúc
- Tool execution phía mobile — app gọi AIWM/CBM REST API bằng JWT của user
- VWS là pure relay: proxy audio + forward tool_call/tool_result
- AIWM agent pipeline (agt, cws) không thay đổi

---

## BE Changes

### 1. Model Schema — thêm `protocol` field

```typescript
// model.schema.ts
protocol?: 'rest' | 'ws'   // 'rest' = standard HTTP, 'ws' = realtime bidirectional (Gemini Live, OpenAI Realtime)
```

Các field hiện tại dùng được nguyên:
- `type: 'voice'` — đã có trong enum
- `apiEndpoint` — chứa WSS URL của Gemini Live
- `apiConfig: Record<string, string>` — chứa API key
- `provider: 'google'` — đã có
- `modelIdentifier` — `'gemini-2.0-flash-live'`

### 2. DeploymentService — thêm case voice/ws

`buildEndpointInfo()` thêm branch:

```
model.type === 'voice' && model.protocol === 'ws'
  → return { url: `${baseApiUrl}/deployments/${deploymentId}/voice` }
     (WS endpoint tại VWS mode, không phải Google trực tiếp)
```

### 3. AIWM mode mới: `vws` — Voice WS Gateway

**Port:** 3410

**Entry point:** `bootstrap-voice-ws.ts` (theo pattern của `bootstrap-chat-ws.ts`)

**Module:** `VoiceGatewayModule` → `VoiceGateway` + `VoiceSessionManager`

#### Session lifecycle

```
App connect WS (handshake: JWT token)
  ▼
VoiceGateway.handleConnection()
  ├── validate JWT (JwtService)
  └── create VoiceSession { userId, orgId, token }

App emit 'start' { deploymentId, toolSchemas[], systemInstruction }
  ▼
VoiceSession.init()
  ├── fetch deployment → model → apiKey + wsEndpoint
  └── open Gemini Live WS với:
        systemInstruction: từ app
        tools: toolSchemas[] từ app (đã convert sang Gemini format)

VoiceGateway emit 'ready' → session active

--- bidirectional relay ---

App → { type: 'audio', data: base64_pcm }      → Gemini Live
App ← { type: 'audio', data: base64_pcm }      ← Gemini Live
App ← { type: 'tool_call', callId, name, args } ← Gemini Live
App → { type: 'tool_result', callId, result }   → Gemini Live
App ← { type: 'transcript', text, role }        ← Gemini Live (optional)

App disconnect → VoiceSession.destroy() → close Gemini Live WS
```

#### Event protocol (App ↔ VWS)

| Direction | Event | Payload |
|-----------|-------|---------|
| App → VWS | `start` | `{ deploymentId, toolSchemas[], systemInstruction }` |
| App → VWS | `audio` | `{ data: base64_pcm }` |
| App → VWS | `tool_result` | `{ callId, result: any }` |
| App → VWS | `interrupt` | — |
| VWS → App | `ready` | — |
| VWS → App | `audio` | `{ data: base64_pcm }` |
| VWS → App | `tool_call` | `{ callId, name, args }` |
| VWS → App | `transcript` | `{ text, role: 'user'\|'assistant' }` |
| VWS → App | `error` | `{ message }` |

#### Đặc điểm implementation

- Không cần Redis pub/sub — session point-to-point
- Không cần BuiltInTools, ExecutionContext — tool execution ở app
- Scale: sticky session (mỗi VWS instance giữ N Gemini Live connections)
- VWS chỉ inject vào NestJS: `JwtService`, `DeploymentService` (cho fetch config)

---

## System Instruction

App tự build system instruction, không để user chọn:

```
[Voice base — baked in app]
Bạn là trợ lý voice. Trả lời ngắn gọn 1-3 câu bằng ngôn ngữ tự nhiên.
Không dùng markdown, code block, URL. Với dữ liệu nhiều hoặc phức tạp,
gọi tool DisplayContent để hiển thị chi tiết lên màn hình và chỉ tóm tắt
điểm chính bằng lời. Hỏi lại khi chưa rõ yêu cầu.

[User info — load từ IAM khi khởi động]
Tên: {user.name}
Tổ chức: {org.name}
Vai trò: {user.roles}

[User persona — optional, user tự nhập]
{persona}
```

---

## Built-in App Tools

### `SendMessageToAgent`

Gửi message tới agent qua CWS, chờ response.

```typescript
{
  name: 'SendMessageToAgent',
  description: 'Gửi yêu cầu tới một AI agent và chờ kết quả',
  parameters: {
    agentId: string,
    message: string
  }
}
```

**Flow chi tiết:**

```
1. App connect CWS với user JWT (nếu chưa có)
2. Emit agent:connect { agentId }
   → CWS gọi findOrCreateForUser(userId, agentId, orgId)
   → Nhận { conversationId }
3. Emit message:send { conversationId, role: 'user', content: message }
   → CWS push vào Redis: chat:task:{agentId}:{conversationId}
4. agt worker BLPOP → xử lý → publish chat:response:{conversationId}
5. CWS emit message:new (role=assistant) về conversation room
6. App nhận message:new → trả tool_result { response: content }
```

App nên giữ **một CWS connection duy nhất** trong suốt voice session (không mở/đóng mỗi lần gọi tool). Mỗi lần gọi `SendMessageToAgent` với `agentId` mới chỉ cần emit `agent:connect` để lấy `conversationId`, không cần reconnect WS.

**Voice rest:** Gemini Live tự suspend khi waiting for `tool_result` — không cần cơ chế thêm. Nếu agent xử lý >30s, app trả intermediate result `{ status: 'pending' }` để tránh session timeout, kết quả thực sẽ đến qua turn mới.

### `DisplayContent`

Gemini gửi nội dung chi tiết lên UI, voice chỉ tóm tắt.

```typescript
{
  name: 'DisplayContent',
  description: 'Hiển thị nội dung chi tiết lên màn hình app',
  parameters: {
    title: string,
    content: string,           // markdown
    type: 'list' | 'markdown' | 'table'
  }
}
```

App render ngay, trả `tool_result { success: true }` tức thì. Gemini tiếp tục với voice summary.

### `SwitchContext`

Load resource vào conversation context, thay đổi behavior focus.

```typescript
{
  name: 'SwitchContext',
  description: 'Chuyển focus sang một tài nguyên cụ thể để thảo luận sâu hơn',
  parameters: {
    type: 'document' | 'project' | 'work' | 'agent' | 'default',
    resourceId?: string
  }
}
```

**Flow:** App fetch resource content từ CBM/AIWM API → trả `tool_result` với content + instruction → Gemini adapt behavior. App đồng thời mở resource viewer trên UI.

---

## Mobile App — Feature Overview

> Chi tiết UX/UI sẽ được thiết kế khi BE hoàn thiện. Phần này mô tả tính năng và flow tổng quan.

### Setup flow

1. User đăng nhập bằng tài khoản IAM (JWT)
2. Chọn deployment `type=voice, protocol=ws`
3. Chọn API tools muốn dùng (chỉ hiện tools `type=api`)
4. Nhập user persona (optional)
5. App sẵn sàng — tap để bắt đầu voice session

### Voice session flow

- Tap để bắt đầu → app kết nối VWS, hiển thị "Đang nghe..."
- Nói tự nhiên — Gemini xử lý realtime
- Kết quả phức tạp → hiển thị card trên màn hình, voice đọc tóm tắt
- Tap để dừng hoặc im lặng đủ lâu → session pause

### Các tính năng chính

| Tính năng | Mô tả |
|-----------|-------|
| Query CBM | Hỏi về project, task, document bằng giọng nói |
| Query AIWM | Hỏi về agent, instruction, node |
| Gửi message cho agent | Delegate task, chờ kết quả và nghe tóm tắt |
| Hiển thị card | Nội dung dài/phức tạp render lên màn hình |
| Switch context | Focus vào document/project cụ thể để thảo luận sâu |
| Hands-free | Toàn bộ tương tác bằng giọng nói, không cần chạm màn hình |

### App tool setup

App build tool definitions khi start session:
1. Fetch schemas của API tools đã chọn từ `GET /tools?ids=...`
2. Convert sang Gemini function declaration format
3. Merge với built-in tool schemas (`SendMessageToAgent`, `DisplayContent`, `SwitchContext`)
4. Gửi full list kèm `start` event đến VWS

---

## Deployment timeline

| Phase | Nội dung |
|-------|---------|
| **Phase 1 — BE** | Model `protocol` field, `buildEndpointInfo()` voice case, `aiwm:vws` mode |
| **Phase 2 — App** | Mobile app (Flutter/React Native), IAM login, voice session, built-in tools |

Phase 2 sẽ được agent FE đảm nhiệm sau khi Phase 1 hoàn thành.
