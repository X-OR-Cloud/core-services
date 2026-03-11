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
        PORT: 3310,
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
        PORT: 3311,
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
        PORT: 3320,
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
        PORT: 3330,
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
        PORT: 3331,
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
        PORT: 3332,
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
    // ========== AIWM WebSocket Instances (dedicated for skt.x-or.cloud) ==========
    {
      name: 'core.aiwm.ws00',
      script: './dist/services/aiwm/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3337,
        SERVICE_NAME: 'aiwm',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/aiwm-ws-00-error.log',
      out_file: './logs/aiwm-ws-00-out.log',
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
      name: 'core.aiwm.ws01',
      script: './dist/services/aiwm/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3338,
        SERVICE_NAME: 'aiwm',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/aiwm-ws-01-error.log',
      out_file: './logs/aiwm-ws-01-out.log',
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
      name: 'core.aiwm.ws02',
      script: './dist/services/aiwm/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3339,
        SERVICE_NAME: 'aiwm',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/aiwm-ws-02-error.log',
      out_file: './logs/aiwm-ws-02-out.log',
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
        PORT: 3334,
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
        PORT: 3335,
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
        PORT: 3336,
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
    // ========== AIWM Agent Worker Instances ==========
    {
      name: 'core.aiwm.agt00',
      script: './dist/services/aiwm/main.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',

      env: {
        NODE_ENV: 'production',
        MODE: 'agt',
        SERVICE_NAME: 'aiwm',
        WS_CHAT_URL: 'http://localhost:3337',
        MCP_SERVER_URL: 'http://localhost:3334',
      },

      env_file: '.env',

      error_file: './logs/aiwm-agt-00-error.log',
      out_file: './logs/aiwm-agt-00-out.log',
      merge_logs: true,

      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      kill_timeout: 15000,  // Allow graceful lock release + runner shutdown
      wait_ready: false,
      listen_timeout: 10000,
    },
    {
      name: 'core.aiwm.agt01',
      script: './dist/services/aiwm/main.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',

      env: {
        NODE_ENV: 'production',
        MODE: 'agt',
        SERVICE_NAME: 'aiwm',
        WS_CHAT_URL: 'http://localhost:3338',
        MCP_SERVER_URL: 'http://localhost:3335',
      },

      env_file: '.env',

      error_file: './logs/aiwm-agt-01-error.log',
      out_file: './logs/aiwm-agt-01-out.log',
      merge_logs: true,

      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      kill_timeout: 15000,
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
        PORT: 3340,
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
        PORT: 3341,
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
        PORT: 3342,
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
    },
    // ========== MONA (Monitoring & Analytics) ==========
    {
      name: 'core.mona.api00',
      script: './dist/services/mona/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3350,
        SERVICE_NAME: 'mona',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/mona-api-00-error.log',
      out_file: './logs/mona-api-00-out.log',
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
      name: 'core.mona.api01',
      script: './dist/services/mona/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3351,
        SERVICE_NAME: 'mona',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/mona-api-01-error.log',
      out_file: './logs/mona-api-01-out.log',
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
      name: 'core.mona.worker00',
      script: './dist/services/mona/main.js',
      instances: 1,
      exec_mode: 'fork',  // fork mode for workers
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        MODE: 'worker',
        SERVICE_NAME: 'mona',
        WORKER_CONCURRENCY: '3',  // Process 3 aggregation jobs concurrently
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/mona-worker-00-error.log',
      out_file: './logs/mona-worker-00-out.log',
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
    // ========== SCHD (Scheduler Service) ==========
    {
      name: 'core.schd.api00',
      script: './dist/services/schd/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3360,
        SERVICE_NAME: 'schd',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/schd-api-00-error.log',
      out_file: './logs/schd-api-00-out.log',
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
      name: 'core.schd.api01',
      script: './dist/services/schd/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        PORT: 3361,
        SERVICE_NAME: 'schd',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/schd-api-01-error.log',
      out_file: './logs/schd-api-01-out.log',
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
      name: 'core.schd.worker00',
      script: './dist/services/schd/main.js',
      args: '--mode=worker',
      instances: 1,
      exec_mode: 'fork',  // fork mode for workers
      watch: false,
      max_memory_restart: '500M',

      // Environment variables from .env file
      env: {
        NODE_ENV: 'production',
        MODE: 'worker',
        SERVICE_NAME: 'schd',
      },

      // Load .env file
      env_file: '.env',

      // Logging
      error_file: './logs/schd-worker-00-error.log',
      out_file: './logs/schd-worker-00-out.log',
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
    // ========== DGT (Digital Gold Trader) ==========
    {
      name: 'core.dgt.api00',
      script: './dist/services/dgt/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      env: {
        NODE_ENV: 'production',
        PORT: 3380,
        SERVICE_NAME: 'dgt',
      },

      env_file: '.env',

      error_file: './logs/dgt-api-00-error.log',
      out_file: './logs/dgt-api-00-out.log',
      merge_logs: true,

      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: 'core.dgt.api01',
      script: './dist/services/dgt/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',

      env: {
        NODE_ENV: 'production',
        PORT: 3381,
        SERVICE_NAME: 'dgt',
      },

      env_file: '.env',

      error_file: './logs/dgt-api-01-error.log',
      out_file: './logs/dgt-api-01-out.log',
      merge_logs: true,

      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: 'core.dgt.shd00',
      script: './dist/services/dgt/main.js',
      args: 'shd',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',

      env: {
        NODE_ENV: 'production',
        MODE: 'shd',
        SERVICE_NAME: 'dgt',
      },

      env_file: '.env',

      error_file: './logs/dgt-shd-00-error.log',
      out_file: './logs/dgt-shd-00-out.log',
      merge_logs: true,

      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      kill_timeout: 5000,
      wait_ready: false,
      listen_timeout: 10000,
    },
    {
      name: 'core.dgt.ing00',
      script: './dist/services/dgt/main.js',
      args: 'ing',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',

      env: {
        NODE_ENV: 'production',
        MODE: 'ing',
        SERVICE_NAME: 'dgt',
      },

      env_file: '.env',

      error_file: './logs/dgt-ing-00-error.log',
      out_file: './logs/dgt-ing-00-out.log',
      merge_logs: true,

      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      kill_timeout: 10000,
      wait_ready: false,
      listen_timeout: 10000,
    },
    {
      name: 'core.dgt.sig00',
      script: './dist/services/dgt/main.js',
      args: 'sig',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',

      env: {
        NODE_ENV: 'production',
        MODE: 'sig',
        SERVICE_NAME: 'dgt',
      },

      env_file: '.env',

      error_file: './logs/dgt-sig-00-error.log',
      out_file: './logs/dgt-sig-00-out.log',
      merge_logs: true,

      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      kill_timeout: 10000,
      wait_ready: false,
      listen_timeout: 10000,
    },
    {
      name: 'core.dgt.mon00',
      script: './dist/services/dgt/main.js',
      args: 'mon',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M',

      env: {
        NODE_ENV: 'production',
        MODE: 'mon',
        SERVICE_NAME: 'dgt',
      },

      env_file: '.env',

      error_file: './logs/dgt-mon-00-error.log',
      out_file: './logs/dgt-mon-00-out.log',
      merge_logs: true,

      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      kill_timeout: 10000,
      wait_ready: false,
      listen_timeout: 10000,
    },
  ],
};
