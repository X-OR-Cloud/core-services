/**
 * Sanitization for audit-log payloads.
 *
 * Used both client-side (sys-client lib before enqueue) and server-side (sys
 * service before persist) so the contract is identical.
 *
 * Three layers:
 *   1. Strip fields whose name matches a sensitive list (password, token, ...)
 *   2. Truncate per-field strings/buffers > 1KB → keep first 256 chars + originalLength marker
 *   3. Cap total payload JSON size at 4KB → replace whole object with summary if exceeded
 *
 * All thresholds configurable. Defaults match PROPOSAL §5.2.
 *
 * Ref: docs/sys/PROPOSAL.md §5.2
 */

const REDACTED = '<redacted>';

/**
 * Field names whose value should be replaced with `<redacted>` (case-insensitive).
 * Add to this list at runtime via `setSensitiveFields()`.
 */
const DEFAULT_SENSITIVE_FIELDS = [
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'secret',
  'apikey',
  'authorization',
  'creditcard',
  'ssn',
  'privatekey',
];

let SENSITIVE_FIELDS = new Set(DEFAULT_SENSITIVE_FIELDS);

export function setSensitiveFields(fields: string[]): void {
  SENSITIVE_FIELDS = new Set([...DEFAULT_SENSITIVE_FIELDS, ...fields.map((f) => f.toLowerCase())]);
}

export function getSensitiveFields(): string[] {
  return [...SENSITIVE_FIELDS];
}

export interface SanitizeOptions {
  /** Per-field truncation threshold in bytes. Default 1024. */
  fieldThresholdBytes?: number;
  /** When truncating, keep this many leading characters. Default 256. */
  fieldKeepBytes?: number;
  /** Total payload JSON size cap. Default 4096. */
  totalThresholdBytes?: number;
}

const DEFAULTS: Required<SanitizeOptions> = {
  fieldThresholdBytes: 1024,
  fieldKeepBytes: 256,
  totalThresholdBytes: 4096,
};

/**
 * Sanitize a single object — strip sensitive fields + per-field truncate.
 * Does NOT apply total-size cap (caller handles that).
 */
export function sanitizeObject(
  input: Record<string, unknown> | undefined | null,
  options: SanitizeOptions = {},
): Record<string, unknown> | undefined {
  if (input === null || input === undefined) return undefined;
  const opts = { ...DEFAULTS, ...options };
  return walk(input, opts) as Record<string, unknown>;
}

/**
 * Sanitize + cap total size. If total > threshold, return a summary stub.
 */
export function sanitizeWithCap(
  input: Record<string, unknown> | undefined | null,
  options: SanitizeOptions = {},
): Record<string, unknown> | undefined {
  const opts = { ...DEFAULTS, ...options };
  const sanitized = sanitizeObject(input, opts);
  if (!sanitized) return undefined;

  const json = safeStringify(sanitized);
  if (json.length <= opts.totalThresholdBytes) return sanitized;

  return {
    __truncated: true,
    originalLength: json.length,
    summary: `<top-level keys: ${Object.keys(sanitized).join(', ')}>`,
  };
}

// =============================================================================
// Internals
// =============================================================================

function walk(value: unknown, opts: Required<SanitizeOptions>): unknown {
  if (value === null || value === undefined) return value;

  // Primitives
  if (typeof value === 'string') return truncateString(value, opts);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();

  // Buffers
  if (Buffer.isBuffer(value)) {
    if (value.length > opts.fieldThresholdBytes) {
      return {
        __truncated: true,
        originalLength: value.length,
        originalType: 'buffer',
      };
    }
    return value.toString('base64');
  }

  // Arrays — walk each element; oversized array becomes a summary
  if (Array.isArray(value)) {
    const items = value.map((v) => walk(v, opts));
    const arrJson = safeStringify(items);
    if (arrJson.length > opts.fieldThresholdBytes) {
      return {
        __truncated: true,
        preview: arrJson.slice(0, opts.fieldKeepBytes),
        originalLength: arrJson.length,
        originalType: 'array',
      };
    }
    return items;
  }

  // Date
  if (value instanceof Date) return value.toISOString();

  // Plain object
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveFieldName(k)) {
        out[k] = REDACTED;
        continue;
      }
      out[k] = walk(v, opts);
    }
    // Per-object cap (catch deep nesting that bypasses field threshold)
    const objJson = safeStringify(out);
    if (objJson.length > opts.fieldThresholdBytes) {
      return {
        __truncated: true,
        preview: objJson.slice(0, opts.fieldKeepBytes),
        originalLength: objJson.length,
        originalType: 'object',
      };
    }
    return out;
  }

  // Fallback — coerce to string then truncate
  return truncateString(String(value), opts);
}

function truncateString(s: string, opts: Required<SanitizeOptions>): unknown {
  if (s.length <= opts.fieldThresholdBytes) return s;
  return {
    __truncated: true,
    preview: s.slice(0, opts.fieldKeepBytes),
    originalLength: s.length,
    originalType: 'string',
  };
}

function isSensitiveFieldName(name: string): boolean {
  return SENSITIVE_FIELDS.has(name.toLowerCase());
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}
