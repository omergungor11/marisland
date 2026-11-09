/**
 * Fleet bridge (TASK-562, `mar-plans/FLEET.md`): `pnpm bridge`. Spawns `claude -p` sessions per
 * island, reduces their stream-json to `FleetLine`s, persists raw jsonl + index, and serves
 * HTTP + WebSocket on FLEET_PORT. Node only (no three, no DOM); the wall clock is fine here.
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  FLEET_PROTOCOL_VERSION,
  FLEET_WS_PATH,
  draftTitle,
  isLive,
  type FleetCommand,
  type FleetEvent,
  type FleetIsland,
  type FleetLine,
  type FleetRequest,
  type FleetSession,
} from '../src/fleet/protocol.ts';
import { THEME_IDS } from '../src/world/types.ts';
import { firstOutOfBounds } from './bounds.ts';
import {
  CHILD_GATES_CLOSED,
  childGatesClosed,
  childStart,
  parseHandoffs,
  parseSummary,
  planGates,
  reportBackPrompt,
  roundPrompt,
  summaryOf,
  type ReportStatus,
} from './chain.ts';
import {
  islandSpawn,
  maxPerMessage,
  parseConfig,
  withEnvPort,
  parseConfigText,
  parseManifestText,
  type FleetConfig,
  type IslandManifest,
} from './config.ts';
import {
  TAIL_MAX,
  accumulate,
  claudeArgs,
  requestWithTitle,
  tailSource,
  userRecord,
  onlyCurrent,
} from './resume.ts';
import { kbDoc, kbSearch, kbTree } from './kb.ts';
import { addProject, loadProjects } from './projects.ts';
import {
  clip,
  newStreamState,
  parseTitle,
  reduceEvent,
  reduceJsonl,
  titlePrompt,
  type StreamState,
  isHookNoise,
} from './stream.ts';
import {
  indexPath,
  parseIndex,
  publicGate,
  recoverIndex,
  runPath,
  serializeIndex,
  type StoredGate,
  upsertRequest,
  upsertSession,
} from './store.ts';

const ROOT = resolve(import.meta.dirname, '..');
const RUNS = resolve(ROOT, 'fleet/runs');
const CONFIG_PATH = resolve(ROOT, 'fleet/fleet.config.json');
const MEM_LINES = 2000;
const KILL_GRACE_MS = 5000;
/** Partial-message `lastLine` updates are broadcast at most this often. */
const LAST_LINE_MS = 300;

const cfg: FleetConfig = withEnvPort(
  existsSync(CONFIG_PATH) ? parseConfigText(readFileSync(CONFIG_PATH, 'utf8')) : parseConfig({}),
  process.env,
);
mkdirSync(RUNS, { recursive: true });

const startedAt = Date.now();
const index = recoverIndex(
  parseIndex(existsSync(indexPath(RUNS)) ? readFileSync(indexPath(RUNS), 'utf8') : undefined),
  startedAt,
);
const writeIndex = (): void => {
  const tmp = `${indexPath(RUNS)}.tmp`;
  writeFileSync(tmp, serializeIndex(index));
  renameSync(tmp, indexPath(RUNS));
};
writeIndex();
// sessions recorded before M41 have no lastSeq: derive it once from the jsonl
for (const s of index.sessions) {
  const f = runPath(RUNS, s.id);
  if (s.lastSeq === undefined && existsSync(f))
    s.lastSeq = reduceJsonl(readFileSync(f, 'utf8'), s.id, s.startedAt).length - 1;
}

/* ---------------------------------------------------------------- live session runtime */

interface Run {
  session: FleetSession;
  proc?: ChildProcess;
  stream: StreamState;
  mem: FleetLine[];
  nextSeq: number;
  buf: string;
  gotResult: boolean;
  stopRequested: boolean;
  titled: boolean;
  prompt: string;
  /** Final assistant text of the current run (hand-off + `## Özet` parsing, M42). */
  lastText: string;
  finalText: string;
  /** Repo-relative write prefixes and the `git status` taken at start (bounds check). */
  writable: string[];
  baseline: string;
  lastPublish: number;
  /** turns / cost of earlier runs of this session (each run's `result` counts only itself). */
  baseTurns: number;
  baseCost: number;
}
const runs = new Map<string, Run>();
const clients = new Set<WebSocket>();

