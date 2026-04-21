# Agent SLA Monitoring — API Specification

Tài liệu này mô tả các API giám sát realtime và đánh giá SLA phục vụ user của agent trong AIWM Service.

**Base URL:** `https://api.x-or.cloud/dev/aiwm`  
**Auth:** Tất cả endpoints yêu cầu `Authorization: Bearer <JWT>` (user token từ IAM service)

---

## Khái niệm & Chỉ số

| Thuật ngữ | Ý nghĩa |
|-----------|---------|
| **FRT** (First Response Time) | Thời gian từ lúc user gửi tin nhắn đầu tiên đến lúc agent reply lần đầu (ms) |
| **SLA Breach** | FRT vượt ngưỡng 10,000ms (10 giây) |
| **Avg Response Time** | Trung bình thời gian agent reply cho từng tin nhắn user (ms) |
| **P90 Response Time** | 90% các lượt reply của agent nhanh hơn con số này (ms) |
| **Unanswered** | Conversation có tin nhắn cuối là của user và đã quá 60 giây chưa được agent reply |
| **Online** | Agent có heartbeat trong vòng 60 giây gần nhất |
| **Resolution Rate** | % conversations được đóng (status = `closed`) so với tổng |
| **Error Rate** | % conversations có ít nhất 1 action lỗi (type = `error`) |

---

