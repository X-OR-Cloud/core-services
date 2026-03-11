import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AgentWorkerModule } from './agent-worker.module';

/**
 * Bootstrap Agent Worker Mode (agt)
 * - No HTTP server
 * - Loads hosted agents from DB and connects each to /ws/chat
 * - Uses Vercel AI SDK + MCP SSE for tool execution
 */
export async function bootstrapAgentWorker() {
  process.env.MODE = 'agt';

  const logger = new Logger('AgentWorkerBootstrap');

  logger.log('Starting AIWM Agent Worker...');

  const app = await NestFactory.createApplicationContext(AgentWorkerModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  app.enableShutdownHooks();

  const wsUrl = process.env.WS_CHAT_URL || 'http://localhost:3003';
  const mcpUrl = process.env.MCP_SERVER_URL || 'http://localhost:3355';
  const agentIds = process.env.AGENT_IDS ? process.env.AGENT_IDS.split(',').filter(Boolean) : [];

  logger.log('Agent Worker Configuration:');
  logger.log(`  - WS Chat URL: ${wsUrl}`);
  logger.log(`  - MCP Server URL: ${mcpUrl}`);
  logger.log(`  - Agent filter: ${agentIds.length ? agentIds.join(', ') : 'all hosted agents'}`);
  logger.log(`  - MongoDB: ${process.env.MONGODB_URI?.indexOf('@') > 0 ? process.env.MONGODB_URI?.split('@')[1] : process.env.MONGODB_URI}`);

  logger.log('✅ AIWM Agent Worker started successfully');

  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received, shutting down agent worker gracefully...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT received, shutting down agent worker gracefully...');
    await app.close();
    process.exit(0);
  });

  return app;
}
