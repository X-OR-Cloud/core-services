export interface DatasourceSchedule {
  type: string;
  name: string;
  intervalMs: number;
  enabled: boolean;
  params?: Record<string, any>;
}

export const DATASOURCE_SCHEDULES: DatasourceSchedule[] = [
  // === Every 1 minute (60,000ms) ===
  {
    type: 'goldapi',
    name: 'GoldAPI - XAU/USD Spot',
    intervalMs: 60_000,
    enabled: true,
    params: { symbol: 'XAU', currency: 'USD' },
  },
  {
    type: 'binance_spot',
    name: 'Binance Spot - PAXG',
    intervalMs: 60_000,
    enabled: true,
    params: { symbols: ['PAXGUSDT'] },
  },
  {
    type: 'binance_futures',
    name: 'Binance Futures - PAXG',
    intervalMs: 60_000,
    enabled: true,
    params: { symbol: 'PAXGUSDT' },
  },

  // === Every 5 minutes (300,000ms) ===
  {
    type: 'okx',
    name: 'OKX - PAXG/USDT',
    intervalMs: 300_000,
    enabled: true,
    params: { instId: 'PAXG-USDT' },
  },
  {
    type: 'bitfinex',
    name: 'Bitfinex - XAUT/USD',
    intervalMs: 300_000,
    enabled: true,
    params: { symbol: 'tXAUT:USD' },
  },

  // === Every 1 hour (3,600,000ms) ===
  {
    type: 'yahoo_finance',
    name: 'Yahoo Finance - Multi symbols',
    intervalMs: 3_600_000,
    enabled: true,
    params: {
      symbols: ['GC=F', '^VIX', 'BTC-USD', '^GSPC', 'CL=F', 'DX-Y.NYB'],
    },
  },
  {
    type: 'newsapi',
    name: 'NewsAPI - Gold & Macro news',
    intervalMs: 3_600_000,
    enabled: true,
    params: {
      query: '(gold price OR "gold market") AND (finance OR trading OR economy)',
      language: 'en',
      pageSize: 10,
    },
  },

  // === Daily (86,400,000ms) ===
  {
    type: 'fred',
    name: 'FRED - Macro indicators',
    intervalMs: 86_400_000,
    enabled: true,
    params: {
      seriesIds: [
        'FEDFUNDS', 'CPIAUCSL', 'PCEPI', 'FEDTARMD', 'DFII10',
        'DTWEXBGS', 'M2SL', 'RRPONTSYD', 'BAMLH0A0HYM2', 'DGS10', 'DGS2',
      ],
    },
  },
  {
    type: 'bytetree',
    name: 'ByteTree BOLD - ETF flows',
    intervalMs: 86_400_000,
    enabled: true,
  },

  // === Daily Portfolio Snapshot (00:05 UTC = 5 min after midnight) ===
  {
    type: 'snapshot_portfolio',
    name: 'Portfolio Snapshot - Daily',
    intervalMs: 86_400_000,
    enabled: true,
  },

  // === Technical Indicator Computation (every 5 minutes) ===
  {
    type: 'compute_indicators',
    name: 'Compute Technical Indicators',
    intervalMs: 300_000,
    enabled: true,
    params: {
      pairs: [
        { symbol: 'XAUUSD', source: 'goldapi', timeframe: '1m' },
        { symbol: 'PAXGUSDT', source: 'binance_spot', timeframe: '1m' },
        { symbol: 'PAXGUSDT', source: 'binance_futures', timeframe: '1m' },
      ],
    },
  },
];
