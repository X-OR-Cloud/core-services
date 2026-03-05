# Agent Settings Structure - AIWM

## Overview

Agent settings use a **flat structure with prefixes** to organize configuration by category. This design simplifies access, reduces nesting complexity, and provides clear namespace separation.

## Settings Categories

### 1. Authentication & Authorization (`auth_`)

**Purpose:** Control agent permissions and RBAC roles.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `auth_roles` | `string[]` | `['agent']` | Agent roles for RBAC (e.g., `['agent']`, `['agent.admin']`) |

**Example:**
```json
{
  "auth_roles": ["agent", "project.manager"]
}
```

**Usage in CBM:**
- When agent calls CBM APIs, AIWM generates a user JWT with these roles
- CBM's RBAC system uses these roles to authorize operations
- Default role `agent` should have basic CRUD permissions

---

### 2. Claude Configuration (`claude_`)

**Purpose:** Configure Claude Code SDK runtime behavior.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `claude_model` | `string` | `'claude-3-5-haiku-latest'` | Claude model version |
| `claude_maxTurns` | `number` | `100` | Maximum conversation turns |
| `claude_permissionMode` | `string` | `'bypassPermissions'` | Permission handling mode |
| `claude_resume` | `boolean` | `true` | Enable conversation resume |
| `claude_oauthToken` | `string` | `undefined` | Claude OAuth token (optional) |

**Example:**
```json
{
  "claude_model": "claude-3-5-sonnet-latest",
  "claude_maxTurns": 150,
  "claude_permissionMode": "bypassPermissions",
  "claude_resume": true,
  "claude_oauthToken": "oauth-token-here"
}
```

**Permission Modes:**
- `bypassPermissions` - Agent runs without user confirmation (managed agents on nodes)
- `requirePermissions` - Requires user approval for each action

---

### 3. Discord & Telegram Integration — `channels[]` (Recommended)

> **Thay thế** cho `settings.discord_*` và `settings.telegram_*`. Dùng field `channels[]` trên Agent thay vì settings flat keys.

**Purpose:** Cấu hình structured cho từng channel Discord hoặc Telegram. Mỗi phần tử = 1 channel riêng biệt với config và behavior flags của riêng nó.

**Session isolation:** Mỗi channel entry tạo 1 session riêng. Session ID pattern: `{agentId}:{platform}:{channelId}`

#### Channel Config Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `platform` | `'discord' \| 'telegram'` | ✅ | Nền tảng |
| `label` | `string` | ❌ | Tên gợi nhớ (chỉ hiển thị trong UI) |
| `enabled` | `boolean` | ✅ | Bật/tắt channel này |
| `token` | `string` | ✅ | Bot token của platform |
| `botId` | `string` | ❌ | Discord: bot user ID (numeric). Telegram: @botUsername. Dùng để verify mention. |
| `channelId` | `string` | ✅ | Discord: channel ID. Telegram: group ID (số âm). |
| `requireMentions` | `boolean` | ✅ | `true` = chỉ respond khi @mention bot. `false` = respond mọi message. |
| `verboseLogging` | `boolean` | ✅ | `true` = log step-by-step actions ra channel. |
| `verboseLoggingTarget` | `'channel' \| 'thread' \| string` | ✅ | Nơi nhận log: `channel` (same channel), `thread` (Discord thread), hoặc channel ID cụ thể. |

**Example — Create agent với channels:**
```json
{
  "name": "VTV Support Agent",
  "type": "managed",
  "channels": [
    {
      "platform": "discord",
      "label": "VTV Support Discord",
      "enabled": true,
      "token": "MTIzNDU2Nzg5MDEyMzQ1Njc4.XXXXXX.YYYYYYYYYY",
      "botId": "123456789012345678",
      "channelId": "987654321098765432",
      "requireMentions": true,
      "verboseLogging": true,
      "verboseLoggingTarget": "thread"
    },
    {
      "platform": "telegram",
      "label": "VTV Telegram Group",
      "enabled": true,
      "token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
      "botId": "@vtv_support_bot",
      "channelId": "-1001234567890",
      "requireMentions": false,
      "verboseLogging": false,
      "verboseLoggingTarget": "channel"
    }
  ]
}
```

**Notes:**
- Agent có thể có nhiều channels trên cùng 1 platform (nhiều Discord channels, nhiều Telegram groups)
- Mỗi channel có `enabled` riêng — có thể disable 1 channel mà không ảnh hưởng channels khác
- `verboseLogging` hiện tại do agent framework xử lý; AIWM sẽ kiểm soát sau

