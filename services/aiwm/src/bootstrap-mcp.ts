/**
 * MCP Server Bootstrap
 * Standalone MCP protocol server for AI agent integration
 *
 * Architecture: McpServer per-session
 * - Each client session gets its own McpServer + Transport instance
 * - Tools are registered per-session based on the agent's token
 * - Token is always fresh (from the current request, not cached)
 * - Multiple clients can connect simultaneously without conflicts
 * - Scale-friendly: no shared state between instances
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from './app/app.module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { randomUUID } from 'node:crypto';
import { ToolService } from './modules/tool/tool.service';
import { AgentService } from './modules/agent/agent.service';
import { ConfigurationService } from './modules/configuration/configuration.service';
import { ConfigKey as ConfigKeyEnum } from './modules/configuration/enums/config-key.enum';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import * as z from 'zod';
import { Tool } from './modules/tool/tool.schema';
import { getBuiltInToolsByCategory } from './mcp/builtin';
import { ExecutionContext as BuiltInExecutionContext } from './mcp/types';

const logger = new Logger('McpBootstrap');
const MCP_PORT = parseInt(process.env.PORT || process.env.MCP_PORT || '3355', 10);

/**
 * Session data — each client connection gets its own isolated session
 */
interface SessionData {
  mcpServer: McpServer;
  transport: StreamableHTTPServerTransport;
  agentId: string;
  orgId: string;
  bearerToken: string;
  createdAt: number;
}

