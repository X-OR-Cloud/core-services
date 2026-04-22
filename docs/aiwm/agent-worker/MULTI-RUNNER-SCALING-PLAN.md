# Multi-Runner Scaling Plan — Agent Worker (Phase 3)

**Feature:** Horizontal scaling per agent — nhiều runner xử lý đồng thời cho 1 agent  
**Service:** AIWM — `MODE=agt`  
**Branch:** `feature/agent-worker-multi-runner`  
**Date:** 2026-04-21

---

## 1. Vấn đề hiện tại

Kiến trúc hiện tại áp dụng **exclusive lock** (`SET NX`) — mỗi agent chỉ có đúng 1 runner active tại một thời điểm:

```
agt:lock:{agentId}  →  chỉ 1 instance win  →  1 AgentRunner
                                                  ↓
                                         maxConcurrency=5
                                         (5 conversations song song)
```

**Bottleneck khi 1 agent phải phục vụ nhiều user đồng thời:**

| Tình huống | Hành vi hiện tại | Hành vi mong muốn |
|-----------|-----------------|-------------------|
| 10 user nhắn cùng lúc | 5 xử lý, 5 queue trong memory | 10 xử lý song song |
| Runner instance crash | Lock expire 45s → failover | Failover tức thì (runner khác đã sẵn) |
| Memory `pendingTasks` đầy | Task mới ghi đè task cũ | Không mất message |
| Scale horizontally | Cần tách agent sang instance khác | Nhiều instance cùng serve 1 agent |

---

## 2. Giải pháp: Competing Consumer Pattern

### Nguyên tắc

Thay vì lock winner-take-all, cho phép **N runners cùng BLPOP** từ 1 Redis List:

```
chat:task:{agentId}  ←  LPUSH (ChatGateway)
        ↓
  ┌─────┴──────┐
  │  BLPOP     │  ← Runner A (Instance 1)
  │  BLPOP     │  ← Runner B (Instance 1)
  │  BLPOP     │  ← Runner C (Instance 2)
  └────────────┘
```

Redis List với BLPOP là **naturally thread-safe** — mỗi item chỉ được pop bởi đúng 1 consumer.

### Đảm bảo ordering per conversation

**Vấn đề:** Runner A nhận msg-1, Runner B nhận msg-2 của cùng conversation → có thể xử lý msg-2 trước msg-1.

**Giải pháp:** Conversation-level distributed lock:

```
khi Runner X pop được task:
  1. Thử SET agt:conv:{conversationId} {runnerId} PX 60000 NX
  2. Nếu acquired → xử lý task
  3. Nếu không acquired → RPUSH task trở lại queue, tiếp tục BLPOP
```

Cơ chế này đảm bảo tại một thời điểm, **chỉ 1 runner xử lý 1 conversation**, nhưng **nhiều conversations chạy song song trên nhiều runners**.

---

## 3. Thay đổi chi tiết

### 3.1 `agent.schema.ts` — Thêm setting `assistant_numRunners`

```typescript
// Trong settings object
assistant_numRunners?: number  // Default: 1 (backward compatible)
```

### 3.2 `agent-lock.service.ts` — Thêm Conversation Lock

Thêm 2 methods mới cho conversation-level locking:

```typescript
// Key pattern: agt:conv:{conversationId}
// TTL: 60s (đủ cho 1 LLM call, tự expire nếu runner crash)

async tryAcquireConv(conversationId: string): Promise<boolean>
async releaseConv(conversationId: string): Promise<void>
async renewConv(conversationId: string): Promise<void>  // gia hạn khi LLM đang chạy
```

**Lưu ý:** Conversation lock KHÔNG được track trong `ownedLocks` (đó là agent lock). Conversation locks được giữ ngắn hạn trong suốt 1 request, tự-expire nếu runner crash.

### 3.3 `agent-worker.service.ts` — Spawn N runners per agent

**Thay đổi `trySpawnRunner`:** Không còn dùng agent-level exclusive lock. Thay bằng runner registration.

**Thay đổi `spawnRunner`:** Gọi `spawnRunner(agent, runnerIndex)` N lần với `numRunners`.

**Thay đổi `runners` Map:** Từ `Map<agentId, AgentRunner>` → `Map<runnerId, AgentRunner>` với `runnerId = "${agentId}:${index}"`.