function broadcast(ev: FleetEvent): void {
  const msg = JSON.stringify(ev);
  for (const c of clients) if (c.readyState === c.OPEN) c.send(msg);
}

function publishSession(run: Run, patch: Partial<FleetSession> = {}): void {
  run.session = { ...run.session, ...patch, lastSeq: run.nextSeq - 1, updatedAt: Date.now() };
  upsertSession(index, run.session);
  writeIndex();
  broadcast({ type: 'session', session: run.session });
  const st = patch.status;
  if ((st === 'done' || st === 'error' || st === 'stopped') && run.session.parentId)
    void reportBack(run, st);
}

function publishGate(g: StoredGate): void {
  writeIndex();
  broadcast({ type: 'gate', gate: publicGate(g) });
}

function publishRequest(r: FleetRequest): void {
  upsertRequest(index, r);
  writeIndex();
  broadcast({ type: 'request', request: r });
}

function appendRaw(run: Run, text: string): void {
  appendFileSync(runPath(RUNS, run.session.id), `${text}\n`);
}

function pushLine(run: Run, l: Pick<FleetLine, 'kind' | 'text' | 'tool'>, at: number): void {
  const line: FleetLine = { sessionId: run.session.id, seq: run.nextSeq++, at, ...l };
  run.mem.push(line);
  if (run.mem.length > MEM_LINES) run.mem.splice(0, run.mem.length - MEM_LINES);
  broadcast({ type: 'line', line });
}

function linesFrom(id: string, from: number): FleetLine[] {
  const run = runs.get(id);
  const src = tailSource(run ? (run.mem[0]?.seq ?? null) : undefined, from);
  // at most TAIL_MAX lines per answer: the client asks again from the last seq + 1
  if (run && src === 'memory') return run.mem.filter((l) => l.seq >= from).slice(0, TAIL_MAX);
  const s = index.sessions.find((x) => x.id === id);
  const file = runPath(RUNS, id);
  if (!s || !existsSync(file)) return [];
  return reduceJsonl(readFileSync(file, 'utf8'), id, s.startedAt)
    .filter((l) => l.seq >= from)
    .slice(0, TAIL_MAX);
}

/* ---------------------------------------------------------------- spawn */

function handleStdoutLine(run: Run, raw: string): void {
  if (!raw.trim()) return;
  appendRaw(run, raw);
  let ev: unknown;
  try {
    ev = JSON.parse(raw);
  } catch {
    return;
  }
  const r = reduceEvent(run.stream, ev);
  const now = Date.now();
  if (run.session.status === 'queued') publishSession(run, { status: 'running' });
  for (const l of r.lines) pushLine(run, l, now);
  const patch: Partial<FleetSession> = {};
  if (r.init) {
    if (r.init.model) patch.model = r.init.model;
    if (r.init.cwd) patch.cwd = r.init.cwd;
  }
  if (r.lastLine !== undefined && r.lastLine !== run.session.lastLine) patch.lastLine = r.lastLine;
  if (r.result) {
    run.gotResult = true;
    run.finalText = r.result.text || run.lastText;
    Object.assign(patch, accumulate({ turns: run.baseTurns, costUsd: run.baseCost }, r.result));
    if (!run.stopRequested && !r.result.ok) {
      patch.status = 'error';
      patch.endedAt = now;
      patch.reason = r.result.subtype;
    }
  }
  const keys = Object.keys(patch);
  if (keys.length === 1 && keys[0] === 'lastLine' && now - run.lastPublish < LAST_LINE_MS) {
    run.session.lastLine = patch.lastLine; // partials: keep it in memory, flushed by the next publish
  } else if (keys.length) {
    run.lastPublish = now;
    publishSession(run, patch);
  }
  if (r.assistantText) run.lastText = r.assistantText;
  if (r.assistantText && !run.titled) {
    run.titled = true;
    void runTitleJob(run);
  }
  if (r.result && !run.stopRequested) {
    if (r.result.ok) void settleOk(run);
    else finishRequest(run, 'error');
  }
}

function gitStatus(): Promise<string> {
  return new Promise((ok) =>
    execFile('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: ROOT }, (_e, out) =>
      ok(out ?? ''),
    ),
  );
}

