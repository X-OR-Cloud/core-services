# Multi-Runner Scaling Plan V2 — Notification + Per-Conversation Queues

**Feature:** Horizontal scaling per agent — nhiều runner xử lý đồng thời cho 1 agent, phân chia theo `conversationId`
**Service:** AIWM — `MODE=agt`, `MODE=cws`
**Branch:** `feat/agent-worker-multi-runner-v2`
**Date:** 2026-04-26
**Supersedes:** [`MULTI-RUNNER-SCALING-PLAN.md`](./MULTI-RUNNER-SCALING-PLAN.md) (V1 — chưa implement)

---

## 1. Bối cảnh

### Kiến trúc hiện tại

```
chat:task:{agentId}  ←  LPUSH (CWS)
        ↓
   BLPOP (1 runner duy nhất)  ← agt:lock:{agentId} winner-take-all
        ↓
   maxConcurrency=5 (in-memory, per-runner)
   processingMap, pendingTasks (in-memory)
```

**Bottleneck:**
- 1 agent = 1 runner = chạy duy nhất trên 1 instance
- Tổng concurrency = `maxConcurrency` (mặc định 5) cho toàn bộ agent
- Crash → failover ~60s (lock TTL + health check)
- Bug nhỏ: `LPUSH` + `BLPOP` = LIFO, đúng phải FIFO

### Yêu cầu mới

> *"1 agent có thể chạy đồng thời trên nhiều instance, phân chia theo `conversationId`. SDK chatbot phải phục vụ lượng lớn user đồng thời."*

---

## 2. Vì sao chọn V2 thay vì V1

V1 (plan cũ) dùng pattern **shared queue + conv lock + RPUSH re-queue**:

```
N runners cùng BLPOP chat:task:{agentId}
  → pop task → tryAcquireConv → fail → RPUSH lại → BLPOP tiếp
```

| Vấn đề V1 | Hậu quả |
|-----------|---------|
| **Re-queue bounce** | Task của conv đang busy bị nhiều runner pop → RPUSH lại → bouncing giữa runners → tăng latency, lãng phí Redis ops |
| **RPUSH storm** | 5 runner cùng pop task của 1 conv busy → 5 lần RPUSH duplicate → cần dedup phức tạp |
| **Starvation** | Conv liên tục busy → task của nó cứ bị re-queue mãi → đói tài nguyên |
| **Task ordering không đảm bảo tuyệt đối** | Khi RPUSH lại, task có thể bị đặt sau task khác → ordering vỡ trong edge case |
| **Visibility kém** | Khó theo dõi conv nào đang backlogs vì tất cả trộn chung 1 queue |

V2 (plan mới) tách 2 tầng:

```
chat:notify:{agentId}                ← LPUSH conversationId (signal)
chat:task:{agentId}:{convId}         ← RPUSH task (per-conversation FIFO)
```

→ Loại bỏ **toàn bộ** vấn đề bouncing, ordering, dedup phức tạp ở V1.

---

## 3. Kiến trúc V2

### Sơ đồ tổng quan

```
                CWS (instance A hoặc B)
                       │
        ┌──────────────┴──────────────┐
        │                             │
   RPUSH chat:task:{agent}:{conv}     LPUSH chat:notify:{agent}
   (task payload — FIFO per conv)     (chỉ là conversationId)
        │                             │
        ▼                             ▼
  ┌──────────────────┐         ┌────────────────────┐
  │ Per-conv queues  │         │ Notification queue │
  │ {agent}:{conv1}  │         │ chat:notify:{agent}│
  │ {agent}:{conv2}  │         └─────────┬──────────┘
  │ {agent}:{conv3}  │                   │
  └──────────────────┘            BLPOP (N consumers)
                                   ↓        ↓
                              Runner A   Runner B    (trên 2+ AGT instances)
                                   │        │
                              SET NX agt:conv:{convId}  (TTL 120s, renewable)
                                   │        │
                       ┌───────────┘        └──────────┐
                       │                               │
            Acquired → drain hết per-conv      Not acquired → discard notification
            queue cho đến rỗng                  (winner sẽ tự drain)
                       │
            BRPOP chat:task:{agent}:{conv} timeout=2s
            (drain pattern, exit khi rỗng)
```

