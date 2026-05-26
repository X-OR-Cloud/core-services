# Agent Client — API Tool Definitions

Tài liệu này mô tả cấu trúc `toolDefinitions` được trả về trong response của `POST /agents/connect`, và cách agent client dùng nó để tự động khởi tạo API tools.

---

## Tổng quan

Khi agent connect thành công, ngoài `mcpServers` và `tools`, response còn chứa field `toolDefinitions` — danh sách các function definition cho tất cả tool loại `api` trong `allowedToolIds` của agent.

Agent client dùng `toolDefinitions` để:
1. Đăng ký tool với LLM framework (Anthropic API, Vercel AI SDK, ...) ngay lúc khởi tạo
2. Tự thực thi HTTP call khi LLM gọi tool — không cần MCP server

`toolDefinitions` là `undefined` nếu agent không có api tool nào.

---

## Cấu trúc

### Response field

```typescript
interface AgentConnectResponse {
  // ... các fields khác
  toolDefinitions?: ToolDefinition[];
}
```

### ToolDefinition

```typescript
interface ToolDefinition {
  name: string;                          // Tên function, unique, dùng làm tool name với LLM
  description: string;                   // Mô tả function cho LLM
  parameters: Record<string, unknown>;   // JSON Schema (inputSchema), dùng làm tool inputSchema với LLM
  http: ToolDefinitionHttp;             // Thông tin để thực thi HTTP call
}

interface ToolDefinitionHttp {
  method: string;                        // 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  baseUrl: string;                       // Base URL đã resolve, VD: 'https://xsai-api.x-or.cloud/cbm'
  path: string;                          // Path template, VD: '/documents/{id}'
  headers: Record<string, string>;       // Headers đã resolve — KHÔNG còn {{...}} template nào
  body?: 'params';                       // Có ở POST/PUT/PATCH — params LLM trả về → request body
  query?: 'params';                      // Có ở GET/DELETE — params LLM trả về → query string
  responseMapping?: {
    dataPath?: string;                   // Dot path để extract từ response, VD: 'data', 'result.items'
  };
}
```

**Lưu ý quan trọng:**
- `headers` đã được server resolve hoàn toàn — `{{AGENT_ACCESS_TOKEN}}` đã được thay bằng JWT thực. Agent client không cần xử lý thêm.
- `body` và `query` là mutual exclusive — chỉ có một trong hai tùy theo `method`.

---

## JSON Schema — `parameters`

`parameters` là JSON Schema chuẩn, dùng trực tiếp làm `input_schema` khi đăng ký tool với Anthropic API.

Một số properties có extension `"x-in"` để chỉ định cách routing:

| `x-in` value | Ý nghĩa |
|---|---|
| `"path"` | Param này là path parameter — interpolate vào URL (`{paramName}`) |
| `"query"` | Ép param vào query string, kể cả với POST/PUT/PATCH |
| *(không có)* | Route theo mặc định: body nếu `body: 'params'`, query nếu `query: 'params'` |

Khi thực thi, agent client phải tách path params (có `x-in: "path"` hoặc xuất hiện trong `{...}` của path) ra khỏi tập params trước khi đưa vào body/query.

---

## Quy tắc thực thi

Khi LLM gọi tool với `name` và `arguments` (object các params):

### Bước 1 — Tách path params

Scan `path` tìm pattern `{paramName}`. Với mỗi `{paramName}` tìm được:
- Lấy giá trị từ `arguments[paramName]`
- Replace vào path: `/documents/{id}` → `/documents/abc123`
- Xóa key đó khỏi `arguments` (không còn đưa vào body/query)

Ngoài ra, nếu một property trong `parameters.properties` có `"x-in": "path"` thì cũng xử lý tương tự.

### Bước 2 — Routing params còn lại

- Nếu `http.body === 'params'` → phần `arguments` còn lại → request body (JSON)
- Nếu `http.query === 'params'` → phần `arguments` còn lại → query string

Nếu có property có `"x-in": "query"` thì ép vào query string bất kể method.

### Bước 3 — Gửi request

```
METHOD  {baseUrl}{resolvedPath}?{queryString}
Headers: {http.headers}
Body:    {JSON.stringify(remainingArgs)}   // chỉ nếu body: 'params'
```

### Bước 4 — Xử lý response

- **Nếu HTTP 2xx**: Extract data theo `responseMapping.dataPath` (nếu có), trả kết quả cho LLM
- **Nếu HTTP error**: Trả error object cho LLM để tự xử lý (xem bên dưới)

---

## Format lỗi trả về LLM

Khi HTTP call thất bại, trả về object sau dạng `tool_result` để LLM tự phục hồi:

```json
{
  "error": true,
  "httpStatus": 404,
  "message": "Not found",
  "body": { "statusCode": 404, "message": "Document not found" }
}
```

Không throw exception — LLM cần thấy lỗi để quyết định hướng tiếp theo.

---

## Ví dụ đầy đủ

### Response từ `/agents/connect`

