import { Logger } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { generateText, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMCPClient } from '@ai-sdk/mcp';
import { BrowserContext } from './browser/browser.types';
import { BrowserInstanceManager } from './browser/browser-instance.manager';
import { createBrowserTools, BROWSER_TOOL_FUNCTIONS } from './browser/browser-mcp.server';
import { createChannelSendTools } from './channel-send.tool';


export interface McpServerConfig {
  type: string;
  url: string;
  headers: Record<string, string>;
}

export interface AgentConnectResult {
  accessToken: string;
  instruction: { id: string; systemPrompt: string };
  deployment?: { id: string; provider: string; model: string; baseAPIEndpoint: string; multimodal?: boolean };
  settings: Record<string, unknown>;
  mcpServers?: Record<string, McpServerConfig>;
  allowedFunctions?: string[];
  ragEnabled?: boolean;
  ragCollections?: Array<{ collectionId: string; topK: number; minScore: number }>;
  agentCode?: string;
}

export interface HeartbeatResponse {
  success: boolean;
  work?: {
    id: string;
    title: string;
    type: string;
    status: string;
    priorityLevel: number;
  };
  systemMessage?: string;
  systemTask?: {
    type: 'work' | 'reminders' | 'inbox' | 'alert';
    id?: string;
    title?: string;
    reminders?: { id: string; content: string }[];
  };
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
    multimodal?: boolean;
  };
  settings: Record<string, unknown>;
  mcpServers: Record<string, McpServerConfig>;
  allowedFunctions: string[];
  wsChatUrl: string;
  /** In-process connect callback — avoids HTTP round-trip through LB */
  connectInternal: (agentId: string) => Promise<AgentConnectResult>;
  /** In-process heartbeat callback */
  heartbeatInternal: (agentId: string, status: 'idle' | 'busy') => Promise<HeartbeatResponse>;
  /** In-process history fetch — direct DB query, avoids HTTP round-trip */
  getHistoryInternal: (conversationId: string) => Promise<Array<{ role: string; content: string }>>;
  /** In-process log append — writes to agent.logs (max 100, auto-rotate) */
  addLogInternal: (agentId: string, level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) => Promise<void>;
  /** PinchTab API URL — read from Configuration org-level, provided by AgentWorkerService */
  browserApiUrl?: string;
  /** Callback to send file (screenshot/PDF) back to conversation */
  sendFileInternal?: (conversationId: string, filePath: string, caption: string) => Promise<void>;
  /** Upload base64 content to S3 and return public URL — used by assistant agents (no filesystem) */
  uploadFileInternal?: (base64: string, filename: string, mimeType: string) => Promise<string>;
  /** Whether RAG is enabled for this agent */
  ragEnabled?: boolean;
  /** RAG collection configs to search for context before LLM call */
  ragCollections?: Array<{ collectionId: string; topK: number; minScore: number }>;
  /** In-process RAG search callback — calls CBM knowledge search API */
  searchKnowledgeInternal?: (collectionId: string, query: string, topK: number, minScore: number) => Promise<Array<{ score: number; content: string }>>;
  /** Agent code identifier (optional) */
  agentCode?: string;
  /** Agent type — affects how SendFile tool uploads files */
  agentType?: 'assistant' | 'engineer';
  /** Base URL of AIWM REST API — used by engineer agents for file upload */
  apiBaseUrl?: string;
}

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
  private readonly seenMessageIds = new Set<string>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private isReloading = false;

  private readonly maxConcurrency: number;
  private readonly reconnectDelayMs: number;
  private readonly maxSteps: number;
  private readonly heartbeatIntervalMs: number;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private currentWorkId: string | null = null;

  private browserCtx: BrowserContext | null = null;
  private browserInstanceManager: BrowserInstanceManager | null = null;

  constructor(private config: AgentRunnerConfig) {
    this.logger = new Logger(`AgentRunner[${config.agentName}]`);
    this.maxConcurrency = Number(config.settings['assistant_maxConcurrency'] ?? config.settings['hosted_maxConcurrency'] ?? 5);
    this.reconnectDelayMs = Number(config.settings['assistant_reconnectDelayMs'] ?? config.settings['hosted_reconnectDelayMs'] ?? 5_000);
    this.maxSteps = Number(config.settings['assistant_maxSteps'] ?? config.settings['hosted_maxSteps'] ?? 10);
    this.heartbeatIntervalMs = Number(config.settings['assistant_heartbeatIntervalMs'] ?? config.settings['hosted_heartbeatIntervalMs'] ?? 30_000);

    this.initBrowser();
  }

  private initBrowser() {
    if (!this.config.browserApiUrl) return;

    const hasBrowserFunction = this.config.allowedFunctions.some((f) =>
      (BROWSER_TOOL_FUNCTIONS as readonly string[]).includes(f),
    );
    if (!hasBrowserFunction) return;

    this.browserCtx = {
      instanceId: null,
      conversationId: null,
      config: {
        apiUrl: this.config.browserApiUrl,
        mode: 'headless',
        width: 1280,
        height: 720,
        navigateTimeout: 30,
        blockImages: false,
        screenshotQuality: 80,
        snapshotDepth: 3,
        snapshotMaxTokens: 2000,
        lockTtl: 60,
      },
      sendFile: async (conversationId, filePath, caption) => {
        if (this.config.sendFileInternal) {
          await this.config.sendFileInternal(conversationId, filePath, caption);
        }
      },
    };

    this.browserInstanceManager = new BrowserInstanceManager(this.browserCtx);
    // Non-blocking — agent continues while browser starts
    this.browserInstanceManager.start().catch((err) => {
      this.logger.warn(`Browser init error: ${(err as Error).message}`);
    });
    this.logger.log('Browser automation enabled (PinchTab)');
  }

  /** Fire-and-forget log to agent.logs (never throws) */
  private writeLog(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) {
    this.config.addLogInternal(this.config.agentId, level, message, data).catch(() => {/* silent */});
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
    if (this.browserInstanceManager) {
      this.browserInstanceManager.stop().catch(() => {/* silent */});
    }
    this.writeLog('info', 'Runner stopped');
    this.logger.log('Stopped');
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const status = this.isBusy ? 'busy' : 'idle';
      this.config.heartbeatInternal(this.config.agentId, status)
        .then((res) => this.handleHeartbeatResponse(res))
        .catch((err) => {
          this.logger.warn(`Heartbeat failed: ${(err as Error).message}`);
        });
    }, this.heartbeatIntervalMs);
  }

  private handleHeartbeatResponse(res: HeartbeatResponse) {
    if (!res.systemMessage) return;

    // Skip if busy — server will retry on next idle heartbeat
    if (this.isBusy) {
      this.logger.debug('[heartbeat] systemMessage received but agent is busy, skipping');
      return;
    }

    const { systemTask } = res;
    this.logger.log(`[heartbeat] systemMessage received type=${systemTask?.type ?? 'none'} id=${systemTask?.id ?? 'n/a'}`);

    // Set workId for the duration of this work session
    if (systemTask?.type === 'work' && systemTask.id) {
      this.currentWorkId = systemTask.id;
    }

    // Synthesize a fake message object and process it directly
    const fakeMessage = {
      conversationId: this.conversationId,
      role: 'user',
      content: res.systemMessage,
      _id: `heartbeat-${Date.now()}`,
    };

    this.handleMessage(fakeMessage).catch((err) =>
      this.logger.error(`handleMessage (heartbeat) error: ${err.message}`, err.stack),
    );
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

  /** Emit an arbitrary message payload — used by sendFileInternal callback */
  emitMessage(conversationId: string, payload: Record<string, unknown>) {
    if (!this.socket?.connected) return;
    this.socket.emit('message:send', { conversationId, ...payload });
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
      this.writeLog('info', 'WebSocket connected', { socketId: this.socket?.id });
      this.logger.log(`Connected | socketId=${this.socket?.id}`);
    });

    this.socket.on('connect_error', (err) => {
      this.writeLog('error', 'WebSocket connection error', { error: err.message });
      this.logger.error(`Connection error: ${err.message}`);
      this.scheduleReconnect();
    });

    this.socket.on('disconnect', (reason) => {
      this.writeLog('warn', 'WebSocket disconnected', { reason });
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

    this.socket.on('agent:command', (cmd: { type: 'stop' | 'reload' | 'inspect'; conversationId?: string; reason?: string }) => {
      this.handleCommand(cmd).catch((err) =>
        this.logger.error(`handleCommand error: ${err.message}`, err.stack),
      );
    });
  }

  private async handleCommand(cmd: { type: 'stop' | 'reload' | 'inspect'; conversationId?: string; reason?: string }) {
    const { type, conversationId, reason } = cmd;
    this.logger.log(`[agent:command] type=${type} conversationId=${conversationId || 'n/a'}`);

    if (type === 'stop') {
      const convId = conversationId || this.conversationId;
      if (!convId) {
        this.logger.warn('/stop — no conversationId');
        return;
      }
      const controller = this.abortMap.get(convId);
      if (controller) {
        controller.abort();
        this.writeLog('info', '/stop — aborted generation', { conversationId: convId, reason });
        this.logger.log(`/stop received — aborted generation for ${convId}${reason ? ` reason: ${reason}` : ''}`);
        this.emitSystemMessage(convId, 'Đã dừng. Bạn có thể tiếp tục nhắn tin bất cứ lúc nào.');
      } else {
        this.emitSystemMessage(convId, 'Không có tác vụ nào đang chạy.');
      }
      return;
    }

    if (type === 'reload') {
      const convId = conversationId || this.conversationId;
      if (this.isReloading) {
        this.emitSystemMessage(convId, 'Đang reload, vui lòng chờ...');
        return;
      }
      this.emitSystemMessage(convId, 'Đang reload instruction và MCP tools...');
      const ok = await this.reload();
      this.writeLog(ok ? 'info' : 'error', ok ? '/reload succeeded' : '/reload failed', { conversationId: convId });
      this.emitSystemMessage(convId, ok ? 'Reload thành công. Sẵn sàng!' : 'Reload thất bại, giữ nguyên cấu hình cũ.');
      return;
    }

    if (type === 'inspect') {
      const convId = conversationId || this.conversationId;
      const info = {
        agentId: this.config.agentId,
        agentName: this.config.agentName,
        deployment: this.config.deployment
          ? { model: this.config.deployment.model, provider: this.config.deployment.provider }
          : null,
        settings: {
          maxConcurrency: this.maxConcurrency,
          maxSteps: this.maxSteps,
          heartbeatIntervalMs: this.heartbeatIntervalMs,
          reconnectDelayMs: this.reconnectDelayMs,
        },
        allowedFunctionsCount: this.config.allowedFunctions.length,
        isBusy: this.isBusy,
        isConnected: this.isConnected,
        isReloading: this.isReloading,
      };
      this.emitSystemMessage(convId, JSON.stringify(info, null, 2));
      return;
    }
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

    // Deduplicate: agent may receive the same event multiple times (multiple socket rooms)
    const rawId = message._id || message.id;
    const messageId: string = rawId ? String(rawId) : '';
    if (messageId) {
      if (this.seenMessageIds.has(messageId)) return;
      this.seenMessageIds.add(messageId);
      // Keep set bounded — drop oldest entries beyond 200
      if (this.seenMessageIds.size > 200) {
        this.seenMessageIds.delete(this.seenMessageIds.values().next().value!);
      }
    }

    const conversationId: string = message.conversationId || this.conversationId;
    if (!conversationId) return;

    const content: string = (message.content ?? '').trim();
    this.logger.debug(`[message:new] conv=${conversationId} role=${message.role} content="${content.slice(0, 80)}${content.length > 80 ? '...' : ''}"`);

    // Build <user_info> block from message metadata
    const userInfoLines: string[] = [];
    if (message.userId) {
      userInfoLines.push(`User ID: ${message.userId}`);
      if (message.fullname) userInfoLines.push(`Full Name: ${message.fullname}`);
      if (message.username) userInfoLines.push(`Username: ${message.username}`);
    }
    if (message.externalUserId && message.externalUsername !== message.externalUserId) {
      // Discord: externalUserId is the Discord snowflake ID
      userInfoLines.push(`Discord User ID: ${message.externalUserId}`);
    }
    if (message.platform) {
      userInfoLines.push(`Platform: ${message.platform}`);
    }
    if (message.connectionId) {
      userInfoLines.push(`Connection ID: ${message.connectionId}`);
    }
    if (message.channelId) {
      userInfoLines.push(`Channel ID: ${message.channelId}`);
    }
    const userInfoBlock = userInfoLines.length > 0
      ? `<user_info>\n${userInfoLines.join('\n')}\n</user_info>\n\n`
      : '';
    this.logger.debug(`[user_info] lines=${userInfoLines.length} block="${userInfoBlock.slice(0, 120).replace(/\n/g, '\\n')}" raw=userId=${message.userId} fullname=${message.fullname} username=${message.username} externalUserId=${message.externalUserId} channelId=${message.channelId}`);

    // Build <references> block from message.references
    this.logger.debug(`[references] raw=${JSON.stringify(message.references)}`);
    const refs: Array<{ app?: string; page?: string; section?: string; resourceType: string; resourceId?: string; content?: string; label: string }> = message.references || [];
    let referencesBlock = '';
    if (refs.length > 0) {
      const refLines = refs.map((r, i) => {
        const attrs = [
          `id="${i + 1}"`,
          `type="${r.resourceType}"`,
          r.resourceId ? `resourceId="${r.resourceId}"` : '',
          `label="${r.label}"`,
          r.app ? `app="${r.app}"` : '',
          r.page ? `page="${r.page}"` : '',
          r.section ? `section="${r.section}"` : '',
        ].filter(Boolean).join(' ');
        return `<ref ${attrs}>\n${r.content ?? ''}\n</ref>`;
      });
      referencesBlock = `<references>\n${refLines.join('\n\n')}\n</references>\n\n`;
      this.logger.debug(`[references] count=${refs.length}`);
    }

    // --- /ignore: skip messages flagged by gateway ---
    if (message.skipAgent === true) {
      this.logger.debug(`[message:new] skipped (skipAgent) conv=${conversationId}`);
      return;
    }

    // Concurrency guard
    const activeCount = [...this.processingMap.values()].filter(Boolean).length;
    if (this.processingMap.get(conversationId) || activeCount >= this.maxConcurrency) {
      this.writeLog('warn', 'Max concurrency reached — message dropped', { conversationId, activeCount, maxConcurrency: this.maxConcurrency });
      this.logger.warn(`Skipping — conversation ${conversationId} busy or at max concurrency`);
      return;
    }

    this.processingMap.set(conversationId, true);
    const abortController = new AbortController();
    this.abortMap.set(conversationId, abortController);

    try {
      this.socket?.emit('message:typing', { conversationId, isTyping: true });

      let history = await this.fetchHistory(conversationId);
      // Fallback: if history is empty (fetch failed or first message), use current message
      if (!history.length) {
        history = [{ role: 'user', content }];
      } else {
        // Ensure the current message is at the end of history.
        // Due to race condition, the action may not be persisted yet when fetchHistory runs.
        const lastMsg = history[history.length - 1];
        if (!(lastMsg.role === 'user' && lastMsg.content === content)) {
          history.push({ role: 'user', content });
        }
        // Normalize: merge consecutive same-role messages so LLM receives valid alternating format.
        // When user sends multiple messages quickly before agent replies, they appear as consecutive
        // user messages in DB — merge them into one to avoid LLM confusion.
        history = history.reduce((acc: any[], msg: any) => {
          const prev = acc[acc.length - 1];
          if (prev && prev.role === msg.role) {
            prev.content = `${prev.content}\n${msg.content}`;
          } else {
            acc.push({ ...msg });
          }
          return acc;
        }, []);
      }
      this.logger.debug(`[history] conv=${conversationId} messages=${history.length}`);
      for (const m of history) {
        const preview = String(m.content ?? '').slice(0, 60).replace(/\n/g, '\\n');
        this.logger.debug(`  [history:${m.role}] "${preview}${String(m.content ?? '').length > 60 ? '...' : ''}"`);
      }

      // Inject <references> + <user_info> into the last user message (text prefix)
      if (referencesBlock || userInfoBlock) {
        const lastIdx = history.length - 1;
        if (history[lastIdx]?.role === 'user') {
          const currentContent = typeof history[lastIdx].content === 'string'
            ? history[lastIdx].content
            : history[lastIdx].content;
          if (typeof currentContent === 'string') {
            history[lastIdx] = {
              ...history[lastIdx],
              content: `${referencesBlock}${userInfoBlock}${currentContent}`,
            };
          }
        }
      }

      // Handle attachments — only if deployment supports multimodal
      const attachments: Array<{ type: string; url: string; filename?: string; mimeType?: string }> = message.attachments || [];
      if (attachments.length > 0) {
        if (!this.config.deployment?.multimodal) {
          this.emitSystemMessage(conversationId, 'Model hiện tại không hỗ trợ xử lý file/ảnh. Vui lòng liên hệ quản trị viên để cấu hình model multimodal.');
          return;
        }
        // Convert last user message to multimodal content array
        const lastIdx = history.length - 1;
        if (history[lastIdx]?.role === 'user') {
          const textContent = typeof history[lastIdx].content === 'string'
            ? history[lastIdx].content
            : String(history[lastIdx].content ?? '');
          const imageParts = attachments
            .filter((a) => a.mimeType?.startsWith('image/'))
            .map((a) => ({ type: 'image' as const, image: new URL(a.url), mimeType: a.mimeType }));
          history[lastIdx] = {
            role: 'user',
            content: [...imageParts, { type: 'text' as const, text: textContent }],
          };
          this.logger.debug(`[attachments] injected images=${imageParts.length}`);
        }
      }

      // RAG: inject knowledge context into the last user message before LLM call
      history = await this.augmentWithRagContext(history, content);

      const systemPrompt = this.config.instruction?.systemPrompt ?? '';
      this.logger.debug(`[system] instructionId=${this.config.instruction?.id} promptLen=${systemPrompt.length} prompt="${systemPrompt.slice(0, 120).replace(/\n/g, '\\n')}..."`);

      const INVALID_PROMPTS = [
        'No instruction configured for this agent.',
        'Instruction not found.',
        'Instruction is currently inactive.',
      ];
      if (!systemPrompt || INVALID_PROMPTS.includes(systemPrompt)) {
        this.emitSystemMessage(conversationId, 'Agent chưa được thiết lập chỉ dẫn hoặc chỉ dẫn không còn hoạt động. Vui lòng liên hệ quản trị viên để cấu hình lại.');
        return;
      }

      // Sync conversationId into browserCtx so Screenshot/PDF tools know where to send files
      if (this.browserCtx) {
        this.browserCtx.conversationId = conversationId;
      }

      const model = this.buildModel();
      this.logger.debug(`[model] deployment=${this.config.deployment?.id} model=${this.config.deployment?.model}`);

      const { tools, clients: mcpClients } = await this.resolveMcpTools();
      const toolNames = Object.keys(tools);
      this.writeLog('info', 'MCP tools loaded', { count: toolNames.length, tools: toolNames });
      this.logger.debug(`[tools] resolved=${toolNames.length} names=[${toolNames.join(', ')}]`);

      try {
        this.logger.debug(`[llm] calling generateText conv=${conversationId}`);
        const result = await generateText({
          model,
          system: this.config.instruction.systemPrompt,
          messages: history,
          tools: Object.keys(tools).length > 0 ? tools : undefined,
          stopWhen: stepCountIs(this.maxSteps),
          abortSignal: abortController.signal,
          onStepFinish: (step) => {
            this.logger.debug(`[step#${step.stepNumber}] toolCalls=${step.toolCalls?.length ?? 0} toolResults=${step.toolResults?.length ?? 0} finishReason=${step.finishReason}`);
            for (const call of step.toolCalls ?? []) {
              this.logger.debug(`  [tool:call] ${call.toolName}(${JSON.stringify(call.input).slice(0, 120)})`);
              this.socket?.emit('message:send', {
                conversationId,
                role: 'assistant',
                type: 'tool_use',
                content: call.toolName,
                metadata: {
                  toolName: call.toolName,
                  toolInput: call.input,
                  toolUseId: call.toolCallId,
                },
                ...(this.currentWorkId ? { workId: this.currentWorkId } : {}),
              });
            }
            for (const res of step.toolResults ?? []) {
              const outputStr = JSON.stringify(res.output).slice(0, 200);
              this.logger.debug(`  [tool:result] ${res.toolName} → ${outputStr}`);
              this.socket?.emit('message:send', {
                conversationId,
                role: 'assistant',
                type: 'tool_result',
                content: outputStr,
                metadata: {
                  toolName: res.toolName,
                  toolResult: res.output,
                  toolResultId: res.toolCallId,
                },
                ...(this.currentWorkId ? { workId: this.currentWorkId } : {}),
              });
            }
          },
        });

        this.logger.debug(`[llm] done steps=${result.steps?.length} finishReason=${result.finishReason} outputLen=${result.text?.length}`);
        this.logger.debug(`[emit] message:send socketConnected=${this.socket?.connected} conv=${conversationId} text="${result.text?.slice(0, 60)}"`);
        this.socket?.emit('message:send', {
          conversationId,
          role: 'assistant',
          content: result.text,
          ...(this.currentWorkId ? { workId: this.currentWorkId } : {}),
        });
        this.logger.debug(`[emit] message:send done`);
      } finally {
        // Close all MCP clients after generation (short-lived pattern)
        await Promise.allSettled(mcpClients.map((c) => c.close()));
      }
    } catch (err: unknown) {
      const e = err as Error;
      if (e?.name === 'AbortError' || abortController.signal.aborted) {
        // Already handled by /stop — no duplicate message
      } else {
        this.writeLog('error', 'Generation error', { conversationId, error: e.message, errorName: e.name });
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
      this.currentWorkId = null;
      this.socket?.emit('message:typing', { conversationId, isTyping: false });
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
   * Resolve tools from all MCP servers in config using @ai-sdk/mcp.
   * Returns merged Vercel AI SDK tools filtered by allowedFunctions,
   * and the list of clients to close after generation.
   */
  private async resolveMcpTools(): Promise<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: Record<string, any>;
    clients: Awaited<ReturnType<typeof createMCPClient>>[];
  }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolMap: Record<string, any> = {};
    const clients: Awaited<ReturnType<typeof createMCPClient>>[] = [];
    const servers = Object.entries(this.config.mcpServers);
    const allowedSet = new Set(this.config.allowedFunctions);

    if (!servers.length) return { tools: toolMap, clients };

    await Promise.allSettled(
      servers.map(async ([serverName, serverConfig]) => {
        try {
          const client = await createMCPClient({
            transport: {
              type: 'http',
              url: serverConfig.url,
              headers: serverConfig.headers,
            },
          });
          clients.push(client);

          const serverTools = await client.tools();

          for (const [toolName, toolDef] of Object.entries(serverTools)) {
            // Namespaced key: mcp__ServerName__toolName
            const namespacedKey = `mcp__${serverName}__${toolName}`;
            if (allowedSet.size > 0 && !allowedSet.has(namespacedKey)) continue;
            toolMap[namespacedKey] = toolDef;
          }
        } catch (err) {
          this.logger.warn(`MCP tool resolution failed for [${serverName}]: ${(err as Error).message}`);
        }
      }),
    );

    // Merge in-process browser tools if browser automation is enabled and instance is ready
    if (this.browserCtx?.instanceId) {
      const browserTools = createBrowserTools(this.browserCtx);
      for (const [toolName, toolDef] of Object.entries(browserTools)) {
        if (allowedSet.size > 0 && !allowedSet.has(toolName)) continue;
        toolMap[toolName] = toolDef;
      }
    }

    // Always inject Connection builtin tools (no allowedFunctions filter — always available to agent)
    if (this.socket) {
      const channelSendTools = createChannelSendTools({
        socket: this.socket,
        agentType: this.config.agentType ?? 'assistant',
        uploadFileInternal: this.config.uploadFileInternal,
        apiBaseUrl: this.config.apiBaseUrl,
        accessToken: this.config.accessToken,
      });
      for (const [toolName, toolDef] of Object.entries(channelSendTools)) {
        toolMap[toolName] = toolDef;
      }
    }

    return { tools: toolMap, clients };
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
   * Fetch recent message history via in-process DB callback.
   * Returns Vercel AI SDK CoreMessage array.
   */
  private async fetchHistory(conversationId: string): Promise<any[]> {
    try {
      return await this.config.getHistoryInternal(conversationId);
    } catch (err) {
      this.logger.warn(`Failed to fetch history: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * RAG: inject knowledge context into the last user message.
   * Two-layer filter:
   *   1. Heuristic — skip if RAG disabled, no collections, short message, or slash command
   *   2. Vector search — minScore filter in CbmKnowledgeService acts as relevance gate
   */
  private async augmentWithRagContext(history: any[], userContent: string): Promise<any[]> {
    // Tầng 1: Heuristic checks (0 cost)
    if (!this.config.ragEnabled) return history;
    if (!this.config.ragCollections?.length) return history;
    if (!this.config.searchKnowledgeInternal) return history;
    if (userContent.length < 15) return history;
    if (userContent.startsWith('/')) return history;

    // Tầng 2: Vector search across all collections
    const allChunks: Array<{ score: number; content: string }> = [];
    for (const col of this.config.ragCollections) {
      const results = await this.config.searchKnowledgeInternal(
        col.collectionId,
        userContent,
        col.topK,
        col.minScore,
      );
      allChunks.push(...results);
    }

    if (!allChunks.length) return history;

    // Sort by score desc, cap at max topK across collections
    const maxTopK = Math.max(...this.config.ragCollections.map((c) => c.topK));
    const topChunks = allChunks.sort((a, b) => b.score - a.score).slice(0, maxTopK);

    // Build XML context block
    const contextBlock = [
      '<knowledge_context>',
      ...topChunks.map(
        (c, i) => `<source id="${i + 1}" score="${c.score.toFixed(2)}">\n${c.content}\n</source>`,
      ),
      '</knowledge_context>',
    ].join('\n');

    // Inject into last user message
    const augmented = [...history];
    const lastIdx = augmented.length - 1;
    if (augmented[lastIdx]?.role === 'user') {
      augmented[lastIdx] = {
        ...augmented[lastIdx],
        content: `${contextBlock}\n\n${augmented[lastIdx].content}`,
      };
    }

    this.writeLog('info', 'RAG context injected', { chunks: topChunks.length });
    this.logger.debug(`[rag] injected chunks=${topChunks.length} scores=[${topChunks.map((c) => c.score.toFixed(2)).join(', ')}]`);
    return augmented;
  }
}
