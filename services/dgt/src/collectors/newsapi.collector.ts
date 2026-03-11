import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { BaseCollector } from './base.collector';
import { SentimentSignalService } from '../modules/sentiment-signal/sentiment-signal.service';
import { NewsArticleService } from '../modules/news-article/news-article.service';

@Injectable()
export class NewsapiCollector extends BaseCollector {
  protected readonly name = 'NewsAPI';

  constructor(
    private readonly sentimentSignalService: SentimentSignalService,
    private readonly newsArticleService: NewsArticleService,
  ) {
    super();
  }

  async collect(params: Record<string, any>): Promise<void> {
    const {
      query = 'gold price',
      language = 'en',
      pageSize = 10,
    } = params;

    const newsApiKey = process.env['NEWSAPI_KEY'] || '';
    if (!newsApiKey) {
      this.logger.warn(`[${this.name}] No NewsAPI key configured, skipping`);
      return;
    }

    // Step 1: Fetch articles
    const newsData = await this.fetchWithRetry(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=${language}&sortBy=publishedAt&pageSize=${pageSize}&apiKey=${newsApiKey}`,
    );

    const articles = newsData?.articles;
    if (!articles?.length) {
      this.logger.warn(`[${this.name}] No articles found`);
      return;
    }

    // Step 2: Upsert raw articles (no LLM yet)
    for (const a of articles) {
      if (!a.url || !a.title) continue;
      await this.newsArticleService.upsertByUrl(a.url, {
        title: a.title,
        url: a.url,
        publishedAt: a.publishedAt ? new Date(a.publishedAt) : new Date(),
        sourceName: a.source?.name || '',
        description: a.description || '',
      });
    }
    this.logger.info(`[${this.name}] Upserted ${articles.length} articles`);

    // Step 3: LLM analysis
    const llmBaseUrl = process.env['LLM_BASE_URL'] || '';
    const llmApiKey = process.env['LLM_API_KEY'] || '';
    const llmModel = process.env['LLM_MODEL'] || 'gpt-4o-mini';

    if (!llmBaseUrl || !llmApiKey) {
      this.logger.warn(`[${this.name}] No LLM config, skipping sentiment analysis`);
      // Still save overall sentiment as neutral
      await this.sentimentSignalService.insert({
        timestamp: new Date(),
        source: 'newsapi',
        keyEvents: articles.slice(0, 5).map((a: any) => a.title),
      });
      return;
    }

    // Step 4: LLM batch analysis — headlines + per-article scores
    const headlines = articles
      .map((a: any, i: number) => `${i + 1}. [${a.title}] (url: ${a.url})`)
      .join('\n');

    const analysis = await this.analyzeSentiment(headlines, llmBaseUrl, llmApiKey, llmModel, articles.length);

    // Step 5: Update each article with LLM sentiment
    const analyzedAt = new Date();
    const articleResults: { url: string; sentiment: number; label: string; reason: string }[] =
      analysis.articles || [];

    for (const result of articleResults) {
      if (!result.url) continue;
      await this.newsArticleService.upsertByUrl(result.url, {
        sentiment: result.sentiment,
        sentimentLabel: result.label,
        sentimentReason: result.reason,
        llmAnalyzedAt: analyzedAt,
      });
    }

    // Step 6: Save overall SentimentSignal
    await this.sentimentSignalService.insert({
      timestamp: new Date(),
      source: 'llm_analysis',
      newsSentimentMean: analysis.overall_sentiment,
      geopoliticalRiskScore: analysis.geopolitical_risk_score,
      eventImpactLevel: analysis.event_impact_level,
      keyEvents: analysis.key_events,
      analysisSummary: analysis.gold_analysis_summary,
    });

    this.logger.info(
      `[${this.name}] Saved sentiment: ${analysis.overall_sentiment}, risk: ${analysis.geopolitical_risk_score}, articles analyzed: ${articleResults.length}`,
    );
  }

  private async analyzeSentiment(
    headlines: string,
    baseUrl: string,
    apiKey: string,
    model: string,
    articleCount: number,
  ): Promise<any> {
    const systemPrompt =
      'You are a Gold market analyst specializing in macro and geopolitics. Always respond with valid JSON only.';

    const userPrompt = `Analyze these ${articleCount} news headlines for gold market impact:

${headlines}

Return JSON with this exact structure:
{
  "overall_sentiment": <number -1.0 to +1.0, positive = bullish for gold>,
  "geopolitical_risk_score": <integer 0-100>,
  "event_impact_level": "low" | "medium" | "high",
  "gold_analysis_summary": "<1-2 sentence overall summary>",
  "key_events": ["<top event 1>", "<top event 2>", "<top event 3>"],
  "articles": [
    {
      "url": "<exact url from input>",
      "sentiment": <number -1.0 to +1.0>,
      "label": "bullish" | "bearish" | "neutral",
      "reason": "<1 sentence explaining why this article is bullish/bearish/neutral for gold>"
    }
  ]
}`;

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
            Authorization: `Bearer ${apiKey}`,
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
        overall_sentiment: 0,
        geopolitical_risk_score: 50,
        event_impact_level: 'medium',
        gold_analysis_summary: 'Analysis unavailable',
        key_events: [],
        articles: [],
      };
    }
  }
}
