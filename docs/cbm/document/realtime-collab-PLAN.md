# Plan #3 — Document Realtime Collaboration (Hocuspocus + Yjs)

**Service:** CBM
**Status:** Draft — chờ duyệt
**Phụ thuộc:** Plan #2 (Document Notion-lite) phải deploy trước
**Phụ thuộc bởi:** (none)

---

## 1. Mục tiêu

Cho phép nhiều user cùng xem và edit một document với cập nhật real-time (multi-cursor, awareness, conflict-free merge). Agent **không tham gia** vào phiên collab — agent chỉ hỗ trợ user qua chat widget (Plan #2) hoặc thao tác thẳng vào `content` qua MCP khi không có session nào đang mở.

Trải nghiệm đích:
- User A mở doc → gõ → user B mở cùng doc → thấy cursor của A, nội dung A gõ xuất hiện ngay
- Mất mạng → gõ offline → reconnect → auto merge, không mất edit
- User bấm **"Cập nhật"** → draft → `content` markdown → clear draft → badge biến mất
- Không bấm cập nhật → reload trang vẫn còn draft (restore từ `draftState`)
- Agent MCP cố sửa doc đang có session → nhận lỗi structured → báo lại cho user qua chat

## 2. Phạm vi

### Trong phạm vi
- Service mode mới: `cbm:rtc` (Hocuspocus server, chạy độc lập với `cbm:api`)
- Persistence Yjs ↔ MongoDB `draftState` field (field đã có từ Plan #2)
- Auth hook `onAuthenticate` dùng JWT hiện có
- Permission hook dùng `assertCanWriteDocument`
- Commit endpoint `POST /documents/:id/commit` — serialize draft → markdown → overwrite `content`
- MCP conflict handling: reject với lỗi structured khi session active
- FE integration: y-hocuspocus-provider + y-indexeddb + BlockNote collaboration cursor

### Ngoài phạm vi
- Multi-instance Hocuspocus (MVP chạy 1 instance — xem mục 11 scale path)
- Version history / time-travel
- Inline comments / suggestion mode
- Agent tham gia Yjs transaction (không làm — user quyết định apply)

## 3. Kiến trúc

```
┌───────────────────────────────┐          ┌───────────────────────────────┐
│ Browser 1                     │          │ Browser 2                     │
│  BlockNote + YDoc             │          │  BlockNote + YDoc             │
│  y-indexeddb (offline cache)  │          │  y-indexeddb (offline cache)  │
│  y-hocuspocus-provider        │          │  y-hocuspocus-provider        │
└──────────────┬────────────────┘          └────────────┬──────────────────┘
               │ WebSocket                              │
               │ /collab/document:<id>                  │
               └────────────────┬───────────────────────┘
                                ▼
                ┌──────────────────────────────────┐
                │ cbm:rtc (Hocuspocus server)      │
                │  Port 3014 (dev) / 3344 (prod)   │
                │                                  │
                │  Hooks:                          │
                │   onAuthenticate → JWT + ACL     │
                │   onLoadDocument → seed YDoc     │
                │   onStoreDocument → flush draft  │
                │   onDisconnect → cleanup timer   │
                │                                  │
                │  In-memory: Map<docId, YDoc>     │
                └────────────┬─────────────────────┘
                             │ Mongoose
                             ▼
                ┌──────────────────────────────────┐
                │ MongoDB (cbm database)           │
                │   documents collection           │
                │     content (markdown)           │
                │     draftState (Yjs binary)      │
                │     draftUpdatedAt               │
                │     hasActiveDraft               │
                └──────────────────────────────────┘
                             ▲
                             │ REST
                ┌──────────────────────────────────┐
                │ cbm:api (existing)               │
                │  POST /documents/:id/commit      │
                │  PATCH/updateContent (MCP path)  │
                │  Session-state check via Redis   │
                └──────────────────────────────────┘
                             ▲
                             │ pub/sub "document-session:<id>"
                             ▼
                ┌──────────────────────────────────┐
                │ Redis                            │
                │  Presence registry               │
                │  cbm:api ↔ cbm:rtc coordination  │
                └──────────────────────────────────┘
```

### Vì sao tách `cbm:rtc` service riêng
- `cbm:api` chạy N instance với HTTP LB round-robin, stateless.
- Hocuspocus Yjs in-memory là **stateful** — cùng 1 docId phải về cùng instance. LB HTTP không đảm bảo điều này.
- Tách riêng → `cbm:rtc` chạy 1 instance, `cbm:api` scale độc lập. WebSocket không ảnh hưởng HTTP latency.
- Khi cần scale rtc (phase sau): thêm sticky-session theo docId tại LB hoặc Hocuspocus Redis extension. Tất cả changes cô lập trong `cbm:rtc`.

## 4. Hocuspocus server setup

### 4.1. Dependencies

```
@hocuspocus/server
@hocuspocus/extension-logger   (optional, dev)
yjs
```

Frontend:
```
@hocuspocus/provider
y-indexeddb
@blocknote/xl-multi-column (tùy)
```

### 4.2. Bootstrap file

```
services/cbm/src/bootstrap-rtc.ts
```

```typescript
import { Server } from '@hocuspocus/server';
import { NestFactory } from '@nestjs/core';
import { AppRtcModule } from './app-rtc.module';
import { buildHocuspocusHooks } from './modules/document-rtc/hocuspocus.hooks';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppRtcModule);
  const hooks = buildHocuspocusHooks(app);

  const server = Server.configure({
    port: Number(process.env.CBM_RTC_PORT ?? 3014),
    address: process.env.CBM_RTC_HOST ?? '0.0.0.0',
    ...hooks,
  });

  await server.listen();
}

bootstrap();
```

`AppRtcModule` = subset của AppModule chỉ chứa: MongooseModule, DocumentModule (service-only), IamAuthGuard share, shared libs. Không load HTTP controllers.

### 4.3. project.json target

```json
"rtc": {
  "executor": "@nx/webpack:webpack",
  "options": {
    "main": "services/cbm/src/bootstrap-rtc.ts",
    "outputPath": "dist/services/cbm-rtc",
    ...
  }
}
```

Command: `nx run cbm:rtc`.

Port allocation: dev 3014, prod 3344 (trong dải 3340-3349 cbm). Cập nhật `docs/PORT-ALLOCATION.md`.

### 4.4. Hooks

```typescript
// services/cbm/src/modules/document-rtc/hocuspocus.hooks.ts
export function buildHocuspocusHooks(app: INestApplicationContext) {
  const docService = app.get(DocumentService);
  const docRtcService = app.get(DocumentRtcService);
  const jwtService = app.get(JwtService);

  return {
    async onAuthenticate({ token, documentName }) {
      // documentName = "document:<id>"
      const [, docId] = documentName.split(':');
      const payload = jwtService.verify(token);
      const context = buildRequestContext(payload);

      const doc = await docService.findByIdForRtc(docId);
      if (!doc) throw new Error('Document not found');

      const project = doc.projectId
        ? await app.get(ProjectService).getRawProjectById(doc.projectId)
        : null;
      assertCanWriteDocument(doc, project, context);

      return { context, docId };
    },

    async onLoadDocument({ documentName, context }) {
      const docId = context.docId;
      return docRtcService.loadYDoc(docId);
    },

    async onStoreDocument({ documentName, state, context }) {
      await docRtcService.saveDraftState(context.docId, state, context.context);
    },

    async onDisconnect({ documentName, context, clientsCount }) {
      if (clientsCount === 0) {
        docRtcService.scheduleCleanup(context.docId);
      }
    },

    onAwarenessUpdate({ documentName, context, awareness }) {
      // optional: sync presence to Redis for cbm:api to read
      docRtcService.publishPresence(context.docId, awareness);
    },
  };
}
```

## 5. `DocumentRtcService`

Module mới: `services/cbm/src/modules/document-rtc/`.

```typescript
@Injectable()
export class DocumentRtcService {
  constructor(
    @InjectModel(Document.name) private docModel: Model<Document>,
    @Inject(REDIS_CLIENT) private redis: Redis,
  ) {}

  async loadYDoc(docId: string): Promise<Y.Doc> {
    const doc = await this.docModel.findById(docId).select('content draftState').lean();
    if (!doc) throw new Error('Document not found');

    const yDoc = new Y.Doc();
    if (doc.draftState) {
      Y.applyUpdate(yDoc, new Uint8Array(doc.draftState));
    } else {
      // seed from content markdown
      const blocks = parseMarkdownToBlockNote(doc.content);
      applyBlocksToYDoc(yDoc, blocks);
    }

    await this.markSessionActive(docId);
    return yDoc;
  }

  async saveDraftState(docId: string, state: Uint8Array, userContext: RequestContext) {
    await this.docModel.updateOne(
      { _id: docId },
      {
        $set: {
          draftState: Buffer.from(state),
          draftUpdatedAt: new Date(),
          hasActiveDraft: true,
        },
      },
    );
  }

  async scheduleCleanup(docId: string) {
    // Mark session end after grace period (5 min). If no reconnect, release Redis lock.
    setTimeout(() => this.releaseSessionIfIdle(docId), 5 * 60 * 1000);
  }

  async markSessionActive(docId: string) {
    // Redis key: doc-session:<id>, TTL 10 min, refresh on keepalive
    await this.redis.set(`doc-session:${docId}`, '1', 'EX', 600);
  }

  async releaseSessionIfIdle(docId: string) {
    // Check if still has connected clients (awareness count in memory)
    // If not → DEL Redis key
  }

  async isSessionActive(docId: string): Promise<boolean> {
    return (await this.redis.exists(`doc-session:${docId}`)) === 1;
  }
}
```

## 6. Markdown ↔ BlockNote ↔ YDoc serialization

Đây là phần kỹ thuật khó nhất.

### 6.1. Strategy

BlockNote provides:
- `editor.tryParseMarkdownToBlocks(md)` — md → blocks
- `editor.blocksToMarkdownLossy(blocks)` — blocks → md
- Y.js binding: BlockNote has first-class Yjs integration — `collaboration` extension binds editor state to a Y.Doc

Server-side trong `cbm:rtc` **không** chạy BlockNote (nặng, React-based). Thay vào đó, server dùng Yjs binary blob làm "black box":
- Load: seed bằng cách khởi tạo YDoc từ raw prosemirror-ish JSON — nhưng server không biết schema BlockNote.

**Vấn đề**: seed Yjs từ markdown phía server là khó vì phải biết ProseMirror schema.

### 6.2. Giải pháp: seed phía client

Luồng đề xuất:
1. Client mở doc → `GET /documents/:id/content` lấy markdown + `hasActiveDraft` flag
2. Client mở WebSocket tới Hocuspocus
3. `onLoadDocument` phía server:
   - Nếu `draftState` tồn tại → load vào Y.Doc server-side
   - Nếu không → trả **empty Y.Doc**
4. Client detect Y.Doc empty (dùng awareness message "initial-seed-needed") → client parse markdown bằng BlockNote + apply vào Y.Doc local → Yjs sync update ra server
5. Server `onStoreDocument` lưu `draftState` = update từ client đầu tiên

Ưu điểm: server không cần biết ProseMirror schema. Nhược điểm: race condition nếu 2 client cùng join 1 doc empty — cả hai đều cố seed.

**Xử lý race**: dùng Redis lock "seed:<docId>" khi client đầu tiên seed. Clients sau khi join thấy Y.Doc đã có data → bỏ qua bước seed.

Hoặc đơn giản hơn: backend `cbm:api` **pre-warm** — trước khi trả `GET /documents/:id/content`, nếu `draftState` null và doc vừa được mở, gọi 1 headless seed service (worker chạy BlockNote qua jsdom) để khởi tạo `draftState` một lần. Phức tạp.

**Đề xuất MVP**: dùng cơ chế client-seed với Redis lock. Trade-off chấp nhận được.

### 6.3. Commit: draft → markdown

Khi user bấm "Cập nhật":

```
POST /documents/:id/commit
```

Backend `cbm:api`:
1. Check session active qua `DocumentRtcService.isSessionActive(docId)` — nếu không có session, reject với "No active draft"
2. Fetch `draftState` từ Mongo
3. **Server không thể serialize YDoc → markdown** (cùng lý do trên — không có BlockNote server-side)
4. → **Giải pháp**: client là nơi commit. FE sau khi gọi `POST /commit`, tự serialize `editor.blocksToMarkdownLossy()` và gửi kèm:

```
POST /documents/:id/commit
Body: { content: <markdown serialized by client> }
```

Server:
1. Verify session active (để đảm bảo user đang thật sự edit, không phải client custom gọi bậy)
2. Verify caller có write access
3. Overwrite `content = body.content`
4. Clear `draftState = null`, `hasActiveDraft = false`, `draftUpdatedAt = null`
5. Broadcast event qua Hocuspocus: `document:<id> committed` → các client khác biết reset local YDoc, reload markdown mới

Broadcast: qua Redis pub/sub `cbm:api` → `cbm:rtc` → Hocuspocus emit custom awareness message hoặc disconnect clients (client auto-reconnect + re-seed từ markdown mới).

### 6.4. Trade-off của việc "client-serialize markdown"

Rủi ro: client gửi markdown không khớp với YDoc thực. Mitigation:
- Chỉ accept commit request có JWT của user đang kết nối WebSocket (verify qua `doc-session:<id>:<userId>` Redis key)
- Client chạy `editor.blocksToMarkdownLossy()` ngay trước khi gửi — không cho user sửa tay
- Log mọi commit + diff size để detect bất thường

Alternative: chạy BlockNote headless trong worker Node (dùng jsdom + `@blocknote/core`). Khả thi nhưng tốn setup và runtime overhead. **Phase sau** nếu cần server-authoritative commit.

## 7. MCP conflict handling

### 7.1. Flow

Agent qua MCP gọi `updateContent`:

```
[aiwm MCP] → cbm:api PATCH /documents/:id/content (internal)
  ↓
DocumentService.updateContent()
  ↓
Check DocumentRtcService.isSessionActive(docId)?
  ├─ No active session → apply markdown update thẳng vào content, done
  └─ Active session → throw ActiveSessionException
```

### 7.2. Error response

```json
{
  "error": "DOCUMENT_IN_ACTIVE_SESSION",
  "statusCode": 409,
  "message": "Document \"Design Spec v2\" is currently being edited by 2 users in a live collaboration session. Your edit was not applied. Please ask the user to apply your suggestion manually via chat, or retry later when the session ends.",
  "documentId": "507f...",
  "documentTitle": "Design Spec v2",
  "activeUserCount": 2,
  "sessionStartedAt": "2026-04-14T10:23:00Z"
}
```

MCP tool `document-management.update-content` catch error này, trả lại agent dưới dạng tool result có `error.code = 'DOCUMENT_IN_ACTIVE_SESSION'` để agent biết cách xử lý.

### 7.3. Agent instruction template

Trong instruction mặc định của agent (AIWM), thêm guidance:
> Nếu tool `update-content` trả lỗi `DOCUMENT_IN_ACTIVE_SESSION`, đừng retry ngay. Thay vào đó, trả lời user trong chat: giải thích rằng document đang có phiên cộng tác, đưa ra bản đề xuất đầy đủ trong code block để user tự apply, hoặc hỏi user có muốn em chờ xong session để edit tự động không.

### 7.4. Session check performance

`isSessionActive` = 1 Redis EXISTS call, <1ms. Có thể cache in-memory ngắn (1s TTL) nếu tần suất cao.

## 8. FE integration

### 8.1. Dependencies

```
@hocuspocus/provider
y-indexeddb
yjs
```

### 8.2. Provider setup

```typescript
const ydoc = new Y.Doc();
const indexeddbProvider = new IndexeddbPersistence(`doc-${documentId}`, ydoc);

const provider = new HocuspocusProvider({
  url: import.meta.env.VITE_CBM_RTC_URL, // ws://localhost:3014
  name: `document:${documentId}`,
  document: ydoc,
  token: () => getJwtToken(),
});

const editor = useCreateBlockNote({
  collaboration: {
    provider,
    fragment: ydoc.getXmlFragment('document-store'),
    user: {
      name: currentUser.displayName,
      color: getUserColor(currentUser.id),
    },
  },
});
```

BlockNote sẽ tự handle awareness (multi-cursor) và sync.

### 8.3. Initial seed (client)

```typescript
useEffect(() => {
  indexeddbProvider.once('synced', async () => {
    const fragment = ydoc.getXmlFragment('document-store');
    if (fragment.length === 0 && !hasActiveDraft) {
      // Empty doc + no draft on server → seed from content markdown
      const blocks = await editor.tryParseMarkdownToBlocks(initialContent);
      editor.replaceBlocks(editor.topLevelBlocks, blocks);
    }
  });
}, []);
```

Redis lock trong `cbm:rtc`: client đầu tiên gửi update → Hocuspocus persist → clients sau thấy fragment có data → skip seed.

### 8.4. Save button

```typescript
async function handleSave() {
  const markdown = await editor.blocksToMarkdownLossy();
  await api.post(`/documents/${documentId}/commit`, { content: markdown });
  // Server broadcasts committed event → local state auto-refreshes
}
```

Hiển thị `hasActiveDraft` badge khi `draftUpdatedAt > lastCommittedAt`.

### 8.5. Presence indicator

BlockNote collab built-in. Config thêm:
```
renderCursor: (user) => <CursorChip name={user.name} color={user.color} />
```

### 8.6. Offline handling

`y-indexeddb` persist local → user offline vẫn gõ được. Reconnect → Hocuspocus provider tự merge. Hiển thị offline indicator:
```typescript
provider.on('status', ({ status }) => setConnected(status === 'connected'));
```

## 9. Permission hook chi tiết

`onAuthenticate`:
1. Parse JWT
2. Load document from DB
3. Load project if `projectId` exists
4. `assertCanWriteDocument(doc, project, context)` — throws → Hocuspocus rejects connection
5. Return `{ context, docId }` cho các hook sau

Read-only viewer (không có quyền write) → reject connection hoàn toàn trong MVP. Phase sau: cho phép join awareness-only (xem cursor, không edit). Hocuspocus hỗ trợ qua `readOnly` flag trong connection.

Khi project member bị remove giữa session → Hocuspocus không auto-detect. Xử lý: publish Redis event từ `cbm:api` khi update project member → `cbm:rtc` subscribe → force-disconnect user đó.

## 10. API changes summary

### `cbm:api`

```
POST /documents/:id/commit
  Body: { content: string }
  → Commit draft thành content markdown
  → Requires active session + write access + session owner match

GET /documents/:id/content
  → Response thêm field:
    hasActiveDraft: boolean
    draftUpdatedAt: Date | null
    activeEditorCount: number   (from Redis)

PATCH /documents/:id  (existing)
  → Thêm check: nếu hasActiveDraft → reject với "Cannot edit directly while session active, commit first"

Internal route (MCP path):
  updateContent → throw DOCUMENT_IN_ACTIVE_SESSION khi session active
```

### `cbm:rtc`

```
WebSocket /collab/document:<id>
  Authorization: Bearer <jwt>
```

## 11. Scale path

### 11.1. MVP: 1 instance

- `cbm:rtc` chạy 1 replica
- Đủ cho vài trăm concurrent editors
- Single point of failure → crash = user mất connection nhưng `draftState` đã persist, reconnect không mất data

### 11.2. Multi-instance (phase sau)

Hai approach:

**A) Sticky session theo docId:**
- LB (Nginx/Envoy) hash WebSocket URL (`/collab/document:<id>`) → route cố định
- Mỗi instance vẫn quản lý subset docs độc lập, không chia sẻ state
- Đơn giản, scale tuyến tính

**B) Hocuspocus Redis extension:**
- Tất cả instances pub/sub qua Redis → cùng 1 doc có thể trên nhiều instance
- Latency cao hơn (mỗi update bay qua Redis)
- Dùng khi cần HA thật sự

