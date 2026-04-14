# Agent Task Retry Circuit Breaker (Backend)

## Vấn đề

Khi heartbeat `status=idle`, backend trả về `systemTask` + `systemMessage`. Nếu agent không thể hoàn tất task (vd. MCP tool lỗi, thiếu quyền, logic bế tắc), agent sẽ idle lại → heartbeat tiếp → backend trả **cùng task** → loop vô hạn đốt token.

Phía client đã có circuit break riêng, nhưng backend vẫn cần chặn ở tầng cấp phát task.

Schema đã có ý định dùng `agent_taskRetryLimit` / `agent_taskSleepMinutes` trong `settings` ([agent.schema.ts:130-131](../../../services/aiwm/src/modules/agent/agent.schema.ts#L130-L131)) nhưng logic chưa được triển khai trong `AgentService.heartbeat`.

## Giải pháp: Server-side task dedup counter

### 1. Schema changes — `agent.schema.ts`

Thêm field `currentTask` vào `Agent`:

```ts
@Prop({
  type: {
    taskKey: { type: String, required: true },     // vd "work:<id>", "reminders:<hash>"
    firstSeenAt: { type: Date, required: true },
    lastAttemptAt: { type: Date, required: true },
    attemptCount: { type: Number, required: true, default: 1 },
  },
  default: null,
})
currentTask?: {
  taskKey: string;
  firstSeenAt: Date;
  lastAttemptAt: Date;
  attemptCount: number;
} | null;
```

Cập nhật mặc định cho setting sleep:
- `agent_taskRetryLimit`: **3** (giữ nguyên)
- `agent_taskSleepMinutes`: **240** (4 tiếng — 1 buổi làm việc). Update comment tại [agent.schema.ts:131](../../../services/aiwm/src/modules/agent/agent.schema.ts#L131).

### 2. Service logic — `agent.service.ts#heartbeat`

Sau khi resolve được task (work hoặc reminders) trong [agent.service.ts:1228-1276](../../../services/aiwm/src/modules/agent/agent.service.ts#L1228-L1276), **trước khi trả response**:

```
taskKey = `${systemTask.type}:${systemTask.id ?? hashReminderIds}`
retryLimit  = settings.agent_taskRetryLimit  ?? 3
sleepMins   = settings.agent_taskSleepMinutes ?? 240

if (agent.currentTask?.taskKey === taskKey):
  attemptCount = agent.currentTask.attemptCount + 1
  if (attemptCount > retryLimit):
    → auto-sleep:
        sleepUntil  = now + sleepMins*60_000
        sleepReason = `[AUTO] Task ${taskKey} failed ${attemptCount-1} attempts`
        status      = 'sleep'
      clear currentTask
      push agent.logs (level=error) — tận dụng field `logs` sẵn có
      return { success: true }   // KHÔNG gửi lại task
  else:
    update currentTask.attemptCount, lastAttemptAt
else:
  set currentTask = { taskKey, firstSeenAt: now, lastAttemptAt: now, attemptCount: 1 }

return { ...existing response with task }
```

**Reset counter khi agent xong task:** khi client gọi các MCP tool đánh dấu hoàn tất (`CompleteWork`, `BlockWork`, `DoneReminder`, `UnblockWork`, …), hoặc khi heartbeat resolve ra task khác `taskKey`, thì `currentTask` được clear/overwrite tự nhiên. Không cần hook riêng cho MCP tool ở bước đầu — task mới khác key là đủ để reset.

**Reminders taskKey:** vì `systemTask.type=reminders` không có `id`, dùng hash ổn định của danh sách reminder ids (sorted). Giúp cùng một batch reminder lặp lại được dedup.

**Priority 4 (blocked work):** cũng phải đếm, vì nếu agent không thể unblock thì cũng sẽ loop.

### 3. Không thay đổi DTO/Controller

API contract giữ nguyên. Client không cần update. Khi bị auto-sleep, response trả `{ success: true }` không kèm `systemTask`, client sẽ idle bình thường — lần heartbeat kế tiếp backend reject/bỏ qua vì `status='sleep'` đã được set (agent muốn tiếp tục phải wake-up manually qua API).

Lưu ý: hiện tại `heartbeat()` chỉ reject khi `status === 'suspended'`. Với auto-sleep, sau khi set `status='sleep'`, các heartbeat kế tiếp từ agent sẽ được xử lý bình thường (nhánh `idle`) — em **thêm check**: nếu `agent.status === 'sleep'` và `sleepUntil > now`, trả `{ success: true }` không kèm task. Khi `sleepUntil <= now`, tự động clear sleep fields và cho phép nhận task lại.

### 4. Observability

- Push 1 entry vào `agent.logs` (đã có, capped 100) khi auto-sleep — level=error, data = `{ taskKey, attemptCount, sleepUntil }`.
- Log warn qua logger với đầy đủ context để admin/manager grep được.
- Manager theo dõi qua list agent có `status=sleep` + `sleepReason` bắt đầu bằng `[AUTO]` — có thể filter bằng query string sẵn có.

## Scope không làm trong ticket này

- Agent báo cáo `lastTask.outcome` qua heartbeat DTO (option 3 đã đề xuất) — để sau.
- Heartbeat rate-limit — để sau.
- Token budget toàn cục — để sau.
- Escalate tự động (BlockWork/notify human) — để sau; managers tự follow-up từ danh sách agent sleep.

## Verification

- `npx tsc --noEmit -p services/aiwm/tsconfig.app.json`
- `npx nx build aiwm`
- Manual scenario test: cho 1 agent nhận work, agent không gọi CompleteWork, quan sát sau N heartbeat → agent bị set sleep, các heartbeat kế không trả task.

## Files cần sửa

- [services/aiwm/src/modules/agent/agent.schema.ts](../../../services/aiwm/src/modules/agent/agent.schema.ts) — thêm `currentTask`, update comment default taskSleepMinutes=240
- [services/aiwm/src/modules/agent/agent.service.ts](../../../services/aiwm/src/modules/agent/agent.service.ts) — sửa `heartbeat()`: auto-sleep logic + sleep-until check
