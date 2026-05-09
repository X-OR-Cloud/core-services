/**
 * BullMQ queue name for audit-log ingest.
 *
 * Both the lib (producer side via `SysAuditClient`) and the sys worker
 * (consumer) reference this constant — keep them in sync.
 *
 * Ref: docs/sys/PROPOSAL.md §5.4
 */
export const SYS_AUDIT_INGEST_QUEUE = 'sys-audit-ingest';
export const SYS_AUDIT_INGEST_JOB = 'audit-event';