→ Chọn A cho đơn giản, B khi cần HA.

### 11.3. Health check

- `cbm:rtc` expose HTTP `/health` trên cùng port (hoặc port phụ) trả số clients connected + uptime
- Hocuspocus có sẵn stats endpoint

## 12. Testing checklist

### 12.1. Unit
- [ ] `DocumentRtcService.loadYDoc` với draftState + không có draftState
- [ ] `isSessionActive` Redis TTL expire đúng
- [ ] MCP `updateContent` throw `DOCUMENT_IN_ACTIVE_SESSION` khi session active

### 12.2. Integration
- [ ] Hocuspocus server start, connect với JWT hợp lệ → OK
- [ ] JWT sai → reject connect
- [ ] Không có quyền write → reject connect
- [ ] Commit endpoint overwrite content + clear draftState
- [ ] Commit không có session active → reject

### 12.3. E2E
- [ ] 2 browsers cùng mở doc → gõ → thấy cursor và text của nhau
- [ ] Browser 1 offline → gõ → online lại → merge đúng
- [ ] Browser 1 bấm save → browser 2 nhận content mới
- [ ] Reload trang không save → draft vẫn còn
- [ ] Reload trang sau save → hiển thị content mới
- [ ] Agent MCP edit khi session active → agent nhận error → báo lại trong chat
- [ ] Agent MCP edit khi session không active → apply thẳng
- [ ] Server `cbm:rtc` restart → client auto-reconnect → draft khôi phục

