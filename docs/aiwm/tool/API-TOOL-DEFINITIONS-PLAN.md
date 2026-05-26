# API Tool Definitions — Implementation Plan

Cho phép agent client tự khởi tạo HTTP tool từ định nghĩa trả về trong `/agents/connect`, thay vì hardcode.

---

## Bối cảnh

Connect response hiện tại đã có `tools: Tool[]` (MCP tool sets). Feature này bổ sung `toolDefinitions` — một computed view dành riêng cho `type: 'api'` tools, ở format LLM-callable.

Agent client nhận `toolDefinitions` → đăng ký thành tool functions → LLM tự gọi khi cần.

---

## Mental model: MCP vs API tool

Cả hai loại đều theo cùng một nguyên tắc: **1 Tool document = 1 domain = N functions**.

```
MemoryManagement (type: mcp)          InstructionManagement (type: api)
  ├── mcp__Builtin__SearchMemory         ├── CreateInstruction  → POST /instructions
  ├── mcp__Builtin__UpsertMemory         ├── UpdateInstruction  → PATCH /instructions/{id}
  └── mcp__Builtin__ListMemoryKeys       ├── GetInstruction     → GET /instructions/{id}
                                         └── ListInstructions   → GET /instructions
```

Admin assign 1 `toolId` → agent nhận toàn bộ functions của domain đó.
`toolDefinitions` trong connect response là **flat array** of functions (flatten từ tất cả api tools).

---

## Thiết kế schema mới

### Tool document: `execution` = shared config, `functions[]` = per-function

```
Tool (type: api)
  ├── execution          ← shared defaults: baseUrl, headers, timeout
  └── functions[]        ← mỗi phần tử = 1 HTTP endpoint = 1 LLM function
        ├── name
        ├── description
        ├── inputSchema   ← JSON Schema (với x-in extension)
        ├── method
        ├── path          ← hỗ trợ {pathParam}
        ├── headers?      ← override/merge với tool-level headers
        └── responseMapping?
```

Function-level `headers` **merge** với tool-level `execution.headers`.
Function headers thắng nếu cùng key.

### `tool.schema.ts` — thay đổi

**`execution` bỏ `method`, `path`, `schema.inputSchema`** — những field này chuyển xuống `functions[]`:

```typescript
// execution giữ lại: shared config
execution?: {
  baseUrl?: string;
  headers?: Record<string, string>;   // default headers cho tất cả functions
  authRequired?: boolean;             // backward compat
  timeout?: number;
};

// NEW: per-function definitions
functions?: {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;     // JSON Schema (với x-in extension)
  method: string;                           // GET | POST | PUT | PATCH | DELETE
  path: string;                             // /instructions/{id}
  headers?: Record<string, string>;         // override tool-level headers
  responseMapping?: {
    dataPath?: string;                      // 'data', 'result.items'
  };
  timeout?: number;                         // override tool-level timeout
}[];
```

**`schema.inputSchema`** — giữ nguyên để backward compat với MCP/builtin/custom tools.
Với `type: 'api'`, field này không dùng (inputSchema nằm trong mỗi function).

---

## Convention

### Hai lớp template tách biệt

| Syntax | Nguồn | Resolve khi nào |
|---|---|---|
| `{paramName}` | LLM tool call params | Agent client lúc execute |
| `{nested.key}` | LLM tool call params (dot path) | Agent client lúc execute |
| `{{VARIABLE}}` | System context | Server lúc build connect response |

`{...}` = single braces → từ LLM params (OpenAPI style)
`{{...}}` = double braces → system variable (Handlebars style)

### System variables (server-resolved)

| Variable | Giá trị |
|---|---|
| `{{AGENT_ACCESS_TOKEN}}` | JWT token của agent (từ connect) |
| `{{ORG_ID}}` | `agent.owner.orgId` |
| `{{AGENT_ID}}` | agentId |

### Header merge + resolve order

```
1. Lấy tool.execution.headers (shared defaults)
2. Merge với function.headers (function thắng nếu cùng key)
3. Nếu authRequired=true và không có Authorization header → inject Bearer token
4. Resolve {{...}} templates với system variables
→ agent nhận headers đã resolved hoàn toàn
```

