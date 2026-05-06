import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { generateText, stepCountIs } from 'ai';
import { ActionSource } from '../action/action.schema';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMCPClient } from '@ai-sdk/mcp';
import { BrowserContext } from './browser/browser.types';
import { BrowserInstanceManager } from './browser/browser-instance.manager';
import { createBrowserTools, BROWSER_TOOL_FUNCTIONS } from './browser/browser-mcp.server';
import { createChannelSendTools } from './channel-send.tool';
import { createKnowledgeSearchTools, KNOWLEDGE_SEARCH_TOOL_NAME } from './knowledge-search.tool';
import { AgentLockService } from './agent-lock.service';
import { AdaptiveRagService } from './adaptive-rag.service';
import { AgentRagConfig } from '../agent/agent.schema';


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
  /** Shared Redis client for BLPOP (blocking — dedicated connection) */
  redisBlocking: Redis;
  /** Shared Redis client for publish/set/get */
  redisPub: Redis;
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
  searchKnowledgeInternal?: (collectionId: string, query: string, topK: number, minScore: number) => Promise<Array<{ score: number; content: string; sourceId: string; sourceType: 'file' | 'document' | '' }>>;
  /** Adaptive RAG config v2 — overrides ragEnabled/ragCollections when present */
  ragConfig?: AgentRagConfig | null;
  /** AdaptiveRagService instance — injected by AgentWorkerService */
  adaptiveRagService?: AdaptiveRagService;
  /** Agent code identifier (optional) */
  agentCode?: string;
  /** Agent type — affects how SendFile tool uploads files */
  agentType?: 'assistant' | 'engineer';
  /** Base URL of AIWM REST API — used by engineer agents for file upload */
  apiBaseUrl?: string;
  /** Conv lock service — for per-conversation distributed locking in drain sessions */
  lockService: AgentLockService;
}

export interface AgentTask {
  taskId: string;
  agentId: string;
  conversationId: string;
  actionId: string;
  content: string;
  role: string;
  orgId?: string;
  userId?: string;
  username?: string;
  fullname?: string;
  externalUsername?: string;
  externalUserId?: string;
  channelId?: string;
  connectionId?: string;
  attachments?: Array<{ type: string; url: string; filename?: string; mimeType?: string }>;
  references?: Array<{ app?: string; page?: string; section?: string; resourceType: string; resourceId?: string; content?: string; label: string }>;
  sources?: Array<{ type: string; content: string; score?: number; label?: string; collectionId?: string; url?: string; toolName?: string }>;
  workId?: string;
  platform: string;
  timestamp: string;
}

/**
 * AgentRunner — manages a single hosted agent's lifecycle:
 * - BLPOP notification queue (chat:notify:{agentId}), drain per-conv queues (chat:task:{agentId}:{convId})
 * - Message processing via Vercel AI SDK + MCP
 * - Publishes responses to chat:response:{conversationId}
 */
export class AgentRunner {
  private readonly logger: Logger;
  private readonly abortMap = new Map<string, AbortController>();
  /** Per-conversation orgId — carried from task to response for RBAC */
  private readonly conversationOrgId = new Map<string, string>();
  private isShuttingDown = false;
  private isReloading = false;
  /** Number of active drain sessions on this runner */
  private activeDrains = 0;
  /** Tracks all in-flight drain session promises for clean shutdown */
  private readonly activeDrainPromises = new Set<Promise<void>>();

  private readonly maxConcurrency: number;
  private readonly maxSteps: number;
  private readonly heartbeatIntervalMs: number;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private currentWorkId: string | null = null;
  private lastConversationId: string | null = null;
  private cmdSubRedis: Redis | null = null;
  /** Resolves when the BLPOP consumer loop has fully exited. Used by stopAsync to await teardown. */
  private consumerStoppedPromise: Promise<void> | null = null;
  private resolveConsumerStopped: (() => void) | null = null;

  private browserCtx: BrowserContext | null = null;
  private browserInstanceManager: BrowserInstanceManager | null = null;

