import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Types } from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { QUEUE_NAMES, QUEUE_EVENTS } from '../../config/queue.config';
import { MessagesService } from '../../modules/messages/messages.service';
import { MemoriesService } from '../../modules/memories/memories.service';
import { SoulsService } from '../../modules/souls/souls.service';

interface MemoryExtractJobData {
  conversationId: string;
  platformUserId: string;
  soulId: string;
  messageCount: number;
}

@Processor(QUEUE_NAMES.MEMORY_EXTRACT)
export class MemoryProcessor extends WorkerHost {
  private readonly logger = new Logger(MemoryProcessor.name);
  private genAI: GoogleGenerativeAI;

  constructor(
    private messagesService: MessagesService,
    private memoriesService: MemoriesService,
    private soulsService: SoulsService,
  ) {
    super();
    
    // Initialize Google Generative AI
    const apiKey = process.env['GOOGLE_API_KEY'];
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY environment variable is required for memory extraction');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async process(job: Job): Promise<any> {
    this.logger.log(`Processing memory extraction job ${job.id}`);

    switch (job.name) {
      case QUEUE_EVENTS.MEMORY_EXTRACT:
        return this.handleMemoryExtract(job.data.data as MemoryExtractJobData);
      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
        return null;
    }
  }

  /**
   * Extract memories from recent conversation (Flow 4 from flows.md)
   */
  private async handleMemoryExtract(data: MemoryExtractJobData): Promise<any> {
    try {
      this.logger.log(`Extracting memories for conversation: ${data.conversationId}`);

      // 1. Load recent messages
      const recentMessages = await this.messagesService.getRecentByConversation(
        new Types.ObjectId(data.conversationId) as any,
        data.messageCount
      );

      if (recentMessages.length === 0) {
        this.logger.log('No messages found for memory extraction');
        return { processed: true, extractedCount: 0 };
      }

      // Load soul config for LLM model preference
      const soul = await this.soulsService.findById(
        new Types.ObjectId(data.soulId) as any,
        { userId: 'system' } as any
      );

      // 2. Call LLM to extract key facts
      const prompt = this.buildMemoryExtractionPrompt(recentMessages);
      
      const model = this.genAI.getGenerativeModel({ 
        model: soul?.llm?.model || 'gemini-2.0-flash-exp'
      });
      
      const result = await model.generateContent(prompt);
      const response = result.response.text();

      // 3. Parse structured facts
      const extractedFacts = this.parseExtractedFacts(response);
      
      this.logger.log(`Extracted ${extractedFacts.length} facts from conversation`);

      // 4. Upsert facts to memories
      let upsertedCount = 0;
      for (const fact of extractedFacts) {
        try {
          await this.memoriesService.upsertByKey(
            data.soulId,
            data.platformUserId,
            fact.key,
            {
              value: fact.value,
              type: fact.type || 'fact',
              conversationId: data.conversationId,
              source: 'auto_extraction',
              confidence: fact.confidence || 0.7,
            },
            { userId: 'system' } as any
          );
          upsertedCount++;
        } catch (error) {
          this.logger.warn(`Failed to upsert memory: ${fact.key} - ${error.message}`);
        }
      }

      this.logger.log(`Memory extraction completed. Upserted ${upsertedCount}/${extractedFacts.length} facts`);

      return { 
        processed: true, 
        conversationId: data.conversationId,
        extractedCount: extractedFacts.length,
        upsertedCount,
      };

    } catch (error) {
      this.logger.error(`Error extracting memories: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Build prompt for memory extraction
   */
  private buildMemoryExtractionPrompt(messages: any[]): string {
    const conversation = messages
      .reverse() // Oldest first
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    return `
Analyze this conversation and extract key facts about the user. Return a JSON array of facts.

Conversation:
${conversation}

Extract facts like:
- Personal information (name, age, location, job, etc.)
- Preferences and interests
- Important dates or events
- Goals or plans mentioned
- Relationships mentioned
- Any other memorable details

Return ONLY a valid JSON array in this format:
[
  {
    "key": "name",
    "value": "John Doe", 
    "type": "personal",
    "confidence": 0.9
  },
  {
    "key": "hobby",
    "value": "plays guitar",
    "type": "interest", 
    "confidence": 0.8
  }
]

Valid types: "personal", "interest", "preference", "goal", "relationship", "event", "fact"
Confidence: 0.1 (very uncertain) to 1.0 (completely certain)

If no meaningful facts are found, return an empty array: []
`;
  }

  /**
   * Parse extracted facts from LLM response
   */
  private parseExtractedFacts(response: string): Array<{
    key: string;
    value: string;
    type?: string;
    confidence?: number;
  }> {
    try {
      // Clean response - remove markdown code blocks if present
      const cleanedResponse = response
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();

      const facts = JSON.parse(cleanedResponse);
      
      if (!Array.isArray(facts)) {
        this.logger.warn('LLM response is not an array, treating as empty');
        return [];
      }

      // Validate and clean facts
      return facts
        .filter(fact => fact.key && fact.value) // Must have key and value
        .map(fact => ({
          key: fact.key.trim().toLowerCase(),
          value: fact.value.trim(),
          type: fact.type || 'fact',
          confidence: Math.max(0.1, Math.min(1.0, fact.confidence || 0.7)), // Clamp between 0.1-1.0
        }));

    } catch (error) {
      this.logger.warn(`Failed to parse extracted facts: ${error.message}. Response: ${response.substring(0, 200)}...`);
      return [];
    }
  }
}