---

### 4. Discord & Telegram — Legacy Settings Keys (Deprecated)

> ⚠️ **Deprecated.** Dùng `channels[]` thay thế. Các keys dưới đây vẫn được đọc để backward compat nhưng sẽ bị xóa trong tương lai.

| Field | Type | Description |
|-------|------|-------------|
| `discord_token` | `string` | Discord bot token *(deprecated: dùng `channels[]`)* |
| `discord_channelIds` | `string[]` | Discord channel IDs *(deprecated)* |
| `discord_botId` | `string` | Discord bot ID *(deprecated)* |
| `telegram_token` | `string` | Telegram bot token *(deprecated)* |
| `telegram_groupIds` | `string[]` | Telegram group IDs *(deprecated)* |
| `telegram_botUsername` | `string` | Telegram bot username *(deprecated)* |

---

## Complete Example

```json
{
  "settings": {
    "auth_roles": ["agent", "document.editor"],
    "claude_model": "claude-3-5-sonnet-latest",
    "claude_maxTurns": 150,
    "claude_permissionMode": "bypassPermissions",
    "claude_resume": true
  },
  "channels": [
    {
      "platform": "discord",
      "label": "Main Support Channel",
      "enabled": true,
      "token": "MTIzNDU2Nzg5MDEyMzQ1Njc4.XXXXXX.YYYYYYYYYY",
      "botId": "123456789012345678",
      "channelId": "987654321098765432",
      "requireMentions": true,
      "verboseLogging": false,
      "verboseLoggingTarget": "channel"
    }
  ]
}
```

---

## Backward Compatibility

The AIWM service supports **backward compatibility** with the old nested structure:

### Old Format (Deprecated):
```json
{
  "settings": {
    "claudeModel": "claude-3-5-haiku-latest",
    "maxTurns": 100,
    "discord": {
      "token": "xxx",
      "channelIds": ["123"]
    }
  }
}
```

### New Format (Current):
```json
{
  "settings": {
    "claude_model": "claude-3-5-haiku-latest",
    "claude_maxTurns": 100,
    "discord_token": "xxx",
    "discord_channelIds": ["123"]
  }
}
```

**Migration Strategy:**
- AIWM reads both formats during transition
- Priority: Flat fields (new) → Nested fields (old) → Defaults
- Frontend should use flat structure immediately
- Old agents continue working without migration

**Example Fallback Logic:**
```typescript
const claudeModel = settings.claude_model || settings.claudeModel || 'claude-3-5-haiku-latest';
const discordToken = settings.discord_token || settings.discord?.token;
```

---

## API Examples

### Create Agent with Channels

**Endpoint:** `POST /agents`

**Request:**
```json
{
  "name": "Customer Support Agent",
  "description": "AI agent for customer support on Discord and Telegram",
  "type": "managed",
  "nodeId": "node-gpu-001",
  "instructionId": "instruction-customer-support",
  "allowedToolIds": ["tool-1", "tool-2"],
  "settings": {
    "auth_roles": ["agent", "document.reader"],
    "claude_model": "claude-3-5-sonnet-latest",
    "claude_maxTurns": 100
  },
  "channels": [
    {
      "platform": "discord",
      "label": "Support Channel",
      "enabled": true,
      "token": "MTIzNDU2Nzg5MDEyMzQ1Njc4.XXXXXX.YYYYYYYYYY",
      "botId": "123456789012345678",
      "channelId": "987654321098765432",
      "requireMentions": true,
      "verboseLogging": false,
      "verboseLoggingTarget": "channel"
    }
  ]
}
```

### Update Agent Channels

**Endpoint:** `PUT /agents/:id`

**Request:**
```json
{
  "channels": [
    {
      "platform": "discord",
      "label": "Support Channel",
      "enabled": true,
      "token": "MTIzNDU2Nzg5MDEyMzQ1Njc4.XXXXXX.YYYYYYYYYY",
      "botId": "123456789012345678",
      "channelId": "987654321098765432",
      "requireMentions": true,
      "verboseLogging": true,
      "verboseLoggingTarget": "thread"
    },
    {
      "platform": "telegram",
      "label": "Telegram Group",
      "enabled": false,
      "token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
      "botId": "@support_bot",
      "channelId": "-1001234567890",
      "requireMentions": false,
      "verboseLogging": false,
      "verboseLoggingTarget": "channel"
    }
  ]
}
```

