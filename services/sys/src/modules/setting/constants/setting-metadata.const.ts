import { ConfigKey } from '@hydrabyte/shared';

/**
 * Setting Key Metadata Interface
 *
 * Extends the legacy ConfigKey metadata (from aiwm.configuration) with:
 * - `sensitive`: Level 1 masking — UI shows ***, getAll() skip, log redact
 * - `cacheTtlSec`, `staleTtlSec`: per-key cache TTL override for sys-client lib
 *
 * Ref: docs/sys/PROPOSAL.md §4.3
 */
export interface SettingKeyMetadata {
  key: ConfigKey;
  displayName: string;
  description: string;
  dataType: 'string' | 'number' | 'boolean' | 'url' | 'email';
  isRequired: boolean;
  defaultValue?: string;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    enum?: string[];
  };
  example?: string;

  // Security
  sensitive?: boolean; // default false. When true: mask UI, skip getAll, redact log

  // Caching (lib sys-client)
  cacheTtlSec?: number; // default 300 (5 minutes)
  staleTtlSec?: number; // default 60 (stale-while-revalidate window for non-sensitive only)
}

/**
 * Default cache TTL constants
 */
export const DEFAULT_CACHE_TTL_SEC = 300;
export const DEFAULT_STALE_TTL_SEC = 60;

/**
 * Setting Metadata Registry
 *
 * Migrated from aiwm.configuration CONFIG_METADATA + thêm `sensitive` flag
 * cho các key chứa secret (API keys, passwords, tokens).
 */
