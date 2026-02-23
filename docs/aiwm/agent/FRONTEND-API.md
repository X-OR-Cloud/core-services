# Agent API — Frontend Integration

> Last updated: 2026-02-24
> Base URL: `https://api.x-or.cloud/dev/aiwm`

---

## 1. Agent Entity

Agent là một thực thể AI được quản lý bởi AIWM. Mỗi agent có instruction (chỉ dẫn), tools (công cụ), settings (cấu hình runtime) và secret (xác thực).

### 1.1 Các trường

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `_id` | string | auto | MongoDB ObjectId |
| `name` | string | ✅ | Tên agent |
| `description` | string | ✅ | Mô tả agent |
| `status` | enum | auto | Trạng thái hiện tại (xem mục 1.2) |
| `type` | enum | ❌ | `'managed'` \| `'autonomous'` (default: `'autonomous'`) |
| `framework` | enum | ❌ | `'claude-agent-sdk'` (default: `'claude-agent-sdk'`) |
| `instructionId` | string | ❌ | Ref tới Instruction — chỉ dẫn cho agent |
| `guardrailId` | string | ❌ | Ref tới Guardrail — rào cản an toàn |
| `deploymentId` | string | ❌ | Ref tới Deployment — cấu hình LLM (autonomous agents) |
| `nodeId` | string | ❌* | Ref tới Node — node chạy agent (*bắt buộc cho managed) |
| `role` | enum | ❌ | RBAC role: `'organization.owner'` \| `'organization.editor'` \| `'organization.viewer'` (default: `'organization.viewer'`) |
| `tags` | string[] | ❌ | Tags phân loại (default: `[]`) |
| `allowedToolIds` | string[] | ❌ | Danh sách Tool IDs agent được phép sử dụng (default: `[]`) |
| `settings` | object | ❌ | Cấu hình runtime — flat prefix structure (xem mục 1.3) |
| `lastConnectedAt` | Date | auto | Thời điểm kết nối gần nhất |
| `lastHeartbeatAt` | Date | auto | Thời điểm heartbeat gần nhất |
| `connectionCount` | number | auto | Số lần kết nối (default: `0`) |
| `owner` | object | auto | `{ orgId, userId }` — từ BaseSchema |
| `createdBy` | string | auto | User ID tạo agent |
| `updatedBy` | string | auto | User ID cập nhật cuối |
| `createdAt` | Date | auto | Timestamp tạo |
| `updatedAt` | Date | auto | Timestamp cập nhật |

> Trường `secret` không bao giờ trả về trong response (select: false).

### 1.2 Status — Trạng thái

| Status | Ý nghĩa | Hiển thị gợi ý |
|--------|---------|----------------|
| `inactive` | Chưa kết nối / offline | 🔴 Offline |
| `idle` | Đã kết nối, sẵn sàng | 🟢 Online |
| `busy` | Đang xử lý tác vụ | 🟡 Busy |
| `suspended` | Đã tạm dừng bởi user | ⛔ Suspended |

**Luồng chuyển trạng thái:**
- Tạo mới → `inactive`
- Agent connect → `idle`
- Heartbeat báo busy → `busy`
- Heartbeat báo idle → `idle`
- Agent disconnect → `inactive`
- User suspend → `suspended` (chặn connect và heartbeat)

> Frontend **chỉ nên cho phép** user đặt status `suspended` hoặc `inactive` qua PUT update. Các status `idle` và `busy` do hệ thống tự quản lý.

### 1.3 Type — Loại agent

| Type | Ý nghĩa | Khi nào dùng |
|------|---------|-------------|
| `managed` | Hệ thống deploy tới Node, quản lý lifecycle qua WebSocket | Discord/Telegram bot, background worker chạy trên infrastructure |
| `autonomous` | User tự deploy theo hướng dẫn cài đặt + credentials | Agent tự triển khai trên máy chủ riêng |

- Type **không thể thay đổi** sau khi tạo.
- Cả hai type đều có secret và đều dùng API connect.
- Managed agents **bắt buộc** có `nodeId`.

### 1.4 Settings — Cấu hình runtime

Sử dụng cấu trúc flat với prefix:

| Prefix | Nhóm | Các trường |
|--------|------|------------|
| `claude_` | Claude SDK | `claude_model`, `claude_maxTurns`, `claude_permissionMode`, `claude_resume`, `claude_oauthToken` |
| `discord_` | Discord | `discord_token`, `discord_channelIds`, `discord_botId` |
| `telegram_` | Telegram | `telegram_token`, `telegram_groupIds`, `telegram_botUsername` |
| `auth_` | Auth | `auth_roles` |

