# Knowledge Collection — API Spec

> **Service:** CBM · **Base URL:** `/knowledge-collections` · **Auth:** Bearer JWT (tất cả endpoints)

Knowledge Collection là đơn vị lưu trữ kiến thức (RAG domain) của một tổ chức. Mỗi collection liên kết với một Qdrant collection riêng để lưu vector embedding, và chứa nhiều file đã được index.

---

## Entity Schema

### KnowledgeCollection

| Trường | Kiểu | Bắt buộc | Ý nghĩa | Ví dụ |
|--------|------|----------|---------|-------|
| `_id` | `string` (ObjectId) | — | ID duy nhất | `"664f1a2b3c4d5e6f7a8b9c0d"` |
| `name` | `string` (max 200) | ✅ | Tên collection | `"Quy định nội bộ"` |
| `description` | `string` (max 1000) | ❌ | Mô tả giúp AI Agent hiểu khi nào dùng collection này | `"Chứa toàn bộ quy định HR"` |
| `projectId` | `string` | ❌ | ID project liên kết (nếu có) | `"664f1a2b3c4d5e6f7a8b9c01"` |
| `status` | `enum` | — | Trạng thái tổng hợp của collection | `"idle"` |
| `chunkingConfig` | `object` | ❌ | Cấu hình chunking khi index file | xem bên dưới |
| `embeddingModel` | `string` | — | Model embedding đang dùng (ẩn trong list) | `"Qwen/Qwen3-Embedding-8B"` |
| `qdrantCollection` | `string` | — | Tên Qdrant collection nội bộ (ẩn trong list) | `"kc_a1b2c3d4..."` |
| `stats` | `object` | — | Thống kê file | xem bên dưới |
| `owner` | `object` | — | Thông tin người tạo (kế thừa BaseSchema) | |
| `createdBy` | `string` | — | userId người tạo | |
| `updatedBy` | `string` | — | userId người cập nhật gần nhất | |
| `isDeleted` | `boolean` | — | Soft delete flag | `false` |
| `createdAt` | `ISO date` | — | Thời điểm tạo | `"2024-06-01T08:00:00.000Z"` |
| `updatedAt` | `ISO date` | — | Thời điểm cập nhật gần nhất | `"2024-06-10T12:30:00.000Z"` |

#### Enum: `status`

| Giá trị | Ý nghĩa |
|---------|---------|
| `idle` | Không có file nào đang xử lý |
| `processing` | Đang có file trong hàng đợi embedding |
| `ready` | Tất cả file đã được index xong |
| `error` | Có ít nhất một file bị lỗi embedding |

#### Nested: `chunkingConfig`

| Trường | Kiểu | Default | Ý nghĩa |
|--------|------|---------|---------|
| `strategy` | `"fixed" \| "sentence" \| "paragraph"` | `"sentence"` | Chiến lược chia chunk |
| `chunkSize` | `number` (min 64) | `512` | Số token tối đa mỗi chunk |
| `chunkOverlap` | `number` (min 0) | `64` | Số token overlap giữa các chunk liền kề |

#### Nested: `stats`

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `totalFiles` | `number` | Tổng số file trong collection |
| `readyFiles` | `number` | Số file đã index xong |
| `processingFiles` | `number` | Số file đang xử lý |
| `errorFiles` | `number` | Số file bị lỗi |
| `pendingFiles` | `number` | Số file chờ xử lý |
| `totalSize` | `number` | Tổng dung lượng (bytes) |
| `totalChunks` | `number` | Tổng số chunk đã tạo |

---

## API Endpoints

---

### `POST /knowledge-collections`

Tạo một knowledge collection mới. Hệ thống tự động sinh tên Qdrant collection nội bộ và gán embedding model mặc định.

**Body**

| Trường | Kiểu | Bắt buộc | Ví dụ |
|--------|------|----------|-------|
| `name` | `string` (max 200) | ✅ | `"Quy định nội bộ"` |
| `description` | `string` (max 1000) | ❌ | `"Chứa toàn bộ quy định HR và chính sách công ty"` |
| `projectId` | `string` | ❌ | `"664f1a2b3c4d5e6f7a8b9c01"` |
| `chunkingConfig.strategy` | `"fixed" \| "sentence" \| "paragraph"` | ❌ | `"sentence"` |
| `chunkingConfig.chunkSize` | `number` (min 64) | ❌ | `512` |
| `chunkingConfig.chunkOverlap` | `number` (min 0) | ❌ | `64` |
| `embeddingModel` | `string` | ❌ | `"Qwen/Qwen3-Embedding-8B"` |

**Request Sample**

