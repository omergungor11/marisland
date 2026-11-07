import { FLEET_GATE as G, FLEET_PANEL as P } from '../content/fleet.ts';
import { THEMES } from '../content/themes.ts';
import type { FleetStore } from '../fleet/client.ts';
import { isLive, type FleetSession, type SessionStatus } from '../fleet/protocol.ts';
import {
  compactRows,
  fleetBlocks,
  footerText,
  gatedSessions,
  gateGroups,
  groupRows,
  matchesQuery,
  panelLayout,
  panelRows,
  pendingGates,
  requestTitle,
  rowsBelow,
  sessionDuration,
  statusGlyph,
  syncKeyed,
  trackAnswers,
  type GateGroup,
} from '../fleet/rows.ts';
import { THEME_IDS, type ThemeId } from '../world/types.ts';
import { createFleetTerm } from './fleet-term.ts';

/**
 * Fleet panel (TASK-563 M40, TASK-569 M41): a card on the left. Plain DOM + CSS (`styles.ts`
 * FLEET_PANEL_CSS), inside the HUD element so the HUD's hide / capture rules apply.
 *
 *   island view — [accent disc + glyph] Department · island name, "3 canlı"; the island's rows
 *   fleet view  — no island focused: "Filo · 7 ada", a search box, one block per island (disc,
 *                 name, "N canlı") with its rows; a row click also flies to the island
 *   rows        — status glyph, agent, duration ("12 dk", ticks; frozen at `endedAt`), title (2 lines),
 *                 last line (muted); live first, then recent; "+N daha" counts rows past the cap and
 *                 rows the scroll cuts (pinned under the fade)
 *   gates       — M42: hand-off gate cards over the list ("Marketing → Design", prompt, İzin ver /
 *                 Reddet → `gate` command), grouped by parent when it has > 1; an answer collapses
 *                 to one muted line for `FLEET_GATE.collapseS`. The fleet header counts pending ones
 *   requests    — fleet view: a multi-session request's rows sit under its title, children indented
 *   compact     — tier >= `FLEET_PANEL.compact.fromTier`: a narrow strip, the live rows' titles only
 *   terminal    — `fleet-term.ts`, over the list (opaque, the list behind it is hidden): a row /
 *                 bound-bot click opens it; island / tier changes leave it alone
 *
 * Rows are keyed nodes updated in place (`syncKeyed`): a feed line rewrites a text node, so hover
 * and keyboard focus survive. `update(now)` renders when dirty, else ticks the durations once a second.
 */
export interface FleetPanel {
  el: HTMLElement;
  /** Focused island; null = the fleet view. */
  setIsland(theme: ThemeId | null, islandName: string): void;
  setVisible(visible: boolean): void;
  /** Camera tier: close-up tiers shrink the card to the compact strip. */
  setTier(tier: number): void;
  /** Layout box (px, HUD space) while shown, else null: the overview labels keep clear of it. */
  box(): { l: number; t: number; r: number; b: number } | null;
  /** Per frame, cheap: wall-clock ms (fixed under capture). */
  update(nowMs: number): void;
  /** Open a session's terminal. */
  open(sessionId: string): void;
  /** New-session prompt box for an island (a bot without a session was clicked). */
  draft(island: ThemeId): void;
  /** Fleet view search text (also what the box shows). */
  setQuery(q: string): void;
  /** Open the first live row of the view on the next render (capture preset `fleetOpen`). */
  openFirstLive(): void;
  dispose(): void;
}

export interface FleetPanelOptions {
  accents: Readonly<Record<ThemeId, string>>;
  iconFor(theme: ThemeId): string;
  /** The world's island of a department (fleet view block names, draft header). */
  islandName(theme: ThemeId): string;
  /** Fleet view row click: fly the camera to that island (the terminal opens as well). */
  onFly?(theme: ThemeId): void;
  /** Interactive (not capture): a draft focuses its prompt box. */
  focus?: boolean;
}

