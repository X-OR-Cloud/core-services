# Tool Module — Frontend API Reference

> Dành cho FE developer tích hợp trang quản lý Tool.
> Base URL (dev): `http://localhost:3003` | Base URL (prod): theo nginx config.

---

## Phân loại Tool

| `type` | Mô tả | Trường đặc trưng |
|--------|--------|-----------------|
| `mcp` | Tool chạy qua MCP server (Docker container) | `transport`, `endpoint`, `dockerImage`, `port`, `environment` |
| `builtin` | Tool được tích hợp sẵn trong agent (Claude Code SDK) | Không có trường đặc trưng |
| `api` | Tool gọi HTTP API — định nghĩa qua `execution` + `functions[]` | `execution`, `functions[]` |
| `custom` | Tool do agent tự định nghĩa | Không có trường đặc trưng |

---

## Phân quyền

| Thao tác | Yêu cầu |
|----------|---------|
| Đọc (GET) | User JWT bất kỳ |
| Tạo / Sửa / Xóa tool `api`, `mcp`, `custom` | `organization.owner`, `organization.editor`, hoặc `universe.*` |
| Tạo / Sửa / Xóa tool `builtin` | Không được phép (403) với mọi role |

---

## Endpoints

### 1. List Tools

```
GET /tools
```

**Query params:**

| Param | Type | Mô tả |
|-------|------|--------|
| `page` | number | Trang (mặc định: 1) |
| `limit` | number | Số lượng/trang (mặc định: 20) |

**Response `200`:**

```json
{
  "data": [
    {
      "_id": "6a147f22eb7757aa15c4c5f1",
      "name": "DocumentManagement",
      "type": "api",
      "description": "Quản lý tài liệu trong CBM",
      "category": "productivity",
      "status": "active",
      "scope": "org",
      "functions": [
        { "name": "CreateDocument", "method": "POST", "path": "/documents" },
        { "name": "ListDocuments",  "method": "GET",  "path": "/documents" },
        { "name": "GetDocument",    "method": "GET",  "path": "/documents/{id}" }
      ],
      "createdAt": "2026-05-26T03:00:00.000Z",
      "updatedAt": "2026-05-26T03:00:00.000Z"
    },
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "WebSearch",
      "type": "mcp",
      "description": "Tìm kiếm web qua DuckDuckGo",
      "category": "data",
      "status": "active",
      "scope": "public",
      "transport": "sse",
      "endpoint": "http://localhost:3100",
      "dockerImage": "aiops/mcp-web-search:latest",
      "port": 3100,
      "createdAt": "2026-04-10T08:00:00.000Z",
      "updatedAt": "2026-04-10T08:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 2
  },
  "statistics": {
    "total": 2,
    "byStatus": {
      "active": 2,
      "inactive": 0,
      "error": 0
    }
  }
}
```

> `functions[]` trong list response chỉ trả `name`, `method`, `path` — không trả `inputSchema` (tối ưu payload). FE dùng để hiển thị danh sách function của api tool.

---

### 2. Get Tool by ID

```
GET /tools/:id
```

**Response `200` — type `api`:**

```json
{
  "_id": "6a147f22eb7757aa15c4c5f1",
  "name": "DocumentManagement",
  "type": "api",
  "description": "Quản lý tài liệu (document) trong CBM — tạo, đọc, cập nhật, xóa và chỉnh sửa nội dung",
  "category": "productivity",
  "status": "active",
  "scope": "org",
  "schema": {
    "inputSchema": {},
    "outputSchema": {}
  },
  "execution": {
    "baseUrl": "https://xsai-api.x-or.cloud/cbm",
    "headers": {
      "Authorization": "Bearer {{AGENT_ACCESS_TOKEN}}",
      "Content-Type": "application/json"
    },
    "timeout": 15000
  },
  "functions": [
    {
      "name": "CreateDocument",
      "description": "Tạo tài liệu mới. Status mặc định là draft.",
      "method": "POST",
      "path": "/documents",
      "inputSchema": {
        "type": "object",
        "properties": {
          "summary": { "type": "string", "description": "Tiêu đề / tóm tắt tài liệu" },
          "content": { "type": "string", "description": "Nội dung tài liệu" },
          "type": { "type": "string", "enum": ["markdown", "html", "text", "json"] },
          "labels": { "type": "array", "items": { "type": "string" } },
          "projectId": { "type": "string" },
          "shareMode": { "type": "string", "enum": ["private", "organization", "organization-edit"] }
        },
        "required": ["summary", "type", "labels"]
      },
      "responseMapping": { "dataPath": "data" }
    },
    {
      "name": "UpdateDocumentContent",
      "description": "Cập nhật nội dung tài liệu.",
      "method": "PATCH",
      "path": "/documents/{id}/content",
      "inputSchema": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "description": "Document ID", "x-in": "path" },
          "operation": {
            "type": "string",
            "enum": ["replace", "find-replace-text", "find-replace-regex", "find-replace-markdown", "append", "append-after-text", "append-to-section"]
          },
          "content": { "type": "string" }
        },
        "required": ["id", "operation"]
      },
      "responseMapping": { "dataPath": "data" }
    }
  ],
  "owner": {
    "userId": "69a9731dc77bbf7dc21d6e8c",
    "orgId": "691eb9e6517f917943ae1f9d"
  },
  "createdAt": "2026-05-26T03:00:00.000Z",
  "updatedAt": "2026-05-26T03:00:00.000Z"
}
```