---

## Parameter routing (agent client)

Agent client tự xử lý khi execute. Server không involvement.

### Rule

```
1. Collect path params:
   - Scan {token} trong path string
   - Scan x-in: "path" trong inputSchema.properties (kể cả nested)
   - Resolve: _.get(llmParams, 'dotted.key')

2. Remove used path keys khỏi working params
   (prune empty parent objects sau khi xóa leaf)

3. Route remaining params:
   POST / PUT / PATCH  → JSON body
   GET / DELETE        → query string

4. x-in: "query" override → force vào query string dù method là POST
```

### Ví dụ với dot path

```
path:   /orgs/{org.id}/projects/{id}/tasks
params: { org: { id: "org-xyz" }, id: "proj-abc", title: "Fix bug" }
method: POST

→ path params: org.id → "org-xyz", id → "proj-abc"
→ URL: /orgs/org-xyz/projects/proj-abc/tasks
→ body: { title: "Fix bug" }   (org{} pruned vì rỗng sau khi remove org.id)
```

---

## Response mapping (agent client)

```
Success (2xx):
  result = dataPath
    ? _.get(responseBody, dataPath)    // 'data', 'result.items'
    : responseBody                     // full body nếu không config

Error (non-2xx):
  {
    "error": true,
    "httpStatus": 422,
    "message": "Unprocessable Entity",
    "body": { /* full response body */ }
  }
```

LLM tự quyết định retry hay escalate.

---

## Ví dụ đầy đủ: InstructionManagement tool

### Tool document lưu trong DB

```json
{
  "name": "InstructionManagement",
  "type": "api",
  "description": "Quản lý instruction (system prompt) cho agent",
  "category": "productivity",
  "status": "active",
  "scope": "org",

  "schema": {
    "inputSchema": {},
    "outputSchema": {}
  },

  "execution": {
    "baseUrl": "https://api.x-or.cloud/dev/aiwm",
    "headers": {
      "Authorization": "Bearer {{AGENT_ACCESS_TOKEN}}",
      "Content-Type": "application/json"
    },
    "timeout": 10000
  },

  "functions": [
    {
      "name": "CreateInstruction",
      "description": "Tạo mới một instruction (system prompt) cho agent",
      "method": "POST",
      "path": "/instructions",
      "inputSchema": {
        "type": "object",
        "properties": {
          "name":         { "type": "string", "description": "Tên instruction" },
          "systemPrompt": { "type": "string", "description": "Nội dung system prompt" },
          "description":  { "type": "string", "description": "Mô tả ngắn" },
          "tags":         { "type": "array", "items": { "type": "string" } },
          "status":       { "type": "string", "enum": ["active", "inactive"] }
        },
        "required": ["name", "systemPrompt"]
      },
      "responseMapping": { "dataPath": "data" }
    },
    {
      "name": "UpdateInstruction",
      "description": "Cập nhật instruction theo ID",
      "method": "PATCH",
      "path": "/instructions/{id}",
      "inputSchema": {
        "type": "object",
        "properties": {
          "id":           { "type": "string", "description": "ID instruction", "x-in": "path" },
          "name":         { "type": "string" },
          "systemPrompt": { "type": "string" },
          "description":  { "type": "string" },
          "tags":         { "type": "array", "items": { "type": "string" } },
          "status":       { "type": "string", "enum": ["active", "inactive"] }
        },
        "required": ["id"]
      },
      "responseMapping": { "dataPath": "data" }
    },
    {
      "name": "GetInstruction",
      "description": "Lấy chi tiết một instruction theo ID",
      "method": "GET",
      "path": "/instructions/{id}",
      "inputSchema": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "description": "ID instruction", "x-in": "path" }
        },
        "required": ["id"]
      },
      "responseMapping": { "dataPath": "data" }
    },
    {
      "name": "ListInstructions",
      "description": "Lấy danh sách instructions",
      "method": "GET",
      "path": "/instructions",
      "inputSchema": {
        "type": "object",
        "properties": {
          "page":   { "type": "number" },
          "limit":  { "type": "number" },
          "status": { "type": "string", "enum": ["active", "inactive"] }
        }
      },
      "responseMapping": { "dataPath": "data" }
    }
  ]
}
```

