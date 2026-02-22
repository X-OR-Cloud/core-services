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

### 3. Discord Integration (`discord_`)

**Purpose:** Configure Discord bot integration.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `discord_token` | `string` | `undefined` | Discord bot token |
| `discord_channelIds` | `string[]` | `undefined` | Discord channel IDs to monitor |
| `discord_botId` | `string` | `undefined` | Discord bot ID |

**Example:**
```json
{
  "discord_token": "MTIzNDU2Nzg5MDEyMzQ1Njc4.XXXXXX.YYYYYYYYYY",
  "discord_channelIds": ["123456789012345678", "987654321098765432"],
  "discord_botId": "123456789012345678"
}
```

**Notes:**
- `discord_channelIds` can be array or comma-separated string
- Bot token can be obtained from Discord Developer Portal

---

### 4. Telegram Integration (`telegram_`)

**Purpose:** Configure Telegram bot integration.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `telegram_token` | `string` | `undefined` | Telegram bot token from BotFather |
| `telegram_groupIds` | `string[]` | `undefined` | Telegram group IDs to monitor |
| `telegram_botUsername` | `string` | `undefined` | Telegram bot username (e.g., `@mybot`) |

**Example:**
```json
{
  "telegram_token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
  "telegram_groupIds": ["-123456789", "-987654321"],
  "telegram_botUsername": "@my_support_bot"
}
```

**Notes:**
- `telegram_groupIds` can be array or comma-separated string
- Group IDs are negative numbers for groups
- Bot token obtained from @BotFather

---

## Complete Example

```json
{
  "settings": {
    "auth_roles": ["agent", "document.editor"],
    "claude_model": "claude-3-5-sonnet-latest",
    "claude_maxTurns": 150,
    "claude_permissionMode": "bypassPermissions",
    "claude_resume": true,
    "discord_token": "MTIzNDU2Nzg5MDEyMzQ1Njc4.XXXXXX.YYYYYYYYYY",
    "discord_channelIds": ["123456789012345678"],
    "telegram_token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
    "telegram_groupIds": ["-123456789"]
  }
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

### Create Agent with Settings

**Endpoint:** `POST /agents`

**Request:**
```json
{
  "name": "Customer Support Agent",
  "description": "AI agent for customer support on Discord",
  "status": "active",
  "type": "managed",
  "nodeId": "node-gpu-001",
  "instructionId": "instruction-customer-support",
  "allowedToolIds": ["tool-1", "tool-2"],
  "settings": {
    "auth_roles": ["agent", "document.reader"],
    "claude_model": "claude-3-5-sonnet-latest",
    "claude_maxTurns": 100,
    "discord_token": "MTIzNDU2Nzg5MDEyMzQ1Njc4.XXXXXX.YYYYYYYYYY",
    "discord_channelIds": ["123456789012345678"]
  }
}
```

### Update Agent Settings

**Endpoint:** `PUT /agents/:id`

**Request:**
```json
{
  "settings": {
    "auth_roles": ["agent", "project.manager"],
    "claude_model": "claude-3-5-opus-latest",
    "telegram_token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
  }
}
```

**Note:** Partial updates are supported - only specified fields are updated.

---

## Environment Variable Generation

When agent connects or credentials are regenerated, AIWM generates `.env` configuration:

**Generated `.env` file:**
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
DISCORD_CHANNEL_ID=123456789012345678

TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_GROUP_ID=-123456789
```

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
```json
// ✅ Store tokens in settings (encrypted at rest in MongoDB)
{
  "discord_token": "actual-token",
  "telegram_token": "actual-token"
}

// ❌ Never commit tokens to git or expose in logs
```

### 4. Use Arrays for Multiple Channels
```json
// ✅ Good - agent monitors multiple channels
{
  "discord_channelIds": ["channel1", "channel2", "channel3"]
}

// ⚠️ Works but less flexible
{
  "discord_channelIds": "channel1,channel2"
}
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
1. Verify `discord_token` is valid and not expired
2. Check `discord_channelIds` matches actual channel IDs
3. Ensure bot has permissions in Discord server
4. Bot must be invited to channels before monitoring

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