### Nguyên tắc thiết kế

1. **Notification = signal**, không chứa payload thật → idempotent, drop được không ảnh hưởng dữ liệu
2. **Per-conv queue = source of truth** cho tasks, FIFO ordering tuyệt đối
3. **Conv lock = ownership flag** — runner nào hold lock thì drain hết tasks của conv đó (batching tự nhiên)
4. **Loser instance discard notification** — không cần re-queue, không có bouncing

---

## 4. Thay đổi chi tiết

### 4.1 Producer side (CWS) — `chat-gateway.ts`

**Trước:**
```typescript
this.redisPub.lpush(`chat:task:${agentId}`, JSON.stringify(task));
```

**Sau:**
```typescript
// 1. Push task vào per-conv queue (FIFO)
this.redisPub.rpush(`chat:task:${agentId}:${conversationId}`, JSON.stringify(task));
// 2. Signal cho consumers
this.redisPub.lpush(`chat:notify:${agentId}`, conversationId);
```

**Thay đổi:** 2 vị trí push trong `chat-gateway.ts` (line ~261 con-worker bridge, line ~847 user message).

### 4.2 Consumer side (AGT) — `agent-runner.ts`

**Đổi BLPOP target:**
```typescript
// Trước:
const result = await this.config.redisBlocking.blpop(`chat:task:${agentId}`, 5);

// Sau:
const result = await this.config.redisBlocking.blpop(`chat:notify:${agentId}`, 5);
if (!result) continue;
const [, conversationId] = result;
```

**Drain loop sau khi nhận notification:**
```typescript
// 1. Acquire conv lock
const acquired = await this.lockService.tryAcquireConv(conversationId);
if (!acquired) continue;  // discard, winner sẽ drain

// 2. Drain hết per-conv queue
try {
  while (!this.isShuttingDown) {
    const item = await this.redisBlocking.brpop(
      `chat:task:${agentId}:${conversationId}`,
      2  // 2s timeout — exit nếu queue rỗng
    );
    if (!item) break;  // queue rỗng → release lock, BLPOP notify tiếp
    const task: AgentTask = JSON.parse(item[1]);
    await this.handleTask(task);
    await this.lockService.renewConv(conversationId);  // renew sau mỗi task
  }
} finally {
  await this.lockService.releaseConv(conversationId);
}
```

**Bỏ:**
- `processingMap` (in-memory) — thay bằng Redis conv lock
- `pendingTasks` map — không cần buffer in-memory vì per-conv queue đã FIFO
- Logic `agt:lock:{agentId}` — không còn winner-take-all

**Giữ:**
- `abortMap` — vẫn cần cho `/stop` command
- `maxConcurrency` — giới hạn số conv song song trên 1 runner (không phải toàn agent)

### 4.3 Lock service — `agent-lock.service.ts`

Thêm 3 methods:

```typescript
// Key: agt:conv:{conversationId}
// Value: {runnerId} (để verify ownership khi release)
// TTL: 120s (đủ cho LLM call dài + buffer)

async tryAcquireConv(conversationId: string, runnerId: string): Promise<boolean> {
  return await this.redis.set(
    `agt:conv:${conversationId}`,
    runnerId,
    'PX', 120000,
    'NX'
  ) === 'OK';
}

async renewConv(conversationId: string, runnerId: string): Promise<void> {
  // Lua: chỉ renew nếu vẫn là owner
  const script = `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      return redis.call('PEXPIRE', KEYS[1], ARGV[2])
    end
    return 0
  `;
  await this.redis.eval(script, 1, `agt:conv:${conversationId}`, runnerId, 120000);
}

async releaseConv(conversationId: string, runnerId: string): Promise<void> {
  // Lua: chỉ del nếu vẫn là owner (tránh xóa lock của runner khác sau khi mình expire)
  const script = `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      return redis.call('DEL', KEYS[1])
    end
    return 0
  `;
  await this.redis.eval(script, 1, `agt:conv:${conversationId}`, runnerId);
}
```

