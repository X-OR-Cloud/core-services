# Debug — Engineer agent không nhận việc

Triệu chứng: agent đang `idle`, có Work ở trạng thái `todo` được assign, nhưng heartbeat trả `hasSystemMessage: false` → agent không bao giờ start.

Tài liệu này mô tả phương pháp debug 4 lớp (DB → CBM → AWS heartbeat → Agent client) cùng các tool đi kèm. Đã được dùng thực chiến với agent `jade` (2026-05-06).

---

## Quy trình debug — 4 lớp kiểm tra

### Lớp 1 — Trạng thái DB

Mục tiêu: loại trừ các nguyên nhân tầm thường (agent suspended, work bị xoá, dependency chưa done...).

```bash
MONGODB_URI=$(grep MONGODB_URI .env | cut -d= -f2-)
mongosh "$MONGODB_URI" --quiet --eval '
const aiwm = db.getSiblingDB("core_aiwm");
const cbm  = db.getSiblingDB("core_cbm");

// 1. Agent
printjson(aiwm.agents.findOne(
  { _id: ObjectId("<AGENT_ID>") },
  { type:1, status:1, sleepUntil:1, currentTask:1, allowedToolIds:1, lastHeartbeatAt:1 }
));

// 2. Work
printjson(cbm.works.findOne(
  { _id: ObjectId("<WORK_ID>") },
  { title:1, type:1, status:1, assignee:1, dependencies:1, "owner.orgId":1, isDeleted:1 }
));
'
```

Checklist:
- [ ] `agent.type === "engineer"`
- [ ] `agent.status` không phải `suspended` / `sleep`
- [ ] `agent.currentTask === null` (nếu có giá trị → circuit breaker đã đếm attempts)
- [ ] `work.assignee.id` trùng `agentId`, `work.status === "todo"`
- [ ] `work.owner.orgId` trùng org của agent
- [ ] Dependency của work (nếu có) đều `done` hoặc `cancelled`

