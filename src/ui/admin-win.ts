import { ADMIN as A, FLEET_PANEL, FLEET_TERM, type AdminTab } from '../content/fleet.ts';
import { THEMES } from '../content/themes.ts';
import type { FleetStore } from '../fleet/client.ts';
import {
  groupHits,
  hitLine,
  isStale,
  kbTabOf,
  resolveLink,
  shortDir,
  tabFiles,
  type KbApi,
  type KbTreeResponse,
} from '../fleet/kb.ts';
import {
  isLive,
  type FleetProject,
  type FleetSession,
  type KbDoc,
  type KbFile,
  type KbHit,
} from '../fleet/protocol.ts';
import { statusGlyph, syncKeyed } from '../fleet/rows.ts';
import { THEME_IDS, type ThemeId } from '../world/types.ts';
import { escHtml as esc, renderMd } from './md.ts';

/**
 * Admin window ("Pano", M43 TASK-585): a floating card over the scene (inside the HUD, so its
 * hide / photo rules apply), above the fleet panel and the dock. The title bar (icon, "Admin",
 * search, ×) drags it, the bottom-right grip resizes it; the box is clamped to the viewport and
 * remembered in localStorage (`ADMIN.storageKey`) outside capture.
 *
 *   Projeler — one card per `FleetProject` (accent bar, name, `~/` dir, note, agent chips: live
 *              first with the running glyph, finished ones muted ✓ / ✗; a chip opens the session's
 *              terminal), "Bu projede başlat" (island chips + prompt → `start` with `project`),
 *              a dashed "+ proje" card (POST /api/projects; the bridge's `project` event adds it)
 *   Hafıza / Bilgi / Raporlar — sources → files ("eski" badge past `staleDays`) → document
 *              (frontmatter chips + `renderMd`); `[[name]]` opens the file it names
 *   search   — ≥ 2 chars, debounced: hits grouped by file replace the file list; a hit opens the
 *              document at its line
 *
 * Esc (TASK-580 pattern): a capture-phase window listener, so it runs before the fleet terminal's
 * (the window is created first) — a focused field blurs, else the window closes; it skips while a
 * layer above it is open (`covered`). Keys typed inside never reach the camera.
 */
export interface AdminWin {
  el: HTMLElement;
  readonly open: boolean;
  setOpen(open: boolean): void;
  /** `<tab>[:<KbFile.path>]` (capture preset `admin=`): that tab, the file's source, the document. */
  show(spec: string): void;
  /** Per frame, cheap: re-renders the projects after a store change. */
  update(): void;
  /** Resolves once the pending KB loads (tree, document) are done. */
  settled(): Promise<void>;
  dispose(): void;
}

export interface AdminWinOptions {
  store: FleetStore;
  /** null: no KB (fleet off). */
  kb: KbApi | null;
  accents: Readonly<Record<ThemeId, string>>;
  iconFor(theme: ThemeId): string;
  /** Wall clock (ms; fixed under capture): the stale badges. */
  now(): number;
  /** Capture: default box (no localStorage), no focus. */
  capture: boolean;
  /** A project card's agent chip: open that session in the fleet panel terminal. */
  onOpenSession(id: string): void;
  /** Opened / closed from inside (×, Esc) or by `setOpen`. */
  onChange(open: boolean): void;
  /** A layer above the window is open (settings sheet): Esc belongs to it. */
  covered(): boolean;
}

type KbTab = Exclude<AdminTab, 'projeler'>;
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M9 9v11"/></svg>';
const CLOSE =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
const W = A.win;

/** Default box: right of the (widest) fleet card, below the compass, shrunk into the viewport. */
export function defaultBox(vw: number, vh: number): Box {
  const m = W.margin;
  let x = m + FLEET_PANEL.fleetWidth + W.gap;
  let w = Math.min(W.w, vw - x - m);
  if (w < W.minW) {
    w = Math.min(W.w, vw - 2 * m);
    x = Math.max(m, vw - m - w);
  }
  let y: number = W.top;
  let h = Math.min(W.h, vh - y - W.bottomClear);
  if (h < W.minH) {
    h = Math.min(W.h, vh - 2 * m);
    y = Math.max(m, Math.min(W.top, vh - m - h));
  }
  return clampBox({ x, y, w, h }, vw, vh);
}

/** Size within [min, viewport − margins], position inside the viewport. */
export function clampBox(b: Box, vw: number, vh: number): Box {
  const m = W.margin;
  const w = Math.max(Math.min(W.minW, vw - 2 * m), Math.min(b.w, vw - 2 * m));
  const h = Math.max(Math.min(W.minH, vh - 2 * m), Math.min(b.h, vh - 2 * m));
  return {
    w,
    h,
    x: Math.max(m, Math.min(b.x, vw - m - w)),
    y: Math.max(m, Math.min(b.y, vh - m - h)),
  };
}