**Lưu ý:** Conv lock không track trong `ownedLocks`, chỉ giữ ngắn hạn trong scope 1 drain session.

### 4.4 Worker service — `agent-worker.service.ts`

**Bỏ agent-level lock:**
```typescript
// Trước:
const acquired = await this.lockService.tryAcquire(agentId, ...);
if (!acquired) return;
// spawn runner

// Sau:
// Không cần lock — tất cả instance đều spawn runner
// Phân chia tự nhiên qua BLPOP competition trên notification queue
await this.spawnRunner(agent);
```

**Health check:** Vẫn cần để detect agent config changes và respawn runner. Bỏ logic `claimUnlockedAgents`.

**`AGENT_IDS` env var:** Vẫn hoạt động — pin agents vào instance cụ thể nếu muốn.

### 4.5 Schema thay đổi

Không cần thay đổi schema. `numRunners` của V1 không cần thiết vì:
- Mỗi instance tự spawn 1 runner per agent
- Scale = thêm instance, không phải thêm runner cùng instance

---

## 5. Flow examples

### Case A: 3 user nhắn 3 conversation khác nhau

```
T=0:  CWS rpush task-1 → chat:task:agt:conv1
      CWS lpush conv1   → chat:notify:agt
T=0:  CWS rpush task-2 → chat:task:agt:conv2
      CWS lpush conv2   → chat:notify:agt
T=0:  CWS rpush task-3 → chat:task:agt:conv3
      CWS lpush conv3   → chat:notify:agt

T=0:  Runner A pops conv1 → acquireConv(conv1) OK → drain conv1
      Runner B pops conv2 → acquireConv(conv2) OK → drain conv2
      Runner C pops conv3 → acquireConv(conv3) OK → drain conv3

→ 3 conversations xử lý song song trên 3 runners.
```

### Case B: Same user nhắn 3 tin liên tiếp

```
T=0:  rpush msg-1 → chat:task:agt:conv1
      lpush conv1
T=1:  rpush msg-2 → chat:task:agt:conv1
      lpush conv1
T=2:  rpush msg-3 → chat:task:agt:conv1
      lpush conv1

T=0:  Runner A pops conv1 → acquireConv OK → drain
      → BRPOP msg-1 → handleTask
T=1:  Runner B pops conv1 → acquireConv FAIL → discard
T=2:  Runner C pops conv1 → acquireConv FAIL → discard

T=5s: Runner A xong msg-1 → BRPOP next
      → BRPOP msg-2 → handleTask
T=10s: Runner A xong msg-2 → BRPOP msg-3 → handleTask
T=15s: Runner A xong msg-3 → BRPOP timeout (queue rỗng) → release conv1

→ Tất cả 3 messages xử lý đúng thứ tự bởi cùng 1 runner.
→ Runners B, C đã idle từ T=2 sẵn sàng phục vụ conv khác.
```

### Case C: Runner crash giữa drain

```
T=0:  Runner A acquireConv(conv1) → drain msg-1 (đang xử lý)
T=2s: Runner A crash (process kill)

T=120s: Conv lock expire (không có runner nào renew)

T=120s+: User gửi msg-2 → CWS lpush conv1
        Runner B pops conv1 → acquireConv OK (lock đã expire)
        → BRPOP msg-2 → handleTask
        (msg-1 đã mất vì runner A đã pop ra trước khi crash)
```

**Trade-off:** Tin nhắn đang xử lý lúc crash bị mất. Mitigations:
- Conv lock TTL có thể giảm xuống 60s
- Có thể thêm visibility timeout pattern (XREADGROUP của Redis Streams) — nhưng tăng complexity

### Case D: 2 instances cùng start