  constructor(private config: AgentRunnerConfig) {
    this.logger = new Logger(`AgentRunner[${config.agentName}]`);
    this.maxConcurrency = Number(config.settings['assistant_maxConcurrency'] ?? config.settings['hosted_maxConcurrency'] ?? 5);
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
    this.startConsuming();
    this.startCmdSubscriber();
    this.startHeartbeat();
  }

  /**
   * Abort every in-flight LLM generation and notify each affected conversation.
   * Used by on-demand restart so users don't sit waiting on a runner that's about to die.
   */
  abortAll(reason = 'restart'): void {
    if (!this.abortMap.size) return;
    const count = this.abortMap.size;
    for (const [convId, controller] of this.abortMap.entries()) {
      try {
        controller.abort();
        this.publishSystemMessage(
          convId,
          `Agent đang ${reason}. Cuộc hội thoại sẽ tiếp tục sau vài giây.`,
        );
      } catch (err) {
        this.logger.warn(`abortAll failed for conv=${convId}: ${(err as Error).message}`);
      }
    }
    this.abortMap.clear();
    this.logger.log(`abortAll — aborted ${count} in-flight conversation(s)`);
  }

  /**
   * Graceful teardown — awaits the BLPOP consumer loop to exit so a fresh runner
   * spawned right after isn't racing two consumers against the same queue.
   */
  async stopAsync(): Promise<void> {
    this.isShuttingDown = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.cmdSubRedis?.disconnect();
    this.cmdSubRedis = null;
    if (this.browserInstanceManager) {
      await this.browserInstanceManager.stop().catch(() => {/* silent */});
    }
    if (this.consumerStoppedPromise) {
      // Cap the wait — BLPOP timeout is 5s, so 6s leaves a small margin.
      await Promise.race([
        this.consumerStoppedPromise,
        new Promise<void>((r) => setTimeout(r, 6000)),
      ]);
    }
    // Wait for all active drain sessions to complete (each BRPOP has 2s timeout)
    if (this.activeDrainPromises.size) {
      await Promise.race([
        Promise.allSettled([...this.activeDrainPromises]),
        new Promise<void>((r) => setTimeout(r, 8000)),
      ]);
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

    // Synthesize a task and process directly
    if (!this.lastConversationId) {
      this.logger.debug('[heartbeat] no lastConversationId, skipping systemMessage');
      return;
    }

    const fakeTask: AgentTask = {
      taskId: `heartbeat-${Date.now()}`,
      agentId: this.config.agentId,
      conversationId: this.lastConversationId,
      actionId: `heartbeat-${Date.now()}`,
      content: res.systemMessage,
      role: 'user',
      platform: 'system',
      timestamp: new Date().toISOString(),
    };

    this.handleTask(fakeTask).catch((err: Error) =>
      this.logger.error(`handleTask (heartbeat) error: ${err.message}`, err.stack),
    );
  }

  get isBusy() {
    return this.activeDrains > 0;
  }

  /** Publish a response/event back to ChatGateway via Redis */
  private publishResponse(conversationId: string, payload: Record<string, unknown>) {
    const orgId = this.conversationOrgId.get(conversationId) || '';
    const nonce = `${this.config.agentId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    this.config.redisPub.publish(
      `chat:response:${conversationId}`,
      JSON.stringify({ agentId: this.config.agentId, conversationId, orgId, nonce, ...payload }),
    ).catch((err: Error) => this.logger.error(`publishResponse failed: ${err.message}`));
  }

  private publishSystemMessage(conversationId: string, content: string) {
    this.publishResponse(conversationId, { type: 'system', role: 'assistant', content, isFinal: true });
  }

  /** Used by sendFileInternal callback */
  publishMessage(conversationId: string, payload: Record<string, unknown>) {
    this.publishResponse(conversationId, { role: 'assistant', isFinal: true, ...payload });
  }

  /** BLPOP loop — blocks on chat:notify:{agentId}, dispatches drain sessions per convId */
  private startConsuming() {
    const notifyKey = `chat:notify:${this.config.agentId}`;
    this.consumerStoppedPromise = new Promise<void>((resolve) => {
      this.resolveConsumerStopped = resolve;
    });
    const consume = async () => {
      try {
        while (!this.isShuttingDown) {
          try {
            const result = await this.config.redisBlocking.blpop(notifyKey, 5);
            if (!result) continue; // timeout, loop again
            const [, conversationId] = result;
            if (!conversationId) continue;
            // Fire-and-forget drain session — semaphore and lock checked inside
            const drainPromise = this.startDrainSession(conversationId);
            this.activeDrainPromises.add(drainPromise);
            drainPromise
              .catch((err: Error) =>
                this.logger.error(`drainSession error conv=${conversationId}: ${err.message}`, err.stack),
              )
              .finally(() => this.activeDrainPromises.delete(drainPromise));
          } catch (err: unknown) {
            if (!this.isShuttingDown) {
              this.logger.error(`BLPOP error: ${(err as Error).message}`);
              await new Promise((r) => setTimeout(r, 1000));
            }
          }
        }
      } finally {
        this.resolveConsumerStopped?.();
      }
    };
    consume();
    this.writeLog('info', 'Redis consumer started', { queue: notifyKey });
    this.logger.log(`Consuming notify queue: ${notifyKey}`);
  }

  /**
   * Drain all tasks for a single conversation.
   * Acquires conv lock, BRPOP per-conv queue until empty, releases lock.
   * Concurrent drain sessions are limited to maxConcurrency per runner.
   */
  private async startDrainSession(conversationId: string): Promise<void> {
    // Semaphore — limit concurrent drain sessions on this runner
    if (this.activeDrains >= this.maxConcurrency) {
      this.logger.debug(`[drain] maxConcurrency (${this.maxConcurrency}) reached, discarding notification conv=${conversationId}`);
      return;
    }

    const acquired = await this.config.lockService.tryAcquireConv(conversationId);
    if (!acquired) {
      this.logger.debug(`[drain] conv lock busy, discarding notification conv=${conversationId}`);
      return;
    }

    this.activeDrains++;
    this.lastConversationId = conversationId;
    const taskKey = `chat:task:${this.config.agentId}:${conversationId}`;

    // Dedicated blocking Redis connection per drain session
    const { buildRedisConfig } = require('../../config/redis.config');
    const drainRedis = new Redis(buildRedisConfig());

    try {
      while (!this.isShuttingDown) {
        // Wait for any in-progress reload before picking up the next task
        while (this.isReloading && !this.isShuttingDown) {
          await new Promise((r) => setTimeout(r, 100));
        }
        if (this.isShuttingDown) break;

        const item = await drainRedis.brpop(taskKey, 2);
        if (!item) break; // queue empty — release lock and exit

        const task: AgentTask = JSON.parse(item[1]);
        await this.handleTask(task);
        await this.config.lockService.renewConv(conversationId);
      }
    } finally {
      this.activeDrains--;
      await this.config.lockService.releaseConv(conversationId);
      drainRedis.disconnect();
    }
  }

  /** Subscribe to chat:cmd:{agentId} for /stop, /reload, /inspect */
  private startCmdSubscriber() {
    const { buildRedisConfig } = require('../../config/redis.config');
    this.cmdSubRedis = new Redis(buildRedisConfig());
    const channel = `chat:cmd:${this.config.agentId}`;
    this.cmdSubRedis.subscribe(channel);
    this.cmdSubRedis.on('message', (_ch: string, message: string) => {
      try {
        const cmd = JSON.parse(message) as { type: 'stop' | 'reload' | 'inspect'; conversationId?: string; reason?: string };
        this.handleCommand(cmd).catch((err: Error) =>
          this.logger.error(`handleCommand error: ${err.message}`, err.stack),
        );
      } catch (err: unknown) {
        this.logger.error(`cmd parse error: ${(err as Error).message}`);
      }
    });
    this.logger.log(`Subscribed to ${channel}`);
  }

  private async handleCommand(cmd: { type: 'stop' | 'reload' | 'inspect'; conversationId?: string; reason?: string }) {
    const { type, conversationId, reason } = cmd;
    this.logger.log(`[cmd] type=${type} conversationId=${conversationId || 'n/a'}`);

    if (type === 'stop') {
      if (!conversationId) { this.logger.warn('/stop — no conversationId'); return; }
      const controller = this.abortMap.get(conversationId);
      if (controller) {
        controller.abort();
        this.writeLog('info', '/stop — aborted generation', { conversationId, reason });
        this.logger.log(`/stop aborted conv=${conversationId}`);
        this.publishSystemMessage(conversationId, 'Đã dừng. Bạn có thể tiếp tục nhắn tin bất cứ lúc nào.');
      } else {
        this.publishSystemMessage(conversationId, 'Không có tác vụ nào đang chạy.');
      }
      return;
    }

    if (type === 'reload') {
      const convId = conversationId;
      if (this.isReloading) {
        if (convId) this.publishSystemMessage(convId, 'Đang reload, vui lòng chờ...');
        return;
      }
      if (convId) this.publishSystemMessage(convId, 'Đang reload instruction và MCP tools...');
      const ok = await this.reload();
      this.writeLog(ok ? 'info' : 'error', ok ? '/reload succeeded' : '/reload failed', { conversationId: convId });
      if (convId) this.publishSystemMessage(convId, ok ? 'Reload thành công. Sẵn sàng!' : 'Reload thất bại, giữ nguyên cấu hình cũ.');
      return;
    }

    if (type === 'inspect') {
      const convId = conversationId;
      const info = {
        agentId: this.config.agentId,
        agentName: this.config.agentName,
        deployment: this.config.deployment
          ? { model: this.config.deployment.model, provider: this.config.deployment.provider }
          : null,
        settings: { maxConcurrency: this.maxConcurrency, maxSteps: this.maxSteps, heartbeatIntervalMs: this.heartbeatIntervalMs },
        allowedFunctionsCount: this.config.allowedFunctions.length,
        isBusy: this.isBusy,
        isReloading: this.isReloading,
      };
      if (convId) this.publishSystemMessage(convId, JSON.stringify(info, null, 2));
      return;
    }
  }

  private async handleTask(task: AgentTask) {
    const { conversationId, content: rawContent, taskId } = task;
    if (!conversationId) return;

    // Wait for reload to complete (drain loop also waits, but heartbeat tasks bypass it)
    while (this.isReloading && !this.isShuttingDown) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (this.isShuttingDown) return;

    const taskReceivedAt = Date.now();
    const queueWaitMs = task.timestamp ? taskReceivedAt - new Date(task.timestamp).getTime() : -1;
    const content = (rawContent ?? '').trim();
    this.logger.debug(`[task] conv=${conversationId} taskId=${taskId} content="${content.slice(0, 80)}${content.length > 80 ? '...' : ''}"`);
    this.logger.debug(`[timing] queue_wait=${queueWaitMs}ms taskId=${taskId}`);

    // Build <user_info> block from task metadata
    const userInfoLines: string[] = [];
    if (task.userId) {
      userInfoLines.push(`User ID: ${task.userId}`);
      if (task.fullname) userInfoLines.push(`Full Name: ${task.fullname}`);
      if (task.username) userInfoLines.push(`Username: ${task.username}`);
    }
    if (task.externalUserId && task.externalUsername !== task.externalUserId) {
      userInfoLines.push(`Discord User ID: ${task.externalUserId}`);
    }
    if (task.platform) userInfoLines.push(`Platform: ${task.platform}`);
    if (task.connectionId) userInfoLines.push(`Connection ID: ${task.connectionId}`);
    if (task.channelId) userInfoLines.push(`Channel ID: ${task.channelId}`);
    const userInfoBlock = userInfoLines.length > 0
      ? `<user_info>\n${userInfoLines.join('\n')}\n</user_info>\n\n`
      : '';

    // Build <references> block
    const refs = task.references || [];
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
    }

    if (task.orgId) this.conversationOrgId.set(conversationId, task.orgId);
    const abortController = new AbortController();
    this.abortMap.set(conversationId, abortController);
    let messageSent = false;

    try {
      this.publishResponse(conversationId, { type: 'typing', isTyping: true });

      let history = await this.fetchHistory(conversationId);
      if (!history.length) {
        history = [{ role: 'user', content }];
      } else {
        const lastMsg = history[history.length - 1];
        if (!(lastMsg.role === 'user' && lastMsg.content === content)) {
          history.push({ role: 'user', content });
        }
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

      // Inject <references> + <user_info> into last user message
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
      const attachments: Array<{ type: string; url: string; filename?: string; mimeType?: string }> = task.attachments || [];
      if (attachments.length > 0) {
        if (!this.config.deployment?.multimodal) {
          this.publishSystemMessage(conversationId, 'Model hiện tại không hỗ trợ xử lý file/ảnh. Vui lòng liên hệ quản trị viên để cấu hình model multimodal.');
          return;
        }
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

      // RAG: inject knowledge context
      const ragResult = await this.augmentWithRagContext(history, content, conversationId, this.currentWorkId);
      history = ragResult.history;
      const ragSources = ragResult.sources;

      const systemPrompt = this.config.instruction?.systemPrompt ?? '';
      const INVALID_PROMPTS = [
        'No instruction configured for this agent.',
        'Instruction not found.',
        'Instruction is currently inactive.',
      ];
      if (!systemPrompt || INVALID_PROMPTS.includes(systemPrompt)) {
        this.publishSystemMessage(conversationId, 'Agent chưa được thiết lập chỉ dẫn hoặc chỉ dẫn không còn hoạt động. Vui lòng liên hệ quản trị viên để cấu hình lại.');
        return;
      }

      if (this.browserCtx) {
        this.browserCtx.conversationId = conversationId;
      }

      const model = this.buildModel();
      const { tools, clients: mcpClients } = await this.resolveMcpTools(conversationId);
      const toolNames = Object.keys(tools);
      this.writeLog('info', 'MCP tools loaded', { count: toolNames.length, tools: toolNames });
      this.logger.debug(`[tools] resolved=${toolNames.length} names=${toolNames.join(',')}`);

      try {
        const inferenceStart = Date.now();
        const result = await generateText({
          model,
          system: systemPrompt,
          messages: history,
          tools: Object.keys(tools).length > 0 ? tools : undefined,
          stopWhen: stepCountIs(this.maxSteps),
          abortSignal: abortController.signal,
          onStepFinish: (step) => {
            for (const call of step.toolCalls ?? []) {
              this.logger.debug(`  [tool:call] ${call.toolName}(${JSON.stringify(call.input).slice(0, 120)})`);
              let toolUseContent = call.toolName;
              if (call.toolName === KNOWLEDGE_SEARCH_TOOL_NAME) {
                const input = call.input as { query?: string; collectionId?: string };
                toolUseContent = `🧠 **Knowledge Search**\n${input.query ?? ''}`;
              }
              this.publishResponse(conversationId, {
                type: 'tool_use',
                role: 'assistant',
                content: toolUseContent,
                toolName: call.toolName,
                toolInput: call.input,
                toolUseId: call.toolCallId,
                ...(this.currentWorkId ? { workId: this.currentWorkId } : {}),
              });
            }
            for (const res of step.toolResults ?? []) {
              this.logger.debug(`  [tool:result] ${res.toolName} → ${JSON.stringify(res.output).slice(0, 200)}`);
              let toolResultContent = JSON.stringify(res.output).slice(0, 200);
              if (res.toolName === KNOWLEDGE_SEARCH_TOOL_NAME) {
                const output = res.output as Array<{ score: number; content: string }> | undefined;
                const count = Array.isArray(output) ? output.length : 0;
                toolResultContent = `Retrieved ${count} knowledge chunk(s).`;
              }
              this.publishResponse(conversationId, {
                type: 'tool_result',
                role: 'assistant',
                content: toolResultContent,
                toolName: res.toolName,
                toolResult: res.output,
                toolResultId: res.toolCallId,
                ...(this.currentWorkId ? { workId: this.currentWorkId } : {}),
              });
            }
          },
        });

        const inferenceMs = Date.now() - inferenceStart;
        this.logger.debug(`[llm] done steps=${result.steps?.length} finishReason=${result.finishReason} outputLen=${result.text?.length}`);
        this.logger.debug(`[timing] inference=${inferenceMs}ms total=${Date.now() - taskReceivedAt}ms taskId=${taskId} conv=${conversationId}`);
        this.publishResponse(conversationId, { type: 'typing', isTyping: false });
        this.publishResponse(conversationId, {
          type: 'message',
          role: 'assistant',
          content: result.text,
          isFinal: true,
          ...(ragSources.length ? { sources: ragSources } : {}),
          ...(this.currentWorkId ? { workId: this.currentWorkId } : {}),
        });
        messageSent = true;
      } finally {
        await Promise.allSettled(mcpClients.map((c) => c.close()));
      }
    } catch (err: unknown) {
      const e = err as Error;
      if (e?.name === 'AbortError' || abortController.signal.aborted) {
        // Already handled by /stop
      } else {
        this.writeLog('error', 'Generation error', { conversationId, error: e.message, errorName: e.name });
        this.logger.error(`AI generation error: ${e.message}`, e.stack);
        const isLlmError = e.name === 'AI_APICallError' || e.message?.includes('deployment') || e.message?.includes('Not Found') || e.message?.includes('API key');
        this.publishSystemMessage(
          conversationId,
          isLlmError
            ? 'Hiện tại không thể kết nối với dịch vụ AI. Vui lòng thử lại sau hoặc liên hệ quản trị viên.'
            : 'Đã xảy ra lỗi khi xử lý tin nhắn của bạn. Vui lòng thử lại.',
        );
      }
    } finally {
      this.abortMap.delete(conversationId);
      this.currentWorkId = null;
      // Only clear typing here on error/abort paths — success path already cleared it before message
      if (!messageSent) {
        this.publishResponse(conversationId, { type: 'typing', isTyping: false });
      }
    }
  }

  /**
   * Re-fetch instruction, deployment and settings via in-process callback.
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
        mcpServers: resp.mcpServers ?? this.config.mcpServers,
        allowedFunctions: resp.allowedFunctions ?? this.config.allowedFunctions,
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
   * External trigger (event-driven reload). Skip if already reloading —
   * the in-flight reload will pick up the latest DB state when it runs
   * connectInternal, so a second reload is redundant.
   */
  async triggerReload(source: 'event' | 'manual' | 'health'): Promise<void> {
    if (this.isReloading) {
      this.logger.debug(`[triggerReload:${source}] skipped — already reloading`);
      return;
    }
    this.logger.log(`[triggerReload:${source}] starting`);
    await this.reload();
  }

  getAgentId(): string {
    return this.config.agentId;
  }

  getAccessToken(): string {
    return this.config.accessToken;
  }

  /**
   * Decode the JWT access token and return the expiry timestamp (seconds since epoch).
   * Returns null if the token is missing or malformed.
   */
  getAccessTokenExpiry(): number | null {
    try {
      const token = this.config.accessToken;
      if (!token) return null;
      const payloadB64 = token.split('.')[1];
      if (!payloadB64) return null;
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'));
      return typeof payload.exp === 'number' ? payload.exp : null;
    } catch {
      return null;
    }
  }

  /**
   * Resolve tools from all MCP servers in config using @ai-sdk/mcp.
   * Returns merged Vercel AI SDK tools filtered by allowedFunctions,
   * and the list of clients to close after generation.
   */
  private async resolveMcpTools(_conversationId?: string): Promise<{
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
            const namespacedKey = `mcp__${serverName}__${toolName}`;
            if (!allowedSet.has(namespacedKey)) continue;
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
        if (!allowedSet.has(toolName)) continue;
        toolMap[toolName] = toolDef;
      }
    }

    // In-process knowledge search tool — calls CBM directly without MCP hop
    if (this.config.searchKnowledgeInternal) {
      const knowledgeTools = createKnowledgeSearchTools({
        searchKnowledgeInternal: this.config.searchKnowledgeInternal,
      });
      for (const [toolName, toolDef] of Object.entries(knowledgeTools)) {
        if (!allowedSet.has(toolName)) continue;
        toolMap[toolName] = toolDef;
      }
    }

    // Connection builtin tools — publish channel:send via Redis instead of WS
    const channelSendTools = createChannelSendTools({
      redisPub: this.config.redisPub,
      agentType: this.config.agentType ?? 'assistant',
      uploadFileInternal: this.config.uploadFileInternal,
      apiBaseUrl: this.config.apiBaseUrl,
      accessToken: this.config.accessToken,
    });
    for (const [toolName, toolDef] of Object.entries(channelSendTools)) {
      if (!allowedSet.has(toolName)) continue;
      toolMap[toolName] = toolDef;
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
   *
   * V2 (Adaptive RAG): nếu ragConfig tồn tại, dùng AdaptiveRagService cho pipeline đầy đủ:
   *   1. Intent classification
   *   2. Collection routing
   *   3. Parallel/sequential search
   *   4. Relevance grading (optional)
   *   5. Query reformulation (optional)
   *
   * V1 (legacy): ragEnabled + ragCollections — giữ nguyên để backward-compatible.
   */
  private async augmentWithRagContext(
    history: any[],
    userContent: string,
    conversationId: string,
    workId?: string | null,
  ): Promise<{ history: any[]; sources: ActionSource[] }> {
    const empty = { history, sources: [] };

    // ── Adaptive RAG v2 ───────────────────────────────────────────────────────
    if (this.config.ragConfig?.enabled && this.config.adaptiveRagService && this.config.searchKnowledgeInternal) {
      return this._augmentWithAdaptiveRag(history, userContent, conversationId, workId);
    }

    // ── Legacy RAG v1 ─────────────────────────────────────────────────────────
    if (!this.config.ragEnabled) return empty;
    if (!this.config.ragCollections?.length) return empty;
    if (!this.config.searchKnowledgeInternal) return empty;
    if (userContent.length < 15) return empty;
    if (userContent.startsWith('/')) return empty;

    // Publish tool_use — RAG search started
    this.publishResponse(conversationId, {
      type: 'tool_use',
      role: 'assistant',
      content: `🧠 **Knowledge Search**\n${userContent}`,
      ...(workId ? { workId } : {}),
    });

    // Vector search across all collections
    const allChunks: Array<{ score: number; content: string; collectionId: string; sourceId: string; sourceType: 'file' | 'document' | '' }> = [];
    for (const col of this.config.ragCollections) {
      const results = await this.config.searchKnowledgeInternal(
        col.collectionId,
        userContent,
        col.topK,
        col.minScore,
      );
      allChunks.push(...results.map((r) => ({ ...r, collectionId: col.collectionId })));
    }

    if (!allChunks.length) {
      this.publishResponse(conversationId, {
        type: 'tool_result',
        role: 'assistant',
        content: 'No relevant knowledge found.',
        ...(workId ? { workId } : {}),
      });
      return empty;
    }

    // Sort by score desc, cap at max topK across collections
    const maxTopK = Math.max(...this.config.ragCollections.map((c) => c.topK));
    const topChunks = allChunks.sort((a, b) => b.score - a.score).slice(0, maxTopK);

    const sources: ActionSource[] = topChunks.map((c) => ({
      type: 'rag',
      content: c.content,
      score: c.score,
      collectionId: c.collectionId,
      sourceId: c.sourceId,
      sourceType: c.sourceType || undefined,
    }));

    this.publishResponse(conversationId, {
      type: 'tool_result',
      role: 'assistant',
      content: `Retrieved ${topChunks.length} knowledge chunk(s).`,
      ...(workId ? { workId } : {}),
    });

    return { history: this._injectContextBlock(history, topChunks), sources };
  }

  /**
   * Adaptive RAG v2 pipeline:
   *   intent → route → search → [grade] → [reformulate+retry] → inject
   */
  private async _augmentWithAdaptiveRag(
    history: any[],
    userContent: string,
    conversationId: string,
    workId?: string | null,
  ): Promise<{ history: any[]; sources: ActionSource[] }> {
    const empty = { history, sources: [] };
    const ragConfig = this.config.ragConfig!;
    const svc = this.config.adaptiveRagService!;
    const searchFn = this.config.searchKnowledgeInternal!;
    const deployment = this.config.deployment;

    // Step 1: Intent classification
    const intent = await svc.classifyIntent(userContent, ragConfig, deployment);
    this.logger.debug(`[adaptive-rag] intent=${intent.name} requiresRag=${intent.requiresRag}`);

    if (!intent.requiresRag) return empty;

    // Find matching intent rule for collection override
    const intentRule = ragConfig.intentClassifier?.intents?.find((r) => r.name === intent.name);

    // Step 2: Route collections
    const collections = svc.routeCollections(intent, ragConfig, intentRule);
    if (!collections.length) return empty;

    // Publish tool_use
    this.publishResponse(conversationId, {
      type: 'tool_use',
      role: 'assistant',
      content: `🧠 **Knowledge Search** [${intent.name}]\n${userContent}`,
      ...(workId ? { workId } : {}),
    });

    // Step 3: Search
    const parallel = ragConfig.query?.parallelSearch ?? true;
    let chunks = await svc.search(collections, userContent, searchFn, parallel);

    // Step 4: Query reformulation (retry if no results and reformulate enabled)
    if (!chunks.length && ragConfig.query?.reformulateOnLowScore && deployment) {
      const reformulated = await svc.reformulateQuery(userContent, deployment);
      if (reformulated !== userContent) {
        this.logger.debug(`[adaptive-rag] reformulated query: "${reformulated}"`);
        chunks = await svc.search(collections, reformulated, searchFn, parallel);
      }
    }

    if (!chunks.length) {
      this.publishResponse(conversationId, {
        type: 'tool_result',
        role: 'assistant',
        content: 'No relevant knowledge found.',
        ...(workId ? { workId } : {}),
      });
      return empty;
    }

    // Step 5: Relevance grading (optional)
    let finalChunks = chunks;
    if (ragConfig.grader?.relevanceEnabled) {
      const graderDeployment = ragConfig.grader.deploymentId ? deployment : deployment;
      finalChunks = await svc.gradeRelevance(
        chunks,
        userContent,
        ragConfig.grader.relevanceThreshold,
        graderDeployment,
      );
      this.logger.debug(`[adaptive-rag] graded: ${chunks.length} → ${finalChunks.length} relevant chunks`);
    }

    // Sort by score, take max topK
    const maxTopK = Math.max(...collections.map((c) => c.topK), 5);
    const topChunks = finalChunks.sort((a, b) => b.score - a.score).slice(0, maxTopK);

    if (!topChunks.length) {
      this.publishResponse(conversationId, {
        type: 'tool_result',
        role: 'assistant',
        content: 'No relevant knowledge found after grading.',
        ...(workId ? { workId } : {}),
      });
      return empty;
    }

    const sources: ActionSource[] = topChunks.map((c) => ({
      type: 'rag',
      content: c.content,
      score: c.score,
      collectionId: c.collectionId,
      sourceId: c.sourceId,
      sourceType: c.sourceType || undefined,
    }));

    this.publishResponse(conversationId, {
      type: 'tool_result',
      role: 'assistant',
      content: `Retrieved ${topChunks.length} chunk(s) [intent=${intent.name}].`,
      ...(workId ? { workId } : {}),
    });

    this.writeLog('info', 'Adaptive RAG context injected', { intent: intent.name, chunks: topChunks.length });
    this.logger.debug(`[adaptive-rag] injected chunks=${topChunks.length} scores=[${topChunks.map((c) => c.score.toFixed(2)).join(', ')}]`);

    return { history: this._injectContextBlock(history, topChunks), sources };
  }

  /** Build XML context block and inject into the last user message */
  private _injectContextBlock(
    history: any[],
    chunks: Array<{ score: number; content: string; collectionId: string; sourceId: string }>,
  ): any[] {
    const contextBlock = [
      '<knowledge_context>',
      ...chunks.map(
        (c, i) => `<source id="${i + 1}" score="${c.score.toFixed(2)}">\n${c.content}\n</source>`,
      ),
      '</knowledge_context>',
    ].join('\n');

    const augmented = [...history];
    const lastIdx = augmented.length - 1;
    if (augmented[lastIdx]?.role === 'user') {
      augmented[lastIdx] = {
        ...augmented[lastIdx],
        content: `${contextBlock}\n\n${augmented[lastIdx].content}`,
      };
    }
    return augmented;
  }
}
