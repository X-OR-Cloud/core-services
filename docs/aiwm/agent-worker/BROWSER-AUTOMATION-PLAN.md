# Browser Automation — Tích hợp PinchTab vào AgentRunner

## Bối cảnh

any-agent (xora project) đã tích hợp thành công browser automation thông qua **PinchTab** — một headless browser service expose REST API. any-agent wrap PinchTab thành 16 MCP tools chạy **in-process** (`createBrowserMcpServer`).

Mục tiêu: port pattern này vào AIWM `AgentRunner` để các hosted agent có thể thực hiện browser automation khi được cấu hình.

---

## Kiến trúc tổng quan

```
Configuration DB: pinchtab.api_url  (org-level)
       ↓ (AgentWorkerService inject ConfigService, đọc khi spawn runner)
AgentRunnerConfig.browserApiUrl = "http://pinchtab:4000"
       ↓
Tool DB: BrowserAutomation (type=builtin)
  BUILTIN_TOOL_FUNCTIONS["BrowserAutomation"] = [mcp__Browser__OpenTab, ...]
       ↓
Agent admin chọn tool BrowserAutomation + whitelist functions → agent.toolIds / agent.allowedFunctions
       ↓
connectInternal() → lookupFunctions() → allowedFunctions chứa mcp__Browser__*
       ↓
AgentRunner constructor:
  - Nếu allowedFunctions có mcp__Browser__* VÀ browserApiUrl có → khởi tạo BrowserInstanceManager (non-blocking)
       ↓
resolveMcpTools():
  - External MCP servers (như cũ)
  - Nếu browserCtx.instanceId ready → merge browser tools filtered by allowedFunctions
```

---

## Các thành phần cần tạo / sửa

### 1. Configuration — thêm `pinchtab.api_url`

**Sửa `config-key.enum.ts`** — thêm key mới vào nhóm Service Integrations:
```
PINCHTAB_API_URL = 'pinchtab.api_url'
```

**Sửa `config-metadata.const.ts`** — thêm metadata:
```
displayName: 'PinchTab API URL'
description: 'URL của PinchTab browser automation service'
dataType: 'url'
isRequired: false
example: 'http://pinchtab:4000'
```

### 2. Tool — thêm `BrowserAutomation` vào seed và BUILTIN_TOOL_FUNCTIONS

**Sửa `tool.service.ts`** — thêm vào `BUILTIN_TOOL_FUNCTIONS`:
```typescript
BrowserAutomation: [
  'mcp__Browser__OpenTab',
  'mcp__Browser__CloseTab',
  'mcp__Browser__ListTabs',
  'mcp__Browser__GetTab',
  'mcp__Browser__Navigate',
  'mcp__Browser__GetSnapshot',
  'mcp__Browser__GetText',
  'mcp__Browser__Screenshot',
  'mcp__Browser__ExecuteAction',
  'mcp__Browser__ExecuteActions',
  'mcp__Browser__Evaluate',
  'mcp__Browser__GetCookies',
  'mcp__Browser__SetCookies',
  'mcp__Browser__ExportPdf',
  'mcp__Browser__LockTab',
  'mcp__Browser__UnlockTab',
],
```

**Thêm seed record** vào DB init script (hoặc tạo migration):
```
name: "BrowserAutomation"
type: "builtin"
description: "Browser automation tools via PinchTab — tab management, navigation, interaction, screenshot/PDF export"
category: "system"
status: "active"
scope: "public"
```

### 3. File mới: `src/modules/agent-worker/browser/`

| File | Mô tả |
|------|-------|
| `browser.types.ts` | Interface `BrowserConfig`, `BrowserContext` |
| `browser-instance.manager.ts` | Port từ any-agent: quản lý lifecycle PinchTab instance (start/stop) |
| `browser-mcp.server.ts` | Port từ any-agent: tạo in-process MCP server với 16 browser tools, dùng `sendFileInternal` thay `ctx.platform` |

### 4. Sửa `agent-runner.ts`

**a. Interface `AgentRunnerConfig`** — thêm 2 fields:
```typescript
/** URL PinchTab API — đọc từ Configuration org-level, truyền bởi AgentWorkerService */
browserApiUrl?: string;
/** Callback gửi file về conversation (screenshot/PDF) */
sendFileInternal?: (conversationId: string, filePath: string, caption: string) => Promise<void>;
```

**b. Constructor** — detect browser:
```typescript
// Nếu browserApiUrl có VÀ allowedFunctions chứa ít nhất 1 mcp__Browser__*
// → khởi tạo BrowserInstanceManager(browserApiUrl) non-blocking
```

**c. `resolveMcpTools()`** — merge in-process browser tools:
```typescript
// Sau external MCP:
// Nếu browserCtx?.instanceId → createBrowserMcpServer(ctx) → merge filtered by allowedFunctions
```

**d. `handleMessage()`** — sync conversationId:
```typescript
// Trước generateText(): browserCtx.conversationId = conversationId
```

**e. `stop()`** — cleanup:
```typescript
await this.browserInstanceManager?.stop();
```

