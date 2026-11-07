/**
 * `?fleet=mock` (TASK-563, M41): a deterministic fleet for UI work and shots. Sessions come from the
 * labelled RNG ('fleet-mock', seeded by `seed`); their times are offsets from the `now` passed in,
 * so the same seed and `now` give the same panel. A timer then feeds a line to a running session
 * every 2–4 s; `frozen` (capture) never starts it. Commands work offline: `tail` replays a
 * session's scripted history at once (also frozen), `start` / `send` run `FLEET_MOCK.script` over
 * ≈ 10 s of timers and end `done`, `stop` stops. The mock's clock is `now` plus its timers' delays
 * (no wall clock).
 */
import { FLEET_MOCK as M } from '../content/fleet.ts';
import { createRng, type Rng } from '../core/rng.ts';
import { THEME_IDS } from '../world/types.ts';
import {
  draftTitle,
  isLive,
  type FleetCommand,
  type FleetEvent,
  type FleetLine,
  type FleetRequest,
  type FleetSession,
  type SessionStatus,
} from './protocol.ts';

const TOOLS = new Set(['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob']);

/**
 * A snapshot row's last line on a department island: its first (running) row shows the pool's
 * headline, a line an earlier row of the island shows moves on to the next unused one (no draw).
 * Coding (no own pool) keeps the drawn line.
 */
function lastLine(
  island: FleetSession['island'],
  i: number,
  drawn: string,
  used: Set<string>,
): string {
  const own = M.islandLines[island];
  if (!own) return drawn;
  let k = i === 0 ? 0 : own.indexOf(drawn);
  for (let n = 0; n < own.length && used.has(own[k]); n++) k = (k + 1) % own.length;
  used.add(own[k]);
  return own[k];
}

