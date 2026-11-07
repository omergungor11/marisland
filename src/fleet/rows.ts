/** Island panel view math (TASK-563, M41): pure, tested without a DOM. */
import {
  FLEET_DURATION as D,
  FLEET_GATE as G,
  FLEET_PANEL as P,
  FLEET_STATUS as S,
  FLEET_TERM as T,
  type StatusGlyph,
} from '../content/fleet.ts';
import {
  isLive,
  type FleetGate,
  type FleetIsland,
  type FleetLine,
  type FleetRequest,
  type FleetSession,
  type LineKind,
  type SessionStatus,
} from './protocol.ts';

/** "az önce", "3 dk", "2 sa 10 dk", "2 sa", "1 g". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < D.justNowS) return D.justNow;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${D.min}`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} ${D.hour} ${m % 60} ${D.min}` : `${h} ${D.hour}`;
  return `${Math.floor(h / 24)} ${D.day}`;
}

/** How long the session has run: to `endedAt` once it ended, else to `now`. */
export const sessionDuration = (s: FleetSession, now: number): string =>
  formatDuration((s.endedAt ?? now) - s.startedAt);

export interface PanelRows {
  rows: FleetSession[];
  live: number;
  /** Sessions past the cap. */
  more: number;
}

/**
 * The island's rows: live first (newest start on top, so the feed does not reshuffle them), then
 * the rest by `updatedAt` desc; capped at `cap`.
 */
export function panelRows(
  sessions: Iterable<FleetSession>,
  island: FleetIsland,
  cap: number,
): PanelRows {
  const live: FleetSession[] = [];
  const rest: FleetSession[] = [];
  for (const s of sessions) if (s.island === island) (isLive(s) ? live : rest).push(s);
  live.sort((a, b) => b.startedAt - a.startedAt || (a.id < b.id ? -1 : 1));
  rest.sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1));
  const all = live.concat(rest);
  return { rows: all.slice(0, cap), live: live.length, more: Math.max(0, all.length - cap) };
}

// ---- panel layout, footer, status glyphs (TASK-572) --------------------------------------------

/**
 * What the card shows: the open terminal wins (a camera move must not disturb it), then the fleet
 * view (no island focused), the compact strip at close-up tiers, else the island list.
 */
export type PanelLayout = 'term' | 'fleet' | 'compact' | 'island';
export function panelLayout(
  tier: number,
  island: FleetIsland | null,
  termOpen: boolean,
): PanelLayout {
  if (termOpen) return 'term';
  if (island === null) return 'fleet';
  return tier >= P.compact.fromTier ? 'compact' : 'island';
}

/** Compact strip rows: the live ones only, at most `max`; `more` = live rows left out. */
export function compactRows(
  rows: readonly FleetSession[],
  max: number,
): { rows: FleetSession[]; more: number } {
  const live = rows.filter(isLive);
  return { rows: live.slice(0, max), more: Math.max(0, live.length - max) };
}

/**
 * Rows the scroll box cuts: a row whose bottom reaches more than half way into the bottom fade (or
 * past the box) counts as hidden. `bottoms` in list px (offsetTop + offsetHeight), `viewBottom` =
 * scrollTop + clientHeight.
 */
export function rowsBelow(bottoms: readonly number[], viewBottom: number, fadePx: number): number {
  const edge = viewBottom - fadePx / 2;
  let n = 0;
  for (const b of bottoms) if (b > edge + 0.5) n++;
  return n;
}

/** Footer text: rows past the cap plus rows cut by the scroll; '' when everything shows. */
export const footerText = (capMore: number, cut: number): string =>
  capMore + cut > 0 ? P.more(capMore + cut) : '';

const GLYPH_SVG: Readonly<Record<StatusGlyph, (w: number) => string>> = {
  halo: () =>
    '<circle class="mar-fhalo" cx="6" cy="6" r="5.6" fill="currentColor" opacity=".3"/><circle cx="6" cy="6" r="3.3" fill="currentColor"/>',
  ring: (w) =>
    `<circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" stroke-width="${w * 0.85}"/><circle cx="6" cy="6" r="1.6" fill="currentColor"/>`,
  check: (w) =>
    `<path d="M2.3 6.5l2.5 2.5L9.8 3.4" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`,
  cross: (w) =>
    `<path d="M3.2 3.2l5.6 5.6M8.8 3.2l-5.6 5.6" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round"/>`,
  square: () => '<rect x="2.6" y="2.6" width="6.8" height="6.8" rx="1.6" fill="currentColor"/>',
  dashed: (w) =>
    `<circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" stroke-width="${w * 0.75}" stroke-dasharray="2.3 1.8"/>`,
};

