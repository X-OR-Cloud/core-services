/**
 * Configuration Keys Enum
 *
 * Predefined configuration keys for system integrations.
 * Shared across all services for type-safe config access.
 *
 * V2: Simplified design with 26 config keys.
 */
export enum ConfigKey {
  // ==========================================
  // Object Storage - MinIO/S3 (7 keys)
  // ==========================================
  S3_ENDPOINT = 's3.endpoint',
  S3_ACCESS_KEY = 's3.access_key',
  S3_SECRET_KEY = 's3.secret_key',
  S3_BUCKET_MODELS = 's3.bucket.models',
  S3_BUCKET_LOGS = 's3.bucket.logs',
  S3_REGION = 's3.region',
  S3_USE_SSL = 's3.use_ssl',

  // ==========================================
  // Email - SMTP (7 keys)
  // ==========================================
  SMTP_HOST = 'smtp.host',
  SMTP_PORT = 'smtp.port',
  SMTP_USER = 'smtp.user',
  SMTP_PASSWORD = 'smtp.password',
  SMTP_FROM_EMAIL = 'smtp.from_email',
  SMTP_FROM_NAME = 'smtp.from_name',
  SMTP_USE_TLS = 'smtp.use_tls',

  // ==========================================
  // Discord Webhook (3 keys)
  // ==========================================
  DISCORD_WEBHOOK_URL = 'discord.webhook_url',
  DISCORD_ALERT_CHANNEL = 'discord.alert_channel',
  DISCORD_USERNAME = 'discord.username',

  // ==========================================
  // Telegram Bot (3 keys)
  // ==========================================
  TELEGRAM_BOT_TOKEN = 'telegram.bot_token',
  TELEGRAM_CHAT_ID = 'telegram.chat_id',
  TELEGRAM_ALERT_ENABLED = 'telegram.alert_enabled',

  // ==========================================
  // LLM Providers (3 keys)
  // ==========================================
  OPENAI_API_KEY = 'llm.openai.api_key',
  ANTHROPIC_API_KEY = 'llm.anthropic.api_key',
  GROQ_API_KEY = 'llm.groq.api_key',

  // ==========================================
  // Service Integrations (4 keys)
  // ==========================================
  AIWM_BASE_API_URL = 'aiwm.base_api_url',
  AIWM_BASE_MCP_URL = 'aiwm.base_mcp_url',
  AIWM_BASE_WS_URL = 'aiwm.base_ws_url',
  CBM_BASE_API_URL = 'cbm.base_api_url',
  IAM_BASE_API_URL = 'iam.base_api_url',
  MONA_BASE_API_URL = 'mona.base_api_url',
}
