import { FLEET_GATE as G, FLEET_PANEL as P, FLEET_TERM as T } from '../content/fleet.ts';
import { THEMES } from '../content/themes.ts';
import type { FleetStore } from '../fleet/client.ts';
import { isLive, type FleetLine, type FleetSession } from '../fleet/protocol.ts';
import {
  chainOf,
  linePlan,
  lineView,
  pendingGates,
  sessionDuration,
  statusGlyph,
  tailFrom,
  termEscape,
  type ChainNode,
} from '../fleet/rows.ts';
import type { ThemeId } from '../world/types.ts';
import { PORTRAIT } from '../content/fleet-portrait.ts';
import { putPortrait, sessionLook } from './bot-portrait.ts';

/**
 * Terminal view of one session (M41, TASK-569): an overlay of the fleet panel card (slides in over
 * the list; `styles.ts` `.mar-fterm`). Plain DOM, line nodes appended / dropped by seq
 * (`linePlan`), never rebuilt on a feed line.
 *
 *   header — back arrow, status dot, title, "agent · 12 dk · 3 tur · $0.42"; M42: "İstek: … · 3
 *            session" and the chain strip (island discs in tree order, a click opens that one)
 *   body   — lines by kind; autoscroll unless scrolled up, then a "↓ yeni satırlar" pill
 *   footer — prompt (Enter sends, Shift+Enter newline) → `send` on a finished session,
 *            disabled "çalışıyor…" + Stop while live; draft mode ("Bu adada yeni session") → `start`
 */
export interface FleetTerm {
  el: HTMLElement;
  /** Shown session ('' closed or in draft mode). */
  readonly sessionId: string;
  readonly open: boolean;
  show(sessionId: string): void;
  /** New-session prompt box for an island. */
  draft(island: ThemeId): void;
  close(): void;
  /** Store changed: re-render on the next `update`. */
  touch(): void;
  update(now: number): void;
  dispose(): void;
}

export interface FleetTermOptions {
  accents: Readonly<Record<ThemeId, string>>;
  islandName(theme: ThemeId): string;
  /** Island icon markup (chain strip discs, M42). */
  iconFor(theme: ThemeId): string;
  /** The view opened / closed (the card resizes, the list re-marks its selected row). */
  onChange(): void;
  /** Interactive (not capture): focus the prompt box of a draft. */
  focus: boolean;
}

const BACK =
  '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const put = (e: HTMLElement, text: string): void => {
  if (e.textContent !== text) e.textContent = text;
};

