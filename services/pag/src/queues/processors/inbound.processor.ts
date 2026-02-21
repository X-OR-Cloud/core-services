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

      // 5a. Build prompt & call LLM
      if (!this.genAI) {
        this.logger.error('GenAI not initialized - cannot process message');
        throw new Error('GOOGLE_API_KEY not configured');
      }

      const contents = this.buildContents(soul, memories, recentMessages, data.messageText, pendingTasks);
      const result = await this.genAI.models.generateContent({
        model: soul.llm?.model || 'gemini-2.0-flash',
        contents,
      });
      const aiResponse = result.text || '';

      this.logger.log(`AI Response generated (${aiResponse.length} chars) for conversation: ${data.conversationId}`);

      // 5.5. Parse and handle <task> blocks
      const { cleanResponse, tasks } = this.extractTaskBlocks(aiResponse);
      if (tasks.length > 0) {
        for (const taskData of tasks) {
          await this.createAndScheduleTask(taskData, data, soul);
        }
      }

      // 6. Save assistant message to DB (clean response without task blocks)
      await this.messagesService.create({
        conversationId: new Types.ObjectId(data.conversationId) as any,
        role: 'assistant',
        content: cleanResponse || aiResponse,
        llmProvider: 'google',
        llmModel: soul.llm?.model || 'gemini-2.0-flash',
        llmTokensUsed: {
          input: result.usageMetadata?.promptTokenCount || 0,
          output: result.usageMetadata?.candidatesTokenCount || 0,
          total: result.usageMetadata?.totalTokenCount || 0,
        },
      }, this.systemContext);

      // 7. Strip markdown & reply via Zalo OA API
      const plainResponse = this.stripMarkdown(cleanResponse || aiResponse);
      await this.sendZaloReply(data.channelId, data.platformUserId, plainResponse);

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
   * Create a task document and schedule the BullMQ delayed job
   */
  private async createAndScheduleTask(
    taskData: TaskBlock,
    inboundData: InboundJobData,
    soul: any,
  ): Promise<void> {
    try {
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
    } catch (error) {
      this.logger.error(`Failed to create task: ${error.message}`);
    }
  }

  /**
   * Build Gemini API contents array from soul config, memories, history, and current message
   */
  private buildContents(soul: any, memories: any[], recentMessages: any[], currentMessage: string, pendingTasks: any[] = []): string {
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