```json
{
  "toolDefinitions": [
    {
      "name": "CreateDocument",
      "description": "Tạo một document mới trong CBM",
      "parameters": {
        "type": "object",
        "properties": {
          "projectId": { "type": "string", "description": "ID của project chứa document" },
          "title":     { "type": "string", "description": "Tiêu đề document" },
          "content":   { "type": "string", "description": "Nội dung document (markdown)" }
        },
        "required": ["projectId", "title"]
      },
      "http": {
        "method": "POST",
        "baseUrl": "https://xsai-api.x-or.cloud/cbm",
        "path": "/documents",
        "headers": {
          "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
          "Content-Type": "application/json"
        },
        "body": "params",
        "responseMapping": { "dataPath": "data" }
      }
    },
    {
      "name": "GetDocument",
      "description": "Lấy thông tin một document theo ID",
      "parameters": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "description": "Document ID", "x-in": "path" }
        },
        "required": ["id"]
      },
      "http": {
        "method": "GET",
        "baseUrl": "https://xsai-api.x-or.cloud/cbm",
        "path": "/documents/{id}",
        "headers": {
          "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
        },
        "query": "params"
      }
    },
    {
      "name": "UpdateDocumentContent",
      "description": "Cập nhật nội dung của một document",
      "parameters": {
        "type": "object",
        "properties": {
          "id":      { "type": "string", "description": "Document ID", "x-in": "path" },
          "content": { "type": "string", "description": "Nội dung mới (markdown)" }
        },
        "required": ["id", "content"]
      },
      "http": {
        "method": "PATCH",
        "baseUrl": "https://xsai-api.x-or.cloud/cbm",
        "path": "/documents/{id}/content",
        "headers": {
          "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
          "Content-Type": "application/json"
        },
        "body": "params"
      }
    }
  ]
}
```

### Đăng ký tool với Anthropic API

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// Chuyển toolDefinitions → Anthropic tool format
const anthropicTools = toolDefinitions.map(def => ({
  name: def.name,
  description: def.description,
  input_schema: def.parameters,
}));

// Dùng trong messages call
const response = await client.messages.create({
  model: 'claude-opus-4-7',
  max_tokens: 4096,
  tools: anthropicTools,
  messages: conversation,
});
```

### Thực thi tool call

```typescript
async function executeApiTool(
  def: ToolDefinition,
  args: Record<string, any>
): Promise<any> {
  const remaining = { ...args };

  // Bước 1: resolve path params
  let resolvedPath = def.http.path;
  const pathMatches = def.http.path.match(/\{(\w+)\}/g) ?? [];
  for (const token of pathMatches) {
    const key = token.slice(1, -1);
    if (remaining[key] === undefined) throw new Error(`Missing path param: ${key}`);
    resolvedPath = resolvedPath.replace(token, String(remaining[key]));
    delete remaining[key];
  }

  // Bước 1b: x-in=path params không nằm trong path template (edge case)
  for (const [key, schema] of Object.entries((def.parameters as any).properties ?? {})) {
    if ((schema as any)['x-in'] === 'path' && remaining[key] !== undefined) {
      resolvedPath = resolvedPath.replace(`{${key}}`, String(remaining[key]));
      delete remaining[key];
    }
  }

  // Bước 2 & 3: build request
  const url = `${def.http.baseUrl}${resolvedPath}`;
  const isBody = def.http.body === 'params';

  // x-in=query override
  const queryForced: Record<string, any> = {};
  for (const [key, schema] of Object.entries((def.parameters as any).properties ?? {})) {
    if ((schema as any)['x-in'] === 'query' && remaining[key] !== undefined) {
      queryForced[key] = remaining[key];
      delete remaining[key];
    }
  }

  const queryParams = isBody ? queryForced : { ...remaining, ...queryForced };
  const bodyData = isBody ? remaining : undefined;

  const fetchUrl = Object.keys(queryParams).length
    ? `${url}?${new URLSearchParams(queryParams as any).toString()}`
    : url;

  const res = await fetch(fetchUrl, {
    method: def.http.method,
    headers: def.http.headers,
    body: bodyData ? JSON.stringify(bodyData) : undefined,
  });

  // Bước 4: xử lý response
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    return {
      error: true,
      httpStatus: res.status,
      message: json?.message ?? res.statusText,
      body: json,
    };
  }

  // Extract theo dataPath nếu có
  const dataPath = def.http.responseMapping?.dataPath;
  if (dataPath) {
    return dataPath.split('.').reduce((obj, key) => obj?.[key], json as any) ?? json;
  }
  return json;
}
```

### Xử lý tool_use block trong response

```typescript
for (const block of response.content) {
  if (block.type !== 'tool_use') continue;

  const def = toolDefinitions.find(d => d.name === block.name);
  if (!def) continue; // không phải api tool (có thể là mcp tool)

  const result = await executeApiTool(def, block.input as Record<string, any>);

  toolResults.push({
    type: 'tool_result',
    tool_use_id: block.id,
    content: JSON.stringify(result),
  });
}
```

---

## Token refresh

Headers trong `toolDefinitions` chứa JWT token được resolve tại thời điểm connect. Khi token sắp hết hạn (dựa trên `expiresIn`), agent phải:

1. Gọi lại `POST /agents/connect` để lấy response mới
2. Cập nhật `toolDefinitions` từ response mới (headers có JWT mới)
3. Rebuild danh sách tools trước lần gọi LLM tiếp theo

Không cache `toolDefinitions` qua nhiều session.
