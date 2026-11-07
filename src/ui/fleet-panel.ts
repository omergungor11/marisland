import { FLEET_PANEL as P } from '../content/fleet.ts';
import { THEMES } from '../content/themes.ts';
import type { FleetStore } from '../fleet/client.ts';
import type { FleetSession } from '../fleet/protocol.ts';
import { panelRows, sessionDuration } from '../fleet/rows.ts';
import type { ThemeId } from '../world/types.ts';

/**
 * Island panel (TASK-563, M40): the focused island's sessions on the left. Plain DOM + CSS
 * (`styles.ts` FLEET_PANEL_CSS), inside the HUD element so the HUD's hide / capture rules apply.
 *
 *   header — [accent disc + glyph] Department · island name, "3 canlı"; accent rule below
 *   rows   — status dot, agent, duration ("12 dk", ticks; frozen at `endedAt`), title (2 lines),
 *            last line (muted); live first, then recent; "+N daha" past the cap
 *
 * The list re-renders on store changes for the shown island; `update(now)` only rewrites the
 * duration texts that changed, at most once a second.
 */
export interface FleetPanel {
  el: HTMLElement;
  setIsland(theme: ThemeId | null, islandName: string): void;
  setVisible(visible: boolean): void;
  /** Per frame, cheap: wall-clock ms (fixed under capture). */
  update(nowMs: number): void;
  dispose(): void;
}

export interface FleetPanelOptions {
  accents: Readonly<Record<ThemeId, string>>;
  iconFor(theme: ThemeId): string;
  /** Row click (highlight only; the terminal view is M41). */
  onSelect?(sessionId: string): void;
}

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
    <ol class="mar-fleet-rows"></ol>
    <div class="mar-fleet-more"></div>`;
  root.appendChild(el);
  const disc = el.querySelector('.mar-fleet-disc') as HTMLElement;
  const nameEl = el.querySelector('.mar-fleet-name') as HTMLElement;
  const liveEl = el.querySelector('.mar-fleet-live') as HTMLElement;
  const list = el.querySelector('.mar-fleet-rows') as HTMLOListElement;
  const moreEl = el.querySelector('.mar-fleet-more') as HTMLElement;

  let theme: ThemeId | null = null;
  let visible = false;
  let dirty = true;
  let selected = '';
  let lastSec = NaN;
  let shown: Array<{ s: FleetSession; dur: HTMLElement; text: string }> = [];

  const render = (now: number): void => {
    dirty = false;
    lastSec = Math.floor(now / 1000);
    if (!theme) return;
    const { rows, live, more } = panelRows(store.sessions.values(), theme, P.rowCap);
    liveEl.textContent = P.liveCount(live);
    liveEl.hidden = live === 0;
    moreEl.textContent = more > 0 ? P.more(more) : rows.length ? '' : P.empty;
    moreEl.hidden = more === 0 && rows.length > 0;
    list.innerHTML = rows
      .map((s) => {
        const color = P.status[s.status];
        const dot = color ? ` style="background:${color}"` : '';
        return `<li><button class="mar-frow" data-id="${esc(s.id)}" aria-pressed="${s.id === selected}">
  <i class="mar-fdot" data-s="${s.status}"${dot} title="${P.statusLabel[s.status]}"></i>
  <span class="mar-fagent">${esc(s.agent)}</span><span class="mar-fdur">${sessionDuration(s, now)}</span>
  <span class="mar-ftitle">${esc(s.title)}</span>${s.lastLine ? `<span class="mar-fline">${esc(s.lastLine)}</span>` : ''}
</button></li>`;
      })
      .join('');
    // more rows than fit (short viewports): fade the list's bottom edge so the cut reads as scroll
    el.classList.toggle('mar-fleet-scroll', list.scrollHeight > list.clientHeight + 1);
    const durs = list.querySelectorAll<HTMLElement>('.mar-fdur');
    shown = rows.map((s, i) => ({ s, dur: durs[i], text: durs[i].textContent ?? '' }));
  };

  const unsub = store.subscribe(() => {
    dirty = true;
  });
  const onClick = (e: MouseEvent): void => {
    const b = (e.target as Element).closest<HTMLButtonElement>('.mar-frow');
    const id = b?.dataset.id;
    if (!id) return;
    selected = id;
    for (const r of list.querySelectorAll('.mar-frow'))
      r.setAttribute('aria-pressed', String((r as HTMLElement).dataset.id === id));
    opts.onSelect?.(id);
  };
  list.addEventListener('click', onClick);

  return {
    el,
    setIsland(t, islandName) {
      if (t === theme && nameEl.dataset.isle === islandName) return;
      theme = t;
      nameEl.dataset.isle = islandName;
      if (t) {
        const accent = opts.accents[t];
        el.style.setProperty('--acc', accent);
        disc.style.background = accent;
        disc.innerHTML = opts.iconFor(t);
        nameEl.innerHTML = `${esc(THEMES[t].displayName)}<span class="mar-fleet-isle">${esc(islandName)}</span>`;
      }
      dirty = true;
    },
    setVisible(v) {
      const on = v && theme !== null;
      if (on === visible) return;
      visible = on;
      el.classList.toggle('mar-fleet-on', on);
      el.setAttribute('aria-hidden', String(!on));
    },
    update(now) {
      if (!visible) return;
      if (dirty) return render(now);
      const sec = Math.floor(now / 1000);
      if (sec === lastSec) return;
      lastSec = sec;
      for (const r of shown) {
        const t = sessionDuration(r.s, now);
        if (t !== r.text) r.dur.textContent = r.text = t;
      }
    },
    dispose() {
      unsub();
      list.removeEventListener('click', onClick);
      el.remove();
    },
  };
}