```
Instance A start: spawn runner-A0 → BLPOP chat:notify:agt
Instance B start: spawn runner-B0 → BLPOP chat:notify:agt

User gửi 5 messages → 5 lần lpush notification

Runner A0 pop notif-1 → acquireConv(c1) OK → drain c1
Runner B0 pop notif-2 → acquireConv(c2) OK → drain c2
Runner A0 finish → pop notif-3 → acquireConv(c3) OK
...

→ Phân chia tự nhiên qua BLPOP competition.
→ Không cần config phức tạp, không cần phân vùng tĩnh.
```

---

## 6. Edge cases & Safeguards

### 6.1 Notification queue duplicate

User gửi 3 tin của cùng conv → 3 notifications cho conv đó. Loser instances discard notification → harmless. Cost: thêm vài Redis ops nhưng không ảnh hưởng correctness.

### 6.2 Notification mất (Redis crash, network blip)

Per-conv queue vẫn còn task → khi notification kế tiếp đến (user gửi tin mới), runner sẽ drain luôn cả task cũ. Self-healing.

**Risk còn lại:** Nếu user chỉ gửi 1 tin duy nhất và notification bị mất → task kẹt trong per-conv queue cho đến khi có notification khác. **Mitigation:** Periodic sweeper (mỗi 60s) check `chat:task:{agent}:*` keys, lpush notification cho key có data nhưng không có lock.

### 6.3 Conv lock expire trong lúc xử lý

Renew sau mỗi task (`renewConv` trong drain loop). Nếu LLM call cực dài (>120s) — có thể renew giữa chừng trong `onStepFinish` callback của `generateText`.

### 6.4 Race condition: 2 runner cùng pop notification

Redis BLPOP atomic — chỉ 1 runner pop được mỗi notification. Nếu cùng pop notification của cùng conv (do nhiều notifications duplicate), `tryAcquireConv` SET NX phân định winner. Loser discard.

### 6.5 Per-conv queue trở thành orphan

Khi conv không còn active (user offline, conversation đóng) → queue rỗng → key tự xóa khỏi Redis. Không leak memory.

### 6.6 BRPOP timeout chọn 2s — vì sao

- Quá ngắn (1s): runner exit drain quá sớm khi LLM đang xử lý task khác → mất task pending
- Quá dài (10s): runner giữ conv lock không cần thiết → conv khác chờ nếu user gửi tin mới
- 2s = balance giữa khả năng "phát hiện queue rỗng" và "không drop task pending"

### 6.7 Backward compatibility

**Breaking change:** CWS phải push theo format mới, AGT phải BLPOP queue mới. Không thể rolling deploy được — cần restart đồng thời.

**Migration:**
1. Deploy code → restart toàn bộ AGT, CWS, API trong cửa sổ thời gian ngắn
2. Old format `chat:task:{agentId}` không còn được consume → drain manual nếu có data tồn

**Alternative migration (an toàn hơn):**
- Trong AGT, support cả 2 format trong 1 phiên bản trung gian:
  ```typescript
  // BLPOP cả 2 keys
  const result = await blpop([
    `chat:notify:${agentId}`,
    `chat:task:${agentId}` // legacy
  ], 5);
  ```
- Deploy CWS sau đẩy data sang format mới
- Sau 1 ngày, remove legacy support

---

## 7. Files cần thay đổi

| File | Loại | Mô tả |
|------|------|-------|
| `services/aiwm/src/modules/chat-gateway/chat.gateway.ts` | Medium | Đổi 2 vị trí push (user message, con-worker bridge) sang format mới |
| `services/aiwm/src/modules/agent-worker/agent-runner.ts` | Major | Đổi BLPOP target, thêm drain loop, conv lock acquisition/renewal/release, bỏ processingMap/pendingTasks |
| `services/aiwm/src/modules/agent-worker/agent-worker.service.ts` | Medium | Bỏ agent-level lock logic, đơn giản hóa health check |
| `services/aiwm/src/modules/agent-worker/agent-lock.service.ts` | Medium | Thêm 3 methods: `tryAcquireConv`, `renewConv`, `releaseConv` (Lua scripts) |