---

## 2. API Endpoints

Tất cả endpoints yêu cầu header `Content-Type: application/json`.
Endpoints có auth `User JWT` cần header `Authorization: Bearer <token>`.

### 2.1 Tạo agent

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/agents` |
| **Auth** | User JWT |

**Input (body):**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `name` | string | ✅ | Tên agent |
| `description` | string | ✅ | Mô tả |
| `type` | enum | ❌ | `'managed'` \| `'autonomous'` (default: `'autonomous'`) |
| `framework` | enum | ❌ | `'claude-agent-sdk'` (default) |
| `instructionId` | string | ❌ | ID instruction |
| `guardrailId` | string | ❌ | ID guardrail |
| `nodeId` | string | ❌* | ID node (*bắt buộc nếu type=managed) |
| `tags` | string[] | ❌ | Tags |
| `allowedToolIds` | string[] | ❌ | Tool IDs |
| `settings` | object | ❌ | Cấu hình runtime |

> Không cần truyền `status` — hệ thống tự đặt `inactive`.
> Không cần truyền `secret` — hệ thống tự sinh.

**Output:** Agent object (full entity).

**Lưu ý:**
- Nếu `type=managed`, hệ thống validate node phải online và có heartbeat trong 10 phút gần nhất.
- Nếu `type=managed`, hệ thống gửi lệnh `agent.start` tới node qua WebSocket.

---

### 2.2 Danh sách agents

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/agents` |
| **Auth** | User JWT |

**Input (query params):**

| Param | Kiểu | Mô tả |
|-------|------|-------|
| `page` | number | Trang (default: 1) |
| `limit` | number | Số items/trang (default: 10) |
| `sort` | string | Sắp xếp (vd: `-createdAt`) |
| `filter[status]` | string | Lọc theo status |
| `filter[type]` | string | Lọc theo type |
| `filter[framework]` | string | Lọc theo framework |
| `filter[name]` | string | Tìm theo tên (regex, case-insensitive) |
| `filter[description]` | string | Tìm theo mô tả (regex, case-insensitive) |

**Output:**

```
{
  data: Agent[],
  pagination: { page, limit, total, totalPages },
  statistics: {
    total: number,
    byStatus: { inactive: N, idle: N, busy: N, suspended: N },
    byType: { managed: N, autonomous: N },
    byFramework: { 'claude-agent-sdk': N }
  }
}
```

---

### 2.3 Chi tiết agent

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/agents/:id` |
| **Auth** | User JWT |

**Query params:**

| Param | Mô tả |
|-------|-------|
| `populate=instruction` | Populate đầy đủ instruction object thay vì chỉ ID |

**Output:** Agent object.

---

### 2.4 Cập nhật agent

| | |
|---|---|
| **Method** | `PUT` |
| **Path** | `/agents/:id` |
| **Auth** | User JWT |

**Input (body):** Partial — chỉ gửi các trường cần cập nhật.

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `name` | string | Tên mới |
| `description` | string | Mô tả mới |
| `status` | enum | `'inactive'` \| `'suspended'` (user chỉ nên dùng 2 giá trị này) |
| `framework` | enum | Framework mới |
| `instructionId` | string | Instruction mới |
| `guardrailId` | string | Guardrail mới |
| `deploymentId` | string | Deployment mới (autonomous) |
| `nodeId` | string | Node mới (managed) |
| `role` | enum | RBAC role mới |
| `tags` | string[] | Tags mới |
| `allowedToolIds` | string[] | Tool IDs mới |
| `settings` | object | Settings mới |

**Output:** Agent object (đã cập nhật).

**Lưu ý:**
- **Không thể thay đổi `type`** — trả về 400 nếu cố thay đổi.
- Nếu managed agent, hệ thống gửi `agent.update` tới node qua WebSocket.

---

### 2.5 Xóa agent

| | |
|---|---|
| **Method** | `DELETE` |
| **Path** | `/agents/:id` |
| **Auth** | User JWT |

**Output:** `{ message: "Agent deleted successfully" }`

Soft delete — agent vẫn tồn tại trong DB với `isDeleted: true`.
Nếu managed agent, hệ thống gửi `agent.delete` tới node.

---

### 2.6 Lấy cấu hình agent

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/agents/:id/config` |
| **Auth** | User JWT |

Trả về cấu hình đầy đủ cho agent: instruction, tools, MCP servers, settings, deployment info.