```json
{
  "name": "Quy định nội bộ",
  "description": "Chứa toàn bộ quy định HR và chính sách công ty",
  "chunkingConfig": {
    "strategy": "sentence",
    "chunkSize": 512,
    "chunkOverlap": 64
  }
}
```

**Response**

`201 Created`
```json
{
  "_id": "664f1a2b3c4d5e6f7a8b9c0d",
  "name": "Quy định nội bộ",
  "description": "Chứa toàn bộ quy định HR và chính sách công ty",
  "projectId": null,
  "status": "idle",
  "chunkingConfig": {
    "strategy": "sentence",
    "chunkSize": 512,
    "chunkOverlap": 64
  },
  "embeddingModel": "Qwen/Qwen3-Embedding-8B",
  "qdrantCollection": "kc_a1b2c3d4e5f6a7b8c9d0e1f2",
  "stats": {
    "totalFiles": 0,
    "readyFiles": 0,
    "processingFiles": 0,
    "errorFiles": 0,
    "pendingFiles": 0,
    "totalSize": 0,
    "totalChunks": 0
  },
  "owner": { "orgId": "org_001", "userId": "usr_abc" },
  "createdBy": "usr_abc",
  "updatedBy": "usr_abc",
  "isDeleted": false,
  "createdAt": "2024-06-01T08:00:00.000Z",
  "updatedAt": "2024-06-01T08:00:00.000Z"
}
```

`400 Bad Request` — validation lỗi (tên rỗng, chunkSize < 64, v.v.)
```json
{
  "statusCode": 400,
  "message": ["name must be shorter than or equal to 200 characters"],
  "error": "Bad Request"
}
```

`401 Unauthorized`
```json
{ "statusCode": 401, "message": "Unauthorized" }
```

---

### `GET /knowledge-collections`

Lấy danh sách collections của org hiện tại. Hỗ trợ filter, sort, phân trang qua query string.

> **Lưu ý:** Response list **ẩn** hai trường `embeddingModel` và `qdrantCollection`. Dùng `GET /:id` để lấy đầy đủ.

**Query String** — hỗ trợ toán tử `parseQueryString`

| Param | Kiểu | Ý nghĩa | Ví dụ |
|-------|------|---------|-------|
| `name:regex` | `string` | Tìm theo tên (case-insensitive) | `?name:regex=quy định` |
| `status` | `string` | Lọc theo status | `?status=ready` |
| `projectId` | `string` | Lọc theo project | `?projectId=664f...` |
| `sort` | `string` | Sắp xếp | `?sort=createdAt:desc` |
| `page` | `number` | Trang hiện tại (default 1) | `?page=2` |
| `limit` | `number` | Số item mỗi trang (default 20) | `?limit=10` |

**Response**

`200 OK`
```json
{
  "data": [
    {
      "_id": "664f1a2b3c4d5e6f7a8b9c0d",
      "name": "Quy định nội bộ",
      "description": "Chứa toàn bộ quy định HR và chính sách công ty",
      "projectId": null,
      "status": "ready",
      "chunkingConfig": {
        "strategy": "sentence",
        "chunkSize": 512,
        "chunkOverlap": 64
      },
      "stats": {
        "totalFiles": 12,
        "readyFiles": 10,
        "processingFiles": 1,
        "errorFiles": 1,
        "pendingFiles": 0,
        "totalSize": 5242880,
        "totalChunks": 430
      },
      "owner": { "orgId": "org_001", "userId": "usr_abc" },
      "createdBy": "usr_abc",
      "updatedBy": "usr_abc",
      "isDeleted": false,
      "createdAt": "2024-06-01T08:00:00.000Z",
      "updatedAt": "2024-06-10T12:30:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "statistics": {
    "status": {
      "idle": 0,
      "processing": 0,
      "ready": 1,
      "error": 0
    }
  }
}
```

---

### `GET /knowledge-collections/:id`

Lấy chi tiết một collection (bao gồm `embeddingModel` và `qdrantCollection`).

**Params**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | `string` (ObjectId) | ID của collection |

**Response**

`200 OK`
```json
{
  "_id": "664f1a2b3c4d5e6f7a8b9c0d",
  "name": "Quy định nội bộ",
  "description": "Chứa toàn bộ quy định HR và chính sách công ty",
  "projectId": null,
  "status": "ready",
  "chunkingConfig": {
    "strategy": "sentence",
    "chunkSize": 512,
    "chunkOverlap": 64
  },
  "embeddingModel": "Qwen/Qwen3-Embedding-8B",
  "qdrantCollection": "kc_a1b2c3d4e5f6a7b8c9d0e1f2",
  "stats": {
    "totalFiles": 12,
    "readyFiles": 10,
    "processingFiles": 1,
    "errorFiles": 1,
    "pendingFiles": 0,
    "totalSize": 5242880,
    "totalChunks": 430
  },
  "owner": { "orgId": "org_001", "userId": "usr_abc" },
  "createdBy": "usr_abc",
  "updatedBy": "usr_abc",
  "isDeleted": false,
  "createdAt": "2024-06-01T08:00:00.000Z",
  "updatedAt": "2024-06-10T12:30:00.000Z"
}
```

