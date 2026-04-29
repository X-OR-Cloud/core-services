import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Types } from 'mongoose';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import { RequestContext } from '@hydrabyte/shared';
import { QUEUE_NAMES, QUEUE_EVENTS } from '../../config/queue.config';
import { SoulsService } from '../../modules/souls/souls.service';
import { ConversationsService } from '../../modules/conversations/conversations.service';
import { MessagesService } from '../../modules/messages/messages.service';
import { MemoriesService } from '../../modules/memories/memories.service';
import { ChannelsService } from '../../modules/channels/channels.service';
import { MemoryProducer } from '../producers/memory.producer';
import { TaskProducer } from '../producers/task.producer';
import { TasksService } from '../../modules/tasks/tasks.service';
import { QuotaService } from '../../modules/quota/quota.service';
import { PlansService } from '../../modules/plans/plans.service';
import { UserNewsPrefsService } from '../../modules/user-news-prefs/user-news-prefs.service';

// ─── News Digest UX constants ────────────────────────────────────────────────

const NEWS_CATEGORY_MAP: Record<string, string[]> = {
  '1': ['world', 'politics'],
  '2': ['business'],
  '3': ['technology'],
  '4': ['life'],
  '5': ['entertainment', 'sports'],
  '6': ['education'],
};

const NEWS_CATEGORY_NAMES: Record<string, string> = {
  '1': 'Thế giới & chính trị',
  '2': 'Kinh doanh & tài chính',
  '3': 'Công nghệ',
  '4': 'Đời sống & sức khỏe',
  '5': 'Giải trí & thể thao',
  '6': 'Giáo dục',
};

const NEWS_SLUG_NAMES: Record<string, string> = {
  world: 'Thế giới', politics: 'Chính trị', business: 'Kinh doanh',
  technology: 'Công nghệ', life: 'Đời sống', entertainment: 'Giải trí',
  sports: 'Thể thao', education: 'Giáo dục',
};

const NEWS_FREQ_MAP: Record<string, string> = { m: 'morning', e: 'evening', b: 'both' };

const NEWS_FREQ_DISPLAY: Record<string, string> = {
  morning: 'Sáng 07:00',
  evening: 'Chiều 18:00',
  both: 'Sáng 07:00 & Chiều 18:00',
};

const NEWS_SETUP_MENU =
  '📰 Cài bản tin hàng ngày ☕\n\n' +
  'Chọn chủ đề (gõ số, cách nhau bằng dấu phẩy):\n' +
  '1. Thế giới & chính trị\n' +
  '2. Kinh doanh & tài chính\n' +
  '3. Công nghệ\n' +
  '4. Đời sống & sức khỏe\n' +
  '5. Giải trí & thể thao\n' +
  '6. Giáo dục\n\n' +
  'Chọn giờ giao: M (Sáng 7h) / E (Chiều 18h) / B (Cả hai)\n\n' +
  'Gõ trong 1 tin, ví dụ: "1, 3, 4 - M"\n' +
  'Hoặc "tất cả - B" để nhận tất cả chủ đề cả 2 buổi.';

// ─────────────────────────────────────────────────────────────────────────────

interface TaskBlock {
  title: string;
  type: 'reminder' | 'todo';
  dueAt?: string; // ISO 8601
  remindAt?: string; // ISO 8601
  description?: string;
}

interface InboundJobData {
  conversationId: string;
  messageId: string;
  soulSlug: string;
  platformUserId: string;
  messageText: string;
  channelId: string;
}

@Processor(QUEUE_NAMES.INBOUND)
export class InboundProcessor extends WorkerHost {
  private readonly logger = new Logger(InboundProcessor.name);
  private genAI: GoogleGenAI | null = null;
  // In-memory TTL map for 2-turn news setup wizard: key → expiry timestamp
  private readonly newsSetupPending = new Map<string, number>();

  private get systemContext(): RequestContext {
    return {
      orgId: '',
      groupId: '',
      userId: 'system',
      agentId: '',
      appId: '',
      roles: ['universe.owner' as any],
    };
  }

  constructor(
    private soulsService: SoulsService,
    private conversationsService: ConversationsService,
    private messagesService: MessagesService,
    private memoriesService: MemoriesService,
    private channelsService: ChannelsService,
    private memoryProducer: MemoryProducer,
    private taskProducer: TaskProducer,
    private tasksService: TasksService,
    private quotaService: QuotaService,
    private plansService: PlansService,
    private userNewsPrefsService: UserNewsPrefsService,
  ) {
    super();
    const apiKey = process.env['GOOGLE_API_KEY'];
    if (!apiKey) {
      this.logger.warn('GOOGLE_API_KEY not set - LLM features disabled');
    } else {
      this.genAI = new GoogleGenAI({ apiKey });
    }
  }

  async process(job: Job): Promise<any> {
    this.logger.log(`Processing inbound job ${job.id}, name: ${job.name}`);

    switch (job.name) {
      case QUEUE_EVENTS.MESSAGE_RECEIVED:
        return this.handleMessageReceived(job.data.data as InboundJobData);
      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
        return null;
    }
  }