function loadBox(): Box | null {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(A.storageKey) ?? 'null') as Box | null;
    return v && [v.x, v.y, v.w, v.h].every(Number.isFinite) ? v : null;
  } catch {
    return null;
  }
}

/** Search text in a hit line, marked (escaped first). */
function markHit(text: string, q: string): string {
  const fold = (s: string): string => s.toLowerCase().replace(/̇/g, '').replace(/ı/g, 'i');
  const i = q ? fold(text).indexOf(fold(q)) : -1;
  if (i < 0) return esc(text);
  return `${esc(text.slice(0, i))}<mark>${esc(text.slice(i, i + q.length))}</mark>${esc(text.slice(i + q.length))}`;
}

const FINISHED_MARK: Readonly<Record<string, string>> = { done: '✓', error: '✗', stopped: '■' };

export function createAdminWin(root: HTMLElement, o: AdminWinOptions): AdminWin {
  const { store } = o;
  const el = document.createElement('section');
  el.className = 'mar-admin';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', A.title);
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <header class="mar-admin-bar">
      <span class="mar-admin-ico">${ICON}</span>
      <span class="mar-admin-title">${esc(A.title)}</span>
      <input class="mar-admin-search" type="search" placeholder="${esc(A.search.placeholder)}" aria-label="${esc(A.search.placeholder)}" spellcheck="false" autocomplete="off">
      <button class="mar-admin-x" type="button" aria-label="${esc(A.close)}" title="${esc(A.close)}">${CLOSE}</button>
    </header>
    <nav class="mar-admin-tabs" role="tablist">${A.tabs
      .map(
        ([id, label]) =>
          `<button type="button" role="tab" data-tab="${id}" aria-selected="false">${esc(label)}</button>`,
      )
      .join('')}</nav>
    <div class="mar-admin-body">
      <div class="mar-admin-projects"><p class="mar-admin-note" hidden></p><div class="mar-admin-cards"></div></div>
      <div class="mar-admin-kb" hidden>
        <div class="mar-admin-src"></div>
        <div class="mar-admin-files"></div>
        <article class="mar-admin-doc"></article>
      </div>
      <div class="mar-admin-state" hidden></div>
    </div>
    <div class="mar-admin-grip" aria-label="${esc(A.resize)}" title="${esc(A.resize)}"></div>`;
  root.appendChild(el);
  const q = <E extends HTMLElement>(sel: string): E => el.querySelector(sel) as E;
  const bar = q<HTMLElement>('.mar-admin-bar');
  const search = q<HTMLInputElement>('.mar-admin-search');
  const closeBtn = q<HTMLButtonElement>('.mar-admin-x');
  const tabsEl = q<HTMLElement>('.mar-admin-tabs');
  const projEl = q<HTMLElement>('.mar-admin-projects');
  const noteEl = q<HTMLElement>('.mar-admin-note');
  const cardsEl = q<HTMLElement>('.mar-admin-cards');
  const kbEl = q<HTMLElement>('.mar-admin-kb');
  const srcEl = q<HTMLElement>('.mar-admin-src');
  const filesEl = q<HTMLElement>('.mar-admin-files');
  const docEl = q<HTMLElement>('.mar-admin-doc');
  const stateEl = q<HTMLElement>('.mar-admin-state');
  const grip = q<HTMLElement>('.mar-admin-grip');

  let open = false;
  let tab: AdminTab = 'projeler';
  let box: Box | null = null;
  let dirty = true;

  // ---- geometry ------------------------------------------------------------------------------
  const vw = (): number => window.innerWidth;
  const vh = (): number => window.innerHeight;
  const applyBox = (): void => {
    if (!box) return;
    box = clampBox(box, vw(), vh());
    el.style.left = `${box.x}px`;
    el.style.top = `${box.y}px`;
    el.style.width = `${box.w}px`;
    el.style.height = `${box.h}px`;
    el.classList.toggle('mar-admin-narrow', box.w < A.narrowPx);
  };
  const saveBox = (): void => {
    if (o.capture || !box) return;
    try {
      globalThis.localStorage?.setItem(A.storageKey, JSON.stringify(box));
    } catch {
      /* private mode */
    }
  };
  let drag: { id: number; mode: 'move' | 'size'; px: number; py: number; b: Box } | null = null;
  const startDrag = (e: PointerEvent, mode: 'move' | 'size'): void => {
    if (e.button !== 0 || !box) return;
    drag = { id: e.pointerId, mode, px: e.clientX, py: e.clientY, b: { ...box } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    el.classList.add('mar-admin-drag');
    e.preventDefault();
  };
  const onBarDown = (e: PointerEvent): void => {
    if ((e.target as Element).closest('input,button')) return;
    startDrag(e, 'move');
  };
  const onGripDown = (e: PointerEvent): void => startDrag(e, 'size');
  const onMove = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.px;
    const dy = e.clientY - drag.py;
    const b = drag.b;
    box =
      drag.mode === 'move'
        ? { ...b, x: b.x + dx, y: b.y + dy }
        : {
            ...b,
            // the grip grows the box up to the viewport edge, it never pushes the window away
            w: Math.max(W.minW, Math.min(b.w + dx, vw() - W.margin - b.x)),
            h: Math.max(W.minH, Math.min(b.h + dy, vh() - W.margin - b.y)),
          };
    applyBox();
  };
  const onUp = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    el.classList.remove('mar-admin-drag');
    saveBox();
  };
  const onResize = (): void => applyBox();

  // ---- projects -------------------------------------------------------------------------------
  interface Card {
    el: HTMLElement;
    head: HTMLElement;
    counts: HTMLElement;
    chips: HTMLElement;
    form: HTMLElement;
    key: string;
  }
  const cards = new Map<string, Card>();
  let cardOrder: string[] = [];
  /** Projects `addProject` returned before the bridge's `project` event (mock: never comes). */
  const added = new Map<string, FleetProject>();
  /** Start form state per project: chosen island, hint. */
  const startIsland = new Map<string, ThemeId>();
  let addOpen = false;
  let addError = '';
  let addBusy = false;

  const projects = (): FleetProject[] => {
    const out = [...store.projects.values()];
    for (const p of added.values()) if (!store.projects.has(p.id)) out.push(p);
    return out;
  };
  const sessionsOf = (id: string): FleetSession[] => {
    const all = [...store.sessions.values()].filter((s) => s.project === id);
    const live = all.filter(isLive).sort((a, b) => b.startedAt - a.startedAt);
    const done = all.filter((s) => !isLive(s)).sort((a, b) => b.updatedAt - a.updatedAt);
    return [...live, ...done];
  };
  const chipHtml = (s: FleetSession): string => {
    const live = isLive(s);
    const acc = o.accents[s.island];
    const g = statusGlyph(s.status);
    const mark = live
      ? `<i class="mar-fdot" data-s="${s.status}" style="color:${g.color}">${g.svg}</i>`
      : `<i class="mar-achip-mark" data-s="${s.status}">${FINISHED_MARK[s.status] ?? '✓'}</i>`;
    return `<button class="mar-achip${live ? '' : ' mar-achip-done'}" type="button" data-sid="${esc(s.id)}" style="--acc:${acc}" title="${esc(s.title)}">${mark}<b>${esc(s.agent)}</b><span>${esc(THEMES[s.island].displayName)}</span></button>`;
  };
  const makeCard = (id: string): Card => {
    const c = document.createElement('article');
    c.className = 'mar-acard';
    c.dataset.pid = id;
    c.innerHTML = `<div class="mar-acard-head"><div class="mar-acard-id"></div><span class="mar-acard-counts"></span></div><div class="mar-achips"></div><div class="mar-acard-form"></div>`;
    return {
      el: c,
      head: c.querySelector('.mar-acard-id') as HTMLElement,
      counts: c.querySelector('.mar-acard-counts') as HTMLElement,
      chips: c.querySelector('.mar-achips') as HTMLElement,
      form: c.querySelector('.mar-acard-form') as HTMLElement,
      key: '',
    };
  };
  const startForm = (pid: string): string => {
    const isl = startIsland.get(pid);
    if (!isl)
      return `<button class="mar-abtn" type="button" data-act="start-open">${esc(A.projects.start)}</button>`;
    const chips = THEME_IDS.map(
      (t) =>
        `<button class="mar-aisle" type="button" data-isle="${t}" aria-pressed="${t === isl}" style="--acc:${o.accents[t]};--on:${FLEET_TERM.onAccent[t]}">${esc(THEMES[t].displayName)}</button>`,
    ).join('');
    return `<div class="mar-aisles">${chips}</div><textarea class="mar-aprompt" rows="3" spellcheck="false" placeholder="${esc(A.projects.promptPlaceholder)}"></textarea><div class="mar-aform-acts"><span class="mar-ahint" hidden></span><button class="mar-abtn" type="button" data-act="start-cancel">${esc(A.projects.cancel)}</button><button class="mar-abtn mar-abtn-go" type="button" data-act="start-go" style="--acc:${o.accents[isl]};--on:${FLEET_TERM.onAccent[isl]}">${esc(A.projects.startGo)}</button></div>`;
  };
  const renderCard = (c: Card, p: FleetProject, i: number): void => {
    const color = p.color ?? A.projects.palette[i % A.projects.palette.length];
    c.el.style.setProperty('--pc', color);
    const ss = sessionsOf(p.id);
    const live = ss.filter(isLive).length;
    const key = JSON.stringify([
      p.name,
      p.dir,
      p.note,
      ss.map((s) => [s.id, s.status, s.agent, s.title]),
    ]);
    if (key === c.key) return;
    c.key = key;
    c.head.innerHTML = `<b class="mar-acard-name">${esc(p.name)}</b><code class="mar-acard-dir" title="${esc(p.dir)}">${esc(shortDir(p.dir))}</code>${p.note ? `<p class="mar-acard-note">${esc(p.note)}</p>` : ''}`;
    c.counts.textContent = A.projects.counts(live, ss.length - live);
    c.chips.innerHTML = ss.length
      ? ss.map(chipHtml).join('')
      : `<span class="mar-achips-empty">${esc(A.projects.noAgents)}</span>`;
    if (!c.form.childElementCount) c.form.innerHTML = startForm(p.id);
  };
  const addCardHtml = (): string =>
    addOpen
      ? `<div class="mar-aadd-form"><b class="mar-acard-name">${esc(A.projects.add)}</b>${(
          ['name', 'dir', 'note'] as const
        )
          .map(
            (k) =>
              `<input class="mar-ainput" data-f="${k}" type="text" spellcheck="false" autocomplete="off" placeholder="${esc(A.projects.fields[k])}" aria-label="${esc(A.projects.fields[k])}">`,
          )
          .join(
            '',
          )}<p class="mar-aerr"${addError ? '' : ' hidden'}>${esc(addError)}</p><div class="mar-aform-acts"><button class="mar-abtn" type="button" data-act="add-cancel">${esc(A.projects.cancel)}</button><button class="mar-abtn mar-abtn-go" type="button" data-act="add-go"${addBusy ? ' disabled' : ''}>${esc(A.projects.addGo)}</button></div></div>`
      : `<button class="mar-aadd-open" type="button" data-act="add-open"><b>${esc(A.projects.add)}</b><span>${esc(A.projects.addHint)}</span></button>`;
  let addCard: HTMLElement | null = null;
  const renderAddCard = (): void => {
    if (!addCard) {
      addCard = document.createElement('article');
      addCard.className = 'mar-acard mar-acard-add';
    }
    // keep typed values across a re-render (an error came back)
    const vals = [...addCard.querySelectorAll<HTMLInputElement>('.mar-ainput')].map((x) => x.value);
    addCard.innerHTML = addCardHtml();
    addCard.querySelectorAll<HTMLInputElement>('.mar-ainput').forEach((x, i) => {
      x.value = vals[i] ?? '';
    });
    cardsEl.appendChild(addCard);
  };
  const renderProjects = (): void => {
    const ps = projects();
    cardOrder = syncKeyed(
      cards,
      cardOrder,
      ps.map((p) => p.id),
      {
        make: makeCard,
        insert: (n, ref) => cardsEl.insertBefore(n.el, ref ? ref.el : addCard),
        drop: (n) => n.el.remove(),
      },
    );
    ps.forEach((p, i) => renderCard(cards.get(p.id) as Card, p, i));
    if (!addCard) renderAddCard();
    const offline = store.mode === 'live' && !store.connected;
    const note = offline ? A.kb.offline : ps.length ? '' : A.projects.empty;
    noteEl.textContent = note;
    noteEl.hidden = !note;
    noteEl.classList.toggle('mar-admin-note-off', offline);
  };

  const onCards = (e: MouseEvent): void => {
    const t = e.target as Element;
    const chip = t.closest<HTMLElement>('[data-sid]');
    if (chip?.dataset.sid) return o.onOpenSession(chip.dataset.sid);
    const card = t.closest<HTMLElement>('.mar-acard');
    const pid = card?.dataset.pid ?? '';
    const c = cards.get(pid);
    const isle = t.closest<HTMLElement>('[data-isle]')?.dataset.isle as ThemeId | undefined;
    if (isle && c) {
      startIsland.set(pid, isle);
      const text = c.form.querySelector<HTMLTextAreaElement>('.mar-aprompt')?.value ?? '';
      c.form.innerHTML = startForm(pid);
      const ta = c.form.querySelector<HTMLTextAreaElement>('.mar-aprompt');
      if (ta) ta.value = text;
      return;
    }
    switch (t.closest<HTMLElement>('[data-act]')?.dataset.act) {
      case 'start-open':
        if (!c) return;
        startIsland.set(pid, THEME_IDS[0]);
        c.form.innerHTML = startForm(pid);
        if (!o.capture) c.form.querySelector<HTMLTextAreaElement>('.mar-aprompt')?.focus();
        return;
      case 'start-cancel':
        if (!c) return;
        startIsland.delete(pid);
        c.form.innerHTML = startForm(pid);
        return;
      case 'start-go': {
        const island = startIsland.get(pid);
        const ta = c?.form.querySelector<HTMLTextAreaElement>('.mar-aprompt');
        const hint = c?.form.querySelector<HTMLElement>('.mar-ahint');
        const prompt = ta?.value.trim() ?? '';
        if (!c || !island || !prompt || !hint) return;
        const ok = store.send({ type: 'start', island, prompt, project: pid });
        hint.textContent = ok ? '' : FLEET_TERM.offline;
        hint.hidden = ok;
        if (ok) {
          startIsland.delete(pid);
          c.form.innerHTML = startForm(pid);
        }
        return;
      }
      case 'add-open':
        addOpen = true;
        addError = '';
        renderAddCard();
        if (!o.capture) addCard?.querySelector<HTMLInputElement>('.mar-ainput')?.focus();
        return;
      case 'add-cancel':
        addOpen = false;
        addError = '';
        renderAddCard();
        return;
      case 'add-go':
        void submitProject();
        return;
    }
  };
  const submitProject = async (): Promise<void> => {
    if (!addCard || addBusy) return;
    const v = (k: string): string =>
      addCard?.querySelector<HTMLInputElement>(`[data-f="${k}"]`)?.value.trim() ?? '';
    const input = { name: v('name'), dir: v('dir'), ...(v('note') ? { note: v('note') } : {}) };
    if (!o.kb) {
      addError = A.kb.offline;
      renderAddCard();
      return;
    }
    addBusy = true;
    renderAddCard();
    const r = await o.kb.addProject(input);
    addBusy = false;
    if (r.project) {
      added.set(r.project.id, r.project);
      addOpen = false;
      addError = '';
      addCard.querySelectorAll<HTMLInputElement>('.mar-ainput').forEach((x) => (x.value = ''));
      dirty = true;
    } else addError = r.error ?? A.kb.offline;
    renderAddCard();
    if (open) render();
  };

  // ---- knowledge base -------------------------------------------------------------------------
  let tree: KbTreeResponse | null = null;
  let treeState: 'idle' | 'loading' | 'ok' | 'error' = 'idle';
  let busy: Promise<unknown> = Promise.resolve();
  const track = (p: Promise<unknown>): void => {
    busy = Promise.all([busy, p.catch(() => undefined)]);
  };
  /** Source filter ('' = all) per tab, the shown file and its document. */
  const source: Record<KbTab, string> = { hafiza: '', bilgi: '', raporlar: '' };
  let docPath = '';
  let doc: KbDoc | null = null;
  let docLine = -1;
  let docSeq = 0;
  let query = '';
  let hits: KbHit[] | null = null;
  let searchSeq = 0;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  const loadTree = (): void => {
    // once per idle state: a failed load waits for the next tab change (setTab resets it)
    if (!o.kb || treeState !== 'idle') return;
    treeState = 'loading';
    const p = o.kb.tree().then(
      (t) => {
        tree = t;
        treeState = 'ok';
        if (open) render();
      },
      () => {
        treeState = 'error';
        if (open) render();
      },
    );
    track(p);
  };
  const fileOf = (path: string): KbFile | undefined => tree?.files.find((f) => f.path === path);
  const srcDisc = (id: string): string => {
    const s = tree?.sources.find((x) => x.id === id);
    return s?.island ? o.accents[s.island] : A.kb.neutralDisc;
  };
  const srcOrder = (): string[] => tree?.sources.map((x) => x.id) ?? [];
  const srcLabel = (id: string): string => tree?.sources.find((x) => x.id === id)?.label ?? id;

  const openDoc = (path: string, line = -1): void => {
    const f = fileOf(path);
    if (f) {
      const t = kbTabOf(f.kind);
      if (tab !== t) tab = t;
      if (source[t] && source[t] !== f.source) source[t] = f.source;
    }
    docPath = path;
    docLine = line;
    const seq = ++docSeq;
    if (doc?.file.path === path) {
      render();
      return;
    }
    doc = null;
    if (!o.kb) return;
    const p = o.kb.doc(path).then(
      (d) => {
        if (seq !== docSeq) return;
        doc = d;
        if (open) render();
      },
      () => {
        if (seq !== docSeq) return;
        doc = null;
        if (open) render();
      },
    );
    track(p);
    render();
  };

  const renderSources = (t: KbTab): void => {
    if (!tree) return;
    const files = tabFiles(tree.files, t, '', srcOrder());
    const count = (id: string): number => files.filter((f) => !id || f.source === id).length;
    const rows = [
      { id: '', label: A.kb.allSources, disc: '' },
      ...tree.sources
        .filter((s) => count(s.id) > 0)
        .map((s) => ({ id: s.id, label: s.label, disc: srcDisc(s.id) })),
    ];
    srcEl.innerHTML = rows
      .map(
        (r) =>
          `<button class="mar-asrc" type="button" data-src="${esc(r.id)}" aria-pressed="${source[t] === r.id}">${r.disc ? `<i class="mar-asrc-disc" style="background:${r.disc}"></i>` : '<i class="mar-asrc-disc mar-asrc-all"></i>'}<span>${esc(r.label)}</span><em>${count(r.id)}</em></button>`,
      )
      .join('');
  };
  const fileRow = (f: KbFile, now: number): string => {
    const chips = [
      f.type ? `<span class="mar-atag mar-atag-type">${esc(f.type)}</span>` : '',
      `<span class="mar-atag">${esc(A.kb.kind[f.kind])}</span>`,
      isStale(f, now) ? `<span class="mar-atag mar-atag-stale">${esc(A.stale)}</span>` : '',
      `<span class="mar-afile-size">${esc(A.kb.size(f.size))}</span>`,
    ].join('');
    const name = f.path.slice(f.path.indexOf('/') + 1);
    return `<button class="mar-afile" type="button" data-path="${esc(f.path)}" aria-pressed="${f.path === docPath}" style="--acc:${srcDisc(f.source)}"><b>${esc(f.title)}</b><span class="mar-afile-path">${esc(name)}</span><span class="mar-afile-tags">${chips}</span></button>`;
  };
  const renderFiles = (t: KbTab): void => {
    if (!tree) return;
    const now = o.now();
    if (hits) {
      const groups = groupHits(
        hits.filter((h) => !source[t] || h.path.startsWith(`${source[t]}/`)),
      );
      const total = groups.reduce((n, g) => n + g.total, 0);
      filesEl.innerHTML = groups.length
        ? `<div class="mar-ahits-head">${esc(A.search.count(total, groups.length))}</div>${groups
            .map((g) => {
              const f = fileOf(g.path);
              return `<div class="mar-ahit" style="--acc:${srcDisc(f?.source ?? '')}"><button class="mar-ahit-file" type="button" data-path="${esc(g.path)}"><b>${esc(f?.title ?? g.path)}</b><span>${esc(srcLabel(f?.source ?? ''))}</span></button>${g.hits
                .map(
                  (h) =>
                    `<button class="mar-ahit-line" type="button" data-path="${esc(h.path)}" data-hline="${h.line}" data-htext="${esc(h.text)}"><em>${h.line}</em><span>${markHit(h.text, query.trim())}</span></button>`,
                )
                .join('')}</div>`;
            })
            .join('')}`
        : `<p class="mar-aempty">${esc(A.search.empty)}</p>`;
      return;
    }
    const files = tabFiles(tree.files, t, source[t], srcOrder());
    filesEl.innerHTML = files.length
      ? files.map((f) => fileRow(f, now)).join('')
      : `<p class="mar-aempty">${esc(A.kb.noFiles)}</p>`;
  };
  /** What the document pane shows; a re-render with the same key keeps its scroll. */
  let docKey = '';
  const renderDoc = (): void => {
    const key = `${docPath}|${doc ? 1 : 0}|${docLine}|${pendingHitText}|${tree ? 1 : 0}`;
    if (key === docKey) return;
    docKey = key;
    docEl.scrollTop = 0;
    if (!docPath) {
      docEl.innerHTML = `<p class="mar-aempty">${esc(A.kb.pick)}</p>`;
      return;
    }
    if (!doc) {
      docEl.innerHTML = `<p class="mar-aempty">${esc(A.kb.loading)}</p>`;
      return;
    }
    const f = doc.file;
    const fmChips = Object.entries(doc.frontmatter)
      .filter(([k]) => k !== 'name' && k !== 'description')
      .map(([k, v]) => `<span class="mar-atag"><i>${esc(k)}</i> ${esc(v)}</span>`)
      .join('');
    const stale = isStale(f, o.now())
      ? `<span class="mar-atag mar-atag-stale">${esc(A.stale)}</span>`
      : '';
    const body = f.path.endsWith('.json')
      ? `<pre data-line="1"><code>${esc(doc.text)}</code></pre>`
      : renderMd(doc.text);
    docEl.innerHTML = `<header class="mar-adoc-head" style="--acc:${srcDisc(f.source)}"><h2>${esc(f.title)}</h2>${f.description ? `<p>${esc(f.description)}</p>` : ''}<div class="mar-adoc-tags"><span class="mar-atag mar-atag-src"><i class="mar-asrc-disc" style="background:${srcDisc(f.source)}"></i>${esc(srcLabel(f.source))}</span>${fmChips}${stale}<code>${esc(f.path.slice(f.path.indexOf('/') + 1))}</code></div></header><div class="mar-md">${body}</div>`;
    // the body's opening `# Title` repeats the header: drop it
    const h1 = docEl.querySelector<HTMLElement>('.mar-md > h1:first-child');
    if (h1 && h1.textContent?.trim() === f.title.trim()) h1.remove();
    // unresolved [[links]] read muted
    for (const a of docEl.querySelectorAll<HTMLElement>('.mar-md-wiki, .mar-md-ref')) {
      const name = a.dataset.link ?? (a.dataset.ref ?? '').replace(/^.*\//, '');
      if (!tree || !resolveLink(tree.files, name, f.source)) {
        a.classList.add('mar-md-dead');
        a.title = A.kb.unresolved;
      }
    }
    if (docLine >= 0) {
      const i = hitLine(doc.text, { line: docLine, text: pendingHitText });
      const want = i >= 0 ? i + 1 : docLine;
      let best: HTMLElement | null = null;
      let bestLine = -1;
      for (const b of docEl.querySelectorAll<HTMLElement>('.mar-md [data-line]')) {
        const l = Number(b.dataset.line);
        if (l <= want && l >= bestLine) {
          best = b;
          bestLine = l;
        }
      }
      if (best) {
        best.classList.add('mar-md-hit');
        docEl.scrollTop = Math.max(0, best.offsetTop - 36);
      }
    }
  };
  let pendingHitText = '';

  const renderKb = (t: KbTab): void => {
    if (!o.kb || treeState === 'error') {
      kbEl.hidden = true;
      stateEl.hidden = false;
      stateEl.innerHTML = `<div class="mar-astate"><b>${esc(A.kb.offline)}</b><p>${renderInline(A.kb.offlineHint)}</p></div>`;
      return;
    }
    if (!tree) {
      kbEl.hidden = true;
      stateEl.hidden = false;
      stateEl.innerHTML = `<div class="mar-astate"><p>${esc(A.kb.loading)}</p></div>`;
      return;
    }
    if (kbEl.hidden) docKey = ''; // the pane was hidden: show it fresh
    stateEl.hidden = true;
    kbEl.hidden = false;
    renderSources(t);
    renderFiles(t);
    renderDoc();
  };
  const renderInline = (s: string): string =>
    esc(s).replace(/`([^`]+)`/g, (_, c: string) => `<code>${c}</code>`);

  const render = (): void => {
    dirty = false;
    for (const b of tabsEl.querySelectorAll<HTMLButtonElement>('[data-tab]'))
      b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    const projectsOn = tab === 'projeler';
    projEl.hidden = !projectsOn;
    if (projectsOn) {
      kbEl.hidden = true;
      stateEl.hidden = true;
      renderProjects();
      return;
    }
    loadTree();
    renderKb(tab as KbTab);
  };

  const setTab = (t: AdminTab): void => {
    if (t === tab) return;
    tab = t;
    if (t !== 'projeler' && treeState === 'error') treeState = 'idle'; // retry: the bridge may be up now
    render();
  };
  const runSearch = (): void => {
    searchTimer = null;
    const text = query.trim();
    const seq = ++searchSeq;
    if (text.length < A.search.minChars || !o.kb) {
      hits = null;
      render();
      return;
    }
    if (tab === 'projeler') tab = 'hafiza';
    const p = o.kb.search(text).then(
      (h) => {
        if (seq !== searchSeq) return;
        hits = h;
        if (open) render();
      },
      () => {
        if (seq !== searchSeq) return;
        hits = [];
        if (open) render();
      },
    );
    track(p);
  };

  // ---- events ---------------------------------------------------------------------------------
  const onTabs = (e: MouseEvent): void => {
    const t = (e.target as Element).closest<HTMLElement>('[data-tab]')?.dataset.tab as
      AdminTab | undefined;
    if (t) setTab(t);
  };
  const onKbClick = (e: MouseEvent): void => {
    const t = e.target as Element;
    const src = t.closest<HTMLElement>('[data-src]');
    if (src && tab !== 'projeler') {
      source[tab] = src.dataset.src ?? '';
      render();
      return;
    }
    const line = t.closest<HTMLElement>('[data-hline]');
    if (line?.dataset.path) {
      pendingHitText = line.dataset.htext ?? '';
      return openDoc(line.dataset.path, Number(line.dataset.hline));
    }
    const file = t.closest<HTMLElement>('[data-path]');
    if (file?.dataset.path) return openDoc(file.dataset.path);
    const link = t.closest<HTMLElement>('.mar-md-wiki, .mar-md-ref');
    if (link && tree && doc && !link.classList.contains('mar-md-dead')) {
      const name = link.dataset.link ?? (link.dataset.ref ?? '').replace(/^.*\//, '');
      const f = resolveLink(tree.files, name, doc.file.source);
      if (f) openDoc(f.path);
    }
  };
  const onSearch = (): void => {
    query = search.value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, A.search.debounceMs);
  };
  const onClose = (): void => api.setOpen(false);
  const isField = (t: HTMLElement | null): boolean =>
    t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || !!t?.isContentEditable;
  const onEsc = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || !open || e.isComposing || e.defaultPrevented) return;
    if (o.covered() || getComputedStyle(el).visibility !== 'visible') return;
    const t = e.target as HTMLElement | null;
    // typing in another layer (the fleet terminal's prompt): that layer handles it
    if (isField(t) && !el.contains(t)) return;
    e.preventDefault();
    if (isField(t)) t?.blur();
    else api.setOpen(false);
  };
  /** Keys pressed inside the window never reach the camera / HUD shortcuts (Esc runs above, in capture). */
  const onKeyInside = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') e.stopPropagation();
  };
  const onPromptKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement;
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    if (t.classList.contains('mar-aprompt')) {
      e.preventDefault();
      (
        t.closest('.mar-acard-form')?.querySelector('[data-act="start-go"]') as HTMLElement | null
      )?.click();
    } else if (t.classList.contains('mar-ainput')) {
      e.preventDefault();
      void submitProject();
    }
  };

  bar.addEventListener('pointerdown', onBarDown);
  grip.addEventListener('pointerdown', onGripDown);
  for (const h of [bar, grip]) {
    h.addEventListener('pointermove', onMove);
    h.addEventListener('pointerup', onUp);
    h.addEventListener('pointercancel', onUp);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onEsc, true);
  el.addEventListener('keydown', onKeyInside);
  cardsEl.addEventListener('keydown', onPromptKey);
  cardsEl.addEventListener('click', onCards);
  kbEl.addEventListener('click', onKbClick);
  tabsEl.addEventListener('click', onTabs);
  search.addEventListener('input', onSearch);
  closeBtn.addEventListener('click', onClose);
  const unsub = store.subscribe(() => {
    dirty = true;
  });

  const api: AdminWin = {
    el,
    get open() {
      return open;
    },
    setOpen(v) {
      if (v === open) return;
      open = v;
      if (v) {
        if (!box) box = (!o.capture && loadBox()) || defaultBox(vw(), vh());
        applyBox();
        render();
      }
      el.classList.toggle('mar-admin-on', v);
      el.setAttribute('aria-hidden', String(!v));
      o.onChange(v);
    },
    show(spec) {
      const i = spec.indexOf(':');
      const t = (i < 0 ? spec : spec.slice(0, i)) as AdminTab;
      const path = i < 0 ? '' : spec.slice(i + 1);
      if (A.tabs.some(([id]) => id === t)) tab = t;
      if (!path) return void (open && render());
      loadTree();
      // the source filter follows the file (so its list shows the neighbours)
      const p = busy.then(() => {
        const f = fileOf(path);
        if (f) source[kbTabOf(f.kind)] = f.source;
        openDoc(path);
      });
      track(p);
    },
    update() {
      // the KB view does not follow the session feed (a re-render would cost the scroll)
      if (open && dirty && tab === 'projeler') render();
    },
    async settled() {
      // a load may start another (tree → doc): wait until nothing new was queued
      for (let b = busy; ; b = busy) {
        await b;
        if (b === busy) return;
      }
    },
    dispose() {
      unsub();
      if (searchTimer) clearTimeout(searchTimer);
      bar.removeEventListener('pointerdown', onBarDown);
      grip.removeEventListener('pointerdown', onGripDown);
      for (const h of [bar, grip]) {
        h.removeEventListener('pointermove', onMove);
        h.removeEventListener('pointerup', onUp);
        h.removeEventListener('pointercancel', onUp);
      }
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onEsc, true);
      el.removeEventListener('keydown', onKeyInside);
      cardsEl.removeEventListener('keydown', onPromptKey);
      cardsEl.removeEventListener('click', onCards);
      kbEl.removeEventListener('click', onKbClick);
      tabsEl.removeEventListener('click', onTabs);
      search.removeEventListener('input', onSearch);
      closeBtn.removeEventListener('click', onClose);
      el.remove();
    },
  };
  return api;
}
