/**
 * ecosystem.dev.config.js — DGT DEV processes
 *
 * Source: /usr/agents/nyx/workspace/code/dist/services/dgt/main.js
 * MongoDB: localhost:27017  → core_dgt (isolated, local)
 * Redis:   localhost:6381   (local master — port 6379/6380 are slaves, READONLY)
 * Port:    3388 (api)
 *
 * Usage:
 *   pm2 start ecosystem.dev.config.js                           # start api only
 *   pm2 start ecosystem.dev.config.js --only core.dgt.dev.sig  # start specific worker
 *   pm2 reload core.dgt.dev.api                                 # reload after build
 *   pm2 stop ecosystem.dev.config.js                            # stop all dev processes
 *
 * NOTE: REDIS_* vars are explicitly set in env: (not just env_file) to ensure
 * they are available at module init time (pm2 env_file timing issue).
 */

const REDIS_ENV = {
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6381',   // local master (6379/6380 = slaves, READONLY)
  REDIS_PASSWORD: '',
  REDIS_DB: '0',
  REDIS_URL: 'redis://localhost:6381',
};

module.exports = {
  apps: [
    // ─── API ────────────────────────────────────────────────────────────────
    {
      name: 'core.dgt.dev.api',
      script: './dist/services/dgt/main.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'development',
        PORT: 3388,
        SERVICE_NAME: 'dgt',
        ...REDIS_ENV,
      },
      env_file: '.env',
      error_file: './logs/dgt-dev-api-error.log',
      out_file: './logs/dgt-dev-api-out.log',
      merge_logs: true,
    },

    // ─── Scheduler ─────────────────────────────────────────────────────────
    {
      name: 'core.dgt.dev.shd',
      script: './dist/services/dgt/main.js',
      args: 'shd',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '300M',
      autorestart: false,       // start manually: pm2 start ecosystem.dev.config.js --only core.dgt.dev.shd
      env: {
        NODE_ENV: 'development',
        SERVICE_NAME: 'dgt',
        ...REDIS_ENV,
      },
      env_file: '.env',
      error_file: './logs/dgt-dev-shd-error.log',
      out_file: './logs/dgt-dev-shd-out.log',
      merge_logs: true,
    },

    // ─── Data Ingestion ─────────────────────────────────────────────────────
    {
      name: 'core.dgt.dev.ing',
      script: './dist/services/dgt/main.js',
      args: 'ing',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '300M',
      autorestart: false,
      env: {
        NODE_ENV: 'development',
        SERVICE_NAME: 'dgt',
        ...REDIS_ENV,
      },
      env_file: '.env',
      error_file: './logs/dgt-dev-ing-error.log',
      out_file: './logs/dgt-dev-ing-out.log',
      merge_logs: true,
    },

    // ─── Signal Generation ──────────────────────────────────────────────────
    {
      name: 'core.dgt.dev.sig',
      script: './dist/services/dgt/main.js',
      args: 'sig',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '300M',
      autorestart: false,
      env: {
        NODE_ENV: 'development',
        SERVICE_NAME: 'dgt',
        ...REDIS_ENV,
      },
      env_file: '.env',
      error_file: './logs/dgt-dev-sig-error.log',
      out_file: './logs/dgt-dev-sig-out.log',
      merge_logs: true,
    },

    // ─── SL/TP Monitor ─────────────────────────────────────────────────────
    {
      name: 'core.dgt.dev.mon',
      script: './dist/services/dgt/main.js',
      args: 'mon',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '300M',
      autorestart: false,
      env: {
        NODE_ENV: 'development',
        SERVICE_NAME: 'dgt',
        ...REDIS_ENV,
      },
      env_file: '.env',
      error_file: './logs/dgt-dev-mon-error.log',
      out_file: './logs/dgt-dev-mon-out.log',
      merge_logs: true,
    },
  ],
};
