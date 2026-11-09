import { describe, expect, it } from 'vitest';
import { ADMIN } from '../content/fleet.ts';
import type { FleetSession } from './protocol.ts';
import {
  DEFAULT_FILTERS,
  filterSessions,
  filtersActive,
  pageOf,
  PROJECT_NONE,
  relTime,
  sessionDepth,
  statusGroup,
  type FilterCtx,
  type SessionFilters,
} from './sessions.ts';

const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;
/** 2026-11-07 12:00 UTC = 15:00 at UTC+3. */
const NOW = Date.UTC(2026, 10, 7, 12);
const TZ = 180;

const mk = (id: string, p: Partial<FleetSession> = {}): FleetSession => ({
  id,
  island: 'coding',
  agent: 'default',
  title: `Session ${id}`,
  status: 'done',
  startedAt: NOW - H,
  updatedAt: NOW - 30 * MIN,
  endedAt: NOW - 30 * MIN,
  turns: 5,
  costUsd: 0.5,
  requestId: `req-${id}`,
  cwd: `fleet/islands/${p.island ?? 'coding'}`,
  ...p,
});

const ctx: FilterCtx = {
  names: {
    island: (s) => (s.island === 'coding' ? 'Kod Adası Mercan' : 'Tasarım Atölyesi Lale'),
    project: (s) => (s.project === 'mar' ? 'Marisland' : ''),
    request: (s) => (s.requestId === 'req-x' ? 'Bülten kampanyası' : ''),
  },
  now: NOW,
  tzMin: TZ,
};
const f = (p: Partial<SessionFilters> = {}): SessionFilters => ({ ...DEFAULT_FILTERS, ...p });
const ids = (ss: readonly FleetSession[]): string[] => ss.map((s) => s.id);

const SESSIONS = [
  mk('a', { status: 'running', startedAt: NOW - 10 * MIN, endedAt: undefined }),
  mk('b', { status: 'done', startedAt: NOW - 2 * H, island: 'design', project: 'mar' }),
  mk('c', {
    status: 'error',
    startedAt: NOW - 20 * H,
    turns: 30,
    costUsd: 3,
    title: 'Session c: prop batcher sızıntısı',
  }),
  mk('d', { status: 'stopped', startedAt: NOW - 3 * D, parentId: 'b', island: 'design' }),
  mk('e', { status: 'waiting', startedAt: NOW - 10 * D, endedAt: undefined, project: 'mar' }),
  mk('f', {
    status: 'queued',
    startedAt: NOW - 5 * MIN,
    endedAt: undefined,
    requestId: 'req-x',
    lastLine: 'Grep köpük bandı',
  }),
];