/** Status glyph: its kind, colour (`var(--acc)` for the accent) and inline SVG markup. */
export function statusGlyph(status: SessionStatus): {
  glyph: StatusGlyph;
  color: string;
  svg: string;
} {
  const glyph = S.glyph[status];
  const px = S.sizePx;
  return {
    glyph,
    color: S.color[status] || 'var(--acc)',
    svg: `<svg width="${px}" height="${px}" viewBox="0 0 12 12" aria-hidden="true">${GLYPH_SVG[glyph](S.stroke)}</svg>`,
  };
}

// ---- fleet view search (M41) -----------------------------------------------------------------

const FOLD: Readonly<Record<string, string>> = {
  ı: 'i',
  İ: 'i',
  I: 'i',
  î: 'i',
  ş: 's',
  Ş: 's',
  ğ: 'g',
  Ğ: 'g',
  ü: 'u',
  Ü: 'u',
  û: 'u',
  ö: 'o',
  Ö: 'o',
  ç: 'c',
  Ç: 'c',
  â: 'a',
  Â: 'a',
};

/** Case- and Turkish-insensitive key: "İŞ Çığ" and "is cig" fold to the same string. */
export const fold = (s: string): string =>
  s.replace(/[ıİIîşŞğĞüÜûöÖçÇâÂ]/g, (c) => FOLD[c] ?? c).toLowerCase();

/** Every whitespace-separated query word occurs in title / agent / island / status. */
export function matchesQuery(s: FleetSession, islandLabel: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(
    [s.title, s.agent, s.island, islandLabel, P.statusLabel[s.status], s.status].join(' '),
  );
  return words.every((w) => hay.includes(w));
}

export interface FleetBlock {
  island: FleetIsland;
  rows: FleetSession[];
  /** Live sessions of the island (not just the matching ones). */
  live: number;
  more: number;
}

/** One block per island (in `islands` order) with its matching rows; islands without one are left out. */
export function fleetBlocks(
  sessions: Iterable<FleetSession>,
  islands: readonly FleetIsland[],
  cap: number,
  keep: (s: FleetSession) => boolean,
): FleetBlock[] {
  const all = [...sessions];
  const out: FleetBlock[] = [];
  for (const island of islands) {
    const mine = all.filter((s) => s.island === island);
    const { rows, more } = panelRows(mine.filter(keep), island, cap);
    if (rows.length) out.push({ island, rows, live: mine.filter(isLive).length, more });
  }
  return out;
}

// ---- terminal view (M41) ---------------------------------------------------------------------

export interface LineView {
  kind: LineKind;
  /** Leading mark ("▸", "↳", …; '' for assistant text). */
  mark: string;
  /** Tool name shown bold after the mark (tool_use only). */
  tool: string;
  text: string;
  /** Result bar of a failed run. */
  fail: boolean;
}

/** How a reduced line reads in the terminal: `tool_use` "Bash pnpm test" → ▸ **Bash** pnpm test. */
export function lineView(l: FleetLine): LineView {
  const v: LineView = { kind: l.kind, mark: T.marks[l.kind], tool: '', text: l.text, fail: false };
  if (l.kind === 'tool_use') {
    const tool = l.tool ?? l.text.split(' ')[0];
    v.tool = tool;
    v.text = l.text.startsWith(tool) ? l.text.slice(tool.length).trimStart() : l.text;
  } else if (l.kind === 'tool_result') {
    v.text = l.text.split('\n')[0];
  } else if (l.kind === 'result' && !l.text.startsWith('done')) {
    v.mark = T.failMark;
    v.fail = true;
  }
  return v;
}

/**
 * `tail.from` when a terminal opens: `linesOf(id).length` if the store holds the session's lines
 * dense from 0, else 0 (joined mid-run or capped: replay all, the store dedupes by seq).
 */
export function tailFrom(lines: readonly Pick<FleetLine, 'seq'>[]): number {
  const n = lines.length;
  return n && lines[0].seq === 0 && lines[n - 1].seq === n - 1 ? n : 0;
}

/**
 * Terminal body update: `drop` lines off the top (the store capped them), then append
 * `next[from..]`; null when the shown lines are not a prefix of the store's (rebuild).
 */
export function linePlan(
  shown: readonly number[],
  next: readonly number[],
): { drop: number; from: number } | null {
  let drop = 0;
  while (drop < shown.length && (next.length === 0 || shown[drop] < next[0])) drop++;
  const keep = shown.length - drop;
  if (keep > next.length) return null;
  for (let i = 0; i < keep; i++) if (shown[drop + i] !== next[i]) return null;
  return { drop, from: keep };
}

// ---- keyed rows (M41): DOM nodes survive feed updates, so hover / focus do -------------------

export interface KeyedOps<N> {
  make(key: string): N;
  /** Insert (or move) `node` before `ref` (null: at the end). */
  insert(node: N, ref: N | null): void;
  drop(node: N): void;
}