## Bảng tóm tắt endpoints

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/agents/realtime-status` | Snapshot realtime tất cả agents |
| GET | `/agents/:id/realtime-status` | Snapshot realtime 1 agent + last conversation |
| GET | `/agents/metrics` | Thống kê SLA theo khoảng thời gian |
| GET | `/conversations/:id/metrics` | SLA metrics cho 1 conversation cụ thể |
| GET | `/reports/agent-sla` | Dashboard tổng hợp — alerts + breakdown |

---

## 1. GET `/agents/realtime-status`

**Mục đích:** Lấy snapshot trạng thái hoạt động realtime của tất cả (hoặc một nhóm) agents. Dùng cho dashboard overview, polling định kỳ để theo dõi agent có online không, đang xử lý bao nhiêu conversation.

### Query Parameters

| Param | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `agentIds` | string | Không | Danh sách agentId cách nhau bằng dấu phẩy. Bỏ qua = trả về tất cả agents trong org |

**Ví dụ:** `?agentIds=6851a2b3c4d5e6f7a8b9c0d1,6851a2b3c4d5e6f7a8b9c0d2`

### Sample Response `200 OK`

```json
{
  "generatedAt": "2026-04-21T10:30:00.000Z",
  "agents": [
    {
      "agentId": "6851a2b3c4d5e6f7a8b9c0d1",
      "name": "TranGPT",
      "status": "busy",
      "heartbeatAgeSeconds": 8,
      "isOnline": true,
      "activeConversations": 3,
      "connectionCount": 2,
      "circuitBreaker": {
        "sleeping": false,
        "sleepReason": null,
        "sleepUntil": null
      },
      "currentTask": {
        "taskKey": "chat-msg-abc123",
        "attemptCount": 1,
        "lastAttemptAt": "2026-04-21T10:29:55.000Z"
      }
    },
    {
      "agentId": "6851a2b3c4d5e6f7a8b9c0d2",
      "name": "SupportBot",
      "status": "idle",
      "heartbeatAgeSeconds": 12,
      "isOnline": true,
      "activeConversations": 0,
      "connectionCount": 1,
      "circuitBreaker": {
        "sleeping": false,
        "sleepReason": null,
        "sleepUntil": null
      },
      "currentTask": null
    },
    {
      "agentId": "6851a2b3c4d5e6f7a8b9c0d3",
      "name": "OldAgent",
      "status": "sleep",
      "heartbeatAgeSeconds": 320,
      "isOnline": false,
      "activeConversations": 0,
      "connectionCount": 0,
      "circuitBreaker": {
        "sleeping": true,
        "sleepReason": "Too many consecutive failures",
        "sleepUntil": "2026-04-21T11:00:00.000Z"
      },
      "currentTask": null
    }
  ]
}
```

### Giải thích fields

| Field | Mô tả |
|-------|-------|
| `generatedAt` | Thời điểm tạo snapshot (ISO 8601) |
| `status` | Trạng thái agent: `inactive` / `idle` / `busy` / `suspended` / `sleep` |
| `heartbeatAgeSeconds` | Số giây từ lần heartbeat cuối đến hiện tại. `null` nếu agent chưa bao giờ gửi heartbeat |
| `isOnline` | `true` nếu `heartbeatAgeSeconds < 60` |
| `activeConversations` | Số conversations đang `status=active` của agent này |
| `connectionCount` | Số WebSocket connections hiện tại |
| `circuitBreaker.sleeping` | Agent đang trong trạng thái sleep (circuit breaker kích hoạt) |
| `circuitBreaker.sleepUntil` | Thời điểm agent tự thức dậy. `null` = sleep vô thời hạn |
| `currentTask` | Task đang bị retry. `null` = không có task lỗi nào |

---

## 2. GET `/agents/:id/realtime-status`

**Mục đích:** Giống API 1 nhưng cho một agent cụ thể, bổ sung thêm thông tin về conversation gần nhất — đặc biệt hữu ích để phát hiện user đang chờ reply.

### Path Parameters

| Param | Kiểu | Mô tả |
|-------|------|-------|
| `id` | string | Agent ObjectId hoặc agent code (vd: `trangpt-bold`) |

### Sample Response `200 OK`

```json
{
  "agentId": "6851a2b3c4d5e6f7a8b9c0d1",
  "name": "TranGPT",
  "status": "busy",
  "heartbeatAgeSeconds": 8,
  "isOnline": true,
  "activeConversations": 3,
  "connectionCount": 2,
  "circuitBreaker": {
    "sleeping": false,
    "sleepReason": null,
    "sleepUntil": null
  },
  "currentTask": null,
  "lastConversation": {
    "conversationId": "6851a2b3c4d5e6f7a8b9c0e1",
    "lastMessage": {
      "role": "user",
      "content": "Cho tôi biết số dư tài khoản",
      "createdAt": "2026-04-21T10:29:30.000Z"
    },
    "unansweredSince": "2026-04-21T10:29:30.000Z"
  }
}
```

**Khi agent đã reply (không có tin chờ):**

```json
{
  "agentId": "6851a2b3c4d5e6f7a8b9c0d1",
  "name": "TranGPT",
  "status": "idle",
  "heartbeatAgeSeconds": 15,
  "isOnline": true,
  "activeConversations": 1,
  "connectionCount": 1,
  "circuitBreaker": {
    "sleeping": false,
    "sleepReason": null,
    "sleepUntil": null
  },
  "currentTask": null,
  "lastConversation": {
    "conversationId": "6851a2b3c4d5e6f7a8b9c0e1",
    "lastMessage": {
      "role": "agent",
      "content": "Số dư tài khoản của bạn là 5,200,000 VND.",
      "createdAt": "2026-04-21T10:29:38.000Z"
    },
    "unansweredSince": null
  }
}
```

### Giải thích fields bổ sung

| Field | Mô tả |
|-------|-------|
| `lastConversation` | Conversation được cập nhật gần nhất của agent. `null` nếu agent chưa có conversation nào |
| `lastConversation.lastMessage.role` | `user` hoặc `agent` — cho biết ai là người nhắn cuối |
| `lastConversation.unansweredSince` | ISO timestamp nếu tin cuối là của user (= đang chờ reply). `null` nếu agent đã reply |

### Error Responses

| HTTP | Trường hợp |
|------|-----------|
| `404 Not Found` | Agent không tồn tại hoặc không thuộc org |
| `401 Unauthorized` | Token không hợp lệ hoặc hết hạn |

---

## 3. GET `/agents/metrics`

**Mục đích:** Thống kê hiệu suất SLA của agents theo khoảng thời gian — dùng cho dashboard báo cáo tuần/tháng, so sánh các agents, phát hiện trend tăng/giảm chất lượng phục vụ.

### Query Parameters

| Param | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `agentIds` | string | Không | Agent IDs cách nhau bằng dấu phẩy. Bỏ qua = tất cả agents |
| `preset` | string | Không | `today` / `yesterday` / `7d` / `30d`. Mặc định: `today` |
| `from` | string | Không | ISO 8601. Khi truyền `from` + `to` sẽ override `preset` |
| `to` | string | Không | ISO 8601 |
| `granularity` | string | Không | `hour` / `day`. Mặc định: `hour` cho today/yesterday, `day` cho 7d/30d |

**Preset → Time range:**

| Preset | From | To | Granularity mặc định |
|--------|------|-----|---------------------|
| `today` | 00:00 hôm nay | Hiện tại | `hour` |
| `yesterday` | 00:00 hôm qua | 23:59:59 hôm qua | `hour` |
| `7d` | 00:00 cách 6 ngày | Hiện tại | `day` |
| `30d` | 00:00 cách 29 ngày | Hiện tại | `day` |

### Sample Response `200 OK`

```json
{
  "period": {
    "from": "2026-04-15T00:00:00.000Z",
    "to": "2026-04-21T10:30:00.000Z",
    "preset": "7d",
    "granularity": "day"
  },
  "agents": [
    {
      "agentId": "6851a2b3c4d5e6f7a8b9c0d1",
      "name": "TranGPT",
      "summary": {
        "totalConversations": 47,
        "resolvedConversations": 38,
        "resolutionRate": 80.9,
        "avgFirstResponseTimeMs": 3200,
        "p90FirstResponseTimeMs": 8100,
        "slaBreachCount": 4,
        "slaBreachRate": 8.5,
        "avgResponseTimeMs": 4100,
        "avgConversationDurationSeconds": 720,
        "errorRate": 2.1,
        "totalInputTokens": 0,
        "totalOutputTokens": 0
      },
      "timeSeries": [
        {
          "period": "2026-04-15",
          "conversations": 5,
          "avgFrtMs": 2900,
          "slaBreaches": 0,
          "errors": 0
        },
        {
          "period": "2026-04-16",
          "conversations": 8,
          "avgFrtMs": 3400,
          "slaBreaches": 1,
          "errors": 1
        },
        {
          "period": "2026-04-17",
          "conversations": 6,
          "avgFrtMs": 3100,
          "slaBreaches": 0,
          "errors": 0
        },
        {
          "period": "2026-04-18",
          "conversations": 7,
          "avgFrtMs": 5200,
          "slaBreaches": 2,
          "errors": 0
        },
        {
          "period": "2026-04-19",
          "conversations": 9,
          "avgFrtMs": 2800,
          "slaBreaches": 0,
          "errors": 0
        },
        {
          "period": "2026-04-20",
          "conversations": 8,
          "avgFrtMs": 3600,
          "slaBreaches": 1,
          "errors": 0
        },
        {
          "period": "2026-04-21",
          "conversations": 4,
          "avgFrtMs": 3000,
          "slaBreaches": 0,
          "errors": 0
        }
      ]
    }
  ]
}
```

**Ví dụ granularity=hour (preset=today):**

```json
{
  "period": {
    "from": "2026-04-21T00:00:00.000Z",
    "to": "2026-04-21T10:30:00.000Z",
    "preset": "today",
    "granularity": "hour"
  },
  "agents": [
    {
      "agentId": "6851a2b3c4d5e6f7a8b9c0d1",
      "name": "TranGPT",
      "summary": {
        "totalConversations": 12,
        "resolvedConversations": 8,
        "resolutionRate": 66.7,
        "avgFirstResponseTimeMs": 2800,
        "p90FirstResponseTimeMs": 7400,
        "slaBreachCount": 1,
        "slaBreachRate": 8.3,
        "avgResponseTimeMs": 3200,
        "avgConversationDurationSeconds": 480,
        "errorRate": 0.0,
        "totalInputTokens": 0,
        "totalOutputTokens": 0
      },
      "timeSeries": [
        {
          "period": "2026-04-21T08",
          "conversations": 3,
          "avgFrtMs": 2600,
          "slaBreaches": 0,
          "errors": 0
        },
        {
          "period": "2026-04-21T09",
          "conversations": 5,
          "avgFrtMs": 3100,
          "slaBreaches": 1,
          "errors": 0
        },
        {
          "period": "2026-04-21T10",
          "conversations": 4,
          "avgFrtMs": 2700,
          "slaBreaches": 0,
          "errors": 0
        }
      ]
    }
  ]
}
```

### Giải thích fields

| Field | Mô tả |
|-------|-------|
| `summary.totalConversations` | Tổng số conversations được tạo trong period |
| `summary.resolvedConversations` | Số conversations có `status=closed` |
| `summary.resolutionRate` | % đã đóng (số thập phân, 1 chữ số) |
| `summary.avgFirstResponseTimeMs` | FRT trung bình (ms). `null` nếu không có dữ liệu |
| `summary.p90FirstResponseTimeMs` | FRT ở percentile 90 (ms). `null` nếu không đủ dữ liệu |
| `summary.slaBreachCount` | Số conversations có FRT > 10,000ms |
| `summary.slaBreachRate` | % vi phạm SLA |
| `summary.avgResponseTimeMs` | Trung bình thời gian agent reply cho mỗi tin nhắn user (ms) |
| `summary.avgConversationDurationSeconds` | Thời gian trung bình mỗi conversation (giây) |
| `summary.errorRate` | % conversations có ít nhất 1 action lỗi |
| `timeSeries[].period` | `YYYY-MM-DD` (granularity=day) hoặc `YYYY-MM-DDTHH` (granularity=hour) |
| `timeSeries[].avgFrtMs` | FRT trung bình trong bucket. `null` nếu không có conversation nào có FRT |

---

## 4. GET `/conversations/:id/metrics`

**Mục đích:** Xem chi tiết SLA của một conversation cụ thể — dùng để điều tra nguyên nhân vi phạm SLA, kiểm tra chất lượng từng cuộc hội thoại.

### Path Parameters

| Param | Kiểu | Mô tả |
|-------|------|-------|
| `id` | string | Conversation ObjectId |

### Sample Response `200 OK`

```json
{
  "conversationId": "6851a2b3c4d5e6f7a8b9c0e1",
  "agentId": "6851a2b3c4d5e6f7a8b9c0d1",
  "status": "active",
  "createdAt": "2026-04-21T10:00:00.000Z",
  "durationSeconds": 1800,
  "totalMessages": 24,
  "userMessages": 12,
  "agentMessages": 11,
  "systemMessages": 1,
  "firstResponseTime": {
    "ms": 4200,
    "slaBreached": false
  },
  "avgResponseTimeMs": 3800,
  "p90ResponseTimeMs": 7200,
  "errorCount": 0,
  "tokenUsage": {
    "inputTokens": 12500,
    "outputTokens": 8300
  }
}
```

**Khi FRT vi phạm SLA:**

```json
{
  "conversationId": "6851a2b3c4d5e6f7a8b9c0e2",
  "agentId": "6851a2b3c4d5e6f7a8b9c0d1",
  "status": "closed",
  "createdAt": "2026-04-21T09:00:00.000Z",
  "durationSeconds": 540,
  "totalMessages": 8,
  "userMessages": 4,
  "agentMessages": 4,
  "systemMessages": 0,
  "firstResponseTime": {
    "ms": 14500,
    "slaBreached": true
  },
  "avgResponseTimeMs": 9200,
  "p90ResponseTimeMs": 13800,
  "errorCount": 1,
  "tokenUsage": {
    "inputTokens": 3200,
    "outputTokens": 1800
  }
}
```

**Khi chưa có reply từ agent (FRT = null):**

```json
{
  "conversationId": "6851a2b3c4d5e6f7a8b9c0e3",
  "agentId": "6851a2b3c4d5e6f7a8b9c0d1",
  "status": "active",
  "createdAt": "2026-04-21T10:28:00.000Z",
  "durationSeconds": 120,
  "totalMessages": 1,
  "userMessages": 1,
  "agentMessages": 0,
  "systemMessages": 0,
  "firstResponseTime": {
    "ms": null,
    "slaBreached": false
  },
  "avgResponseTimeMs": null,
  "p90ResponseTimeMs": null,
  "errorCount": 0,
  "tokenUsage": {
    "inputTokens": 0,
    "outputTokens": 0
  }
}
```

### Giải thích fields

| Field | Mô tả |
|-------|-------|
| `status` | `active` / `archived` / `closed` |
| `durationSeconds` | Nếu `status=active`: `now - createdAt`. Nếu đã đóng: `updatedAt - createdAt` |
| `totalMessages` | Tổng số messages (lấy từ conversation record) |
| `userMessages` | Số actions có `actor.role=user` |
| `agentMessages` | Số actions có `actor.role=agent` |
| `systemMessages` | Số actions có `actor.role=system` |
| `firstResponseTime.ms` | FRT tính bằng ms. `null` nếu agent chưa reply lần nào |
| `firstResponseTime.slaBreached` | `true` nếu FRT > 10,000ms |
| `avgResponseTimeMs` | Trung bình thời gian agent reply. `null` nếu không có cặp user→agent nào |
| `p90ResponseTimeMs` | P90 response time. `null` nếu không đủ dữ liệu |
| `errorCount` | Số actions có `type=error` trong conversation |
| `tokenUsage.inputTokens` | Tổng token đầu vào (từ action usage) |
| `tokenUsage.outputTokens` | Tổng token đầu ra (từ action usage) |

### Error Responses

| HTTP | Trường hợp |
|------|-----------|
| `404 Not Found` | Conversation không tồn tại |
| `403 Forbidden` | Conversation không thuộc org của user |
| `401 Unauthorized` | Token không hợp lệ |

---

## 5. GET `/reports/agent-sla`

**Mục đích:** Dashboard tổng hợp SLA — view duy nhất để Tony (hoặc ops team) nắm được toàn bộ tình trạng dịch vụ: alert nào đang cần xử lý, từng agent đang hoạt động tốt không.

### Query Parameters

| Param | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `agentIds` | string | Không | Agent IDs cách nhau bằng dấy phẩy. Bỏ qua = tất cả |
| `preset` | string | Không | `today` / `yesterday` / `7d` / `30d`. Mặc định: `today` |
| `from` | string | Không | ISO 8601. Override preset khi dùng kết hợp với `to` |
| `to` | string | Không | ISO 8601 |

### Sample Response `200 OK` — Có alerts

```json
{
  "generatedAt": "2026-04-21T10:30:00.000Z",
  "period": {
    "from": "2026-04-21T00:00:00.000Z",
    "to": "2026-04-21T10:30:00.000Z",
    "preset": "today"
  },
  "slaThresholdMs": 10000,
  "unansweredThresholdSeconds": 60,
  "overview": {
    "totalAgents": 3,
    "onlineAgents": 2,
    "totalConversations": 47,
    "activeConversations": 5,
    "overallSlaBreachRate": 6.2,
    "overallAvgFrtMs": 3800
  },
  "alerts": [
    {
      "type": "unanswered",
      "severity": "warning",
      "agentId": "6851a2b3c4d5e6f7a8b9c0d1",
      "conversationId": "6851a2b3c4d5e6f7a8b9c0e1",
      "detail": "User message unanswered for 125 seconds",
      "since": "2026-04-21T10:27:55.000Z"
    },
    {
      "type": "unanswered",
      "severity": "warning",
      "agentId": "6851a2b3c4d5e6f7a8b9c0d1",
      "conversationId": "6851a2b3c4d5e6f7a8b9c0e2",
      "detail": "User message unanswered for 98 seconds",
      "since": "2026-04-21T10:28:22.000Z"
    },
    {
      "type": "agent_offline",
      "severity": "error",
      "agentId": "6851a2b3c4d5e6f7a8b9c0d3",
      "detail": "No heartbeat for 320 seconds",
      "since": "2026-04-21T10:24:40.000Z"
    }
  ],
  "agentBreakdown": [
    {
      "agentId": "6851a2b3c4d5e6f7a8b9c0d1",
      "name": "TranGPT",
      "isOnline": true,
      "totalConversations": 20,
      "activeConversations": 3,
      "slaBreachRate": 5.0,
      "avgFrtMs": 3200,
      "unansweredCount": 2
    },
    {
      "agentId": "6851a2b3c4d5e6f7a8b9c0d2",
      "name": "SupportBot",
      "isOnline": true,
      "totalConversations": 27,
      "activeConversations": 2,
      "slaBreachRate": 7.4,
      "avgFrtMs": 4300,
      "unansweredCount": 0
    },
    {
      "agentId": "6851a2b3c4d5e6f7a8b9c0d3",
      "name": "OldAgent",
      "isOnline": false,
      "totalConversations": 0,
      "activeConversations": 0,
      "slaBreachRate": 0,
      "avgFrtMs": null,
      "unansweredCount": 0
    }
  ]
}
```

**Sample Response — Mọi thứ bình thường (không có alert):**

```json
{
  "generatedAt": "2026-04-21T10:30:00.000Z",
  "period": {
    "from": "2026-04-21T00:00:00.000Z",
    "to": "2026-04-21T10:30:00.000Z",
    "preset": "today"
  },
  "slaThresholdMs": 10000,
  "unansweredThresholdSeconds": 60,
  "overview": {
    "totalAgents": 2,
    "onlineAgents": 2,
    "totalConversations": 18,
    "activeConversations": 2,
    "overallSlaBreachRate": 0.0,
    "overallAvgFrtMs": 2900
  },
  "alerts": [],
  "agentBreakdown": [
    {
      "agentId": "6851a2b3c4d5e6f7a8b9c0d1",
      "name": "TranGPT",
      "isOnline": true,
      "totalConversations": 10,
      "activeConversations": 1,
      "slaBreachRate": 0.0,
      "avgFrtMs": 2700,
      "unansweredCount": 0
    },
    {
      "agentId": "6851a2b3c4d5e6f7a8b9c0d2",
      "name": "SupportBot",
      "isOnline": true,
      "totalConversations": 8,
      "activeConversations": 1,
      "slaBreachRate": 0.0,
      "avgFrtMs": 3100,
      "unansweredCount": 0
    }
  ]
}
```

### Giải thích fields

| Field | Mô tả |
|-------|-------|
| `slaThresholdMs` | Ngưỡng FRT SLA hiện tại (ms) — hardcode 10,000 |
| `unansweredThresholdSeconds` | Ngưỡng coi là "chưa trả lời" (giây) — hardcode 60 |
| `overview.totalAgents` | Tổng số agents trong org (hoặc subset nếu lọc agentIds) |
| `overview.onlineAgents` | Số agents có heartbeat < 60 giây |
| `overview.totalConversations` | Tổng conversations được tạo trong period |
| `overview.activeConversations` | Conversations đang `status=active` (mọi thời điểm, không giới hạn period) |
| `overview.overallSlaBreachRate` | % SLA breach tổng hợp toàn bộ agents |
| `overview.overallAvgFrtMs` | FRT trung bình của tất cả conversations trong period |
| `alerts` | Mảng cảnh báo cần xử lý. Rỗng = mọi thứ bình thường |
| `alerts[].type` | `unanswered` — user đang chờ reply; `agent_offline` — agent mất kết nối |
| `alerts[].severity` | `warning` (cần theo dõi) / `error` (cần xử lý ngay) |
| `alerts[].conversationId` | Có trong alert type `unanswered`. Không có trong `agent_offline` |
| `alerts[].since` | Thời điểm bắt đầu tình trạng (ISO 8601) |
| `agentBreakdown[].unansweredCount` | Số conversations đang có tin nhắn user chưa được reply > 60 giây |
| `agentBreakdown[].avgFrtMs` | FRT trung bình trong period. `null` nếu không có conversation nào |

### Error Responses

| HTTP | Trường hợp |
|------|-----------|
| `401 Unauthorized` | Token không hợp lệ hoặc hết hạn |

---

## Ghi chú chung

### Tính toán FRT

FRT chỉ được tính khi trong conversation tồn tại **ít nhất 1 tin user** và **ít nhất 1 tin agent reply sau tin user đó**. Nếu agent chưa reply, `firstResponseTime.ms = null` và `slaBreached = false`.

### Giá trị null

Các field thống kê (`avgFrtMs`, `p90FirstResponseTimeMs`, `avgResponseTimeMs`, v.v.) trả về `null` (không phải `0`) khi không đủ dữ liệu để tính. FE cần xử lý `null` riêng thay vì treat như 0.

### `activeConversations` trong `/reports/agent-sla`

Field `overview.activeConversations` và `agentBreakdown[].activeConversations` đếm **tất cả conversations đang active tại thời điểm gọi API**, không giới hạn trong `period`. Điều này cho phép FE hiển thị tải hiện tại của agent dù đang xem báo cáo kỳ cũ.

### Agent status enum

| Giá trị | Ý nghĩa |
|---------|---------|
| `inactive` | Agent chưa kết nối lần nào |
| `idle` | Đang kết nối, không xử lý gì |
| `busy` | Đang xử lý tin nhắn |
| `suspended` | Bị tắt thủ công (ops action) |
| `sleep` | Circuit breaker kích hoạt do lỗi liên tiếp |

### Polling recommendation

Để dashboard realtime, FE nên polling `/agents/realtime-status` mỗi **15–30 giây**. Không nên poll các endpoint metrics (API 3, 5) quá thường xuyên vì chúng chạy aggregation query nặng hơn.