`404 Not Found`
```json
{
  "statusCode": 404,
  "message": "Not found",
  "correlationId": "req_xyz123"
}
```

---

### `PATCH /knowledge-collections/:id`

Cập nhật tên, mô tả hoặc chunking config của collection. Không thể thay đổi `embeddingModel` hay `qdrantCollection` sau khi tạo.

**Params**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | `string` (ObjectId) | ID của collection |

**Body** — tất cả trường đều optional

| Trường | Kiểu | Ví dụ |
|--------|------|-------|
| `name` | `string` (max 200) | `"Quy định nội bộ v2"` |
| `description` | `string` (max 1000) | `"Cập nhật mô tả mới"` |
| `chunkingConfig.strategy` | `"fixed" \| "sentence" \| "paragraph"` | `"paragraph"` |
| `chunkingConfig.chunkSize` | `number` (min 64) | `1024` |
| `chunkingConfig.chunkOverlap` | `number` (min 0) | `128` |

**Request Sample**

```json
{
  "name": "Quy định nội bộ v2",
  "chunkingConfig": {
    "chunkSize": 1024,
    "chunkOverlap": 128
  }
}
```

**Response**

`200 OK` — trả về object đã được cập nhật (cùng cấu trúc như `GET /:id`)

`404 Not Found`
```json
{
  "statusCode": 404,
  "message": "Not found",
  "correlationId": "req_xyz123"
}
```

---

### `DELETE /knowledge-collections/:id`

Soft delete collection (đánh dấu `isDeleted: true`). Không xóa dữ liệu file, chunk hay Qdrant. Dùng endpoint `DELETE /:id/data` nếu muốn xóa toàn bộ dữ liệu bên trong trước.

**Params**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | `string` (ObjectId) | ID của collection |

**Response**

`200 OK`
```json
{
  "_id": "664f1a2b3c4d5e6f7a8b9c0d",
  "isDeleted": true,
  "updatedAt": "2024-06-15T09:00:00.000Z"
}
```

`404 Not Found`
```json
{
  "statusCode": 404,
  "message": "Not found",
  "correlationId": "req_xyz123"
}
```

---

### `DELETE /knowledge-collections/:id/data`

**Xóa toàn bộ dữ liệu bên trong collection** — bao gồm tất cả file, chunk trong MongoDB và toàn bộ vector points trong Qdrant. Collection record vẫn được giữ lại và stats được reset về 0, sẵn sàng để import lại từ đầu.

> ⚠️ **Không thể hoàn tác.** Toàn bộ file đã upload và dữ liệu đã index sẽ bị xóa vĩnh viễn (hard delete).

**Params**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | `string` (ObjectId) | ID của collection cần clear |

**Những gì bị xóa**

| Dữ liệu | Hành động |
|---------|-----------|
| `knowledge_files` (MongoDB) | Hard delete toàn bộ file của collection |
| `knowledge_chunks` (MongoDB) | Hard delete toàn bộ chunk của collection |
| Qdrant vector points | Xóa toàn bộ points có `collectionId` khớp |
| Collection record | **Giữ nguyên**, stats reset về 0 |

**Response**

`200 OK`
```json
{
  "deleted": {
    "files": 12,
    "qdrantPoints": true
  }
}
```

| Trường | Ý nghĩa |
|--------|---------|
| `deleted.files` | Số lượng file record đã bị xóa khỏi MongoDB |
| `deleted.qdrantPoints` | `true` nếu lệnh xóa Qdrant thực thi thành công |

`404 Not Found` — collection không tồn tại hoặc đã bị soft delete
```json
{
  "statusCode": 404,
  "message": "Not found",
  "correlationId": "req_xyz123"
}
```

> **Lưu ý:** Nếu collection không tồn tại, API trả về `{ deleted: { files: 0, qdrantPoints: true } }` thay vì 404 (behavior hiện tại của service).

---

### `POST /knowledge-collections/:id/reindex-all`

Reset toàn bộ file trong collection về trạng thái `pending` để worker tự động embedding lại. Khác với `DELETE /:id/data` — endpoint này **không xóa** dữ liệu Qdrant hay chunk cũ ngay lập tức, worker sẽ rebuild trong quá trình reindex.

**Params**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | `string` (ObjectId) | ID của collection |

