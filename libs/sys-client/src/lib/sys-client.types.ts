/**
 * sys-client lib — public types
 *
 * Ref: docs/sys/PROPOSAL.md §6
 */

/**
 * Setting metadata as exposed by sys `GET /settings/metadata`. Mirror of
 * `services/sys/src/modules/setting/constants/setting-metadata.const.ts` but
 * not imported (lib must remain decoupled from sys service code).
 */
export interface SysSettingMetadata {
  key: string;
  displayName?: string;
  description?: string;
  dataType: 'string' | 'number' | 'boolean' | 'url' | 'email';
  isRequired?: boolean;
  defaultValue?: string;
  validation?: Record<string, unknown>;
  example?: string;
  sensitive?: boolean;
  cacheTtlSec?: number;
  staleTtlSec?: number;
}

/**
 * Options for `SysClientModule.forRoot()`
 */
export interface SysClientOptions {
  /** Base URL of sys service, e.g. 'http://sys:3007' */
  sysApiUrl: string;

  /** Shared internal API key (env INTERNAL_API_KEY). */
  internalApiKey: string;

  /** Service name of the consumer (used for metrics labels and audit `service` field). */
  serviceName: string;

  /** Mongo URI to the core_sys database (lib reads non-sensitive settings directly). */
  mongoUri: string;

  /** Mongo db name (default: core_sys). */
  mongoDbName?: string;

  /** Redis connection — at least one of these must be set for pub/sub to work. */
  redisUrl?: string;
  redisHost?: string;
  redisPort?: number;
  redisUsername?: string;
  redisPassword?: string;

  /** Default cache TTLs (per-key override via metadata). */
  defaultCacheTtlSec?: number; // default 300
  defaultStaleTtlSec?: number; // default 60 (non-sensitive only)
  defaultSecretCacheTtlSec?: number; // default 300

  /** Enable Prometheus metrics expose helper. Default false. */
  metricsEnabled?: boolean;

  /** Disable lib altogether (for tests). Default false. */
  disabled?: boolean;
}

/**
 * Async snapshot of cache state for debug endpoint.
 * Sensitive entries: only `key` + `cachedAt` exposed; never `value` and never any
 * field that would let an attacker tell whether a secret has been fetched.
 *
 * Ref: PROPOSAL §6.4 Safety Guard #5
 */
export interface SysCacheStats {
  settingCacheSize: number;
  secretCacheSize: number;
  metadataLoaded: boolean;
  pubsubConnected: boolean;
  lastPubsubEventAt?: string;
  ttlConfig: {
    settingDefault: number;
    secretDefault: number;
    stale: number;
  };
  reloadCounts: {
    pubsub: number;
    ttl: number;
    stale: number;
    init: number;
    manual: number;
  };
  /** Per-entry summary; no values; sensitive entries indistinguishable from non-sensitive. */
  keys: Array<{ key: string; sensitive: boolean; cachedAt: string }>;
}