export function createFleetTerm(
  card: HTMLElement,
  store: FleetStore,
  o: FleetTermOptions,
): FleetTerm {
  const el = document.createElement('div');
  el.className = 'mar-fterm';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <header class="mar-fterm-head">
      <button class="mar-fterm-back" type="button" aria-label="${T.back}" title="${T.back}">${BACK}</button>
      <span class="mar-fbot mar-fterm-bot"></span>
      <i class="mar-fdot"></i>
      <div class="mar-fterm-id"><span class="mar-fterm-title"></span><span class="mar-fterm-meta"></span><span class="mar-fterm-req" hidden><span></span><b></b></span></div>
      <div class="mar-fchain" hidden></div>
    </header>
    <div class="mar-fterm-body"><ol class="mar-fterm-lines"></ol><div class="mar-fterm-note"></div></div>
    <button class="mar-fterm-pill" type="button" hidden>${T.newLines}</button>
    <footer class="mar-fterm-foot">
      <textarea class="mar-fterm-prompt" rows="1" spellcheck="false"></textarea>
      <button class="mar-fterm-go" type="button"></button>
      <button class="mar-fterm-stop" type="button">${T.stop}</button>
    </footer>`;
  card.appendChild(el);
  const q = <E extends HTMLElement>(sel: string): E => el.querySelector(sel) as E;
  const back = q<HTMLButtonElement>('.mar-fterm-back');
  const bot = q<HTMLElement>('.mar-fterm-bot');
  const dot = q<HTMLElement>('.mar-fdot');
  const titleEl = q<HTMLElement>('.mar-fterm-title');
  const meta = q<HTMLElement>('.mar-fterm-meta');
  const reqEl = q<HTMLElement>('.mar-fterm-req');
  const chainEl = q<HTMLElement>('.mar-fchain');
  const [reqTitle, reqCount] = reqEl.children as unknown as HTMLElement[];
  const body = q<HTMLElement>('.mar-fterm-body');
  const list = q<HTMLOListElement>('.mar-fterm-lines');
  const note = q<HTMLElement>('.mar-fterm-note');
  const pill = q<HTMLButtonElement>('.mar-fterm-pill');
  const prompt = q<HTMLTextAreaElement>('.mar-fterm-prompt');
  const go = q<HTMLButtonElement>('.mar-fterm-go');
  const stopBtn = q<HTMLButtonElement>('.mar-fterm-stop');

  let mode: 'closed' | 'session' | 'draft' = 'closed';
  let sessionId = '';
  let draftIsland: ThemeId | null = null;
  /** After a draft's `start`: the island and the ids that existed, so the new one is recognisable. */
  let pending: { island: ThemeId; known: Set<string> } | null = null;
  let dirty = true;
  let fresh = false;
  let shown: number[] = [];
  let lastSec = NaN;
  let durText = '';
  let hint = '';

  const lineNode = (l: FleetLine): HTMLLIElement => {
    const v = lineView(l);
    const li = document.createElement('li');
    li.className = 'mar-fl';
    li.dataset.k = v.kind;
    if (v.fail) li.dataset.fail = '1';
    if (v.mark) {
      const m = document.createElement('span');
      m.className = 'mar-fl-mark';
      m.textContent = v.mark;
      li.appendChild(m);
    }
    if (v.tool) {
      const t = document.createElement('b');
      t.textContent = v.tool;
      li.appendChild(t);
    }
    li.appendChild(document.createTextNode(v.tool && v.text ? ` ${v.text}` : v.text));
    return li;
  };

  const atBottom = (): boolean =>
    body.scrollHeight - body.scrollTop - body.clientHeight <= T.stickPx;
  const toBottom = (): void => {
    list.style.paddingBottom = '';
    body.scrollTop = body.scrollHeight;
    // clip the top on a line boundary (TASK-579): pad the list end by the cut line's visible part
    const top = body.getBoundingClientRect().top;
    const kids = list.children;
    let lo = 0;
    let hi = kids.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (kids[mid].getBoundingClientRect().bottom <= top) lo = mid + 1;
      else hi = mid;
    }
    const r = kids[lo]?.getBoundingClientRect();
    if (r && r.top < top) {
      list.style.paddingBottom = `${Math.ceil(r.bottom - top)}px`;
      body.scrollTop = body.scrollHeight;
    }
    pill.hidden = true;
  };

  const renderLines = (): void => {
    const lines = store.linesOf(sessionId);
    const stick = fresh || atBottom();
    const plan = linePlan(
      shown,
      lines.map((l) => l.seq),
    );
    let added = 0;
    if (!plan) {
      list.replaceChildren(...lines.map(lineNode));
      added = lines.length;
    } else {
      for (let i = 0; i < plan.drop; i++) list.firstElementChild?.remove();
      for (let i = plan.from; i < lines.length; i++, added++) list.appendChild(lineNode(lines[i]));
    }
    shown = lines.map((l) => l.seq);
    put(note, hint || (lines.length ? '' : T.noLines));
    if (stick) toBottom();
    else if (added) pill.hidden = false;
    fresh = false;
  };

  /** Island accent (header rule, glyph) and the button label colour on it. */
  const accent = (t: ThemeId): void => {
    el.style.setProperty('--acc', o.accents[t]);
    el.style.setProperty('--on-acc', T.onAccent[t]);
  };

  const renderHead = (s: FleetSession | undefined, now: number): void => {
    if (!s) return;
    accent(s.island);
    if (dot.dataset.s !== s.status) {
      const g = statusGlyph(s.status);
      dot.dataset.s = s.status;
      dot.innerHTML = g.svg;
      dot.style.color = g.color;
      dot.title = P.statusLabel[s.status];
    }
    dot.hidden = false;
    // TASK-591: the session's bot; a pending gate of its own makes it ask (`?`)
    const asks = pendingGates(store).some((g) => g.fromSessionId === s.id);
    putPortrait(bot, sessionLook(s, asks), PORTRAIT.px.term);
    bot.hidden = false;
    put(titleEl, s.title);
    durText = sessionDuration(s, now);
    const parts = [s.agent, durText, T.turns(s.turns)];
    if (s.costUsd !== undefined) parts.push(T.cost(s.costUsd));
    put(meta, parts.join(' · '));
    const live = isLive(s);
    prompt.disabled = live;
    const gates =
      s.status === 'waiting'
        ? pendingGates(store).filter((g) => g.fromSessionId === s.id).length
        : 0;
    prompt.placeholder = live
      ? s.status === 'waiting'
        ? gates
          ? T.gateWaiting(gates)
          : T.waiting
        : T.running
      : T.placeholder;
    put(go, T.send);
    go.hidden = live;
    stopBtn.hidden = !live;
    renderChain(s.id);
  };

  // ---- request line + chain strip (M42) -------------------------------------------------------
  let chainKey = '';
  const nodeHtml = (n: ChainNode, current: string): string => {
    const name = THEMES[n.island].displayName;
    const acc = o.accents[n.island];
    let disc: string;
    if (n.session) {
      const g = statusGlyph(n.session.status);
      const on = n.session.id === current ? ' mar-fchain-on' : '';
      disc = `<button class="mar-fchain-disc${on}" type="button" data-id="${n.session.id.replace(/"/g, '')}" title="${name} · ${P.statusLabel[n.session.status]}" style="background:${acc}">${o.iconFor(n.island)}<i class="mar-fchain-badge" style="color:${g.color.startsWith('var(') ? acc : g.color}">${g.svg}</i></button>`;
    } else
      disc = `<span class="mar-fchain-disc mar-fchain-gate" title="${name} · ${G.pending}" style="--acc:${acc};color:${acc}">${o.iconFor(n.island)}</span>`;
    const kids = n.children.length
      ? `<div class="mar-fchain-kids">${n.children.map((c) => nodeHtml(c, current)).join('')}</div>`
      : '';
    return `<div class="mar-fchain-node">${disc}<span class="mar-fchain-name">${name}</span>${kids}</div>`;
  };
  const statusKey = (n: ChainNode): string =>
    `${n.session ? `${n.session.id}:${n.session.status}` : `g:${n.gate?.id ?? ''}`}(${n.children.map(statusKey).join(',')})`;
  function renderChain(id: string): void {
    const c = mode === 'session' ? chainOf(store, id) : null;
    reqEl.hidden = chainEl.hidden = !c;
    if (!c) {
      chainKey = '';
      return;
    }
    put(reqTitle, G.request(c.title));
    put(reqCount, G.sessions(c.count));
    const key = `${id}|${c.roots.map(statusKey).join(',')}`;
    if (key === chainKey) return;
    chainKey = key;
    chainEl.innerHTML = `<div class="mar-fchain-tree">${c.roots.map((r) => nodeHtml(r, id)).join('')}</div>`;
  }

  const render = (now: number): void => {
    dirty = false;
    lastSec = Math.floor(now / 1000);
    if (mode === 'draft' && pending) {
      // the bridge answers `start` with a `session` event (no ack): the newest unknown live one there
      let best: FleetSession | null = null;
      for (const s of store.sessions.values())
        if (s.island === pending.island && !pending.known.has(s.id) && isLive(s))
          if (!best || s.startedAt > best.startedAt) best = s;
      if (best) {
        pending = null;
        api.show(best.id);
        return;
      }
    }
    if (mode === 'session') {
      renderHead(store.sessions.get(sessionId), now);
      renderLines();
    } else if (mode === 'draft' && draftIsland) {
      accent(draftIsland);
      dot.hidden = true;
      bot.hidden = true;
      renderChain('');
      put(titleEl, T.newTitle);
      put(meta, `${THEMES[draftIsland].displayName} · ${o.islandName(draftIsland)}`);
      prompt.disabled = pending !== null;
      prompt.placeholder = pending ? T.running : T.newPlaceholder;
      put(go, T.start);
      go.hidden = pending !== null;
      stopBtn.hidden = true;
      list.replaceChildren();
      shown = [];
      put(note, hint || T.newHint);
    }
  };

  const fit = (): void => {
    prompt.style.height = 'auto';
    prompt.style.height = `${Math.min(T.promptPx[1], Math.max(T.promptPx[0], prompt.scrollHeight))}px`;
  };
  const submit = (): void => {
    const text = prompt.value.trim();
    if (!text || prompt.disabled) return;
    let ok = false;
    if (mode === 'session') ok = store.send({ type: 'send', sessionId, prompt: text });
    else if (mode === 'draft' && draftIsland) {
      const known = new Set(store.sessions.keys());
      pending = { island: draftIsland, known };
      ok = store.send({ type: 'start', island: draftIsland, prompt: text });
      if (!ok) pending = null;
    }
    hint = ok ? '' : T.offline;
    if (ok) {
      prompt.value = '';
      fit();
    }
    dirty = true;
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  };
  /**
   * Esc (TASK-579): the prompt blurs (camera keys work again), the next Esc closes the view.
   * TASK-580: the terminal is the topmost layer, so it listens in the capture phase and marks the
   * key handled (`preventDefault`); the HUD's Esc (Settings, photo, edit) skips a handled one.
   */
  const onEsc = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || mode === 'closed' || e.isComposing || e.defaultPrevented) return;
    if (getComputedStyle(el).visibility !== 'visible') return; // HUD hidden / photo mode
    const t = e.target as HTMLElement | null;
    const typing = t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable;
    if (typing && t !== prompt) return;
    e.preventDefault();
    if (termEscape(t === prompt) === 'blur') prompt.blur();
    else api.close();
  };
  const onBack = (): void => api.close();
  const onStop = (): void => {
    hint = store.send({ type: 'stop', sessionId }) ? '' : T.offline;
    dirty = true;
  };
  const onScroll = (): void => {
    if (!pill.hidden && atBottom()) pill.hidden = true;
  };
  const onChain = (e: MouseEvent): void => {
    const id = (e.target as Element).closest<HTMLElement>('.mar-fchain-disc[data-id]')?.dataset.id;
    if (id && store.sessions.has(id)) api.show(id);
  };
  chainEl.addEventListener('click', onChain);
  back.addEventListener('click', onBack);
  go.addEventListener('click', submit);
  stopBtn.addEventListener('click', onStop);
  pill.addEventListener('click', toBottom);
  prompt.addEventListener('keydown', onKey);
  window.addEventListener('keydown', onEsc, true);
  prompt.addEventListener('input', fit);
  body.addEventListener('scroll', onScroll, { passive: true });

  const setOpen = (on: boolean): void => {
    el.classList.toggle('mar-fterm-on', on);
    el.setAttribute('aria-hidden', String(!on));
    o.onChange();
  };

  const api: FleetTerm = {
    el,
    get sessionId() {
      return mode === 'session' ? sessionId : '';
    },
    get open() {
      return mode !== 'closed';
    },
    show(id) {
      if (mode === 'session' && id === sessionId) return;
      mode = 'session';
      sessionId = id;
      draftIsland = null;
      pending = null;
      hint = '';
      shown = [];
      list.replaceChildren();
      pill.hidden = true;
      prompt.value = '';
      fit();
      fresh = true;
      dirty = true;
      setOpen(true);
      // replay what this client has not seen (the mock answers at once, the bridge with `lines`)
      store.send({ type: 'tail', sessionId: id, from: tailFrom(store.linesOf(id)) });
    },
    draft(island) {
      mode = 'draft';
      sessionId = '';
      draftIsland = island;
      pending = null;
      hint = '';
      prompt.value = '';
      fit();
      dirty = true;
      setOpen(true);
      if (o.focus) prompt.focus({ preventScroll: true });
    },
    close() {
      if (mode === 'closed') return;
      mode = 'closed';
      pending = null;
      prompt.blur();
      setOpen(false);
    },
    touch() {
      dirty = true;
    },
    update(now) {
      if (mode === 'closed') return;
      if (dirty) return render(now);
      const sec = Math.floor(now / 1000);
      if (sec === lastSec || mode !== 'session') return;
      lastSec = sec;
      const s = store.sessions.get(sessionId);
      if (s && sessionDuration(s, now) !== durText) renderHead(s, now);
    },
    dispose() {
      back.removeEventListener('click', onBack);
      go.removeEventListener('click', submit);
      stopBtn.removeEventListener('click', onStop);
      pill.removeEventListener('click', toBottom);
      prompt.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onEsc, true);
      prompt.removeEventListener('input', fit);
      body.removeEventListener('scroll', onScroll);
      chainEl.removeEventListener('click', onChain);
      el.remove();
    },
  };
  return api;
}