/** Successful result: the bounds check decides between `done` and `error` (FLEET.md "Kontrol"). */
async function settleOk(run: Run): Promise<void> {
  const after = await gitStatus();
  // concurrent sessions legitimately write in their own dirs: their prefixes are allowed too
  const allowed = [...runs.values()].filter((r) => isLive(r.session)).flatMap((r) => r.writable);
  const bad = firstOutOfBounds(run.baseline, after, [...run.writable, ...allowed]);
  if (run.stopRequested || !isLive(run.session)) return;
  const gated = !bad && openGates(run);
  const patch: Partial<FleetSession> = bad
    ? { status: 'error', reason: `out-of-bounds write: ${bad}`, endedAt: Date.now() }
    : gated
      ? { status: 'waiting' }
      : { status: 'done', endedAt: Date.now() };
  publishSession(run, patch);
  if (!gated) finishRequest(run, bad ? 'error' : 'done');
}

/* ---------------------------------------------------------------- chains (M42, D-149) */

const stderrLine = (run: Run, text: string): void => {
  const at = Date.now();
  appendRaw(run, JSON.stringify({ type: 'bridge_stderr', at, text }));
  pushLine(run, { kind: 'stderr', text: text.slice(0, 400) }, at);
};

function islandNames(): { theme: FleetIsland; name: string }[] {
  return THEME_IDS.flatMap((theme) => {
    try {
      return [{ theme, name: loadManifest(theme).name }];
    } catch {
      return [];
    }
  });
}

function depthOf(s: FleetSession): number {
  let d = 0;
  for (let cur: FleetSession | undefined = s; cur?.parentId && d < 20; d++)
    cur = index.sessions.find((x) => x.id === cur?.parentId);
  return d;
}

/** Hand-offs in the run's final text become one round of pending gates (caps permitting); true = parent waits. */
function openGates(run: Run): boolean {
  const s = run.session;
  const handoffs = parseHandoffs(run.finalText, islandNames());
  if (!handoffs.length) return false;
  if (childGatesClosed(s, loadManifest(s.island))) {
    pushLine(run, { kind: 'system', text: CHILD_GATES_CLOSED }, Date.now());
    return false;
  }
  const requestChildren =
    index.sessions.filter((x) => x.requestId === s.requestId && x.parentId).length +
    index.gates.filter((g) => g.requestId === s.requestId && g.status === 'pending').length;
  const plan = planGates(
    handoffs,
    { requestChildren, depth: depthOf(s), perMessage: maxPerMessage(s.island) },
    loadManifest(s.island),
  );
  for (const text of plan.rejected) stderrLine(run, text);
  if (!plan.open.length) return false;
  const summary = summaryOf(run.finalText);
  const round = randomUUID();
  const gates = plan.open.map((h): StoredGate => ({
    id: randomUUID(),
    requestId: s.requestId,
    fromSessionId: s.id,
    fromIsland: s.island,
    toIsland: h.island,
    prompt: h.prompt,
    status: 'pending',
    createdAt: Date.now(),
    parentSummary: summary.text,
    parentSummaryExplicit: summary.explicit,
    round,
  }));
  index.gates.push(...gates);
  for (const g of gates) publishGate(g);
  return true;
}

/** Gate outcome known (denied / child report): once the whole round is in, ONE resume of the parent. */
async function resolveGate(gate: StoredGate, report: string): Promise<void> {
  if (gate.status === 'denied' ? false : gate.report !== undefined) return;
  gate.report = report;
  writeIndex();
  publishGate(gate);
  const round = index.gates.filter(
    (g) => g.fromSessionId === gate.fromSessionId && g.round === gate.round,
  );
  if (round.some((g) => g.status === 'pending' || g.report === undefined)) return;
  const parent = index.sessions.find((x) => x.id === gate.fromSessionId);
  if (!parent || parent.status !== 'waiting') return;
  try {
    await sendSession(parent.id, roundPrompt(round.map((g) => g.report ?? '')), true);
  } catch (e) {
    console.warn(`fleet: could not resume ${parent.id}: ${(e as Error).message}`);
  }
}

/** Child ended: its gate gets the report (or the failure variant). */
async function reportBack(child: Run, status: ReportStatus): Promise<void> {
  const c = child.session;
  const gate = index.gates.find((g) => g.childId === c.id && g.status === 'allowed');
  if (!gate || gate.report !== undefined) return;
  const text =
    status === 'done' ? parseSummary(child.finalText) || '(rapor boş)' : (c.reason ?? '');
  await resolveGate(gate, reportBackPrompt(c.island, text, status));
}