**Response**

`201 Created`
```json
{
  "queued": 12
}
```

| Trường | Ý nghĩa |
|--------|---------|
| `queued` | Số file đã được reset sang trạng thái `pending` |

---

### `POST /knowledge-collections/:id/search`

Thực hiện vector search (RAG query) trong collection. Hệ thống embed câu query rồi tìm các chunk gần nhất trong Qdrant.

**Params**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | `string` (ObjectId) | ID của collection |

**Body**

| Trường | Kiểu | Bắt buộc | Ví dụ |
|--------|------|----------|-------|
| `query` | `string` | ✅ | `"chính sách nghỉ phép năm"` |
| `topK` | `number` (min 1, default 5) | ❌ | `5` |

**Request Sample**

```json
{
  "query": "chính sách nghỉ phép năm",
  "topK": 3
}
```

**Response**

`201 Created`
```json
{
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "score": 0.923,
      "payload": {
        "chunkId": "664f1a2b3c4d5e6f7a8b9c10",
        "sourceId": "664f1a2b3c4d5e6f7a8b9c05",
        "sourceType": "file",
        "collectionId": "664f1a2b3c4d5e6f7a8b9c0d",
        "orgId": "org_001",
        "content": "Nhân viên được hưởng 12 ngày nghỉ phép có lương mỗi năm, tích lũy theo tháng..."
      }
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "score": 0.887,
      "payload": {
        "chunkId": "664f1a2b3c4d5e6f7a8b9c11",
        "sourceId": "664f1a2b3c4d5e6f7a8b9c05",
        "sourceType": "file",
        "collectionId": "664f1a2b3c4d5e6f7a8b9c0d",
        "orgId": "org_001",
        "content": "Nghỉ phép không sử dụng hết trong năm có thể chuyển sang tối đa 5 ngày..."
      }
    }
  ]
}
```

| Trường | Ý nghĩa |
|--------|---------|
| `results[].id` | Qdrant point ID (UUID) |
| `results[].score` | Điểm similarity (0–1, càng cao càng liên quan) |
| `results[].payload.chunkId` | MongoDB chunk ID |
| `results[].payload.sourceId` | ID file/document gốc |
| `results[].payload.sourceType` | `"file"` hoặc `"document"` |
| `results[].payload.content` | Nội dung đoạn văn bản của chunk |

Collection không tồn tại — trả về kết quả rỗng (không throw 404):
```json
{ "results": [] }
```

---

## Bảng tóm tắt Endpoints

| Method | URL | Mô tả |
|--------|-----|-------|
| `POST` | `/knowledge-collections` | Tạo collection mới |
| `GET` | `/knowledge-collections` | Danh sách collections (org-scoped, ẩn embeddingModel & qdrantCollection) |
| `GET` | `/knowledge-collections/:id` | Chi tiết một collection (đầy đủ fields) |
| `PATCH` | `/knowledge-collections/:id` | Cập nhật tên / mô tả / chunkingConfig |
| `DELETE` | `/knowledge-collections/:id` | Soft delete collection |
| `DELETE` | `/knowledge-collections/:id/data` | **Xóa toàn bộ dữ liệu** (files + chunks + Qdrant), giữ collection record |
| `POST` | `/knowledge-collections/:id/reindex-all` | Reset tất cả file về pending để embedding lại |
| `POST` | `/knowledge-collections/:id/search` | Vector search (RAG query) trong collection |

---

## Ghi chú đặc biệt

### Fields ẩn trong List response
`GET /knowledge-collections` ẩn hai trường `embeddingModel` và `qdrantCollection` vì đây là thông tin nội bộ hệ thống. Dùng `GET /:id` nếu cần.

### Soft Delete vs Hard Delete data
- `DELETE /:id` — soft delete collection record, **không** xóa dữ liệu file/chunk/Qdrant.
- `DELETE /:id/data` — hard delete toàn bộ dữ liệu bên trong, giữ collection record. Dùng khi muốn **reset và import lại từ đầu**.

### Chunking Config & Reindex
Thay đổi `chunkingConfig` qua `PATCH` **không tự động** trigger reindex. Cần gọi thêm `POST /:id/reindex-all` sau đó để áp dụng config mới cho toàn bộ file.

### Stats được cập nhật tự động
`stats` trong collection được worker cập nhật mỗi khi có file thay đổi trạng thái embedding. Endpoint `DELETE /:id/data` cũng reset stats về 0 ngay lập tức.

### Search trả về 201 thay vì 200
Endpoint `POST /:id/search` trả về HTTP `201` (do dùng `@Post` decorator của NestJS với default). FE nên handle cả `200` và `201` cho endpoint này.
