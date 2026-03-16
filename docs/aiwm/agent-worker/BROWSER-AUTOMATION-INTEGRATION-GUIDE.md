# Browser Automation — Hướng dẫn tích hợp cho any-agent

Tài liệu này mô tả cách any-agent (hoặc bất kỳ agent client nào) tích hợp browser automation thông qua PinchTab, dựa trên config trả về từ **`POST /agents/:id/connect`**.

---

## Tổng quan flow

```
POST /agents/:id/connect  { secret }
  → trả về AgentConnectResponse
        ├── allowedFunctions: ["mcp__Browser__OpenTab", "mcp__Browser__Navigate", ...]
        ├── tools: [{ name: "BrowserAutomation", type: "builtin" }, ...]
        └── settings: { ... }   ← không chứa pinchtab config (xem bên dưới)

any-agent phát hiện browser automation:
  → tools có name = "BrowserAutomation"  AND  allowedFunctions có mcp__Browser__*
  → lấy pinchtabApiUrl từ settings HOẶC env var PINCHTAB_API_URL
  → khởi tạo BrowserInstanceManager.start()  [non-blocking]
  → inject createBrowserTools(ctx) vào tool loop
```

---

## 1. POST /agents/:id/connect — response liên quan

```http
POST /agents/{agentId}/connect
Content-Type: application/json

{ "secret": "<agent-secret>" }
```

**Response (các field liên quan đến browser):**

```json
{
  "accessToken": "<jwt>",
  "tools": [
    {
      "name": "BrowserAutomation",
      "type": "builtin",
      "description": "Browser automation tools via PinchTab...",
      "status": "active"
    }
  ],
  "allowedFunctions": [
    "mcp__Browser__OpenTab",
    "mcp__Browser__CloseTab",
    "mcp__Browser__ListTabs",
    "mcp__Browser__GetTab",
    "mcp__Browser__Navigate",
    "mcp__Browser__GetSnapshot",
    "mcp__Browser__GetText",
    "mcp__Browser__Screenshot",
    "mcp__Browser__ExecuteAction",
    "mcp__Browser__ExecuteActions",
    "mcp__Browser__Evaluate",
    "mcp__Browser__GetCookies",
    "mcp__Browser__SetCookies",
    "mcp__Browser__ExportPdf",
    "mcp__Browser__LockTab",
    "mcp__Browser__UnlockTab"
  ]
}
```

> **Lưu ý:** `allowedFunctions` có thể chứa subset — admin chỉ whitelist một số tools nhất định cho agent. Ví dụ chỉ cho phép `Navigate`, `GetSnapshot`, `Screenshot` mà không cho `Evaluate` hay `SetCookies`.

---

## 2. Phát hiện browser automation

any-agent kiểm tra 2 điều kiện sau khi nhận connect response:

```typescript
function isBrowserEnabled(connectResponse: AgentConnectResponse): boolean {
  const hasBrowserTool = connectResponse.tools?.some(
    (t) => t.name === 'BrowserAutomation' && t.status === 'active'
  );
  const hasBrowserFunction = connectResponse.allowedFunctions?.some(
    (f) => f.startsWith('mcp__Browser__')
  );
  return !!(hasBrowserTool && hasBrowserFunction);
}
```

Cả hai điều kiện phải đúng:
- **`tools`** có `BrowserAutomation` (agent được assign tool này)
- **`allowedFunctions`** có ít nhất 1 `mcp__Browser__*` (admin đã whitelist function)

---

## 3. Lấy PinchTab API URL

PinchTab URL là **infra config cấp org** — không trả về trong connect response. any-agent lấy theo thứ tự ưu tiên:

```typescript
function getPinchtabApiUrl(connectResponse: AgentConnectResponse): string | null {
  // 1. Từ aiwmSettings (nếu any-agent đã fetch settings riêng)
  const fromSettings = connectResponse.settings?.['pinchtab_apiUrl'] as string;
  if (fromSettings) return fromSettings;

  // 2. Từ environment variable
  const fromEnv = process.env.PINCHTAB_API_URL;
  if (fromEnv) return fromEnv;

  return null;
}
```

> **Cách recommended**: Set env var `PINCHTAB_API_URL` trong process chạy any-agent. Đây là cách đơn giản nhất và không cần thay đổi logic fetch config.

---

## 4. Khởi tạo BrowserInstanceManager

Khi đã có `pinchtabApiUrl`, khởi tạo **non-blocking** ngay sau connect:

```typescript
// Sau khi gọi POST /agents/:id/connect thành công
if (isBrowserEnabled(connectResponse)) {
  const pinchtabApiUrl = getPinchtabApiUrl(connectResponse);
  if (pinchtabApiUrl) {
    const browserCtx: BrowserContext = {
      instanceId: null,         // Manager sẽ set sau khi start
      conversationId: null,     // Sync trước mỗi request
      config: {
        apiUrl: pinchtabApiUrl,
        mode: 'headless',
        width: 1280,
        height: 720,
        navigateTimeout: 30,
        blockImages: false,
        screenshotQuality: 80,
        snapshotDepth: 3,
        snapshotMaxTokens: 2000,
        lockTtl: 60,
      },
      sendFile: async (conversationId, filePath, caption) => {
        // Gửi file về platform (Discord, Telegram, WebSocket chat...)
        await platform.sendFile(conversationId, filePath, caption);
      },
    };

    const browserManager = new BrowserInstanceManager(browserCtx);
    browserManager.start().catch(console.error); // Non-blocking

    // Lưu để dùng trong message loop
    this.browserCtx = browserCtx;
    this.browserManager = browserManager;
  }
}
```

