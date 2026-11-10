/** `fleet/runs/index.json` model (pure: strings in, strings out; the bridge does the fs). */
import type { FleetGate, FleetRequest, FleetSession } from '../src/fleet/protocol.ts';
import { isLive } from '../src/fleet/protocol.ts';
import { reportBackPrompt } from './chain.ts';

/** A gate plus the parent's `## Özet` at the time it opened (the child prompt needs it after a restart). */
export type StoredGate = FleetGate & {
  parentSummary?: string;
  parentSummaryExplicit?: boolean;
  /** Resume text of this gate (child report / failure); denied gates need none. */
  report?: string;
};

export interface FleetIndex {
  sessions: FleetSession[];
  requests: FleetRequest[];
  gates: StoredGate[];
  /** Session ids whose current run was already sent back once (done gate, TASK-632). */
  nudged: string[];
}

export const emptyIndex = (): FleetIndex => ({ sessions: [], requests: [], gates: [], nudged: [] });

export const GATE_REPORT_CHARS = 400;

/** Wire form of a gate (no bridge-internal fields; the resume text is clipped to a preview). */
export const publicGate = ({
  parentSummary: _s,
  parentSummaryExplicit: _x,
  report,
  ...g
}: StoredGate): FleetGate =>
  report === undefined ? g : { ...g, report: report.slice(0, GATE_REPORT_CHARS) };

/** Tolerant parse: missing / corrupt / wrong-shaped text gives an empty index. */
export function parseIndex(text: string | undefined): FleetIndex {
  if (!text) return emptyIndex();
  try {
    const o: unknown = JSON.parse(text);
    if (typeof o !== 'object' || o === null) return emptyIndex();
    const { sessions, requests, gates, nudged } = o as Partial<FleetIndex>;
    return {
      sessions: Array.isArray(sessions) ? sessions : [],
      requests: Array.isArray(requests) ? requests : [],
      gates: Array.isArray(gates) ? gates : [],
      nudged: Array.isArray(nudged) ? nudged.filter((x) => typeof x === 'string') : [],
    };
  } catch {
    return emptyIndex();
  }
}

export const serializeIndex = (idx: FleetIndex): string => `${JSON.stringify(idx, null, 2)}\n`;

/**
 * On restart no child process survives: live sessions become `error: bridge restarted`. A
 * `waiting` parent keeps waiting only while it still has a pending gate; otherwise its child was
 * lost, so it goes back to `done` (and its request closes).
 */
export function recoverIndex(idx: FleetIndex, now: number): FleetIndex {
  const dead = new Set<string>();
  const settled = new Set<string>();
  const sessions = idx.sessions.map((s) => {
    if (!isLive(s)) return s;
    if (s.status === 'waiting') {
      if (idx.gates.some((g) => g.status === 'pending' && g.fromSessionId === s.id)) return s;
      settled.add(s.id);
      return { ...s, status: 'done' as const, endedAt: now, updatedAt: now };
    }
    dead.add(s.requestId);
    return {
      ...s,
      status: 'error' as const,
      reason: 'bridge restarted',
      endedAt: now,
      updatedAt: now,
    };
  });
  const requests = idx.requests.map((r) => {
    if (r.status !== 'open') return r;
    if (dead.has(r.id)) return { ...r, status: 'error' as const };
    return settled.has(r.rootSessionId) ? { ...r, status: 'done' as const } : r;
  });
  // an allowed gate whose child died with the bridge reports that failure
  const gates = idx.gates.map((g) =>
    g.status === 'allowed' && g.report === undefined
      ? { ...g, report: reportBackPrompt(g.toIsland, 'bridge restarted', 'error') }
      : g,
  );
  return { sessions, requests, gates, nudged: idx.nudged };
}

/** Insert or replace by id; returns the stored value. */
export function upsertSession(idx: FleetIndex, s: FleetSession): FleetSession {
  const i = idx.sessions.findIndex((x) => x.id === s.id);
  if (i < 0) idx.sessions.push(s);
  else idx.sessions[i] = s;
  return s;
}

export function upsertRequest(idx: FleetIndex, r: FleetRequest): FleetRequest {
  const i = idx.requests.findIndex((x) => x.id === r.id);
  if (i < 0) idx.requests.push(r);
  else idx.requests[i] = r;
  return r;
}

export const runPath = (runsDir: string, sessionId: string): string =>
  `${runsDir}/${sessionId}.jsonl`;
export const indexPath = (runsDir: string): string => `${runsDir}/index.json`;
