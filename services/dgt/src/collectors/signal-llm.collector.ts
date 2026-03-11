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
import { SIGNAL_SYSTEM_PROMPT } from '../prompts/signal-system.prompt';
import { RequestContext, PredefinedRole } from '@hydrabyte/shared';
import { NotificationService } from '../shared/notification.service';

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
    private readonly notificationService: NotificationService,
  ) {
    super();
  }

  async collect(params: Record<string, any>): Promise<void> {
    const { accountId, asset, timeframe } = params as {
      accountId: string;
      asset: string;
      timeframe: string;
    };

    // Step 1: Fetch last 50 MarketPrice candles (always use '1m' — raw data granularity)
    // The signal timeframe (1h/4h) determines signal validity, not candle granularity
    const candleLimit = timeframe === '4h' ? 240 : 60; // 4h → 240 × 1m candles, 1h → 60 × 1m
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

    // Step 3: Fallback if insufficient data
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
        llmModel: undefined,
      });
      return;
    }

    // Step 4: Build user prompt
    const userPrompt = this.buildUserPrompt(asset, timeframe, candles, indicator);

    // Step 5: Call LLM
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
        llmModel: undefined,
      });
      return;
    }

    let parsed: any;
    try {
      const response = await axios.post(
        `${llmBaseUrl}/chat/completions`,
        {
          model: llmModel,
          messages: [
            { role: 'system', content: SIGNAL_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            Authorization: `Bearer ${llmApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 20_000,
        },
      );

      const content = response.data?.choices?.[0]?.message?.content;
      parsed = JSON.parse(content);
    } catch (error: any) {
      this.logger.error(`[${this.name}] LLM call failed: ${error.message}`);
      await this.saveSignal(accountId, asset, timeframe, {
        signalType: SignalType.HOLD,
        confidence: 0,
        insight: 'Signal engine unavailable. Market analysis could not be completed.',
        indicatorsUsed: [],
        keyFactors: [],
        llmModel,
      });
      return;
    }

    // Step 6: Validate LLM response
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
        llmModel,
      });
      return;
    }

    const confidence = Math.round(rawConfidence);

    // Override to HOLD if confidence < 30
    const signalType: SignalType =
      confidence < 30 ? SignalType.HOLD : (rawSignalType as SignalType);

    await this.saveSignal(accountId, asset, timeframe, {
      signalType,
      confidence,
      insight: parsed.insight || '',
      indicatorsUsed: Array.isArray(parsed.indicators_used) ? parsed.indicators_used : [],
      keyFactors: Array.isArray(parsed.key_factors) ? parsed.key_factors : [],
      llmModel,
      priceAtCreation: candles[candles.length - 1]?.close,
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
      llmModel: string | undefined;
      priceAtCreation?: number;
    },
  ): Promise<void> {
    const { signalType, confidence, insight, indicatorsUsed, keyFactors, llmModel, priceAtCreation } = result;

    // Step 7: Calculate confidenceLabel
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

    // Step 8: Calculate expiresAt
    const now = new Date();
    const expiresAt = new Date(now);
    if (timeframe === SignalTimeframe.H1) {
      expiresAt.setHours(expiresAt.getHours() + 4);
    } else if (timeframe === SignalTimeframe.H4) {
      expiresAt.setHours(expiresAt.getHours() + 16);
    } else {
      // Default: +4 hours
      expiresAt.setHours(expiresAt.getHours() + 4);
    }

    // Step 9: Supersede existing ACTIVE signals for same accountId x asset x timeframe
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

    // Step 10: Create new signal
    const newSignal = await this.signalService.create(
      {
        accountId: new Types.ObjectId(accountId),
        asset,
        timeframe,
        signalType,
        confidence,
        confidenceLabel,
        insight,
        indicatorsUsed,
        keyFactors,
        llmModel,
        status: SignalStatus.ACTIVE,
        expiresAt,
        priceAtCreation,
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

    // Notify only for actionable signals
    if (signalType === SignalType.BUY || signalType === SignalType.SELL) {
      const action = signalType === SignalType.BUY ? '🟢 BUY' : '🔴 SELL';
      await this.notificationService.notifyAccount(accountId, {
        title: `${action} Signal — ${asset} (${timeframe})`,
        message: insight,
        level: signalType === SignalType.BUY ? 'success' : 'warning',
        data: {
          Asset: asset,
          Timeframe: timeframe,
          Confidence: `${confidence}% (${confidenceLabel})`,
          Price: priceAtCreation ? `$${priceAtCreation}` : 'N/A',
          Expires: expiresAt.toISOString(),
        },
      });
    }
  }

  private buildUserPrompt(
    asset: string,
    timeframe: string,
    candles: any[],
    indicator: any,
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

    return `Analyze the following market data for ${asset} on the ${timeframe} timeframe and generate a trading signal.

LATEST PRICE: ${latestCandle?.close ?? 'N/A'}
CANDLE COUNT: ${candles.length}

OHLCV DATA (oldest to newest, last ${candles.length} candles):
${JSON.stringify(candleData, null, 2)}

TECHNICAL INDICATORS (latest computed):
${indicatorData ? JSON.stringify(indicatorData, null, 2) : 'No indicator data available'}

Based on this data, generate a trading signal following the required JSON format.`;
  }
}