**Thay đổi `redisBlockingMap`:** Key từ `agentId` → `runnerId`.

**Runner registration (thay lock):**

```
SADD  agt:runners:{agentId}   {runnerId}   ← khi spawn
SREM  agt:runners:{agentId}   {runnerId}   ← khi teardown
SMEMBERS agt:runners:{agentId}              ← để đếm active runners
```

TTL của Set: không cần (managed manually). Cleanup khi instance shutdown.

**Health check:** `restartUpdatedAgents` và `claimUnlockedAgents` cần update để làm việc với runner set thay vì lock.

**`handleWorkerCmd` (restart):** Restart tất cả runners của 1 agentId.

### 3.4 `agent-runner.ts` — BLPOP + Conversation Lock

**Thay đổi `startConsuming`:**

```typescript
// Sau khi pop được task:
const convLockAcquired = await lockService.tryAcquireConv(task.conversationId);
if (!convLockAcquired) {
  // Conversation đang được xử lý bởi runner khác
  // Re-push về cuối queue để runner khác pick lên sau
  await this.config.redisBlocking.rpush(`chat:task:${agentId}`, raw);
  continue; // BLPOP tiếp
}
// Xử lý task...
```

**Thay đổi `handleTask`:** Bỏ in-memory `processingMap` guard (đã thay bằng conv lock). Giữ `pendingTasks` cho reload-defer. `maxConcurrency` vẫn còn nhưng ý nghĩa thay đổi: giới hạn số conv đồng thời *trên cùng 1 runner* (không phải toàn agent).

**Conversation lock renewal:** Trong `onStepFinish` callback của `generateText`, gia hạn conv lock để tránh expire giữa chừng long-running LLM call.

**Release conv lock:** Trong `finally` block của `handleTask`.

### 3.5 `AgentRunnerConfig` interface — Thêm dependencies

```typescript
// Thêm vào AgentRunnerConfig:
lockService: AgentLockService;   // Để tryAcquireConv / releaseConv
runnerId: string;                 // Unique ID: "${agentId}:${index}"
```

---

## 4. Flow mới hoàn chỉnh

```
Startup (Instance A, numRunners=3 cho agent-1):
  ├─ spawnRunner(agent-1, index=0) → runner "agent-1:0" → BLPOP chat:task:agent-1
  ├─ spawnRunner(agent-1, index=1) → runner "agent-1:1" → BLPOP chat:task:agent-1
  └─ spawnRunner(agent-1, index=2) → runner "agent-1:2" → BLPOP chat:task:agent-1

Startup (Instance B, numRunners=3 cho agent-1):
  ├─ spawnRunner(agent-1, index=0) → runner "agent-1:0-B" → BLPOP chat:task:agent-1
  └─ ... (thêm 3 runners nữa)

→ Tổng: 6 runners cùng BLPOP từ 1 queue

User A gửi msg → LPUSH chat:task:agent-1
User B gửi msg → LPUSH chat:task:agent-1
User C gửi msg → LPUSH chat:task:agent-1

Runner "agent-1:0" pops task-A:
  → tryAcquireConv("conv-A") → OK
  → xử lý task-A

Runner "agent-1:1" pops task-B:
  → tryAcquireConv("conv-B") → OK
  → xử lý task-B song song

Runner "agent-1:2" pops task-C:
  → tryAcquireConv("conv-C") → OK
  → xử lý task-C song song
```

**Trường hợp same conversation:**

```
User A gửi msg-1 → LPUSH
User A gửi msg-2 → LPUSH (msg-1 chưa xong)

Runner-0 pops msg-1:
  → tryAcquireConv("conv-A") → OK → xử lý

Runner-1 pops msg-2:
  → tryAcquireConv("conv-A") → FAIL (Runner-0 đang giữ)
  → RPUSH msg-2 về cuối queue

Runner-0 xong msg-1 → releaseConv("conv-A")
Runner-1 hoặc runner khác BLPOP lại → pop msg-2 → tryAcquireConv → OK
```

---

## 5. Edge Cases & Safeguards

### 5.1 Runner crash giữa chừng
Conv lock TTL = 60s → tự expire → runner khác có thể pick up. **Trade-off:** User phải chờ tối đa 60s nếu runner crash. Có thể giảm xuống 30s nếu LLM call thường ngắn.

