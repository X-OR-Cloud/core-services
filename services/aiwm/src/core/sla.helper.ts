import { ActionType, ActorRole } from '../modules/action/action.enum';

export const SLA_FRT_THRESHOLD_MS = 10_000;
export const SLA_UNANSWERED_THRESHOLD_MS = 60_000;

export interface SlaAction {
  type: string;
  actor: { role: string };
  createdAt: Date;
}

export interface FrtResult {
  ms: number | null;
  slaBreached: boolean;
}

export interface TimeRange {
  from: Date;
  to: Date;
  preset: string | null;
}

export type MetricsGranularity = 'hour' | 'day';

export function computeFrt(actions: SlaAction[]): FrtResult {
  const messages = actions.filter((a) => a.type === ActionType.MESSAGE);
  const userFirst = messages.find((a) => a.actor.role === ActorRole.USER);
  if (!userFirst) return { ms: null, slaBreached: false };

  const agentFirst = messages.find(
    (a) => a.actor.role === ActorRole.AGENT && a.createdAt > userFirst.createdAt,
  );
  if (!agentFirst) return { ms: null, slaBreached: false };

  const ms = agentFirst.createdAt.getTime() - userFirst.createdAt.getTime();
  return { ms, slaBreached: ms > SLA_FRT_THRESHOLD_MS };
}

export function computeResponseDeltas(actions: SlaAction[]): number[] {
  const messages = actions.filter((a) => a.type === ActionType.MESSAGE);
  const deltas: number[] = [];

  for (let i = 0; i < messages.length - 1; i++) {
    const curr = messages[i];
    const next = messages[i + 1];
    if (curr.actor.role === ActorRole.USER && next.actor.role === ActorRole.AGENT) {
      deltas.push(next.createdAt.getTime() - curr.createdAt.getTime());
    }
  }

  return deltas;
}

export function computeP90(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.9);
  return sorted[Math.min(idx, sorted.length - 1)];
}

export function computeAvg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

export function resolveTimeRange(
  preset: string | undefined,
  from: string | undefined,
  to: string | undefined,
): TimeRange {
  if (from && to) {
    return { from: new Date(from), to: new Date(to), preset: preset ?? null };
  }

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  switch (preset) {
    case 'yesterday': {
      const s = new Date(startOfToday);
      s.setDate(s.getDate() - 1);
      const e = new Date(startOfToday);
      e.setMilliseconds(-1);
      return { from: s, to: e, preset: 'yesterday' };
    }
    case '7d': {
      const s = new Date(startOfToday);
      s.setDate(s.getDate() - 6);
      return { from: s, to: now, preset: '7d' };
    }
    case '30d': {
      const s = new Date(startOfToday);
      s.setDate(s.getDate() - 29);
      return { from: s, to: now, preset: '30d' };
    }
    default: {
      return { from: startOfToday, to: now, preset: 'today' };
    }
  }
}

export function defaultGranularity(preset: string | null): MetricsGranularity {
  if (preset === 'today' || preset === 'yesterday') return 'hour';
  return 'day';
}

export function getPeriodKey(date: Date, granularity: MetricsGranularity): string {
  const d = new Date(date);
  if (granularity === 'hour') {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
