import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { createLogger } from '@hydrabyte/shared';
import { LlmProviderService } from '../modules/llm-provider/llm-provider.service';
import { LlmProviderSchema } from '../modules/llm-provider/llm-provider.schema';

export interface LlmCallParams {
  systemPrompt: string;
  userPrompt: string;
  params?: {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    stream?: boolean;
  };
}

export interface LlmCallResult {
  content: string;
  thinkingContent: string | null;
  finishReason: string | null;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  durationMs: number;
  providerId: string;
  providerName: string;
  model: string;
}

@Injectable()
export class LlmRouterService {
  private readonly logger = createLogger('LlmRouter');

  constructor(private readonly providerService: LlmProviderService) {}

  /**
   * Gọi LLM với tự động fallback theo priority.
   * Thử từng provider active theo thứ tự priority tăng dần.
   * Cập nhật stats sau mỗi lần call.
   * Ném ServiceUnavailableException nếu tất cả providers đều fail.
   */
  async call(params: LlmCallParams): Promise<LlmCallResult> {
    const providers = await this.providerService.getActiveProviders();
    if (!providers.length) {
      throw new ServiceUnavailableException('Không có LLM provider nào đang active');
    }

    const errors: string[] = [];

    for (const provider of providers) {
      const providerId = (provider as any)._id.toString();
      this.logger.info(`[LlmRouter] Trying provider: ${provider.name} (${provider.model})`);

      const startTime = Date.now();
      try {
        const result = await this.callProvider(provider, params);
        const durationMs = Date.now() - startTime;

        const tokensUsed = result.usage?.total_tokens ?? 0;
        await this.providerService.recordSuccess(providerId, durationMs, tokensUsed);

        return {
          ...result,
          durationMs,
          providerId,
          providerName: provider.name,
          model: provider.model,
        };
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        const errMsg = err.message ?? String(err);
        this.logger.warn(`[LlmRouter] Provider ${provider.name} failed (${durationMs}ms): ${errMsg}`);
        await this.providerService.recordError(providerId, errMsg);
        errors.push(`${provider.name}: ${errMsg}`);
      }
    }

    throw new ServiceUnavailableException(
      `Tất cả LLM providers đều thất bại. Chi tiết: ${errors.join(' | ')}`,
    );
  }

  private async callProvider(
    provider: any,
    params: LlmCallParams,
  ): Promise<Omit<LlmCallResult, 'durationMs' | 'providerId' | 'providerName' | 'model'>> {
    const apiKeyValue = this.providerService.decryptApiKey(provider.apiKey.encryptedValue);
    const endpoint = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;

    const mergedParams = {
      temperature: 0.2,
      max_tokens: 8192,
      stream: false,
      ...provider.defaultParams,
      ...params.params,
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: any;

    if (provider.schema === LlmProviderSchema.ANTHROPIC) {
      headers['x-api-key'] = apiKeyValue;
      headers['anthropic-version'] = '2023-06-01';
      body = {
        model: provider.model,
        system: params.systemPrompt,
        messages: [{ role: 'user', content: params.userPrompt }],
        max_tokens: mergedParams.max_tokens,
        temperature: mergedParams.temperature,
      };
    } else if (provider.schema === LlmProviderSchema.GOOGLE) {
      // Google Gemini via OpenAI-compatible endpoint (most proxies support this)
      headers['Authorization'] = `Bearer ${apiKeyValue}`;
      body = {
        model: provider.model,
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userPrompt },
        ],
        ...mergedParams,
      };
    } else {
      // OpenAI-compatible (default)
      headers['Authorization'] = `Bearer ${apiKeyValue}`;
      body = {
        model: provider.model,
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userPrompt },
        ],
        ...mergedParams,
      };
    }

    const response = await axios.post(endpoint, body, { headers, timeout: 170_000 });

    // Parse response
    let rawContent: string;
    let finishReason: string | null = null;
    let usage: LlmCallResult['usage'] = null;

    if (provider.schema === LlmProviderSchema.ANTHROPIC) {
      rawContent = response.data?.content?.[0]?.text ?? '';
      finishReason = response.data?.stop_reason ?? null;
      const u = response.data?.usage;
      if (u) {
        usage = {
          prompt_tokens: u.input_tokens ?? 0,
          completion_tokens: u.output_tokens ?? 0,
          total_tokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
        };
      }
    } else {
      rawContent = response.data?.choices?.[0]?.message?.content ?? '';
      finishReason = response.data?.choices?.[0]?.finish_reason ?? null;
      const u = response.data?.usage;
      if (u) {
        usage = {
          prompt_tokens: u.prompt_tokens ?? 0,
          completion_tokens: u.completion_tokens ?? 0,
          total_tokens: u.total_tokens ?? 0,
        };
      }
    }

    // Tách <think>...</think> block
    const thinkMatch = rawContent.match(/<think>([\s\S]*?)<\/think>/);
    const thinkingContent = thinkMatch ? thinkMatch[1].trim() : null;
    const content = rawContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    return { content, thinkingContent, finishReason, usage };
  }
}
