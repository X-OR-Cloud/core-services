import { Counter, Histogram, register } from 'prom-client';

/**
 * Prometheus metrics for sys-client lib.
 *
 * Safety Guard #4: NO label contains a value (only key names + categorical fields).
 * Sensitive setting reads still emit with `key` label (the *name* is not a secret;
 * the *value* is). If you decide name-leakage is also a risk, switch to a hash
 * label or drop the `key` label entirely.
 *
 * Ref: docs/sys/PROPOSAL.md §6.4 Safety Guard #4, §8.1
 */

const PREFIX = 'sys_';

let initialized = false;

export interface SysClientMetrics {
  cacheHit: Counter<string>;
  cacheReload: Counter<string>;
  cacheReloadDuration: Histogram<string>;
  pubsubLag: Histogram<string>;
  pubsubDisconnect: Counter<string>;
  settingGetDuration: Histogram<string>;
  secretFetch: Counter<string>;
}

/**
 * Build (or fetch already-built) metrics. Idempotent across reloads / multiple
 * SysClientModule.forRoot() calls within the same process (Prometheus default
 * registry rejects duplicate registrations otherwise).
 */
export function buildMetrics(): SysClientMetrics {
  if (initialized) {
    return {
      cacheHit: register.getSingleMetric(`${PREFIX}cache_hit_total`) as Counter<string>,
      cacheReload: register.getSingleMetric(`${PREFIX}cache_reload_total`) as Counter<string>,
      cacheReloadDuration: register.getSingleMetric(`${PREFIX}cache_reload_duration_seconds`) as Histogram<string>,
      pubsubLag: register.getSingleMetric(`${PREFIX}pubsub_lag_seconds`) as Histogram<string>,
      pubsubDisconnect: register.getSingleMetric(`${PREFIX}pubsub_disconnect_total`) as Counter<string>,
      settingGetDuration: register.getSingleMetric(`${PREFIX}setting_get_duration_seconds`) as Histogram<string>,
      secretFetch: register.getSingleMetric(`${PREFIX}secret_fetch_total`) as Counter<string>,
    };
  }

  const metrics: SysClientMetrics = {
    cacheHit: new Counter({
      name: `${PREFIX}cache_hit_total`,
      help: 'Cache lookups in sys-client by source (memory/stale/miss).',
      labelNames: ['key', 'source'],
    }),
    cacheReload: new Counter({
      name: `${PREFIX}cache_reload_total`,
      help: 'Cache reload events by trigger. Watch ttl >> pubsub for missed invalidations.',
      labelNames: ['key', 'trigger'],
    }),
    cacheReloadDuration: new Histogram({
      name: `${PREFIX}cache_reload_duration_seconds`,
      help: 'Time spent fetching from upstream during a cache reload.',
      labelNames: ['key'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
    }),
    pubsubLag: new Histogram({
      name: `${PREFIX}pubsub_lag_seconds`,
      help: 'Latency from sys publishing setting:invalidate to consumer receiving it.',
      labelNames: ['channel'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
    }),
    pubsubDisconnect: new Counter({
      name: `${PREFIX}pubsub_disconnect_total`,
      help: 'Pub/sub Redis disconnect events.',
      labelNames: [],
    }),
    settingGetDuration: new Histogram({
      name: `${PREFIX}setting_get_duration_seconds`,
      help: 'End-to-end latency of sys.get() as observed by the caller.',
      labelNames: ['key', 'type'],
      buckets: [0.0001, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
    }),
    secretFetch: new Counter({
      name: `${PREFIX}secret_fetch_total`,
      help: 'Sensitive setting fetches from sys (over HTTP).',
      labelNames: ['key', 'result'],
    }),
  };

  initialized = true;
  return metrics;
}