/**
 * Bring `nodes` (keyed, currently in `order`) to `keys`: unknown keys are made, vanished ones
 * dropped, the rest moved only when out of place. Returns the new order; the caller then updates
 * the nodes' text / classes in place.
 */
export function syncKeyed<N>(
  nodes: Map<string, N>,
  order: readonly string[],
  keys: readonly string[],
  ops: KeyedOps<N>,
): string[] {
  const want = new Set(keys);
  const cur: string[] = [];
  for (const k of order) {
    const n = nodes.get(k);
    if (!n) continue;
    if (want.has(k)) cur.push(k);
    else {
      ops.drop(n);
      nodes.delete(k);
    }
  }
  keys.forEach((k, i) => {
    if (cur[i] === k) return;
    let n = nodes.get(k);
    if (!n) nodes.set(k, (n = ops.make(k)));
    const ref = i < cur.length ? (nodes.get(cur[i]) ?? null) : null;
    ops.insert(n, ref);
    const j = cur.indexOf(k, i);
    if (j >= 0) cur.splice(j, 1);
    cur.splice(i, 0, k);
  });
  return [...keys];
}

// ---- request chains + hand-off gates (M42, D-149) -------------------------------------------

type Sessions = { readonly sessions: ReadonlyMap<string, FleetSession> };
type Gates = { readonly gates: ReadonlyMap<string, FleetGate> };
type Requests = { readonly requests: ReadonlyMap<string, FleetRequest> };

const byAge = (a: FleetGate, b: FleetGate): number =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1);

/** Pending gates (oldest first); with `island`: those from or to it. */
export function pendingGates(store: Gates, island?: FleetIsland | null): FleetGate[] {
  const out: FleetGate[] = [];
  for (const g of store.gates.values())
    if (g.status === 'pending' && (!island || g.fromIsland === island || g.toIsland === island))
      out.push(g);
  return out.sort(byAge);
}

/** Sessions holding at least one pending gate (their glyph shows the waiting ring). */
export function gatedSessions(store: Gates): Set<string> {
  const out = new Set<string>();
  for (const g of store.gates.values()) if (g.status === 'pending') out.add(g.fromSessionId);
  return out;
}

export interface TreeRow {
  session: FleetSession;
  /** Hand-off depth inside the request (root 0). */
  depth: number;
}

const byStart = (a: FleetSession, b: FleetSession): number =>
  a.startedAt - b.startedAt || (a.id < b.id ? -1 : 1);

/**
 * The request's sessions in tree order: a parent, then its children (by `startedAt`), depth first.
 * A session whose parent is not in the request counts as a root.
 */
export function requestTree(store: Sessions, requestId: string): TreeRow[] {
  const mine = [...store.sessions.values()].filter((s) => s.requestId === requestId);
  const ids = new Set(mine.map((s) => s.id));
  const kids = new Map<string, FleetSession[]>();
  const roots: FleetSession[] = [];
  for (const s of mine) {
    if (s.parentId && s.parentId !== s.id && ids.has(s.parentId)) {
      const k = kids.get(s.parentId) ?? [];
      kids.set(s.parentId, k);
      k.push(s);
    } else roots.push(s);
  }
  const out: TreeRow[] = [];
  const seen = new Set<string>();
  const walk = (s: FleetSession, depth: number): void => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    out.push({ session: s, depth });
    for (const c of (kids.get(s.id) ?? []).sort(byStart)) walk(c, depth + 1);
  };
  for (const r of roots.sort(byStart)) walk(r, 0);
  return out;
}

/** Request title: the request's own, else its root session's title. */
export function requestTitle(store: Sessions & Requests, requestId: string): string {
  const r = store.requests.get(requestId);
  if (r) return r.title;
  return requestTree(store, requestId)[0]?.session.title ?? '';
}

/** A chain strip node: a session, or the target island of a pending gate (no session yet). */
export interface ChainNode {
  island: FleetIsland;
  session: FleetSession | null;
  gate: FleetGate | null;
  children: ChainNode[];
}

export interface ChainView {
  requestId: string;
  title: string;
  /** Sessions in the request. */
  count: number;
  /** Tree (usually one root): children side by side under their parent; pending targets last. */
  roots: ChainNode[];
}

/**
 * The terminal's request line + chain strip for a session: null when its request has one session
 * and no gate (nothing to show).
 */
