# DGT Service - Data Ingestion Flow

**Version:** 1.0 | **Date:** 03/03/2026 | **Status:** Draft

---

## I. Tổng quan

Data Ingestion gồm 2 worker types chạy ở Worker mode:

| Worker | Vai trò | Queue |
|--------|---------|-------|
| **Scheduler** | Load schedule config, emit jobs theo lịch | `dgt-scheduler` (internal) |
| **Data Ingestion** | Consume jobs, fetch/transform/save data | `dgt-data-ingestion` |

```
┌──────────────┐     BullMQ      ┌────────────────────┐     MongoDB
│   Scheduler  │ ──── jobs ────► │  Data Ingestion    │ ──── save ────► MarketPrice
│   Worker     │                 │  Worker            │                 MacroIndicator
│              │                 │                    │                 SentimentSignal
│  Load config │                 │  Switch by type:   │
│  Repeatable  │                 │  - fred            │
│  jobs        │                 │  - goldapi         │
└──────────────┘                 │  - yahoo           │
                                 │  - binance_spot    │
                                 │  - binance_futures │
                                 │  - okx             │
                                 │  - bitfinex        │
                                 │  - newsapi         │
                                 │  - bytetree        │
                                 └────────────────────┘
```

---

## II. Scheduler Worker

### Vai trò
- Đọc config từ `datasources.config.ts`
- Đăng ký **BullMQ Repeatable Jobs** cho mỗi datasource
- Mỗi job type + interval = 1 repeatable job

### Config Structure

```typescript
// config/datasources.config.ts

export interface DatasourceSchedule {
  type: string;           // Job type identifier
  name: string;           // Human-readable name
  intervalMs: number;     // Interval in milliseconds
  enabled: boolean;       // Toggle on/off
  params?: Record<string, any>;  // Extra params cho collector
}

export const DATASOURCE_SCHEDULES: DatasourceSchedule[] = [
  // === Mỗi 1 phút (60,000ms) ===
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

  // === Mỗi 5 phút (300,000ms) ===
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

  // === Mỗi 1 giờ (3,600,000ms) ===
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

  // === Hàng ngày (86,400,000ms) - chạy lúc 2AM UTC ===
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
];
```

### Scheduler Processor

```typescript
// queues/scheduler.processor.ts

@Processor('dgt-scheduler')
export class SchedulerProcessor {
  constructor(
    @InjectQueue('dgt-data-ingestion')
    private ingestionQueue: Queue,
  ) {}

  async onModuleInit() {
    // Xoá repeatable jobs cũ (tránh duplicate khi restart)
    const repeatableJobs = await this.ingestionQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await this.ingestionQueue.removeRepeatableByKey(job.key);
    }

    // Đăng ký repeatable jobs mới
    for (const schedule of DATASOURCE_SCHEDULES) {
      if (!schedule.enabled) continue;

      await this.ingestionQueue.add(
        schedule.type,           // job name = datasource type
        {
          type: schedule.type,
          params: schedule.params,
          scheduledAt: new Date().toISOString(),
        },
        {
          repeat: { every: schedule.intervalMs },
          removeOnComplete: 100, // giữ 100 completed jobs gần nhất
          removeOnFail: 50,      // giữ 50 failed jobs
          attempts: 3,           // retry 3 lần
          backoff: {
            type: 'exponential',
            delay: 1000,         // 1s → 2s → 4s
          },
        },
      );

      logger.info(`Scheduled: ${schedule.name} every ${schedule.intervalMs}ms`);
    }
  }
}
```

---

## III. Data Ingestion Worker

### Processor (switchcase by type)

```typescript
// queues/data-ingestion.processor.ts

@Processor('dgt-data-ingestion')
export class DataIngestionProcessor {
  constructor(
    private fredCollector: FredCollector,
    private goldapiCollector: GoldapiCollector,
    private yahooCollector: YahooFinanceCollector,
    private binanceSpotCollector: BinanceSpotCollector,
    private binanceFuturesCollector: BinanceFuturesCollector,
    private okxCollector: OkxCollector,
    private bitfinexCollector: BitfinexCollector,
    private newsapiCollector: NewsapiCollector,
    private bytetreeCollector: BytetreeCollector,
  ) {}

  @Process('*')  // catch all job names
  async handleJob(job: Job) {
    const { type, params } = job.data;
    const startTime = Date.now();

    try {
      switch (type) {
        case 'fred':
          await this.fredCollector.collect(params);
          break;
        case 'goldapi':
          await this.goldapiCollector.collect(params);
          break;
        case 'yahoo_finance':
          await this.yahooCollector.collect(params);
          break;
        case 'binance_spot':
          await this.binanceSpotCollector.collect(params);
          break;
        case 'binance_futures':
          await this.binanceFuturesCollector.collect(params);
          break;
        case 'okx':
          await this.okxCollector.collect(params);
          break;
        case 'bitfinex':
          await this.bitfinexCollector.collect(params);
          break;
        case 'newsapi':
          await this.newsapiCollector.collect(params);
          break;
        case 'bytetree':
          await this.bytetreeCollector.collect(params);
          break;
        default:
          throw new Error(`Unknown datasource type: ${type}`);
      }

      const duration = Date.now() - startTime;
      logger.info(`[${type}] Collected in ${duration}ms`);
    } catch (error) {
      logger.error(`[${type}] Collection failed: ${error.message}`);
      throw error; // BullMQ sẽ retry theo config
    }
  }
}
```

