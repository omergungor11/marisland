import { FLEET_PANEL as P } from '../content/fleet.ts';
import { THEMES } from '../content/themes.ts';
import type { FleetStore } from '../fleet/client.ts';
import { isLive, type FleetSession } from '../fleet/protocol.ts';
import { fleetBlocks, matchesQuery, panelRows, sessionDuration, syncKeyed } from '../fleet/rows.ts';
import { THEME_IDS, type ThemeId } from '../world/types.ts';
import { createFleetTerm } from './fleet-term.ts';

/**
 * Fleet panel (TASK-563 M40, TASK-569 M41): a card on the left. Plain DOM + CSS (`styles.ts`
 * FLEET_PANEL_CSS), inside the HUD element so the HUD's hide / capture rules apply.
 *
 *   island view — [accent disc + glyph] Department · island name, "3 canlı"; the island's rows
 *   fleet view  — no island focused: "Filo · 7 ada", a search box, one block per island (disc,
 *                 name, "N canlı") with its rows; a row click also flies to the island
 *   rows        — status dot, agent, duration ("12 dk", ticks; frozen at `endedAt`), title (2 lines),
 *                 last line (muted); live first, then recent; "+N daha" past the cap
 *   terminal    — `fleet-term.ts`, over the list: a row / bound-bot click opens it
 *
 * Rows are keyed nodes updated in place (`syncKeyed`): a feed line rewrites a text node, so hover
 * and keyboard focus survive. `update(now)` renders when dirty, else ticks the durations once a second.
 */
export interface FleetPanel {
  el: HTMLElement;
  /** Focused island; null = the fleet view. */
  setIsland(theme: ThemeId | null, islandName: string): void;
  setVisible(visible: boolean): void;
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
type Node = { row: RowNode } | { head: HeadNode };

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
    <header class="mar-fleet-head"><span class="mar-fleet-disc"></span><span class="mar-fleet-name"></span><span class="mar-fleet-live"></span></header>
    <input class="mar-fleet-search" type="search" placeholder="${P.searchPlaceholder}" aria-label="${P.searchPlaceholder}" spellcheck="false" autocomplete="off">
    <ol class="mar-fleet-rows"></ol>
    <div class="mar-fleet-more"></div>`;
  root.appendChild(el);
  const disc = el.querySelector('.mar-fleet-disc') as HTMLElement;
  const nameEl = el.querySelector('.mar-fleet-name') as HTMLElement;
  const liveEl = el.querySelector('.mar-fleet-live') as HTMLElement;
  const search = el.querySelector('.mar-fleet-search') as HTMLInputElement;
  const list = el.querySelector('.mar-fleet-rows') as HTMLOListElement;
  const moreEl = el.querySelector('.mar-fleet-more') as HTMLElement;

  /** Focused island; null = fleet view; undefined until the first `setIsland`. */
  let theme: ThemeId | null | undefined;
  let isleName = '';
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
    focus: opts.focus ?? false,
    onChange: () => {
      el.classList.toggle('mar-fleet-termon', term.open);
      el.classList.toggle('mar-fleet-wide', theme === null || term.open);
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
  const setRow = (r: RowNode, s: FleetSession, now: number, block: boolean): void => {
    r.s = s;
    if (r.dot.dataset.s !== s.status) {
      r.dot.dataset.s = s.status;
      r.dot.style.background = P.status[s.status];
      r.dot.title = P.statusLabel[s.status];
    }
    // fleet view: each row carries its island accent (the card has none)
    if (block) r.li.style.setProperty('--acc', opts.accents[s.island]);
    else r.li.style.removeProperty('--acc');
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
    el.classList.toggle('mar-fleet-all', fleetView);
    el.classList.toggle('mar-fleet-wide', fleetView || term.open);
    search.hidden = !fleetView;
    // items: [key, session | island head]
    const items: Array<[string, FleetSession | ThemeId, number]> = [];
    let live = 0;
    let more = 0;
    if (fleetView) {
      const label = (t: ThemeId): string => `${THEMES[t].displayName} ${opts.islandName(t)}`;
      const blocks = fleetBlocks(store.sessions.values(), THEME_IDS, P.rowCap, (s) =>
        matchesQuery(s, label(s.island), query),
      );
      for (const b of blocks) {
        items.push([`h:${b.island}`, b.island, b.live]);
        for (const s of b.rows) items.push([`s:${s.id}`, s, 0]);
        more += b.more;
      }
      for (const s of store.sessions.values()) if (isLive(s)) live++;
      moreEl.textContent = more > 0 ? P.more(more) : items.length ? '' : P.searchEmpty;
      moreEl.hidden = more === 0 && items.length > 0;
    } else if (theme) {
      const r = panelRows(store.sessions.values(), theme, P.rowCap);
      for (const s of r.rows) items.push([`s:${s.id}`, s, 0]);
      live = r.live;
      moreEl.textContent = r.more > 0 ? P.more(r.more) : r.rows.length ? '' : P.empty;
      moreEl.hidden = r.more === 0 && r.rows.length > 0;
    }
    liveEl.textContent = P.liveCount(live);
    liveEl.hidden = live === 0;
    order = syncKeyed(
      nodes,
      order,
      items.map(([k]) => k),
      {
        make: (k) => (k.startsWith('h:') ? { head: makeHead() } : { row: makeRow(k.slice(2)) }),
        insert: (n, ref) => list.insertBefore(liOf(n), ref ? liOf(ref) : null),
        drop: (n) => liOf(n).remove(),
      },
    );
    for (const [k, v, n] of items) {
      const node = nodes.get(k) as Node;
      if ('row' in node) setRow(node.row, v as FleetSession, now, fleetView);
      else setHead(node.head, v as ThemeId, n);
    }
    // more rows than fit (short viewports): fade the list's bottom edge so the cut reads as scroll
    el.classList.toggle('mar-fleet-scroll', list.scrollHeight > list.clientHeight + 1);
    if (openFirst) {
      openFirst = false;
      const first = items.find(([, v]) => typeof v !== 'string' && isLive(v));
      if (first) term.show((first[1] as FleetSession).id);
    }
  };
  const liOf = (n: Node): HTMLLIElement => ('row' in n ? n.row.li : n.head.li);

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
  list.addEventListener('click', onClick);
  search.addEventListener('input', onInput);

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
    update(now) {
      if (!visible) return;
      const sec = Math.floor(now / 1000);
      if (dirty) render(now);
      else if (sec !== lastSec) {
        lastSec = sec;
        for (const n of nodes.values())
          if ('row' in n) put(n.row.dur, sessionDuration(n.row.s, now));
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
      search.removeEventListener('input', onInput);
      term.dispose();
      el.remove();
    },
  };
}