export const SETTING_METADATA: Record<ConfigKey, SettingKeyMetadata> = {
  // =========================================================================
  // Object Storage - MinIO/S3 (8 keys)
  // =========================================================================
  [ConfigKey.S3_ENDPOINT]: {
    key: ConfigKey.S3_ENDPOINT,
    displayName: 'S3 Endpoint',
    description: 'S3-compatible storage endpoint URL (MinIO, AWS S3)',
    dataType: 'url',
    isRequired: true,
    validation: { pattern: '^https?://.+' },
    example: 'https://minio.example.com',
  },
  [ConfigKey.S3_ACCESS_KEY]: {
    key: ConfigKey.S3_ACCESS_KEY,
    displayName: 'S3 Access Key',
    description: 'S3 access key ID for authentication',
    dataType: 'string',
    isRequired: true,
    validation: { minLength: 3, maxLength: 128 },
    example: 'AKIAIOSFODNN7EXAMPLE',
    sensitive: true,
  },
  [ConfigKey.S3_SECRET_KEY]: {
    key: ConfigKey.S3_SECRET_KEY,
    displayName: 'S3 Secret Key',
    description: 'S3 secret access key for authentication',
    dataType: 'string',
    isRequired: true,
    validation: { minLength: 16 },
    example: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    sensitive: true,
  },
  [ConfigKey.S3_BUCKET_MODELS]: {
    key: ConfigKey.S3_BUCKET_MODELS,
    displayName: 'S3 Bucket for Models',
    description: 'S3 bucket name for storing AI models',
    dataType: 'string',
    isRequired: true,
    validation: { pattern: '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' },
    example: 'hydra-models',
  },
  [ConfigKey.S3_BUCKET_LOGS]: {
    key: ConfigKey.S3_BUCKET_LOGS,
    displayName: 'S3 Bucket for Logs',
    description: 'S3 bucket name for storing logs',
    dataType: 'string',
    isRequired: false,
    validation: { pattern: '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' },
    example: 'hydra-logs',
  },
  [ConfigKey.S3_BUCKET_FILES]: {
    key: ConfigKey.S3_BUCKET_FILES,
    displayName: 'S3 Bucket for Files',
    description: 'S3 bucket name for storing chat file uploads',
    dataType: 'string',
    isRequired: false,
    validation: { pattern: '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' },
    example: 'hydra-files',
  },
  [ConfigKey.S3_REGION]: {
    key: ConfigKey.S3_REGION,
    displayName: 'S3 Region',
    description: 'S3 region (for AWS S3)',
    dataType: 'string',
    isRequired: false,
    defaultValue: 'us-east-1',
    example: 'us-east-1',
    cacheTtlSec: 3600, // very stable
  },
  [ConfigKey.S3_USE_SSL]: {
    key: ConfigKey.S3_USE_SSL,
    displayName: 'S3 Use SSL',
    description: 'Use SSL/TLS for S3 connection',
    dataType: 'boolean',
    isRequired: false,
    defaultValue: 'true',
    validation: { enum: ['true', 'false'] },
    example: 'true',
    cacheTtlSec: 3600,
  },

  // =========================================================================
  // SMTP Email (7 keys)
  // =========================================================================
  [ConfigKey.SMTP_HOST]: {
    key: ConfigKey.SMTP_HOST,
    displayName: 'SMTP Host',
    description: 'SMTP server hostname',
    dataType: 'string',
    isRequired: true,
    example: 'smtp.gmail.com',
  },
  [ConfigKey.SMTP_PORT]: {
    key: ConfigKey.SMTP_PORT,
    displayName: 'SMTP Port',
    description: 'SMTP server port (25, 465 SSL, 587 TLS)',
    dataType: 'number',
    isRequired: true,
    defaultValue: '587',
    validation: { min: 1, max: 65535 },
    example: '587',
  },
  [ConfigKey.SMTP_USER]: {
    key: ConfigKey.SMTP_USER,
    displayName: 'SMTP Username',
    description: 'SMTP authentication username',
    dataType: 'string',
    isRequired: true,
    example: 'notifications@example.com',
  },
  [ConfigKey.SMTP_PASSWORD]: {
    key: ConfigKey.SMTP_PASSWORD,
    displayName: 'SMTP Password',
    description: 'SMTP authentication password',
    dataType: 'string',
    isRequired: true,
    validation: { minLength: 1 },
    example: 'app-specific-password',
    sensitive: true,
  },
  [ConfigKey.SMTP_FROM_EMAIL]: {
    key: ConfigKey.SMTP_FROM_EMAIL,
    displayName: 'SMTP From Email',
    description: 'Email address to use as sender',
    dataType: 'email',
    isRequired: true,
    validation: { pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' },
    example: 'noreply@hydra.ai',
  },
  [ConfigKey.SMTP_FROM_NAME]: {
    key: ConfigKey.SMTP_FROM_NAME,
    displayName: 'SMTP From Name',
    description: 'Sender name to display',
    dataType: 'string',
    isRequired: false,
    defaultValue: 'Hydra AI Platform',
    example: 'Hydra AI Platform',
  },
  [ConfigKey.SMTP_USE_TLS]: {
    key: ConfigKey.SMTP_USE_TLS,
    displayName: 'SMTP Use TLS',
    description: 'Use TLS/STARTTLS for SMTP connection',
    dataType: 'boolean',
    isRequired: false,
    defaultValue: 'true',
    validation: { enum: ['true', 'false'] },
    example: 'true',
  },

  // =========================================================================
  // Discord Webhook (3 keys)
  // =========================================================================
  [ConfigKey.DISCORD_WEBHOOK_URL]: {
    key: ConfigKey.DISCORD_WEBHOOK_URL,
    displayName: 'Discord Webhook URL',
    description: 'Discord webhook URL for sending alerts (URL contains auth token)',
    dataType: 'url',
    isRequired: false,
    validation: { pattern: '^https://discord.com/api/webhooks/.+' },
    example: 'https://discord.com/api/webhooks/123456789/abcdefg...',
    sensitive: true,
  },
  [ConfigKey.DISCORD_ALERT_CHANNEL]: {
    key: ConfigKey.DISCORD_ALERT_CHANNEL,
    displayName: 'Discord Alert Channel',
    description: 'Discord channel name for alerts',
    dataType: 'string',
    isRequired: false,
    example: 'hydra-alerts',
  },
  [ConfigKey.DISCORD_USERNAME]: {
    key: ConfigKey.DISCORD_USERNAME,
    displayName: 'Discord Bot Username',
    description: 'Display name for Discord bot',
    dataType: 'string',
    isRequired: false,
    defaultValue: 'Hydra Bot',
    example: 'Hydra Bot',
  },

  // =========================================================================
  // Telegram Bot (3 keys)
  // =========================================================================
  [ConfigKey.TELEGRAM_BOT_TOKEN]: {
    key: ConfigKey.TELEGRAM_BOT_TOKEN,
    displayName: 'Telegram Bot Token',
    description: 'Telegram bot API token',
    dataType: 'string',
    isRequired: false,
    validation: { pattern: '^[0-9]{8,10}:[A-Za-z0-9_-]{35}$' },
    example: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz',
    sensitive: true,
  },
  [ConfigKey.TELEGRAM_CHAT_ID]: {
    key: ConfigKey.TELEGRAM_CHAT_ID,
    displayName: 'Telegram Chat ID',
    description: 'Telegram chat/channel ID for alerts',
    dataType: 'string',
    isRequired: false,
    example: '-1001234567890',
  },
  [ConfigKey.TELEGRAM_ALERT_ENABLED]: {
    key: ConfigKey.TELEGRAM_ALERT_ENABLED,
    displayName: 'Telegram Alerts Enabled',
    description: 'Enable/disable Telegram alerts',
    dataType: 'boolean',
    isRequired: false,
    defaultValue: 'false',
    validation: { enum: ['true', 'false'] },
    example: 'false',
    cacheTtlSec: 60, // sensitive feature flag, want fast propagation
  },

  // =========================================================================
  // LLM Providers (4 keys)
  // =========================================================================
  [ConfigKey.OPENAI_API_KEY]: {
    key: ConfigKey.OPENAI_API_KEY,
    displayName: 'OpenAI API Key',
    description: 'OpenAI API key for GPT models',
    dataType: 'string',
    isRequired: false,
    validation: { pattern: '^sk-[A-Za-z0-9_-]+$', minLength: 20 },
    example: 'sk-proj-...',
    sensitive: true,
  },
  [ConfigKey.ANTHROPIC_API_KEY]: {
    key: ConfigKey.ANTHROPIC_API_KEY,
    displayName: 'Anthropic API Key',
    description: 'Anthropic API key for Claude models',
    dataType: 'string',
    isRequired: false,
    validation: { pattern: '^sk-ant-[A-Za-z0-9_-]+$', minLength: 20 },
    example: 'sk-ant-api03-...',
    sensitive: true,
  },
  [ConfigKey.ANTHROPIC_OAUTH_TOKEN]: {
    key: ConfigKey.ANTHROPIC_OAUTH_TOKEN,
    displayName: 'Anthropic OAuth Token',
    description: 'Anthropic OAuth token for Claude Agent SDK authentication.',
    dataType: 'string',
    isRequired: false,
    example: 'oauth-token-...',
    sensitive: true,
  },
  [ConfigKey.GROQ_API_KEY]: {
    key: ConfigKey.GROQ_API_KEY,
    displayName: 'Groq API Key',
    description: 'Groq API key for fast inference',
    dataType: 'string',
    isRequired: false,
    validation: { pattern: '^gsk_[A-Za-z0-9_-]+$', minLength: 20 },
    example: 'gsk_...',
    sensitive: true,
  },

  // =========================================================================
  // Service Integrations (6 keys) — base URLs, not sensitive
  // =========================================================================
  [ConfigKey.AIWM_BASE_API_URL]: {
    key: ConfigKey.AIWM_BASE_API_URL,
    displayName: 'AIWM Base API URL',
    description: 'Base URL for AIWM service REST API',
    dataType: 'url',
    isRequired: false,
    validation: { pattern: '^https?://.+' },
    example: 'http://localhost:3003',
    cacheTtlSec: 3600, // service URLs change rarely
  },
  [ConfigKey.AIWM_BASE_MCP_URL]: {
    key: ConfigKey.AIWM_BASE_MCP_URL,
    displayName: 'AIWM Base MCP URL',
    description: 'Base URL for AIWM MCP server',
    dataType: 'url',
    isRequired: false,
    validation: { pattern: '^https?://.+' },
    example: 'http://localhost:3004',
    cacheTtlSec: 3600,
  },
  [ConfigKey.AIWM_BASE_WS_URL]: {
    key: ConfigKey.AIWM_BASE_WS_URL,
    displayName: 'AIWM Base WS URL',
    description: 'Base URL for AIWM WebSocket server',
    dataType: 'url',
    isRequired: false,
    validation: { pattern: '^https?://.+' },
    example: 'http://localhost:3004',
    cacheTtlSec: 3600,
  },
  [ConfigKey.CBM_BASE_API_URL]: {
    key: ConfigKey.CBM_BASE_API_URL,
    displayName: 'CBM Base API URL',
    description: 'Base URL for CBM REST API',
    dataType: 'url',
    isRequired: false,
    validation: { pattern: '^https?://.+' },
    example: 'http://localhost:3001',
    cacheTtlSec: 3600,
  },
  [ConfigKey.IAM_BASE_API_URL]: {
    key: ConfigKey.IAM_BASE_API_URL,
    displayName: 'IAM Base API URL',
    description: 'Base URL for IAM REST API',
    dataType: 'url',
    isRequired: false,
    validation: { pattern: '^https?://.+' },
    example: 'http://localhost:3000',
    cacheTtlSec: 3600,
  },
  [ConfigKey.MONA_BASE_API_URL]: {
    key: ConfigKey.MONA_BASE_API_URL,
    displayName: 'MONA Base API URL',
    description: 'Base URL for MONA REST API',
    dataType: 'url',
    isRequired: false,
    validation: { pattern: '^https?://.+' },
    example: 'http://localhost:3000',
    cacheTtlSec: 3600,
  },

  // =========================================================================
  // Browser Automation (2 keys)
  // =========================================================================
  [ConfigKey.PINCHTAB_API_URL]: {
    key: ConfigKey.PINCHTAB_API_URL,
    displayName: 'PinchTab API URL',
    description: 'URL của PinchTab browser automation service.',
    dataType: 'url',
    isRequired: false,
    validation: { pattern: '^https?://.+' },
    example: 'http://pinchtab:4000',
    cacheTtlSec: 3600,
  },
  [ConfigKey.PINCHTAB_API_KEY]: {
    key: ConfigKey.PINCHTAB_API_KEY,
    displayName: 'PinchTab API Key',
    description: 'API key để xác thực với PinchTab browser automation service.',
    dataType: 'string',
    isRequired: false,
    example: 'ce1f1a1da67dc5d031d4463d53f437fb...',
    sensitive: true,
  },
};