---

## IV. Collector Pattern

### Base Collector

```typescript
// collectors/base.collector.ts

export abstract class BaseCollector {
  protected abstract readonly name: string;
  protected readonly timeout = 10_000; // 10s default

  abstract collect(params: Record<string, any>): Promise<void>;

  protected async fetchWithRetry(
    url: string,
    options?: AxiosRequestConfig,
    maxRetries = 3,
  ): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get(url, {
          ...options,
          timeout: this.timeout,
        });
        return response.data;
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          throw error; // Auth errors: không retry
        }
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
          await this.sleep(waitMs);
          continue;
        }
        if (attempt === maxRetries) throw error;
        await this.sleep(Math.pow(2, attempt) * 1000); // 1s, 2s, 4s
      }
    }
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

### Collector Flow: Fetch → Transform → Save

Mỗi collector thực hiện 3 bước:

```
┌───────────┐     ┌─────────────┐     ┌──────────┐
│  1. Fetch  │ ──► │ 2. Transform │ ──► │  3. Save  │
│            │     │              │     │           │
│ Call API   │     │ Map to       │     │ Upsert to │
│ Parse JSON │     │ entity       │     │ MongoDB   │
│ Validate   │     │ schema       │     │           │
└───────────┘     └─────────────┘     └──────────┘
```

---

## V. Chi tiết từng Collector

### 5.1 FredCollector

```
FRED API ──► MacroIndicator collection
```

| Step | Chi tiết |
|------|---------|
| **Fetch** | `GET https://api.stlouisfed.org/fred/series/observations?series_id={ID}&api_key={KEY}&file_type=json&sort_order=desc&limit=1` |
| **Transform** | `{ seriesId, name, value: parseFloat(observations[0].value), unit, timestamp: observations[0].date, releaseDate, source: 'fred', frequency }` |
| **Save** | Upsert vào `MacroIndicator` theo `{ seriesId, timestamp }` |
| **Loop** | Lặp qua 11 series IDs |

### 5.2 GoldapiCollector

```
GoldAPI.io ──► MarketPrice collection
```

| Step | Chi tiết |
|------|---------|
| **Fetch** | `GET https://www.goldapi.io/api/XAU/USD` (header: `x-access-token`) |
| **Transform** | `{ symbol: 'XAUUSD', source: 'goldapi', timeframe: '1m', close: price, timestamp, extra: { change, changePct } }` |
| **Save** | Insert vào `MarketPrice` |
| **Fallback** | Nếu GoldAPI down → dùng Yahoo Finance `GC=F` |

### 5.3 YahooFinanceCollector

```
Yahoo Finance ──► MarketPrice collection (multiple symbols)
```

| Step | Chi tiết |
|------|---------|
| **Fetch** | `yahoo.quote(symbol)` cho mỗi symbol trong params.symbols |
| **Transform** | `{ symbol, source: 'yahoo', timeframe: '1h', open, high, low, close: regularMarketPrice, volume, timestamp }` |
| **Save** | Insert vào `MarketPrice` cho mỗi symbol |
| **Symbols** | `GC=F`, `^VIX`, `BTC-USD`, `^GSPC`, `CL=F`, `DX-Y.NYB` |

### 5.4 BinanceSpotCollector

```
Binance Spot API ──► MarketPrice collection
```