interface RowNode {
  li: HTMLLIElement;
  btn: HTMLButtonElement;
  dot: HTMLElement;
  agent: HTMLElement;
  dur: HTMLElement;
  title: HTMLElement;
  line: HTMLElement;
  s: FleetSession;
}
interface HeadNode {
  li: HTMLLIElement;
  name: HTMLElement;
  live: HTMLElement;
}
type Node = { row: RowNode } | { head: HeadNode } | { req: HTMLLIElement };
/** A list item: island head (fleet view), request group label, session row (hand-off depth). */
type Item =
  | { k: string; head: ThemeId; live: number }
  | { k: string; req: string }
  | { k: string; s: FleetSession; depth: number };

const put = (e: HTMLElement, text: string): void => {
  if (e.textContent !== text) e.textContent = text;
};
const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

export function createFleetPanel(
  root: HTMLElement,
  store: FleetStore,
  opts: FleetPanelOptions,
): FleetPanel {
  const el = document.createElement('section');
  el.className = 'mar-fleet';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <header class="mar-fleet-head"><span class="mar-fleet-disc"></span><span class="mar-fleet-name"></span><span class="mar-fleet-gatecount" hidden></span><span class="mar-fleet-live"></span></header>
    <input class="mar-fleet-search" type="search" placeholder="${P.searchPlaceholder}" aria-label="${P.searchPlaceholder}" spellcheck="false" autocomplete="off">
    <div class="mar-fgates"></div>
    <ol class="mar-fleet-rows"></ol>
    <div class="mar-fleet-more"></div>`;
  root.appendChild(el);
  const disc = el.querySelector('.mar-fleet-disc') as HTMLElement;
  const nameEl = el.querySelector('.mar-fleet-name') as HTMLElement;
  const liveEl = el.querySelector('.mar-fleet-live') as HTMLElement;
  const search = el.querySelector('.mar-fleet-search') as HTMLInputElement;
  const list = el.querySelector('.mar-fleet-rows') as HTMLOListElement;
  const moreEl = el.querySelector('.mar-fleet-more') as HTMLElement;
  const gateCount = el.querySelector('.mar-fleet-gatecount') as HTMLElement;
  const gatesEl = el.querySelector('.mar-fgates') as HTMLElement;
  /** M42: gates seen pending, when each answer was seen, answers sent and not yet echoed. */
  const seenPending = new Set<string>();
  const answeredAt = new Map<string, number>();
  const asked = new Set<string>();
  let gatesKey = '';

  /** Focused island; null = fleet view; undefined until the first `setIsland`. */
  let theme: ThemeId | null | undefined;
  let isleName = '';
  let tier = 0;
  let visible = false;
  let dirty = true;
  let query = '';
  let openFirst = false;
  let lastSec = NaN;
  const nodes = new Map<string, Node>();
  let order: string[] = [];

  const term = createFleetTerm(el, store, {
    accents: opts.accents,
    islandName: opts.islandName,
    iconFor: opts.iconFor,
    focus: opts.focus ?? false,
    onChange: () => {
      el.classList.toggle('mar-fleet-termon', term.open);
      el.classList.toggle('mar-fleet-wide', theme === null || term.open);
      if (term.open) el.classList.remove('mar-fleet-compact');
      dirty = true;
    },
  });

  const makeRow = (id: string): RowNode => {
    const li = document.createElement('li');
    li.innerHTML = `<button class="mar-frow" type="button" data-id="${esc(id)}"><i class="mar-fdot"></i><span class="mar-fagent"></span><span class="mar-fdur"></span><span class="mar-ftitle"></span><span class="mar-fline"></span></button>`;
    const btn = li.firstElementChild as HTMLButtonElement;
    const [dot, agent, dur, title, line] = btn.children as unknown as HTMLElement[];
    return { li, btn, dot, agent, dur, title, line, s: store.sessions.get(id) as FleetSession };
  };
  const makeHead = (): HeadNode => {
    const li = document.createElement('li');
    li.className = 'mar-fblock';
    li.innerHTML =
      '<span class="mar-fleet-disc"></span><span class="mar-fblock-name"></span><span class="mar-fleet-live"></span>';
    return {
      li,
      name: li.children[1] as HTMLElement,
      live: li.children[2] as HTMLElement,
    };
  };
  const makeReq = (): HTMLLIElement => {
    const li = document.createElement('li');
    li.className = 'mar-freq';
    return li;
  };
  const setRow = (
    r: RowNode,
    s: FleetSession,
    now: number,
    block: boolean,
    status: SessionStatus,
    depth: number,
  ): void => {
    r.s = s;
    if (r.dot.dataset.s !== status) {
      const g = statusGlyph(status);
      r.dot.dataset.s = status;
      r.dot.innerHTML = g.svg;
      r.dot.style.color = g.color;
      r.dot.title = P.statusLabel[status];
    }
    // fleet view: each row carries its island accent (the card has none)
    if (block) r.li.style.setProperty('--acc', opts.accents[s.island]);
    else r.li.style.removeProperty('--acc');
    const d = depth ? String(depth) : '';
    if ((r.li.dataset.depth ?? '') !== d) {
      if (d) {
        r.li.dataset.depth = d;
        r.li.style.setProperty('--depth', d);
      } else {
        delete r.li.dataset.depth;
        r.li.style.removeProperty('--depth');
      }
    }
    put(r.agent, s.agent);
    put(r.dur, sessionDuration(s, now));
    put(r.title, s.title);
    put(r.line, s.lastLine ?? '');
    r.line.hidden = !s.lastLine;
    const pressed = String(s.id === term.sessionId);
    if (r.btn.getAttribute('aria-pressed') !== pressed) r.btn.setAttribute('aria-pressed', pressed);
  };
  const setHead = (h: HeadNode, t: ThemeId, live: number): void => {
    if (!h.li.dataset.t) {
      h.li.dataset.t = t;
      h.li.style.setProperty('--acc', opts.accents[t]);
      const d = h.li.firstElementChild as HTMLElement;
      d.style.background = opts.accents[t];
      d.innerHTML = opts.iconFor(t);
      h.name.innerHTML = `${esc(THEMES[t].displayName)}<span class="mar-fleet-isle">${esc(opts.islandName(t))}</span>`;
    }
    put(h.live, P.liveCount(live));
    h.live.hidden = live === 0;
  };

  const render = (now: number): void => {
    dirty = false;
    lastSec = Math.floor(now / 1000);
    const fleetView = theme === null;
    const layout = panelLayout(tier, theme ?? null, term.open);
    el.classList.toggle('mar-fleet-all', fleetView);
    el.classList.toggle('mar-fleet-wide', fleetView || term.open);
    el.classList.toggle('mar-fleet-compact', layout === 'compact');
    search.hidden = !fleetView;
    const items: Item[] = [];
    let live = 0;
    let more = 0;
    if (fleetView) {
      const label = (s: FleetSession): string =>
        `${THEMES[s.island].displayName} ${opts.islandName(s.island)} ${requestTitle(store, s.requestId)}`;
      const blocks = fleetBlocks(store.sessions.values(), THEME_IDS, P.rowCap, (s) =>
        matchesQuery(s, label(s), query),
      );
      for (const b of blocks) {
        items.push({ k: `h:${b.island}`, head: b.island, live: b.live });
        // M42: a multi-session request's rows under its title, children indented
        for (const it of groupRows(b.rows, store))
          items.push(
            it.kind === 'req'
              ? { k: `r:${b.island}:${it.requestId}`, req: G.group(it.title) }
              : { k: `s:${it.session.id}`, s: it.session, depth: it.depth },
          );
        more += b.more;
      }
      for (const s of store.sessions.values()) if (isLive(s)) live++;
      emptyText = items.length ? '' : P.searchEmpty;
    } else if (theme) {
      const r = panelRows(store.sessions.values(), theme, P.rowCap);
      const c = layout === 'compact' ? compactRows(r.rows, P.compact.maxRows) : null;
      for (const s of c ? c.rows : r.rows) items.push({ k: `s:${s.id}`, s, depth: 0 });
      live = r.live;
      more = c ? c.more : r.more;
      emptyText = r.rows.length ? '' : P.empty;
    }
    capMore = more;
    liveEl.textContent = P.liveCount(live);
    liveEl.hidden = live === 0;
    const pending = pendingGates(store).length;
    put(gateCount, G.count(pending));
    gateCount.hidden = !fleetView || pending === 0;
    renderGates(now);
    const gated = gatedSessions(store);
    order = syncKeyed(
      nodes,
      order,
      items.map((it) => it.k),
      {
        make: (k) =>
          k.startsWith('h:')
            ? { head: makeHead() }
            : k.startsWith('r:')
              ? { req: makeReq() }
              : { row: makeRow(k.slice(2)) },
        insert: (n, ref) => list.insertBefore(liOf(n), ref ? liOf(ref) : null),
        drop: (n) => liOf(n).remove(),
      },
    );
    for (const it of items) {
      const node = nodes.get(it.k) as Node;
      if ('row' in node && 's' in it)
        setRow(
          node.row,
          it.s,
          now,
          fleetView,
          // a pending gate shows the waiting ring even before the session event says so
          gated.has(it.s.id) && isLive(it.s) ? 'waiting' : it.s.status,
          it.depth,
        );
      else if ('head' in node && 'head' in it) setHead(node.head, it.head, it.live);
      else if ('req' in node && 'req' in it) put(node.req, it.req);
    }
    measure();
    if (openFirst) {
      openFirst = false;
      const first = items.find((it) => 's' in it && isLive(it.s));
      if (first && 's' in first) term.show(first.s.id);
    }
  };
  const liOf = (n: Node): HTMLLIElement =>
    'row' in n ? n.row.li : 'head' in n ? n.head.li : n.req;

  // ---- gate cards (M42) ------------------------------------------------------------------------
  const discHtml = (t: ThemeId, cls: string): string =>
    `<span class="${cls}" style="background:${opts.accents[t]}">${opts.iconFor(t)}</span>`;
  const gateHtml = (gr: GateGroup): string => {
    const grouped = gr.pending > 1;
    const from = THEMES[gr.island].displayName;
    const parent = store.sessions.get(gr.parentId);
    const head = grouped
      ? `<div class="mar-fgroup-head">${discHtml(gr.island, 'mar-fgate-disc')}<b>${esc(from)} · ${esc(G.count(gr.pending))}</b>${parent ? `<span>${esc(parent.title)}</span>` : ''}</div>`
      : '';
    const body = gr.views
      .map(({ gate: g, mode, text }) => {
        const to = THEMES[g.toIsland].displayName;
        const route = `${grouped ? '' : `${discHtml(g.fromIsland, 'mar-fgate-disc')}<b>${esc(from)}</b>`}<i class="mar-fgate-arrow">${G.arrow}</i>${discHtml(g.toIsland, 'mar-fgate-disc')}<b>${esc(to)}</b>`;
        if (mode === 'line')
          return `<div class="mar-fgate-done" data-s="${g.status}">${esc(from)} ${G.arrow} ${esc(to)} · ${esc(text)}</div>`;
        const off = asked.has(g.id) ? ' disabled' : '';
        const acts = `<div class="mar-fgate-acts"><button class="mar-fgate-allow" type="button" data-g="${esc(g.id)}" data-allow="1"${off}>${G.allow}</button><button class="mar-fgate-deny" type="button" data-g="${esc(g.id)}" data-allow="0"${off}>${G.deny}</button></div>`;
        const prompt = `<p class="mar-fgate-prompt">${esc(g.prompt)}</p>`;
        // a round (> 1 gate of one parent): compact cards, the buttons on the route line
        return grouped
          ? `<article class="mar-fgate" data-g="${esc(g.id)}"><div class="mar-fgate-route">${route}${acts}</div>${prompt}</article>`
          : `<article class="mar-fgate" data-g="${esc(g.id)}"><div class="mar-fgate-route">${route}</div><div class="mar-fgate-label">${esc(G.pending)}</div>${prompt}${acts}</article>`;
      })
      .join('');
    return `<div class="mar-fgroup${grouped ? ' mar-fgroup-on' : ''}">${head}${body}</div>`;
  };
  /** Rebuilt only when what it shows changed (a pending card's buttons keep hover / focus). */
  function renderGates(now: number): void {
    trackAnswers(store.gates.values(), seenPending, answeredAt, now);
    const groups =
      theme === undefined ? [] : gateGroups(store.gates.values(), theme, answeredAt, now);
    const key = JSON.stringify(
      groups.map((gr) => gr.views.map((v) => [v.gate.id, v.mode, v.text, asked.has(v.gate.id)])),
    );
    if (key === gatesKey) return;
    gatesKey = key;
    gatesEl.innerHTML = groups.map(gateHtml).join('');
  }
  let capMore = 0;
  let emptyText = '';
  /**
   * More rows than fit (short viewports): fade the list's bottom edge so the cut reads as scroll,
   * and count the cut rows into the "+N daha" footer below the fade. Layout reads: render, the
   * once-a-second tick and scroll only.
   */
  function measure(): void {
    const scroll = list.scrollHeight > list.clientHeight + 1;
    el.classList.toggle('mar-fleet-scroll', scroll);
    let cut = 0;
    if (scroll) {
      const bottoms: number[] = [];
      for (const k of order) {
        const n = nodes.get(k);
        if (n && 'row' in n) bottoms.push(n.row.li.offsetTop + n.row.li.offsetHeight);
      }
      cut = rowsBelow(bottoms, list.scrollTop + list.clientHeight, P.fadePx);
    }
    const text = footerText(capMore, cut) || emptyText;
    put(moreEl, text);
    moreEl.hidden = text === '';
  }

  const unsub = store.subscribe(() => {
    dirty = true;
    term.touch();
  });
  const onClick = (e: MouseEvent): void => {
    const id = (e.target as Element).closest<HTMLButtonElement>('.mar-frow')?.dataset.id;
    const s = id ? store.sessions.get(id) : undefined;
    if (!s) return;
    if (theme === null) opts.onFly?.(s.island);
    term.show(s.id);
  };
  const onInput = (): void => {
    query = search.value;
    dirty = true;
  };
  const onScroll = (): void => measure();
  const onGate = (e: MouseEvent): void => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-g]');
    const gateId = b?.dataset.g;
    if (!b || !gateId || b.disabled) return;
    if (store.send({ type: 'gate', gateId, allow: b.dataset.allow === '1' })) asked.add(gateId);
    dirty = true;
  };
  list.addEventListener('click', onClick);
  list.addEventListener('scroll', onScroll, { passive: true });
  search.addEventListener('input', onInput);
  gatesEl.addEventListener('click', onGate);

  return {
    el,
    setIsland(t, islandName) {
      if (t === theme && isleName === islandName) return;
      theme = t;
      isleName = islandName;
      if (t) {
        const accent = opts.accents[t];
        el.style.setProperty('--acc', accent);
        disc.style.background = accent;
        disc.innerHTML = opts.iconFor(t);
        nameEl.innerHTML = `${esc(THEMES[t].displayName)}<span class="mar-fleet-isle">${esc(islandName)}</span>`;
      } else {
        el.style.removeProperty('--acc');
        disc.style.background = '';
        disc.innerHTML = '';
        nameEl.innerHTML = `${esc(P.fleetTitle)}<span class="mar-fleet-isle">${esc(P.fleetIslands(THEME_IDS.length))}</span>`;
      }
      dirty = true;
    },
    setVisible(v) {
      if (v === visible) return;
      visible = v;
      el.classList.toggle('mar-fleet-on', v);
      el.setAttribute('aria-hidden', String(!v));
    },
    setTier(t) {
      if (t === tier) return;
      const was = panelLayout(tier, theme ?? null, false);
      tier = t;
      if (panelLayout(tier, theme ?? null, false) !== was) dirty = true;
    },
    box() {
      if (!visible || !el.offsetWidth) return null;
      const l = el.offsetLeft;
      const t = el.offsetTop;
      return { l, t, r: l + el.offsetWidth, b: t + el.offsetHeight };
    },
    update(now) {
      if (!visible) return;
      const sec = Math.floor(now / 1000);
      if (dirty) render(now);
      else if (sec !== lastSec) {
        lastSec = sec;
        for (const n of nodes.values())
          if ('row' in n) put(n.row.dur, sessionDuration(n.row.s, now));
        renderGates(now); // collapsed answers age and expire
        measure(); // a resize can cut rows
      }
      // after the list: a row it opened (`openFirstLive`) renders in the same frame
      term.update(now);
    },
    open(id) {
      if (store.sessions.has(id)) term.show(id);
    },
    draft(island) {
      term.draft(island);
    },
    setQuery(q) {
      query = search.value = q;
      dirty = true;
    },
    openFirstLive() {
      openFirst = true;
      dirty = true;
    },
    dispose() {
      unsub();
      list.removeEventListener('click', onClick);
      list.removeEventListener('scroll', onScroll);
      search.removeEventListener('input', onInput);
      gatesEl.removeEventListener('click', onGate);
      term.dispose();
      el.remove();
    },
  };
}