**Note:** `channels[]` là replace toàn bộ array khi update.

---

## Environment Variable Generation

When agent connects or credentials are regenerated, AIWM generates `.env` configuration:

**Generated `.env` file (từ channels[]):**
```bash
# ===== AIWM Integration =====
AIWM_ENABLED=true
AIWM_BASE_URL=https://api.x-or.cloud/dev/aiwm
AIWM_AGENT_ID=67890abcdef1234567890abc
AIWM_AGENT_SECRET=<generated-secret>

# ===== Agent Info =====
AGENT_NAME=Customer Support Agent

# ===== Claude Code SDK Configuration =====
CLAUDE_MODEL=claude-3-5-sonnet-latest
CLAUDE_MAX_TURNS=100
CLAUDE_PERMISSION_MODE=bypassPermissions
CLAUDE_RESUME=true

# ===== Platform Configuration (Optional) =====
DISCORD_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4.XXXXXX.YYYYYYYYYY
DISCORD_CHANNEL_ID=987654321098765432
DISCORD_BOT_ID=123456789012345678
DISCORD_REQUIRE_MENTIONS=true
DISCORD_VERBOSE_LOGGING=false
DISCORD_VERBOSE_LOGGING_TARGET=channel

TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_GROUP_ID=-1001234567890
TELEGRAM_BOT_USERNAME=@support_bot
TELEGRAM_REQUIRE_MENTIONS=false
TELEGRAM_VERBOSE_LOGGING=false
TELEGRAM_VERBOSE_LOGGING_TARGET=channel
```

> Nếu agent có nhiều channels cùng platform, AIWM dùng channel đầu tiên có `enabled: true` làm primary env vars. Tất cả channels được gộp thêm vào `DISCORD_CHANNELS` / `TELEGRAM_CHANNELS` dạng JSON array.

---

## Best Practices

### 1. Use Descriptive Role Names
```json
// ✅ Good
{ "auth_roles": ["agent", "document.editor", "project.reader"] }

// ❌ Bad
{ "auth_roles": ["role1", "role2"] }
```

### 2. Set Appropriate MaxTurns
```json
// ✅ For customer support (long conversations)
{ "claude_maxTurns": 200 }

// ✅ For quick tasks (short interactions)
{ "claude_maxTurns": 50 }
```

### 3. Secure Token Storage

Tokens được lưu trong `channels[].token` (encrypted at rest trong MongoDB). Không commit token vào git hoặc expose trong logs.

### 4. Dùng `channels[]` thay vì settings flat keys

```json
// ✅ Recommended — type-safe, per-channel config
{
  "channels": [
    { "platform": "discord", "channelId": "123", "enabled": true, ... }
  ]
}

// ❌ Deprecated — không có per-channel granularity
{
  "settings": { "discord_token": "xxx", "discord_channelIds": ["123"] }
}
```

### 5. Disable channel thay vì xóa

```json
// ✅ Tạm thời tắt channel — giữ config, không mất data
{ "enabled": false }

// ❌ Đừng xóa channel khỏi array nếu có thể cần dùng lại
```

---

## Troubleshooting

### Issue: Agent uses wrong Claude model
**Solution:** Check settings priority:
1. Verify `claude_model` is set correctly
2. Check for typo: `claude_model` not `claudeModel`
3. Default is `claude-3-5-haiku-latest` if not specified

### Issue: Discord bot not responding
**Solution:**
1. Verify `channels[].token` is valid and not expired
2. Check `channels[].channelId` matches actual channel ID
3. Check `channels[].enabled` is `true`
4. Ensure bot has permissions in Discord server
5. If `requireMentions: true`, bot chỉ respond khi được @mention

### Issue: Agent has wrong permissions in CBM
**Solution:**
1. Check `auth_roles` matches expected roles
2. Verify CBM RBAC configuration recognizes these roles
3. Default role is `['agent']` - may need additional roles
4. Regenerate agent token after updating roles

---

## Related Documentation

- [Agent Type Classification](./AGENT-TYPE-CLASSIFICATION.md) - Managed vs Autonomous agents
- [Frontend API Spec](./FRONTEND-API-SPEC.md) - Complete API documentation
- [Tool Types and Execution](../tools/TOOL-TYPES-AND-EXECUTION.md) - Tool integration
