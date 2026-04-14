# AIWM — Instruction Hot Reload

Branch: `feature/aiwm-instruction-hot-reload`

## Mục tiêu

Khi user sửa instruction của agent trong DB, Agent Runner (MODE=agt) phải áp dụng bản mới cho **request kế tiếp** mà **không ảnh hưởng request đang process**.

Phạm vi: chỉ xử lý cơ chế reload. Không làm version tracking / observability trong lần này.

## Yêu cầu

1. Request đang chạy (đang ở trong `generateText` hoặc tool-use loop) phải hoàn tất với instruction **cũ** — không bị đổi giữa chừng.
2. Request tiếp theo (sau khi user update instruction) phải dùng instruction **mới**.
3. Nếu message mới đến **trong lúc** runner đang reload, message đó phải chờ reload xong rồi mới chạy (dùng bản mới).
4. Không phụ thuộc health-check 30s → phải gần realtime (<2s từ lúc PATCH).

## Hiện trạng (đã verify)

- `AgentRunner` cache instruction trong `this.config.instruction` ([agent-runner.ts:156](services/aiwm/src/modules/agent-worker/agent-runner.ts#L156)).
- `handleTask` đọc systemPrompt tại 2 chỗ:
  - [agent-runner.ts:514](services/aiwm/src/modules/agent-worker/agent-runner.ts#L514) — local var (OK).
  - [agent-runner.ts:537](services/aiwm/src/modules/agent-worker/agent-runner.ts#L537) — **đọc lại `this.config.instruction.systemPrompt`** (rủi ro inconsistency giữa validation và LLM call nếu reload xen vào giữa các `await`).
- `reload()` tồn tại ([:612](services/aiwm/src/modules/agent-worker/agent-runner.ts#L612)) nhưng chỉ trigger bởi `/reload` command hoặc health-check hash mismatch (~30s).
- Flag `isReloading` có nhưng `handleTask` không check → race condition request mới chạy trong lúc đang reload.
- `pendingTasks` map + drain logic đã có sẵn ([:599-605](services/aiwm/src/modules/agent-worker/agent-runner.ts#L599-L605)) → reuse được.

## Thiết kế

### A. Fix race condition trong AgentRunner

**A1.** Đổi [agent-runner.ts:537](services/aiwm/src/modules/agent-worker/agent-runner.ts#L537) từ `system: this.config.instruction.systemPrompt` → `system: systemPrompt` (dùng local var đã capture ở :514). Đảm bảo toàn bộ request dùng cùng 1 snapshot.

**A2.** Ở đầu `handleTask` (sau guard concurrency [:432-439](services/aiwm/src/modules/agent-worker/agent-runner.ts#L432-L439)), thêm check:

```ts
if (this.isReloading) {
  this.pendingTasks.set(conversationId, task);
  return;
}
```

Reload xong → drain qua cơ chế pending sẵn có.

**A3.** Sau khi `reload()` hoàn tất thành công, drain `pendingTasks` (các task đang chờ vì `isReloading=true`):

```ts
// cuối reload(), trong finally sau khi this.isReloading = false
for (const [convId, task] of [...this.pendingTasks.entries()]) {
  this.pendingTasks.delete(convId);
  this.handleTask(task).catch(...);
}
```

### B. Event-driven reload trigger

**B1.** Định nghĩa Redis pub/sub channel: `aiwm:instruction-updated`. Payload:
```ts
{ instructionId: string; updatedAt: string }
```

**B2.** `InstructionService.update()` (và các mutation khác — updateOne, patch, v.v.) publish event sau khi commit DB.

**B3.** `AgentWorkerService` (MODE=agt) subscribe channel ở `onModuleInit`:
- Nhận event → resolve danh sách runner hiện đang serve agent có `instructionId` khớp.
- Map `instructionId → agentIds`: query Agent collection `{ instructionId }` 1 lần, cache trong worker, invalidate khi runner spawn/stop.
- Với mỗi runner match → gọi `runner.triggerReload('event')`.

**B4.** `AgentRunner.triggerReload(source)`: wrapper gọi `reload()`, bảo đảm không reload song song (check `isReloading`, nếu đang reload thì skip — reload sau sẽ lấy bản mới nhất dù sao).

### C. Đa instance (MODE=agt scale ngang)

Redis pub/sub là broadcast — mọi worker instance đều nhận event. Mỗi instance tự filter runner của mình (chỉ reload agent mà nó đang chạy). Không cần coordination thêm.

Runner lock hiện tại (Redis lock per agentId) đảm bảo chỉ 1 instance có runner active → event chỉ effective trên instance đó, các instance khác no-op.

### D. Fallback

Giữ nguyên health-check hash 30s làm safety net (phòng event bị miss do Redis downtime tạm thời). Không cần đổi gì.

## Tasks (micro)

| # | File | Mô tả |
|---|---|---|
| 1 | `services/aiwm/src/modules/agent-worker/agent-runner.ts` | Fix A1: dùng `systemPrompt` local var ở dòng 537 |
| 2 | `services/aiwm/src/modules/agent-worker/agent-runner.ts` | Fix A2: check `isReloading` ở đầu `handleTask`, defer vào `pendingTasks` |
| 3 | `services/aiwm/src/modules/agent-worker/agent-runner.ts` | Fix A3: drain `pendingTasks` sau khi `reload()` thành công |
| 4 | `services/aiwm/src/modules/agent-worker/agent-runner.ts` | Thêm `triggerReload(source: 'event' \| 'manual' \| 'health')` wrapper |
| 5 | `libs/shared/src/lib/constants/` hoặc tương đương | Định nghĩa constant `REDIS_CHANNEL_INSTRUCTION_UPDATED` |
| 6 | `services/aiwm/src/modules/instruction/instruction.service.ts` | Publish event sau khi `update()` commit |
| 7 | `services/aiwm/src/modules/agent-worker/agent-worker.service.ts` | Subscribe channel, resolve runner theo `instructionId`, gọi `triggerReload` |
| 8 | Build + TS check: `npx nx build aiwm` + `npx tsc --noEmit -p services/aiwm/tsconfig.app.json` | Verify |
| 9 | Manual test | Sửa instruction qua API → gửi message → kiểm tra runner log có "Reloaded instruction" và message dùng prompt mới |

## Out of scope (lần này)

- Version tracking / `GET /agents/:id/runtime-status`
- WS ack event `agent:instruction-loaded`
- Audit collection `InstructionLoadHistory`
- Giảm health-check interval

## Rủi ro & mitigation

| Rủi ro | Mitigation |
|---|---|
| Event fire trước khi DB commit visible ở replica | Publish **sau** khi `save()` resolve; runner đọc từ primary qua `connectInternal` |
| Message flood lúc đang reload → pendingTasks lớn | `pendingTasks` vốn chỉ giữ **task mới nhất per conversation** ([:436](services/aiwm/src/modules/agent-worker/agent-runner.ts#L436)) → an toàn |
| Reload fail (DB lỗi) | `reload()` trả `false`, giữ config cũ, log error; task pending vẫn drain với bản cũ (không block) |
| Nhiều update liên tiếp | Mỗi event trigger 1 reload; nếu đang reload thì bỏ qua — reload trước đó sẽ lấy bản mới nhất vì đọc từ DB tại thời điểm chạy |