### `toolDefinitions` trả về trong connect response

Server flatten `functions[]` từ tất cả api tools, resolve headers:

```json
[
  {
    "name": "CreateInstruction",
    "description": "Tạo mới một instruction (system prompt) cho agent",
    "parameters": {
      "type": "object",
      "properties": {
        "name":         { "type": "string", "description": "Tên instruction" },
        "systemPrompt": { "type": "string", "description": "Nội dung system prompt" },
        "description":  { "type": "string" },
        "tags":         { "type": "array", "items": { "type": "string" } },
        "status":       { "type": "string", "enum": ["active", "inactive"] }
      },
      "required": ["name", "systemPrompt"]
    },
    "http": {
      "method": "POST",
      "baseUrl": "https://api.x-or.cloud/dev/aiwm",
      "path": "/instructions",
      "headers": {
        "Authorization": "Bearer eyJhbGci...",
        "Content-Type": "application/json"
      },
      "body": "params",
      "responseMapping": { "dataPath": "data" }
    }
  },
  {
    "name": "UpdateInstruction",
    "description": "Cập nhật instruction theo ID",
    "parameters": {
      "type": "object",
      "properties": {
        "id":           { "type": "string", "description": "ID instruction", "x-in": "path" },
        "name":         { "type": "string" },
        "systemPrompt": { "type": "string" }
      },
      "required": ["id"]
    },
    "http": {
      "method": "PATCH",
      "baseUrl": "https://api.x-or.cloud/dev/aiwm",
      "path": "/instructions/{id}",
      "headers": {
        "Authorization": "Bearer eyJhbGci...",
        "Content-Type": "application/json"
      },
      "body": "params",
      "responseMapping": { "dataPath": "data" }
    }
  }
]
```

---

## Thay đổi cần làm

### 1. `tool.schema.ts`

- Bỏ `method`, `path` khỏi `execution` (giữ `baseUrl`, `headers`, `authRequired`, `timeout`)
- Thêm `functions[]` array với đầy đủ per-function fields

### 2. `tool.dto.ts`

- Thêm `ApiToolFunctionDto` class (validate từng function)
- Cập nhật `CreateToolDto` / `UpdateToolDto`: thêm `functions?` field
- `schema` field → optional cho `type: 'api'` (dùng `@ValidateIf`)

### 3. `agent.dto.ts`

- Thêm interface `ToolDefinitionHttp`, `ToolDefinition`
- Thêm `toolDefinitions?: ToolDefinition[]` vào `AgentConnectResponseDto`

### 4. `agent.service.ts`

- Thêm `buildToolDefinitions(tools, agentAccessToken, orgId, agentId)`
  - Filter `tools.filter(t => t.type === 'api' && t.functions?.length)`
  - Flatten: mỗi tool → loop functions → build ToolDefinition
  - Header merge: `{ ...tool.execution.headers, ...fn.headers }`
  - Resolve `{{...}}` templates
  - Derive `body: 'params'` hoặc `query: 'params'` từ method
- Gọi trong `buildConnectResponse`, add vào response

---

## Scope thay đổi (tổng kết)

| File | Thay đổi |
|---|---|
| `tool.schema.ts` | Refactor `execution` (bỏ method/path), thêm `functions[]` |
| `tool.dto.ts` | Thêm `ApiToolFunctionDto`, cập nhật Create/Update DTOs |
| `agent.dto.ts` | Thêm `ToolDefinition` interfaces, thêm `toolDefinitions?` vào response DTO |
| `agent.service.ts` | Thêm `buildToolDefinitions()` + `resolveHeaderTemplates()` |

**Không thay đổi:** MCP, gateway, heartbeat, bất kỳ module nào khác.

---

## Không trong scope

- Agent client implementation (client-side, ngoài repo)
- Body reshaping / JSONata transform
- Response chaining giữa các tool calls
- Backward compat migration cho existing `type: 'api'` tools dùng `execution.method/path` cũ
  (nếu cần, xử lý riêng ở bước sau)
