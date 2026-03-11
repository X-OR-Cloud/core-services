import { Logger } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { generateText, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import axios from 'axios';

export interface McpServerConfig {
  type: string;
  url: string;
  headers: Record<string, string>;
}

export interface AgentConnectResult {
  accessToken: string;
  instruction: { id: string; systemPrompt: string };
  deployment?: { id: string; provider: string; model: string; baseAPIEndpoint: string };
  settings: Record<string, unknown>;
  mcpServers?: Record<string, McpServerConfig>;
}

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
  mcpServers: Record<string, McpServerConfig>;
  wsChatUrl: string;
  /** In-process connect callback — avoids HTTP round-trip through LB */
  connectInternal: (agentId: string) => Promise<AgentConnectResult>;
  /** In-process heartbeat callback */
  heartbeatInternal: (agentId: string, status: 'idle' | 'busy') => Promise<void>;
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
  private readonly heartbeatIntervalMs: number;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(private config: AgentRunnerConfig) {
    this.logger = new Logger(`AgentRunner[${config.agentName}]`);
    this.maxConcurrency = Number(config.settings['hosted_maxConcurrency'] ?? 5);
    this.reconnectDelayMs = Number(config.settings['hosted_reconnectDelayMs'] ?? 5_000);
    this.maxSteps = Number(config.settings['hosted_maxSteps'] ?? 10);
    this.heartbeatIntervalMs = Number(config.settings['hosted_heartbeatIntervalMs'] ?? 30_000);
  }

  start() {
    this.connect();
    this.startHeartbeat();
  }

  stop() {
    this.isShuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.logger.log('Stopped');
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const status = this.isBusy ? 'busy' : 'idle';
      this.config.heartbeatInternal(this.config.agentId, status).catch((err) => {
        this.logger.warn(`Heartbeat failed: ${(err as Error).message}`);
      });
    }, this.heartbeatIntervalMs);
  }

  get isConnected() {
    return this.socket?.connected ?? false;
  }

  get isBusy() {
    return [...this.processingMap.values()].some(Boolean);
  }

  sendReadyMessage() {
    this.emitSystemMessage(this.conversationId, 'Agent đã sẵn sàng!');
  }

  private emitSystemMessage(conversationId: string | null, content: string) {
    if (!conversationId || !this.socket?.connected) return;
    this.socket.emit('message:send', {
      conversationId,
      role: 'assistant',
      type: 'system',
      content,
    });
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
        this.sendReadyMessage();
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
    this.logger.debug(`[message:new] conv=${conversationId} role=${message.role} content="${content.slice(0, 80)}${content.length > 80 ? '...' : ''}"`);

    // --- Slash command: /stop ---
    if (content === SLASH_STOP) {
      const controller = this.abortMap.get(conversationId);
      if (controller) {
        controller.abort();
        this.logger.log(`/stop received — aborted generation for ${conversationId}`);
        this.emitSystemMessage(conversationId, 'Đã dừng. Bạn có thể tiếp tục nhắn tin bất cứ lúc nào.');
      } else {
        this.emitSystemMessage(conversationId, 'Không có tác vụ nào đang chạy.');
      }
      return;
    }

    // --- Slash command: /reload ---
    if (content === SLASH_RELOAD) {
      if (this.isReloading) {
        this.emitSystemMessage(conversationId, 'Đang reload, vui lòng chờ...');
        return;
      }
      this.emitSystemMessage(conversationId, 'Đang reload instruction và MCP tools...');
      const ok = await this.reload();
      this.emitSystemMessage(conversationId, ok ? 'Reload thành công. Sẵn sàng!' : 'Reload thất bại, giữ nguyên cấu hình cũ.');
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

      let history = await this.fetchHistory(conversationId);
      // Fallback: if history is empty (fetch failed or first message), use current message
      if (!history.length) {
        history = [{ role: 'user', content }];
      }
      this.logger.debug(`[history] conv=${conversationId} messages=${history.length}`);

      const systemPrompt = this.config.instruction?.systemPrompt ?? '';
      this.logger.debug(`[system] instructionId=${this.config.instruction?.id} prompt="${systemPrompt.slice(0, 80)}..."`);

      const INVALID_PROMPTS = [
        'No instruction configured for this agent.',
        'Instruction not found.',
        'Instruction is currently inactive.',
      ];
      if (!systemPrompt || INVALID_PROMPTS.includes(systemPrompt)) {
        this.emitSystemMessage(conversationId, 'Agent chưa được thiết lập chỉ dẫn hoặc chỉ dẫn không còn hoạt động. Vui lòng liên hệ quản trị viên để cấu hình lại.');
        return;
      }

      const model = this.buildModel();
      this.logger.debug(`[model] deployment=${this.config.deployment?.id} model=${this.config.deployment?.model}`);

      const tools = await this.resolveMcpTools();
      this.logger.debug(`[tools] resolved=${Object.keys(tools).length} names=[${Object.keys(tools).join(', ')}]`);

      this.logger.debug(`[llm] calling generateText conv=${conversationId}`);
      const result = await generateText({
        model,
        system: this.config.instruction.systemPrompt,
        messages: history,
        // tools,
        stopWhen: stepCountIs(this.maxSteps),
        abortSignal: abortController.signal,
        onStepFinish: (step) => {
          this.logger.debug(`[step#${step.stepNumber}] toolCalls=${step.toolCalls?.length ?? 0} toolResults=${step.toolResults?.length ?? 0} finishReason=${step.finishReason}`);
          for (const call of step.toolCalls ?? []) {
            this.logger.debug(`  [tool:call] ${call.toolName}(${JSON.stringify(call.input).slice(0, 120)})`);
          }
          for (const res of step.toolResults ?? []) {
            const outputStr = JSON.stringify(res.output).slice(0, 120);
            this.logger.debug(`  [tool:result] ${res.toolName} → ${outputStr}`);
          }
        },
      });

      this.logger.debug(`[llm] done steps=${result.steps?.length} finishReason=${result.finishReason} outputLen=${result.text?.length}`);
      this.logger.debug(`[emit] message:send socketConnected=${this.socket?.connected} conv=${conversationId} text="${result.text?.slice(0, 60)}"`);
      this.socket?.emit('message:send', {
        conversationId,
        role: 'assistant',
        content: result.text,
      });
      this.logger.debug(`[emit] message:send done`);
    } catch (err: unknown) {
      const e = err as Error;
      if (e?.name === 'AbortError' || abortController.signal.aborted) {
        // Already handled by /stop — no duplicate message
      } else {
        this.logger.error(`AI generation error: ${e.message}`, e.stack);
        const isLlmError = e.name === 'AI_APICallError' || e.message?.includes('deployment') || e.message?.includes('Not Found') || e.message?.includes('API key');
        this.emitSystemMessage(
          conversationId,
          isLlmError
            ? 'Hiện tại không thể kết nối với dịch vụ AI. Vui lòng thử lại sau hoặc liên hệ quản trị viên.'
            : 'Đã xảy ra lỗi khi xử lý tin nhắn của bạn. Vui lòng thử lại.',
        );
      }
    } finally {
      this.processingMap.set(conversationId, false);
      this.abortMap.delete(conversationId);
    }
  }

  /**
   * Re-fetch instruction, deployment and settings via in-process callback.
   * Keeps the existing WebSocket connection alive.
   */
  private async reload(): Promise<boolean> {
    this.isReloading = true;
    try {
      const resp = await this.config.connectInternal(this.config.agentId);
      this.config = {
        ...this.config,
        accessToken: resp.accessToken ?? this.config.accessToken,
        instruction: resp.instruction ?? this.config.instruction,
        deployment: resp.deployment ?? this.config.deployment,
        settings: resp.settings ?? this.config.settings,
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
   * Resolve tools from all MCP servers in config.
   * Returns Vercel AI SDK compatible tool definitions merged from all servers.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async resolveMcpTools(): Promise<Record<string, any>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolMap: Record<string, any> = {};
    const servers = Object.entries(this.config.mcpServers);

    if (!servers.length) return toolMap;

    await Promise.allSettled(
      servers.map(async ([serverName, serverConfig]) => {
        const mcpClient = new McpClient({
          name: `aiwm-hosted-${this.config.agentId}-${serverName}`,
          version: '1.0.0',
        });
        const transport = new StreamableHTTPClientTransport(new URL(serverConfig.url), {
          requestInit: { headers: serverConfig.headers },
        });

        try {
          await mcpClient.connect(transport);
          const { tools: mcpTools } = await mcpClient.listTools();

          for (const mcpTool of mcpTools) {
            const toolName = mcpTool.name;
            // Keep reference to this client for execute calls
            toolMap[toolName] = {
              description: mcpTool.description ?? '',
              parameters: z.record(z.string(), z.unknown()),
              execute: async (args: Record<string, unknown>) => {
                const resp = await mcpClient.callTool({ name: toolName, arguments: args });
                return resp.content;
              },
            };
          }
        } catch (err) {
          this.logger.warn(`MCP tool resolution failed for [${serverName}]: ${(err as Error).message}`);
        }
        // Note: keep mcpClient open for execute() calls during generation
      }),
    );

    return toolMap;
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

    if (!deployment?.baseAPIEndpoint) {
      throw new Error('Agent chưa được cấu hình dịch vụ LLM. Vui lòng liên hệ quản trị viên để thiết lập deployment.');
    }

    const { baseAPIEndpoint, model, provider } = deployment;

    switch (provider?.toLowerCase()) {
      case 'google': {
        const google = createGoogleGenerativeAI({
          apiKey: this.config.accessToken,
          baseURL: baseAPIEndpoint.endsWith('/v1beta')
            ? baseAPIEndpoint
            : `${baseAPIEndpoint}/v1beta`,
        });
        return google(model);
      }
      default: {
        // openai, azure, or any openai-compatible proxy
        const openai = createOpenAI({
          apiKey: this.config.accessToken,
          baseURL: baseAPIEndpoint.endsWith('/v1')
            ? baseAPIEndpoint
            : `${baseAPIEndpoint}/v1`,
        });
        return openai.chat(model);
      }
    }
  }

  /**
   * Fetch recent message history from AIWM REST API.
   * Returns Vercel AI SDK CoreMessage array.
   */
  private async fetchHistory(conversationId: string): Promise<any[]> {
    try {
      const resp = await axios.get(
        `${this.config.wsChatUrl}/messages/conversation/${conversationId}`,
        {
          params: { limit: 20, sort: 'createdAt:asc' },
          headers: { Authorization: `Bearer ${this.config.accessToken}` },
        },
      );

      const messages: any[] = resp.data?.data || resp.data || [];
      return messages
        .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && m.type !== 'system')
        .map((m: any) => ({ role: m.role, content: m.content }));
    } catch (err) {
      this.logger.warn(`Failed to fetch history: ${err.message}`);
      return [];
    }
  }
}
