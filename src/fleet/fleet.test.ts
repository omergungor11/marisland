import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLEET, FLEET_MOCK, FLEET_PANEL, FLEET_STATUS, FLEET_TERM } from '../content/fleet.ts';
import { THEME_ACCENTS } from '../content/islands-ui.ts';
import { THEME_IDS } from '../world/types.ts';
import { islandNear, type CameraWorld } from '../camera/poses.ts';
import { applyFleetEvent, createFleetClient, emptyFleetState, fleetModeOf } from './client.ts';
import { createFleetMock, mockFleet, mockHistory } from './mock.ts';
import {
  compactRows,
  fleetBlocks,
  fold,
  footerText,
  panelLayout,
  rowsBelow,
  statusGlyph,
  formatDuration,
  linePlan,
  lineView,
  matchesQuery,
  panelRows,
  sessionDuration,
  syncKeyed,
  tailFrom,
} from './rows.ts';
import type { FleetEvent, FleetLine, FleetSession, SessionStatus } from './protocol.ts';

const NOW = FLEET.captureNow;
const MIN = 60_000;

const sess = (id: string, o: Partial<FleetSession> = {}): FleetSession => ({
  id,
  island: 'coding',
  agent: 'engine',
  title: id,
  status: 'done',
  startedAt: NOW - 10 * MIN,
  updatedAt: NOW - 5 * MIN,
  turns: 1,
  requestId: `r-${id}`,
  cwd: 'fleet/islands/coding',
  ...o,
});

describe('fleet: duration format', () => {
  it('az önce, minutes, hours + minutes, days', () => {
    expect(formatDuration(0)).toBe('az önce');
    expect(formatDuration(59_999)).toBe('az önce');
    expect(formatDuration(-5000)).toBe('az önce');
    expect(formatDuration(3 * MIN)).toBe('3 dk');
    expect(formatDuration(59 * MIN + 59_000)).toBe('59 dk');
    expect(formatDuration(130 * MIN)).toBe('2 sa 10 dk');
    expect(formatDuration(120 * MIN)).toBe('2 sa');
    expect(formatDuration(24 * 60 * MIN)).toBe('1 g');
    expect(formatDuration(50 * 60 * MIN)).toBe('2 g');
  });
  it('counts to now while live, freezes at endedAt', () => {
    const s = sess('a', { status: 'running', startedAt: NOW - 12 * MIN });
    expect(sessionDuration(s, NOW)).toBe('12 dk');
    expect(sessionDuration(s, NOW + MIN)).toBe('13 dk');
    const d = { ...s, status: 'done' as const, endedAt: NOW - 2 * MIN };
    expect(sessionDuration(d, NOW + 60 * MIN)).toBe('10 dk');
  });
});

describe('fleet: panel rows', () => {
  it('live first (newest start on top), then by updatedAt desc, other islands out, capped', () => {
    const all = [
      sess('old', { updatedAt: NOW - 50 * MIN }),
      sess('run1', { status: 'running', startedAt: NOW - 30 * MIN, updatedAt: NOW }),
      sess('new', { updatedAt: NOW - MIN }),
      sess('wait', { status: 'waiting', startedAt: NOW - 3 * MIN, updatedAt: NOW - 20 * MIN }),
      sess('mkt', { island: 'marketing', status: 'running' }),
      sess('mid', { updatedAt: NOW - 10 * MIN }),
    ];
    const r = panelRows(all, 'coding', 12);
    expect(r.rows.map((s) => s.id)).toEqual(['wait', 'run1', 'new', 'mid', 'old']);
    expect(r.live).toBe(2);
    expect(r.more).toBe(0);
    const c = panelRows(all, 'coding', 3);
    expect(c.rows.map((s) => s.id)).toEqual(['wait', 'run1', 'new']);
    expect(c.more).toBe(2);
    expect(panelRows(all, 'qa', 12)).toEqual({ rows: [], live: 0, more: 0 });
  });
});