**Output:**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `accessToken` | string | `""` (empty — dùng user JWT) |
| `expiresIn` | number | `0` |
| `refreshToken` | null | Không hỗ trợ |
| `refreshExpiresIn` | number | `0` |
| `tokenType` | string | `"bearer"` |
| `mcpServers` | object | MCP server config: `{ Builtin: { type, url, headers } }` |
| `instruction` | object | `{ id, systemPrompt, guidelines[] }` |
| `tools` | Tool[] | Danh sách tools được phép |
| `settings` | object | Cấu hình runtime |
| `deployment` | object? | Thông tin LLM deployment (nếu có `deploymentId`) |

`deployment` object (khi có):

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `id` | string | Deployment ID |
| `provider` | string | Provider (vd: `"anthropic"`) |
| `model` | string | Model identifier |
| `baseAPIEndpoint` | string | Proxy endpoint |
| `apiEndpoint` | string | Provider endpoint đầy đủ |

---

### 2.7 Agent connect (xác thực)

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/agents/:id/connect` |
| **Auth** | Không cần JWT — dùng secret |

**Input (body):**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `secret` | string | ✅ | Secret của agent |

**Output:** Giống cấu hình ở mục 2.6, nhưng có `accessToken` (JWT 24h).

**Lưu ý:**
- Cả managed và autonomous agents đều dùng endpoint này.
- Sau connect thành công, status agent chuyển sang `idle`.
- Trả 401 nếu agent bị `suspended`.

---

### 2.8 Agent heartbeat

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/agents/:id/heartbeat` |
| **Auth** | Agent JWT hoặc User JWT |

**Input (body):**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `status` | enum | ✅ | `'idle'` \| `'busy'` |
| `metrics` | object | ❌ | Metrics tùy chọn (cpu, memory, ...) |

**Output:** `{ success: true }`

**Lưu ý:**
- Cập nhật `lastHeartbeatAt` và `status` của agent.
- Trả 400 nếu agent bị `suspended`.

---

### 2.9 Agent disconnect

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/agents/:id/disconnect` |
| **Auth** | Agent JWT hoặc User JWT |

**Input (body):**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `reason` | string | ❌ | Lý do ngắt kết nối |

**Output:** `{ success: true }`

Sau disconnect, status agent chuyển về `inactive`.

---

### 2.10 Regenerate credentials

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/agents/:id/credentials/regenerate` |
| **Auth** | User JWT |

**Output:**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `agentId` | string | Agent ID |
| `secret` | string | Secret mới (plaintext — chỉ hiện 1 lần) |
| `envConfig` | string | Nội dung file `.env` đã format sẵn |
| `installScript` | string | Script cài đặt bash |

**Lưu ý:**
- Hoạt động cho cả managed và autonomous agents.
- Secret cũ bị vô hiệu ngay lập tức.
- Nếu managed agent, hệ thống gửi `agent.update` tới node với secret mới.
- Frontend nên hiển thị secret cho user copy và cảnh báo **chỉ hiện 1 lần**.

---

## 3. Error Responses

Tất cả error trả về dạng:

```
{
  statusCode: number,
  message: string,
  error: string
}
```

| Status | Trường hợp |
|--------|-----------|
| 400 | Validation lỗi, cố thay đổi type, node không online, agent bị suspended (heartbeat) |
| 401 | JWT không hợp lệ, secret sai, agent bị suspended (connect) |
| 404 | Agent/Node không tồn tại |

---

## 4. Ghi chú cho Frontend

1. **Status hiển thị**: Chỉ hiển thị 4 trạng thái `inactive/idle/busy/suspended`. Không cần xử lý trạng thái `active` (đã loại bỏ).

2. **Form tạo agent**: Không cần field `status` — hệ thống tự đặt `inactive`. Field `type` nên là radio button (managed/autonomous), mặc định autonomous.

3. **Type immutable**: Sau khi tạo, field `type` phải disable trên form edit. Hiển thị rõ ràng cho user biết không thể thay đổi.

4. **Suspend/Resume**: User suspend agent bằng PUT status=`suspended`. Resume bằng PUT status=`inactive` (agent cần reconnect để trở lại `idle`).

5. **Credentials**: Sau khi tạo hoặc regenerate, hiển thị secret 1 lần duy nhất với nút copy. Cảnh báo user lưu lại.

6. **Statistics**: Response từ GET `/agents` có sẵn `statistics` — dùng để hiển thị dashboard/filter counts mà không cần gọi API riêng.

7. **Populate instruction**: Dùng `?populate=instruction` khi cần hiển thị chi tiết instruction trên trang detail agent, tránh dùng ở list page.