---

## 5. Inject browser tools vào message loop

Trước mỗi lần gọi `generateText()` / `query()`:

```typescript
async handleMessage(message: Message) {
  // 1. Sync conversationId vào browserCtx (để Screenshot/PDF biết gửi về đâu)
  if (this.browserCtx) {
    this.browserCtx.conversationId = message.conversationId;
  }

  // 2. Build tool set
  const tools: Record<string, Tool> = {};

  // External MCP tools (Builtin, custom...)
  for (const [serverName, mcpClient] of mcpClients) {
    const serverTools = await mcpClient.tools();
    for (const [toolName, toolDef] of Object.entries(serverTools)) {
      const namespacedKey = `mcp__${serverName}__${toolName}`;
      if (isAllowed(namespacedKey, connectResponse.allowedFunctions)) {
        tools[namespacedKey] = toolDef;
      }
    }
  }

  // In-process browser tools (chỉ khi instance đã ready)
  if (this.browserCtx?.instanceId) {
    const browserTools = createBrowserTools(this.browserCtx);
    for (const [toolName, toolDef] of Object.entries(browserTools)) {
      if (isAllowed(toolName, connectResponse.allowedFunctions)) {
        tools[toolName] = toolDef;
      }
    }
  }

  // 3. Gọi LLM với merged tools
  const result = await generateText({
    model,
    system: connectResponse.instruction.systemPrompt,
    messages: history,
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    stopWhen: stepCountIs(maxSteps),
  });
}
```

`isAllowed` helper:
```typescript
function isAllowed(toolName: string, allowedFunctions: string[]): boolean {
  // Empty list = all allowed
  if (!allowedFunctions.length) return true;
  return allowedFunctions.includes(toolName);
}
```

---

## 6. Cleanup khi shutdown

```typescript
async destroy() {
  await this.browserManager?.stop();
  // → POST {pinchtabApiUrl}/instances/{instanceId}/stop
}
```

---

## 7. Danh sách 16 browser tools

| Tool name | Nhóm | Mô tả |
|---|---|---|
| `mcp__Browser__OpenTab` | Tab | Mở tab mới, optional navigate ngay |
| `mcp__Browser__CloseTab` | Tab | Đóng tab |
| `mcp__Browser__ListTabs` | Tab | Liệt kê tất cả tabs |
| `mcp__Browser__GetTab` | Tab | Chi tiết một tab |
| `mcp__Browser__Navigate` | Navigation | Điều hướng tới URL |
| `mcp__Browser__GetSnapshot` | Navigation | DOM snapshot (interactive elements, links) |
| `mcp__Browser__GetText` | Navigation | Toàn bộ visible text |
| `mcp__Browser__Screenshot` | Navigation | Chụp ảnh → auto gửi về conversation |
| `mcp__Browser__ExecuteAction` | Interaction | Một action: click, type, fill, hover, scroll |
| `mcp__Browser__ExecuteActions` | Interaction | Batch nhiều actions |
| `mcp__Browser__Evaluate` | Interaction | Chạy JavaScript trong trang |
| `mcp__Browser__GetCookies` | Data | Lấy cookies |
| `mcp__Browser__SetCookies` | Data | Set cookies |
| `mcp__Browser__ExportPdf` | Data | Export PDF → auto gửi về conversation |
| `mcp__Browser__LockTab` | Access | Lock tab tránh concurrent edit |
| `mcp__Browser__UnlockTab` | Access | Giải phóng lock |

---

## 8. Ví dụ workflow điển hình cho agent

```
LLM nhận yêu cầu: "Chụp screenshot trang google.com"

Step 1: mcp__Browser__OpenTab { url: "https://google.com" }
  → { tabId: "tab-abc123" }

Step 2: mcp__Browser__Screenshot { tabId: "tab-abc123", message: "Google homepage" }
  → file saved → sendFile() → gửi về conversation tự động
  → { success: true, filePath: "/tmp/browser_tab-abc123_1234567890.jpg" }

Step 3: mcp__Browser__CloseTab { tabId: "tab-abc123" }
  → { success: true }

LLM trả lời: "Đã chụp và gửi screenshot trang Google."
```

---

## 9. Environment variables

| Var | Mô tả |
|---|---|
| `PINCHTAB_API_URL` | URL PinchTab service. **Bắt buộc** để bật browser automation. |

Ví dụ:
```bash
PINCHTAB_API_URL=http://localhost:9867 node any-agent.js
```

---

## 10. Sơ đồ tổng thể

```
any-agent process
  │
  ├── POST /agents/:id/connect
  │     └── response.tools có "BrowserAutomation"
  │         AND response.allowedFunctions có "mcp__Browser__*"
  │               └── isBrowserEnabled = true
  │
  ├── Đọc PINCHTAB_API_URL từ env
  │     └── BrowserInstanceManager.start()  [non-blocking]
  │           └── POST http://localhost:9867/instances/start
  │                 → ctx.instanceId = "uuid"
  │
  └── Mỗi message:
        ├── ctx.conversationId = conversationId
        ├── Merge createBrowserTools(ctx) vào tools (nếu instanceId ready)
        └── generateText({ tools })
              → LLM gọi mcp__Browser__*
              → tool fetch PinchTab REST API
              → Screenshot/PDF: sendFile() → platform
```
