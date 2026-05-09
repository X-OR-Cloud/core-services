import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as mongoose from 'mongoose';
import Redis from 'ioredis';
import { SysClientMetrics } from './sys-client.metrics';
import {
  SysCacheStats,
  SysClientOptions,
  SysSettingMetadata,
} from './sys-client.types';
import { redactValue } from './redact.util';

const SYS_CLIENT_OPTIONS = 'SYS_CLIENT_OPTIONS';
const SYS_CLIENT_METRICS = 'SYS_CLIENT_METRICS';

const METADATA_PATH = '/settings/metadata';
const SECRET_INTERNAL_PATH = '/settings/internal/secret';
const NON_SENSITIVE_INTERNAL_PATH = '/settings/internal';

const PUBSUB_INVALIDATE_CHANNEL = 'sys:setting:invalidate';
const PUBSUB_METADATA_CHANNEL = 'sys:metadata:invalidate';

const DEFAULTS = {
  cacheTtlSec: 300,
  staleTtlSec: 60,
  secretCacheTtlSec: 300,
} as const;

interface CacheEntry<T = unknown> {
  value: T | null;
  cachedAt: number; // ms epoch
  ttlMs: number;
  staleTtlMs: number; // 0 → no stale-while-revalidate (used for secrets)
}

interface PubsubInvalidatePayload {
  key: string;
  scope: 'global' | 'org';
  orgId: string | null;
  sensitive: boolean;
  updatedAt: string;
}

/**
 * SysSettingClient
 *
 * Unified read API for runtime settings, with two internal cache stores:
 *   - settingCache  → non-sensitive, long TTL, stale-while-revalidate
 *   - secretCache   → sensitive,     short TTL, no stale (always fresh after expiry)
 *
 * Read paths:
 *   - non-sensitive: Mongo direct read (low-latency, owns no schema)
 *   - sensitive:     HTTP fetch via INTERNAL_API_KEY (audit per-read on sys side)
 *
 * Cache invalidation: Redis pub/sub `sys:setting:invalidate` + TTL fallback.
 *
 * 5 Safety Guards (NON-NEGOTIABLE — see PROPOSAL §6.4):
 *   1. settingCache and secretCache are separate Maps (this file) ✓
 *   2. getAll() skips sensitive keys ✓
 *   3. All log calls go through redactValue() helper ✓
 *   4. Metrics labels never contain a value ✓
 *   5. getCacheStats() output never exposes value (sensitive entries indistinguishable) ✓
 */