## 13. Steps triển khai

### Backend — `cbm:rtc` service

1. [ ] Thêm dependencies `@hocuspocus/server`, `yjs`
2. [ ] Tạo `document-rtc` module với `DocumentRtcService`
3. [ ] Tạo `bootstrap-rtc.ts` + `app-rtc.module.ts`
4. [ ] Config nx target `rtc`, port 3014
5. [ ] Implement hocuspocus hooks (onAuthenticate, onLoadDocument, onStoreDocument, onDisconnect)
6. [ ] Redis session registry (mark active, TTL refresh, idle cleanup)
7. [ ] Unit + integration test với Hocuspocus test client

### Backend — `cbm:api` changes

8. [ ] Implement thực `POST /documents/:id/commit` (thay stub của Plan #2)
9. [ ] Update `GET /documents/:id/content` trả thêm draft status
10. [ ] Update `DocumentService.updateContent` throw `ActiveSessionException`
11. [ ] Global exception filter handle code `DOCUMENT_IN_ACTIVE_SESSION` → 409
12. [ ] Pub/sub Redis commit event → `cbm:rtc` broadcast
13. [ ] MCP tool `document-management` wrapper trả structured error cho agent

### Frontend

14. [ ] Install `@hocuspocus/provider`, `yjs`, `y-indexeddb`
15. [ ] Component `<CollabDocumentEditor>` với BlockNote collaboration
16. [ ] Initial seed logic với Redis lock cooperation (client-side check)
17. [ ] Save button → `blocksToMarkdownLossy` → commit API
18. [ ] Draft badge + active editor count indicator
19. [ ] Offline/reconnect UI states
20. [ ] Force-disconnect handler khi mất quyền giữa session

### AIWM

21. [ ] Cập nhật MCP tool executor map error 409 → tool result với structured error
22. [ ] Update agent instruction template handle `DOCUMENT_IN_ACTIVE_SESSION`

### DevOps

23. [ ] Update `docs/PORT-ALLOCATION.md` thêm port 3014/3344
24. [ ] Thêm `cbm:rtc` vào docker-compose dev
25. [ ] Nginx/LB config route `/collab/*` → cbm-rtc upstream
26. [ ] Health check + restart policy cho `cbm:rtc`

## 14. Rủi ro & mitigation

| Rủi ro | Mức độ | Mitigation |
|---|---|---|
| Client-serialize markdown không khớp YDoc | Cao | JWT-based session verify; log diff; phase sau chuyển sang server-side serialize với jsdom |
| Race condition client-seed đầu tiên | Trung bình | Redis lock `seed:<docId>`; client check fragment length trước khi seed |
| `cbm:rtc` crash → user mất connection | Trung bình | draftState persist mỗi update → reconnect không mất data; setup restart policy |
| `draftState` phình to | Trung bình | Hocuspocus GC bật; set giới hạn 5MB/doc; force-flush nếu vượt |
| MCP conflict error làm agent stuck | Trung bình | Instruction template hướng agent fallback gracefully; user luôn có option apply thủ công |
| Stale session (client crash, không disconnect) | Thấp | Redis TTL 10 phút + awareness timeout; background cleanup |
| Permission revoke giữa session | Thấp | Pub/sub từ cbm:api → cbm:rtc force-disconnect |
| Cost scale với nhiều docs concurrent | Trung bình | MVP 1 instance đủ; monitor RAM usage; scale theo sticky-session khi cần |

## 15. Câu hỏi mở

- Read-only viewer có cần join awareness không? — phase sau, MVP reject.
- Draft lifetime limit? Có nên auto-cleanup draft cũ >30 ngày không? — đề xuất có cron job.
- Commit có cần "autosave draft → content" định kỳ để tránh mất edit nếu user quên save không? — **Không theo anh đã chốt**: chỉ save khi user bấm. Cập nhật nếu UX thực tế cần đổi.
- Có cần operation log (ai làm gì lúc nào) để audit không? — phase sau.
- Agent có thể "watch" document session để nhận notify khi user ask, hay user phải chủ động push selection vào chat? — Plan #2 chỉ làm push chủ động; watch phase sau.

---

## Phụ lục — Decision log

| Quyết định | Lý do |
|---|---|
| Tách `cbm:rtc` mode riêng | LB HTTP stateless xung đột với Yjs stateful |
| Client-side serialize markdown khi commit | Server không chạy BlockNote/ProseMirror; trade-off chấp nhận |
| Agent không tham gia Yjs session | Đơn giản, tránh race; agent là trợ lý qua chat |
| MCP conflict: reject, không buffer | Anh chốt hướng 1 (reject) |
| Save manual, không autosave vào content | Anh chốt: chỉ `draftState` autosave, `content` chỉ thay đổi khi bấm save |
| 1 Hocuspocus instance cho MVP | Đủ nhu cầu, scale sau qua sticky session |
| Field name `draftState` (không phải `contentYdoc`) | Tên ngữ nghĩa, không lộ implementation |