async function decideGate(gateId: string, allow: boolean): Promise<void> {
  const gate = index.gates.find((g) => g.id === gateId);
  if (!gate) throw new Error('gate: unknown gate');
  if (gate.status !== 'pending') throw new Error('gate: already decided');
  const parent = index.sessions.find((x) => x.id === gate.fromSessionId);
  if (!parent || parent.status !== 'waiting') throw new Error('gate: parent is not waiting');
  gate.status = allow ? 'allowed' : 'denied';
  gate.answeredAt = Date.now();
  publishGate(gate);
  if (!allow) return resolveGate(gate, reportBackPrompt(gate.toIsland, '', 'denied'));
  const req = index.requests.find((x) => x.id === gate.requestId);
  try {
    const child = await startSession({
      type: 'start',
      ...childStart(gate, {
        requestTitle: req?.title ?? parent.title,
        parentSummary: gate.parentSummary ?? '',
        parentSummaryExplicit: gate.parentSummaryExplicit,
      }),
    });
    gate.childId = child.id;
    writeIndex();
    publishGate(gate);
  } catch (e) {
    await resolveGate(gate, reportBackPrompt(gate.toIsland, (e as Error).message, 'error'));
  }
}

function finishRequest(run: Run, status: FleetRequest['status']): void {
  const req = index.requests.find((x) => x.id === run.session.requestId);
  if (req && req.rootSessionId === run.session.id) publishRequest({ ...req, status });
}