### 5.2 Re-queued task và message ordering
RPUSH về cuối queue (không đầu) để đảm bảo fairness. Task có thể bị re-queue nhiều lần nếu conv liên tục busy → cần max retry counter để tránh starvation (xem 5.4).

### 5.3 RPUSH storm (nhiều runners cùng fail acquire)
Nếu conv-A đang busy và 5 runners cùng pop task của conv-A rồi RPUSH lại → task bị duplicate trong queue.

**Fix:** Chỉ RPUSH lại nếu task chưa được RPUSH trong window 1s (dùng task `taskId` + Redis SET để dedup RPUSH).

Hoặc đơn giản hơn: dùng **Lua script atomic** để kiểm tra conv lock trước khi pop:
- Nếu conv đang locked → skip pop (không pop = không cần push lại)
- Nhưng BLPOP không support Lua script pre-check trực tiếp.

**Giải pháp thực tế:** Dùng short sleep (10-50ms) sau failed conv lock acquisition trước khi continue BLPOP → giảm racing.

### 5.4 Task starvation (same conv liên tục bị re-queue)
Nếu conv-A cực kỳ busy (user spam), task của conv-A cứ bị RPUSH lại → các runner liên tục bận pop/push lại task này.

**Fix:** Giữ `pendingTasks` map trong mỗi runner như hiện tại. Thay vì RPUSH về queue, lưu vào `pendingTasks` nếu task này là của conv mà runner đang process. Nếu conv không thuộc runner đang process → RPUSH về queue.

### 5.5 Backward compatibility
- `numRunners = 1` (default) → behavior giống hệt hiện tại
- Config thay đổi không cần restart service (health check detect và adjust)

### 5.6 `onModuleDestroy` cleanup
Khi instance shutdown: SREM tất cả `runnerId` khỏi `agt:runners:{agentId}`.

### 5.7 `restartRunnerOnDemand`
Restart tất cả runners của agentId (loop qua runners Map filter by agentId prefix).

---

## 6. Files cần thay đổi

| File | Loại thay đổi | Mô tả |
|------|--------------|-------|
| `agent.schema.ts` | Minor | Thêm `assistant_numRunners` vào settings comment/type |
| `agent-lock.service.ts` | Medium | Thêm conversation lock methods |
| `agent-worker.service.ts` | Major | Multi-runner spawn, runner registry, health check update |
| `agent-runner.ts` | Major | Competing consumer + conv lock, refactor processingMap |

**Không thay đổi:**
- `chat.gateway.ts` — ChatGateway không cần biết có bao nhiêu runners
- `agent.service.ts` — API layer không đổi
- Queue config, BullMQ — không liên quan

---

## 7. Configuration

```bash
# Trong Agent settings (MongoDB):
assistant_numRunners: 3    # 3 runners per agent per instance
assistant_maxConcurrency: 5  # Mỗi runner xử lý tối đa 5 conv đồng thời

# Tổng throughput per instance = numRunners × maxConcurrency = 15 conversations
```

---

## 8. Deployment Strategy

1. **Deploy với `numRunners=1`** (default) → không có thay đổi hành vi
2. **Test với 1 agent thử nghiệm** → set `numRunners=3`
3. **Monitor** Redis memory, connection count, LLM API rate limits
4. **Rollout** dần cho các agents production

---

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Redis connection count tăng mạnh | Cao | Trung bình | Mỗi runner dùng 1 blocking conn. Pool nếu cần |
| LLM API rate limit hit | Trung bình | Cao | `numRunners` là knob để tune |
| Conv lock expire sớm (slow LLM) | Thấp | Trung bình | Renewal trong `onStepFinish` |
| Message duplicate khi RPUSH | Trung bình | Thấp | Task `taskId` dedup |
| Memory tăng (nhiều runners) | Thấp | Thấp | Mỗi runner ~vài MB |

---

## 10. Acceptance Criteria

- [ ] 1 agent với `numRunners=3` xử lý đồng thời 15 conversations (3×5) mà không có duplicate response
- [ ] Same conversation luôn xử lý message theo thứ tự đúng
- [ ] Runner crash → conv lock expire 60s → runner khác tiếp tục
- [ ] `numRunners=1` (default) → behavior giống hệt hiện tại, không regression
- [ ] Restart agent (via pub/sub) → tất cả runners restart
- [ ] Config thay đổi `numRunners` → health check detect và adjust số runners
- [ ] TypeScript build pass, lint pass