### 5. Sửa `agent-worker.service.ts`

Inject `ConfigService`, đọc `pinchtab.api_url` khi spawn runner:

```typescript
// Khi tạo AgentRunner:
browserApiUrl: await this.configService.get(ConfigKey.PINCHTAB_API_URL, context),
sendFileInternal: async (conversationId, filePath, caption) => {
  // Đọc file → emit message:send với file content qua socket
},
```

---

## 16 Browser Tools

Tool name format: `mcp__Browser__<ToolName>` — nhất quán với naming convention hiện tại.

| Nhóm | Tools |
|---|---|
| Tab lifecycle | `OpenTab`, `CloseTab`, `ListTabs`, `GetTab` |
| Navigation & content | `Navigate`, `GetSnapshot`, `GetText`, `Screenshot` |
| Interaction | `ExecuteAction`, `ExecuteActions`, `Evaluate` |
| Data & export | `GetCookies`, `SetCookies`, `ExportPdf` |
| Access control | `LockTab`, `UnlockTab` |

---

## Screenshot & PDF — cơ chế gửi về chat

any-agent dùng `ctx.platform.sendMessage()`. AIWM thay bằng `sendFileInternal` callback do `AgentWorkerService` cung cấp:

```
Screenshot tool:
  1. GET {pinchtabApiUrl}/tabs/{tabId}/screenshot → binary
  2. Save vào temp file
  3. Gọi ctx.sendFile(conversationId, filePath, caption)
       └── AgentWorkerService.sendFileInternal():
             - Đọc file → base64
             - emit message:send { role: 'assistant', type: 'file', content: base64 }
```

---

## Lifecycle đầy đủ

```
AgentWorkerService.spawnRunner(agent)
  ├── Đọc ConfigService: pinchtab.api_url → browserApiUrl
  └── new AgentRunner({ ..., browserApiUrl, sendFileInternal })

AgentRunner.constructor()
  └── allowedFunctions có mcp__Browser__* && browserApiUrl có
        → BrowserInstanceManager.start() [non-blocking]
              POST {browserApiUrl}/instances/start → ctx.instanceId = "uuid"

AgentRunner.handleMessage(message)
  ├── ctx.conversationId = conversationId
  └── resolveMcpTools()
        ├── External MCP servers (không đổi)
        └── browserCtx.instanceId ready → createBrowserMcpServer(ctx) → merge tools

  generateText() với merged tools
    → LLM gọi mcp__Browser__OpenTab(...)  → POST {browserApiUrl}/instances/{id}/tabs/open
    → LLM gọi mcp__Browser__Navigate(...) → POST {browserApiUrl}/tabs/{tabId}/navigate
    → LLM gọi mcp__Browser__Screenshot()  → binary → sendFileInternal() → chat

AgentRunner.stop()
  └── BrowserInstanceManager.stop() → POST {browserApiUrl}/instances/{instanceId}/stop
```

---

## Điểm khác biệt so với any-agent

| Khía cạnh | any-agent | AIWM AgentRunner |
|---|---|---|
| Config source | `aiwmSettings` + env vars | `Configuration` DB (org-level, `pinchtab.api_url`) |
| Kích hoạt browser | `pinchtab_apiUrl` trong agent settings | `allowedFunctions` có `mcp__Browser__*` + `browserApiUrl` có |
| Platform context | `ctx.platform.sendMessage()` | `sendFileInternal(conversationId, ...)` callback |
| Browser instance | 1 per ClaudeCode instance (per-conversation) | 1 per AgentRunner (tồn tại suốt vòng đời runner) |
| Tool whitelist | `BROWSER_ALLOWED_TOOLS` constant | `BUILTIN_TOOL_FUNCTIONS["BrowserAutomation"]` filtered by `agent.allowedFunctions` |

---

## Phạm vi triển khai

### Phase 1 — Core
- [ ] Sửa `config-key.enum.ts` — thêm `PINCHTAB_API_URL`
- [ ] Sửa `config-metadata.const.ts` — thêm metadata cho `pinchtab.api_url`
- [ ] Sửa `tool.service.ts` — thêm `BrowserAutomation` vào `BUILTIN_TOOL_FUNCTIONS`
- [ ] Thêm seed record `BrowserAutomation` tool vào DB
- [ ] Tạo `browser/browser.types.ts`
- [ ] Tạo `browser/browser-instance.manager.ts`
- [ ] Tạo `browser/browser-mcp.server.ts`
- [ ] Sửa `agent-runner.ts` — thêm `browserApiUrl`, `sendFileInternal`, browser lifecycle, merge tools
- [ ] Sửa `agent-worker.service.ts` — inject ConfigService, truyền `browserApiUrl` + `sendFileInternal`

### Phase 2 — Polish
- [ ] Screenshot/PDF: lưu vào message attachment field thay vì base64 inline
- [ ] Browser health check: ping PinchTab instance mỗi 60s, restart nếu dead
- [ ] Per-tab lock tracking để prevent concurrent edits giữa các conversations