| Step | Chi tiết |
|------|---------|
| **Fetch** | (1) `GET /api/v3/ticker/24hr?symbol=PAXGUSDT` (2) `GET /api/v3/depth?symbol=PAXGUSDT&limit=100` |
| **Transform Price** | `{ symbol: 'PAXGUSDT', source: 'binance_spot', timeframe: '1m', open, high, low, close: lastPrice, volume, extra: { vwap: weightedAvgPrice, quoteVolume } }` |
| **Transform Orderbook** | Tính: bidAskSpread, liquidityAt1Pct, liquidityAt2Pct, slippageEstimate |
| **Save** | Insert price vào `MarketPrice`, orderbook metrics vào `extra` |
| **Hard Rule** | Nếu `bidAskSpread > 0.05%` → ghi `RiskAlert` type `spread_block` |

### 5.5 BinanceFuturesCollector

```
Binance Futures API ──► MarketPrice + SentimentSignal collections
```

| Step | Chi tiết |
|------|---------|
| **Fetch** | (1) `GET /fapi/v1/premiumIndex?symbol=PAXGUSDT` (2) `GET /futures/data/openInterestHist?symbol=PAXGUSDT&period=1h&limit=2` (3) `GET /futures/data/globalLongShortAccountRatio?symbol=PAXGUSDT&period=1h&limit=1` |
| **Transform → MarketPrice** | `{ symbol: 'PAXGUSDT', source: 'binance_futures', close: markPrice, extra: { markPrice, indexPrice, fundingRate } }` |
| **Transform → SentimentSignal** | `{ source: 'binance_futures', fundingRateAnnualized, longShortRatio, openInterestUsd }` |
| **Save** | Insert vào cả 2 collections |

### 5.6 OkxCollector

```
OKX API ──► MarketPrice collection
```

| Step | Chi tiết |
|------|---------|
| **Fetch** | `GET https://www.okx.com/api/v5/market/ticker?instId=PAXG-USDT` |
| **Transform** | `{ symbol: 'PAXGUSDT', source: 'okx', close: last, high: high24h, low: low24h, volume: vol24h }` |
| **Save** | Insert vào `MarketPrice` |

### 5.7 BitfinexCollector

```
Bitfinex API ──► MarketPrice collection
```

| Step | Chi tiết |
|------|---------|
| **Fetch** | `GET https://api-pub.bitfinex.com/v2/ticker/tXAUT:USD` |
| **Transform** | Array response: `[BID, BID_SIZE, ASK, ASK_SIZE, DAILY_CHANGE, ...]` → `{ symbol: 'XAUTUSD', source: 'bitfinex', close: LAST_PRICE, high: HIGH, low: LOW, volume: VOLUME }` |
| **Save** | Insert vào `MarketPrice` |

### 5.8 NewsapiCollector

```
NewsAPI.org ──► LLM Analysis ──► SentimentSignal collection
```

| Step | Chi tiết |
|------|---------|
| **Fetch** | `GET https://newsapi.org/v2/everything?q={query}&language=en&sortBy=publishedAt&pageSize=10&apiKey={KEY}` |
| **Transform** | Extract titles → gửi LLM để phân tích |
| **LLM Call** | OpenAI-compatible API, prompt: phân tích sentiment vàng + geopolitical risk |
| **LLM Response** | `{ geopoliticalRiskScore, eventImpactLevel, overall_sentiment, gold_analysis_summary, key_events }` |
| **Save** | Insert vào `SentimentSignal` với source: `llm_analysis` |

**LLM Prompt Structure:**
```
System: You are a Gold market analyst specializing in macro and geopolitics.
User: Analyze these news headlines for gold market impact:
1. [title 1]
2. [title 2]
...
Return JSON: { geopolitical_risk_score (0-100), event_impact_level, overall_sentiment (-1 to +1), gold_analysis_summary, key_events[] }
```

### 5.9 BytetreeCollector

```
ByteTree BOLD API ──► SentimentSignal collection
```

| Step | Chi tiết |
|------|---------|
| **Fetch** | `GET https://bold.report/api/v1/combined/all-latest.json` |
| **Transform** | Extract: `gold-ff-culm7day` (ETF flow 7d), `gold-ft-aum` (AUM), `gold-vol-30d` (volatility) |
| **Save** | Insert vào `SentimentSignal` với source: `bytetree` |

---

## VI. Error Handling

### Retry Strategy (BullMQ)

| Error Type | Hành xử |
|------------|---------|
| Network timeout | Retry 3 lần, exponential backoff (1s → 2s → 4s) |
| HTTP 429 (Rate Limit) | Chờ theo `Retry-After` header, hoặc 5s |
| HTTP 401/403 (Auth) | **Không retry**, log error, alert admin |
| HTTP 5xx (Server) | Retry 3 lần |
| Parse error | **Không retry**, log error với raw response |

### Monitoring

