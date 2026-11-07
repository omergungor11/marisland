/**
 * Fleet client (TASK-563, `mar-plans/FLEET.md`): the browser's view of the bridge. One store, fed
 * either by the WebSocket (`live`), by the deterministic mock (`mock`), or by nothing (`off`).
 * No three.js; the only wall-clock reads are the live socket's (the mock gets `now` passed in).
 */
import { FLEET } from '../content/fleet.ts';
import { createFleetMock, type FleetChain, type FleetMock } from './mock.ts';
import {
  FLEET_PORT,
  FLEET_WS_PATH,
  type FleetCommand,
  type FleetEvent,
  type FleetGate,
  type FleetLine,
  type FleetRequest,
  type FleetSession,
} from './protocol.ts';

export type FleetMode = 'live' | 'mock' | 'off';

export interface FleetStore {
  readonly mode: FleetMode;
  /** The socket is open (mock: always true). */
  readonly connected: boolean;
  /** A snapshot has arrived at least once (mock: at once): the panel may show. */
  readonly ready: boolean;
  readonly sessions: ReadonlyMap<string, FleetSession>;
  readonly requests: ReadonlyMap<string, FleetRequest>;
  /** Island hand-off gates (M42): pending, allowed, denied. */
  readonly gates: ReadonlyMap<string, FleetGate>;
  linesOf(sessionId: string): readonly FleetLine[];
  /** Called after every applied event and on connection changes; returns the unsubscribe. */
  subscribe(cb: () => void): () => void;
  /** Send a command to the bridge (mock: answered offline); false when it cannot (off, socket closed). */
  send(cmd: FleetCommand): boolean;
  dispose(): void;
}

/** The store's reducer, shared by the live socket and the mock (exported for tests). */
export interface FleetState {
  sessions: Map<string, FleetSession>;
  requests: Map<string, FleetRequest>;
  gates: Map<string, FleetGate>;
  lines: Map<string, FleetLine[]>;
  ready: boolean;
}

export const emptyFleetState = (): FleetState => ({
  sessions: new Map(),
  requests: new Map(),
  gates: new Map(),
  lines: new Map(),
  ready: false,
});

function addLines(st: FleetState, sessionId: string, add: readonly FleetLine[]): void {
  let arr = st.lines.get(sessionId);
  if (!arr) st.lines.set(sessionId, (arr = []));
  for (const l of add) {
    const last = arr[arr.length - 1];
    if (!last || l.seq > last.seq) arr.push(l);
    else if (!arr.some((x) => x.seq === l.seq)) {
      arr.push(l);
      arr.sort((a, b) => a.seq - b.seq);
    }
  }
  if (arr.length > FLEET.linesCap) arr.splice(0, arr.length - FLEET.linesCap);
}

export function applyFleetEvent(st: FleetState, ev: FleetEvent): void {
  switch (ev.type) {
    case 'snapshot':
      st.sessions.clear();
      st.requests.clear();
      st.gates.clear();
      for (const s of ev.sessions) st.sessions.set(s.id, s);
      for (const r of ev.requests) st.requests.set(r.id, r);
      for (const g of ev.gates ?? []) st.gates.set(g.id, g);
      st.ready = true;
      break;
    case 'session':
      st.sessions.set(ev.session.id, ev.session);
      break;
    case 'request':
      st.requests.set(ev.request.id, ev.request);
      break;
    case 'line':
      addLines(st, ev.line.sessionId, [ev.line]);
      break;
    case 'lines':
      addLines(st, ev.sessionId, ev.lines);
      break;
    case 'error':
      console.warn(`fleet: ${ev.message}`);
      break;
    case 'gate':
      st.gates.set(ev.gate.id, ev.gate);
      break;
  }
}

/** `params.fleet` → mode; unset → live on a local host, off in capture and on public hosts. */
export function fleetModeOf(raw: '' | FleetMode, capture: boolean, hostname: string): FleetMode {
  if (raw) return raw;
  return !capture && FLEET.liveHosts.includes(hostname) ? 'live' : 'off';
}

export interface FleetClientOptions {
  mode: FleetMode;
  seed: number;
  /** Wall clock at page open (ms); the mock's session times are offsets from it. */
  now: number;
  /** Mock: no feed timer (capture), so a shot sees the same sessions at any warm-up. */
  frozen?: boolean;
  /** Mock: the scripted request chain's variant (M42, default `pending`). */
  chain?: FleetChain;
  /** Live: socket URL (default `ws://localhost:5174/ws`). */
  url?: string;
}

export function createFleetClient(o: FleetClientOptions): FleetStore {
  const st = emptyFleetState();
  const subs = new Set<() => void>();
  const notify = (): void => {
    for (const cb of subs) cb();
  };
  const apply = (ev: FleetEvent): void => {
    applyFleetEvent(st, ev);
    notify();
  };
  let connected = o.mode === 'mock';
  let ws: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let mock: FleetMock | null = null;

  if (o.mode === 'mock')
    mock = createFleetMock(
      { seed: o.seed, now: o.now, frozen: o.frozen ?? false, chain: o.chain ?? 'pending' },
      apply,
    );
  else if (o.mode === 'live') {
    const url = o.url ?? `ws://localhost:${FLEET_PORT}${FLEET_WS_PATH}`;
    const R = FLEET.reconnect;
    let wait: number = R.firstMs;
    let failures = 0;
    let everOpen = false;
    const fail = (): void => {
      ws = null;
      if (connected) {
        connected = false;
        notify();
      }
      if (disposed) return;
      if (!everOpen && ++failures >= R.giveUpAfter) {
        console.info('fleet: bridge yok');
        return;
      }
      retry = setTimeout(connect, wait);
      wait = Math.min(wait * 2, R.maxMs);
    };
    const connect = (): void => {
      retry = null;
      let sock: WebSocket;
      try {
        sock = new WebSocket(url);
      } catch {
        fail();
        return;
      }
      ws = sock;
      sock.onopen = () => {
        everOpen = true;
        failures = 0;
        wait = R.firstMs;
        connected = true;
        notify();
      };
      sock.onmessage = (e) => {
        let ev: FleetEvent;
        try {
          ev = JSON.parse(String(e.data)) as FleetEvent;
        } catch {
          return;
        }
        apply(ev);
      };
      sock.onclose = fail;
    };
    connect();
  }

  return {
    mode: o.mode,
    get connected() {
      return connected;
    },
    get ready() {
      return st.ready;
    },
    sessions: st.sessions,
    requests: st.requests,
    gates: st.gates,
    linesOf: (id) => st.lines.get(id) ?? [],
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    send(cmd) {
      if (mock) return mock.command(cmd);
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(cmd));
      return true;
    },
    dispose() {
      disposed = true;
      if (retry) clearTimeout(retry);
      retry = null;
      if (ws) {
        ws.onclose = null;
        ws.close();
        ws = null;
      }
      mock?.stop();
      mock = null;
      subs.clear();
    },
  };
}
