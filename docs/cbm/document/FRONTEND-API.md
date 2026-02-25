# Document API — Frontend Integration

> Last updated: 2026-02-24
> Base URL: `https://api.x-or.cloud/dev/cbm`

---

## 1. Document Entity

Document là tài liệu text-based do user hoặc AI agent tạo. Hỗ trợ 4 content types (HTML, Markdown, JSON, Plain text) và 7 loại content operations.

### 1.1 Các trường

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `_id` | string | auto | MongoDB ObjectId |
| `summary` | string | ✅ | Tiêu đề / tóm tắt (max 500 ký tự) |
| `content` | string | ✅ | Nội dung chính (không trả về trong list/metadata) |
| `type` | enum | ✅ | `'html'` \| `'text'` \| `'markdown'` \| `'json'` |
| `labels` | string[] | ✅ | Labels phân loại và tìm kiếm (default: `[]`) |
| `status` | enum | auto | `'draft'` \| `'published'` \| `'archived'` (default: `'draft'`) |
| `projectId` | string | ❌ | Ref tới Project (optional) |
| `owner` | object | auto | `{ orgId, userId }` — từ BaseSchema |
| `createdBy` | string | auto | User ID tạo document |
| `updatedBy` | string | auto | User/Agent ID cập nhật cuối |
| `createdAt` | Date | auto | Timestamp tạo |
| `updatedAt` | Date | auto | Timestamp cập nhật |
| `deletedAt` | Date | auto | Timestamp soft delete |

### 1.2 Status — Trạng thái

| Status | Ý nghĩa | Hiển thị gợi ý |
|--------|---------|----------------|
| `draft` | Bản nháp | ⚪ Draft |
| `published` | Đã xuất bản | 🟢 Published |
| `archived` | Lưu trữ | ⚫ Archived |

### 1.3 Type — Loại nội dung

| Type | MIME type | Use case |
|------|-----------|----------|
| `html` | `text/html` | Tài liệu HTML, hiển thị trong iframe |
| `text` | `text/plain` | Văn bản thuần túy |
| `markdown` | `text/markdown` | Markdown (hỗ trợ section operations) |
| `json` | `application/json` | Dữ liệu cấu trúc JSON |

---

## 2. API Endpoints

Tất cả endpoints yêu cầu header `Authorization: Bearer <token>`.

### 2.1 Tạo document

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/documents` |
| **Auth** | User JWT |

**Input (body):**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `summary` | string | ✅ | Tiêu đề (min 1, max 500) |
| `content` | string | ✅ | Nội dung (min 1) |
| `type` | enum | ✅ | Content type |
| `labels` | string[] | ✅ | Labels phân loại |
| `projectId` | string | ❌ | Ref tới Project |

> Không cần truyền `status` — hệ thống tự đặt `draft`.

**Output:** Document object (full entity, status = `draft`).

---

### 2.2 Danh sách documents

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/documents` |
| **Auth** | User JWT |

**Input (query params):**

| Param | Kiểu | Mô tả |
|-------|------|-------|
| `page` | number | Trang (default: 1) |
| `limit` | number | Số items/trang (default: 10) |
| `search` | string | Tìm trong summary, content, labels |
| `filter` | JSON object | Lọc theo điều kiện (vd: `{"status":"draft","type":"markdown"}`) |

**Ví dụ query:**
```
GET /documents?page=1&limit=10&search=API integration
GET /documents?filter={"status":"published","type":"markdown"}
GET /documents?search=guide&filter={"projectId":"507f1f77bcf86cd799439011"}
```

**Output:**

```
{
  data: Document[],              // Không có trường `content`
  pagination: { page, limit, total },
  statistics: {
    total: number,
    byStatus: { draft: N, published: N, archived: N },
    byType: { html: N, text: N, markdown: N, json: N }
  }
}
```

> `content` bị exclude trong list response. Dùng GET `/documents/:id/content` để lấy nội dung.

---

### 2.3 Metadata document

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/documents/:id` |
| **Auth** | User JWT |

**Output:** Document object **không** có trường `content`.

> Dùng endpoint này cho trang detail hiển thị metadata. Dùng 2.4 để lấy content.

---

### 2.4 Lấy content

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/documents/:id/content` |
| **Auth** | User JWT |

**Output:** Raw content với `Content-Type` header phù hợp:
- HTML → `text/html; charset=utf-8`
- Text → `text/plain; charset=utf-8`
- Markdown → `text/markdown; charset=utf-8`
- JSON → `application/json; charset=utf-8`

**Lưu ý:**
- Response là **raw content**, không phải JSON wrapper.
- HTML documents có thể hiển thị trực tiếp trong `<iframe>`.
- Frontend cần xử lý response theo type (render markdown, parse JSON, etc.).

---

### 2.5 Cập nhật metadata

| | |
|---|---|
| **Method** | `PATCH` |
| **Path** | `/documents/:id` |
| **Auth** | User JWT |

**Input (body):** Partial — chỉ gửi các trường cần cập nhật.

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `summary` | string | Tiêu đề mới (min 1, max 500) |
| `content` | string | Nội dung mới (min 1) |
| `type` | enum | Type mới |
| `labels` | string[] | Labels mới |
| `status` | enum | Status mới |
| `projectId` | string | Project ID mới |

**Output:** Document object (đã cập nhật, không có `content`).

> Dùng endpoint này cho metadata và simple content update. Dùng 2.6 cho advanced content operations.

---

### 2.6 Content operations

| | |
|---|---|
| **Method** | `PATCH` |
| **Path** | `/documents/:id/content` |
| **Auth** | User JWT |