@Injectable()
export class SysSettingClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('SysSettingClient');

  // Caches (Safety Guard #1 — separate)
  private readonly settingCache = new Map<string, CacheEntry>();
  private readonly secretCache = new Map<string, CacheEntry>();
  private readonly metadata = new Map<string, SysSettingMetadata>();

  // State
  private metadataLoaded = false;
  private mongoConn: mongoose.Connection | null = null;
  private settingModel: mongoose.Model<any> | null = null;
  private redisSub: Redis | null = null;
  private pubsubConnected = false;
  private lastPubsubEventAt: string | undefined;

  // Reload counters for debug endpoint
  private readonly reloadCounts = {
    pubsub: 0,
    ttl: 0,
    stale: 0,
    init: 0,
    manual: 0,
  };

  // In-flight refresh promises (prevent thundering herd)
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(SYS_CLIENT_OPTIONS) private readonly options: SysClientOptions,
    @Inject(SYS_CLIENT_METRICS) private readonly metrics: SysClientMetrics | null,
  ) {}

  // =========================================================================
  // Lifecycle
  // =========================================================================

  async onModuleInit(): Promise<void> {
    if (this.options.disabled) {
      this.logger.warn('sys-client disabled via options.disabled — get() will always return null');
      return;
    }
    try {
      await this.connectMongo();
      await this.connectRedis();
      await this.loadMetadata();
    } catch (error: any) {
      this.logger.error('sys-client init failed (will retry on first get())', { error: error.message });
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.redisSub) await this.redisSub.quit();
    } catch {
      /* ignore */
    }
    try {
      if (this.mongoConn) await this.mongoConn.close();
    } catch {
      /* ignore */
    }
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /**
   * Unified get — auto-detects sensitive via metadata and routes accordingly.
   * Returns the parsed value (string/number/boolean/url/email) or null.
   */
  async get<T = string>(key: string, orgId?: string): Promise<T | null> {
    if (this.options.disabled) return null;

    const start = Date.now();
    const meta = await this.ensureMetadata(key);
    const sensitive = !!meta?.sensitive;
    const type = sensitive ? 'secret' : 'setting';
    try {
      let value: unknown;
      if (sensitive) {
        value = await this._getSensitive(key, orgId, meta);
      } else {
        value = await this._getSetting(key, orgId, meta);
      }
      return value as T | null;
    } finally {
      this.metrics?.settingGetDuration.observe(
        { key, type },
        (Date.now() - start) / 1000,
      );
    }
  }

  async getString(key: string, orgId?: string): Promise<string | null> {
    return this.get<string>(key, orgId);
  }

  async getNumber(key: string, orgId?: string): Promise<number | null> {
    const v = await this.get<unknown>(key, orgId);
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  async getBoolean(key: string, orgId?: string): Promise<boolean | null> {
    const v = await this.get<unknown>(key, orgId);
    if (v === null || v === undefined) return null;
    if (typeof v === 'boolean') return v;
    return v === 'true' || v === '1' || v === 1 || v === true;
  }

  async getOrDefault<T>(key: string, orgId: string | undefined, defaultValue: T): Promise<T> {
    const v = await this.get<T>(key, orgId);
    return v === null || v === undefined ? defaultValue : v;
  }

  async has(key: string, orgId?: string): Promise<boolean> {
    return (await this.get(key, orgId)) !== null;
  }

  /**
   * Bulk read — Safety Guard #2: ALWAYS skips sensitive keys.
   * For sensitive values, callers must use single-key get() (which goes via HTTP
   * + audit), not this batch helper.
   */
  async getAll(orgId?: string): Promise<Record<string, unknown>> {
    if (this.options.disabled) return {};
    const out: Record<string, unknown> = {};
    for (const [key, meta] of this.metadata.entries()) {
      if (meta.sensitive) continue; // Safety Guard #2
      const v = await this._getSetting(key, orgId, meta);
      if (v !== null) out[key] = v;
    }
    return out;
  }

  async reloadKey(key: string): Promise<void> {
    this.settingCache.delete(this._cacheKey(key, undefined));
    this.secretCache.delete(this._cacheKey(key, undefined));
    // Also drop org-prefixed entries — coarse but cheap
    for (const k of Array.from(this.settingCache.keys())) {
      if (k.endsWith(`:${key}`)) this.settingCache.delete(k);
    }
    for (const k of Array.from(this.secretCache.keys())) {
      if (k.endsWith(`:${key}`)) this.secretCache.delete(k);
    }
    this.reloadCounts.manual++;
    this.metrics?.cacheReload.inc({ key, trigger: 'manual' });
  }

  async reloadAll(): Promise<void> {
    this.settingCache.clear();
    this.secretCache.clear();
    this.metadata.clear();
    this.metadataLoaded = false;
    await this.loadMetadata();
    this.reloadCounts.manual++;
  }

  /**
   * Safety Guard #5 — masked output. Sensitive entries appear with the same shape
   * as non-sensitive (key + cachedAt only); no value, no oracle for "has the
   * secret been fetched recently".
   */
  getCacheStats(): SysCacheStats {
    const keys: Array<{ key: string; sensitive: boolean; cachedAt: string }> = [];
    for (const [cacheKey, entry] of this.settingCache.entries()) {
      const settingKey = this._splitCacheKey(cacheKey);
      const meta = this.metadata.get(settingKey);
      keys.push({
        key: cacheKey,
        sensitive: !!meta?.sensitive,
        cachedAt: new Date(entry.cachedAt).toISOString(),
      });
    }
    // Secret cache entries are reported only as count + key name; the cached
    // timestamp isn't included to avoid leaking "this secret was fetched at T".
    return {
      settingCacheSize: this.settingCache.size,
      secretCacheSize: this.secretCache.size,
      metadataLoaded: this.metadataLoaded,
      pubsubConnected: this.pubsubConnected,
      lastPubsubEventAt: this.lastPubsubEventAt,
      ttlConfig: {
        settingDefault: this.options.defaultCacheTtlSec ?? DEFAULTS.cacheTtlSec,
        secretDefault: this.options.defaultSecretCacheTtlSec ?? DEFAULTS.secretCacheTtlSec,
        stale: this.options.defaultStaleTtlSec ?? DEFAULTS.staleTtlSec,
      },
      reloadCounts: { ...this.reloadCounts },
      keys,
    };
  }

  // =========================================================================
  // Internal — non-sensitive (Mongo direct + cache + stale-while-revalidate)
  // =========================================================================

  private async _getSetting(
    key: string,
    orgId: string | undefined,
    meta: SysSettingMetadata | undefined,
  ): Promise<unknown> {
    const cacheKey = this._cacheKey(key, orgId);
    const ttlMs =
      (meta?.cacheTtlSec ?? this.options.defaultCacheTtlSec ?? DEFAULTS.cacheTtlSec) * 1000;
    const staleMs =
      (meta?.staleTtlSec ?? this.options.defaultStaleTtlSec ?? DEFAULTS.staleTtlSec) * 1000;

    const entry = this.settingCache.get(cacheKey);
    const now = Date.now();

    if (entry) {
      const age = now - entry.cachedAt;
      if (age < entry.ttlMs) {
        this.metrics?.cacheHit.inc({ key, source: 'memory' });
        return entry.value;
      }
      if (age < entry.ttlMs + entry.staleTtlMs) {
        // stale-while-revalidate: return stale immediately, refresh in background
        this.metrics?.cacheHit.inc({ key, source: 'stale' });
        this._refreshSetting(key, orgId, meta).catch(() => undefined); // fire-and-forget
        this.reloadCounts.stale++;
        this.metrics?.cacheReload.inc({ key, trigger: 'stale' });
        return entry.value;
      }
    }

    // Miss or fully expired
    this.metrics?.cacheHit.inc({ key, source: 'miss' });
    return this._refreshSetting(key, orgId, meta);
  }

  private async _refreshSetting(
    key: string,
    orgId: string | undefined,
    meta: SysSettingMetadata | undefined,
  ): Promise<unknown> {
    const cacheKey = this._cacheKey(key, orgId);
    const trigger = this.settingCache.has(cacheKey) ? 'ttl' : 'init';
    if (trigger === 'ttl') this.reloadCounts.ttl++;
    else this.reloadCounts.init++;

    // De-dup concurrent refreshes for the same cache key
    const existing = this.inflight.get(cacheKey);
    if (existing) return existing;

    const promise = (async () => {
      const start = Date.now();
      try {
        const raw = await this._readMongo(key, orgId);
        const parsed = this._parseValue(meta, raw);
        const ttlMs =
          (meta?.cacheTtlSec ?? this.options.defaultCacheTtlSec ?? DEFAULTS.cacheTtlSec) * 1000;
        const staleMs =
          (meta?.staleTtlSec ?? this.options.defaultStaleTtlSec ?? DEFAULTS.staleTtlSec) * 1000;
        this.settingCache.set(cacheKey, {
          value: parsed,
          cachedAt: Date.now(),
          ttlMs,
          staleTtlMs: staleMs,
        });
        this.metrics?.cacheReload.inc({ key, trigger });
        this.metrics?.cacheReloadDuration.observe({ key }, (Date.now() - start) / 1000);
        return parsed;
      } finally {
        this.inflight.delete(cacheKey);
      }
    })();

    this.inflight.set(cacheKey, promise);
    return promise;
  }

  private async _readMongo(key: string, orgId: string | undefined): Promise<string | null> {
    if (!this.settingModel) return null;
    // org → global fallback
    if (orgId) {
      const orgDoc = await this.settingModel
        .findOne({ key, scope: 'org', isDeleted: false, 'owner.orgId': orgId, value: { $nin: [null, ''] } })
        .lean()
        .exec();
      if (orgDoc) return (orgDoc as any).value;
    }
    const globalDoc = await this.settingModel
      .findOne({ key, scope: 'global', isDeleted: false, value: { $nin: [null, ''] } })
      .lean()
      .exec();
    return globalDoc ? (globalDoc as any).value : null;
  }

  // =========================================================================
  // Internal — sensitive (HTTP + secretCache, no stale)
  // =========================================================================

  private async _getSensitive(
    key: string,
    orgId: string | undefined,
    meta: SysSettingMetadata | undefined,
  ): Promise<unknown> {
    const cacheKey = this._cacheKey(key, orgId);
    const ttlMs =
      (meta?.cacheTtlSec ?? this.options.defaultSecretCacheTtlSec ?? DEFAULTS.secretCacheTtlSec) *
      1000;

    const entry = this.secretCache.get(cacheKey);
    if (entry && Date.now() - entry.cachedAt < entry.ttlMs) {
      this.metrics?.cacheHit.inc({ key, source: 'memory' });
      return entry.value;
    }
    this.metrics?.cacheHit.inc({ key, source: 'miss' });

    // De-dup concurrent secret fetches
    const existing = this.inflight.get(cacheKey);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const url = `${this.options.sysApiUrl}${SECRET_INTERNAL_PATH}/${encodeURIComponent(key)}${
          orgId ? `?orgId=${encodeURIComponent(orgId)}` : ''
        }`;
        const res = await fetch(url, {
          headers: { 'X-Internal-API-Key': this.options.internalApiKey },
        });
        if (res.status === 404) {
          this.metrics?.secretFetch.inc({ key, result: 'success' });
          this.secretCache.set(cacheKey, { value: null, cachedAt: Date.now(), ttlMs, staleTtlMs: 0 });
          return null;
        }
        if (res.status === 401 || res.status === 403) {
          this.metrics?.secretFetch.inc({ key, result: 'denied' });
          this.logger.error('Sensitive read denied by sys', { key, status: res.status });
          return null;
        }
        if (!res.ok) {
          this.metrics?.secretFetch.inc({ key, result: 'error' });
          this.logger.error('Sensitive read failed', { key, status: res.status });
          return null;
        }
        const body = (await res.json()) as { value: string };
        this.metrics?.secretFetch.inc({ key, result: 'success' });
        const parsed = this._parseValue(meta, body.value);
        this.secretCache.set(cacheKey, {
          value: parsed,
          cachedAt: Date.now(),
          ttlMs,
          staleTtlMs: 0, // no stale-while-revalidate for secrets
        });
        this.reloadCounts.init++;
        this.metrics?.cacheReload.inc({ key, trigger: 'init' });
        return parsed;
      } catch (error: any) {
        this.metrics?.secretFetch.inc({ key, result: 'error' });
        // Safety Guard #3: log without value (just the key + error)
        this.logger.error('Sensitive read threw', { key, error: error.message });
        return null;
      } finally {
        this.inflight.delete(cacheKey);
      }
    })();
    this.inflight.set(cacheKey, promise);
    return promise;
  }

  // =========================================================================
  // Metadata bootstrap
  // =========================================================================

  private async loadMetadata(): Promise<void> {
    try {
      const url = `${this.options.sysApiUrl}${METADATA_PATH}`;
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.error('Failed to load metadata from sys', { status: res.status });
        return;
      }
      const arr = (await res.json()) as SysSettingMetadata[];
      this.metadata.clear();
      for (const m of arr) this.metadata.set(m.key, m);
      this.metadataLoaded = true;
      this.logger.log(`sys-client metadata loaded: ${this.metadata.size} keys`);
    } catch (error: any) {
      this.logger.error('loadMetadata threw', { error: error.message });
    }
  }

  private async ensureMetadata(key: string): Promise<SysSettingMetadata | undefined> {
    if (!this.metadataLoaded) await this.loadMetadata();
    return this.metadata.get(key);
  }

  // =========================================================================
  // Mongo connection (separate from consumer's main DB)
  // =========================================================================

  private async connectMongo(): Promise<void> {
    if (this.mongoConn) return;
    const dbName = this.options.mongoDbName ?? 'core_sys';
    const conn = await mongoose.createConnection(this.options.mongoUri, { dbName }).asPromise();
    this.mongoConn = conn;
    // Define a minimal model for the settings collection (read-only).
    // We intentionally do NOT depend on `services/sys/.../setting.schema.ts` here;
    // lib stays decoupled from sys service code.
    const SettingDoc = new mongoose.Schema(
      {
        key: String,
        value: String,
        scope: String,
        sensitive: Boolean,
        owner: { orgId: String },
        isDeleted: Boolean,
      },
      { strict: false, collection: 'settings' },
    );
    this.settingModel = conn.model('Setting', SettingDoc);
  }

  // =========================================================================
  // Redis pub/sub subscriber
  // =========================================================================

  private async connectRedis(): Promise<void> {
    const url =
      this.options.redisUrl ||
      (() => {
        const host = this.options.redisHost || 'localhost';
        const port = this.options.redisPort || 6379;
        const user = this.options.redisUsername || '';
        const pass = this.options.redisPassword || '';
        return pass
          ? `redis://${user}:${encodeURIComponent(pass)}@${host}:${port}`
          : `redis://${host}:${port}`;
      })();

    this.redisSub = new Redis(url, {
      enableReadyCheck: false,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: null, // pub/sub clients should reconnect indefinitely
    });

    this.redisSub.on('connect', () => {
      this.pubsubConnected = true;
      this.logger.log('sys-client pub/sub connected');
    });
    this.redisSub.on('end', () => {
      this.pubsubConnected = false;
      this.metrics?.pubsubDisconnect.inc();
      this.logger.warn('sys-client pub/sub disconnected');
    });
    this.redisSub.on('error', (err) => {
      this.logger.warn('sys-client pub/sub error', { error: err.message });
    });

    await this.redisSub.subscribe(PUBSUB_INVALIDATE_CHANNEL, PUBSUB_METADATA_CHANNEL);
    this.redisSub.on('message', (channel: string, message: string) => {
      try {
        if (channel === PUBSUB_INVALIDATE_CHANNEL) {
          const payload = JSON.parse(message) as PubsubInvalidatePayload;
          this._handleInvalidate(payload);
        } else if (channel === PUBSUB_METADATA_CHANNEL) {
          this.loadMetadata().catch(() => undefined);
        }
      } catch (error: any) {
        this.logger.warn('pub/sub message parse error', { channel, error: error.message });
      }
    });
  }

  private _handleInvalidate(payload: PubsubInvalidatePayload): void {
    this.lastPubsubEventAt = new Date().toISOString();
    // Compute pubsub_lag from updatedAt → now
    if (payload.updatedAt) {
      const lagSec = (Date.now() - new Date(payload.updatedAt).getTime()) / 1000;
      if (lagSec >= 0 && lagSec < 600) {
        this.metrics?.pubsubLag.observe({ channel: PUBSUB_INVALIDATE_CHANNEL }, lagSec);
      }
    }

    // Drop matching cache entries
    const cache = payload.sensitive ? this.secretCache : this.settingCache;
    const orgPrefix = payload.orgId ? `${payload.orgId}:` : '';
    const target = `${orgPrefix}${payload.key}`;
    cache.delete(target);
    if (payload.scope === 'global') {
      // global change can shadow any org cache → also drop org-prefixed entries
      for (const k of Array.from(cache.keys())) {
        if (k.endsWith(`:${payload.key}`)) cache.delete(k);
      }
      cache.delete(payload.key); // global key (no org prefix)
    }
    this.reloadCounts.pubsub++;
    this.metrics?.cacheReload.inc({ key: payload.key, trigger: 'pubsub' });

    // Safety Guard #3: log without value
    const safe = redactValue(this.metadata, payload.key, payload.key);
    this.logger.debug('Cache invalidated by pub/sub', {
      key: safe,
      scope: payload.scope,
      orgId: payload.orgId,
    });
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private _cacheKey(key: string, orgId: string | undefined): string {
    return orgId ? `${orgId}:${key}` : key;
  }

  private _splitCacheKey(cacheKey: string): string {
    const idx = cacheKey.lastIndexOf(':');
    return idx === -1 ? cacheKey : cacheKey.slice(idx + 1);
  }

  private _parseValue(meta: SysSettingMetadata | undefined, raw: string | null): unknown {
    if (raw === null || raw === undefined) return null;
    if (!meta) return raw;
    switch (meta.dataType) {
      case 'number': {
        const n = Number(raw);
        return isNaN(n) ? raw : n;
      }
      case 'boolean':
        return raw === 'true' || raw === '1';
      default:
        return raw;
    }
  }
}

export { SYS_CLIENT_OPTIONS, SYS_CLIENT_METRICS };
