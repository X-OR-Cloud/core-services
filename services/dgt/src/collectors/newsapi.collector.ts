import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { BaseCollector } from './base.collector';
import { SentimentSignalService } from '../modules/sentiment-signal/sentiment-signal.service';

@Injectable()
export class NewsapiCollector extends BaseCollector {
  protected readonly name = 'NewsAPI';

  constructor(
    private readonly sentimentSignalService: SentimentSignalService,
  ) {
    super();
  }

  async collect(params: Record<string, any>): Promise<void> {
    const {
      query = 'gold price',
      language = 'en',
      pageSize = 10,
    } = params;

    // TODO: Read API keys from Settings (DB) instead of env
    const newsApiKey = process.env['NEWSAPI_KEY'] || '';
    if (!newsApiKey) {
      this.logger.warn(`[${this.name}] No NewsAPI key configured, skipping`);
      return;
    }

    // Step 1: Fetch headlines
    const newsData = await this.fetchWithRetry(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=${language}&sortBy=publishedAt&pageSize=${pageSize}&apiKey=${newsApiKey}`,
    );

    const articles = newsData?.articles;
    if (!articles?.length) {
      this.logger.warn(`[${this.name}] No articles found`);
      return;
    }

    const headlines = articles.map((a: any, i: number) => `${i + 1}. ${a.title}`).join('\n');

    // Step 2: LLM sentiment analysis
    const llmBaseUrl = process.env['LLM_BASE_URL'] || '';
    const llmApiKey = process.env['LLM_API_KEY'] || '';
    const llmModel = process.env['LLM_MODEL'] || 'gpt-4o-mini';

    if (!llmBaseUrl || !llmApiKey) {
      this.logger.warn(`[${this.name}] No LLM config, saving raw news only`);
      await this.sentimentSignalService.insert({
        timestamp: new Date(),
        source: 'newsapi',
        keyEvents: articles.slice(0, 5).map((a: any) => a.title),
      });
      return;
    }

    const analysis = await this.analyzeSentiment(headlines, llmBaseUrl, llmApiKey, llmModel);

    // Step 3: Save
    await this.sentimentSignalService.insert({
      timestamp: new Date(),
      source: 'llm_analysis',
      newsSentimentMean: analysis.overall_sentiment,
      geopoliticalRiskScore: analysis.geopolitical_risk_score,
      eventImpactLevel: analysis.event_impact_level,
      keyEvents: analysis.key_events,
      analysisSummary: analysis.gold_analysis_summary,
    });

    this.logger.info(`[${this.name}] Saved sentiment: ${analysis.overall_sentiment}, risk: ${analysis.geopolitical_risk_score}`);
  }

  private async analyzeSentiment(
    headlines: string,
    baseUrl: string,
    apiKey: string,
    model: string,
  ): Promise<any> {
    const systemPrompt = 'You are a Gold market analyst specializing in macro and geopolitics. Always respond with valid JSON only.';
    const userPrompt = `Analyze these news headlines for gold market impact:\n${headlines}\n\nReturn JSON: { "geopolitical_risk_score": number (0-100), "event_impact_level": "low"|"medium"|"high", "overall_sentiment": number (-1.0 to +1.0, positive = bullish for gold), "gold_analysis_summary": string (1-2 sentences), "key_events": string[] (top 3 events) }`;

    try {
      const response = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        },
      );

      const content = response.data?.choices?.[0]?.message?.content;
      return JSON.parse(content);
    } catch (error: any) {
      this.logger.error(`[${this.name}] LLM analysis failed: ${error.message}`);
      return {
        geopolitical_risk_score: 50,
        event_impact_level: 'medium',
        overall_sentiment: 0,
        gold_analysis_summary: 'Analysis unavailable',
        key_events: [],
      };
    }
  }
}