export async function bootstrapMcpServer() {
  logger.log('=== Step 1: Starting NestJS Application Context ===');

  // Create NestJS application context (DI only, no HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  logger.log('✅ NestJS application context created successfully');

  // Log connection information
  const mongoUri = process.env.MONGODB_URI || 'mongodb://172.16.3.20:27017';
  const redisHost = process.env.REDIS_HOST || '172.16.2.100';
  const redisPort = process.env.REDIS_PORT || '6379';

  logger.log(`💾 MongoDB: ${mongoUri}`);
  logger.log(`📊 Redis: ${redisHost}:${redisPort}`);
  logger.log(`✅ Step 1 completed - NestJS context running`);

  // Get services from NestJS context
  const jwtService = app.get(JwtService);
  const toolService = app.get(ToolService);
  const agentService = app.get(AgentService);
  const configService = app.get(ConfigurationService);
  logger.log('✅ Services injected from NestJS context');

  // ====== Helper Functions ======

  /**
   * Validate bearer token and return decoded payload
   */
  const validateBearerToken = async (
    authHeader: string | undefined
  ): Promise<any> => {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Missing or invalid Authorization header');
    }
    const token = authHeader.substring(7);
    try {
      const decoded = await jwtService.verifyAsync(token);
      return decoded;
    } catch (error) {
      logger.error('JWT verification failed:', error.message);
      throw new Error(`Invalid or expired token: ${error.message}`);
    }
  };

  /**
   * Execute API tools (non-builtin tools with execution config)
   */
  const executeApiTool = async (tool: any, args: any, tokenPayload: any) => {
    const execution = tool.execution;
    if (!execution) {
      throw new Error(`Tool ${tool.name} has no execution configuration`);
    }

    const {
      method,
      baseUrl,
      path,
      headers = {},
      authRequired = true,
    } = execution;

    // Replace path parameters with arguments
    let finalPath = path;
    for (const [key, value] of Object.entries(args)) {
      finalPath = finalPath.replace(
        `{${key}}`,
        encodeURIComponent(String(value))
      );
    }

    const url = `${baseUrl}${finalPath}`;
    const requestHeaders: Record<string, string> = { ...headers };

    // Add JWT token if required
    if (authRequired && tokenPayload) {
      const serviceToken = await jwtService.signAsync({
        sub: tokenPayload.sub,
        username: tokenPayload.username,
        status: tokenPayload.status,
        roles: tokenPayload.roles,
        orgId: tokenPayload.orgId,
        groupId: tokenPayload.groupId,
        agentId: tokenPayload.agentId,
        userId: tokenPayload.userId,
        type: tokenPayload.type,
      });
      requestHeaders['Authorization'] = `Bearer ${serviceToken}`;
    }

    logger.log(`📡 Calling API: ${method} ${url}`);

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API call failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const contentType = response.headers.get('content-type') || '';
    let content: string;

    if (contentType.includes('application/json')) {
      const json = await response.json();
      content = JSON.stringify(json, null, 2);
    } else {
      content = await response.text();
    }

    logger.log(
      `✅ API call successful, response length: ${content.length} bytes`
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: content,
        },
      ],
    };
  };

  /**
   * Fetch service URLs from configuration
   */
  const fetchServiceUrls = async (orgId: string, context: RequestContext) => {
    let cbmBaseUrl = 'http://localhost:3001';
    let iamBaseUrl = 'http://localhost:3000';
    let aiwmBaseUrl = 'http://localhost:3003';

    // Fetch CBM Base URL
    try {
      const cbmConfig = await configService.findByKey(ConfigKeyEnum.CBM_BASE_API_URL as any, context);
      if (cbmConfig && cbmConfig.value) {
        cbmBaseUrl = cbmConfig.value;
        logger.log(`📍 CBM Base URL from config: ${cbmBaseUrl}`);
      } else {
        logger.warn(`⚠️  No config for ${ConfigKeyEnum.CBM_BASE_API_URL}, using default: ${cbmBaseUrl}`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Error fetching CBM base URL:`, errorMsg);
    }

    // Fetch IAM Base URL
    try {
      const iamConfig = await configService.findByKey(ConfigKeyEnum.IAM_BASE_API_URL as any, context);
      if (iamConfig && iamConfig.value) {
        iamBaseUrl = iamConfig.value;
        logger.log(`📍 IAM Base URL from config: ${iamBaseUrl}`);
      } else {
        logger.warn(`⚠️  No config for ${ConfigKeyEnum.IAM_BASE_API_URL}, using default: ${iamBaseUrl}`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Error fetching IAM base URL:`, errorMsg);
    }

    // Fetch AIWM Base URL
    try {
      const aiwmConfig = await configService.findByKey(ConfigKeyEnum.AIWM_BASE_API_URL as any, context);
      if (aiwmConfig && aiwmConfig.value) {
        aiwmBaseUrl = aiwmConfig.value;
        logger.log(`📍 AIWM Base URL from config: ${aiwmBaseUrl}`);
      } else {
        logger.warn(`⚠️  No config for ${ConfigKeyEnum.AIWM_BASE_API_URL}, using default: ${aiwmBaseUrl}`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Error fetching AIWM base URL:`, errorMsg);
    }

    return { cbmBaseUrl, iamBaseUrl, aiwmBaseUrl };
  };

  /**
   * Create a new McpServer instance and register tools for a specific agent session.
   * Each session gets its own isolated McpServer with tools based on the agent's permissions.
   */
  const createSessionMcpServer = async (
    tokenPayload: any,
    bearerToken: string
  ): Promise<McpServer> => {
    const { orgId, agentId, userId, roles, groupId } = tokenPayload;

    // Create a fresh McpServer for this session
    const sessionMcpServer = new McpServer({
      name: 'aiwm-mcp-server',
      version: '1.0.0',
      description: 'AIWM MCP Server for AI agent integration',
      websiteUrl: 'https://x-or.cloud',
    });

    logger.log(`📋 Creating session McpServer for agent: ${agentId} (org: ${orgId})`);

    // Build request context from token payload
    const context: RequestContext = {
      userId: userId || '',
      orgId: orgId || '',
      agentId: agentId || '',
      groupId: groupId || '',
      appId: '',
      roles: roles || [],
    };

    // Fetch agent to get allowedToolIds
    const agent = await agentService.findById(agentId, context);
    if (!agent) {
      logger.warn(`Agent not found: ${agentId}, returning empty McpServer`);
      return sessionMcpServer;
    }

    logger.log(
      `✅ Agent found: ${agent.name}, allowedToolIds: ${agent.allowedToolIds?.length || 0}`
    );

    // If no allowed tools, return empty server
    if (!agent.allowedToolIds || agent.allowedToolIds.length === 0) {
      logger.log(`⚠️  Agent has no allowed tools`);
      return sessionMcpServer;
    }

    // Fetch active tools from allowedToolIds whitelist
    const toolObjectIds = agent.allowedToolIds.map(id => new Types.ObjectId(id));
    const findToolResult = await toolService.findAll(
      {
        filter: {
          _id: { $in: toolObjectIds },
          status: 'active',
        },
        limit: 100,
      },
      context
    );
    const tools: Tool[] = findToolResult?.data ?? [];
    logger.log(`✅ Found ${tools.length} active tools for agent ${agentId}`);

    // Register each tool on this session's McpServer
    for (const tool of tools) {
      // Handle builtin tools — register all sub-tools from category
      if (tool.type === 'builtin') {
        const builtinTools = getBuiltInToolsByCategory(tool.name);

        if (builtinTools.length === 0) {
          logger.warn(`⚠️  No builtin tools found for category: ${tool.name}`);
          continue;
        }

        logger.log(`📦 Registering ${builtinTools.length} builtin tools from category: ${tool.name}`);

        for (const builtinTool of builtinTools) {
          sessionMcpServer.registerTool(
            builtinTool.name,
            {
              title: builtinTool.name,
              description: builtinTool.description,
              inputSchema: builtinTool.inputSchema,
            },
            async (args) => {
              logger.log(`🔧 Executing builtin tool: ${builtinTool.name}`);
              logger.debug(`Tool args:`, args);

              try {
                // Fetch service URLs dynamically on each execution
                const execContext: RequestContext = {
                  userId: tokenPayload.userId || tokenPayload.sub || '',
                  orgId: tokenPayload.orgId || '',
                  agentId: tokenPayload.agentId || '',
                  groupId: tokenPayload.groupId || '',
                  appId: '',
                  roles: tokenPayload.roles || [],
                };

                const serviceUrls = await fetchServiceUrls(tokenPayload.orgId, execContext);

                // Build execution context with session's token
                const executionContext: BuiltInExecutionContext = {
                  token: bearerToken,
                  userId: tokenPayload.userId || tokenPayload.sub,
                  orgId: tokenPayload.orgId,
                  agentId: tokenPayload.agentId,
                  groupId: tokenPayload.groupId,
                  roles: tokenPayload.roles,
                  cbmBaseUrl: serviceUrls.cbmBaseUrl,
                  iamBaseUrl: serviceUrls.iamBaseUrl,
                  aiwmBaseUrl: serviceUrls.aiwmBaseUrl,
                };

                return await builtinTool.executor(args, executionContext);
              } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error(`Builtin tool execution error for ${builtinTool.name}:`, error);
                return {
                  content: [
                    {
                      type: 'text' as const,
                      text: `Error executing builtin tool ${builtinTool.name}: ${errorMessage}`,
                    },
                  ],
                  isError: true,
                };
              }
            }
          );

          logger.log(`  ✅ Registered: ${builtinTool.name}`);
        }

        continue;
      }

      // Handle non-builtin tools (api, mcp, custom)
      const inputSchema = tool.schema?.inputSchema || {};

      // Convert JSON Schema to Zod schema (simplified)
      const zodInputSchema: Record<string, z.ZodString> = {};
      if (
        inputSchema &&
        typeof inputSchema === 'object' &&
        'properties' in inputSchema
      ) {
        const props = inputSchema.properties as Record<string, any>;
        for (const key in props) {
          zodInputSchema[key] = z
            .string()
            .describe(props[key].description || key);
        }
      }

      sessionMcpServer.registerTool(
        tool.name,
        {
          title: tool.name,
          description: tool.description,
          inputSchema:
            Object.keys(zodInputSchema).length > 0 ? zodInputSchema : undefined,
        },
        async (args) => {
          logger.log(`🔧 Executing tool: ${tool.name} (type: ${tool.type})`);
          logger.debug(`Tool args:`, args);

          try {
            if (tool.type === 'api') {
              return await executeApiTool(tool, args, tokenPayload);
            } else if (tool.type === 'mcp') {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `MCP tool ${tool.name} execution not yet implemented`,
                  },
                ],
              };
            } else if (tool.type === 'custom') {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `Custom tool ${tool.name} execution not yet implemented`,
                  },
                ],
              };
            } else {
              throw new Error(`Unknown tool type: ${tool.type}`);
            }
          } catch (error: any) {
            logger.error(`Tool execution error for ${tool.name}:`, error);
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Error executing tool ${tool.name}: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      logger.log(`✅ Registered tool: ${tool.name} (${tool.type})`);
    }

    logger.log(`✅ Session McpServer ready for agent: ${agentId} with ${tools.length} tool categories`);
    return sessionMcpServer;
  };

  // ====== Express App Setup ======

  logger.log('=== Step 2: Setting up Express with Streamable HTTP transport ===');

  // Host header validation
  const allowedHosts = process.env.MCP_ALLOWED_HOSTS
    ? process.env.MCP_ALLOWED_HOSTS.split(',').map(h => h.trim())
    : ['localhost', '127.0.0.1', '[::1]', 'xsai-mcp.x-or.cloud', 'api.x-or.cloud'];

  const expressApp = process.env.ALLOW_ALL_HOSTS === 'true'
    ? createMcpExpressApp()
    : createMcpExpressApp({ allowedHosts });

  if (process.env.ALLOW_ALL_HOSTS === 'true') {
    logger.warn('⚠️  Host validation DISABLED - all hosts allowed (not recommended for production)');
  } else {
    logger.log(`🔒 Host validation enabled for: ${allowedHosts.join(', ')}`);
  }

  // Trust proxy - required when behind nginx/load balancer
  expressApp.set('trust proxy', true);

  // Enable CORS
  expressApp.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, mcp-session-id, mcp-protocol-version'
    );
    res.header('Access-Control-Expose-Headers', 'mcp-session-id');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // ====== Session Management ======

  // Track sessions: sessionId -> SessionData
  const sessions = new Map<string, SessionData>();

  // Cleanup sessions after 30 minutes of inactivity
  const SESSION_TIMEOUT = 30 * 60 * 1000;
  const sessionTimers = new Map<string, NodeJS.Timeout>();

  const cleanupSession = async (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (session) {
      logger.log(`🧹 Cleaning up session: ${sessionId} (agent: ${session.agentId})`);
      try {
        await session.transport.close();
      } catch (error) {
        logger.warn(`Error closing transport for session ${sessionId}:`, error);
      }
      try {
        await session.mcpServer.close();
      } catch (error) {
        logger.warn(`Error closing McpServer for session ${sessionId}:`, error);
      }
      sessions.delete(sessionId);
    }
    const timer = sessionTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      sessionTimers.delete(sessionId);
    }
  };

  const resetSessionTimeout = (sessionId: string) => {
    const existingTimer = sessionTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    const timer = setTimeout(() => cleanupSession(sessionId), SESSION_TIMEOUT);
    sessionTimers.set(sessionId, timer);
  };

  // ====== Request Handlers ======

  // POST — main MCP protocol handler
  expressApp.post('/', async (req, res) => {
    try {
      logger.debug(`Incoming request: ${req.body?.method || 'unknown'}`);

      // Validate bearer token
      const authHeader = req.headers.authorization as string | undefined;
      let userContext: any;

      try {
        userContext = await validateBearerToken(authHeader);
        logger.log(
          `✅ Token validated for agent: ${
            userContext.agentId || userContext.sub
          } (org: ${userContext.orgId})`
        );
      } catch (error) {
        logger.error('Authentication failed:', error);
        return res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Authentication required' },
          id: null,
        });
      }

      const bearerToken = authHeader?.substring(7) || '';

      // Get or create session
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let session: SessionData;

      if (sessionId && sessions.has(sessionId)) {
        // Reuse existing session
        session = sessions.get(sessionId)!;
        logger.debug(`♻️  Reusing session: ${sessionId} (agent: ${session.agentId})`);
        resetSessionTimeout(sessionId);
      } else {
        // Create new session with its own McpServer
        const newSessionId = randomUUID();
        logger.log(`🆕 Creating new session: ${newSessionId} for agent: ${userContext.agentId}`);

        try {
          // Create McpServer with tools for this agent
          const sessionMcpServer = await createSessionMcpServer(userContext, bearerToken);

          // Create transport
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => newSessionId,
          });

          // Connect transport to this session's McpServer
          await sessionMcpServer.connect(transport);

          session = {
            mcpServer: sessionMcpServer,
            transport,
            agentId: userContext.agentId || userContext.sub,
            orgId: userContext.orgId,
            bearerToken,
            createdAt: Date.now(),
          };

          sessions.set(newSessionId, session);
          resetSessionTimeout(newSessionId);

          logger.log(`✅ Session created: ${newSessionId}`);
        } catch (error) {
          logger.error('Failed to create session:', error);
          return res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Failed to initialize session' },
            id: null,
          });
        }
      }

      // Handle the request via the session's transport
      await session.transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // DELETE — session termination (MCP protocol spec)
  expressApp.delete('/', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      logger.log(`🗑️  Client requested session termination: ${sessionId}`);
      await cleanupSession(sessionId);
      res.status(200).json({ ok: true });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  });

  logger.log('✅ Streamable HTTP transport configured');

  // ====== Start HTTP Server ======

  const server = expressApp.listen(MCP_PORT, () => {
    logger.log(`🚀 MCP Server listening on: http://localhost:${MCP_PORT}`);
    logger.log(`📡 Protocol: Streamable HTTP (POST + SSE)`);
    logger.log(`🔀 Architecture: McpServer per-session (multi-client ready)`);
    logger.log('💡 Press Ctrl+C to stop');
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.log('Shutting down gracefully...');

    // Close all sessions
    for (const [sessionId] of sessions) {
      await cleanupSession(sessionId);
    }

    // Close HTTP server
    server.close(() => {
      logger.log('HTTP server closed');
    });

    // Close NestJS context
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
