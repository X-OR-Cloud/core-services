# Agent SLA Monitoring — Implementation Plan

## Mục tiêu

Thêm các API giám sát realtime và đánh giá SLA phục vụ user của agent vào AIWM Service.

**SLA Threshold mặc định:** FRT ≤ 10,000ms (10 giây)
**Unanswered threshold:** 60 giây

---

## Tổng quan API

| # | Method | Route | Module | Mô tả |
|---|--------|-------|--------|-------|
| 1 | GET | `/agents/realtime-status` | agent | Snapshot realtime tất cả (hoặc subset) agents |
| 2 | GET | `/agents/:id/realtime-status` | agent | Snapshot realtime 1 agent + last conversation |
| 3 | GET | `/agents/metrics` | agent | Performance aggregation theo time range |
| 4 | GET | `/conversations/:id/metrics` | conversation | SLA metrics cho 1 conversation cụ thể |
| 5 | GET | `/reports/agent-sla` | reports | Dashboard tổng hợp — alerts + breakdown |

---

## Phân tích module & model dependency

### Vấn đề hiện tại

- `AgentModule` chỉ có model: `Agent`, `Instruction`, `Tool` — **không có** `Conversation`, `Action`
- `ReportsModule` có model: `Node`, `Resource`, `Model`, `Deployment`, `Agent`, `Execution` — **không có** `Conversation`, `Action`
- `ActionService.getActionStatistics()` đã có — tái dụng được

### Giải pháp: Inject service thay vì model trực tiếp

Thay vì import thêm model vào từng module, **inject service** của module khác:

```
AgentModule    → import ConversationModule (lấy ConversationService)
AgentModule    → import ActionModule (lấy ActionService)
ReportsModule  → import ConversationModule (lấy ConversationService)
ReportsModule  → import ActionModule (lấy ActionService)
```

Các module này đã export service sẵn — không cần thêm Mongoose model vào từng nơi.

---

## Chi tiết từng API

### API 1 — `GET /agents/realtime-status`

**Query params:**
```
?agentIds=id1,id2,id3    (optional — bỏ = tất cả agents trong org)
```

**Response shape:**
```json
{
  "generatedAt": "2026-04-21T10:30:00Z",
  "agents": [
    {
      "agentId": "abc123",
      "name": "TranGPT",
      "status": "busy",
      "heartbeatAgeSeconds": 12,
      "isOnline": true,
      "activeConversations": 3,
      "connectionCount": 2,
      "circuitBreaker": {
        "sleeping": false,
        "sleepReason": null,
        "sleepUntil": null
      },
      "currentTask": {
        "taskKey": "task-xyz",
        "attemptCount": 2,
        "lastAttemptAt": "2026-04-21T10:29:45Z"
      }
    }
  ]
}
```

**Logic:**
1. Query `Agent.find({ orgId, ...agentIdFilter })` — lấy danh sách agents
2. Với mỗi agent: count `Conversation.count({ agentId, status: 'active' })`
3. Tính `heartbeatAgeSeconds = (now - lastHeartbeatAt) / 1000`
4. `isOnline = heartbeatAgeSeconds < 60`
5. `currentTask = null` nếu `agent.currentTask` không có

**Nơi implement:** `AgentController` + `AgentService.getRealtimeStatus()`

---

### API 2 — `GET /agents/:id/realtime-status`

**Response shape:** Giống 1 item trong API 1, bổ sung:
```json
{
  "agentId": "...",
  "name": "...",
  "status": "...",
  "heartbeatAgeSeconds": 12,
  "isOnline": true,
  "activeConversations": 3,
  "connectionCount": 2,
  "circuitBreaker": { ... },
  "currentTask": { ... },
  "lastConversation": {
    "conversationId": "conv456",
    "lastMessage": {
      "role": "user",
      "content": "Xin chào",
      "createdAt": "2026-04-21T10:29:30Z"
    },
    "unansweredSince": "2026-04-21T10:29:30Z"
  }
}
```

**Logic `unansweredSince`:**
- Lấy conversation có `lastMessage.createdAt` mới nhất của agent
- Nếu `lastMessage.role === 'user'` → `unansweredSince = lastMessage.createdAt`
- Ngược lại → `unansweredSince = null`

**Nơi implement:** `AgentController` + `AgentService.getRealtimeStatusById()`

---

### API 3 — `GET /agents/metrics`

