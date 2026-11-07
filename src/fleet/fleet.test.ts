import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLEET, FLEET_MOCK } from '../content/fleet.ts';
import { THEME_IDS } from '../world/types.ts';
import { islandNear, type CameraWorld } from '../camera/poses.ts';
import { applyFleetEvent, createFleetClient, emptyFleetState, fleetModeOf } from './client.ts';
import { createFleetMock, mockFleet } from './mock.ts';
import { formatDuration, panelRows, sessionDuration } from './rows.ts';
import type { FleetEvent, FleetSession } from './protocol.ts';

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
    const stop = createFleetMock({ seed: 1001, now: NOW, frozen: false }, (e) => evs.push(e));
    vi.advanceTimersByTime(20_000);
    const lines = evs.filter((e) => e.type === 'line');
    expect(lines.length).toBeGreaterThanOrEqual(5);
    expect(lines.length).toBeLessThanOrEqual(10);
    stop();
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
