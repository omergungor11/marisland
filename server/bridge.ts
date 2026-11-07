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
  islandSpawn,
  parseConfig,
  parseConfigText,
  parseManifestText,
  type FleetConfig,
  type IslandManifest,
} from './config.ts';
import {
  newStreamState,
  parseTitle,
  reduceEvent,
  reduceJsonl,
  titlePrompt,
  type StreamState,
} from './stream.ts';
import {
  indexPath,
  parseIndex,
  recoverIndex,
  runPath,
  serializeIndex,
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

const cfg: FleetConfig = existsSync(CONFIG_PATH)
  ? parseConfigText(readFileSync(CONFIG_PATH, 'utf8'))
  : parseConfig({});
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
  /** Repo-relative write prefixes and the `git status` taken at start (bounds check). */
  writable: string[];
  baseline: string;
  lastPublish: number;
}
const runs = new Map<string, Run>();
const clients = new Set<WebSocket>();

function broadcast(ev: FleetEvent): void {
  const msg = JSON.stringify(ev);
  for (const c of clients) if (c.readyState === c.OPEN) c.send(msg);
}

function publishSession(run: Run, patch: Partial<FleetSession> = {}): void {
  run.session = { ...run.session, ...patch, updatedAt: Date.now() };
  upsertSession(index, run.session);
  writeIndex();
  broadcast({ type: 'session', session: run.session });
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
  if (run && (run.mem.length === 0 || run.mem[0].seq <= from))
    return run.mem.filter((l) => l.seq >= from);
  const s = index.sessions.find((x) => x.id === id);
  const file = runPath(RUNS, id);
  if (!s || !existsSync(file)) return [];
  return reduceJsonl(readFileSync(file, 'utf8'), id, s.startedAt).filter((l) => l.seq >= from);
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
    patch.turns = r.result.turns;
    if (r.result.costUsd !== undefined) patch.costUsd = r.result.costUsd;
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
  const patch: Partial<FleetSession> = bad
    ? { status: 'error', reason: `out-of-bounds write: ${bad}`, endedAt: Date.now() }
    : { status: 'done', endedAt: Date.now() };
  publishSession(run, patch);
  finishRequest(run, bad ? 'error' : 'done');
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
  const sp = islandSpawn(ROOT, manifest);
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
    writable: sp.writable,
    baseline,
    lastPublish: 0,
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

  const argv = [
    '-p',
    cmd.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--session-id',
    id,
    '--permission-mode',
    'acceptEdits',
    '--permission-prompts',
    'none',
    ...sp.args,
  ];
  const proc = spawn('claude', argv, { cwd: sp.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  run.proc = proc;

  proc.stdout.on('data', (d: Buffer) => {
    run.buf += d.toString();
    let nl: number;
    while ((nl = run.buf.indexOf('\n')) >= 0) {
      const raw = run.buf.slice(0, nl);
      run.buf = run.buf.slice(nl + 1);
      handleStdoutLine(run, raw);
    }
  });
  proc.stderr.on('data', (d: Buffer) => {
    for (const text of d.toString().split('\n')) {
      if (!text.trim()) continue;
      const at = Date.now();
      appendRaw(run, JSON.stringify({ type: 'bridge_stderr', at, text }));
      pushLine(run, { kind: 'stderr', text: text.slice(0, 400) }, at);
    }
  });
  proc.on('error', (e) => endRun(run, null, `spawn failed: ${e.message}`));
  proc.on('close', (code, signal) => endRun(run, code, signal ?? undefined));
  return session;
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
      // TODO(M41): `claude -p --resume <id>` appended to the same record.
      return reply({
        type: 'error',
        message: 'M41: send (resume) is not implemented yet',
        command: 'send',
      });
    case 'gate':
      return reply({
        type: 'error',
        message: 'M42: gates are not implemented yet',
        command: 'gate',
      });
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
    const m = /^\/api\/sessions\/([^/]+)\/lines$/.exec(url.pathname);
    if (req.method === 'GET' && m)
      return json(res, 200, {
        lines: linesFrom(m[1], Number(url.searchParams.get('from') ?? 0) || 0),
      });
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
    gates: [],
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
