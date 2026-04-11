import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { Types } from 'mongoose';
import { BaseCollector } from './base.collector';
import { SignalService } from '../modules/signal/signal.service';
import {
  SignalType,
  SignalStatus,
  SignalTimeframe,
  ConfidenceLabel,
} from '../modules/signal/signal.schema';
import { MarketPriceService } from '../modules/market-price/market-price.service';
import { TechnicalIndicatorService } from '../modules/technical-indicator/technical-indicator.service';
import { SentimentSignalService } from '../modules/sentiment-signal/sentiment-signal.service';
import { MacroIndicatorService } from '../modules/macro-indicator/macro-indicator.service';
import { SIGNAL_SYSTEM_PROMPT } from '../prompts/signal-system.prompt';
import { RequestContext, PredefinedRole } from '@hydrabyte/shared';
import { NotificationService } from '../shared/notification.service';
import { SystemActivityLogService } from '../modules/system-activity-log/system-activity-log.service';
import { SystemWorkerType, SystemActivityStatus } from '../modules/system-activity-log/system-activity-log.schema';
import { NewsArticleService } from '../modules/news-article/news-article.service';

const SYSTEM_CONTEXT: RequestContext = {
  userId: 'system',
  orgId: 'system',
  groupId: 'system',
  agentId: 'system',
  appId: 'system',
  roles: [PredefinedRole.UniverseOwner],
};

@Injectable()
export class SignalLlmCollector extends BaseCollector {
  protected readonly name = 'SignalLLM';

  constructor(
    private readonly signalService: SignalService,
    private readonly marketPriceService: MarketPriceService,
    private readonly technicalIndicatorService: TechnicalIndicatorService,
    private readonly sentimentSignalService: SentimentSignalService,
    private readonly macroIndicatorService: MacroIndicatorService,
    private readonly notificationService: NotificationService,
    private readonly systemActivityLogService: SystemActivityLogService,
    private readonly newsArticleService: NewsArticleService,
  ) {
    super();
  }

