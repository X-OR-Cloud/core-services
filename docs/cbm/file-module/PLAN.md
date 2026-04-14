# Plan #1 — File Module (Shared File Storage)

**Service:** CBM
**Status:** Draft — chờ duyệt
**Phụ thuộc:** Không (tiền đề cho Plan #2 Document Notion-lite)
**Phụ thuộc bởi:** Plan #2 (document attachment), tương lai: avatar, project cover, work attachment

---

## 1. Mục tiêu

Nâng cấp module `knowledge-file` hiện tại thành module `file` dùng chung cho toàn CBM. File có thể đóng nhiều vai trò (purpose): `knowledge` (nguồn RAG), `attachment` (đính kèm document), và mở rộng sau (`avatar`, `cover`, ...).

Đồng thời:
- Chuyển storage từ local disk (`KB_STORAGE_PATH`) sang **S3** (đã có sẵn trong hạ tầng).
- Giữ 100% backwards compatibility với các endpoint `/knowledge-files/*` hiện có.
- Không ảnh hưởng pipeline indexing RAG hiện tại (knowledge-worker, chunking, embedding).

## 2. Phạm vi

### Trong phạm vi
- Đổi tên module: `knowledge-file` → `file`
- Đổi tên collection: `knowledge_files` → `files` (kèm migration)
- Thêm `purpose` field + `ownerRef` field
- Chuyển `filePath` local disk → S3 key
- Thêm `S3Service` trong `knowledge-shared` (hoặc module mới `storage-shared`)
- Endpoint mới: generic upload `POST /files` + signed URL resolver `GET /files/:id/url`
- Giữ alias routes `/knowledge-files/*` trỏ về service mới
- Migration script cho dữ liệu hiện có

### Ngoài phạm vi
- Không đụng đến logic parsing (pdf-parse, mammoth, OCR) — giữ nguyên.
- Không đổi pipeline knowledge-worker.
- Không implement attachment endpoint chi tiết (thuộc Plan #2).
- Không delete file vật lý trên S3 khi soft-delete (giữ để có thể undelete).

## 3. Schema thay đổi

### 3.1. Collection mới: `files`

```typescript
@Schema({ timestamps: true, collection: 'files' })
export class File extends BaseSchema {
  // ── Identification ──
  @Prop({ required: true, maxlength: 500 })
  name!: string;                    // display name

  @Prop({ required: true })
  fileName!: string;                // original filename

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ type: Number, default: 0 })
  fileSize!: number;

  // ── Storage ──
  @Prop({ required: true, enum: ['s3', 'local'], default: 's3' })
  storageKind!: string;

  @Prop({ required: true })
  storageKey!: string;              // S3 object key (replaces filePath)

  @Prop({ type: String })
  storageBucket?: string;           // for multi-bucket setups

  // ── Purpose & ownership ──
  @Prop({ required: true, enum: ['knowledge', 'attachment', 'avatar', 'cover', 'other'], default: 'other' })
  purpose!: string;

  @Prop({
    type: {
      kind: { type: String, enum: ['knowledge-collection', 'document', 'work', 'project', 'user', 'organization'] },
      id: { type: String },
    },
    _id: false,
  })
  ownerRef?: { kind: string; id: string };
  // Examples:
  //   purpose='knowledge'   → ownerRef={ kind: 'knowledge-collection', id: '...' }
  //   purpose='attachment'  → ownerRef={ kind: 'document', id: '...' }
  //   purpose='avatar'      → ownerRef={ kind: 'user', id: '...' }

  // ── RAG-specific fields (only used when purpose='knowledge') ──
  @Prop({ type: String })
  rawContent?: string;

  @Prop({ enum: ['pending', 'processing', 'ready', 'error'], default: null })
  embeddingStatus?: string | null;  // null = not applicable

  @Prop({ type: String })
  errorMessage?: string;

  @Prop({ type: Number, default: 0 })
  chunkCount?: number;

  // ── Attachment-specific fields (only used when purpose='attachment') ──
  @Prop({ type: Number }) width?: number;   // for images/videos
  @Prop({ type: Number }) height?: number;
  @Prop({ type: String }) posterKey?: string; // video thumbnail S3 key

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
}
```

### 3.2. Indexes

```typescript
FileSchema.index({ purpose: 1, 'ownerRef.kind': 1, 'ownerRef.id': 1, isDeleted: 1 });
FileSchema.index({ 'owner.orgId': 1, isDeleted: 1 });
FileSchema.index({ embeddingStatus: 1 });      // for knowledge-worker polling
FileSchema.index({ createdAt: -1 });
```

### 3.3. Virtual aliases (backwards compat)

Để code cũ đọc `collectionId` không vỡ:

```typescript
FileSchema.virtual('collectionId').get(function () {
  return this.ownerRef?.kind === 'knowledge-collection' ? this.ownerRef.id : undefined;
});

FileSchema.virtual('filePath').get(function () {
  return this.storageKey; // legacy alias
});
```

## 4. Module layout

```
services/cbm/src/modules/file/
├── file.module.ts
├── file.schema.ts
├── file.service.ts              // CRUD + S3 upload/delete/signed URL
├── file.controller.ts           // New: POST/GET /files, GET /files/:id/url
├── file.dto.ts
├── legacy/
│   └── knowledge-file.controller.ts   // Alias: /knowledge-files/* → file.service
└── index.ts

services/cbm/src/modules/storage-shared/   // NEW
├── storage-shared.module.ts
├── s3.service.ts                // upload/delete/presign, configured via env
└── index.ts
```

`knowledge-worker` và `knowledge-chunk` import `FileService` thay vì `KnowledgeFileService`. Alias `KnowledgeFileService = FileService` giữ tạm 1 release rồi gỡ.

## 5. S3 integration

### 5.1. Environment variables (mới)

```
CBM_S3_ENDPOINT=https://s3.amazonaws.com       # or MinIO endpoint
CBM_S3_REGION=us-east-1
CBM_S3_BUCKET=hydra-cbm
CBM_S3_ACCESS_KEY=...
CBM_S3_SECRET_KEY=...
CBM_S3_PRESIGN_EXPIRES=3600                    # seconds
```

### 5.2. S3 key convention

```
{orgId}/{purpose}/{yyyy}/{mm}/{fileId}_{sanitizedFileName}

Examples:
  org-abc/knowledge/2026/04/507f1f77bcf86cd799439011_report.pdf
  org-abc/attachment/2026/04/507f191e810c19729de860ea_screenshot.png
```

### 5.3. `S3Service` API

```typescript
class S3Service {
  upload(buffer: Buffer, key: string, mimeType: string): Promise<{ key: string; bucket: string }>;
  delete(key: string): Promise<void>;
  presignGetUrl(key: string, expiresIn?: number): Promise<string>;
  presignPutUrl(key: string, mimeType: string, expiresIn?: number): Promise<string>;
  getStream(key: string): Promise<Readable>;     // for server-side processing (pdf parse)
}
```

SDK: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.

### 5.4. Legacy local disk fallback

Trong thời gian migration, `S3Service` có thể hoạt động ở 2 mode:
- `CBM_STORAGE_DRIVER=s3` (mặc định mới)
- `CBM_STORAGE_DRIVER=local` (fallback — cho dev nhanh)

Schema vẫn lưu `storageKind: 's3' | 'local'` để đọc đúng driver.

## 6. API — endpoints mới

### 6.1. Generic upload

```
POST /files
Content-Type: multipart/form-data
Body: {
  file: <binary>,
  purpose: 'knowledge' | 'attachment' | 'avatar' | 'cover' | 'other',
  ownerKind?: 'knowledge-collection' | 'document' | 'work' | 'project' | 'user' | 'organization',
  ownerId?: string,
  name?: string
}

Response: {
  id, name, fileName, mimeType, fileSize,
  purpose, ownerRef, storageKind,
  url: string       // short-lived presigned GET URL (convenience)
}
```

Logic:
- `purpose='knowledge'` → set `embeddingStatus='pending'`, worker sẽ pick up
- `purpose='attachment'` → `embeddingStatus=null`
- `purpose='avatar'` → validate MIME là image
- Validate MIME theo purpose (knowledge chấp nhận pdf/docx/..., attachment chấp nhận image/video/..., avatar chỉ image)

### 6.2. Signed URL resolver

```
GET /files/:id/url
Response: { url: string, expiresAt: number }
```

Dùng cho FE render image/video trong markdown (`![alt](file:<id>)` → FE fetch URL tạm).
Cache client-side ~50% TTL để giảm round-trip.

### 6.3. List by owner (tiện cho UI)

```
GET /files?purpose=attachment&ownerKind=document&ownerId=<docId>
```

Dùng `parseQueryString` thông thường. Kèm access control check (xem mục 7).

### 6.4. Delete

```
DELETE /files/:id
```

Soft delete (không xoá S3 object), reuse logic knowledge-file hiện tại.

### 6.5. Legacy endpoints (giữ nguyên)

```
POST /knowledge-files/upload      → delegate: file.service.upload(purpose='knowledge', ...)
GET  /knowledge-files              → delegate: file.service.findAll({ purpose: 'knowledge' })
GET  /knowledge-files/:id
DELETE /knowledge-files/:id
POST /knowledge-files/:id/reindex
```

Alias controller giữ response shape cũ (`collectionId`, `filePath`, không có `purpose`) để FE hiện tại không vỡ.

## 7. Access control

### 7.1. Upload

- Yêu cầu JWT
- `purpose='knowledge'` → phải có quyền write collection (reuse logic knowledge-collection hiện tại)
- `purpose='attachment'` + `ownerKind='document'` → phải có quyền write document (reuse `assertCanWriteDocument`)
- `purpose='avatar'` + `ownerKind='user'` → chỉ chính user đó hoặc super-admin

### 7.2. View / signed URL

- File của org nào chỉ user cùng org mới xem được
- `purpose='attachment'` + document → user phải view được document (reuse logic document view)
- `purpose='avatar'` → public trong org
- Super-admin luôn xem được

Helper mới: `fileAccessResolver(file, context, purpose)` tra quyền theo `ownerRef`.

### 7.3. Delete

- Creator của file (`createdBy`) hoặc có write quyền trên `ownerRef` → OK
- Khi delete document → cascade mark attachment files `isDeleted=true` (Plan #2 sẽ xử lý chi tiết).

## 8. Migration

### 8.1. Data migration

```typescript
// scripts/migrate-knowledge-files-to-files.ts
// 1. Rename collection: knowledge_files → files (bulk copy nếu Mongo không hỗ trợ rename)
// 2. Cho mỗi doc:
//    - purpose: 'knowledge'
//    - ownerRef: { kind: 'knowledge-collection', id: doc.collectionId }
//    - storageKind: 'local'   (cho tới khi S3 migration chạy)
//    - storageKey: doc.filePath
// 3. Giữ field legacy collectionId/filePath 1 release rồi drop trong migration tiếp theo.
```

Migration script là **idempotent** — rerun an toàn. Chạy trong downtime window ngắn hoặc background với feature flag.

### 8.2. Storage migration (local → S3)

Script riêng, chạy sau khi data migration ổn định:

```typescript
// scripts/migrate-local-to-s3.ts
// - List files có storageKind='local'
// - Đọc file từ disk, upload lên S3 với key convention mới
// - Update storageKind='s3', storageKey=<new key>, storageBucket=<bucket>
// - Giữ file local thêm N ngày rồi xoá
```

### 8.3. Rollback plan

- Giữ collection `knowledge_files` làm backup snapshot trước migration (rename thành `knowledge_files_backup`)
- Script migrate có flag `--dry-run`
- Nếu lỗi sau deploy → revert code (alias controller vẫn đọc collection `files` hoặc fallback về `knowledge_files_backup`)

## 9. Impact analysis

### 9.1. Modules ảnh hưởng trong CBM

| Module | Impact | Xử lý |
|---|---|---|
| `knowledge-file` | Đổi tên → `file` | Viết lại + alias |
| `knowledge-chunk` | Import `KnowledgeFile` | Đổi import → `File`, giữ alias type |
| `knowledge-worker` | Poll `pending` files | Thêm filter `purpose='knowledge'` |
| `knowledge-collection` | Gọi `KnowledgeFileService.updateStats` | Đổi sang `FileService` |
| `document` | Chưa dùng file | Plan #2 sẽ integrate |

### 9.2. MCP tools

- `cbm/knowledge-base/tools.ts` có tool `upload-knowledge-file` → vẫn hoạt động (gọi endpoint legacy). Sau 1 release, cập nhật để dùng endpoint mới với `purpose='knowledge'`.

### 9.3. Các service khác

- `aiwm`, `iam`, `noti`, `mona`, `aivp`, `dgt` không phụ thuộc knowledge-file → không ảnh hưởng.

## 10. Testing checklist

### 10.1. Unit
- [ ] `S3Service.upload/delete/presign` với MinIO test container
- [ ] `FileService.create` với từng `purpose` + access check
- [ ] Virtual `collectionId`/`filePath` trả về giá trị đúng
- [ ] Migration script trên fixture

### 10.2. Integration
- [ ] `POST /files` mỗi purpose, validate access
- [ ] `POST /knowledge-files/upload` (legacy) vẫn trả response shape cũ
- [ ] `GET /files/:id/url` signed URL fetch được file
- [ ] Knowledge-worker pick up file mới với `purpose='knowledge'`
- [ ] Soft delete không xoá S3 object, nhưng `GET /files/:id/url` trả 404

### 10.3. E2E
- [ ] Upload file qua `/knowledge-files/upload` → worker → chunks → RAG query (regression)
- [ ] Upload attachment qua `/files?purpose=attachment` → GET signed URL → render
- [ ] Migration script trên snapshot prod staging

## 11. Steps triển khai (micro-tasks)

1. [ ] Tạo `storage-shared` module với `S3Service` (MVP: upload, delete, presignGet) + unit test với MinIO
2. [ ] Thêm env vars + config trong `@hydrabyte/shared`
3. [ ] Tạo `file.schema.ts` với fields mới
4. [ ] Tạo `file.service.ts` — CRUD + S3 integration, copy logic `knowledge-file.service.ts`
5. [ ] Tạo `file.controller.ts` với endpoints generic
6. [ ] Tạo `legacy/knowledge-file.controller.ts` alias
7. [ ] Cập nhật `knowledge-worker` filter `purpose='knowledge'`
8. [ ] Cập nhật `knowledge-chunk`, `knowledge-collection` import
9. [ ] Viết migration script `migrate-knowledge-files-to-files.ts`
10. [ ] Viết migration script `migrate-local-to-s3.ts`
11. [ ] Chạy migration trên staging, verify RAG pipeline regression
12. [ ] Update Swagger docs + `docs/cbm/knowledge-base/API.md`
13. [ ] Deploy production với feature flag `CBM_STORAGE_DRIVER`
14. [ ] Sau 1 release ổn định: drop alias `KnowledgeFileService`, drop virtual fields legacy

## 12. Rủi ro & mitigation

| Rủi ro | Mức độ | Mitigation |
|---|---|---|
| Migration script lỗi giữa chừng | Cao | Idempotent + backup collection + dry-run |
| Knowledge-worker đọc sai file vì thiếu `purpose` filter | Cao | Migration set `purpose='knowledge'` cho toàn bộ legacy docs; worker thêm filter trong cùng release |
| S3 signed URL hết hạn giữa session user dài | Trung bình | FE cache 50% TTL, tự refresh khi 401/403 |
| Local file mất khi chạy staging trước khi migration | Trung bình | `CBM_STORAGE_DRIVER=local` giữ nguyên hành vi cũ cho staging |
| FE cũ vỡ vì response shape thay đổi | Trung bình | Alias controller giữ shape 100% giống cũ |
| MIME validation lỏng → upload file độc | Trung bình | Whitelist strict theo purpose, virus scan (phase sau) |

## 13. Câu hỏi mở

- Có cần `File.checksum` (sha256) để dedupe upload trùng không? — đề xuất có, thêm index unique theo `(orgId, checksum)` với partial filter khi `purpose='knowledge'`.
- File lớn (>50MB video) có cần multipart upload không? — phase sau, MVP giới hạn 50MB như hiện tại.
- Cần access log cho signed URL requests không? — phase sau nếu có compliance yêu cầu.
