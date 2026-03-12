/**
 * AIWM Service - AI Workflow Management Platform
 * Demonstrates GPU Node Management, Model Deployment, Agent Framework, and MCP Tool Integration
 *
 * Supports four modes:
 * - API mode (default): Full HTTP/WebSocket API server
 * - MCP mode: MCP protocol server for AI agent integration
 * - Worker mode: BullMQ worker for async job processing
 * - Agent mode: Hosted agent workers connecting to /ws/chat
 */

import { Logger } from '@nestjs/common';
import { validateEnvironment } from './core/utils/env-validator.util';

const MODE = process.env.MODE || process.argv[2] || 'api';

async function bootstrap() {
  if (MODE === 'mcp') {
    // MCP Standalone Server mode
    const { bootstrapMcpServer } = await import('./bootstrap-mcp');
    await bootstrapMcpServer();
  } else if (MODE === 'worker') {
    // Worker mode - Process queue jobs only
    const { bootstrapWorker } = await import('./bootstrap-worker');
    await bootstrapWorker();
  } else if (MODE === 'agt') {
    // Agent mode - Run hosted agents connected to /ws/chat
    const { bootstrapAgentWorker } = await import('./bootstrap-agent');
    await bootstrapAgentWorker();
  } else if (MODE === 'con') {
    // Connection mode - Bridge Discord/Telegram to AIWM pipeline
    const { bootstrapConnectionWorker } = await import('./bootstrap-connection');
    await bootstrapConnectionWorker();
  } else {
    // API Server mode (default)
    const { bootstrapApiServer } = await import('./bootstrap-api');
    await bootstrapApiServer();
  }
}

// Validate environment variables before starting
// validateEnvironment();
bootstrap().catch((error) => {
  Logger.error('Failed to start AIWM Service:', error);
  process.exit(1);
});
