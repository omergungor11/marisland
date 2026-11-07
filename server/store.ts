/** `fleet/runs/index.json` model (pure: strings in, strings out; the bridge does the fs). */
import type { FleetRequest, FleetSession } from '../src/fleet/protocol.ts';
import { isLive } from '../src/fleet/protocol.ts';

export interface FleetIndex {
  sessions: FleetSession[];
  requests: FleetRequest[];
}

export const emptyIndex = (): FleetIndex => ({ sessions: [], requests: [] });

/** Tolerant parse: missing / corrupt / wrong-shaped text gives an empty index. */
export function parseIndex(text: string | undefined): FleetIndex {
  if (!text) return emptyIndex();
  try {
    const o: unknown = JSON.parse(text);
    if (typeof o !== 'object' || o === null) return emptyIndex();
    const { sessions, requests } = o as Partial<FleetIndex>;
    return {
      sessions: Array.isArray(sessions) ? sessions : [],
      requests: Array.isArray(requests) ? requests : [],
    };
  } catch {
    return emptyIndex();
  }
}

export const serializeIndex = (idx: FleetIndex): string => `${JSON.stringify(idx, null, 2)}\n`;

/** On restart no child process survives: live sessions become `error: bridge restarted`. */
export function recoverIndex(idx: FleetIndex, now: number): FleetIndex {
  const dead = new Set<string>();
  const sessions = idx.sessions.map((s) => {
    if (!isLive(s)) return s;
    dead.add(s.requestId);
    return {
      ...s,
      status: 'error' as const,
      reason: 'bridge restarted',
      endedAt: now,
      updatedAt: now,
    };
  });
  const requests = idx.requests.map((r) =>
    r.status === 'open' && dead.has(r.id) ? { ...r, status: 'error' as const } : r,
  );
  return { sessions, requests };
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