  private async handleMessageReceived(data: InboundJobData): Promise<any> {
    try {
      this.logger.log(`Processing message for conversation: ${data.conversationId}`);

      // 0. Handle task quick commands ("xong", "nhắc lại")
      const taskCommandResult = await this.handleTaskCommand(data);
      if (taskCommandResult) {
        return taskCommandResult;
      }

      // 0b. Handle news quick commands ("tin tức", "cài tin tức", etc.)
      const newsCommandResult = await this.handleNewsCommand(data);
      if (newsCommandResult) {
        return newsCommandResult;
      }

      // 1. Load soul config
      const soul = await this.soulsService.findBySlug(data.soulSlug);
      if (!soul) {
        throw new Error(`Soul not found: ${data.soulSlug}`);
      }

      // 2. Load conversation  
      const conversation = await this.conversationsService.findById(
        new Types.ObjectId(data.conversationId) as any, 
        this.systemContext,
      );
      if (!conversation) {
        throw new Error(`Conversation not found: ${data.conversationId}`);
      }

      // 3. Load recent messages
      const maxHistory = soul.memory?.maxHistoryMessages || 20;
      const recentMessages = await this.messagesService.getRecentByConversation(
        new Types.ObjectId(data.conversationId) as any,
        maxHistory,
      );

      // 4. Load memories for this platformUser
      const memories = await this.memoriesService.getByPlatformUser(
        data.platformUserId,
        new Types.ObjectId((soul as any)._id) as any,
      );

      // 5. Load pending tasks for context
      const pendingTasks = await this.tasksService.getPendingByUser(
        data.platformUserId,
        (soul as any)._id.toString(),
      );

      // 5a. Load plan+quota + news pref context for LLM (parallel)
      const [quotaSummary, newsPref] = await Promise.all([
        this.quotaService.getUserQuotaSummary(data.platformUserId),
        this.userNewsPrefsService.findByUser(data.platformUserId, (soul as any)._id.toString()),
      ]);
      const planDoc = await this.plansService.findBySlug(quotaSummary.planSlug);

      // 5c. Check daily chat quota (atomic check-and-consume)
      const quotaResult = await this.quotaService.tryConsumeChatQuota(data.platformUserId);
      if (!quotaResult.allowed) {
        const planName = this.getPlanDisplayName(quotaResult.planSlug);
        const msg = `Hôm nay bạn đã dùng hết ${quotaResult.limit} tin nhắn (gói ${planName}).\nQuota sẽ reset lúc 0h đêm nay (GMT+7).\nNâng cấp lên Immortal để có 200 tin nhắn/ngày nhé! 💪`;
        await this.sendZaloReply(data.channelId, data.platformUserId, msg);
        await this.messagesService.create({
          conversationId: new Types.ObjectId(data.conversationId) as any,
          role: 'assistant',
          content: msg,
        }, this.systemContext);
        return { processed: false, reason: 'quota_exceeded', platformUserId: data.platformUserId };
      }

      // 5b. Build prompt & call LLM
      if (!this.genAI) {
        this.logger.error('GenAI not initialized - cannot process message');
        throw new Error('GOOGLE_API_KEY not configured');
      }

      const contents = this.buildContents(soul, memories, recentMessages, data.messageText, pendingTasks, quotaSummary, planDoc, newsPref);
      const result = await this.genAI.models.generateContent({
        model: soul.llm?.model || 'gemini-2.5-flash',
        contents,
      });
      const aiResponse = result.text || '';

      this.logger.log(`AI Response generated (${aiResponse.length} chars) for conversation: ${data.conversationId}`);

      // 5.5. Parse and handle <task> blocks
      const { cleanResponse, tasks } = this.extractTaskBlocks(aiResponse);
      let taskQuotaExceededMsg: string | undefined;
      if (tasks.length > 0) {
        for (const taskData of tasks) {
          const result = await this.createAndScheduleTask(taskData, data, soul);
          // Collect at most 1 quota warning (don't repeat for each blocked task)
          if (result.quotaExceededMsg && !taskQuotaExceededMsg) {
            taskQuotaExceededMsg = result.quotaExceededMsg;
          }
        }
      }

      // Build final reply: cleanResponse + optional task quota warning
      const finalResponse = taskQuotaExceededMsg
        ? `${cleanResponse || aiResponse}\n\n${taskQuotaExceededMsg}`
        : (cleanResponse || aiResponse);

      // 6. Save assistant message to DB (clean response without task blocks)
      await this.messagesService.create({
        conversationId: new Types.ObjectId(data.conversationId) as any,
        role: 'assistant',
        content: finalResponse,
        llmProvider: 'google',
        llmModel: soul.llm?.model || 'gemini-2.5-flash',
        llmTokensUsed: {
          input: result.usageMetadata?.promptTokenCount || 0,
          output: result.usageMetadata?.candidatesTokenCount || 0,
          total: result.usageMetadata?.totalTokenCount || 0,
        },
      }, this.systemContext);

      // 7. Strip markdown & reply via Zalo OA API
      const plainResponse = this.stripMarkdown(finalResponse);
      await this.sendZaloReply(data.channelId, data.platformUserId, plainResponse);

      // 7a. Send 80% quota warning as a follow-up message if needed
      if (quotaResult.warningNeeded && quotaResult.limit !== null) {
        const remaining = quotaResult.limit - quotaResult.messageCount;
        const planName = this.getPlanDisplayName(quotaResult.planSlug);
        const warningMsg = `⚠️ Bạn còn ${remaining} tin nhắn hôm nay (gói ${planName}, giới hạn ${quotaResult.limit}/ngày).\nNâng cấp lên Immortal để có 200 tin/ngày + 30 task đang chờ + nhắc nhở lặp lại nhé!`;
        await this.sendZaloReply(data.channelId, data.platformUserId, warningMsg);
      }

      // 8. Update conversation.lastActiveAt
      await this.conversationsService.update(
        new Types.ObjectId(data.conversationId) as any,
        { lastActiveAt: new Date() },
        this.systemContext,
      );

      // 9. Trigger memory extract if enabled
      if (soul.memory?.autoExtract) {
        await this.memoryProducer.triggerMemoryExtract({
          conversationId: data.conversationId,
          platformUserId: data.platformUserId,
          soulId: (soul as any)._id.toString(),
        });
        this.logger.log(`Memory extraction queued for conversation: ${data.conversationId}`);
      }

      return { 
        processed: true, 
        conversationId: data.conversationId,
        responseLength: aiResponse.length,
      };

    } catch (error) {
      this.logger.error(`Error processing message: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Handle quick task commands: "xong", "done", "nhắc lại Xp/Xh"
   * Returns a result object if handled, null if not a task command
   */
  private async handleTaskCommand(data: InboundJobData): Promise<any | null> {
    const text = data.messageText.trim().toLowerCase();

    // "quota" — check remaining quota without consuming it
    if (text === 'quota' || text === 'còn bao nhiêu' || text === 'còn bao nhiêu tin') {
      const summary = await this.quotaService.getUserQuotaSummary(data.platformUserId);
      const planName = this.getPlanDisplayName(summary.planSlug);

      // Chat quota line
      let chatLine: string;
      if (summary.chat.limit === null) {
        chatLine = '− Tin nhắn: không giới hạn';
      } else {
        const remaining = Math.max(0, summary.chat.limit - summary.chat.messageCount);
        chatLine = `− Tin nhắn: ${summary.chat.messageCount}/${summary.chat.limit} đã dùng (còn ${remaining})`;
      }

      // Task quota line
      let taskLine: string;
      if (summary.tasks.limit === null) {
        taskLine = `− Tasks đang chờ: ${summary.tasks.activeCount} (không giới hạn)`;
      } else {
        const taskRemaining = Math.max(0, summary.tasks.limit - summary.tasks.activeCount);
        taskLine = `− Tasks đang chờ: ${summary.tasks.activeCount}/${summary.tasks.limit} (còn ${taskRemaining} slot)`;
      }

      let reply: string;
      if (summary.chat.limit === null) {
        reply = `📊 Quota hôm nay của bạn:\n− Gói: ${planName}\n${chatLine}\n${taskLine}`;
      } else {
        reply = `📊 Quota hôm nay của bạn:\n− Gói: ${planName}\n${chatLine}\n${taskLine}\n− Reset lúc: 0h đêm nay (GMT+7)`;
      }
      await this.sendZaloReply(data.channelId, data.platformUserId, reply);
      await this.messagesService.create({
        conversationId: new Types.ObjectId(data.conversationId) as any,
        role: 'assistant',
        content: reply,
      }, this.systemContext);
      return { processed: true, taskCommand: 'quota_check' };
    }

    // "plan" — show current plan card (instant, no LLM)
    if (text === 'plan' || text === 'gói của tôi' || text === 'gói của mình') {
      const summary = await this.quotaService.getUserQuotaSummary(data.platformUserId);
      const planDoc = await this.plansService.findBySlug(summary.planSlug);
      const planName = planDoc?.name || this.getPlanDisplayName(summary.planSlug);

      const expiryLine = summary.planSlug === 'mortal'
        ? '− Gói: Mortal (miễn phí)'
        : `− Gói: ${planName}`;

      let chatLine: string;
      if (summary.chat.limit === null) {
        chatLine = '− Tin nhắn/ngày: không giới hạn';
      } else {
        const remaining = Math.max(0, summary.chat.limit - summary.chat.messageCount);
        chatLine = `− Tin nhắn/ngày: ${summary.chat.limit} (hôm nay dùng ${summary.chat.messageCount}, còn ${remaining})`;
      }

      let taskLine: string;
      if (summary.tasks.limit === null) {
        taskLine = `− Tasks tối đa: không giới hạn (đang dùng ${summary.tasks.activeCount})`;
      } else {
        taskLine = `− Tasks tối đa: ${summary.tasks.limit} đang chờ (đang dùng ${summary.tasks.activeCount})`;
      }

      const recurringLine = `− Nhắc nhở lặp lại: ${summary.features.recurringTasks ? 'có' : 'không'}`;

      const reply = `📋 Thông tin gói của bạn:\n${expiryLine}\n${chatLine}\n${taskLine}\n${recurringLine}`;

      await this.sendZaloReply(data.channelId, data.platformUserId, reply);
      await this.messagesService.create({
        conversationId: new Types.ObjectId(data.conversationId) as any,
        role: 'assistant',
        content: reply,
      }, this.systemContext);
      return { processed: true, taskCommand: 'plan_info' };
    }

    // "xong" or "done" — mark most recent notified task as done
    if (text === 'xong' || text === 'done' || text === 'hoàn thành') {
      const soul = await this.soulsService.findBySlug(data.soulSlug);
      if (!soul) return null;
      const task = await this.tasksService.findRecentPendingByUser(
        data.platformUserId,
        (soul as any)._id.toString(),
      );

      if (!task) return null; // Not a task command if no pending tasks

      await this.tasksService.markDone((task as any)._id.toString(), this.systemContext);
      await this.taskProducer.cancelReminder((task as any)._id.toString());

      const reply = `✅ Đã hoàn thành: ${task.title}`;
      await this.sendZaloReply(data.channelId, data.platformUserId, reply);

      // Save as message
      await this.messagesService.create({
        conversationId: new Types.ObjectId(data.conversationId) as any,
        role: 'assistant',
        content: reply,
      }, this.systemContext);

      return { processed: true, taskCommand: 'done', taskId: (task as any)._id.toString() };
    }

    // "nhắc lại 30p" / "nhắc lại 1h" / "hoãn 2h"
    const snoozeMatch = text.match(/^(?:nhắc lại|hoãn|snooze)\s+(\d+)\s*(p|ph|phút|m|min|h|giờ|hour)?$/i);
    if (snoozeMatch) {
      const soul = await this.soulsService.findBySlug(data.soulSlug);
      if (!soul) return null;
      const task = await this.tasksService.findRecentPendingByUser(
        data.platformUserId,
        (soul as any)._id.toString(),
      );

      if (!task) return null;

      const amount = parseInt(snoozeMatch[1]);
      const unit = snoozeMatch[2]?.toLowerCase() || 'p';
      const isHour = unit.startsWith('h') || unit.startsWith('g');
      const delayMs = amount * (isHour ? 3600000 : 60000);
      const newRemindAt = new Date(Date.now() + delayMs);

      await this.tasksService.snooze((task as any)._id.toString(), newRemindAt, this.systemContext);
      
      // Cancel old job, schedule new one
      await this.taskProducer.cancelReminder((task as any)._id.toString());
      await this.taskProducer.scheduleReminder({
        taskId: (task as any)._id.toString(),
        conversationId: task.conversationId,
        platformUserId: task.platformUserId,
        soulId: task.soulId,
        channelId: task.channelId,
        title: task.title,
        remindAt: newRemindAt,
      });

      const timeStr = isHour ? `${amount} giờ` : `${amount} phút`;
      const vnTime = newRemindAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', timeStyle: 'short' });
      const reply = `⏰ Đã hoãn "${task.title}" — sẽ nhắc lại sau ${timeStr} (lúc ${vnTime})`;
      await this.sendZaloReply(data.channelId, data.platformUserId, reply);

      await this.messagesService.create({
        conversationId: new Types.ObjectId(data.conversationId) as any,
        role: 'assistant',
        content: reply,
      }, this.systemContext);

      return { processed: true, taskCommand: 'snooze', taskId: (task as any)._id.toString() };
    }

    return null;
  }

  /**
   * Handle news digest quick commands: "tin tức", "cài tin tức", "tắt tin tức", "bật tin tức"
   * Also intercepts setup reply when awaiting user's category/frequency input.
   * Returns a result object if handled, null if not a news command.
   */
  private async handleNewsCommand(data: InboundJobData): Promise<any | null> {
    const text = data.messageText.trim().toLowerCase();
    const soul = await this.soulsService.findBySlug(data.soulSlug);
    if (!soul) return null;
    const soulId = (soul as any)._id.toString();
    const setupKey = `${data.platformUserId}:${soulId}`;

    // ── Check if we're awaiting a setup reply ─────────────────────────────────
    const pendingExpiry = this.newsSetupPending.get(setupKey);
    if (pendingExpiry && Date.now() < pendingExpiry) {
      const parsed = this.parseNewsSetupReply(data.messageText.trim());
      if (parsed) {
        // Valid setup reply → save pref
        this.newsSetupPending.delete(setupKey);
        await this.userNewsPrefsService.upsert(data.platformUserId, soulId, data.channelId, {
          categories: parsed.categories,
          frequency: parsed.frequency,
        });
        const freqDisplay = NEWS_FREQ_DISPLAY[parsed.frequency] || parsed.frequency;
        const reply =
          `✅ Đã cài bản tin:\n` +
          `− Chủ đề: ${parsed.catNames}\n` +
          `− Giao: ${freqDisplay} GMT+7\n\n` +
          `Bản tin đầu tiên sẽ đến theo lịch. Gõ "tắt tin tức" để dừng bất cứ lúc nào.`;
        await this.sendZaloReply(data.channelId, data.platformUserId, reply);
        await this.messagesService.create({
          conversationId: new Types.ObjectId(data.conversationId) as any,
          role: 'assistant',
          content: reply,
        }, this.systemContext);
        return { processed: true, newsCommand: 'setup_saved' };
      } else {
        // Invalid format — show hint, keep waiting
        const hint = 'Chưa đúng định dạng. Hãy gõ theo mẫu: "1, 3, 4 - M" (số chủ đề - giờ giao M/E/B)\nVí dụ: "1, 3 - M" → Thế giới, Công nghệ vào sáng 7h.';
        await this.sendZaloReply(data.channelId, data.platformUserId, hint);
        await this.messagesService.create({
          conversationId: new Types.ObjectId(data.conversationId) as any,
          role: 'assistant',
          content: hint,
        }, this.systemContext);
        return { processed: true, newsCommand: 'setup_invalid_format' };
      }
    }

    // ── Exact keyword commands ────────────────────────────────────────────────

    // "tin tức" / "news" — show current status
    if (text === 'tin tức' || text === 'news') {
      const pref = await this.userNewsPrefsService.findByUser(data.platformUserId, soulId);
      let reply: string;
      if (!pref) {
        reply = '📰 Bạn chưa cài bản tin hàng ngày.\nGõ "cài tin tức" để bắt đầu nhận tin nóng mỗi ngày từ TranGPT ☕';
      } else if (!pref.active) {
        reply =
          '📰 Bản tin hàng ngày của bạn:\n' +
          '− Trạng thái: đã tắt ❌\n\n' +
          'Gõ "bật tin tức" để bật lại, "cài tin tức" để thay đổi cài đặt.';
      } else {
        const catDisplay = pref.categories?.length
          ? pref.categories.map((s: string) => NEWS_SLUG_NAMES[s] || s).join(', ')
          : 'Tất cả chủ đề';
        const freqDisplay = NEWS_FREQ_DISPLAY[pref.frequency] || pref.frequency;
        reply =
          '📰 Bản tin hàng ngày của bạn:\n' +
          `− Trạng thái: đang bật ✅\n` +
          `− Chủ đề: ${catDisplay}\n` +
          `− Giờ giao: ${freqDisplay} GMT+7\n\n` +
          'Gõ "cài tin tức" để thay đổi, "tắt tin tức" để dừng.';
      }
      await this.sendZaloReply(data.channelId, data.platformUserId, reply);
      await this.messagesService.create({
        conversationId: new Types.ObjectId(data.conversationId) as any,
        role: 'assistant',
        content: reply,
      }, this.systemContext);
      return { processed: true, newsCommand: 'status' };
    }

    // "cài tin tức" — start setup wizard
    if (text === 'cài tin tức' || text === 'đăng ký tin tức' || text === 'cai tin tuc') {
      // Set pending state (TTL 5 minutes)
      this.newsSetupPending.set(setupKey, Date.now() + 5 * 60 * 1000);
      await this.sendZaloReply(data.channelId, data.platformUserId, NEWS_SETUP_MENU);
      await this.messagesService.create({
        conversationId: new Types.ObjectId(data.conversationId) as any,
        role: 'assistant',
        content: NEWS_SETUP_MENU,
      }, this.systemContext);
      return { processed: true, newsCommand: 'setup_start' };
    }

    // "tắt tin tức" / "dừng tin tức" — disable
    if (text === 'tắt tin tức' || text === 'dừng tin tức' || text === 'tat tin tuc') {
      const pref = await this.userNewsPrefsService.findByUser(data.platformUserId, soulId);
      let reply: string;
      if (!pref) {
        reply = 'Bạn chưa cài bản tin nên không cần tắt. Gõ "cài tin tức" nếu muốn bắt đầu nhận tin.';
      } else {
        await this.userNewsPrefsService.setActive(data.platformUserId, soulId, false);
        reply = '✅ Đã tắt bản tin. Bạn sẽ không nhận tin tức hàng ngày nữa.\nGõ "bật tin tức" để bật lại bất cứ lúc nào.';
      }
      await this.sendZaloReply(data.channelId, data.platformUserId, reply);
      await this.messagesService.create({
        conversationId: new Types.ObjectId(data.conversationId) as any,
        role: 'assistant',
        content: reply,
      }, this.systemContext);
      return { processed: true, newsCommand: 'disable' };
    }

    // "bật tin tức" / "mở tin tức" — enable
    if (text === 'bật tin tức' || text === 'mở tin tức' || text === 'bat tin tuc') {
      const pref = await this.userNewsPrefsService.findByUser(data.platformUserId, soulId);
      let reply: string;
      if (!pref) {
        reply = 'Bạn chưa cài bản tin. Gõ "cài tin tức" để bắt đầu.';
      } else {
        await this.userNewsPrefsService.setActive(data.platformUserId, soulId, true);
        const catDisplay = pref.categories?.length
          ? pref.categories.map((s: string) => NEWS_SLUG_NAMES[s] || s).join(', ')
          : 'Tất cả chủ đề';
        const freqDisplay = NEWS_FREQ_DISPLAY[pref.frequency] || pref.frequency;
        reply =
          `✅ Đã bật lại bản tin. Bạn sẽ nhận tin theo lịch cũ:\n` +
          `− Chủ đề: ${catDisplay}\n` +
          `− Giờ giao: ${freqDisplay} GMT+7`;
      }
      await this.sendZaloReply(data.channelId, data.platformUserId, reply);
      await this.messagesService.create({
        conversationId: new Types.ObjectId(data.conversationId) as any,
        role: 'assistant',
        content: reply,
      }, this.systemContext);
      return { processed: true, newsCommand: 'enable' };
    }

    return null;
  }

  /**
   * Parse user's setup reply: "1, 3, 4 - M" or "tất cả - B"
   */
  private parseNewsSetupReply(text: string): { categories: string[]; frequency: string; catNames: string } | null {
    const m = text.match(/^([\d,\s]+|tất cả)\s*[-–]\s*([MEB])$/i);
    if (!m) return null;
    const catPart = m[1].trim();
    const freqKey = m[2].toLowerCase();
    const frequency = NEWS_FREQ_MAP[freqKey];
    if (!frequency) return null;

    let categories: string[];
    let catNames: string;
    if (catPart.toLowerCase() === 'tất cả') {
      categories = ['world', 'politics', 'business', 'technology', 'life', 'entertainment', 'sports', 'education'];
      catNames = 'Tất cả chủ đề';
    } else {
      const nums = catPart.split(',').map(n => n.trim()).filter(n => NEWS_CATEGORY_MAP[n]);
      if (!nums.length) return null;
      categories = [...new Set(nums.flatMap(n => NEWS_CATEGORY_MAP[n]))];
      catNames = nums.map(n => NEWS_CATEGORY_NAMES[n]).join(', ');
    }

    return { categories, frequency, catNames };
  }

  /**
   * Build news digest context string for LLM prompt injection.
   */
  private buildNewsContext(pref: any): string {
    if (!pref) {
      return 'THÔNG TIN BẢN TIN: Người dùng chưa cài bản tin hàng ngày. Nếu họ hỏi về tin tức hoặc bản tin, hướng dẫn gõ "cài tin tức".';
    }
    if (!pref.active) {
      return 'THÔNG TIN BẢN TIN: Đã tắt. Người dùng có thể gõ "bật tin tức" để bật lại.';
    }
    const catDisplay = pref.categories?.length
      ? pref.categories.map((s: string) => NEWS_SLUG_NAMES[s] || s).join(', ')
      : 'tất cả chủ đề';
    const freqStr = NEWS_FREQ_DISPLAY[pref.frequency] || pref.frequency;
    return `THÔNG TIN BẢN TIN: Đang bật. Chủ đề: ${catDisplay}. Giao: ${freqStr} GMT+7. Nếu người dùng hỏi về bản tin, hãy trả lời dựa trên thông tin này. Gõ "cài tin tức" để thay đổi cài đặt.`;
  }

  /**
   * Extract <task> JSON blocks from AI response
   */
  private extractTaskBlocks(response: string): { cleanResponse: string; tasks: TaskBlock[] } {
    const tasks: TaskBlock[] = [];
    const taskRegex = /<task>([\s\S]*?)<\/task>/g;
    let match;

    while ((match = taskRegex.exec(response)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed.title) {
          tasks.push(parsed as TaskBlock);
        }
      } catch (e) {
        this.logger.warn(`Failed to parse task block: ${match[1]}`);
      }
    }

    const cleanResponse = response.replace(/<task>[\s\S]*?<\/task>/g, '').trim();
    return { cleanResponse, tasks };
  }

  /**
   * Create a task document and schedule the BullMQ delayed job.
   * Returns { created, quotaExceededMsg } — quotaExceededMsg is set when quota is full.
   */
  private async createAndScheduleTask(
    taskData: TaskBlock,
    inboundData: InboundJobData,
    soul: any,
  ): Promise<{ created: boolean; quotaExceededMsg?: string }> {
    try {
      // Check task quota before creating
      const taskQuota = await this.quotaService.checkTaskQuota(inboundData.platformUserId);
      if (!taskQuota.allowed) {
        this.logger.warn(`Task quota exceeded for user ${inboundData.platformUserId} (${taskQuota.activeCount}/${taskQuota.limit})`);
        const planName = this.getPlanDisplayName(taskQuota.planSlug);
        return {
          created: false,
          quotaExceededMsg: `Lưu ý: Mình đã đạt giới hạn ${taskQuota.activeCount}/${taskQuota.limit} task đang chờ (gói ${planName}). Hoàn thành bớt task cũ hoặc nâng cấp gói để tạo thêm nhé!`,
        };
      }

      const remindAt = taskData.remindAt
        ? new Date(taskData.remindAt)
        : taskData.dueAt
          ? new Date(taskData.dueAt)
          : null;

      const task = await this.tasksService.create(
        {
          conversationId: inboundData.conversationId,
          soulId: (soul as any)._id.toString(),
          platformUserId: inboundData.platformUserId,
          channelId: inboundData.channelId,
          title: taskData.title,
          description: taskData.description,
          type: taskData.type || 'reminder',
          status: 'pending',
          dueAt: taskData.dueAt ? new Date(taskData.dueAt) : undefined,
          remindAt,
          source: 'user_request',
          rawMessage: inboundData.messageText,
        },
        this.systemContext,
      );

      const taskId = (task as any)._id.toString();

      // Schedule BullMQ delayed job if remindAt is set
      if (remindAt) {
        const jobId = await this.taskProducer.scheduleReminder({
          taskId,
          conversationId: inboundData.conversationId,
          platformUserId: inboundData.platformUserId,
          soulId: (soul as any)._id.toString(),
          channelId: inboundData.channelId,
          title: taskData.title,
          remindAt,
        });

        // Store job ID for cancellation
        await this.tasksService.update(
          new Types.ObjectId(taskId) as any,
          { bullJobId: jobId },
          this.systemContext,
        );
      }

      this.logger.log(`Task created: ${taskId} — "${taskData.title}" (remind: ${remindAt?.toISOString() || 'none'})`);
      return { created: true };
    } catch (error) {
      this.logger.error(`Failed to create task: ${error.message}`);
      return { created: false };
    }
  }

  /**
   * Build Gemini API contents array from soul config, memories, history, and current message
   */
  private buildContents(soul: any, memories: any[], recentMessages: any[], currentMessage: string, pendingTasks: any[] = [], quotaSummary?: any, planDoc?: any, newsPref?: any): string {
    const parts: string[] = [];

    // System prompt + timezone
    if (soul.persona?.systemPrompt) {
      parts.push(soul.persona.systemPrompt);
    }
    const vnTime = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'full', timeStyle: 'short' });
    parts.push(`\nThời gian hiện tại: ${vnTime} (giờ Việt Nam, UTC+7).`);
    parts.push(`\nQUY TẮC ĐỊNH DẠNG: Tin nhắn sẽ gửi qua Zalo — KHÔNG dùng markdown (không **bold**, không *italic*, không bullet *, không heading #). Dùng văn bản thuần: xuống dòng, số thứ tự (1. 2. 3.), gạch ngang (−) nếu cần liệt kê. Giữ tin nhắn ngắn gọn, tự nhiên như chat.`);

    // Task/reminder detection instruction
    parts.push(`\nCHỨC NĂNG NHẮC NHỞ: Khi người dùng yêu cầu nhắc nhở, đặt lịch, ghi việc cần làm, hẹn giờ, hoặc nói những câu như "nhắc tôi...", "nhớ nhắc...", "lúc 3h...", "ngày mai nhớ...", hãy thêm một block JSON vào CUỐI tin nhắn (sau phần trả lời người dùng):
<task>{"title":"mô tả ngắn gọn","type":"reminder","dueAt":"YYYY-MM-DDTHH:mm:ss+07:00","remindAt":"YYYY-MM-DDTHH:mm:ss+07:00"}</task>
Quy tắc:
− type: "reminder" (có thời gian) hoặc "todo" (không có thời gian cụ thể)
− dueAt: thời điểm deadline/sự kiện (UTC+7)
− remindAt: thời điểm gửi nhắc nhở (mặc định = dueAt, hoặc sớm hơn nếu user yêu cầu "nhắc trước 15 phút")
− Nếu user chỉ nói "nhắc tôi" mà không rõ thời gian, hỏi lại thời gian cụ thể, KHÔNG tạo task block
− Block <task> sẽ được hệ thống xử lý và XÓA trước khi gửi tin nhắn — người dùng KHÔNG nhìn thấy nó`);

    // Memories as context
    if (memories.length > 0) {
      const memoryContext = memories
        .filter((m: any) => m.type !== 'reminder')
        .map((m: any) => `- ${m.key}: ${m.value} (${m.type}, độ tin cậy: ${(m.confidence * 100).toFixed(0)}%)`)
        .join('\n');
      if (memoryContext) {
        parts.push(`\nThông tin em đã ghi nhớ về người dùng này:\n${memoryContext}`);
        parts.push('Nếu người dùng hỏi "em nhớ gì về anh/chị?" hoặc tương tự, hãy liệt kê các thông tin trên một cách tự nhiên, thân thiện.');
      }
    } else {
      parts.push('\nEm chưa biết nhiều về người dùng này. Nếu họ hỏi em nhớ gì, hãy nói em chưa biết nhiều và muốn tìm hiểu thêm.');
    }

    // Plan & quota context
    if (quotaSummary && planDoc) {
      const planName = planDoc.name || this.getPlanDisplayName(quotaSummary.planSlug);
      const chatLine = quotaSummary.chat.limit === null
        ? 'không giới hạn'
        : `${quotaSummary.chat.messageCount}/${quotaSummary.chat.limit} đã dùng (còn ${Math.max(0, quotaSummary.chat.limit - quotaSummary.chat.messageCount)})`;
      const taskLine = quotaSummary.tasks.limit === null
        ? `${quotaSummary.tasks.activeCount} (không giới hạn)`
        : `${quotaSummary.tasks.activeCount}/${quotaSummary.tasks.limit} slot`;
      const recurringLine = quotaSummary.features.recurringTasks ? 'có' : 'không';
      parts.push(`\nTHÔNG TIN GÓI CỦA NGƯỜI DÙNG:\n− Gói hiện tại: ${planName}\n− Tin nhắn hôm nay: ${chatLine}\n− Tasks đang chờ: ${taskLine}\n− Nhắc nhở lặp lại: ${recurringLine}\nNếu người dùng hỏi về plan, quota, gói dịch vụ, số tin nhắn còn lại — hãy dùng thông tin trên để trả lời chính xác, thân thiện.`);
    }

    // News digest context
    parts.push('\n' + this.buildNewsContext(newsPref));

    // Pending tasks context
    if (pendingTasks.length > 0) {
      const taskContext = pendingTasks.map((t: any) => {
        const dueStr = t.dueAt
          ? new Date(t.dueAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })
          : 'không có deadline';
        return `− ${t.title} (${t.type}, ${t.status}, ${dueStr})`;
      }).join('\n');
      parts.push(`\nCông việc/nhắc nhở đang chờ của người dùng:\n${taskContext}`);
    }

    // Recent conversation history
    if (recentMessages.length > 0) {
      const historyContext = recentMessages
        .reverse()
        .map((m: any) => `${m.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${m.content}`)
        .join('\n');
      parts.push(`\nLịch sử hội thoại:\n${historyContext}`);
    }

    // Current message
    parts.push(`\nNgười dùng: ${currentMessage}`);
    parts.push('\nTrợ lý:');

    return parts.join('\n');
  }

  /**
   * Strip markdown formatting for plain-text platforms (Zalo)
   */
  private stripMarkdown(text: string): string {
    return text
      // Headers: ## Title → Title
      .replace(/^#{1,6}\s+/gm, '')
      // Bold/italic: **text** or __text__ or *text* or _text_
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      // Strikethrough: ~~text~~
      .replace(/~~(.+?)~~/g, '$1')
      // Inline code: `code`
      .replace(/`(.+?)`/g, '$1')
      // Code blocks: ```...```
      .replace(/```[\s\S]*?```/g, (match) => match.replace(/```\w*\n?/g, '').trim())
      // Bullet points: * item or - item → − item
      .replace(/^\s*[\*\-]\s+/gm, '− ')
      // Links: [text](url) → text (url)
      .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)')
      // Images: ![alt](url) → (alt)
      .replace(/!\[(.+?)\]\(.+?\)/g, '($1)')
      // Clean up multiple blank lines
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Map plan slug to display name
   */
  private getPlanDisplayName(planSlug: string): string {
    const names: Record<string, string> = {
      mortal: 'Mortal',
      immortal: 'Immortal',
      god: 'God',
    };
    return names[planSlug] || planSlug;
  }

  /**
   * Send reply via Zalo OA API
   */
  private async sendZaloReply(channelId: string, platformUserId: string, text: string): Promise<void> {
    try {
      const channel = await this.channelsService.findById(
        new Types.ObjectId(channelId) as any,
        this.systemContext,
      );
      
      if (!channel || !channel.credentials?.accessToken) {
        this.logger.warn(`Channel ${channelId} missing access token - cannot send reply`);
        return;
      }

      const response = await axios.post(
        'https://openapi.zalo.me/v3.0/oa/message/cs',
        {
          recipient: { user_id: platformUserId },
          message: { text },
        },
        {
          headers: {
            'access_token': channel.credentials.accessToken,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      if (response.data.error !== 0) {
        throw new Error(`Zalo API error ${response.data.error}: ${response.data.message || 'Unknown'}`);
      }

      this.logger.log(`Zalo reply sent to user: ${platformUserId}`);
    } catch (error) {
      this.logger.error(`Failed to send Zalo message: ${error.message}`, error.stack);
    }
  }
}
