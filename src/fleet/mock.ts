/**
 * `?fleet=mock` (TASK-563, M41): a deterministic fleet for UI work and shots. Sessions come from the
 * labelled RNG ('fleet-mock', seeded by `seed`); their times are offsets from the `now` passed in,
 * so the same seed and `now` give the same panel. A timer then feeds a line to a running session
 * every 2–4 s; `frozen` (capture) never starts it. Commands work offline: `tail` replays a
 * session's scripted history at once (also frozen), `start` / `send` run `FLEET_MOCK.script` over
 * ≈ 10 s of timers and end `done`, `stop` stops. The mock's clock is `now` plus its timers' delays
 * (no wall clock).
 */
import { FLEET_MOCK as M, FLEET_MOCK_PROJECTS as MP } from '../content/fleet.ts';
import { PORTRAIT_CAST } from '../content/fleet-portrait.ts';
import { THEMES } from '../content/themes.ts';
import { createRng, type Rng } from '../core/rng.ts';
import { THEME_IDS } from '../world/types.ts';
import {
  draftTitle,
  isLive,
  type FleetCommand,
  type FleetEvent,
  type FleetGate,
  type FleetIsland,
  type FleetLine,
  type FleetProject,
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

/** Scripted request chain variant (M42): both gates pending, or the Design one allowed with its child running. */
export type FleetChain = 'pending' | 'allowed';

type RawLine = Omit<FleetLine, 'sessionId' | 'seq' | 'at'>;
/** `raw` spread evenly from `from` to `to` (ms), seq dense from 0. */
const spread = (id: string, raw: readonly RawLine[], from: number, to: number): FleetLine[] =>
  raw.map((l, seq) => ({
    ...l,
    sessionId: id,
    seq,
    at: Math.round(from + ((to - from) * seq) / Math.max(1, raw.length - 1)),
  }));

const isleName = (t: FleetIsland): string => THEMES[t].displayName;

/**
 * The scripted chain (pure, no RNG: `FLEET_MOCK.chain`): a Marketing parent whose run ended with
 * two hand-off sections (one round), its gates, and in `allowed` the Design child.
 */
export function mockChain(
  now: number,
  variant: FleetChain,
): {
  sessions: FleetSession[];
  requests: FleetRequest[];
  gates: FleetGate[];
  lines: Map<string, FleetLine[]>;
} {
  const C = M.chain;
  const startedAt = now - C.parentAgoS * 1000;
  const ended = now - C.gateAgoS * 1000;
  const lines = new Map<string, FleetLine[]>();
  const cwd = (t: FleetIsland): string => `fleet/islands/${t}`;
  const pl = spread(
    C.parentId,
    [
      { kind: 'system', text: `init · opus · 18 tools · ${cwd(C.from)}` },
      { kind: 'user', text: C.title },
      ...C.parentLines,
      {
        kind: 'result',
        text: resultText(C.turns, C.costUsd, (ended - startedAt) / 1000),
      },
    ],
    startedAt,
    ended,
  );
  lines.set(C.parentId, pl);
  const sessions: FleetSession[] = [
    {
      id: C.parentId,
      island: C.from,
      agent: C.parentAgent,
      title: C.title,
      status: 'waiting',
      startedAt,
      updatedAt: ended,
      turns: C.turns,
      costUsd: C.costUsd,
      requestId: C.requestId,
      cwd: cwd(C.from),
      model: 'opus',
      lastLine: C.parentLast,
      lastSeq: pl.length - 1,
    },
  ];
  const gates: FleetGate[] = C.gates.map((g, i) => ({
    id: g.id,
    requestId: C.requestId,
    fromSessionId: C.parentId,
    fromIsland: C.from,
    toIsland: g.to,
    prompt: g.handoff,
    status: variant === 'allowed' && i === 0 ? 'allowed' : 'pending',
    createdAt: ended + i,
    ...(variant === 'allowed' && i === 0
      ? { answeredAt: now - C.childAgoS * 1000, childId: g.childId }
      : {}),
  }));
  if (variant === 'allowed') {
    const g = C.gates[0];
    const at = now - C.childAgoS * 1000;
    const last = Math.max(at, now - 20_000);
    const cl = spread(
      g.childId,
      [
        { kind: 'system', text: `init · opus · 18 tools · ${cwd(g.to)}` },
        { kind: 'user', text: C.childPrompt(C.title, isleName(C.from), g.handoff) },
        ...g.childLines,
      ],
      at,
      last,
    );
    lines.set(g.childId, cl);
    sessions.push({
      id: g.childId,
      island: g.to,
      agent: g.childAgent,
      title: draftTitle(g.handoff),
      status: 'running',
      startedAt: at,
      updatedAt: last,
      turns: 0,
      costUsd: 0,
      parentId: C.parentId,
      requestId: C.requestId,
      cwd: cwd(g.to),
      model: 'opus',
      lastLine: g.childLines[g.childLines.length - 1]?.text,
      lastSeq: cl.length - 1,
    });
  }
  const requests: FleetRequest[] = [
    {
      id: C.requestId,
      title: C.title,
      island: C.from,
      rootSessionId: C.parentId,
      createdAt: startedAt,
      status: 'open',
    },
  ];
  return { sessions, requests, gates, lines };
}

/**
 * TASK-591 cast (pure, no RNG: `PORTRAIT_CAST`): the roles and states the drawn sessions lack
 * (every role item, `error`, `queued`), appended after the chain so the drawn order is untouched.
 */
export function mockCast(now: number): { sessions: FleetSession[]; requests: FleetRequest[] } {
  const sessions: FleetSession[] = [];
  const requests: FleetRequest[] = [];
  PORTRAIT_CAST.forEach((c, k) => {
    const id = `mock-${c.island}-cast${k}`;
    const requestId = `req-${c.island}-cast${k}`;
    const startedAt = now - c.agoS * 1000;
    const live = isLive(c);
    const endedAt = live ? undefined : startedAt + c.ranS * 1000;
    sessions.push({
      id,
      island: c.island,
      agent: c.agent,
      title: c.title,
      status: c.status,
      startedAt,
      updatedAt: endedAt ?? startedAt,
      ...(endedAt !== undefined ? { endedAt } : {}),
      turns: c.turns,
      costUsd: Math.round(c.turns * 0.09 * 100) / 100,
      requestId,
      cwd: `fleet/islands/${c.island}`,
      model: 'opus',
      ...(c.lastLine ? { lastLine: c.lastLine } : {}),
      ...(c.status === 'error' ? { reason: 'exit 1' } : {}),
    });
    requests.push({
      id: requestId,
      title: c.title,
      island: c.island,
      rootSessionId: id,
      createdAt: startedAt,
      status: live
        ? 'open'
        : c.status === 'done'
          ? 'done'
          : c.status === 'error'
            ? 'error'
            : 'stopped',
    });
  });
  return { sessions, requests };
}

export interface FleetMockOptions {
  seed: number;
  now: number;
  frozen: boolean;
  /** Scripted chain variant (default `pending`). */
  chain?: FleetChain;
}

export interface FleetMock {
  /** Handle a command like the bridge would (false: unknown session). */
  command(cmd: FleetCommand): boolean;
  stop(): void;
}

/** The mock's registered projects (M43), `createdAt` offset from `now`. */
export const mockProjects = (now: number): FleetProject[] =>
  MP.projects.map(({ createdAgoD, ...p }) => ({ ...p, createdAt: now - createdAgoD * 86_400_000 }));

/** Emits the snapshot at once, then (unless frozen) the line feed. */
export function createFleetMock(o: FleetMockOptions, emit: (ev: FleetEvent) => void): FleetMock {
  const snap = mockFleet(o.seed, o.now);
  const state = new Map<string, FleetSession>();
  const lines = new Map<string, FleetLine[]>();
  for (const drawn of snap.sessions) {
    // M43: a few sessions work on a mock project (by id: no draws)
    const project = MP.sessions[drawn.id];
    const s = project ? { ...drawn, project } : drawn;
    const h = mockHistory(o.seed, s);
    lines.set(s.id, h);
    state.set(s.id, h.length ? { ...s, lastSeq: h.length - 1 } : s);
  }
  // M42: the scripted chain after the drawn sessions (no draws)
  const chain = mockChain(o.now, o.chain ?? 'pending');
  for (const s of chain.sessions) state.set(s.id, s);
  for (const [id, l] of chain.lines) lines.set(id, l);
  const gates = new Map<string, FleetGate>(chain.gates.map((g) => [g.id, g]));
  // TASK-591: the portrait cast after the chain (no draws)
  const cast = mockCast(o.now);
  for (const s of cast.sessions) {
    const h = mockHistory(o.seed, s);
    lines.set(s.id, h);
    state.set(s.id, h.length ? { ...s, lastSeq: h.length - 1 } : s);
  }
  /** Allowed gate id → its child session id (the round waits for these). */
  const gateChild = new Map<string, string>();
  for (const g of chain.gates)
    if (g.status === 'allowed') {
      const child = M.chain.gates.find((x) => x.id === g.id)?.childId;
      if (child) gateChild.set(g.id, child);
    }
  /** Gates whose answer already went back to the parent (a finished round). */
  const reported = new Set<string>();
  emit({
    type: 'snapshot',
    bridge: { version: 0, root: 'mock', startedAt: o.now },
    sessions: [...state.values()],
    requests: [...snap.requests, ...chain.requests, ...cast.requests],
    gates: [...gates.values()],
    projects: mockProjects(o.now),
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

  /** Called when a scripted run ends `done` (a child's end may finish its parent's round). */
  let onDone = (_id: string): void => {};
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
        onDone(id);
      }),
    );
  };
  let started = 0;

  /** A new running session (+ its request when it opens one) running the script. */
  const spawn = (c: {
    island: FleetIsland;
    prompt: string;
    agent?: string;
    title?: string;
    parentId?: string;
    requestId?: string;
    project?: string;
  }): string => {
    const k = started++;
    const id = `mock-${c.island}-new${k}`;
    const requestId = c.requestId ?? `req-${c.island}-new${k}`;
    const title = c.title ?? draftTitle(c.prompt);
    state.set(id, {
      id,
      island: c.island,
      agent: c.agent ?? 'default',
      title,
      status: 'running',
      startedAt: at,
      updatedAt: at,
      turns: 0,
      costUsd: 0,
      ...(c.parentId ? { parentId: c.parentId } : {}),
      ...(c.project ? { project: c.project } : {}),
      requestId,
      cwd: `fleet/islands/${c.island}`,
      model: 'opus',
    });
    if (!c.requestId)
      emit({
        type: 'request',
        request: {
          id: requestId,
          title,
          island: c.island,
          rootSessionId: id,
          createdAt: at,
          status: 'open',
        },
      });
    runScript(id, c.prompt);
    return id;
  };

  /** Resume a finished / waiting session with a follow-up prompt (the bridge's resume). */
  const resume = (s: FleetSession, prompt: string): void => {
    const next: FleetSession = { ...s, status: 'running', updatedAt: at };
    delete next.endedAt;
    delete next.reason;
    state.set(s.id, next);
    emit({ type: 'session', session: next });
    runScript(s.id, prompt);
  };

  /**
   * D-149 round: once no gate of the parent waits and every allowed child has ended, the parent
   * resumes once with all reports (denials included).
   */
  const settle = (parentId: string): void => {
    const round = [...gates.values()].filter(
      (g) => g.fromSessionId === parentId && !reported.has(g.id),
    );
    if (!round.length || round.some((g) => g.status === 'pending')) return;
    const kids = round.flatMap((g) => {
      const c = gateChild.get(g.id);
      return c ? [state.get(c)] : [];
    });
    if (kids.some((c) => !c || isLive(c))) return;
    const parent = state.get(parentId);
    if (!parent) return;
    for (const g of round) reported.add(g.id);
    const text = round
      .map((g) => {
        const name = isleName(g.toIsland);
        if (g.status === 'denied') return M.chain.denied(name);
        const scripted = M.chain.gates.find((x) => x.id === g.id)?.report;
        return M.chain.report(
          name,
          scripted ?? state.get(gateChild.get(g.id) ?? '')?.lastLine ?? '',
        );
      })
      .join('\n\n');
    resume(parent, text);
  };
  onDone = (id) => {
    const p = state.get(id)?.parentId;
    if (p) settle(p);
  };

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
          spawn(cmd);
          return true;
        }
        case 'send': {
          const s = state.get(cmd.sessionId);
          if (!s || isLive(s)) return false;
          resume(s, cmd.prompt);
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
        case 'gate': {
          const g = gates.get(cmd.gateId);
          if (!g || g.status !== 'pending') return false;
          const next: FleetGate = {
            ...g,
            status: cmd.allow ? 'allowed' : 'denied',
            answeredAt: at,
          };
          gates.set(g.id, next);
          emit({ type: 'gate', gate: next });
          if (cmd.allow) {
            const title = state.get(g.fromSessionId)?.title ?? '';
            const child = spawn({
              island: g.toIsland,
              prompt: M.chain.childPrompt(title, isleName(g.fromIsland), g.prompt),
              title: draftTitle(g.prompt),
              parentId: g.fromSessionId,
              requestId: g.requestId,
            });
            gateChild.set(g.id, child);
            const withChild: FleetGate = { ...next, childId: child };
            gates.set(g.id, withChild);
            emit({ type: 'gate', gate: withChild });
          }
          settle(g.fromSessionId);
          return true;
        }
      }
    },
    stop() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      scripted.clear();
    },
  };
}
