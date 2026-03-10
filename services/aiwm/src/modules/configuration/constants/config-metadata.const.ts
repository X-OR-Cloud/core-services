import { ConfigKey } from '@hydrabyte/shared';

/**
 * Config Key Metadata Interface
 */
export interface ConfigKeyMetadata {
  key: ConfigKey;
  displayName: string;
  description: string;
  dataType: 'string' | 'number' | 'boolean' | 'url' | 'email';
  isRequired: boolean;
  defaultValue?: string;
  validation?: {
    pattern?: string; // Regex pattern
    minLength?: number;
    maxLength?: number;
    min?: number; // For numbers
    max?: number;
    enum?: string[]; // Allowed values
  };
  example?: string;
}

/**
 * Configuration Metadata Registry
 *
 * Predefined metadata for all 23 configuration keys.
 * Includes validation rules, data types, and examples.
 */
export const CONFIG_METADATA: Record<ConfigKey, ConfigKeyMetadata> = {
  // =========================================================================
  // Object Storage - MinIO/S3 (7 keys)
  // =========================================================================
  [ConfigKey.S3_ENDPOINT]: {
    key: ConfigKey.S3_ENDPOINT,
    displayName: 'S3 Endpoint',
    description: 'S3-compatible storage endpoint URL (MinIO, AWS S3)',
    dataType: 'url',
    isRequired: true,
    validation: {
      pattern: '^https?://.+',
    },
    example: 'https://minio.example.com',
  },

  [ConfigKey.S3_ACCESS_KEY]: {
    key: ConfigKey.S3_ACCESS_KEY,
    displayName: 'S3 Access Key',
    description: 'S3 access key ID for authentication',
    dataType: 'string',
    isRequired: true,
    validation: {
      minLength: 3,
      maxLength: 128,
    },
    example: 'AKIAIOSFODNN7EXAMPLE',
  },

  [ConfigKey.S3_SECRET_KEY]: {
    key: ConfigKey.S3_SECRET_KEY,
    displayName: 'S3 Secret Key',
    description: 'S3 secret access key for authentication',
    dataType: 'string',
    isRequired: true,
    validation: {
      minLength: 16,
    },
    example: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  },

  [ConfigKey.S3_BUCKET_MODELS]: {
    key: ConfigKey.S3_BUCKET_MODELS,
    displayName: 'S3 Bucket for Models',
    description: 'S3 bucket name for storing AI models',
    dataType: 'string',
    isRequired: true,
    validation: {
      pattern: '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$',
    },
    example: 'hydra-models',
  },

  [ConfigKey.S3_BUCKET_LOGS]: {
    key: ConfigKey.S3_BUCKET_LOGS,
    displayName: 'S3 Bucket for Logs',
    description: 'S3 bucket name for storing logs',
    dataType: 'string',
    isRequired: false,
    validation: {
      pattern: '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$',
    },
    example: 'hydra-logs',
  },

  [ConfigKey.S3_REGION]: {
    key: ConfigKey.S3_REGION,
    displayName: 'S3 Region',
    description: 'S3 region (for AWS S3)',
    dataType: 'string',
    isRequired: false,
    defaultValue: 'us-east-1',
    example: 'us-east-1',
  },

  [ConfigKey.S3_USE_SSL]: {
    key: ConfigKey.S3_USE_SSL,
    displayName: 'S3 Use SSL',
    description: 'Use SSL/TLS for S3 connection',
    dataType: 'boolean',
    isRequired: false,
    defaultValue: 'true',
    validation: {
      enum: ['true', 'false'],
    },
    example: 'true',
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
    validation: {
      min: 1,
      max: 65535,
    },
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
    validation: {
      minLength: 1,
    },
    example: 'app-specific-password',
  },

  [ConfigKey.SMTP_FROM_EMAIL]: {
    key: ConfigKey.SMTP_FROM_EMAIL,
    displayName: 'SMTP From Email',
    description: 'Email address to use as sender',
    dataType: 'email',
    isRequired: true,
    validation: {
      pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
    },
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
    validation: {
      enum: ['true', 'false'],
    },
    example: 'true',
  },

  // =========================================================================
  // Discord Webhook (3 keys)
  // =========================================================================
  [ConfigKey.DISCORD_WEBHOOK_URL]: {
    key: ConfigKey.DISCORD_WEBHOOK_URL,
    displayName: 'Discord Webhook URL',
    description: 'Discord webhook URL for sending alerts',
    dataType: 'url',
    isRequired: false,
    validation: {
      pattern: '^https://discord.com/api/webhooks/.+',
    },
    example: 'https://discord.com/api/webhooks/123456789/abcdefg...',
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
    validation: {
      pattern: '^[0-9]{8,10}:[A-Za-z0-9_-]{35}$',
    },
    example: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz',
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
    validation: {
      enum: ['true', 'false'],
    },
    example: 'false',
  },

  // =========================================================================
  // LLM Providers (3 keys)
  // =========================================================================
  [ConfigKey.OPENAI_API_KEY]: {
    key: ConfigKey.OPENAI_API_KEY,
    displayName: 'OpenAI API Key',
    description: 'OpenAI API key for GPT models',
    dataType: 'string',
    isRequired: false,
    validation: {
      pattern: '^sk-[A-Za-z0-9_-]+$',
      minLength: 20,
    },
    example: 'sk-proj-...',
  },

  [ConfigKey.ANTHROPIC_API_KEY]: {
    key: ConfigKey.ANTHROPIC_API_KEY,
    displayName: 'Anthropic API Key',
    description: 'Anthropic API key for Claude models',
    dataType: 'string',
    isRequired: false,
    validation: {
      pattern: '^sk-ant-[A-Za-z0-9_-]+$',
      minLength: 20,
    },
    example: 'sk-ant-api03-...',
  },

  [ConfigKey.GROQ_API_KEY]: {
    key: ConfigKey.GROQ_API_KEY,
    displayName: 'Groq API Key',
    description: 'Groq API key for fast inference',
    dataType: 'string',
    isRequired: false,
    validation: {
      pattern: '^gsk_[A-Za-z0-9_-]+$',
      minLength: 20,
    },
    example: 'gsk_...',
  },

  // =========================================================================
  // Service Integrations (3 keys)
  // =========================================================================
  [ConfigKey.AIWM_BASE_API_URL]: {
    key: ConfigKey.AIWM_BASE_API_URL,
    displayName: 'AIWM Base API URL',
    description: 'Base URL for AIWM service REST API',
    dataType: 'url',
    isRequired: false,
    validation: {
      pattern: '^https?://.+',
    },
    example: 'http://localhost:3003',
  },

  [ConfigKey.AIWM_BASE_MCP_URL]: {
    key: ConfigKey.AIWM_BASE_MCP_URL,
    displayName: 'AIWM Base MCP URL',
    description: 'Base URL for AIWM MCP server',
    dataType: 'url',
    isRequired: false,
    validation: {
      pattern: '^https?://.+',
    },
    example: 'http://localhost:3004',
  },

   [ConfigKey.AIWM_BASE_WS_URL]: {
    key: ConfigKey.AIWM_BASE_WS_URL,
    displayName: 'AIWM Base WS URL',
    description: 'Base URL for AIWM WebSocket server',
    dataType: 'url',
    isRequired: false,
    validation: {
      pattern: '^https?://.+',
    },
    example: 'http://localhost:3004',
  },

  [ConfigKey.CBM_BASE_API_URL]: {
    key: ConfigKey.CBM_BASE_API_URL,
    displayName: 'CBM Base API URL',
    description: 'Base URL for CBM (Core Business Management) REST API',
    dataType: 'url',
    isRequired: false,
    validation: {
      pattern: '^https?://.+',
    },
    example: 'http://localhost:3001',
  },

  [ConfigKey.IAM_BASE_API_URL]: {
    key: ConfigKey.IAM_BASE_API_URL,
    displayName: 'IAM Base API URL',
    description: 'Base URL for IAM (Identity & Access Management) REST API',
    dataType: 'url',
    isRequired: false,
    validation: {
      pattern: '^https?://.+',
    },
    example: 'http://localhost:3000',
  },

    [ConfigKey.MONA_BASE_API_URL]: {
    key: ConfigKey.MONA_BASE_API_URL,
    displayName: 'MONA Base API URL',
    description: 'Base URL for MONA (Monitoring and Alerting) REST API',
    dataType: 'url',
    isRequired: false,
    validation: {
      pattern: '^https?://.+',
    },
    example: 'http://localhost:3000',
  },
};
