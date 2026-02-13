import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Types } from 'mongoose';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import { QUEUE_NAMES, QUEUE_EVENTS } from '../../config/queue.config';
import { SoulsService } from '../../modules/souls/souls.service';
import { ConversationsService } from '../../modules/conversations/conversations.service';
import { MemoriesService } from '../../modules/memories/memories.service';
import { ChannelsService } from '../../modules/channels/channels.service';
import { MessagesService } from '../../modules/messages/messages.service';

interface HeartbeatJobData {
  soulId?: string; // If specified, only process for this soul
  triggeredAt: string;
}

@Processor(QUEUE_NAMES.HEARTBEAT)
export class HeartbeatProcessor extends WorkerHost {
  private readonly logger = new Logger(HeartbeatProcessor.name);
  private genAI: GoogleGenAI;

  constructor(
    private soulsService: SoulsService,
    private conversationsService: ConversationsService,
    private memoriesService: MemoriesService,
    private channelsService: ChannelsService,
    private messagesService: MessagesService,
  ) {
    super();
    
    // Initialize Google Generative AI
    const apiKey = process.env['GOOGLE_API_KEY'];
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY environment variable is required for heartbeat processing');
    }
    this.genAI = new GoogleGenAI({ apiKey });
  }

  async process(job: Job): Promise<any> {
    this.logger.log(`Processing heartbeat job ${job.id}`);

    switch (job.name) {
      case QUEUE_EVENTS.HEARTBEAT_TASK:
        return this.handleHeartbeat(job.data.data as HeartbeatJobData);
      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
        return null;
    }
  }

  /**
   * Process heartbeat tasks (Flow 5 from flows.md)
   */
  private async handleHeartbeat(data: HeartbeatJobData): Promise<any> {
    try {
      this.logger.log('Processing heartbeat task');

      // 1. Load souls with heartbeat enabled
      // For now, we'll process all souls. In production, you might want to filter
      let souls = [];
      if (data.soulId) {
        const soul = await this.soulsService.findById(new Types.ObjectId(data.soulId) as any, { userId: 'system' } as any);
        souls = soul ? [soul] : [];
      } else {
        const result = await this.soulsService.findAll({ limit: 100, page: 1 }, { userId: 'system' } as any);
        souls = (result as any).data || [];
      }

      const activeSouls = souls.filter(soul => soul?.isActive !== false);
      
      let totalProcessed = 0;
      let totalSent = 0;

      for (const soul of activeSouls) {
        if (!soul) continue;

        try {
          const result = await this.processSoulHeartbeat(soul);
          totalProcessed++;
          totalSent += result.messagesSent;
        } catch (error) {
          this.logger.warn(`Failed to process heartbeat for soul ${soul.slug}: ${error.message}`);
        }
      }

      this.logger.log(`Heartbeat completed. Processed ${totalProcessed} souls, sent ${totalSent} messages`);

      return {
        processed: true,
        soulsProcessed: totalProcessed,
        messagesSent: totalSent,
        triggeredAt: data.triggeredAt,
      };

    } catch (error) {
      this.logger.error(`Error processing heartbeat: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Process heartbeat for a specific soul
   */
  private async processSoulHeartbeat(soul: any): Promise<{ messagesSent: number }> {
    // 2. Query conversations active within 48h
    const activeConversations = await this.conversationsService.findActiveWithin48h(
      new Types.ObjectId((soul as any)._id) as any
    );

    this.logger.log(`Found ${activeConversations.length} active conversations for soul: ${soul.slug}`);

    let messagesSent = 0;

    // 3. Process each conversation
    for (const conversation of activeConversations) {
      try {
        // Load memories (check for reminders due)
        const memories = await this.memoriesService.getByPlatformUser(
          conversation.platformUser.id,
          new Types.ObjectId((soul as any)._id) as any
        );

        const dueReminders = await this.memoriesService.getDueReminders(
          (soul as any)._id.toString()
        );

        // Only send proactive message if there are due reminders or based on heartbeat config
        const shouldSendMessage = dueReminders.length > 0 || this.shouldSendProactiveMessage(soul, conversation);

        if (!shouldSendMessage) {
          continue;
        }

        // Generate proactive message
        const proactiveMessage = await this.generateProactiveMessage(soul, conversation, memories, dueReminders);

        if (!proactiveMessage) {
          continue;
        }

        // Save assistant message
        await this.messagesService.create({
          conversationId: (conversation as any)._id,
          role: 'assistant',
          content: proactiveMessage.text,
          llmProvider: 'google',
          llmModel: soul.llm?.model || 'gemini-2.0-flash-exp',
          llmTokensUsed: proactiveMessage.tokensUsed || { input: 0, output: 0, total: 0 },
        }, { userId: 'system' } as any);

        // Send via platform API
        await this.sendProactiveMessage(
          conversation.channelId.toString(),
          conversation.platformUser.id,
          proactiveMessage.text
        );

        // Update lastActiveAt
        await this.conversationsService.update(
          (conversation as any)._id,
          { lastActiveAt: new Date() },
          { userId: 'system' } as any
        );

        messagesSent++;
        this.logger.log(`Sent proactive message to conversation: ${(conversation as any)._id}`);

      } catch (error) {
        this.logger.warn(`Failed to process conversation ${(conversation as any)._id}: ${error.message}`);
      }
    }

    return { messagesSent };
  }

  /**
   * Determine if we should send a proactive message based on soul config
   */
  private shouldSendProactiveMessage(soul: any, conversation: any): boolean {
    // Check soul's heartbeat configuration
    const heartbeatConfig = soul.heartbeat || {};
    
    // Default: only send if there are due reminders
    if (!heartbeatConfig.enabled) {
      return false;
    }

    // Check frequency (e.g., don't send more than once per day)
    const lastActive = new Date(conversation.lastActiveAt);
    const hoursSinceLastActive = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60);
    
    const minHours = heartbeatConfig.minHoursBetween || 24;
    return hoursSinceLastActive >= minHours;
  }

  /**
   * Generate proactive message using LLM
   */
  private async generateProactiveMessage(
    soul: any, 
    conversation: any, 
    memories: any[], 
    dueReminders: any[]
  ): Promise<{ text: string; tokensUsed?: any } | null> {
    try {
      const prompt = this.buildProactiveMessagePrompt(soul, conversation, memories, dueReminders);
      
      const result = await this.genAI.models.generateContent({
        model: soul.llm?.model || 'gemini-2.0-flash',
        contents: prompt,
      });
      const messageText = (result.text || '').trim();

      // Don't send if the AI decides not to send a message
      if (messageText.toLowerCase().includes('no message needed') || 
          messageText.toLowerCase().includes('skip') ||
          messageText.length < 10) {
        return null;
      }

      return {
        text: messageText,
        tokensUsed: {
          input: result.usageMetadata?.promptTokenCount || 0,
          output: result.usageMetadata?.candidatesTokenCount || 0,
          total: result.usageMetadata?.totalTokenCount || 0,
        },
      };

    } catch (error) {
      this.logger.warn(`Failed to generate proactive message: ${error.message}`);
      return null;
    }
  }

  /**
   * Build prompt for proactive message generation
   */
  private buildProactiveMessagePrompt(soul: any, conversation: any, memories: any[], dueReminders: any[]): string {
    const parts: string[] = [];

    // System context
    parts.push(`You are proactively reaching out to a user. Be natural and helpful.`);
    
    if (soul.persona?.systemPrompt) {
      parts.push(`Your personality: ${soul.persona.systemPrompt}`);
    }

    // User context from memories
    if (memories.length > 0) {
      const userContext = memories
        .filter(m => m.type !== 'reminder')
        .map(m => `${m.key}: ${m.value}`)
        .join('\n');
      
      if (userContext) {
        parts.push(`\nWhat you know about the user:\n${userContext}`);
      }
    }

    // Due reminders
    if (dueReminders.length > 0) {
      const remindersText = dueReminders
        .map(r => `- ${r.value}`)
        .join('\n');
      
      parts.push(`\nReminders due for the user:\n${remindersText}`);
    }

    // Time context
    const now = new Date();
    parts.push(`\nCurrent time: ${now.toLocaleString()}`);

    // Instructions
    parts.push(`
Generate a brief, natural message to send to the user. Consider:
- Due reminders (if any)
- Time of day (morning greeting, evening check-in, etc.)
- User's interests and situation
- Keep it conversational and not robotic

If there's no good reason to message them right now, respond with "No message needed".

Your proactive message:`);

    return parts.join('\n');
  }

  /**
   * Send proactive message via platform API (currently Zalo OA)
   */
  private async sendProactiveMessage(channelId: string, platformUserId: string, text: string): Promise<void> {
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
          timeout: 10000,
        }
      );

      if (response.data.error !== 0) {
        throw new Error(`Zalo API error: ${response.data.message || 'Unknown error'}`);
      }

    } catch (error) {
      this.logger.error(`Failed to send proactive message: ${error.message}`, error.stack);
      throw error; // Re-throw for heartbeat processing to handle
    }
  }
}