describe('fleet: store events', () => {
  it('snapshot, then session upsert, then lines (deduped by seq, ordered)', () => {
    const st = emptyFleetState();
    expect(st.ready).toBe(false);
    const ev = (e: FleetEvent): void => applyFleetEvent(st, e);
    ev({
      type: 'snapshot',
      bridge: { version: 1, root: '/', startedAt: NOW },
      sessions: [sess('a'), sess('b')],
      requests: [],
      gates: [],
    });
    expect(st.ready).toBe(true);
    expect([...st.sessions.keys()]).toEqual(['a', 'b']);
    ev({ type: 'session', session: sess('a', { status: 'running', title: 'yeni' }) });
    ev({ type: 'session', session: sess('c') });
    expect(st.sessions.get('a')?.title).toBe('yeni');
    expect(st.sessions.size).toBe(3);
    const line = (seq: number) => ({
      sessionId: 'a',
      seq,
      at: NOW,
      kind: 'assistant' as const,
      text: `l${seq}`,
    });
    ev({ type: 'line', line: line(0) });
    ev({ type: 'line', line: line(2) });
    ev({ type: 'lines', sessionId: 'a', lines: [line(0), line(1), line(2), line(3)] });
    expect(st.lines.get('a')?.map((l) => l.seq)).toEqual([0, 1, 2, 3]);
    // a new snapshot replaces the session list (bridge restart)
    ev({
      type: 'snapshot',
      bridge: { version: 1, root: '/', startedAt: NOW },
      sessions: [sess('z')],
      requests: [],
      gates: [],
    });
    expect([...st.sessions.keys()]).toEqual(['z']);
  });
});

describe('fleet: mock', () => {
  it('same seed + now → same sessions; another seed differs', () => {
    expect(mockFleet(1001, NOW)).toEqual(mockFleet(1001, NOW));
    expect(mockFleet(1001, NOW)).not.toEqual(mockFleet(1002, NOW));
  });
  it('2–5 sessions on every island, one running each, started 3 min … 6 h ago', () => {
    const { sessions, requests } = mockFleet(1001, NOW);
    expect(requests.length).toBe(sessions.length);
    for (const t of THEME_IDS) {
      const mine = sessions.filter((s) => s.island === t);
      expect(mine.length).toBeGreaterThanOrEqual(FLEET_MOCK.perIsland[0]);
      expect(mine.length).toBeLessThanOrEqual(FLEET_MOCK.perIsland[1]);
      expect(mine.some((s) => s.status === 'running')).toBe(true);
    }
    for (const s of sessions) {
      expect(NOW - s.startedAt).toBeGreaterThanOrEqual(FLEET_MOCK.startedAgoS[0] * 1000);
      expect(NOW - s.startedAt).toBeLessThanOrEqual(FLEET_MOCK.startedAgoS[1] * 1000);
      if (s.endedAt !== undefined) expect(s.endedAt).toBeGreaterThanOrEqual(s.startedAt);
    }
  });
  afterEach(() => vi.useRealTimers());
  it('frozen: snapshot only; live: a line every 2–4 s on a running session', () => {
    vi.useFakeTimers();
    const frozen: FleetEvent[] = [];
    createFleetMock({ seed: 1001, now: NOW, frozen: true }, (e) => frozen.push(e));
    vi.advanceTimersByTime(60_000);
    expect(frozen.map((e) => e.type)).toEqual(['snapshot']);
    const evs: FleetEvent[] = [];
    const mock = createFleetMock({ seed: 1001, now: NOW, frozen: false }, (e) => evs.push(e));
    vi.advanceTimersByTime(20_000);
    const lines = evs.filter((e) => e.type === 'line');
    expect(lines.length).toBeGreaterThanOrEqual(5);
    expect(lines.length).toBeLessThanOrEqual(10);
    mock.stop();
    const n = evs.length;
    vi.advanceTimersByTime(20_000);
    expect(evs.length).toBe(n);
  });
});