let titleWarned = false;
function runTitleJob(run: Run): Promise<void> {
  return new Promise((done) => {
    const p = spawn(
      'claude',
      [
        '-p',
        '--model',
        cfg.titleModel,
        '--max-turns',
        '1',
        '--no-session-persistence',
        '--output-format',
        'json',
        titlePrompt(run.prompt),
      ],
      { cwd: tmpdir(), stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let out = '';
    const fail = (why: string): void => {
      if (!titleWarned) {
        titleWarned = true;
        console.warn(`fleet: title job failed (${why}); keeping the draft title`);
      }
      done();
    };
    p.stdout.on('data', (d: Buffer) => (out += d.toString()));
    p.on('error', (e) => fail(e.message));
    p.on('close', (code) => {
      const title = parseTitle(out);
      if (!title) return fail(`exit ${code}`);
      publishSession(run, { title });
      const req = requestWithTitle(index.requests, run.session, title);
      if (req) publishRequest(req);
      done();
    });
  });
}

function loadManifest(island: FleetIsland): IslandManifest {
  const file = resolve(ROOT, 'fleet/islands', island, 'island.json');
  if (!existsSync(file)) throw new Error(`island "${island}" has no island.json`);
  return parseManifestText(readFileSync(file, 'utf8'), island, cfg);
}

async function startSession(cmd: Extract<FleetCommand, { type: 'start' }>): Promise<FleetSession> {
  const id = randomUUID();
  const now = Date.now();
  const manifest = loadManifest(cmd.island);
  const project = cmd.project ? loadProjects(ROOT).find((p) => p.id === cmd.project) : undefined;
  if (cmd.project && !project) throw new Error(`proje bulunamadı: ${cmd.project}`);
  const sp = islandSpawn(ROOT, manifest);
  if (project) sp.args.push('--add-dir', project.dir);
  const baseline = await gitStatus();
  const title = draftTitle(cmd.prompt);
  const requestId = cmd.requestId ?? randomUUID();
  const session: FleetSession = {
    id,
    island: cmd.island,
    agent: cmd.agent ?? 'default',
    title,
    status: 'queued',
    startedAt: now,
    updatedAt: now,
    turns: 0,
    requestId,
    cwd: sp.cwd,
    ...(project ? { project: project.id } : {}),
    ...(cmd.parentId ? { parentId: cmd.parentId } : {}),
    model: manifest.model,
  };
  const run: Run = {
    session,
    stream: newStreamState(),
    mem: [],
    nextSeq: 0,
    buf: '',
    gotResult: false,
    stopRequested: false,
    titled: false,
    prompt: cmd.prompt,
    lastText: '',
    finalText: '',
    writable: sp.writable,
    baseline,
    lastPublish: 0,
    baseTurns: 0,
    baseCost: 0,
  };
  runs.set(id, run);
  upsertSession(index, session);
  if (!cmd.requestId)
    publishRequest({
      id: requestId,
      title,
      island: cmd.island,
      rootSessionId: id,
      createdAt: now,
      status: 'open',
    });
  writeIndex();
  broadcast({ type: 'session', session });

  attachProc(
    run,
    claudeArgs({
      prompt: project ? `Proje: ${project.name} — ${project.dir}\n\n${cmd.prompt}` : cmd.prompt,
      sessionId: id,
      resume: false,
      islandArgs: sp.args,
    }),
    sp.cwd,
  );
  return session;
}

function attachProc(run: Run, argv: string[], cwd: string): void {
  const proc = spawn('claude', argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  run.proc = proc;

  const guard = <T extends unknown[]>(fn: (...a: T) => void) => onlyCurrent(run, proc, fn);
  proc.stdout.on(
    'data',
    guard((d: Buffer) => {
      run.buf += d.toString();
      let nl: number;
      while ((nl = run.buf.indexOf('\n')) >= 0) {
        const raw = run.buf.slice(0, nl);
        run.buf = run.buf.slice(nl + 1);
        handleStdoutLine(run, raw);
      }
    }),
  );
  proc.stderr.on(
    'data',
    guard((d: Buffer) => {
      for (const text of d.toString().split('\n')) {
        if (!text.trim()) continue;
        const at = Date.now();
        appendRaw(run, JSON.stringify({ type: 'bridge_stderr', at, text }));
        if (!isHookNoise(text)) pushLine(run, { kind: 'stderr', text: text.slice(0, 400) }, at);
      }
    }),
  );
  proc.on(
    'error',
    guard((e: Error) => endRun(run, null, `spawn failed: ${e.message}`)),
  );
  proc.on(
    'close',
    guard((code: number | null, signal: NodeJS.Signals | null) =>
      endRun(run, code, signal ?? undefined),
    ),
  );
}

/** Follow-up turn: `claude -p --resume <id>` with the first run's flags and cwd, same record. */
async function sendSession(
  sessionId: string,
  prompt: string,
  /** The bridge's own resume of a `waiting` parent (gate decided / child reported). */
  fromChain = false,
): Promise<FleetSession> {
  const known = index.sessions.find((x) => x.id === sessionId);
  if (!known) throw new Error(`send: unknown session ${sessionId}`);
  const blocked = (s: FleetSession): string | undefined =>
    s.status === 'waiting' && !fromChain
      ? 'send: kapı bekliyor'
      : isLive(s) && !(fromChain && s.status === 'waiting')
        ? 'send: session is still running'
        : undefined;
  const why = blocked(known);
  if (why) throw new Error(why);
  if (!prompt.trim()) throw new Error('send: prompt is required');
  const sp = islandSpawn(ROOT, loadManifest(known.island));
  const knownProject = known.project
    ? loadProjects(ROOT).find((p) => p.id === known.project)
    : undefined;
  if (knownProject) sp.args.push('--add-dir', knownProject.dir); // not restored by --resume
  const baseline = await gitStatus();
  const cur = index.sessions.find((x) => x.id === sessionId);
  const raced = cur ? blocked(cur) : 'send: unknown session';
  if (!cur || raced) throw new Error(raced); // raced during the await
  let run = runs.get(sessionId);
  if (!run) {
    // after a bridge restart: rebuild seq and the cache window from the jsonl
    const file = runPath(RUNS, sessionId);
    const all = existsSync(file)
      ? reduceJsonl(readFileSync(file, 'utf8'), sessionId, cur.startedAt)
      : [];
    run = {
      session: cur,
      stream: newStreamState(),
      mem: all.slice(-MEM_LINES),
      nextSeq: all.length,
      buf: '',
      gotResult: false,
      stopRequested: false,
      titled: true,
      prompt,
      lastText: '',
      finalText: '',
      writable: sp.writable,
      baseline,
      lastPublish: 0,
      baseTurns: 0,
      baseCost: 0,
    };
    runs.set(sessionId, run);
  }
  Object.assign(run, {
    stream: newStreamState(),
    buf: '',
    gotResult: false,
    stopRequested: false,
    lastText: '',
    finalText: '',
    writable: sp.writable,
    baseline,
    lastPublish: 0,
    baseTurns: run.session.turns,
    baseCost: run.session.costUsd ?? 0,
  });
  const at = Date.now();
  appendRaw(run, userRecord(prompt, at));
  pushLine(run, { kind: 'user', text: clip(prompt) }, at);
  const { endedAt: _e, reason: _r, ...rest } = run.session;
  run.session = rest;
  publishSession(run, { status: 'running' });
  const req = index.requests.find((x) => x.id === cur.requestId);
  if (req && req.rootSessionId === sessionId && req.status !== 'open')
    publishRequest({ ...req, status: 'open' });
  attachProc(run, claudeArgs({ prompt, sessionId, resume: true, islandArgs: sp.args }), sp.cwd);
  return run.session;
}

function endRun(run: Run, code: number | null, detail?: string): void {
  if (run.buf.trim()) handleStdoutLine(run, run.buf);
  run.buf = '';
  if (!isLive(run.session)) {
    // result already settled it
    if (!run.stopRequested) return;
  }
  const now = Date.now();
  if (run.stopRequested) {
    publishSession(run, { status: 'stopped', endedAt: now, reason: 'stopped by user' });
    finishRequest(run, 'stopped');
  } else if (!run.gotResult) {
    const reason = `exit ${code ?? '?'}${detail ? ` (${detail})` : ''} without result`;
    publishSession(run, { status: 'error', endedAt: now, reason });
    finishRequest(run, 'error');
  }
}

function stopSession(id: string): boolean {
  const run = runs.get(id);
  if (!run || !run.proc || !isLive(run.session)) return false;
  run.stopRequested = true;
  run.proc.kill('SIGTERM');
  const timer = setTimeout(() => run.proc?.kill('SIGKILL'), KILL_GRACE_MS);
  run.proc.once('close', () => clearTimeout(timer));
  return true;
}

/* ---------------------------------------------------------------- commands + http */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate a `start` payload (WS command or REST body). */
function parseStart(v: unknown): Extract<FleetCommand, { type: 'start' }> | string {
  if (!isObj(v)) return 'start: body must be an object';
  if (typeof v.island !== 'string' || !(THEME_IDS as readonly string[]).includes(v.island))
    return `start: island must be one of ${THEME_IDS.join(', ')}`;
  if (typeof v.prompt !== 'string' || !v.prompt.trim()) return 'start: prompt is required';
  return {
    type: 'start',
    island: v.island as FleetIsland,
    prompt: v.prompt,
    ...(typeof v.agent === 'string' && v.agent ? { agent: v.agent } : {}),
    ...(typeof v.parentId === 'string' ? { parentId: v.parentId } : {}),
    ...(typeof v.requestId === 'string' ? { requestId: v.requestId } : {}),
    ...(typeof v.project === 'string' && v.project ? { project: v.project } : {}),
  };
}

function handleCommand(ws: WebSocket, raw: string): void {
  const reply = (ev: FleetEvent): void => ws.send(JSON.stringify(ev));
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return reply({ type: 'error', message: 'malformed JSON' });
  }
  if (!isObj(v) || typeof v.type !== 'string')
    return reply({ type: 'error', message: 'command needs a "type"' });
  switch (v.type) {
    case 'start': {
      const cmd = parseStart(v);
      if (typeof cmd === 'string') return reply({ type: 'error', message: cmd, command: 'start' });
      startSession(cmd).catch((e: Error) =>
        reply({ type: 'error', message: e.message, command: 'start' }),
      );
      return;
    }
    case 'stop':
      if (typeof v.sessionId !== 'string' || !stopSession(v.sessionId))
        reply({ type: 'error', message: 'stop: no such live session', command: 'stop' });
      return;
    case 'tail': {
      if (typeof v.sessionId !== 'string')
        return reply({ type: 'error', message: 'tail: sessionId required', command: 'tail' });
      const from = typeof v.from === 'number' ? v.from : 0;
      return reply({ type: 'lines', sessionId: v.sessionId, lines: linesFrom(v.sessionId, from) });
    }
    case 'send':
      if (typeof v.sessionId !== 'string' || typeof v.prompt !== 'string')
        return reply({
          type: 'error',
          message: 'send: sessionId and prompt required',
          command: 'send',
        });
      sendSession(v.sessionId, v.prompt).catch((e: Error) =>
        reply({ type: 'error', message: e.message, command: 'send' }),
      );
      return;
    case 'gate':
      if (typeof v.gateId !== 'string' || typeof v.allow !== 'boolean')
        return reply({
          type: 'error',
          message: 'gate: gateId and allow required',
          command: 'gate',
        });
      {
        const gateId = v.gateId;
        decideGate(gateId, v.allow).catch((e: Error) =>
          reply({ type: 'error', message: e.message, command: 'gate', gateId }),
        );
      }
      return;
    default:
      return reply({ type: 'error', message: `unknown command "${v.type}"` });
  }
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { ...CORS, 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let s = '';
    req.on('data', (d: Buffer) => {
      s += d.toString();
      if (s.length > 1_000_000) {
        fail(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => ok(s));
    req.on('error', fail);
  });
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/api/sessions')
      return json(res, 200, { sessions: index.sessions, requests: index.requests });
    if (req.method === 'GET' && url.pathname === '/api/gates')
      return json(res, 200, { gates: index.gates.map(publicGate) });
    if (req.method === 'GET' && url.pathname === '/api/kb/tree')
      return json(res, 200, kbTree(ROOT, cfg));
    if (req.method === 'GET' && url.pathname === '/api/kb/file') {
      const path = url.searchParams.get('path');
      if (!path) return json(res, 400, { error: 'path is required' });
      const doc = kbDoc(ROOT, cfg, path);
      return doc ? json(res, 200, doc) : json(res, 404, { error: 'not found' });
    }
    if (req.method === 'GET' && url.pathname === '/api/kb/search')
      return json(res, 200, { hits: kbSearch(ROOT, cfg, url.searchParams.get('q') ?? '') });
    if (req.method === 'GET' && url.pathname === '/api/projects')
      return json(res, 200, { projects: loadProjects(ROOT) });
    if (req.method === 'POST' && url.pathname === '/api/projects') {
      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return json(res, 400, { error: 'malformed JSON' });
      }
      try {
        const project = addProject(ROOT, body);
        broadcast({ type: 'project', project });
        return json(res, 201, { project });
      } catch (e) {
        return json(res, 400, { error: (e as Error).message });
      }
    }
    const m = /^\/api\/sessions\/([^/]+)\/lines$/.exec(url.pathname);
    if (req.method === 'GET' && m)
      return json(res, 200, {
        lines: linesFrom(m[1], Number(url.searchParams.get('from') ?? 0) || 0),
      });
    const sm = /^\/api\/sessions\/([^/]+)\/send$/.exec(url.pathname);
    if (req.method === 'POST' && sm) {
      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return json(res, 400, { error: 'malformed JSON' });
      }
      const prompt = isObj(body) && typeof body.prompt === 'string' ? body.prompt : '';
      try {
        return json(res, 200, { session: await sendSession(sm[1], prompt) });
      } catch (e) {
        return json(res, 400, { error: (e as Error).message });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/start') {
      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return json(res, 400, { error: 'malformed JSON' });
      }
      const cmd = parseStart(body);
      if (typeof cmd === 'string') return json(res, 400, { error: cmd });
      try {
        return json(res, 200, { session: await startSession(cmd) });
      } catch (e) {
        return json(res, 400, { error: (e as Error).message });
      }
    }
    json(res, 404, { error: 'not found' });
  })().catch((e: Error) => json(res, 500, { error: e.message }));
});

const wss = new WebSocketServer({ server, path: FLEET_WS_PATH });
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('message', (d) => handleCommand(ws, d.toString()));
  const snap: FleetEvent = {
    type: 'snapshot',
    bridge: { version: FLEET_PROTOCOL_VERSION, root: ROOT, startedAt },
    sessions: index.sessions,
    requests: index.requests,
    gates: index.gates.map(publicGate),
    projects: loadProjects(ROOT),
  };
  ws.send(JSON.stringify(snap));
});

server.listen(cfg.port, () =>
  console.info(`fleet bridge: http://localhost:${cfg.port}  ws ${FLEET_WS_PATH}`),
);

const shutdown = (): void => {
  for (const id of runs.keys()) stopSession(id);
  setTimeout(() => process.exit(0), 300);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