**Query params:**
```
?agentIds=id1,id2          (optional)
?preset=today|yesterday|7d|30d
?from=2026-04-14T00:00:00Z (override preset)
?to=2026-04-21T23:59:59Z
?granularity=hour|day      (default: day)
```

**Preset → time range mapping:**
| Preset | from | to | Default granularity |
|--------|------|-----|-------------------|
| `today` | 00:00 hôm nay | now | hour |
| `yesterday` | 00:00 hôm qua | 23:59:59 hôm qua | hour |
| `7d` | 00:00 cách 7 ngày | now | day |
| `30d` | 00:00 cách 30 ngày | now | day |

**Response shape:**
```json
{
  "period": {
    "from": "2026-04-14T00:00:00Z",
    "to": "2026-04-21T23:59:59Z",
    "preset": "7d",
    "granularity": "day"
  },
  "agents": [
    {
      "agentId": "abc123",
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
        "totalInputTokens": 580000,
        "totalOutputTokens": 390000
      },
      "timeSeries": [
        {
          "period": "2026-04-14",
          "conversations": 6,
          "avgFrtMs": 3100,
          "slaBreaches": 1,
          "errors": 0
        }
      ]
    }
  ]
}
```

**Logic tính FRT (First Response Time):**
1. Với mỗi conversation trong range: query actions `type='message'`
2. `userFirstAt` = `createdAt` của action đầu tiên có `actor.role='user'`
3. `agentFirstAt` = `createdAt` của action `actor.role='agent'` đầu tiên **sau** `userFirstAt`
4. `FRT = agentFirstAt - userFirstAt` (ms)
5. `slaBreached = FRT > 10000`

**Logic tính avgResponseTime:**
- Với mỗi cặp liên tiếp (user_msg[i] → agent_msg[i+1]): delta = `agent.createdAt - user.createdAt`
- Avg của tất cả deltas trong conversation, rồi avg across conversations

**Logic timeSeries:**
- Group conversations by `createdAt` theo `granularity` (hour/day)
- Mỗi bucket: count conversations, avg FRT, count sla breaches, count errors

**Nơi implement:** `AgentController` + `AgentService.getAgentMetrics()`

---

### API 4 — `GET /conversations/:id/metrics`

