module.exports = {
  apps: [
    {
      name: 'core.iam.api00',
      script: './dist/services/iam/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3300,
        SERVICE_NAME: 'iam',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/iam-api-00-error.log',
      out_file: './logs/iam-api-00-out.log',
      //log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Advanced settings
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },{
      name: 'core.iam.api01',
      script: './dist/services/iam/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3301,
        SERVICE_NAME: 'iam',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/iam-api-01-error.log',
      out_file: './logs/iam-api-01-out.log',
      //log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Advanced settings
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },{
      name: 'core.noti.api00',
      script: './dist/services/noti/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3310,
        SERVICE_NAME: 'noti',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/noti-api-00-error.log',
      out_file: './logs/noti-api-00-out.log',
      //log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Advanced settings
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: 'core.aiwm.api00',
      script: './dist/services/aiwm/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3350,
        SERVICE_NAME: 'aiwm',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/aiwm-api-00-error.log',
      out_file: './logs/aiwm-api-00-out.log',
      //log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Advanced settings
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: 'core.aiwm.api01',
      script: './dist/services/aiwm/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3351,
        SERVICE_NAME: 'aiwm',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/aiwm-api-01-error.log',
      out_file: './logs/aiwm-api-01-out.log',
      //log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Advanced settings
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: 'core.aiwm.api02',
      script: './dist/services/aiwm/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3352,
        SERVICE_NAME: 'aiwm',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/aiwm-api-02-error.log',
      out_file: './logs/aiwm-api-02-out.log',
      //log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Advanced settings
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: 'core.aiwm.mcp00',
      script: './dist/services/aiwm/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3355,
        MODE: 'mcp',
        SERVICE_NAME: 'aiwm',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/aiwm-mcp-00-error.log',
      out_file: './logs/aiwm-mcp-00-out.log',
      //log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Advanced settings
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: 'core.aiwm.mcp01',
      script: './dist/services/aiwm/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3356,
        MODE: 'mcp',
        SERVICE_NAME: 'aiwm',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/aiwm-mcp-01-error.log',
      out_file: './logs/aiwm-mcp-01-out.log',
      //log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Advanced settings
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: 'core.aiwm.mcp02',
      script: './dist/services/aiwm/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3357,
        MODE: 'mcp',
        SERVICE_NAME: 'aiwm',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/aiwm-mcp-02-error.log',
      out_file: './logs/aiwm-mcp-02-out.log',
      //log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Advanced settings
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: 'core.aiwm.worker00',
      script: './dist/services/aiwm/main.js',
      instances: 1,
      exec_mode: 'fork',  // fork mode for workers
      watch: false,
      max_memory_restart: '1G',  // Workers need more memory for LLM processing

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        MODE: 'worker',
        SERVICE_NAME: 'aiwm',
        WORKER_CONCURRENCY: '5',  // Process 5 jobs concurrently
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/aiwm-worker-00-error.log',
      out_file: './logs/aiwm-worker-00-out.log',
      //log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Advanced settings
      kill_timeout: 10000,  // Longer timeout for graceful job completion
      wait_ready: false,  // Workers don't listen on ports
      listen_timeout: 10000,
    },
    {
      name: 'core.aiwm.worker01',
      script: './dist/services/aiwm/main.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',

      env: {
        NODE_ENV: 'production',
        MODE: 'worker',
        SERVICE_NAME: 'aiwm',
        WORKER_CONCURRENCY: '5',
      },

      env_file: '.env',

      error_file: './logs/aiwm-worker-01-error.log',
      out_file: './logs/aiwm-worker-01-out.log',
      merge_logs: true,

      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      kill_timeout: 10000,
      wait_ready: false,
      listen_timeout: 10000,
    },
    {
      name: 'core.cbm.api00',
      script: './dist/services/cbm/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3360,
        SERVICE_NAME: 'cbm',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/cbm-api-00-error.log',
      out_file: './logs/cbm-api-00-out.log',
      //log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Advanced settings
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: 'core.cbm.api01',
      script: './dist/services/cbm/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3361,
        SERVICE_NAME: 'cbm',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/cbm-api-01-error.log',
      out_file: './logs/cbm-api-01-out.log',
      //log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Advanced settings
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: 'core.cbm.api02',
      script: './dist/services/cbm/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3362,
        SERVICE_NAME: 'cbm',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/cbm-api-02-error.log',
      out_file: './logs/cbm-api-02-out.log',
      //log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Advanced settings
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    }
  ],
};
