/**
 * `?fleet=mock` (TASK-563): a deterministic fleet for UI work and shots. Sessions come from the
 * labelled RNG ('fleet-mock', seeded by `seed`); their times are offsets from the `now` passed in,
 * so the same seed and `now` give the same panel. A timer then feeds a line to a running session
 * every 2–4 s; `frozen` (capture) never starts it.
 */
import { FLEET_MOCK as M } from '../content/fleet.ts';
import { createRng, type Rng } from '../core/rng.ts';
import { THEME_IDS } from '../world/types.ts';
import type {
  FleetEvent,
  FleetLine,
  FleetRequest,
  FleetSession,
  SessionStatus,
} from './protocol.ts';

const TOOLS = new Set(['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob']);

function weighted(rng: Rng, table: readonly (readonly [SessionStatus, number])[]): SessionStatus {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let x = rng.next() * total;
  for (const [v, w] of table) if ((x -= w) < 0) return v;
  return table[0][0];
}

/** The mock's opening snapshot (pure: tests compare two calls). */
export function mockFleet(
  seed: number,
  now: number,
): { sessions: FleetSession[]; requests: FleetRequest[] } {
  const root = createRng(seed).fork('fleet-mock');
  const sessions: FleetSession[] = [];
  const requests: FleetRequest[] = [];
  THEME_IDS.forEach((island, k) => {
    const rng = root.fork('island', k);
    const titles = rng.shuffle([...M.titles[island]]);
    const n = Math.min(rng.int(M.perIsland[0], M.perIsland[1]), titles.length);
    for (let i = 0; i < n; i++) {
      const status: SessionStatus = i === 0 ? 'running' : weighted(rng, M.statusWeights);
      const startedAt = now - Math.round(rng.range(M.startedAgoS[0], M.startedAgoS[1])) * 1000;
      const live = status === 'running' || status === 'waiting' || status === 'queued';
      const endedAt = live
        ? undefined
        : Math.min(now - 30_000, startedAt + Math.round(rng.range(M.ranS[0], M.ranS[1])) * 1000);
      const id = `mock-${island}-${i}`;
      const requestId = `req-${island}-${i}`;
      const title = titles[i];
      sessions.push({
        id,
        island,
        agent: rng.pick(M.agents[island]),
        title,
        status,
        startedAt,
        updatedAt: endedAt ?? now - Math.round(rng.range(5, 90)) * 1000,
        ...(endedAt !== undefined ? { endedAt } : {}),
        turns: rng.int(1, 30),
        requestId,
        cwd: `fleet/islands/${island}`,
        model: 'opus',
        lastLine: status === 'queued' ? undefined : rng.pick(M.lines),
        ...(status === 'error' ? { reason: 'exit 1' } : {}),
      });
      requests.push({
        id: requestId,
        title,
        island,
        rootSessionId: id,
        createdAt: startedAt,
        status: live
          ? 'open'
          : status === 'done'
            ? 'done'
            : status === 'error'
              ? 'error'
              : 'stopped',
      });
    }
  });
  return { sessions, requests };
}

export interface FleetMockOptions {
  seed: number;
  now: number;
  frozen: boolean;
}

/** Emits the snapshot at once, then (unless frozen) the line feed; returns the stop function. */
export function createFleetMock(o: FleetMockOptions, emit: (ev: FleetEvent) => void): () => void {
  const { sessions, requests } = mockFleet(o.seed, o.now);
  emit({
    type: 'snapshot',
    bridge: { version: 0, root: 'mock', startedAt: o.now },
    sessions,
    requests,
    gates: [],
  });
  if (o.frozen) return () => {};
  const running = sessions.filter((s) => s.status === 'running');
  const rng = createRng(o.seed).fork('fleet-mock').fork('feed');
  const seq = new Map<string, number>();
  let at = o.now;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = (): void => {
    const ms = Math.round(rng.range(M.feedEveryS[0], M.feedEveryS[1]) * 1000);
    timer = setTimeout(() => {
      at += ms; // feed time advances by the scripted interval, not the wall clock
      const s = rng.pick(running);
      const n = seq.get(s.id) ?? 0;
      seq.set(s.id, n + 1);
      const text = rng.pick(M.lines);
      const tool = text.split(' ')[0];
      const line: FleetLine = TOOLS.has(tool)
        ? { sessionId: s.id, seq: n, at, kind: 'tool_use', text, tool }
        : { sessionId: s.id, seq: n, at, kind: 'assistant', text };
      emit({ type: 'session', session: { ...s, lastLine: text, updatedAt: at } });
      emit({ type: 'line', line });
      tick();
    }, ms);
  };
  if (running.length) tick();
  return () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
