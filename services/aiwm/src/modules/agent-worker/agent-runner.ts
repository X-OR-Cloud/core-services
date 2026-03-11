import { Logger } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { generateText, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import axios from 'axios';

export interface AgentRunnerConfig {
  agentId: string;
  agentName: string;
  accessToken: string;
  instruction: { id: string; systemPrompt: string };
  deployment?: {
    id: string;
    provider: string;
    model: string;
    baseAPIEndpoint: string;
  };
  settings: Record<string, unknown>;
  wsChatUrl: string;
  mcpServerUrl: string;
}

/** Slash commands supported by hosted agents */
const SLASH_RELOAD = '/reload';
const SLASH_STOP = '/stop';

/**
 * AgentRunner — manages a single hosted agent's lifecycle:
 * - WebSocket connection to /ws/chat (as agent)
 * - Message processing via Vercel AI SDK + MCP
 */
export class AgentRunner {
  private readonly logger: Logger;
  private socket: Socket | null = null;
  private conversationId: string | null = null;
  private readonly processingMap = new Map<string, boolean>();
  private readonly abortMap = new Map<string, AbortController>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private isReloading = false;

  private readonly maxConcurrency: number;
  private readonly reconnectDelayMs: number;
  private readonly maxSteps: number;

  constructor(private config: AgentRunnerConfig) {
    this.logger = new Logger(`AgentRunner[${config.agentName}]`);
    this.maxConcurrency = Number(config.settings['hosted_maxConcurrency'] ?? 5);
    this.reconnectDelayMs = Number(config.settings['hosted_reconnectDelayMs'] ?? 5_000);
    this.maxSteps = Number(config.settings['hosted_maxSteps'] ?? 10);
  }

  start() {
    this.connect();
  }

  stop() {
    this.isShuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.logger.log('Stopped');
  }

  get isConnected() {
    return this.socket?.connected ?? false;
  }

  reconnect() {
    if (this.isShuttingDown) return;
    this.logger.log('Reconnecting...');
    this.socket?.disconnect();
    this.socket = null;
    this.connect();
  }

  private connect() {
    if (this.isShuttingDown) return;

    this.socket = io(`${this.config.wsChatUrl}/ws/chat`, {
      auth: { token: this.config.accessToken },
      transports: ['websocket'],
      reconnection: false, // Reconnect handled manually
    });

    this.socket.on('connect', () => {
      this.logger.log(`Connected | socketId=${this.socket?.id}`);
    });

    this.socket.on('connect_error', (err) => {
      this.logger.error(`Connection error: ${err.message}`);
      this.scheduleReconnect();
    });

    this.socket.on('disconnect', (reason) => {
      this.logger.warn(`Disconnected: ${reason}`);
      if (!this.isShuttingDown) {
        this.scheduleReconnect();
      }
    });

    this.socket.on('presence:update', (data: { agentId?: string; conversationId?: string }) => {
      if (data.agentId === this.config.agentId && data.conversationId) {
        this.conversationId = data.conversationId;
        this.logger.log(`Conversation assigned: ${this.conversationId}`);
      }
    });

    this.socket.on('message:new', (message: any) => {
      this.handleMessage(message).catch((err) =>
        this.logger.error(`handleMessage error: ${err.message}`, err.stack),
      );
    });
  }

  private scheduleReconnect() {
    if (this.isShuttingDown || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelayMs);
  }

  private async handleMessage(message: any) {
    // Skip own messages (agent echo)
    if (message.agentId === this.config.agentId || message.role === 'assistant') return;

    const conversationId: string = message.conversationId || this.conversationId;
    if (!conversationId) return;

    const content: string = (message.content ?? '').trim();

    // --- Slash command: /stop ---
    if (content === SLASH_STOP) {
      const controller = this.abortMap.get(conversationId);
      if (controller) {
        controller.abort();
        this.logger.log(`/stop received — aborted generation for ${conversationId}`);
        this.socket?.emit('message:send', {
          conversationId,
          role: 'assistant',
          content: 'Đã dừng. Bạn có thể tiếp tục nhắn tin bất cứ lúc nào.',
        });
      } else {
        this.socket?.emit('message:send', {
          conversationId,
          role: 'assistant',
          content: 'Không có tác vụ nào đang chạy.',
        });
      }
      return;
    }

    // --- Slash command: /reload ---
    if (content === SLASH_RELOAD) {
      if (this.isReloading) {
        this.socket?.emit('message:send', {
          conversationId,
          role: 'assistant',
          content: 'Đang reload, vui lòng chờ...',
        });
        return;
      }
      this.socket?.emit('message:send', {
        conversationId,
        role: 'assistant',
        content: 'Đang reload instruction và MCP tools...',
      });
      const ok = await this.reload();
      this.socket?.emit('message:send', {
        conversationId,
        role: 'assistant',
        content: ok ? 'Reload thành công. Sẵn sàng!' : 'Reload thất bại, giữ nguyên cấu hình cũ.',
      });
      return;
    }

    // Concurrency guard
    const activeCount = [...this.processingMap.values()].filter(Boolean).length;
    if (this.processingMap.get(conversationId) || activeCount >= this.maxConcurrency) {
      this.logger.warn(`Skipping — conversation ${conversationId} busy or at max concurrency`);
      return;
    }

    this.processingMap.set(conversationId, true);
    const abortController = new AbortController();
    this.abortMap.set(conversationId, abortController);

    try {
      this.socket?.emit('message:typing', { conversationId });

      const history = await this.fetchHistory(conversationId);
      const model = this.buildModel();
      const tools = await this.resolveMcpTools();

      const result = await generateText({
        model,
        system: this.config.instruction.systemPrompt,
        messages: history,
        tools,
        stopWhen: stepCountIs(this.maxSteps),
        abortSignal: abortController.signal,
      });

      this.socket?.emit('message:send', {
        conversationId,
        role: 'assistant',
        content: result.text,
      });
    } catch (err: unknown) {
      const e = err as Error;
      if (e?.name === 'AbortError' || abortController.signal.aborted) {
        // Already handled by /stop — no duplicate message
      } else {
        this.logger.error(`AI generation error: ${e.message}`, e.stack);
        this.socket?.emit('message:send', {
          conversationId,
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your message.',
        });
      }
    } finally {
      this.processingMap.set(conversationId, false);
      this.abortMap.delete(conversationId);
    }
  }

  /**
   * Re-fetch instruction, deployment and settings from /agents/:id/connect.
   * Keeps the existing WebSocket connection alive.
   */
  private async reload(): Promise<boolean> {
    this.isReloading = true;
    try {
      const resp = await axios.post(
        `${this.config.wsChatUrl}/agents/${this.config.agentId}/connect`,
        { secret: undefined }, // hosted agents connect via accessToken internally — call with current token
        { headers: { Authorization: `Bearer ${this.config.accessToken}` } },
      );
      const { accessToken, instruction, deployment, settings } = resp.data;
      this.config = {
        ...this.config,
        accessToken: accessToken ?? this.config.accessToken,
        instruction: instruction ?? this.config.instruction,
        deployment: deployment ?? this.config.deployment,
        settings: settings ?? this.config.settings,
      };
      this.logger.log('Reloaded instruction and MCP config');
      return true;
    } catch (err: unknown) {
      this.logger.error(`Reload failed: ${(err as Error).message}`);
      return false;
    } finally {
      this.isReloading = false;
    }
  }

  /**
   * Resolve tools from MCP server using @modelcontextprotocol/sdk.
   * Returns Vercel AI SDK compatible tool definitions.
   */
  private async resolveMcpTools(): Promise<Record<string, any>> {
    const mcpClient = new McpClient({
      name: `aiwm-hosted-${this.config.agentId}`,
      version: '1.0.0',
    });
    const transport = new StreamableHTTPClientTransport(
      new URL(`${this.config.mcpServerUrl}/mcp`),
      { requestInit: { headers: { Authorization: `Bearer ${this.config.accessToken}` } } },
    );

    try {
      await mcpClient.connect(transport);
      const { tools: mcpTools } = await mcpClient.listTools();

      const toolMap: Record<string, any> = {};
      for (const mcpTool of mcpTools) {
        const toolName = mcpTool.name;
        const toolDescription = mcpTool.description ?? '';
        // Build tool as plain object matching Vercel AI SDK ToolV1 shape
        toolMap[toolName] = {
          description: toolDescription,
          parameters: z.object({}).passthrough(),
          execute: async (args: Record<string, unknown>) => {
            const resp = await mcpClient.callTool({ name: toolName, arguments: args });
            return resp.content;
          },
        };
      }

      return toolMap;
    } catch (err) {
      this.logger.warn(`MCP tool resolution failed: ${err.message}`);
      return {};
    } finally {
      await mcpClient.close().catch(() => {});
    }
  }

  /**
   * Convert MCP JSON Schema properties to flat Zod shape.
   */
  private mcpInputSchemaToZod(
    inputSchema: { properties?: Record<string, any>; required?: string[] },
  ): Record<string, z.ZodTypeAny> {
    const shape: Record<string, z.ZodTypeAny> = {};
    const required = new Set(inputSchema.required ?? []);

    for (const [key, prop] of Object.entries(inputSchema.properties ?? {})) {
      let zodType: z.ZodTypeAny;
      switch (prop.type) {
        case 'number':
        case 'integer':
          zodType = z.number().describe(prop.description ?? '');
          break;
        case 'boolean':
          zodType = z.boolean().describe(prop.description ?? '');
          break;
        case 'array':
          zodType = z.array(z.any()).describe(prop.description ?? '');
          break;
        default:
          zodType = z.string().describe(prop.description ?? '');
      }
      shape[key] = required.has(key) ? zodType : zodType.optional();
    }

    return shape;
  }

  private buildModel() {
    const { deployment } = this.config;

    if (deployment?.baseAPIEndpoint) {
      // Route through AIWM deployment proxy (OpenAI-compatible)
      const openai = createOpenAI({
        baseURL: deployment.baseAPIEndpoint,
        apiKey: this.config.accessToken,
      });
      return openai(deployment.model);
    }

    // Fallback: direct OpenAI
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' });
    return openai('gpt-4o-mini');
  }

  /**
   * Fetch recent message history from AIWM REST API.
   * Returns Vercel AI SDK CoreMessage array.
   */
  private async fetchHistory(conversationId: string): Promise<any[]> {
    try {
      const resp = await axios.get(`${this.config.wsChatUrl}/messages`, {
        params: { conversationId, limit: 20, sort: 'createdAt:asc' },
        headers: { Authorization: `Bearer ${this.config.accessToken}` },
      });

      const messages: any[] = resp.data?.data || resp.data || [];
      return messages
        .filter((m: any) => m.role === 'user' || m.role === 'assistant')
        .map((m: any) => ({ role: m.role, content: m.content }));
    } catch (err) {
      this.logger.warn(`Failed to fetch history: ${err.message}`);
      return [];
    }
  }
}
