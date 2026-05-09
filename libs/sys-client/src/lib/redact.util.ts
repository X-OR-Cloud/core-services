import { SysSettingMetadata } from './sys-client.types';

const REDACTED = '<redacted>';

/**
 * Safety Guard #3 — Logging hook redact.
 *
 * Returns the redacted form of `value` if metadata says the key is sensitive.
 * Wrap every logger call in lib with this helper to ensure secrets never leak
 * through log shipping (Datadog, CloudWatch, stdout grep, etc.).
 *
 * Ref: docs/sys/PROPOSAL.md §6.4 Safety Guard #3
 */
export function redactValue(
  metadata: Map<string, SysSettingMetadata>,
  key: string,
  value: unknown,
): unknown {
  const meta = metadata.get(key);
  if (meta?.sensitive) return REDACTED;
  return value;
}

/**
 * Build a structured-log key/value pair with sensitive values redacted.
 */
export function redactKv(
  metadata: Map<string, SysSettingMetadata>,
  kvs: Record<string, unknown> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(kvs)) {
    if (k === 'value' || k === 'secret' || k === 'plaintext') {
      // Conservative: any field literally named value/secret/plaintext gets redacted
      // unless we can prove the key is non-sensitive — but we don't have key context
      // here, so default to redacting.
      out[k] = REDACTED;
    } else {
      out[k] = v;
    }
  }
  return out;
}
