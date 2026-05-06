import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { AgentRagConfig, RagCollectionConfig, RagIntentRule } from '../agent/agent.schema';
import { RagChunk } from './cbm-knowledge.service';

// ─── Public types ────────────────────────────────────────────────────────────

export interface DeploymentConfig {
  provider: string;
  model: string;
  baseAPIEndpoint: string;
}

export interface ClassifiedIntent {
  name: string;
  requiresRag: boolean;
}

export interface RagChunkWithCollection extends RagChunk {
  collectionId: string;
}

export type SearchFn = (
  collectionId: string,
  query: string,
  topK: number,
  minScore: number,
) => Promise<RagChunk[]>;

// ─── Heuristic rules ─────────────────────────────────────────────────────────

const GREETING_PATTERNS = [
  /^(hi|hello|hey|xin chào|chào|alo|good morning|good afternoon|good evening)[!?.]*$/i,
  /^(cảm ơn|thanks|thank you|ok|okay|thx)[!?.]*$/i,
];
const SLASH_CMD_PATTERN = /^\//;

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class AdaptiveRagService {
  private readonly logger = new Logger(AdaptiveRagService.name);

  // ── Intent classification ─────────────────────────────────────────────────

  /**
   * Phân loại ý định người dùng.
   * Ưu tiên heuristic (0 cost). Nếu intentClassifier.enabled = true và có deployment
   * → gọi LLM để phân loại chính xác hơn.
   */
  async classifyIntent(
    query: string,
    ragConfig: AgentRagConfig,
    deployment?: DeploymentConfig,
  ): Promise<ClassifiedIntent> {
    const { intentClassifier } = ragConfig;
    const intents = intentClassifier?.intents ?? [];

    // Heuristic: trả về GREETING nếu khớp pattern
    if (GREETING_PATTERNS.some((p) => p.test(query.trim()))) {
      const greetingRule = intents.find((r) => r.name === 'GREETING');
      if (greetingRule) return { name: 'GREETING', requiresRag: greetingRule.requiresRag };
      return { name: 'GREETING', requiresRag: false };
    }

    // Heuristic: slash command → skip
    if (SLASH_CMD_PATTERN.test(query.trim())) {
      return { name: 'SKIP_COMMAND', requiresRag: false };
    }

    // Heuristic: quá ngắn → không cần RAG
    if (query.trim().length < 15) {
      return { name: 'SHORT', requiresRag: false };
    }

    // Nếu không có intent rules → default SIMPLE_RAG
    if (!intents.length) {
      return { name: 'SIMPLE_RAG', requiresRag: true };
    }

    // Nếu intent classifier bị tắt hoặc không có deployment → dùng SIMPLE_RAG mặc định
    if (!intentClassifier?.enabled || !deployment) {
      const defaultRule = intents.find((r) => r.name === 'SIMPLE_RAG') ?? intents.find((r) => r.requiresRag);
      if (defaultRule) return { name: defaultRule.name, requiresRag: defaultRule.requiresRag };
      return { name: 'SIMPLE_RAG', requiresRag: true };
    }

    // LLM-based classification
    try {
      return await this._classifyWithLlm(query, intents, deployment);
    } catch (err) {
      this.logger.warn(`Intent classification LLM failed, fallback SIMPLE_RAG: ${(err as Error).message}`);
      return { name: 'SIMPLE_RAG', requiresRag: true };
    }
  }

  private async _classifyWithLlm(
    query: string,
    intents: RagIntentRule[],
    deployment: DeploymentConfig,
  ): Promise<ClassifiedIntent> {
    const intentNames = intents.map((r) => r.name).join(' | ');
    const prompt = [
      `Classify the user query into exactly one of these intent labels: ${intentNames}`,
      `Reply with ONLY the label name, nothing else.`,
      `User query: """${query}"""`,
    ].join('\n');

    const model = this._buildModel(deployment);
    const { text } = await generateText({ model, prompt, maxOutputTokens: 20 });
    const label = text.trim().toUpperCase();

    const matched = intents.find((r) => r.name.toUpperCase() === label);
    if (matched) return { name: matched.name, requiresRag: matched.requiresRag };

    // Fallback nếu LLM trả về label không hợp lệ
    const defaultRule = intents.find((r) => r.requiresRag);
    return defaultRule
      ? { name: defaultRule.name, requiresRag: defaultRule.requiresRag }
      : { name: 'SIMPLE_RAG', requiresRag: true };
  }

  // ── Collection routing ────────────────────────────────────────────────────

  /**
   * Chọn collections cần search dựa trên intent.
   * - Nếu intent rule có collectionIds override → dùng override đó
   * - Nếu không → lọc ragConfig.collections theo intents whitelist
   */
  routeCollections(
    intent: ClassifiedIntent,
    ragConfig: AgentRagConfig,
    intentRule?: RagIntentRule,
  ): RagCollectionConfig[] {
    // Override từ intent rule
    if (intentRule?.collectionIds?.length) {
      return ragConfig.collections.filter((c) =>
        intentRule.collectionIds!.includes(c.collectionId),
      );
    }

    // Lọc collections theo intents whitelist
    return ragConfig.collections.filter((c) => {
      if (!c.intents?.length) return true; // không có filter → áp dụng cho tất cả
      return c.intents.includes(intent.name);
    });
  }

  // ── Search ────────────────────────────────────────────────────────────────

  /**
   * Tìm kiếm vector search trên các collections đã được route.
   * Hỗ trợ parallel (default) hoặc sequential.
   */
  async search(
    collections: RagCollectionConfig[],
    query: string,
    searchFn: SearchFn,
    parallel = true,
  ): Promise<RagChunkWithCollection[]> {
    if (!collections.length) return [];

    if (parallel) {
      const results = await Promise.all(
        collections.map((col) =>
          searchFn(col.collectionId, query, col.topK, col.minScore)
            .then((chunks) => chunks.map((c) => ({ ...c, collectionId: col.collectionId })))
            .catch((err) => {
              this.logger.warn(`Search failed for collection=${col.collectionId}: ${(err as Error).message}`);
              return [] as RagChunkWithCollection[];
            }),
        ),
      );
      return results.flat();
    }

    // Sequential
    const allChunks: RagChunkWithCollection[] = [];
    for (const col of collections) {
      try {
        const chunks = await searchFn(col.collectionId, query, col.topK, col.minScore);
        allChunks.push(...chunks.map((c) => ({ ...c, collectionId: col.collectionId })));
      } catch (err) {
        this.logger.warn(`Search failed for collection=${col.collectionId}: ${(err as Error).message}`);
      }
    }
    return allChunks;
  }

  // ── Relevance grading ─────────────────────────────────────────────────────

  /**
   * Lọc các chunk không liên quan trước khi đưa vào LLM context.
   * Trả về danh sách chunks được coi là relevant.
   */
  async gradeRelevance(
    chunks: RagChunkWithCollection[],
    query: string,
    threshold: number,
    deployment?: DeploymentConfig,
  ): Promise<RagChunkWithCollection[]> {
    if (!chunks.length) return [];

    // Nếu không có deployment → dùng score threshold đơn giản
    if (!deployment) {
      return chunks.filter((c) => c.score >= threshold);
    }

    // LLM grading — evaluate từng chunk
    try {
      const results = await Promise.all(
        chunks.map((chunk) => this._gradeChunkWithLlm(chunk, query, deployment)),
      );
      return chunks.filter((_, i) => results[i]);
    } catch (err) {
      this.logger.warn(`Relevance grading failed, fallback to score threshold: ${(err as Error).message}`);
      return chunks.filter((c) => c.score >= threshold);
    }
  }

  private async _gradeChunkWithLlm(
    chunk: RagChunkWithCollection,
    query: string,
    deployment: DeploymentConfig,
  ): Promise<boolean> {
    const prompt = [
      'You are a relevance grader. Does the following document help answer the user question?',
      'Reply with exactly "yes" or "no".',
      `Question: """${query}"""`,
      `Document: """${chunk.content.slice(0, 800)}"""`,
    ].join('\n');

    const model = this._buildModel(deployment);
    const { text } = await generateText({ model, prompt, maxOutputTokens: 5 });
    return text.trim().toLowerCase().startsWith('yes');
  }

  // ── Query reformulation ───────────────────────────────────────────────────

  /**
   * Tái cấu trúc câu hỏi khi kết quả tìm kiếm có điểm thấp.
   * Trả về câu hỏi đã được viết lại.
   */
  async reformulateQuery(query: string, deployment: DeploymentConfig): Promise<string> {
    const prompt = [
      'Rewrite the following question to be more specific and retrieval-friendly.',
      'Reply with ONLY the rewritten question, nothing else.',
      `Original question: """${query}"""`,
    ].join('\n');

    try {
      const model = this._buildModel(deployment);
      const { text } = await generateText({ model, prompt, maxOutputTokens: 150 });
      return text.trim() || query;
    } catch (err) {
      this.logger.warn(`Query reformulation failed: ${(err as Error).message}`);
      return query;
    }
  }

  // ── Hallucination check ───────────────────────────────────────────────────

  /**
   * Kiểm tra xem câu trả lời có bám sát context không.
   * Trả về true nếu câu trả lời được grounded, false nếu nghi có hallucination.
   */
  async checkHallucination(
    answer: string,
    chunks: RagChunkWithCollection[],
    deployment: DeploymentConfig,
  ): Promise<boolean> {
    if (!chunks.length) return true; // không có context để so → bỏ qua check

    const contextSummary = chunks
      .slice(0, 5) // top 5 chunks để tránh quá dài
      .map((c, i) => `[${i + 1}] ${c.content.slice(0, 500)}`)
      .join('\n---\n');

    const prompt = [
      'You are a hallucination detector. Is the following answer grounded in the provided context?',
      'Reply with exactly "yes" if grounded, or "no" if the answer contains information not in the context.',
      `Context:\n${contextSummary}`,
      `Answer: """${answer.slice(0, 1000)}"""`,
    ].join('\n\n');

    try {
      const model = this._buildModel(deployment);
      const { text } = await generateText({ model, prompt, maxOutputTokens: 5 });
      return text.trim().toLowerCase().startsWith('yes');
    } catch (err) {
      this.logger.warn(`Hallucination check failed: ${(err as Error).message}`);
      return true; // fail open — không chặn câu trả lời
    }
  }

  // ── Helper ────────────────────────────────────────────────────────────────

  private _buildModel(deployment: DeploymentConfig) {
    const { provider, model, baseAPIEndpoint } = deployment;
    if (provider?.toLowerCase() === 'google') {
      const google = createGoogleGenerativeAI({
        apiKey: 'unused',
        baseURL: baseAPIEndpoint.endsWith('/v1beta') ? baseAPIEndpoint : `${baseAPIEndpoint}/v1beta`,
      });
      return google(model);
    }
    // Default: OpenAI-compatible proxy
    const openai = createOpenAI({
      apiKey: 'unused',
      baseURL: baseAPIEndpoint.endsWith('/v1') ? baseAPIEndpoint : `${baseAPIEndpoint}/v1`,
    });
    return openai.chat(model);
  }
}