```
Datasource Status Dashboard (future):
┌──────────────────────────────────────────────────┐
│  Source          │ Last OK     │ Errors │ Status │
│──────────────────┼─────────────┼────────┼────────│
│  GoldAPI         │ 2s ago      │ 0      │ ✅     │
│  Binance Spot    │ 5s ago      │ 0      │ ✅     │
│  Binance Futures │ 8s ago      │ 0      │ ✅     │
│  OKX             │ 1m ago      │ 0      │ ✅     │
│  Bitfinex        │ 2m ago      │ 0      │ ✅     │
│  Yahoo Finance   │ 30m ago     │ 0      │ ✅     │
│  NewsAPI         │ 45m ago     │ 0      │ ✅     │
│  FRED            │ 18h ago     │ 0      │ ✅     │
│  ByteTree        │ 18h ago     │ 0      │ ✅     │
└──────────────────────────────────────────────────┘
```

- Cảnh báo khi 1 datasource fail > 5 lần liên tiếp
- Ghi log chi tiết mỗi lần fetch (success/error/retry/duration)
- Dashboard trạng thái datasource (phase sau)

---

## VII. Data Volume Estimate

| Datasource | Interval | Records/giờ | Records/ngày |
|------------|----------|-------------|-------------|
| GoldAPI | 1 min | 60 | 1,440 |
| Binance Spot | 1 min | 60 | 1,440 |
| Binance Futures | 1 min | 60 (price) + 60 (sentiment) | 2,880 |
| OKX | 5 min | 12 | 288 |
| Bitfinex | 5 min | 12 | 288 |
| Yahoo Finance | 1 hour | 6 (symbols) | 144 |
| NewsAPI + LLM | 1 hour | 1 | 24 |
| FRED | daily | - | 11 |
| ByteTree | daily | - | 1 |
| **Total** | | **~211** | **~6,516** |

~6.5K records/ngày, ~200K/tháng. MongoDB handles dễ dàng.

Cân nhắc TTL index cho MarketPrice (giữ 1 năm = ~2.4M records).

---

## VIII. Sequence Diagram - 1 chu kỳ thu thập

```
Scheduler          Queue                Ingestion Worker        Collector          MongoDB
   │                  │                       │                     │                 │
   │  add repeatable  │                       │                     │                 │
   │  job (goldapi,   │                       │                     │                 │
   │  every 60s)      │                       │                     │                 │
   │─────────────────►│                       │                     │                 │
   │                  │                       │                     │                 │
   │                  │  job fired (goldapi)  │                     │                 │
   │                  │──────────────────────►│                     │                 │
   │                  │                       │                     │                 │
   │                  │                       │  switch(goldapi)    │                 │
   │                  │                       │────────────────────►│                 │
   │                  │                       │                     │                 │
   │                  │                       │                     │  1. Fetch API   │
   │                  │                       │                     │────────────────►│
   │                  │                       │                     │  (GoldAPI.io)   │
   │                  │                       │                     │                 │
   │                  │                       │                     │  2. Transform   │
   │                  │                       │                     │  to MarketPrice │
   │                  │                       │                     │                 │
   │                  │                       │                     │  3. Save        │
   │                  │                       │                     │────────────────►│
   │                  │                       │                     │  (upsert)       │
   │                  │                       │                     │                 │
   │                  │                       │  done               │                 │
   │                  │                       │◄────────────────────│                 │
   │                  │                       │                     │                 │
   │                  │  job completed        │                     │                 │
   │                  │◄──────────────────────│                     │                 │
   │                  │                       │                     │                 │
   │                  │  ... 60s later ...    │                     │                 │
   │                  │  job fired again      │                     │                 │
   │                  │──────────────────────►│                     │                 │
```

---

## IX. Thứ tự triển khai

| Phase | Nội dung | Priority |
|-------|---------|----------|
| **1a** | Entity schemas + CRUD modules (Group 1-5) | Cao |
| **1b** | Worker mode bootstrap (`main-worker.ts`, `app-worker.module.ts`) | Cao |
| **2a** | BullMQ queue setup + Scheduler processor | Cao |
| **2b** | BaseCollector + 3 collectors đầu tiên (GoldAPI, Binance Spot, FRED) | Cao |
| **2c** | Còn lại 6 collectors | Trung bình |
| **2d** | NewsAPI collector + LLM integration | Trung bình |
| **3** | Technical Indicator computation (từ MarketPrice) | Sau |

---

*Quay lại: [01-ARCHITECTURE.md](01-ARCHITECTURE.md) | [02-ENTITY-DESIGN.md](02-ENTITY-DESIGN.md)*