Nếu work phải có MCP tools tương ứng (`StartWork`, `BlockWork`, `CompleteWork`...), `agent.allowedToolIds` phải bao gồm tool **WorkManagement** (`6943bff3dfc4396c89d3a3ff`). Nếu thiếu → MCP server không expose các function bắt buộc → AWS skip work assignment (xem [Lớp 3](#lớp-3--aws-heartbeat-service)).

### Lớp 2 — CBM `/works/next-work`

Mục tiêu: xác nhận CBM trả đúng work cho assignee theo priority logic ([NEXT-WORK-PRIORITY-LOGIC.md](../../cbm/NEXT-WORK-PRIORITY-LOGIC.md)).

```bash
TOKEN="<agent-jwt>"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.x-or.cloud/dev/cbm/works/next-work?assigneeType=agent&assigneeId=<AGENT_ID>" \
  | jq '.metadata, {workId: .work._id, status: .work.status}'
```

Kết quả mong đợi: `metadata.priorityLevel > 0` và `work._id` khớp work đang xét. Nếu CBM trả `priorityLevel: 0` → kiểm tra dependency / status / scope filter.

### Lớp 3 — AWS heartbeat service

Mục tiêu: xác nhận server-side trả `systemMessage` + `systemTask` khi nhận đúng payload.

#### a) Tail log AWS process (xem agent thật gửi gì)

```bash
pm2 logs aiwm-aws | grep "agentId=<AGENT_ID>"
```

Tìm dòng:
```
[heartbeat] agentId=... mcpConnected=? availableFunctions=N
```

Đối chiếu với guard logic trong [heartbeat.service.ts](../../../services/aiwm/src/modules/heartbeat/heartbeat.service.ts):
- `mcpConnected === false` → server skip
- `availableFunctions` thiếu function bắt buộc theo priority bucket → skip:
  | Priority | Required functions |
  |---|---|
  | ≤ 3 (`low`) | `StartWork`, `BlockWork` |
  | 4 (`blocked`) | `UnblockWork`, `BlockWork` |
  | ≥ 5 (`review`) | `CompleteWork`, `RejectReviewForWork` |
- Nếu cả 2 field đều `undefined` → server **không skip** (legacy clients vẫn nhận work)

#### b) Simulate heartbeat từ máy local

Dùng [`scripts/debug-agent-heartbeat.js`](../../../scripts/debug-agent-heartbeat.js):

```bash
# Lấy JWT mới nhất từ inspect/connect agent
AGENT_TOKEN="<jwt>" \
WS_URL="wss://skt.x-or.cloud" WS_PATH="/agent/socket.io" \
PAYLOAD=variants \
node scripts/debug-agent-heartbeat.js
```

Output là bảng so sánh các payload variant — `hasSystemMessage=true` ⇔ server trả systemTask.

> ℹ️ Nếu **mọi variant** đều `hasSystemMessage=false`, đó không phải bug script — nghĩa là CBM không còn work nào TODO cho agent (đã done hết / không có dependency met). Verify bằng [Lớp 2](#lớp-2--cbm-worksnext-work) trước.

> ⚠️ **Side-effect**: nếu variant trả systemTask thành công, server sẽ set `agent.currentTask` (circuit breaker tracking). Sau khi test xong, **clear lại** để không can thiệp agent thật:
> ```js
> db.agents.updateOne({_id: ObjectId("<AGENT_ID>")}, {$set: {currentTask: null}})
> ```

### Lớp 4 — Agent client

Nếu Lớp 1-3 đều OK nhưng agent thật vẫn `hasSystemMessage: false` ở log heartbeat → vấn đề ở client SDK.

Cần kiểm tra:

1. **MCP connection state**:
   - Test trực tiếp MCP với token agent bằng curl:
     ```bash
     # initialize handshake
     SID=$(curl -sS -D - -o /dev/null -X POST \
       -H "Content-Type: application/json" \
       -H "Authorization: Bearer $TOKEN" \
       -H "Accept: application/json, text/event-stream" \
       -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"x","version":"1"}}}' \
       https://xsai-mcp.x-or.cloud | awk -F': ' '/^[Mm]cp-[Ss]ession-[Ii]d:/ {gsub(/\r/,"",$2); print $2}')

     # tools/list
     curl -sS -X POST \
       -H "Authorization: Bearer $TOKEN" \
       -H "Accept: application/json, text/event-stream" \
       -H "mcp-session-id: $SID" \
       -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
       https://xsai-mcp.x-or.cloud
     ```
   - Nếu MCP server OK nhưng client báo disconnected → bug ở client.

2. **Token replacement**: response của `POST /agents/:id/connect` trả `mcpServers.Builtin.headers.Authorization = "Bearer <USER_ACCESS_TOKEN>"` (literal placeholder). Engineer agent SDK phải tự replace placeholder với JWT của chính nó. Nếu không replace → MCP trả 401 → `mcpConnected=false`. Xem [heartbeat-issue 2026-05-06](#known-issues).

3. **HeartbeatManager log payload**: thêm log đầy đủ để xem client gửi gì:
   ```js
   log('heartbeat emit', { status, mcpConnected, availableFunctionsLen: availableFunctions?.length });
   ```

---

## Decision tree

```
Agent không nhận việc
│
├─ DB sai (status, dependency, allowedToolIds, owner)?
│  → fix DB, agent restart, xong.
│
├─ CBM /works/next-work trả null?
│  → xem priority logic, dependency, scope filter.
│
├─ AWS log: mcpConnected=false hoặc availableFunctions=0?
│  → vấn đề Agent client (Lớp 4):
│     • MCP placeholder token chưa replace?
│     • HeartbeatManager đọc state từ MCP client riêng (lệch với LLM session)?
│     • MCP server unreachable từ phía agent?
│
├─ AWS log: missing required functions?
│  → agent thiếu tool bắt buộc cho priority bucket.
│  → add WorkManagement vào allowedToolIds, agent reconnect MCP.
│
└─ Server-side test (Lớp 3.b) trả hasSystemMessage=true,
   nhưng agent thật vẫn không nhận?
   → Agent client log payload thật để so sánh với variant
     em đã verify, tìm field nào lệch.
```

---

## Tools

| Tool | Mục đích |
|---|---|
| [`scripts/debug-agent-heartbeat.js`](../../../scripts/debug-agent-heartbeat.js) | Simulate heartbeat WS với nhiều variant payload, xem server response |
| `mongosh $MONGODB_URI` | Query DB layer 1 |
| `curl /works/next-work` | Verify CBM layer 2 |
| `pm2 logs aiwm-aws` | Tail server log layer 3 |
| `curl <mcp-url>` | Verify MCP server layer 4 |

---

## Known issues

### 2026-05-06 — Engineer agent MCP placeholder token

**Triệu chứng**: agent jade `69f1b2e887a833a626e59921` không nhận work mặc dù tất cả layer 1-3 đều OK. Log AWS: `mcpConnected=false availableFunctions=0`. Nhưng khi user chat với agent, MCP tools work bình thường (LLM list được tools). Sau lần chat đó, heartbeat tiếp theo nhận systemTask.

**Nguyên nhân**: [agent.service.ts:483](../../../services/aiwm/src/modules/agent/agent.service.ts#L483) trả về `Authorization: Bearer <USER_ACCESS_TOKEN>` literal cho cả assistant lẫn engineer. Engineer agent SDK 2.2.4 có 2 đường đời MCP:
- HeartbeatManager: eager init với placeholder → 401 → state disconnected
- LLM session: lazy init khi user message — code khác replace token đúng → MCP OK

**Fix**: server-side, return `Bearer ${accessToken}` cho `agent.type === 'engineer'`, giữ placeholder cho assistant (web frontend sẽ replace).

**Tham khảo**: incident được debug end-to-end với phương pháp 4 lớp ở document này.