export function chainOf(store: Sessions & Gates & Requests, sessionId: string): ChainView | null {
  const s = store.sessions.get(sessionId);
  if (!s) return null;
  const rows = requestTree(store, s.requestId);
  const gates = [...store.gates.values()].filter((g) => g.requestId === s.requestId);
  if (rows.length <= 1 && !gates.length) return null;
  const nodes = new Map<string, ChainNode>();
  const roots: ChainNode[] = [];
  for (const { session } of rows) {
    const n: ChainNode = { island: session.island, session, gate: null, children: [] };
    nodes.set(session.id, n);
    const parent = session.parentId ? nodes.get(session.parentId) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  for (const g of gates.sort(byAge)) {
    if (g.status !== 'pending') continue;
    const n: ChainNode = { island: g.toIsland, session: null, gate: g, children: [] };
    const parent = nodes.get(g.fromSessionId);
    (parent ? parent.children : roots).push(n);
  }
  return {
    requestId: s.requestId,
    title: requestTitle(store, s.requestId),
    count: rows.length,
    roots,
  };
}

/** Fleet view list item: a request group label, or a session row indented by its hand-off depth. */
export type FleetItem =
  | { kind: 'req'; requestId: string; title: string }
  | { kind: 'row'; session: FleetSession; depth: number };

/**
 * One island block's rows with the sessions of multi-session requests grouped under their request
 * title (at the first row's place, in tree order); single-session requests stay plain rows.
 */
export function groupRows(rows: readonly FleetSession[], store: Sessions & Requests): FleetItem[] {
  const out: FleetItem[] = [];
  const done = new Set<string>();
  const trees = new Map<string, TreeRow[]>();
  const tree = (id: string): TreeRow[] => {
    let t = trees.get(id);
    if (!t) trees.set(id, (t = requestTree(store, id)));
    return t;
  };
  const here = new Set(rows.map((s) => s.id));
  for (const s of rows) {
    if (done.has(s.id)) continue;
    const t = tree(s.requestId);
    if (t.length <= 1) {
      out.push({ kind: 'row', session: s, depth: 0 });
      continue;
    }
    out.push({ kind: 'req', requestId: s.requestId, title: requestTitle(store, s.requestId) });
    for (const r of t)
      if (here.has(r.session.id) && !done.has(r.session.id)) {
        done.add(r.session.id);
        out.push({ kind: 'row', session: r.session, depth: r.depth });
      }
  }
  return out;
}

/**
 * Note when each gate was answered: the bridge's `answeredAt` when it sent one; else a gate seen
 * `pending` and now answered gets `now`; one never seen pending gets −Infinity (never shown).
 */
export function trackAnswers(
  gates: Iterable<FleetGate>,
  seenPending: Set<string>,
  answeredAt: Map<string, number>,
  now: number,
): void {
  for (const g of gates) {
    if (g.status === 'pending') seenPending.add(g.id);
    else if (g.answeredAt !== undefined) answeredAt.set(g.id, g.answeredAt);
    else if (!answeredAt.has(g.id)) answeredAt.set(g.id, seenPending.has(g.id) ? now : -Infinity);
  }
}

export interface GateView {
  gate: FleetGate;
  /** `card`: pending (buttons); `line`: answered, collapsed to one muted line. */
  mode: 'card' | 'line';
  /** Collapsed line text ("izin verildi · az önce"). */
  text: string;
}

export interface GateGroup {
  /** The parent session (the gates' `fromSessionId`). */
  parentId: string;
  island: FleetIsland;
  /** Pending gates of the parent in this list (> 1: the cards get a group head). */
  pending: number;
  views: GateView[];
}

/**
 * Gate cards of a list (island filter as `pendingGates`; null = all): pending cards and answers
 * younger than `FLEET_GATE.collapseS`, grouped by parent (a round of hand-offs), oldest first.
 */
export function gateGroups(
  gates: Iterable<FleetGate>,
  island: FleetIsland | null,
  answeredAt: ReadonlyMap<string, number>,
  now: number,
): GateGroup[] {
  const views: GateView[] = [];
  for (const g of [...gates].sort(byAge)) {
    if (island && g.fromIsland !== island && g.toIsland !== island) continue;
    if (g.status === 'pending') {
      views.push({ gate: g, mode: 'card', text: '' });
      continue;
    }
    const at = answeredAt.get(g.id) ?? -Infinity;
    if (now - at > G.collapseS * 1000) continue;
    views.push({
      gate: g,
      mode: 'line',
      text: `${G.answered[g.status]} · ${formatDuration(now - at)}`,
    });
  }
  const groups = new Map<string, GateGroup>();
  for (const v of views) {
    const id = v.gate.round ?? v.gate.fromSessionId;
    let gr = groups.get(id);
    if (!gr)
      groups.set(
        id,
        (gr = { parentId: v.gate.fromSessionId, island: v.gate.fromIsland, pending: 0, views: [] }),
      );
    gr.views.push(v);
    if (v.mode === 'card') gr.pending++;
  }
  return [...groups.values()];
}