**Response shape:**
```json
{
  "conversationId": "conv456",
  "agentId": "abc123",
  "status": "active",
  "createdAt": "2026-04-21T10:00:00Z",
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

**Logic:**
- `durationSeconds`: nếu `status=active` → `now - createdAt`, ngược lại `updatedAt - createdAt`
- `p90ResponseTimeMs`: sort response deltas, lấy phần tử ở vị trí 90th percentile
- `errorCount`: count actions `type='error'`

**Nơi implement:** `ConversationController` + `ConversationService.getConversationMetrics()`

---

### API 5 — `GET /reports/agent-sla`

**Query params:**
```
?agentIds=id1,id2          (optional)
?preset=today|yesterday|7d|30d
?from=...&to=...
```

**Response shape:**
```json
{
  "generatedAt": "2026-04-21T10:30:00Z",
  "period": { "from": "...", "to": "...", "preset": "today" },
  "slaThresholdMs": 10000,
  "unansweredThresholdSeconds": 60,
  "overview": {
    "totalAgents": 3,
    "onlineAgents": 2,
    "totalConversations": 47,
    "activeConversations": 5,
    "overallSlaBreachRate": 6.2,
    "overallAvgFrtMs": 3800,
    "overallP90FrtMs": 8900
  },
  "alerts": [
    {
      "type": "unanswered",
      "severity": "warning",
      "agentId": "abc123",
      "conversationId": "conv789",
      "detail": "User message unanswered for 2 minutes",
      "since": "2026-04-21T10:15:00Z"
    },
    {
      "type": "agent_offline",
      "severity": "error",
      "agentId": "def456",
      "detail": "No heartbeat for 120 seconds",
      "since": "2026-04-21T10:28:00Z"
    }
  ],
  "agentBreakdown": [
    {
      "agentId": "abc123",
      "name": "TranGPT",
      "isOnline": true,
      "totalConversations": 20,
      "activeConversations": 2,
      "slaBreachRate": 5.0,
      "avgFrtMs": 3200,
      "unansweredCount": 1
    }
  ]
}
```

**Alert types:**
| Type | Severity | Điều kiện |
|------|----------|----------|
| `unanswered` | warning | `lastMessage.role='user'` AND `now - lastMessage.createdAt > 60s` |
| `agent_offline` | error | `now - lastHeartbeatAt > 60s` hoặc `status='suspended'` |
| `sla_breach_spike` | warning | `slaBreachRate > 20%` trong period |

**Nơi implement:** `ReportsController` + `ReportsService.getAgentSlaReport()`

---

## Kế hoạch implement (micro-tasks)

### Phase 1A — Module wiring (prerequisites)

- [ ] **T1** `AgentModule`: import `ConversationModule`, `ActionModule` — inject `ConversationService`, `ActionService` vào `AgentService`
- [ ] **T2** `ReportsModule`: import `ConversationModule`, `ActionModule` — inject vào `ReportsService`

### Phase 1B — Shared helper

- [ ] **T3** Tạo helper `SlaMetricsHelper` trong `AgentService` (hoặc util riêng nếu dùng nhiều nơi):
  - `computeFrt(actions)` → `{ ms, slaBreached }`
  - `computeResponseDeltas(actions)` → `number[]` (ms per exchange)
  - `computeP90(values: number[])` → `number`
  - `resolveTimeRange(preset, from, to)` → `{ from: Date, to: Date }`

### Phase 1C — Conversation metrics (API 4)

- [ ] **T4** `ConversationService`: thêm method `getConversationMetrics(id, context)`
  - Query conversation
  - Query actions của conversation
  - Tính FRT, avg/p90 response time, error count
- [ ] **T5** `ConversationController`: thêm endpoint `GET /conversations/:id/metrics`

### Phase 1D — Agent realtime (API 1 & 2)

- [ ] **T6** `AgentService`: thêm method `getRealtimeStatus(agentIds[], context)`
  - Query agents (filter agentIds nếu có)
  - Count active conversations per agent
  - Map sang response shape
- [ ] **T7** `AgentService`: thêm method `getRealtimeStatusById(id, context)`
  - Gọi `getRealtimeStatus([id])`
  - Lấy last conversation của agent
  - Tính `unansweredSince`
- [ ] **T8** `AgentController`: thêm endpoint `GET /agents/realtime-status`
- [ ] **T9** `AgentController`: thêm endpoint `GET /agents/:id/realtime-status`
  - Đặt trước route `GET /agents/:id` để tránh conflict

### Phase 1E — Agent metrics (API 3)

- [ ] **T10** `AgentService`: thêm method `getAgentMetrics(agentIds[], preset, from, to, granularity, context)`
  - Resolve time range từ preset
  - Query conversations trong range per agent
  - Với mỗi conversation: compute FRT, response deltas
  - Aggregate summary + time series
- [ ] **T11** `AgentController`: thêm endpoint `GET /agents/metrics`
  - Parse query params (agentIds comma-split, preset, from/to, granularity)
  - Đặt **trước** `GET /agents/:id` để tránh routing conflict

### Phase 1F — SLA Dashboard (API 5)

- [ ] **T12** `ReportsService`: thêm method `getAgentSlaReport(agentIds[], preset, from, to, context)`
  - Lấy agents (filter nếu có agentIds)
  - Tính online status (heartbeat age)
  - Detect unanswered conversations (query active conversations, check lastMessage)
  - Aggregate metrics per agent (gọi lại logic từ T10 hoặc extract sang helper)
  - Build alerts array
- [ ] **T13** `ReportsController`: thêm endpoint `GET /reports/agent-sla`

### Phase 1G — Verification

- [ ] **T14** TypeScript check: `npx tsc --noEmit -p services/aiwm/tsconfig.app.json`
- [ ] **T15** Build: `nx run aiwm:build`
- [ ] **T16** Smoke test các endpoint bằng curl

---

## Routing order (quan trọng)

NestJS match route theo thứ tự khai báo. Phải đặt static routes **trước** dynamic routes:

```typescript
// AgentController — thứ tự đúng:
GET /agents/realtime-status    ← khai báo trước
GET /agents/metrics            ← khai báo trước
GET /agents/:id                ← khai báo sau
GET /agents/:id/realtime-status
```

---

## Không thay đổi

- Schema của Agent, Conversation, Action — **không thêm field mới**
- Tất cả tính toán on-the-fly từ data hiện có
- SLA threshold hardcode `10000ms`, unanswered threshold hardcode `60s`
- Auth: `JwtAuthGuard` cho tất cả 5 endpoints