  async collect(params: Record<string, any>): Promise<void> {
    const { accountId, asset, timeframe } = params as {
      accountId: string;
      asset: string;
      timeframe: string;
    };
    const startTime = Date.now();

    // Step 1: Fetch last N MarketPrice candles (always use '1m' — raw data granularity)
    // The signal timeframe determines signal validity, not candle granularity
    // 15m → 30 × 1m candles (30 phút context)
    // 1h  → 60 × 1m candles (1 giờ context)
    // 4h  → 240 × 1m candles (4 giờ context)
    const CANDLE_LIMITS: Record<string, number> = { '15m': 30, '1h': 60, '4h': 240 };
    const candleLimit = CANDLE_LIMITS[timeframe] ?? 60;
    const { data: candlesDesc } = await this.marketPriceService.findAll(
      { symbol: asset, timeframe: '1m' },
      { sort: { timestamp: -1 }, page: 1, limit: candleLimit },
    );
    const candles = [...candlesDesc].reverse();

    // Step 2: Fetch latest TechnicalIndicator (always '1m' — computed from 1m candles)
    const indicator = await this.technicalIndicatorService.findLatest({
      symbol: asset,
      timeframe: '1m',
    });

    // Step 3: Fetch latest SentimentSignal records (last 3, any source)
    const { data: sentimentSignals } = await this.sentimentSignalService.findAll(
      {},
      { sort: { timestamp: -1 }, page: 1, limit: 3 },
    );

    // Step 4: Fetch latest MacroIndicator records (last 8, one per series)
    const { data: macroIndicators } = await this.macroIndicatorService.findAll(
      {},
      { sort: { timestamp: -1 }, page: 1, limit: 8 },
    );

    // Step 5: Fetch latest NewsArticle records (last 5, most recent)
    const { data: recentNewsArticles } = await this.newsArticleService.findAll(
      {},
      { sort: { publishedAt: -1 }, page: 1, limit: 5 },
    );

    // Step 5.5: Build data snapshot — lưu giá trị thực tế đã dùng để generate signal
    const firstCandle = candles[0] as any;
    const lastCandle = candles[candles.length - 1] as any;
    const latestSentiment = sentimentSignals[0] as any;
    const dataSnapshot = {
      indicator: indicator
        ? {
            timestamp: (indicator as any).timestamp,
            rsi14: (indicator as any).rsi14,
            macdLine: (indicator as any).macdLine,
            macdSignal: (indicator as any).macdSignal,
            macdHistogram: (indicator as any).macdHistogram,
            ema9: (indicator as any).ema9,
            ema20: (indicator as any).ema20,
            ema50: (indicator as any).ema50,
            ema200: (indicator as any).ema200,
            sma20: (indicator as any).sma20,
            bbUpper: (indicator as any).bbUpper,
            bbMiddle: (indicator as any).bbMiddle,
            bbLower: (indicator as any).bbLower,
            atr14: (indicator as any).atr14,
            atr14Pct: (indicator as any).atr14Pct,
            volumeRatio: (indicator as any).volumeRatio,
            hv30d: (indicator as any).hv30d,
          }
        : undefined,
      macro:
        macroIndicators.length > 0
          ? macroIndicators.map((m: any) => ({
              seriesId: m.seriesId,
              name: m.name,
              value: m.value,
              unit: m.unit,
              timestamp: m.timestamp,
            }))
          : undefined,
      sentiment: latestSentiment
        ? {
            source: latestSentiment.source,
            timestamp: latestSentiment.timestamp,
            newsSentimentMean: latestSentiment.newsSentimentMean,
            geopoliticalRiskScore: latestSentiment.geopoliticalRiskScore,
            eventImpactLevel: latestSentiment.eventImpactLevel,
            etfFlow7dOz: latestSentiment.etfFlow7dOz,
            etfAumUsd: latestSentiment.etfAumUsd,
            fundingRateAnnualized: latestSentiment.fundingRateAnnualized,
            longShortRatio: latestSentiment.longShortRatio,
            openInterestUsd: latestSentiment.openInterestUsd,
            keyEvents: latestSentiment.keyEvents,
            analysisSummary: latestSentiment.analysisSummary,
          }
        : undefined,
      newsArticles: recentNewsArticles.length > 0
        ? recentNewsArticles.map((a: any) => ({
            title: a.title,
            sourceName: a.sourceName,
            publishedAt: a.publishedAt,
            description: a.description,
            sentiment: a.sentiment,
            sentimentLabel: a.sentimentLabel,
            sentimentReason: a.sentimentReason,
          }))
        : undefined,
      marketContext:
        candles.length > 0
          ? {
              source: lastCandle?.source || 'binance_spot',
              candleCount: candles.length,
              fromTimestamp: firstCandle?.timestamp,
              toTimestamp: lastCandle?.timestamp,
              openPrice: firstCandle?.open,
              highPrice: Math.max(...candles.map((c: any) => c.high ?? c.close)),
              lowPrice: Math.min(...candles.map((c: any) => c.low ?? c.close)),
              closePrice: lastCandle?.close,
            }
          : undefined,
    };

    // Step 6: Fallback if insufficient data
    if (candles.length < 10) {
      this.logger.warn(
        `[${this.name}] Insufficient candle data for ${asset}/${timeframe} (${candles.length} candles), generating HOLD signal`,
      );
      await this.saveSignal(accountId, asset, timeframe, {
        signalType: SignalType.HOLD,
        confidence: 0,
        insight: 'Signal engine unavailable. Market analysis could not be completed.',
        indicatorsUsed: [],
        keyFactors: [],
        macroFactors: [],
        llmModel: undefined,
        llmInput: null,
        llmRawResponse: null,
        dataSnapshot,
      });
      this.systemActivityLogService.logActivity({
        workerType: SystemWorkerType.SIGNAL_GEN,
        source: 'system',
        symbol: asset,
        action: 'generate_signal',
        status: SystemActivityStatus.WARNING,
        details: `Insufficient candle data (${candles.length} candles) for ${asset}/${timeframe} — fallback HOLD`,
        metadata: { accountId, asset, timeframe, candleCount: candles.length },
        durationMs: Date.now() - startTime,
      });
      return;
    }

    // Step 7: Build user prompt
    const userPrompt = this.buildUserPrompt(
      asset,
      timeframe,
      candles,
      indicator,
      sentimentSignals,
      macroIndicators,
      recentNewsArticles,
    );

    // Step 8: Call LLM
    const llmBaseUrl = process.env['LLM_BASE_URL'] || '';
    const llmApiKey = process.env['LLM_API_KEY'] || '';
    const llmModel =
      process.env['LLM_SIGNAL_MODEL'] ||
      process.env['LLM_MODEL'] ||
      'gpt-4o-mini';

    if (!llmBaseUrl || !llmApiKey) {
      this.logger.warn(`[${this.name}] No LLM config, generating fallback HOLD signal`);
      await this.saveSignal(accountId, asset, timeframe, {
        signalType: SignalType.HOLD,
        confidence: 0,
        insight: 'Signal engine unavailable. Market analysis could not be completed.',
        indicatorsUsed: [],
        keyFactors: [],
        macroFactors: [],
        llmModel: undefined,
        llmInput: null,
        llmRawResponse: null,
        dataSnapshot,
      });
      this.systemActivityLogService.logActivity({
        workerType: SystemWorkerType.SIGNAL_GEN,
        source: llmModel,
        symbol: asset,
        action: 'generate_signal',
        status: SystemActivityStatus.WARNING,
        details: `LLM not configured — fallback HOLD for ${asset}/${timeframe}`,
        metadata: { accountId, asset, timeframe },
        durationMs: Date.now() - startTime,
      });
      return;
    }

    const llmEndpoint = `${llmBaseUrl}/chat/completions`;
    const llmRequestBody = {
      model: llmModel,
      messages: [
        { role: 'system', content: SIGNAL_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 8192,
      stream: false,
    };

    // Record input for traceability
    const llmInput = {
      endpoint: llmEndpoint,
      model: llmModel,
      systemPrompt: SIGNAL_SYSTEM_PROMPT,
      userPrompt,
      candleCount: candles.length,
      sentimentCount: sentimentSignals.length,
      macroCount: macroIndicators.length,
      requestedAt: new Date().toISOString(),
    };

    this.logger.info(`[SignalLLM] Calling LLM: ${llmEndpoint} model=${llmModel}`);
    let parsed: any;
    let llmRawResponse: any;
    try {
      const response = await axios.post(
        llmEndpoint,
        llmRequestBody,
        {
          headers: {
            Authorization: `Bearer ${llmApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 120_000,
        },
      );

      // Extract content from non-streaming response
      const content: string = response.data?.choices?.[0]?.message?.content ?? '';
      llmRawResponse = { streaming: false, content };
      this.logger.debug(`[SignalLLM] Response content (${content.length} chars): ${content.slice(0, 500)}`);

      // Strip markdown code fences nếu có (```json ... ```)
      let cleanContent = content.trim();
      const fenceMatch = cleanContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) cleanContent = fenceMatch[1].trim();

      // Extract JSON object nếu có text thừa trước/sau
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleanContent = jsonMatch[0];

      parsed = JSON.parse(cleanContent);
    } catch (error: any) {
      const status = error.response?.status;
      const body = JSON.stringify(error.response?.data)?.slice(0, 300);
      this.logger.error(`[${this.name}] LLM call failed: ${error.message} | status=${status} | body=${body}`);
      await this.saveSignal(accountId, asset, timeframe, {
        signalType: SignalType.HOLD,
        confidence: 0,
        insight: 'Signal engine unavailable. Market analysis could not be completed.',
        indicatorsUsed: [],
        keyFactors: [],
        macroFactors: [],
        llmModel,
        llmInput,
        llmRawResponse: { error: error.message, status, body },
        dataSnapshot,
      });
      this.systemActivityLogService.logActivity({
        workerType: SystemWorkerType.SIGNAL_GEN,
        source: llmModel,
        symbol: asset,
        action: 'generate_signal',
        status: SystemActivityStatus.ERROR,
        details: `LLM call failed for ${asset}/${timeframe}: ${error.message}`,
        metadata: { accountId, asset, timeframe, httpStatus: status, llmModel },
        durationMs: Date.now() - startTime,
      });
      return;
    }

    // Step 9: Validate LLM response
    const validSignalTypes = [SignalType.BUY, SignalType.SELL, SignalType.HOLD];
    const rawSignalType = parsed?.signal_type;
    const rawConfidence = parsed?.confidence;

    if (
      !validSignalTypes.includes(rawSignalType) ||
      typeof rawConfidence !== 'number' ||
      rawConfidence < 0 ||
      rawConfidence > 100
    ) {
      this.logger.warn(`[${this.name}] Invalid LLM response, falling back to HOLD`);
      await this.saveSignal(accountId, asset, timeframe, {
        signalType: SignalType.HOLD,
        confidence: 0,
        insight: 'Signal engine unavailable. Market analysis could not be completed.',
        indicatorsUsed: [],
        keyFactors: [],
        macroFactors: [],
        llmModel,
        llmInput,
        llmRawResponse,
        dataSnapshot,
      });
      return;
    }

    const confidence = Math.round(rawConfidence);

    // Override to HOLD if confidence < 30
    const signalType: SignalType =
      confidence < 30 ? SignalType.HOLD : (rawSignalType as SignalType);

    const isTrade = signalType === SignalType.BUY || signalType === SignalType.SELL;
    if (isTrade && (typeof parsed.entry !== 'number' || typeof parsed.take_profit !== 'number' || typeof parsed.stop_loss !== 'number')) {
      this.logger.warn(`[${this.name}] ${signalType} signal missing price levels (entry/tp/sl) from LLM response`);
    }
    await this.saveSignal(accountId, asset, timeframe, {
      signalType,
      confidence,
      insight: parsed.insight || '',
      entry: isTrade && typeof parsed.entry === 'number' ? parsed.entry : undefined,
      takeProfit: isTrade && typeof parsed.take_profit === 'number' ? parsed.take_profit : undefined,
      stopLoss: isTrade && typeof parsed.stop_loss === 'number' ? parsed.stop_loss : undefined,
      macroFactors: Array.isArray(parsed.macro_factors) ? parsed.macro_factors : [],
      indicatorsUsed: Array.isArray(parsed.indicators_used) ? parsed.indicators_used : [],
      keyFactors: Array.isArray(parsed.key_factors) ? parsed.key_factors : [],
      llmModel,
      priceAtCreation: candles[candles.length - 1]?.close,
      llmInput,
      llmRawResponse,
      dataSnapshot,
    });

    this.systemActivityLogService.logActivity({
      workerType: SystemWorkerType.SIGNAL_GEN,
      source: llmModel,
      symbol: asset,
      action: 'generate_signal',
      status: SystemActivityStatus.SUCCESS,
      details: `Generated ${signalType} signal for ${asset}/${timeframe} — confidence: ${confidence}%`,
      metadata: {
        accountId,
        asset,
        timeframe,
        signalType,
        confidence,
        llmModel,
        candleCount: candles.length,
      },
      durationMs: Date.now() - startTime,
    });
  }

  private async saveSignal(
    accountId: string,
    asset: string,
    timeframe: string,
    result: {
      signalType: SignalType;
      confidence: number;
      insight: string;
      indicatorsUsed: string[];
      keyFactors: { factor: string; weight: string }[];
      entry?: number;
      takeProfit?: number;
      stopLoss?: number;
      macroFactors?: string[];
      llmModel: string | undefined;
      priceAtCreation?: number;
      llmInput: Record<string, any> | null;
      llmRawResponse: Record<string, any> | null;
      dataSnapshot?: Record<string, any>;
    },
  ): Promise<void> {
    const {
      signalType,
      confidence,
      insight,
      indicatorsUsed,
      keyFactors,
      entry,
      takeProfit,
      stopLoss,
      macroFactors,
      llmModel,
      priceAtCreation,
      llmInput,
      llmRawResponse,
      dataSnapshot,
    } = result;

    // Calculate confidenceLabel
    let confidenceLabel: ConfidenceLabel;
    if (confidence >= 90) {
      confidenceLabel = ConfidenceLabel.VERY_HIGH;
    } else if (confidence >= 70) {
      confidenceLabel = ConfidenceLabel.HIGH;
    } else if (confidence >= 40) {
      confidenceLabel = ConfidenceLabel.MEDIUM;
    } else {
      confidenceLabel = ConfidenceLabel.LOW;
    }

    // Calculate expiresAt
    // 15m → expire sau 1 giờ (4 × period)
    // 1h  → expire sau 4 giờ (4 × period)
    // 4h  → expire sau 16 giờ (4 × period)
    const now = new Date();
    const expiresAt = new Date(now);
    if (timeframe === SignalTimeframe.M15) {
      expiresAt.setMinutes(expiresAt.getMinutes() + 60); // +1h
    } else if (timeframe === SignalTimeframe.H1) {
      expiresAt.setHours(expiresAt.getHours() + 4);
    } else if (timeframe === SignalTimeframe.H4) {
      expiresAt.setHours(expiresAt.getHours() + 16);
    } else {
      expiresAt.setHours(expiresAt.getHours() + 4);
    }

    // Supersede existing ACTIVE signals for same accountId x asset x timeframe
    const { data: activeSignals } = await this.signalService.findAll(
      {
        filter: {
          accountId: new Types.ObjectId(accountId),
          asset,
          timeframe,
          status: SignalStatus.ACTIVE,
        },
        page: 1,
        limit: 100,
      },
      SYSTEM_CONTEXT,
    );

    for (const existing of activeSignals) {
      await this.signalService.update(
        (existing as any)._id,
        { status: SignalStatus.SUPERSEDED } as any,
        SYSTEM_CONTEXT,
      );
    }

    // Create new signal
    const newSignal = await this.signalService.create(
      {
        accountId: new Types.ObjectId(accountId),
        asset,
        timeframe,
        signalType,
        confidence,
        confidenceLabel,
        insight,
        entry,
        takeProfit,
        stopLoss,
        macroFactors: macroFactors ?? [],
        indicatorsUsed,
        keyFactors,
        llmModel,
        status: SignalStatus.ACTIVE,
        expiresAt,
        priceAtCreation,
        llmInput,
        llmRawResponse,
        dataSnapshot,
      },
      SYSTEM_CONTEXT,
    );

    // Update superseded signals with supersededBy pointing to new signal
    const newSignalId = (newSignal as any)._id;
    for (const existing of activeSignals) {
      await this.signalService.update(
        (existing as any)._id,
        { supersededBy: newSignalId } as any,
        SYSTEM_CONTEXT,
      );
    }

    this.logger.info(
      `[SignalLLM] Generated ${signalType} signal for ${asset}/${timeframe} (confidence: ${confidence})`,
    );

    // Notify for all signal types
    const actionMap = {
      [SignalType.BUY]: '🟢 BUY',
      [SignalType.SELL]: '🔴 SELL',
      [SignalType.HOLD]: '⏸️ HOLD',
    };
    const levelMap = {
      [SignalType.BUY]: 'success' as const,
      [SignalType.SELL]: 'warning' as const,
      [SignalType.HOLD]: 'info' as const,
    };
    await this.notificationService.notifyAccount(accountId, {
      title: `${actionMap[signalType]} Signal — ${asset} (${timeframe})`,
      message: insight || 'No analysis available.',
      level: levelMap[signalType],
      data: {
        Asset: asset,
        Timeframe: timeframe,
        Confidence: `${confidence}% (${confidenceLabel})`,
        Price: priceAtCreation ? `$${priceAtCreation}` : 'N/A',
        Expires: expiresAt.toISOString(),
      },
    });
  }

  private buildUserPrompt(
    asset: string,
    timeframe: string,
    candles: any[],
    indicator: any,
    sentimentSignals: any[],
    macroIndicators: any[],
    newsArticles: any[] = [],
  ): string {
    const candleData = candles.map((c) => ({
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));

    const indicatorData = indicator
      ? {
          timestamp: indicator.timestamp,
          rsi14: indicator.rsi14,
          macdLine: indicator.macdLine,
          macdSignal: indicator.macdSignal,
          macdHistogram: indicator.macdHistogram,
          ema9: indicator.ema9,
          ema20: indicator.ema20,
          ema50: indicator.ema50,
          ema200: indicator.ema200,
          sma20: indicator.sma20,
          bbUpper: indicator.bbUpper,
          bbMiddle: indicator.bbMiddle,
          bbLower: indicator.bbLower,
          atr14: indicator.atr14,
          atr14Pct: indicator.atr14Pct,
          volumeRatio: indicator.volumeRatio,
          hv30d: indicator.hv30d,
        }
      : null;

    const latestCandle = candles[candles.length - 1];

    const sentimentData = sentimentSignals.length > 0
      ? sentimentSignals.map((s) => ({
          timestamp: s.timestamp,
          source: s.source,
          newsSentimentMean: s.newsSentimentMean,
          geopoliticalRiskScore: s.geopoliticalRiskScore,
          eventImpactLevel: s.eventImpactLevel,
          etfFlow7dOz: s.etfFlow7dOz,
          etfAumUsd: s.etfAumUsd,
          fundingRateAnnualized: s.fundingRateAnnualized,
          longShortRatio: s.longShortRatio,
          openInterestUsd: s.openInterestUsd,
          keyEvents: s.keyEvents,
          analysisSummary: s.analysisSummary,
        }))
      : null;

    const macroData = macroIndicators.length > 0
      ? macroIndicators.map((m) => ({
          seriesId: m.seriesId,
          name: m.name,
          value: m.value,
          unit: m.unit,
          timestamp: m.timestamp,
          frequency: m.frequency,
        }))
      : null;

    const newsData = newsArticles.length > 0
      ? newsArticles.map((a) => ({
          title: a.title,
          sourceName: a.sourceName,
          publishedAt: a.publishedAt,
          description: a.description,
          sentiment: a.sentiment,
          sentimentLabel: a.sentimentLabel,
          sentimentReason: a.sentimentReason,
        }))
      : null;

    return `Analyze the following market data for ${asset} on the ${timeframe} timeframe and generate a trading signal.

LATEST PRICE: ${latestCandle?.close ?? 'N/A'}
CANDLE COUNT: ${candles.length}

OHLCV DATA (oldest to newest, last ${candles.length} candles):
${JSON.stringify(candleData, null, 2)}

TECHNICAL INDICATORS (latest computed):
${indicatorData ? JSON.stringify(indicatorData, null, 2) : 'No indicator data available'}

NEWS & SENTIMENT (most recent records):
${sentimentData ? JSON.stringify(sentimentData, null, 2) : 'No sentiment data available'}

NEWS ARTICLES (most recent, with sentiment analysis):
${newsData ? JSON.stringify(newsData, null, 2) : 'No news articles available'}

MACRO INDICATORS (latest values):
${macroData ? JSON.stringify(macroData, null, 2) : 'No macro data available'}

Based on all available data (technical, sentiment, news articles, macro), generate a trading signal following the required JSON format.`;
  }
}
