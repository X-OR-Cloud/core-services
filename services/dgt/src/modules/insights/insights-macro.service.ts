import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MacroIndicator, MacroIndicatorDocument } from '../macro-indicator/macro-indicator.schema';
import { SentimentSignal, SentimentSignalDocument } from '../sentiment-signal/sentiment-signal.schema';

@Injectable()
export class InsightsMacroService {
  constructor(
    @InjectModel(MacroIndicator.name) private readonly macroModel: Model<MacroIndicatorDocument>,
    @InjectModel(SentimentSignal.name) private readonly sentimentModel: Model<SentimentSignalDocument>,
  ) {}

  async getFeed() {
    const allSeries = await this.macroModel.aggregate([
      { $sort: { seriesId: 1, timestamp: -1 } },
      {
        $group: {
          _id: '$seriesId',
          latest: { $first: '$$ROOT' },
          previous: { $push: '$$ROOT' },
        },
      },
      { $limit: 20 },
    ]);

    const events = await this.sentimentModel
      .find({ 'keyEvents.0': { $exists: true } })
      .sort({ timestamp: -1 })
      .limit(10)
      .select('timestamp source keyEvents analysisSummary')
      .lean()
      .exec();

    const indicators = allSeries.map((s) => ({
      seriesId: s._id,
      name: s.latest.name,
      value: s.latest.value,
      unit: s.latest.unit,
      timestamp: s.latest.timestamp,
      source: s.latest.source,
      frequency: s.latest.frequency,
    }));

    const feed = events.flatMap((e) =>
      (e.keyEvents || []).map((evt: string) => ({
        timestamp: e.timestamp,
        source: e.source,
        event: evt,
        summary: e.analysisSummary || null,
      })),
    );

    return { indicators, feed, updatedAt: new Date() };
  }

  async getCalendar() {
    const upcoming = await this.macroModel
      .find({ releaseDate: { $gte: new Date() } })
      .sort({ releaseDate: 1 })
      .limit(20)
      .lean()
      .exec();

    const events = upcoming.map((m) => ({
      seriesId: m.seriesId,
      name: m.name,
      releaseDate: m.releaseDate,
      frequency: m.frequency,
      unit: m.unit,
      lastValue: m.value,
    }));

    return { events, updatedAt: new Date() };
  }

  async getMonetary() {
    const seriesIds = ['FEDFUNDS', 'DFF', 'DFII10', 'T10Y2Y', 'REAINTRATREARAT10Y'];
    const results = await Promise.all(
      seriesIds.map((id) =>
        this.macroModel.findOne({ seriesId: id }).sort({ timestamp: -1 }).lean().exec(),
      ),
    );

    const indicators = results
      .filter(Boolean)
      .map((m) => ({
        seriesId: m!.seriesId,
        name: m!.name,
        value: m!.value,
        unit: m!.unit,
        timestamp: m!.timestamp,
        frequency: m!.frequency,
      }));

    const fedFunds = results[0]?.value || results[1]?.value || null;
    const realYield = results[2]?.value || null;
    const yieldCurve = results[3]?.value || null;

    const stance =
      fedFunds !== null && fedFunds > 5 ? 'RESTRICTIVE'
        : fedFunds !== null && fedFunds > 3 ? 'NEUTRAL'
        : 'ACCOMMODATIVE';

    return { stance, fedFundsRate: fedFunds, realYield10y: realYield, yieldCurveSpread: yieldCurve, indicators, updatedAt: new Date() };
  }

  async getLiquidity() {
    const dxy = await this.macroModel.findOne({ seriesId: 'DXY' }).sort({ timestamp: -1 }).lean().exec();

    const etfData = await this.sentimentModel
      .findOne({ source: 'bytetree' })
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    const fundingData = await this.sentimentModel
      .findOne({ source: 'binance_futures' })
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    const dxyValue = dxy?.value || null;
    const dxySignal = dxyValue !== null
      ? (dxyValue > 105 ? 'BEARISH_GOLD' : dxyValue < 100 ? 'BULLISH_GOLD' : 'NEUTRAL')
      : 'UNKNOWN';

    return {
      dxy: { value: dxyValue, signal: dxySignal, timestamp: dxy?.timestamp || null },
      etfFlows: {
        flow7dOz: etfData?.etfFlow7dOz || null,
        aumUsd: etfData?.etfAumUsd || null,
        timestamp: etfData?.timestamp || null,
      },
      futures: {
        fundingRateAnnualized: fundingData?.fundingRateAnnualized || null,
        longShortRatio: fundingData?.longShortRatio || null,
        openInterestUsd: fundingData?.openInterestUsd || null,
        timestamp: fundingData?.timestamp || null,
      },
      updatedAt: new Date(),
    };
  }
}
