/** Admin window Session'lar tab (TASK-630): filter / search / sort math, pure, tested without a DOM. */
import { ADMIN } from '../content/fleet.ts';
import { matchesQuery } from './rows.ts';
import { isLive, type FleetIsland, type FleetSession } from './protocol.ts';

const S = ADMIN.sessions;
const DAY = 86_400_000;

export type StatusGroup = (typeof S.status)[number][0];
export type Period = (typeof S.period)[number][0];
export type SessionSort = (typeof S.sort)[number][0];

/** `project`: `PROJECT_ALL`, `PROJECT_NONE` (sessions without one) or a `FleetProject.id`. */
export const PROJECT_ALL = '*';
export const PROJECT_NONE = '';

export interface SessionFilters {
  status: StatusGroup;
  /** Empty: every island. */
  islands: readonly FleetIsland[];
  project: string;
  period: Period;
  /** Hide hand-off children (`parentId` set). */
  rootOnly: boolean;
  sort: SessionSort;
}

export const DEFAULT_FILTERS: SessionFilters = {
  status: 'all',
  islands: [],
  project: PROJECT_ALL,
  period: 'all',
  rootOnly: false,
  sort: 'new',
};

/** Whether anything besides the sort narrows the list (the tab label then shows shown / all). */
export const filtersActive = (f: SessionFilters): boolean =>
  f.status !== 'all' ||
  f.islands.length > 0 ||
  f.project !== PROJECT_ALL ||
  f.period !== 'all' ||
  f.rootOnly;

export function statusGroup(s: Pick<FleetSession, 'status'>): Exclude<StatusGroup, 'all'> {
  if (isLive(s)) return 'live';
  return s.status === 'done' ? 'done' : 'fail';
}

/** Start of the local day holding `t` (local = UTC + `tzMin`). */
const dayStart = (t: number, tzMin: number): number => {
  const off = tzMin * 60_000;
  return Math.floor((t + off) / DAY) * DAY - off;
};

/** Text the search sees besides the session's own fields (names resolved by the caller). */
export interface SessionNames {
  /** Island display name + world island name. */
  island(s: FleetSession): string;
  project(s: FleetSession): string;
  request(s: FleetSession): string;
}

/** `matchesQuery` (every word, Turkish-folded) over the row's text: title, lastLine, agent, names, id. */
export const sessionMatches = (s: FleetSession, names: SessionNames, query: string): boolean =>
  matchesQuery(
    s,
    [names.island(s), s.lastLine ?? '', names.project(s), names.request(s), s.id].join(' '),
    query,
  );

export interface FilterCtx {
  names: SessionNames;
  now: number;
  /** Local time offset (minutes east of UTC) for the "Bugün" boundary. */
  tzMin: number;
}

type Without = 'status' | 'none';

/** Every filter (but `skip`) and the query. */
function keep(
  s: FleetSession,
  f: SessionFilters,
  query: string,
  c: FilterCtx,
  skip: Without,
): boolean {
  if (skip !== 'status' && f.status !== 'all' && statusGroup(s) !== f.status) return false;
  if (f.islands.length && !f.islands.includes(s.island)) return false;
  if (f.project !== PROJECT_ALL && (s.project ?? PROJECT_NONE) !== f.project) return false;
  if (f.period === 'today' && s.startedAt < dayStart(c.now, c.tzMin)) return false;
  if (f.period === 'week' && s.startedAt < c.now - S.weekDays * DAY) return false;
  if (f.rootOnly && s.parentId) return false;
  return sessionMatches(s, c.names, query);
}

const runMs = (s: FleetSession, now: number): number => (s.endedAt ?? now) - s.startedAt;

/** Sort key, larger first; ties: newer start, live first, then id. */
function compare(sort: SessionSort, now: number): (a: FleetSession, b: FleetSession) => number {
  const key = (s: FleetSession): number =>
    sort === 'duration'
      ? runMs(s, now)
      : sort === 'cost'
        ? (s.costUsd ?? 0)
        : sort === 'turns'
          ? s.turns
          : s.startedAt;
  return (a, b) =>
    key(b) - key(a) ||
    b.startedAt - a.startedAt ||
    Number(isLive(b)) - Number(isLive(a)) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export interface SessionList {
  /** Matching rows, sorted (all of them: the caller pages). */
  rows: FleetSession[];
  /** Sessions in the store. */
  total: number;
  /** Per status chip: matches under every other filter and the query. */
  counts: Record<StatusGroup, number>;
}

export function filterSessions(
  sessions: Iterable<FleetSession>,
  f: SessionFilters,
  query: string,
  c: FilterCtx,
): SessionList {
  const all = [...sessions];
  const counts: Record<StatusGroup, number> = { all: 0, live: 0, done: 0, fail: 0 };
  const rows: FleetSession[] = [];
  for (const s of all) {
    if (!keep(s, f, query, c, 'status')) continue;
    counts.all++;
    const g = statusGroup(s);
    counts[g]++;
    if (f.status === 'all' || g === f.status) rows.push(s);
  }
  rows.sort(compare(f.sort, c.now));
  return { rows, total: all.length, counts };
}

/** The first `pages` pages of `rows` and how many are left. */
export function pageOf<T>(rows: readonly T[], pages: number): { rows: T[]; more: number } {
  const n = Math.max(1, pages) * S.pageSize;
  return { rows: rows.slice(0, n), more: Math.max(0, rows.length - n) };
}

/** Hand-off depth: ancestors found in `sessions` (a cycle or a missing parent stops the walk). */
export function sessionDepth(s: FleetSession, sessions: ReadonlyMap<string, FleetSession>): number {
  let d = 0;
  const seen = new Set([s.id]);
  for (let p = s.parentId; p && !seen.has(p); p = sessions.get(p)?.parentId) {
    seen.add(p);
    d++;
    if (!sessions.has(p)) break;
  }
  return d;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Relative Turkish start time (`ADMIN.sessions.ago`): "az önce", "3 dk önce", "bugün 14:20",
 * "dün 14:20", "Pzt 14:20" within the week, else "12 Eki" ("12 Eki 2025" in another year).
 */
export function relTime(at: number, now: number, tzMin: number): string {
  const A = S.ago;
  const ago = now - at;
  if (ago < A.justNowS * 1000) return A.justNow;
  if (ago < A.minutesUpTo * 60_000) return A.minutes(Math.floor(ago / 60_000));
  const local = new Date(at + tzMin * 60_000);
  const hm = `${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`;
  const days = Math.round((dayStart(now, tzMin) - dayStart(at, tzMin)) / DAY);
  if (days <= 0) return `${A.today} ${hm}`;
  if (days === 1) return `${A.yesterday} ${hm}`;
  if (days < S.weekDays) return `${A.weekdays[local.getUTCDay()]} ${hm}`;
  const dm = `${local.getUTCDate()} ${A.months[local.getUTCMonth()]}`;
  const year = local.getUTCFullYear();
  return year === new Date(now + tzMin * 60_000).getUTCFullYear() ? dm : `${dm} ${year}`;
}
