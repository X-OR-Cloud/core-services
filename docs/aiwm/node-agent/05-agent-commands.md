# Agent Commands

Khi user tạo agent với `type = managed` và chỉ định `nodeId`, AIWM tự động gửi sự kiện `agent.start` xuống node tương ứng qua WebSocket.

## Agent Types

| Type | Ý nghĩa | Đặc điểm |
|------|---------|-----------|
| `managed` | Hệ thống quản lý | Deploy xuống node, có secret, hệ thống quản lý lifecycle |
| `autonomous` | User tự quản lý | User dùng qua UI, dùng JWT user, không cần nodeId |

## agent.start

**Khi nào**: User gọi `POST /agents` với `type: "managed"` và `nodeId` trỏ đến node đang connected.

**Event nhận được trên Node Agent:**

```json
{
  "type": "agent.start",
  "messageId": "e6f79f9f-a2b1-4e61-a097-c39f8d69e5c5",
  "timestamp": "2026-02-22T00:05:49.474Z",
  "resource": {
    "type": "agent",
    "id": "699a485dfb298c59ed5289ae"
  },
  "data": {
    "agentId": "699a485dfb298c59ed5289ae",
    "name": "my-discord-bot",
    "description": "Discord support bot",
    "status": "active",
    "type": "managed",
    "instructionId": "instruction-id-or-undefined",
    "guardrailId": "guardrail-id-or-undefined",
    "deploymentId": "deployment-id-or-undefined",
    "settings": {
      "claude_model": "claude-3-5-sonnet-latest",
      "claude_maxTurns": 100,
      "claude_permissionMode": "bypassPermissions",
      "discord_token": "xxx",
      "discord_channelIds": ["123", "456"]
    }
  },
  "metadata": {
    "priority": "normal"
  }
}
```

### Data Fields

| Field | Type | Description |
|-------|------|-------------|
| `agentId` | string | Agent MongoDB _id |
| `name` | string | Tên agent |
| `description` | string | Mô tả agent |
| `status` | string | `active`, `inactive`, `busy`, `suspended` |
| `type` | string | Luôn là `managed` |
| `instructionId` | string? | ID instruction (system prompt) |
| `guardrailId` | string? | ID guardrail (safety rules) |
| `deploymentId` | string? | ID deployment (LLM endpoint) |
| `settings` | object | Runtime config với flat structure |

### Settings Prefixes

| Prefix | Purpose |
|--------|---------|
| `auth_` | Authentication roles |
| `claude_` | Claude Code SDK config |
| `discord_` | Discord bot config |
| `telegram_` | Telegram bot config |

### Node Agent xử lý

Khi nhận `agent.start`, Node Agent cần:

1. **Gửi `command.ack`** để xác nhận đã nhận
2. **Lưu agent info** vào local state
3. **Khởi tạo agent process** (tùy loại: Discord bot, Telegram bot, etc.)
4. **Gửi `command.result`** khi hoàn thành (success/error)

## agent.stop (Future)

**Event**: `agent.stop`

```json
{
  "type": "agent.stop",
  "messageId": "uuid",
  "timestamp": "ISO-8601",
  "resource": {
    "type": "agent",
    "id": "agent-id"
  },
  "data": {
    "agentId": "agent-id",
    "force": false,
    "reason": "User requested stop"
  },
  "metadata": {
    "priority": "normal"
  }
}
```

Node Agent xử lý:
1. Gửi `command.ack`
2. Graceful shutdown agent process
3. Gửi `command.result`

## agent.execute (Future)

Gửi task cụ thể cho agent thực thi.

## agent.query (Future)

Query trạng thái agent đang chạy trên node.

## Error Handling

Nếu node không connected khi tạo managed agent:
- AIWM log warning: `Could not send agent.start to node <nodeId>`
- Agent vẫn được tạo thành công trong DB
- Khi node reconnect, có thể query `pendingCommands` trong `register.ack`

Nếu agent.start fail trên node:
- Node gửi `command.result` với `status: "error"`
- AIWM cập nhật execution state tương ứng