**Input (body):**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `operation` | enum | ✅ | Loại operation (xem bảng dưới) |
| `content` | string | ❌ | Nội dung mới (dùng cho replace, append, append-after-text, append-to-section) |
| `find` | string | ❌ | Text cần tìm (dùng cho find-replace-text, append-after-text) |
| `replace` | string | ❌ | Text thay thế (dùng cho find-replace-text, find-replace-regex) |
| `pattern` | string | ❌ | Regex pattern (dùng cho find-replace-regex) |
| `flags` | string | ❌ | Regex flags (default: `'g'`) |
| `section` | string | ❌ | Markdown heading (dùng cho find-replace-markdown, append-to-section) |
| `sectionContent` | string | ❌ | Nội dung section mới (dùng cho find-replace-markdown) |

**7 Operations:**

| Operation | Mô tả | Fields cần |
|-----------|-------|------------|
| `replace` | Thay toàn bộ content | `content` |
| `find-replace-text` | Tìm text, thay thế (global) | `find`, `replace` |
| `find-replace-regex` | Tìm regex, thay thế | `pattern`, `replace`, `flags?` |
| `find-replace-markdown` | Thay nội dung section markdown | `section`, `sectionContent` |
| `append` | Thêm vào cuối document | `content` |
| `append-after-text` | Thêm sau đoạn text cụ thể | `find`, `content` |
| `append-to-section` | Thêm vào cuối section markdown | `section`, `content` |

**Output:** Document object (đã cập nhật, bao gồm `content`).

---

### 2.7 Tạo share link

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/documents/:id/share` |
| **Auth** | User JWT |

**Input (body):**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `ttl` | number | ❌ | Thời gian sống (giây). Min 60, max 86400, default 3600 (1 giờ) |

**Output:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "url": "http://localhost:3004/documents/shared/eyJhbGciOiJIUzI1NiIs...",
  "expiresAt": "2026-02-25T13:00:00.000Z"
}
```

> URL sẵn sàng share cho người khác. Không cần đăng nhập để xem.

---

### 2.8 Xem document qua share link (public)

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/documents/shared/:token` |
| **Auth** | Không cần |

**Query params:**

| Param | Kiểu | Mô tả |
|-------|------|-------|
| `render` | string | `true` để render markdown/HTML thành trang web |

**Ví dụ:**
```
GET /documents/shared/<token>              → raw content (MIME type theo document type)
GET /documents/shared/<token>?render=true  → rendered HTML page
```

**Render behavior:**
- `markdown` + `render=true` → Markdown rendered thành HTML page hoàn chỉnh
- `html` + `render=true` → HTML wrapped trong page template
- `text/json` + `render=true` → Hiển thị trong `<pre>` tag
- Không có `render` → Raw content với MIME type header phù hợp

**Error responses:**
| Status | Trường hợp |
|--------|-----------|
| 400 | Token không hợp lệ |
| 404 | Document không tồn tại hoặc đã bị xóa |
| 410 | Share link đã hết hạn |

---

### 2.9 Xóa document (soft delete)

| | |
|---|---|
| **Method** | `DELETE` |
| **Path** | `/documents/:id` |
| **Auth** | User JWT |

**Output:** Document object với `deletedAt` timestamp.

---

## 3. Error Responses

Tất cả error trả về dạng:

```
{
  statusCode: number,
  message: string,
  error: string
}
```

| Status | Trường hợp |
|--------|-----------|
| 400 | Validation lỗi, operation không hợp lệ, text/section không tìm thấy, regex pattern sai, share token không hợp lệ |
| 401 | JWT không hợp lệ hoặc thiếu |
| 404 | Document không tồn tại |
| 410 | Share link đã hết hạn |
| 422 | Validation lỗi chi tiết (array of messages) |

---

## 4. Ghi chú cho Frontend

1. **Content tách biệt metadata**: List/detail trả document **không** có `content`. Phải gọi riêng `GET /documents/:id/content` để lấy nội dung. Giúp list page load nhanh.

2. **Hiển thị content theo type**:
   - `html` → render trong `<iframe src="/documents/{id}/content" />`
   - `markdown` → fetch content, render bằng markdown library
   - `json` → parse và hiển thị formatted JSON
   - `text` → hiển thị trong `<pre>` hoặc text area

3. **Search**: Dùng query param `?search=keyword` — tìm trong summary, content, và labels cùng lúc. Case-insensitive.

4. **Filter format**: Filter truyền dạng JSON object: `?filter={"status":"published","type":"markdown"}`. Hỗ trợ lọc theo bất kỳ field nào của entity.

5. **Statistics**: Response từ GET `/documents` có sẵn `statistics` (byStatus, byType) — dùng cho dashboard/filter counts.

6. **Labels**: Labels là mảng string tự do, dùng cho tagging và filtering. Frontend nên cung cấp autocomplete từ labels đã tồn tại.

7. **Content operations cho editor**: Nếu build rich editor, dùng `replace` operation cho simple save. Dùng `find-replace-*` và `append-*` operations cho AI agent hoặc collaborative editing.

8. **updatedBy có thể là agentId**: Trường `updatedBy` có thể chứa agent ID (nếu AI agent cập nhật document). Frontend cần xử lý cả hai trường hợp khi hiển thị "last edited by".

9. **projectId**: Optional — document có thể tồn tại độc lập hoặc thuộc project. Dùng `filter={"projectId":"..."}` để lấy documents của một project cụ thể.

10. **Form tạo document**: Không cần field `status` — hệ thống tự đặt `draft`.

11. **Share link**: Gọi `POST /documents/:id/share` để tạo link. Response có sẵn `url` — copy và share trực tiếp. Link hết hạn sau TTL (mặc định 1h). Dùng `?render=true` để xem rendered HTML (markdown/HTML). Không cần auth để mở link.