**Response `200` — type `mcp`:**

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "WebSearch",
  "type": "mcp",
  "description": "Tìm kiếm web qua DuckDuckGo",
  "category": "data",
  "status": "active",
  "scope": "public",
  "transport": "sse",
  "endpoint": "http://localhost:3100",
  "dockerImage": "aiops/mcp-web-search:latest",
  "containerId": "a1b2c3d4e5f6",
  "port": 3100,
  "environment": {
    "API_KEY": "xxx",
    "MAX_RESULTS": "10"
  },
  "healthEndpoint": "/health",
  "lastHealthCheck": "2026-05-26T02:55:00.000Z",
  "schema": {
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": { "type": "string", "description": "Search query" }
      },
      "required": ["query"]
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "results": { "type": "array", "items": { "type": "string" } }
      }
    }
  },
  "owner": {
    "userId": "69a9731dc77bbf7dc21d6e8c",
    "orgId": "691eb9e6517f917943ae1f9d"
  },
  "createdAt": "2026-04-10T08:00:00.000Z",
  "updatedAt": "2026-05-26T02:55:00.000Z"
}
```

**Response `200` — type `builtin` hoặc `custom`:**

```json
{
  "_id": "507f1f77bcf86cd799439022",
  "name": "MemoryManagement",
  "type": "builtin",
  "description": "Lưu trữ và truy xuất memory của agent",
  "category": "productivity",
  "status": "active",
  "scope": "public",
  "schema": {
    "inputSchema": {},
    "outputSchema": {}
  },
  "owner": { "userId": "...", "orgId": "..." },
  "createdAt": "2026-03-01T00:00:00.000Z",
  "updatedAt": "2026-03-01T00:00:00.000Z"
}
```

**Response `404`:**
```json
{
  "statusCode": 404,
  "message": "Not found",
  "correlationId": "abc123"
}
```

---

### 3. Create Tool

```
POST /tools
```

> Yêu cầu role `universe.owner`.

#### Body — type `api`

```json
{
  "name": "DocumentManagement",
  "type": "api",
  "description": "Quản lý tài liệu trong CBM",
  "category": "productivity",
  "status": "active",
  "scope": "org",
  "execution": {
    "baseUrl": "https://xsai-api.x-or.cloud/cbm",
    "headers": {
      "Authorization": "Bearer {{AGENT_ACCESS_TOKEN}}",
      "Content-Type": "application/json"
    },
    "timeout": 15000
  },
  "functions": [
    {
      "name": "CreateDocument",
      "description": "Tạo tài liệu mới",
      "method": "POST",
      "path": "/documents",
      "inputSchema": {
        "type": "object",
        "properties": {
          "summary": { "type": "string" },
          "type": { "type": "string", "enum": ["markdown", "html", "text", "json"] },
          "labels": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["summary", "type", "labels"]
      },
      "responseMapping": { "dataPath": "data" }
    },
    {
      "name": "GetDocument",
      "description": "Lấy chi tiết tài liệu",
      "method": "GET",
      "path": "/documents/{id}",
      "inputSchema": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "x-in": "path" }
        },
        "required": ["id"]
      },
      "responseMapping": { "dataPath": "data" }
    }
  ]
}
```

#### Body — type `mcp`

```json
{
  "name": "WebSearch",
  "type": "mcp",
  "description": "Tìm kiếm web qua DuckDuckGo",
  "category": "data",
  "transport": "sse",
  "endpoint": "http://localhost:3100",
  "dockerImage": "aiops/mcp-web-search:latest",
  "port": 3100,
  "environment": {
    "API_KEY": "xxx"
  },
  "healthEndpoint": "/health",
  "schema": {
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": { "type": "string" }
      },
      "required": ["query"]
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "results": { "type": "array", "items": { "type": "string" } }
      }
    }
  },
  "status": "active",
  "scope": "public"
}
```

#### Body — type `builtin` hoặc `custom`

```json
{
  "name": "MemoryManagement",
  "type": "builtin",
  "description": "Lưu trữ và truy xuất memory của agent",
  "category": "productivity",
  "schema": {
    "inputSchema": {},
    "outputSchema": {}
  },
  "status": "active",
  "scope": "public"
}
```

**Response `201`:** trả về object tool đầy đủ (cùng format với GET /:id).

**Response `400`:**
```json
{
  "statusCode": 400,
  "message": ["name should not be empty", "type must be one of: mcp, builtin, custom, api"],
  "correlationId": "abc123"
}
```

**Response `403`:**
```json
{
  "statusCode": 403,
  "message": "This endpoint requires universe-level permissions.",
  "correlationId": "abc123"
}
```

---

### 4. Update Tool

```
PATCH /tools/:id
```

> Yêu cầu role `universe.owner`.
> Tất cả fields đều optional — chỉ gửi fields cần thay đổi.

#### Body — ví dụ đổi status

```json
{
  "status": "inactive"
}
```

#### Body — ví dụ cập nhật functions của api tool

```json
{
  "functions": [
    {
      "name": "CreateDocument",
      "description": "Tạo tài liệu mới (updated)",
      "method": "POST",
      "path": "/documents",
      "inputSchema": { "type": "object", "properties": { "summary": { "type": "string" } }, "required": ["summary"] },
      "responseMapping": { "dataPath": "data" }
    }
  ]
}
```

**Response `200`:** trả về object tool đã cập nhật.

**Response `409` — tool đang được agent sử dụng (khi đổi status thành `inactive`):**
```json
{
  "statusCode": 409,
  "message": "Tool is currently in use by active agents",
  "details": {
    "activeAgents": [
      { "id": "507f1f77bcf86cd799439011", "name": "PM Bot" }
    ],
    "action": "deactivate"
  },
  "correlationId": "abc123"
}
```

---

### 5. Delete Tool

```
DELETE /tools/:id
```

> Yêu cầu role `universe.owner`. Soft delete.

**Response `200`:**
```json
{
  "success": true
}
```

**Response `409` — tool đang được agent sử dụng:**
```json
{
  "statusCode": 409,
  "message": "Tool is currently in use by active agents",
  "details": {
    "activeAgents": [
      { "id": "507f1f77bcf86cd799439011", "name": "PM Bot" }
    ],
    "action": "delete"
  },
  "correlationId": "abc123"
}
```

---

## Cấu trúc function (type `api`)

Mỗi phần tử trong `functions[]`:

| Field | Type | Bắt buộc | Mô tả |
|-------|------|----------|--------|
| `name` | string | ✅ | Tên function expose cho LLM |
| `description` | string | ✅ | Mô tả cho LLM hiểu khi nào dùng |
| `method` | `GET\|POST\|PUT\|PATCH\|DELETE` | ✅ | HTTP method |
| `path` | string | ✅ | Path template, hỗ trợ `{paramName}` |
| `inputSchema` | object | ✅ | JSON Schema. Dùng `"x-in": "path"` để đánh dấu path param |
| `headers` | object | — | Override headers của tool-level `execution.headers` |
| `responseMapping.dataPath` | string | — | Dot notation để extract từ response, ví dụ: `data`, `result.items` |
| `timeout` | number | — | Timeout riêng (ms), override `execution.timeout` |

### `x-in` extension trong `inputSchema`

Dùng trong `properties` của `inputSchema` để đánh dấu routing của parameter:

| Giá trị | Ý nghĩa |
|---------|---------|
| `"x-in": "path"` | Param được interpolate vào URL path, ví dụ: `{id}` → `/documents/abc123` |
| `"x-in": "query"` | Ép vào query string dù method là POST |
| _(không có)_ | Mặc định: POST/PUT/PATCH → body; GET/DELETE → query string |

**Ví dụ:**
```json
{
  "properties": {
    "id":     { "type": "string", "x-in": "path", "description": "Document ID" },
    "status": { "type": "string", "x-in": "query" },
    "name":   { "type": "string" }
  }
}
```

### Template variables trong `execution.headers`

| Syntax | Được resolve thành |
|--------|--------------------|
| `{{AGENT_ACCESS_TOKEN}}` | JWT token của agent |
| `{{ORG_ID}}` | Organization ID |
| `{{AGENT_ID}}` | Agent ID |

FE hiển thị các giá trị này dạng tag/chip để người dùng biết đây là dynamic value, không phải literal string.

---

## Gợi ý hiển thị FE theo type

### type `api`

- Hiển thị section **Execution Config**: `baseUrl`, `headers` (ẩn giá trị nếu có token)
- Hiển thị danh sách **Functions** dạng table: `name`, `method` (badge màu), `path`
- Click vào function → xem `inputSchema` dạng collapsible JSON hoặc table properties
- Hỗ trợ thêm/xóa/sửa từng function

### type `mcp`

- Hiển thị section **Container Config**: `dockerImage`, `port`, `transport`, `endpoint`
- Hiển thị `environment` dạng key-value table (ẩn values nhạy cảm)
- Hiển thị `lastHealthCheck` + badge trạng thái health
- Hiển thị `schema.inputSchema` / `schema.outputSchema` dạng JSON viewer

### type `builtin` / `custom`

- Hiển thị tối giản: `name`, `description`, `category`, `status`, `scope`
- Không có section config đặc biệt