describe('Session’lar filters (TASK-630)', () => {
  it('groups statuses: live / done / fail', () => {
    expect(
      ['queued', 'running', 'waiting'].map((s) => statusGroup({ status: s as never })),
    ).toEqual(['live', 'live', 'live']);
    expect(statusGroup({ status: 'done' })).toBe('done');
    expect(statusGroup({ status: 'error' })).toBe('fail');
    expect(statusGroup({ status: 'stopped' })).toBe('fail');
  });

  it('status chip: rows of the group; counts ignore the status filter itself', () => {
    const r = filterSessions(SESSIONS, f({ status: 'fail' }), '', ctx);
    expect(ids(r.rows).sort()).toEqual(['c', 'd']);
    expect(r.counts).toEqual({ all: 6, live: 3, done: 1, fail: 2 });
    expect(r.total).toBe(6);
    // other filters do narrow the counts
    const d = filterSessions(SESSIONS, f({ islands: ['design'] }), '', ctx);
    expect(d.counts).toEqual({ all: 2, live: 0, done: 1, fail: 1 });
  });

  it('islands: multi-select, empty = all', () => {
    expect(filterSessions(SESSIONS, f({ islands: [] }), '', ctx).rows).toHaveLength(6);
    expect(ids(filterSessions(SESSIONS, f({ islands: ['design'] }), '', ctx).rows)).toEqual([
      'b',
      'd',
    ]);
    expect(
      filterSessions(SESSIONS, f({ islands: ['design', 'coding'] }), '', ctx).rows,
    ).toHaveLength(6);
    expect(filterSessions(SESSIONS, f({ islands: ['hq'] }), '', ctx).rows).toHaveLength(0);
  });

  it('project: an id, or none', () => {
    expect(ids(filterSessions(SESSIONS, f({ project: 'mar' }), '', ctx).rows)).toEqual(['b', 'e']);
    expect(ids(filterSessions(SESSIONS, f({ project: PROJECT_NONE }), '', ctx).rows)).toEqual([
      'f',
      'a',
      'c',
      'd',
    ]);
  });

  it('period: today is the local day (UTC+3), the week reaches back 7 × 24 h', () => {
    // local midnight = 2026-11-07 00:00 +03 = 11-06 21:00 UTC (NOW − 15 h): c (−20 h) is yesterday
    expect(ids(filterSessions(SESSIONS, f({ period: 'today' }), '', ctx).rows)).toEqual([
      'f',
      'a',
      'b',
    ]);
    expect(ids(filterSessions(SESSIONS, f({ period: 'week' }), '', ctx).rows)).toEqual([
      'f',
      'a',
      'b',
      'c',
      'd',
    ]);
    const edge = [
      mk('in', { startedAt: NOW - 15 * H }),
      mk('out', { startedAt: NOW - 15 * H - 1 }),
      mk('w', { startedAt: NOW - 7 * D }),
      mk('wo', { startedAt: NOW - 7 * D - 1 }),
    ];
    expect(ids(filterSessions(edge, f({ period: 'today' }), '', ctx).rows)).toEqual(['in']);
    expect(ids(filterSessions(edge, f({ period: 'week' }), '', ctx).rows)).toEqual([
      'in',
      'out',
      'w',
    ]);
    // the same instant is "today" in UTC: midnight there is NOW − 12 h
    const utc = { ...ctx, tzMin: 0 };
    expect(filterSessions(edge, f({ period: 'today' }), '', utc).rows).toHaveLength(0);
  });

  it('yalnız kök hides hand-off children', () => {
    expect(ids(filterSessions(SESSIONS, f({ rootOnly: true }), '', ctx).rows)).not.toContain('d');
  });

  it('filters combine with AND; filtersActive ignores the sort', () => {
    const r = filterSessions(
      SESSIONS,
      f({ islands: ['coding'], status: 'live', project: 'mar' }),
      '',
      ctx,
    );
    expect(ids(r.rows)).toEqual(['e']);
    expect(filtersActive(f({ sort: 'cost' }))).toBe(false);
    expect(filtersActive(f({ rootOnly: true }))).toBe(true);
    expect(filtersActive(f({ project: PROJECT_NONE }))).toBe(true);
  });

  it('query: title, lastLine, agent, island names, project, request title, id prefix (folded)', () => {
    const q = (text: string): string[] => ids(filterSessions(SESSIONS, f(), text, ctx).rows);
    expect(q('session')).toHaveLength(6);
    expect(q('sizinti')).toEqual(['c']); // title, folded
    expect(
      ids(
        filterSessions([mk('abc123', { title: 'x' }), mk('zz', { title: 'y' })], f(), 'abc1', ctx)
          .rows,
      ),
    ).toEqual(['abc123']);
    expect(q('KÖPÜK')).toEqual(['f']); // lastLine, Turkish-folded
    expect(q('mercan')).toEqual(['f', 'a', 'c', 'e']); // world island name
    expect(q('atolye')).toEqual(['b', 'd']); // display name, folded
    expect(q('marisland')).toEqual(['b', 'e']);
    expect(q('bulten')).toEqual(['f']); // request title
    expect(q('default')).toHaveLength(6);
    expect(q('nope')).toEqual([]);
    expect(q('lale stopped')).toEqual(['d']); // words AND, status too
  });

  it('sorts: newest first, then by duration / cost / turns (ties newest)', () => {
    const s = (sort: SessionFilters['sort']): string[] =>
      ids(filterSessions(SESSIONS, f({ sort }), '', ctx).rows);
    expect(s('new')).toEqual(['f', 'a', 'b', 'c', 'd', 'e']);
    // live rows run to now: e (10 d) longest; d ran 3 d − 30 min
    expect(s('duration')).toEqual(['e', 'd', 'c', 'b', 'a', 'f']);
    expect(s('cost')[0]).toBe('c');
    expect(s('turns')).toEqual(['c', 'f', 'a', 'b', 'd', 'e']);
    // same start: the live one first
    const tie = [
      mk('x1', { startedAt: NOW - H }),
      mk('x2', { startedAt: NOW - H, status: 'running' }),
    ];
    expect(ids(filterSessions(tie, f(), '', ctx).rows)).toEqual(['x2', 'x1']);
  });

  it('pages of ADMIN.sessions.pageSize', () => {
    const n = ADMIN.sessions.pageSize;
    const rows = Array.from({ length: n * 2 + 5 }, (_, i) => i);
    expect(pageOf(rows, 1)).toEqual({ rows: rows.slice(0, n), more: n + 5 });
    expect(pageOf(rows, 2).more).toBe(5);
    expect(pageOf(rows, 3)).toEqual({ rows, more: 0 });
    expect(pageOf(rows, 0).rows).toHaveLength(n);
  });

  it('hand-off depth walks known parents, stops on a cycle', () => {
    const m = new Map<string, FleetSession>();
    const add = (s: FleetSession): void => void m.set(s.id, s);
    add(mk('r'));
    add(mk('c1', { parentId: 'r' }));
    add(mk('c2', { parentId: 'c1' }));
    add(mk('lost', { parentId: 'gone' }));
    add(mk('y1', { parentId: 'y2' }));
    add(mk('y2', { parentId: 'y1' }));
    expect(sessionDepth(m.get('r') as FleetSession, m)).toBe(0);
    expect(sessionDepth(m.get('c2') as FleetSession, m)).toBe(2);
    expect(sessionDepth(m.get('lost') as FleetSession, m)).toBe(1);
    expect(sessionDepth(m.get('y1') as FleetSession, m)).toBe(1);
  });
});

describe('relTime (TASK-630)', () => {
  const r = (ago: number, tz = TZ): string => relTime(NOW - ago, NOW, tz);
  it('minutes, then the local clock with today / yesterday / weekday / date', () => {
    expect(r(20_000)).toBe('az önce');
    expect(r(3 * MIN)).toBe('3 dk önce');
    expect(r(59 * MIN)).toBe('59 dk önce');
    // NOW = Saturday 15:00 local
    expect(r(H + 40 * MIN)).toBe('bugün 13:20');
    expect(r(15 * H)).toBe('bugün 00:00');
    expect(r(15 * H + MIN)).toBe('dün 23:59');
    expect(r(D + 40 * MIN)).toBe('dün 14:20');
    expect(r(3 * D)).toBe('Çar 15:00');
    expect(r(6 * D)).toBe('Paz 15:00');
    expect(r(7 * D)).toBe('31 Eki');
    expect(r(400 * D)).toBe('3 Eki 2025');
    expect(r(H, 0)).toBe('bugün 11:00');
    expect(r(-5000)).toBe('az önce'); // clock skew: a start "in the future"
  });
});