/** The island's line pool (its department lines, else the dev tool lines): one draw either way. */
const linesOf = (island: FleetSession['island']): readonly string[] =>
  M.islandLines[island] ?? M.lines;

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
    const usedLines = new Set<string>();
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
      // draw order = the M40 object literal (agent, updatedAt, turns), so the sessions did not change
      const agent = rng.pick(M.agents[island]);
      const updatedAt = endedAt ?? now - Math.round(rng.range(5, 90)) * 1000;
      const turns = rng.int(1, 30);
      // own stream (fork, not draws): adding the cost did not shift the sessions above
      const cost = root.fork(`cost:${id}`).range(M.costPerTurn[0], M.costPerTurn[1]);
      sessions.push({
        id,
        island,
        agent,
        title,
        status,
        startedAt,
        updatedAt,
        ...(endedAt !== undefined ? { endedAt } : {}),
        turns,
        costUsd: Math.round(cost * turns * 100) / 100,
        requestId,
        cwd: `fleet/islands/${island}`,
        model: 'opus',
        lastLine:
          status === 'queued'
            ? undefined
            : lastLine(island, i, rng.pick(linesOf(island)), usedLines),
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

/** A tool / assistant line from an island pool (+ its result line for a tool). */
function poolLines(text: string, rng: Rng): Array<Omit<FleetLine, 'sessionId' | 'seq' | 'at'>> {
  const tool = text.split(' ')[0];
  if (!TOOLS.has(tool)) return [{ kind: 'assistant', text }];
  const res = M.results[tool];
  return [
    { kind: 'tool_use', text, tool },
    ...(res ? [{ kind: 'tool_result' as const, text: rng.pick(res), tool }] : []),
  ];
}

/** Server-style result bar text (`server/stream.ts` formatResult). */
const resultText = (turns: number, cost: number, s: number): string =>
  `done · ${turns} turns · $${cost.toFixed(4)} · ${s.toFixed(1)} s`;

/**
 * The replayed history of a snapshot session (pure, own stream per id): init, the prompt, a few
 * steps; a finished one ends with its result bar, a failed one with stderr.
 */
export function mockHistory(seed: number, s: FleetSession): FleetLine[] {
  if (s.status === 'queued') return [];
  const rng = createRng(seed).fork('fleet-mock').fork(`history:${s.id}`);
  const raw: Array<Omit<FleetLine, 'sessionId' | 'seq' | 'at'>> = [
    { kind: 'system', text: `init · ${s.model ?? 'opus'} · 18 tools · ${s.cwd}` },
    { kind: 'user', text: s.title },
  ];
  const n = rng.int(M.historySteps[0], M.historySteps[1]);
  for (let i = 0; i < n; i++) raw.push(...poolLines(rng.pick(linesOf(s.island)), rng));
  if (s.status === 'error') raw.push({ kind: 'stderr', text: M.errorLine });
  else if (s.status === 'done')
    raw.push({
      kind: 'result',
      text: resultText(s.turns, s.costUsd ?? 0, ((s.endedAt ?? s.updatedAt) - s.startedAt) / 1000),
    });
  const end = s.endedAt ?? s.updatedAt;
  const step = (end - s.startedAt) / raw.length;
  return raw.map((l, seq) => ({
    ...l,
    sessionId: s.id,
    seq,
    at: Math.round(s.startedAt + step * seq),
  }));
}

export interface FleetMockOptions {
  seed: number;
  now: number;
  frozen: boolean;
}

export interface FleetMock {
  /** Handle a command like the bridge would (false: unknown session). */
  command(cmd: FleetCommand): boolean;
  stop(): void;
}

/** Emits the snapshot at once, then (unless frozen) the line feed. */
export function createFleetMock(o: FleetMockOptions, emit: (ev: FleetEvent) => void): FleetMock {
  const snap = mockFleet(o.seed, o.now);
  const state = new Map<string, FleetSession>();
  const lines = new Map<string, FleetLine[]>();
  for (const s of snap.sessions) {
    const h = mockHistory(o.seed, s);
    lines.set(s.id, h);
    state.set(s.id, h.length ? { ...s, lastSeq: h.length - 1 } : s);
  }
  emit({
    type: 'snapshot',
    bridge: { version: 0, root: 'mock', startedAt: o.now },
    sessions: [...state.values()],
    requests: snap.requests,
    gates: [],
  });
  let at = o.now;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  /** `fn` after `ms`; the mock clock moves to the scheduled time when it fires. */
  const later = (ms: number, fn: () => void): ReturnType<typeof setTimeout> => {
    const due = at + ms;
    const t = setTimeout(() => {
      timers.delete(t);
      at = Math.max(at, due);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };
  const upsert = (id: string, patch: Partial<FleetSession>): FleetSession => {
    const s = { ...(state.get(id) as FleetSession), ...patch };
    state.set(id, s);
    emit({ type: 'session', session: s });
    return s;
  };
  const push = (id: string, l: Omit<FleetLine, 'sessionId' | 'seq' | 'at'>): void => {
    const arr = lines.get(id) ?? [];
    lines.set(id, arr);
    const line: FleetLine = { ...l, sessionId: id, seq: arr.length, at };
    arr.push(line);
    emit({ type: 'line', line });
    upsert(id, {
      lastSeq: line.seq,
      updatedAt: at,
      ...(l.kind === 'system' ? {} : { lastLine: l.text }),
    });
  };

  /** Session id → its script's pending timers. */
  const scripted = new Map<string, Array<ReturnType<typeof setTimeout>>>();

  // the original feed: a pool line on a snapshot running session every 2–4 s
  if (!o.frozen) {
    const running = snap.sessions.filter((s) => s.status === 'running');
    const rng = createRng(o.seed).fork('fleet-mock').fork('feed');
    const tick = (): void => {
      const ms = Math.round(rng.range(M.feedEveryS[0], M.feedEveryS[1]) * 1000);
      later(ms, () => {
        const s = rng.pick(running);
        const text = rng.pick(linesOf(s.island));
        const tool = text.split(' ')[0];
        // a stopped or scripted session gets no pool lines
        if (state.get(s.id)?.status === 'running' && !scripted.has(s.id))
          push(
            s.id,
            TOOLS.has(tool) ? { kind: 'tool_use', text, tool } : { kind: 'assistant', text },
          );
        tick();
      });
    };
    if (running.length) tick();
  }

  const runScript = (id: string, prompt: string): void => {
    push(id, { kind: 'user', text: prompt });
    if (o.frozen) return;
    const base = at;
    const mine: Array<ReturnType<typeof setTimeout>> = [];
    scripted.set(id, mine);
    let t = 0;
    for (const step of M.script) {
      t += step.afterS * 1000;
      mine.push(
        later(t, () =>
          push(id, { kind: step.kind, text: step.text, ...(step.tool ? { tool: step.tool } : {}) }),
        ),
      );
    }
    t += M.doneAfterS * 1000;
    mine.push(
      later(t, () => {
        scripted.delete(id);
        const s = state.get(id) as FleetSession;
        const turns = s.turns + 1;
        const cost = Math.round(((s.costUsd ?? 0) + M.scriptCostUsd) * 100) / 100;
        push(id, { kind: 'result', text: resultText(turns, cost, (at - base) / 1000) });
        upsert(id, { status: 'done', turns, costUsd: cost, endedAt: at });
      }),
    );
  };
  let started = 0;

  return {
    command(cmd) {
      switch (cmd.type) {
        case 'tail': {
          const arr = lines.get(cmd.sessionId);
          if (!arr) return false;
          emit({
            type: 'lines',
            sessionId: cmd.sessionId,
            lines: arr.filter((l) => l.seq >= cmd.from),
          });
          return true;
        }
        case 'start': {
          const k = started++;
          const id = `mock-${cmd.island}-new${k}`;
          const requestId = `req-${cmd.island}-new${k}`;
          const title = draftTitle(cmd.prompt);
          state.set(id, {
            id,
            island: cmd.island,
            agent: cmd.agent ?? 'default',
            title,
            status: 'running',
            startedAt: at,
            updatedAt: at,
            turns: 0,
            costUsd: 0,
            requestId,
            cwd: `fleet/islands/${cmd.island}`,
            model: 'opus',
          });
          emit({
            type: 'request',
            request: {
              id: requestId,
              title,
              island: cmd.island,
              rootSessionId: id,
              createdAt: at,
              status: 'open',
            },
          });
          runScript(id, cmd.prompt);
          return true;
        }
        case 'send': {
          const s = state.get(cmd.sessionId);
          if (!s || isLive(s)) return false;
          const next: FleetSession = { ...s, status: 'running', updatedAt: at };
          delete next.endedAt;
          delete next.reason;
          state.set(s.id, next);
          emit({ type: 'session', session: next });
          runScript(s.id, cmd.prompt);
          return true;
        }
        case 'stop': {
          const s = state.get(cmd.sessionId);
          if (!s || !isLive(s)) return false;
          for (const t of scripted.get(s.id) ?? []) {
            clearTimeout(t);
            timers.delete(t);
          }
          scripted.delete(s.id);
          upsert(s.id, { status: 'stopped', endedAt: at, reason: 'durduruldu' });
          return true;
        }
        case 'gate':
          return false; // M42
      }
    },
    stop() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      scripted.clear();
    },
  };
}
