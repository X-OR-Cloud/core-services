# Plan #2 — Document Notion-lite (Editor + Mention + Attachments)

**Service:** CBM
**Status:** Draft — chờ duyệt
**Phụ thuộc:** Plan #1 (File Module) phải deploy trước
**Phụ thuộc bởi:** Plan #3 (Realtime Collaboration)

---

## 1. Mục tiêu

Biến `document` module thành trải nghiệm soạn thảo nhẹ nhàng kiểu Notion, thân thiện cho cả user và agent:

- **User**: editor rich text với table, ảnh/video đính kèm, mention resource (`@document`, `@work`, `@project`, `@user`), slash command.
- **Agent trợ lý (qua chat widget)**: user select text trong editor → push vào chat box như reference → agent gợi ý → user apply.
- **Agent MCP (độc quyền)**: tiếp tục thao tác trực tiếp qua `updateContent` ops hiện có trên markdown. Không đụng realtime session.
- **Frontend editor**: BlockNote (React), markdown là content format chính.

**Plan này KHÔNG bao gồm** real-time multi-user collab (thuộc Plan #3). Plan này đảm bảo nền tảng editor + data model sẵn sàng cho Plan #3 plug vào.

## 2. Phạm vi

### Trong phạm vi
- Mở rộng `document.schema.ts` (field `attachments`, `mentions` metadata, `draftState` placeholder, `hasActiveDraft`)
- Chọn và chuẩn hoá markdown dialect (GFM + custom inline nodes)
- Quy ước serialize/deserialize cho attachment và mention
- Endpoint attachment: delegate sang `/files?purpose=attachment&ownerKind=document`
- Endpoint commit draft: `POST /documents/:id/commit` (dùng sau khi Plan #3 enable draft)
- Cập nhật `updateContent` ops để không làm vỡ mention syntax
- Frontend integration guide: BlockNote setup, custom inline content cho `@mention`, markdown serializer/parser, slash menu, bubble menu "Ask AI" → push selection vào chat widget
- Backend document của "document-selection" reference type cho chat widget (AIWM)

### Ngoài phạm vi
- Yjs, Hocuspocus, multi-cursor, draft persistence thực sự — **Plan #3**
- Version history dài hạn — phase sau
- Document templates, database view, embed external — phase sau
- Inline comment / suggestion mode — phase sau

## 3. Schema thay đổi

### 3.1. `document.schema.ts` mở rộng

```typescript
@Schema({ timestamps: true })
export class Document extends BaseSchema {
  @Prop({ required: true, maxlength: 500 })
  summary!: string;

  @Prop({ required: true })
  content!: string;                  // markdown (source of truth)

  @Prop({ required: true, enum: ['markdown', 'html', 'text', 'json'], default: 'markdown' })
  type!: string;                     // NEW default 'markdown'; legacy types giữ để đọc cũ

  @Prop({ type: [String], default: [] })
  labels!: string[];

  @Prop({ enum: ['draft', 'published', 'archived'], default: 'draft' })
  status?: string;

  @Prop({ type: String }) projectId?: string;

  @Prop({ enum: ['private', 'organization'], default: 'private' })
  shareMode?: string;

  // ── Knowledge Base (existing) ──
  @Prop({ type: Boolean, default: false }) embeddingEnabled?: boolean;
  @Prop({ type: String }) knowledgeCollectionId?: string;
  @Prop({ enum: ['pending', 'processing', 'ready', 'error'], default: null }) embeddingStatus?: string | null;

  // ── NEW: Attachments index ──
  @Prop({
    type: [{
      fileId: { type: String, required: true },   // reference to files collection
      kind: { type: String, enum: ['image', 'video', 'file'], required: true },
      placeholder: { type: String, required: true }, // e.g. "file:507f..."
    }],
    default: [],
    _id: false,
  })
  attachments!: Array<{ fileId: string; kind: string; placeholder: string }>;
  // Lý do lưu array: để query "document nào đang reference file X", và để cascade soft-delete
  // khi xoá document. Nội dung thật vẫn ở trong content markdown — array này chỉ là index.

  // ── NEW: Mentions index ──
  @Prop({
    type: [{
      kind: { type: String, enum: ['document', 'work', 'project', 'user', 'knowledge-collection'], required: true },
      id: { type: String, required: true },
    }],
    default: [],
    _id: false,
  })
  mentions!: Array<{ kind: string; id: string }>;
  // Cũng là index phụ, derive từ content khi save. Phục vụ "backlinks" và notification.

  // ── NEW: Draft state (Plan #3 sẽ dùng) ──
  @Prop({ type: Buffer, default: null })
  draftState?: Buffer | null;          // Yjs binary, null = no active draft

  @Prop({ type: Date, default: null })
  draftUpdatedAt?: Date | null;

  @Prop({ type: Boolean, default: false })
  hasActiveDraft!: boolean;            // convenience flag for UI badge
}
```

### 3.2. Indexes bổ sung

```typescript
DocumentSchema.index({ 'attachments.fileId': 1 });
DocumentSchema.index({ 'mentions.kind': 1, 'mentions.id': 1 });
DocumentSchema.index({ hasActiveDraft: 1 });
```

### 3.3. Migration

- Field mới mặc định `[]` / `null` / `false` → không cần migration data.
- Document hiện có với `type='html'|'text'|'json'` giữ nguyên, hiển thị read-only. Nút "Convert to markdown" cho user chuyển đổi (MVP có thể chỉ hỗ trợ edit cho `type='markdown'`).

## 4. Markdown dialect

### 4.1. Base
- **GFM** (GitHub Flavored Markdown): heading, list, bold/italic, code, table, checkbox, strikethrough.
- Frontmatter: không dùng.

### 4.2. Attachment syntax

```markdown
![alt text](file:507f1f77bcf86cd799439011)
```

- Scheme `file:<fileId>` thay cho URL thật
- FE render: lookup `attachments` array → gọi `GET /files/:id/url` → hiển thị
- Video syntax: tái dùng image syntax nhưng BlockNote phân biệt qua MIME type lookup. Hoặc dùng block custom:
  ```markdown
  ![video](file:<id>)
  ```
  và dựa vào `attachments[].kind === 'video'` để chọn renderer.
- Ưu điểm: serialize ra plain markdown, agent MCP đọc được, copy-paste sang editor khác vẫn hiện text alt. Không hard-code URL expired.

### 4.3. Mention syntax

```markdown
[Design Spec v2](@document:507f191e810c19729de860ea)
[Work #123: Fix login](@work:507f191e810c19729de860eb)
[Project Hydra](@project:507f191e810c19729de860ec)
[@Tony Hoang](@user:507f191e810c19729de860ed)
```

- Scheme `@<kind>:<id>` trong URL field của markdown link
- Link text là snapshot tên tại thời điểm mention (không tự update khi resource đổi tên — đơn giản, predictable)
- FE render: detect URL prefix `@document:` / `@work:` / ... → render chip màu theo kind, click → navigate. Hover → fetch resource preview (lazy).
- Lợi ích: vẫn là valid markdown, agent đọc thấy cả tên + id; không cần custom AST.

### 4.4. Task/checkbox
- GFM checkbox: `- [ ]` / `- [x]`
- Phase sau: liên kết với work item qua mention `- [ ] [Work title](@work:<id>)`.

### 4.5. Table
- GFM table. BlockNote có table block sẵn. Cell chỉ hỗ trợ inline text (không nested block) — chấp nhận giới hạn MVP.

## 5. Module layout thay đổi

```
services/cbm/src/modules/document/
├── document.schema.ts         (mở rộng)
├── document.service.ts        (thêm extract mentions/attachments từ content khi save)
├── document.controller.ts     (thêm /commit endpoint)
├── document.dto.ts
├── markdown/
│   ├── extract-references.ts  // parse content → { mentions, attachments }
│   └── sanitize.ts            // optional: strip unsafe links
└── README.md
```

## 6. Service logic thay đổi

### 6.1. `DocumentService.create` / `update`

Mỗi khi `content` thay đổi:
1. Parse content → extract mention/attachment references (regex-based, không cần full AST cho MVP)
2. Validate tất cả `file:<id>` tham chiếu tới File thật cùng org và `purpose='attachment'` và `ownerRef={kind:'document', id:<this doc>}` (hoặc `ownerRef` chưa gán → gán ngay)
3. Validate mention `@<kind>:<id>` tồn tại + user có quyền view. Nếu không → cảnh báo nhưng vẫn lưu (markdown là text, không fail hard).
4. Cập nhật `attachments` + `mentions` arrays

### 6.2. `updateContent` (MCP path) giữ nguyên

Các ops hiện có (`replace`, `find-replace-markdown`, `append-to-section`, ...) vẫn hoạt động trên string. Sau khi update, trigger extract references (mục 6.1) để giữ attachments/mentions sync. Thêm post-hook trong `updateContent`.

### 6.3. Cascade khi soft-delete document

- Mark tất cả `attachments[].fileId` files với `isDeleted=true` (qua `FileService.softDeleteMany`).
- Không đụng files `purpose='knowledge'` dù có liên kết.

### 6.4. Attachment upload endpoint

```
POST /documents/:id/attachments
Content-Type: multipart/form-data
Body: { file: <binary>, kind: 'image' | 'video' | 'file' }

Response: {
  fileId, placeholder: "file:<fileId>", url: <signed URL>, kind, width?, height?
}
```

Thực chất là wrapper mỏng delegate sang `POST /files` với:
- `purpose='attachment'`
- `ownerKind='document'`, `ownerId=<docId>`
- Validate user có quyền write document

FE chèn `![alt](file:<fileId>)` vào editor tại cursor.

### 6.5. Commit draft (stub cho Plan #3)

```
POST /documents/:id/commit
```

MVP Plan #2: endpoint tồn tại nhưng chỉ trả `{ hasActiveDraft: false }` vì chưa có Yjs. Plan #3 sẽ implement thực. Tạo trước để FE có contract ổn định.

### 6.6. Get with draft status

`GET /documents/:id/content` response thêm:
```json
{
  ...existing,
  "hasActiveDraft": false,
  "draftUpdatedAt": null
}
```

## 7. Frontend integration

### 7.1. Editor: BlockNote

- Lib: `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine` (hoặc shadcn-compatible theme)
- Khởi tạo: load markdown từ `GET /documents/:id/content` → `editor.tryParseMarkdownToBlocks(content)`
- Save: `editor.blocksToMarkdownLossy()` → `PATCH /documents/:id` với `{ content }`

### 7.2. Custom inline content: Mention

Dùng [Custom Inline Content API](https://www.blocknotejs.org/docs/features/custom-schemas/custom-inline-content):

```typescript
const Mention = createReactInlineContentSpec(
  {
    type: 'mention',
    propSchema: {
      kind: { default: 'document' },
      id: { default: '' },
      label: { default: '' },
    },
    content: 'none',
  },
  { render: (props) => <MentionChip {...props.inlineContent.props} /> },
);
```

Suggestion menu: trigger `@` → fetch `GET /search/mentionable?q=<text>&kind=document,work,project,user` → user chọn → insert Mention node.

Serialize → markdown: `[label](@kind:id)`. Parser (lúc load): regex `\[([^\]]+)\]\(@(\w+):([a-f0-9]+)\)` → Mention node.

### 7.3. Custom block: Attachment (ảnh/video)

BlockNote có image block sẵn. Mở rộng:
- Upload handler → `POST /documents/:id/attachments`
- Thay URL bằng `file:<fileId>` khi save markdown
- Khi render: fetch signed URL lần đầu, cache theo TTL

Video dùng block custom tương tự image, render bằng `<video>` tag với poster = `posterKey` signed URL.

### 7.4. Slash menu

Default items (BlockNote có sẵn): heading, paragraph, list, checkbox, table, image, code.
Thêm:
- "Insert mention" → mở suggestion picker
- "Upload video" → file input → upload → insert video block
- "Insert work reference" → shortcut mention work

### 7.5. Bubble menu: "Ask AI"

Khi user select text, BlockNote BubbleMenu hiện nút "Ask AI". Click →

```typescript
globalChatStore.addReference({
  kind: 'document-selection',
  documentId,
  documentTitle,
  selectionText,
  selectionRange: { from, to },  // BlockNote text cursor positions
});
globalChatStore.open();
```

Chat widget hiển thị chip "📄 <documentTitle>: <selection preview>" trong chat box. User gõ prompt → gửi agent như bình thường.

### 7.6. Apply agent suggestion

Khi agent trả response trong chat, nếu response chứa **action hint** (structured markdown/JSON block với format định trước), chat widget render nút "Apply":

```json
{
  "action": "replace-selection",
  "documentId": "...",
  "selectionRange": { "from": 123, "to": 456 },
  "newText": "..."
}
```

User bấm Apply → FE gọi BlockNote API `editor.replaceRange(range, parseMarkdown(newText))`. Ở Plan #2 không có Yjs, lưu qua `PATCH /documents/:id`. Plan #3 sẽ apply trực tiếp qua Yjs transaction.

### 7.7. Mobile / read-only fallback

- Read-only mode: BlockNote `editable={false}`, markdown parse như bình thường.
- Mobile: BlockNote hoạt động OK trên mobile web; native app (nếu có) cần WebView hoặc markdown renderer riêng.

## 8. AIWM integration — reference kind mới

### 8.1. `document-selection` reference

Chat widget gửi message với attachments chứa reference:

```json
{
  "type": "document-selection",
  "documentId": "...",
  "documentTitle": "Design Spec",
  "selectionText": "...",
  "selectionRange": { "from": 123, "to": 456 },
  "surroundingContext": "... before ... {SELECTION} ... after ..."
}
```

AIWM agent context builder cần:
- Nhận diện reference kind `document-selection`
- Inject vào prompt agent theo format:
  ```
  User is editing document "Design Spec" and has selected:
  ---
  <selectionText>
  ---
  Surrounding context (for reference):
  <surroundingContext>
  ```
- Hướng dẫn agent trả response dưới dạng có thể apply được (structured action hint).

### 8.2. Agent system prompt bổ sung

Thêm vào instruction của agent (qua AIWM instruction module):
> Khi user gửi reference `document-selection`, anh nên trả lời concise, đưa ra bản text mới trong code block kèm structured action JSON để frontend hiển thị nút Apply. Không tự sửa document — user quyết định apply hay không.

Cụ thể format agent response sẽ được tinh chỉnh qua iteration, không hard-code trong BE.

## 9. Access control — không thay đổi

Tái dùng `assertCanWriteDocument`, `canViewPrivateDocument` hiện có. Chỉ bổ sung:

- Attachment upload → cần quyền write document (check qua `assertCanWriteDocument`)
- Mention `@user:<id>` không yêu cầu quyền đặc biệt (chỉ là text)
- Mention `@document:<id>` / `@work:<id>` → không block khi save, nhưng render chip có thể "privileged preview only" nếu user không có quyền view resource đó

## 10. Testing checklist

### 10.1. Unit
- [ ] `extract-references.ts` parse content → mentions/attachments đúng
- [ ] Regex không match false positive (URL thường, markdown escape)
- [ ] `updateContent` giữ nguyên mention/attachment syntax sau mỗi op
- [ ] Cascade soft-delete document → file attachments

### 10.2. Integration
- [ ] `POST /documents/:id/attachments` upload + chèn placeholder
- [ ] `PATCH /documents/:id` với content có mention → `mentions` array cập nhật
- [ ] MCP `updateContent` find-replace-markdown vẫn giữ attachments index sync
- [ ] `GET /documents/:id/content` trả đúng `hasActiveDraft=false`

### 10.3. Frontend E2E
- [ ] Gõ `@` → suggestion menu hiện → chọn document → chip render đúng
- [ ] Upload ảnh qua slash menu → hiển thị qua signed URL
- [ ] Bôi đen text → "Ask AI" → chat widget nhận chip
- [ ] Save document → reload → mention + attachment hiển thị lại đúng

## 11. Steps triển khai

### Backend

1. [ ] Mở rộng `document.schema.ts` với fields mới (attachments, mentions, draftState, hasActiveDraft)
2. [ ] Viết `markdown/extract-references.ts` + unit test
3. [ ] Cập nhật `DocumentService.create/update/updateContent` gọi extract-references
4. [ ] Thêm endpoint `POST /documents/:id/attachments` delegate sang FileService
5. [ ] Thêm endpoint `POST /documents/:id/commit` (stub trả về no-op)
6. [ ] Cập nhật `GET /documents/:id/content` response shape
7. [ ] Cascade soft-delete attachments
8. [ ] Update Swagger + `docs/cbm/document/FRONTEND-API.md`

### Frontend

9. [ ] Install BlockNote + dependencies
10. [ ] Component `<DocumentEditor>` với BlockNote instance
11. [ ] Markdown load/save I/O
12. [ ] Custom Mention inline content + suggestion menu
13. [ ] Image/video block với upload handler
14. [ ] Signed URL resolver + cache
15. [ ] Slash menu customization
16. [ ] Bubble menu "Ask AI" button → push reference vào global chat store
17. [ ] Chat widget: thêm reference type `document-selection`
18. [ ] Chat message renderer: parse action hint → nút Apply → gọi BlockNote replaceRange

### AIWM

19. [ ] Context builder nhận diện `document-selection` reference
20. [ ] Document hoá format response cho agent (trong AIWM instruction docs)
21. [ ] (Optional) Seed instruction template cho agent "document assistant"

### QA

22. [ ] Chạy regression test cho MCP document-management tools
23. [ ] E2E smoke test editor flow
24. [ ] Verify access control cho attachment view/upload

## 12. Rủi ro & mitigation

| Rủi ro | Mức độ | Mitigation |
|---|---|---|
| BlockNote markdown serializer lossy | Trung bình | Fix dialect rõ (mục 4), viết test round-trip, có fallback raw markdown editor cho doc bị lỗi |
| Mention regex false positive với URL thật | Trung bình | Scheme `@kind:id` rất đặc thù, regex strict |
| Agent MCP `updateContent` vô tình phá mention syntax | Cao | Test coverage kỹ cho từng op, post-hook validate mentions còn nguyên |
| File attachment signed URL lộ ra public | Thấp | TTL ngắn (1h), org-scoped access check trước khi presign |
| FE performance với doc lớn (100KB+ markdown) | Trung bình | BlockNote virtualize, lazy load ảnh, giới hạn mention preview hover |
| Migration doc `type='html'/'json'` | Thấp | MVP chỉ cho edit `type='markdown'`, cái cũ read-only + nút convert optional |

## 13. Câu hỏi mở

- Khi user mention `@work:<id>` có cần auto-subscribe notification cho work đó không? — phase sau.
- Mention label có nên auto-refresh khi resource đổi tên không? — đề xuất không, giữ snapshot. Có thể có nút "refresh mention labels" cho user.
- Có cần unfurl link thường (OG preview) như Slack không? — phase sau.
- `hasActiveDraft` badge nằm ở đâu trong UI — trong editor header hay trong list view document? — cả hai, FE tự quyết định.