**Không thay đổi:**
- `agent.service.ts` — API layer
- `agent.schema.ts` — không cần `numRunners` field
- BullMQ queue config
- Connection worker / con bridge

---

## 8. Configuration

```bash
# Không cần config mới ở agent settings
# Scale = thêm instance trong ecosystem.config.js

# ecosystem.config.js
{ name: 'core.aiwm.agt00', env: { MODE: 'agt' } },
{ name: 'core.aiwm.agt01', env: { MODE: 'agt' } },
{ name: 'core.aiwm.agt02', env: { MODE: 'agt' } },  # thêm tùy ý
```

**Optional pinning** (giữ nguyên từ V1):
```bash
{ name: 'core.aiwm.agt-vip', env: { AGENT_IDS: 'vip-agent-id-1,vip-agent-id-2' } }
```

---

## 9. Acceptance Criteria

- [ ] 3 instances AGT chạy đồng thời, 1 agent xử lý 30+ conversations song song
- [ ] Same conversation luôn xử lý theo thứ tự đúng (test: gửi 5 tin liên tiếp, verify order)
- [ ] Cross-instance: user connect CWS instance A, agent xử lý ở AGT instance B → response về đúng client
- [ ] Runner crash giữa drain → conv lock expire 120s → runner khác tiếp tục với tin tiếp theo
- [ ] CWS scale 2 instances + AGT scale 3 instances → no duplicate response, no message loss
- [ ] `/stop` command vẫn hoạt động đúng (qua `chat:cmd:{agentId}` Pub/Sub — handle bởi instance đang giữ conv lock)
- [ ] Instruction update (PUT /instructions/:id) → tất cả runners của agent đó reload
- [ ] TypeScript build pass, lint pass

---

## 10. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Notification mất → task kẹt | Thấp | Trung bình | Periodic sweeper (60s) check orphan queues |
| Conv lock expire khi LLM dài | Thấp | Trung bình | Renewal trong `onStepFinish` callback |
| Tin nhắn mất khi runner crash giữa xử lý | Thấp | Cao | Reduce TTL xuống 60s; long-term: chuyển sang Redis Streams ACK pattern |
| Migration breaking change | Cao | Trung bình | Dual-format support trong 1 version trung gian |
| Redis key explosion (per-conv queues) | Thấp | Thấp | Empty queues tự xóa; conv ngắn hạn nên không tích lũy |

---

## 11. Implementation Phases

### Phase 1 — Lock service (1h)
- Thêm `tryAcquireConv`, `renewConv`, `releaseConv` với Lua scripts
- Unit test ownership semantics

### Phase 2 — Agent runner refactor (3h)
- Đổi BLPOP target sang notification queue
- Implement drain loop với conv lock
- Bỏ `processingMap`, `pendingTasks`
- Thêm conv lock renewal trong drain loop

### Phase 3 — CWS producer change (1h)
- Đổi 2 vị trí push sang format mới
- (Optional) dual-format support cho migration

### Phase 4 — Worker service simplification (1h)
- Bỏ agent-level lock
- Cleanup health check

### Phase 5 — Testing (3h)
- Local test: 1 instance, single conv ordering
- Local test: 1 instance, multi-conv parallelism
- Production-like test: 2+ AGT instances, scale verification
- Crash recovery test (kill -9 mid-drain)

### Phase 6 — Migration deploy (1h)
- Deploy với dual-format support
- Verify old queue drain hết
- Remove legacy support trong patch tiếp theo

**Total: ~10 giờ work**

---

## 12. Future evolution

V2 dùng BLPOP + per-conv queues — đủ tốt cho tới ~1000 concurrent conversations/agent.

Nếu cần scale lớn hơn (> 1000) hoặc cần ACK semantics chính xác (no message loss on crash):
→ Migrate sang **Redis Streams** với consumer groups + `XAUTOCLAIM` cho abandoned entries.

V2 design dễ migrate sang Streams vì:
- Per-conv ordering đã được nghĩ trong design (Stream ID prefix có thể thay thế conv lock)
- Notification queue có thể bỏ (Streams tự distribute messages)
