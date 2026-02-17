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

      // 5. Build prompt & call LLM
      if (!this.genAI) {
        this.logger.error('GenAI not initialized - cannot process message');
        throw new Error('GOOGLE_API_KEY not configured');
      }

      const contents = this.buildContents(soul, memories, recentMessages, data.messageText);
      const result = await this.genAI.models.generateContent({
        model: soul.llm?.model || 'gemini-2.0-flash',
        contents,
      });
      const aiResponse = result.text || '';

      this.logger.log(`AI Response generated (${aiResponse.length} chars) for conversation: ${data.conversationId}`);

      // 6. Save assistant message to DB
      await this.messagesService.create({
        conversationId: new Types.ObjectId(data.conversationId) as any,
        role: 'assistant',
        content: aiResponse,
        llmProvider: 'google',
        llmModel: soul.llm?.model || 'gemini-2.0-flash',
        llmTokensUsed: {
          input: result.usageMetadata?.promptTokenCount || 0,
          output: result.usageMetadata?.candidatesTokenCount || 0,
          total: result.usageMetadata?.totalTokenCount || 0,
        },
      }, this.systemContext);

      // 7. Strip markdown & reply via Zalo OA API
      const plainResponse = this.stripMarkdown(aiResponse);
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
   * Build Gemini API contents array from soul config, memories, history, and current message
   */
  private buildContents(soul: any, memories: any[], recentMessages: any[], currentMessage: string): string {
    const parts: string[] = [];

    // System prompt + timezone
    if (soul.persona?.systemPrompt) {
      parts.push(soul.persona.systemPrompt);
    }
    const vnTime = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'full', timeStyle: 'short' });
    parts.push(`\nThời gian hiện tại: ${vnTime} (giờ Việt Nam, UTC+7).`);
    parts.push(`\nQUY TẮC ĐỊNH DẠNG: Tin nhắn sẽ gửi qua Zalo — KHÔNG dùng markdown (không **bold**, không *italic*, không bullet *, không heading #). Dùng văn bản thuần: xuống dòng, số thứ tự (1. 2. 3.), gạch ngang (−) nếu cần liệt kê. Giữ tin nhắn ngắn gọn, tự nhiên như chat.`);

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
