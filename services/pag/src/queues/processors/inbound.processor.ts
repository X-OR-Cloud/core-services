import { Logger, Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { Types } from 'mongoose';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import { QUEUE_EVENTS, getInboundQueueName } from '../../config/queue.config';
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

@Injectable()
export class InboundProcessor {
  private readonly logger = new Logger(InboundProcessor.name);
  private genAI: GoogleGenAI;

  constructor(
    private soulsService: SoulsService,
    private conversationsService: ConversationsService,
    private messagesService: MessagesService,
    private memoriesService: MemoriesService,
    private channelsService: ChannelsService,
    private memoryProducer: MemoryProducer,
  ) {
    // Initialize Google Generative AI
    const apiKey = process.env['GOOGLE_API_KEY'];
    if (!apiKey) {
      this.logger.warn('GOOGLE_API_KEY not set - LLM features disabled');
    }
    if (apiKey) { this.genAI = new GoogleGenAI({ apiKey }); }
  }

  /**
   * This processor handles dynamic queues (pag:inbound:{soulSlug})
   * Since these are dynamic queues, we'll handle registration differently
   */
  async processInboundMessage(queueName: string, job: Job): Promise<any> {
    this.logger.log(`Processing inbound job ${job.id} from queue ${queueName}`);

    switch (job.name) {
      case QUEUE_EVENTS.MESSAGE_RECEIVED:
        return this.handleMessageReceived(job.data.data as InboundJobData);
      default:
        this.logger.warn(`Unknown job type: ${job.name} in queue: ${queueName}`);
        return null;
    }
  }

  /**
   * Core message processing logic (Flow 3 from flows.md)
   */
  private async handleMessageReceived(data: InboundJobData): Promise<any> {
    try {
      this.logger.log(`Processing message for conversation: ${data.conversationId}`);

      // 1. Load soul config (persona, llm, tools, memory config)
      const soul = await this.soulsService.findBySlug(data.soulSlug);
      if (!soul) {
        throw new Error(`Soul not found: ${data.soulSlug}`);
      }

      // 2. Load conversation  
      const conversation = await this.conversationsService.findById(
        new Types.ObjectId(data.conversationId) as any, 
        { userId: 'system' } as any
      );
      if (!conversation) {
        throw new Error(`Conversation not found: ${data.conversationId}`);
      }

      // 3. Load recent messages (soul.memory.maxHistoryMessages)
      const maxHistory = soul.memory?.maxHistoryMessages || 20;
      const recentMessages = await this.messagesService.getRecentByConversation(
        new Types.ObjectId(data.conversationId) as any,
        maxHistory
      );

      // 4. Load memories for this platformUser
      const memories = await this.memoriesService.getByPlatformUser(
        data.platformUserId,
        new Types.ObjectId((soul as any)._id) as any
      );

      // 5. Build prompt
      const prompt = this.buildPrompt(soul, memories, recentMessages, data.messageText);

      // 6. Call LLM (Gemini Flash)
      const result = await this.genAI.models.generateContent({
        model: soul.llm?.model || 'gemini-2.0-flash',
        contents: prompt,
      });
      const aiResponse = result.text || '';

      this.logger.log(`AI Response generated for conversation: ${data.conversationId}`);

      // 7. Save assistant message to DB
      await this.messagesService.create({
        conversationId: new Types.ObjectId(data.conversationId) as any,
        role: 'assistant',
        content: aiResponse,
        llmProvider: 'google',
        llmModel: soul.llm?.model || 'gemini-2.0-flash-exp',
        llmTokensUsed: {
          input: result.usageMetadata?.promptTokenCount || 0,
          output: result.usageMetadata?.candidatesTokenCount || 0,
          total: result.usageMetadata?.totalTokenCount || 0,
        },
      }, { userId: 'system' } as any);

      // 8. Reply trực tiếp qua Zalo OA API
      await this.sendZaloReply(data.channelId, data.platformUserId, aiResponse);

      // 9. Update conversation.lastActiveAt
      await this.conversationsService.update(
        new Types.ObjectId(data.conversationId) as any,
        { lastActiveAt: new Date() },
        { userId: 'system' } as any
      );

      // 10. Trigger memory extract if enabled
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
        memoryExtractQueued: soul.memory?.autoExtract || false,
      };

    } catch (error) {
      this.logger.error(`Error processing message: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Build prompt from soul config, memories, and conversation history
   */
  private buildPrompt(soul: any, memories: any[], recentMessages: any[], currentMessage: string): string {
    const parts: string[] = [];

    // System prompt from persona
    if (soul.persona?.systemPrompt) {
      parts.push(`System: ${soul.persona.systemPrompt}`);
    }

    // Memories as context
    if (memories.length > 0) {
      const memoryContext = memories
        .filter(m => m.type !== 'reminder') // Skip reminders in conversation context
        .map(m => `${m.key}: ${m.value}`)
        .join('\n');
      
      if (memoryContext) {
        parts.push(`\nMemories about user:\n${memoryContext}`);
      }
    }

    // Recent conversation history
    if (recentMessages.length > 0) {
      const historyContext = recentMessages
        .reverse() // Oldest first
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');
      
      parts.push(`\nConversation history:\n${historyContext}`);
    }

    // Current user message
    parts.push(`\nUser: ${currentMessage}`);
    parts.push('\nAssistant:');

    return parts.join('\n');
  }

  /**
   * Send reply via Zalo OA API
   */
  private async sendZaloReply(channelId: string, platformUserId: string, text: string): Promise<void> {
    try {
      // Load channel to get access token
      const channel = await this.channelsService.findById(
        new Types.ObjectId(channelId) as any,
        { userId: 'system' } as any
      );
      
      if (!channel || !channel.credentials?.accessToken) {
        throw new Error(`Channel ${channelId} not found or missing access token`);
      }

      // Call Zalo OA Send Message API
      const response = await axios.post(
        'https://openapi.zalo.me/v3.0/oa/message/cs',
        {
          recipient: {
            user_id: platformUserId
          },
          message: {
            text: text
          }
        },
        {
          headers: {
            'access_token': channel.credentials.accessToken,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 second timeout
        }
      );

      if (response.data.error !== 0) {
        throw new Error(`Zalo API error: ${response.data.message || 'Unknown error'}`);
      }

      this.logger.log(`Message sent successfully via Zalo OA to user: ${platformUserId}`);

    } catch (error) {
      this.logger.error(`Failed to send Zalo message: ${error.message}`, error.stack);
      
      // Don't throw - we don't want to fail the entire job if sending fails
      // The message is already saved to DB, so this is just a notification failure
    }
  }
}