describe('fleet: client', () => {
  it('mode from the URL value, capture and host', () => {
    expect(fleetModeOf('mock', true, 'x.github.io')).toBe('mock');
    expect(fleetModeOf('off', false, 'localhost')).toBe('off');
    expect(fleetModeOf('live', true, 'x.github.io')).toBe('live');
    expect(fleetModeOf('', false, 'localhost')).toBe('live');
    expect(fleetModeOf('', true, 'localhost')).toBe('off');
    expect(fleetModeOf('', false, 'omergungor11.github.io')).toBe('off');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  /** Fake socket: every instance fails unless `opens` says otherwise. */
  const stubSocket = (
    opens: (n: number) => boolean,
  ): { count: () => number; all: Array<{ onclose: (() => void) | null }> } => {
    let n = 0;
    const all: Array<{ onclose: (() => void) | null }> = [];
    class FakeSocket {
      static OPEN = 1;
      readyState = 0;
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      constructor() {
        const k = n++;
        all.push(this);
        setTimeout(() => {
          if (opens(k)) {
            this.readyState = 1;
            this.onopen?.();
          } else this.onclose?.();
        }, 0);
      }
      send() {}
      close() {}
    }
    vi.stubGlobal('WebSocket', FakeSocket);
    return { count: () => n, all };
  };

  it('never connected: gives up after 3 failures with one console line', () => {
    vi.useFakeTimers();
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const ws = stubSocket(() => false);
    const c = createFleetClient({ mode: 'live', seed: 1, now: NOW });
    vi.advanceTimersByTime(120_000);
    expect(ws.count()).toBe(3);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith('fleet: bridge yok');
    expect(c.connected).toBe(false);
    expect(c.ready).toBe(false);
    c.dispose();
  });

  it('was connected: keeps retrying with backoff', () => {
    vi.useFakeTimers();
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const ws = stubSocket((k) => k === 0);
    const c = createFleetClient({ mode: 'live', seed: 1, now: NOW });
    vi.advanceTimersByTime(1);
    expect(c.connected).toBe(true);
    // the bridge goes away: retries after 1, 2, 4, 8, 16, 30, 30 … s (61 s → 5 more sockets)
    ws.all[0].onclose?.();
    expect(c.connected).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(ws.count()).toBe(1 + 5);
    vi.advanceTimersByTime(60_000);
    expect(ws.count()).toBe(1 + 7);
    expect(info).not.toHaveBeenCalled();
    c.dispose();
    vi.advanceTimersByTime(120_000);
    expect(ws.count()).toBe(1 + 7);
  });
});

describe('fleet: island focus', () => {
  const world: CameraWorld = {
    centerX: 0,
    centerZ: 0,
    radius: 300,
    heightAt: () => 0,
    islands: [
      { name: 'A', cx: 0, cz: 0, radius: 50, reach: 60, peakY: 10, anchors: {} },
      { name: 'B', cx: 200, cz: 0, radius: 30, reach: 40, peakY: 10, anchors: {} },
    ],
  };
  it('nearest in reach units, null over open sea', () => {
    expect(islandNear(world, 10, 0, 1.6)?.name).toBe('A');
    expect(islandNear(world, 140, 0, 1.6)?.name).toBe('B'); // 140/60 = 2.3 vs 60/40 = 1.5
    expect(islandNear(world, 0, 500, 1.6)).toBeNull();
  });
});

describe('fleet: search (M41)', () => {
  it('folds case and Turkish letters', () => {
    expect(fold('İŞ ÇIĞ Üzüm Ödev hikâye')).toBe('is cig uzum odev hikaye');
    expect(fold('ışık')).toBe(fold('ISIK'));
  });
  it('matches every word in title / agent / island / status', () => {
    const s = sess('a', { title: 'Su shader’ında köpük', agent: 'engine', status: 'running' });
    const isle = 'Kodlama Sunny Cove';
    expect(matchesQuery(s, isle, 'SHADER')).toBe(true);
    expect(matchesQuery(s, isle, 'kopuk calisiyor')).toBe(true); // title + status label
    expect(matchesQuery(s, isle, 'ENGİNE coding')).toBe(true);
    expect(matchesQuery(s, isle, 'sunny')).toBe(true);
    expect(matchesQuery(s, isle, 'shader bitti')).toBe(false);
    expect(matchesQuery(s, isle, '  ')).toBe(true);
  });
  it('fleet blocks: island order, matching rows, live count of the whole island', () => {
    const all = [
      sess('m1', { island: 'marketing', status: 'running', title: 'post' }),
      sess('c1', { status: 'running', title: 'shader fix' }),
      sess('c2', { status: 'running', title: 'other' }),
      sess('q1', { island: 'qa', title: 'other' }),
    ];
    const b = fleetBlocks(
      all,
      ['hq', 'coding', 'marketing', 'qa'],
      12,
      (s) => s.title.includes('shader') || s.island === 'marketing',
    );
    expect(b.map((x) => [x.island, x.rows.map((s) => s.id), x.live])).toEqual([
      ['coding', ['c1'], 2],
      ['marketing', ['m1'], 1],
    ]);
  });
});

describe('fleet: terminal lines (M41)', () => {
  const L = (kind: FleetLine['kind'], text: string, tool?: string): FleetLine => ({
    sessionId: 'a',
    seq: 0,
    at: NOW,
    kind,
    text,
    ...(tool ? { tool } : {}),
  });
  it('formats each kind', () => {
    expect(lineView(L('tool_use', 'Bash pnpm test', 'Bash'))).toMatchObject({
      mark: '▸',
      tool: 'Bash',
      text: 'pnpm test',
    });
    expect(lineView(L('tool_result', '218 satır\nmore', 'Read'))).toMatchObject({
      mark: '↳',
      tool: '',
      text: '218 satır',
    });
    expect(lineView(L('assistant', 'Tamam'))).toMatchObject({ mark: '', text: 'Tamam' });
    expect(lineView(L('user', 'Bir şey yap')).mark).toBe('›');
    expect(lineView(L('stderr', 'exit 1')).mark).toBe('!');
    expect(lineView(L('result', 'done · 3 turns'))).toMatchObject({ mark: '✓', fail: false });
    expect(lineView(L('result', 'error_max_turns · 9 turns'))).toMatchObject({
      mark: '✕',
      fail: true,
    });
  });
  it('tail from: the count when dense from 0, else everything', () => {
    expect(tailFrom([])).toBe(0);
    expect(tailFrom([{ seq: 0 }, { seq: 1 }, { seq: 2 }])).toBe(3);
    expect(tailFrom([{ seq: 40 }, { seq: 41 }])).toBe(0); // joined mid-run
  });
  it('line plan: append, drop the capped top, rebuild on a gap', () => {
    expect(linePlan([], [0, 1])).toEqual({ drop: 0, from: 0 });
    expect(linePlan([0, 1], [0, 1, 2, 3])).toEqual({ drop: 0, from: 2 });
    expect(linePlan([0, 1, 2], [1, 2, 3])).toEqual({ drop: 1, from: 2 });
    expect(linePlan([5, 6], [0, 1, 2, 5, 6])).toBeNull(); // tail filled in older lines
    expect(linePlan([0, 1], [0, 1])).toEqual({ drop: 0, from: 2 });
  });
});

describe('fleet: keyed rows (M41)', () => {
  /** A fake list: nodes are objects, the "DOM" is an array, so identity and moves are observable. */
  const fake = (): {
    dom: Array<{ k: string }>;
    nodes: Map<string, { k: string }>;
    made: string[];
    sync(order: string[], keys: string[]): string[];
  } => {
    const dom: Array<{ k: string }> = [];
    const nodes = new Map<string, { k: string }>();
    const made: string[] = [];
    return {
      dom,
      nodes,
      made,
      sync: (order, keys) =>
        syncKeyed(nodes, order, keys, {
          make: (k) => (made.push(k), { k }),
          insert: (n, ref) => {
            const i = dom.indexOf(n);
            if (i >= 0) dom.splice(i, 1);
            dom.splice(ref ? dom.indexOf(ref) : dom.length, 0, n);
          },
          drop: (n) => dom.splice(dom.indexOf(n), 1),
        }),
    };
  };
  it('keeps a node across updates, moves and drops by key', () => {
    const f = fake();
    let order = f.sync([], ['a', 'b', 'c']);
    const b = f.nodes.get('b');
    order = f.sync(order, ['a', 'b', 'c']); // a feed line: nothing made, nothing moved
    expect(f.made).toEqual(['a', 'b', 'c']);
    order = f.sync(order, ['c', 'a', 'd', 'b']);
    expect(f.dom.map((n) => n.k)).toEqual(['c', 'a', 'd', 'b']);
    expect(f.nodes.get('b')).toBe(b);
    order = f.sync(order, ['d', 'b']);
    expect(f.dom.map((n) => n.k)).toEqual(['d', 'b']);
    expect(f.nodes.has('a')).toBe(false);
    expect(f.made).toEqual(['a', 'b', 'c', 'd']);
    expect(order).toEqual(['d', 'b']);
  });
});

describe('fleet: mock commands (M41)', () => {
  afterEach(() => vi.useRealTimers());
  const run = (frozen: boolean): FleetEvent[] => {
    const evs: FleetEvent[] = [];
    const m = createFleetMock({ seed: 1001, now: NOW, frozen }, (e) => evs.push(e));
    expect(
      m.command({ type: 'start', island: 'qa', prompt: 'Gece karelerini kontrol et\nayrıntı' }),
    ).toBe(true);
    vi.advanceTimersByTime(15_000);
    m.stop();
    return evs;
  };
  it('tail replays a deterministic history; lastSeq matches', () => {
    const { sessions } = mockFleet(1001, NOW);
    const s = sessions.find((x) => x.status === 'done') as FleetSession;
    const h = mockHistory(1001, s);
    expect(h).toEqual(mockHistory(1001, s));
    expect(h.map((l) => l.seq)).toEqual(h.map((_, i) => i));
    expect(h[1]).toMatchObject({ kind: 'user', text: s.title });
    expect(h.at(-1)?.kind).toBe('result');
    const evs: FleetEvent[] = [];
    const m = createFleetMock({ seed: 1001, now: NOW, frozen: true }, (e) => evs.push(e));
    const snap = evs[0].type === 'snapshot' ? evs[0].sessions.find((x) => x.id === s.id) : null;
    expect(snap?.lastSeq).toBe(h.length - 1);
    expect(m.command({ type: 'tail', sessionId: s.id, from: 2 })).toBe(true);
    const ev = evs.at(-1);
    expect(ev?.type === 'lines' && ev.lines.map((l) => l.seq)).toEqual(
      h.slice(2).map((l) => l.seq),
    );
    expect(m.command({ type: 'tail', sessionId: 'nope', from: 0 })).toBe(false);
  });
  it('start: draft title, prompt + 6 scripted lines over ~10 s, then done; deterministic', () => {
    vi.useFakeTimers();
    const evs = run(false);
    vi.useRealTimers();
    vi.useFakeTimers();
    expect(run(false)).toEqual(evs);
    const mine = evs.filter((e) => e.type === 'line' && e.line.sessionId === 'mock-qa-new0');
    const kinds = mine.map((e) => (e.type === 'line' ? e.line.kind : ''));
    expect(kinds).toEqual(['user', ...FLEET_MOCK.script.map((x) => x.kind), 'result']);
    const last = mine.at(-1);
    const span = last?.type === 'line' ? last.line.at - NOW : 0;
    expect(span).toBeGreaterThanOrEqual(8000);
    expect(span).toBeLessThanOrEqual(12_000);
    const sessions = evs.flatMap((e) =>
      e.type === 'session' && e.session.id === 'mock-qa-new0' ? [e.session] : [],
    );
    expect(sessions[0]).toMatchObject({ title: 'Gece karelerini kontrol et', status: 'running' });
    expect(sessions.at(-1)).toMatchObject({ status: 'done', turns: 1 });
  });
  it('frozen start: the session and its prompt only, no timers', () => {
    vi.useFakeTimers();
    const evs = run(true);
    const lines = evs.filter((e) => e.type === 'line');
    expect(lines.map((e) => (e.type === 'line' ? e.line.kind : ''))).toEqual(['user']);
  });
  it('send re-runs the script on a finished session and bumps turns; stop ends a live one', () => {
    vi.useFakeTimers();
    const c = createFleetClient({ mode: 'mock', seed: 1001, now: NOW });
    const done = [...c.sessions.values()].find((s) => s.status === 'done') as FleetSession;
    expect(c.send({ type: 'tail', sessionId: done.id, from: 0 })).toBe(true);
    const n = c.linesOf(done.id).length;
    expect(c.send({ type: 'send', sessionId: done.id, prompt: 'bir tur daha' })).toBe(true);
    expect(c.sessions.get(done.id)?.status).toBe('running');
    expect(c.send({ type: 'send', sessionId: done.id, prompt: 'yine' })).toBe(false); // live
    vi.advanceTimersByTime(12_000);
    expect(c.sessions.get(done.id)).toMatchObject({ status: 'done', turns: done.turns + 1 });
    expect(c.linesOf(done.id).length).toBe(n + 1 + FLEET_MOCK.script.length + 1);
    expect(c.linesOf(done.id)[n]).toMatchObject({ kind: 'user', text: 'bir tur daha', seq: n });
    const live = [...c.sessions.values()].find((s) => s.status === 'running') as FleetSession;
    expect(c.send({ type: 'stop', sessionId: live.id })).toBe(true);
    expect(c.sessions.get(live.id)?.status).toBe('stopped');
    c.dispose();
  });
});

describe('fleet: panel polish (TASK-572)', () => {
  const STATUSES: SessionStatus[] = ['queued', 'running', 'waiting', 'done', 'error', 'stopped'];
  it('gives every status its own glyph (readable without colour or pulse)', () => {
    const glyphs = STATUSES.map((st) => statusGlyph(st).glyph);
    expect(new Set(glyphs).size).toBe(STATUSES.length);
    expect(statusGlyph('running')).toMatchObject({ glyph: 'halo', color: 'var(--acc)' });
    expect(statusGlyph('waiting').glyph).toBe('ring');
    expect(statusGlyph('done').glyph).toBe('check');
    expect(statusGlyph('error').glyph).toBe('cross');
    expect(statusGlyph('stopped').glyph).toBe('square');
    for (const st of STATUSES) {
      const g = statusGlyph(st);
      expect(g.svg).toContain(`width="${FLEET_STATUS.sizePx}"`);
      expect(g.svg).toMatch(/^<svg [^>]*viewBox="0 0 12 12"/);
      if (st !== 'running') expect(g.color).toMatch(/^#[0-9A-F]{6}$/i);
    }
    // only running carries the pulsing halo
    expect(STATUSES.filter((st) => statusGlyph(st).svg.includes('mar-fhalo'))).toEqual(['running']);
  });

  it('counts rows cut by the scroll box into the "+N daha" footer', () => {
    const fade = FLEET_PANEL.fadePx; // 28: the edge is 14 px above the box bottom
    const bottoms = [60, 120, 180, 240, 300, 360];
    expect(rowsBelow(bottoms, 400, fade)).toBe(0);
    expect(rowsBelow(bottoms, 300, fade)).toBe(2); // 300 and 360 reach past 286
    expect(rowsBelow(bottoms, 314, fade)).toBe(1); // 300 sits exactly on the edge: visible
    expect(rowsBelow(bottoms, 250, fade)).toBe(3);
    expect(footerText(0, 0)).toBe('');
    expect(footerText(0, 3)).toBe('+3 daha');
    expect(footerText(2, 3)).toBe('+5 daha');
  });

  it('shrinks to the compact strip from tier 3, never over an open terminal or the fleet view', () => {
    expect(FLEET_PANEL.compact.fromTier).toBe(3);
    expect(panelLayout(1, 'coding', false)).toBe('island');
    expect(panelLayout(2, 'coding', false)).toBe('island');
    expect(panelLayout(3, 'coding', false)).toBe('compact');
    expect(panelLayout(3, 'coding', true)).toBe('term');
    expect(panelLayout(0, null, true)).toBe('term'); // tier 0 -> fleet view does not close it
    expect(panelLayout(0, null, false)).toBe('fleet');
    expect(panelLayout(3, null, false)).toBe('fleet');
    const rows = [
      sess('r1', { status: 'running' }),
      sess('d1'),
      sess('w1', { status: 'waiting' }),
      sess('r2', { status: 'running' }),
      sess('q1', { status: 'queued' }),
    ];
    expect(compactRows(rows, 2)).toEqual({ rows: [rows[0], rows[2]], more: 2 });
    expect(compactRows(rows, 9).rows.map((s) => s.id)).toEqual(['r1', 'w1', 'r2', 'q1']);
  });

  it('labels the send button with a readable colour on every accent', () => {
    const lum = (h: string): number => {
      const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      const l = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
    };
    const contrast = (a: string, b: string): number => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    for (const t of THEME_IDS)
      expect(contrast(THEME_ACCENTS[t], FLEET_TERM.onAccent[t])).toBeGreaterThanOrEqual(2.8);
    expect(FLEET_TERM.onAccent.qa).not.toBe('#FFFFFF');
    expect(FLEET_TERM.onAccent.devops).not.toBe('#FFFFFF');
  });

  it('draws department last lines without moving the mock RNG', () => {
    const { sessions } = mockFleet(1001, NOW);
    for (const s of sessions) {
      if (s.lastLine === undefined) continue;
      const pool = FLEET_MOCK.islandLines[s.island] ?? FLEET_MOCK.lines;
      expect(pool).toContain(s.lastLine);
    }
    expect(FLEET_MOCK.islandLines.coding).toBeUndefined();
    const first = (t: string): string | undefined =>
      sessions.find((s) => s.id === `mock-${t}-0`)?.lastLine;
    expect(first('marketing')).toBe('Instagram carousel taslağı 3/5');
    expect(first('devops')).toBe('Pages deploy 1 dk 12 s');
    for (const t of THEME_IDS) {
      if (!FLEET_MOCK.islandLines[t]) continue;
      const mine = sessions.filter((s) => s.island === t && s.lastLine).map((s) => s.lastLine);
      expect(new Set(mine).size).toBe(mine.length); // no repeated line on one island
    }
    // the same snapshot with the generic pool everywhere: only last lines differ
    const m = FLEET_MOCK as { islandLines: unknown };
    const saved = m.islandLines;
    m.islandLines = {};
    let generic: FleetSession[];
    try {
      generic = mockFleet(1001, NOW).sessions;
    } finally {
      m.islandLines = saved;
    }
    const strip = (s: FleetSession): Omit<FleetSession, 'lastLine'> => {
      const { lastLine: _l, ...rest } = s;
      return rest;
    };
    expect(sessions.map(strip)).toEqual(generic.map(strip));
    expect(sessions.filter((s) => s.island === 'coding')).toEqual(
      generic.filter((s) => s.island === 'coding'),
    );
  });
});
