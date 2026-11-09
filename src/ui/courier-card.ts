import { CAMERA } from '../content/tiers.ts';
import { FLEET_CARD as C, FLEET_GATE as G, FLEET_PANEL as P } from '../content/fleet.ts';
import { THEMES } from '../content/themes.ts';
import type { FleetStore } from '../fleet/client.ts';
import { isLive, type FleetGate, type FleetSession } from '../fleet/protocol.ts';
import { formatDuration, requestTitle } from '../fleet/rows.ts';
import type { CourierPlan } from '../life/courier-state.ts';
import { THEME_IDS, type ThemeId } from '../world/types.ts';

/**
 * Courier ship card (M51, TASK-622, D-164): a click on an island's courier ship opens a card in
 * the fleet panel's look (`styles.ts` `.mar-fcard`), accent = the ship's island. It shows the leg
 * ("Marketing → Design"), the request, the gate prompt (clamped, "devamı" toggle), the status line
 * with the time since the phase began, İzin ver / Reddet while the gate is pending (the panel's
 * `gate` command) and buttons that open the parent / child session's terminal. An idle ship shows
 * the island, "kurye boşta" and its last voyage. The card is re-anchored every frame to the ship's
 * projected position (it follows a sailing ship), flips inside the viewport, keeps clear of the
 * fleet panel and the bottom dock, hides while the ship is outside the view, and closes on Esc (after the
 * admin window, before the terminal: its capture-phase listener is registered between the two),
 * on a click elsewhere or another pick. Hover over a ship: a one-line `.mar-ftip` (no portrait).
 */

export type CardStatus = keyof typeof C.status;

export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** Status key of a plan: loading = waiting for the user's answer. */
export function cardStatus(plan: Pick<CourierPlan, 'phase'>): CardStatus {
  switch (plan.phase) {
    case 'loading':
      return 'pending';
    case 'outbound':
      return 'sailing';
    case 'delivered':
      return 'delivered';
    case 'returning':
      return 'returning';
    default:
      return 'idle';
  }
}

/** "yolda · az önce", "teslim edildi · 3 dk"; no time when the phase has no start (never sailed). */
export function statusLine(plan: Pick<CourierPlan, 'phase' | 't0'>, now: number): string {
  const s = C.status[cardStatus(plan)];
  return Number.isFinite(plan.t0) ? `${s} · ${formatDuration(now - plan.t0)}` : s;
}

/** Voyage progress 0..1 while sailing, else null. */
export function sailProgress(
  plan: Pick<CourierPlan, 'phase' | 't0' | 't1'>,
  now: number,
): number | null {
  if (plan.phase !== 'outbound' && plan.phase !== 'returning') return null;
  if (!(plan.t1 > plan.t0) || !Number.isFinite(plan.t1)) return null;
  return Math.min(1, Math.max(0, (now - plan.t0) / (plan.t1 - plan.t0)));
}

const name = (t: ThemeId): string => THEMES[t].displayName;

/** The leg the card names: home → target for every phase (the return leg still reads "from → to" of the gate). */
export function legOf(plan: CourierPlan, gate: FleetGate | undefined): [ThemeId, ThemeId] | null {
  if (plan.phase === 'idle') return null;
  return gate ? [gate.fromIsland, gate.toIsland] : [plan.island, plan.to];
}

/** Hover tip: "Kurye · Marketing → Design · yolda" / "Kurye · Marketing · boşta". */
export function tipText(plan: CourierPlan, gate: FleetGate | undefined): string {
  const leg = legOf(plan, gate);
  const route = leg ? `${name(leg[0])} ${G.arrow} ${name(leg[1])}` : name(plan.island);
  return `${C.kind} · ${route} · ${C.status[cardStatus(plan)]}`;
}

/** The island's latest gate (by answer, then creation), for the idle card. */
export function lastGate(gates: Iterable<FleetGate>, island: ThemeId): FleetGate | null {
  let best: FleetGate | null = null;
  const at = (g: FleetGate): number => g.answeredAt ?? g.createdAt;
  for (const g of gates) {
    if (g.fromIsland !== island || g.status === 'pending') continue;
    if (!best || at(g) > at(best) || (at(g) === at(best) && g.id > best.id)) best = g;
  }
  return best;
}

/** "Son sefer → Design · tamamlandı · 12 dk önce" (child status, else the gate's answer). */
export function lastVoyage(
  gates: Iterable<FleetGate>,
  sessions: ReadonlyMap<string, FleetSession>,
  island: ThemeId,
  now: number,
): string {
  const g = lastGate(gates, island);
  if (!g) return C.lastNone;
  const child = g.childId ? sessions.get(g.childId) : undefined;
  let status: string;
  let at = g.answeredAt ?? g.createdAt;
  if (g.status === 'denied') status = C.lastDenied;
  else if (child && !isLive(child)) {
    status = P.statusLabel[child.status];
    at = child.endedAt ?? child.updatedAt;
  } else status = C.lastRunning;
  return C.last(name(g.toIsland), status, formatDuration(now - at));
}

/**
 * Card box for an anchor (ax, ay) in viewport px: right of / above the anchor first, then left,
 * then below; the first that fits inside [margin, vw − margin] × [top, vh − bottomClear] and clear
 * of `avoid` (the fleet panel) wins, else the first is clamped into the viewport and pushed right
 * of `avoid` when it fits there.
 */
export function placeCard(
  ax: number,
  ay: number,
  w: number,
  h: number,
  vw: number,
  vh: number,
  avoid: Box | null,
): { x: number; y: number } {
  const x0 = C.margin;
  const x1 = vw - C.margin;
  const y0 = C.top;
  const y1 = vh - P.bottomClear;
  const right = ax + C.dx;
  const left = ax - C.dx - w;
  const above = ay - C.dy - h;
  const below = ay + C.dy;
  const cands: [number, number][] = [
    [right, above],
    [left, above],
    [right, below],
    [left, below],
  ];
  const hits = (x: number, y: number): boolean =>
    !!avoid &&
    x < avoid.r + C.avoidPad &&
    x + w > avoid.l - C.avoidPad &&
    y < avoid.b + C.avoidPad &&
    y + h > avoid.t - C.avoidPad;
  for (const [x, y] of cands)
    if (x >= x0 && x + w <= x1 && y >= y0 && y + h <= y1 && !hits(x, y)) return { x, y };
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi));
  let x = clamp(right + w <= x1 ? right : left, x0, Math.max(x0, x1 - w));
  const y = clamp(above >= y0 ? above : below, y0, Math.max(y0, y1 - h));
  if (avoid && hits(x, y) && avoid.r + C.avoidPad + w <= x1) x = avoid.r + C.avoidPad;
  return { x, y };
}

export interface CourierCardDeps {
  store: FleetStore;
  /** Latest courier plans (index = THEME_IDS index), [] while no couriers exist. */
  plans(): readonly CourierPlan[];
  accents: Readonly<Record<ThemeId, string>>;
  iconFor(theme: ThemeId): string;
  /** The ship's screen point (viewport px) into `out`; false when it is outside the view. */
  anchor(island: ThemeId, out: { x: number; y: number }): boolean;
  /** Open a session's terminal (the fleet panel). */
  openSession(id: string): void;
  /** Fleet panel box (viewport px) while shown, else null. */
  avoid(): Box | null;
}

export interface CourierCard {
  el: HTMLElement;
  /** The island whose card is open, else null. */
  readonly island: ThemeId | null;
  show(island: ThemeId): void;
  hide(): void;
  /** Per frame (couriers' clock, ms): content when it changed, position always. `visible`: the HUD shows fleet UI. */
  update(now: number, visible?: boolean): void;
  /** Hover tip over a ship (null hides it); x, y = pointer in viewport px. */
  hover(island: ThemeId | null, x: number, y: number): void;
  dispose(): void;
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

export function createCourierCard(root: HTMLElement, deps: CourierCardDeps): CourierCard {
  const { store } = deps;
  const el = document.createElement('div');
  el.className = 'mar-fcard';
  el.setAttribute('role', 'dialog');
  root.appendChild(el);
  const tip = document.createElement('div');
  tip.className = 'mar-ftip mar-fcard-tip';
  tip.setAttribute('aria-hidden', 'true');
  tip.innerHTML = '<span class="mar-ftip-title"></span>';
  root.appendChild(tip);
  const tipText_ = tip.firstElementChild as HTMLElement;

  let island: ThemeId | null = null;
  let key = '';
  let full = false;
  let w: number = C.width;
  let h = 0;
  let lastX = NaN;
  let lastY = NaN;
  let statusEl: HTMLElement | null = null;
  let barEl: HTMLElement | null = null;
  /** gate id → `gateErrors` count when asked (re-enabled on a rise, as the panel does). */
  const asked = new Map<string, number>();
  const pt = { x: 0, y: 0 };

  const planOf = (t: ThemeId): CourierPlan | undefined => deps.plans()[THEME_IDS.indexOf(t)];
  const disc = (t: ThemeId): string =>
    `<span class="mar-fgate-disc" style="background:${deps.accents[t]}">${deps.iconFor(t)}</span>`;

  const html = (plan: CourierPlan, gate: FleetGate | undefined, now: number): string => {
    const leg = legOf(plan, gate);
    const t = plan.island;
    if (!leg) {
      const last = lastGate(store.gates.values(), t);
      const child = last?.childId;
      return (
        `<div class="mar-fcard-head">${disc(t)}<b>${esc(name(t))}</b></div>` +
        `<div class="mar-fcard-kind">${esc(C.kind)} · ${esc(C.idle)}</div>` +
        `<div class="mar-fcard-last">${esc(lastVoyage(store.gates.values(), store.sessions, t, now))}</div>` +
        (last && last.requestId
          ? `<div class="mar-fcard-req">${esc(requestTitle(store, last.requestId))}</div>`
          : '') +
        `<div class="mar-fcard-status" data-s="idle"><i></i><span>${esc(statusLine(plan, now))}</span></div>` +
        (child || last
          ? `<div class="mar-fcard-acts">${child ? `<button type="button" data-act="child">${esc(C.openChild)}</button>` : ''}${last ? `<button type="button" data-act="parent">${esc(C.openParent)}</button>` : ''}</div>`
          : '')
      );
    }
    const pending = [...store.gates.values()].filter(
      (g) => g.status === 'pending' && g.fromIsland === t,
    ).length;
    const more = gate?.status === 'pending' ? pending - 1 : pending;
    const req = gate ? requestTitle(store, gate.requestId) : '';
    const s = cardStatus(plan);
    const off = gate && asked.has(gate.id) ? ' disabled' : '';
    const gateBtns =
      gate?.status === 'pending'
        ? `<button class="mar-fcard-allow" type="button" data-act="allow"${off}>${G.allow}</button><button class="mar-fcard-deny" type="button" data-act="deny"${off}>${G.deny}</button>`
        : '';
    const open =
      (gate?.childId ? `<button type="button" data-act="child">${esc(C.openChild)}</button>` : '') +
      (gate ? `<button type="button" data-act="parent">${esc(C.openParent)}</button>` : '');
    const bar = sailProgress(plan, now) !== null ? '<div class="mar-fcard-bar"><i></i></div>' : '';
    return (
      `<div class="mar-fcard-head">${disc(leg[0])}<b>${esc(name(leg[0]))}</b><i class="mar-fgate-arrow">${G.arrow}</i>${disc(leg[1])}<b>${esc(name(leg[1]))}</b></div>` +
      `<div class="mar-fcard-kind">${esc(C.kind)}${more > 0 ? `<span class="mar-fcard-more">${esc(C.more(more))}</span>` : ''}</div>` +
      (req ? `<div class="mar-fcard-req">${esc(req)}</div>` : '') +
      (gate
        ? `<div class="mar-fcard-pwrap"><p class="mar-fcard-prompt${full ? ' mar-fcard-full' : ''}">${esc(gate.prompt)}</p><button class="mar-fcard-tog" type="button" data-act="more" hidden>${full ? G.less : G.more}</button></div>`
        : '') +
      `<div class="mar-fcard-status" data-s="${s}"><i></i><span>${esc(statusLine(plan, now))}</span></div>` +
      bar +
      (gateBtns ? `<div class="mar-fcard-acts mar-fcard-gate">${gateBtns}</div>` : '') +
      (open ? `<div class="mar-fcard-acts">${open}</div>` : '')
    );
  };

  const gateOf = (plan: CourierPlan): FleetGate | undefined =>
    plan.gateId ? store.gates.get(plan.gateId) : undefined;

  const render = (plan: CourierPlan, gate: FleetGate | undefined, now: number): void => {
    el.innerHTML = html(plan, gate, now);
    el.style.setProperty('--acc', deps.accents[plan.island]);
    statusEl = el.querySelector('.mar-fcard-status span');
    barEl = el.querySelector('.mar-fcard-bar i');
    const p = el.querySelector<HTMLElement>('.mar-fcard-prompt');
    const tog = el.querySelector<HTMLButtonElement>('.mar-fcard-tog');
    if (p && tog) tog.hidden = !full && p.scrollHeight <= p.clientHeight + 1;
    w = el.offsetWidth || C.width;
    h = el.offsetHeight;
    lastX = NaN;
  };

  const api: CourierCard = {
    el,
    get island() {
      return island;
    },
    show(t) {
      if (island !== t) full = false;
      island = t;
      key = '';
      el.classList.add('mar-fcard-on');
      tip.classList.remove('mar-ftip-on');
    },
    hide() {
      if (island === null) return;
      island = null;
      key = '';
      el.classList.remove('mar-fcard-on');
      el.innerHTML = '';
      statusEl = barEl = null;
    },
    update(now, visible = true) {
      if (island === null) return;
      const plan = planOf(island);
      // HUD hidden / fleet UI off / ship outside the view: the card hides until it is back
      const shown = visible && !!plan && deps.anchor(island, pt);
      el.classList.toggle('mar-fcard-on', shown);
      if (!shown || !plan) return;
      for (const [id, n] of asked) if ((store.gateErrors.get(id) ?? 0) > n) asked.delete(id);
      const gate = gateOf(plan);
      const k = JSON.stringify([
        plan.phase,
        plan.gateId,
        plan.from,
        plan.to,
        plan.t0,
        gate?.status,
        gate?.childId,
        gate ? asked.has(gate.id) : false,
        full,
        sailProgress(plan, now) !== null,
        plan.phase === 'idle' ? lastVoyage(store.gates.values(), store.sessions, island, now) : '',
        [...store.gates.values()].filter((g) => g.status === 'pending' && g.fromIsland === island)
          .length,
      ]);
      if (k !== key) {
        key = k;
        render(plan, gate, now);
      } else if (statusEl) {
        const s = statusLine(plan, now);
        if (statusEl.textContent !== s) statusEl.textContent = s;
      }
      if (barEl) barEl.style.width = `${((sailProgress(plan, now) ?? 0) * 100).toFixed(1)}%`;
      const vw = root.clientWidth;
      const vh = root.clientHeight;
      const { x, y } = placeCard(pt.x, pt.y, w, h, vw, vh, deps.avoid());
      if (x !== lastX || y !== lastY) {
        lastX = x;
        lastY = y;
        el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
      }
    },
    hover(t, x, y) {
      const plan = t && t !== island ? planOf(t) : undefined;
      if (!plan) {
        tip.classList.remove('mar-ftip-on');
        return;
      }
      const s = tipText(plan, gateOf(plan));
      if (tipText_.textContent !== s) tipText_.textContent = s;
      tip.style.setProperty('--acc', deps.accents[plan.island]);
      const tw = tip.offsetWidth || 220;
      const left = x + C.dx / 2 + tw > root.clientWidth ? x - C.dx / 2 - tw : x + C.dx / 2;
      tip.style.transform = `translate(${Math.max(8, left)}px,${y + 18}px)`;
      tip.classList.add('mar-ftip-on');
    },
    dispose() {
      window.removeEventListener('keydown', onEsc, true);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      el.removeEventListener('click', onClick);
      el.remove();
      tip.remove();
    },
  };

  const onClick = (e: MouseEvent): void => {
    const b = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-act]');
    if (!b || b.disabled || island === null) return;
    const plan = planOf(island);
    const gate = plan ? gateOf(plan) : undefined;
    const act = b.dataset.act;
    if (act === 'more') {
      full = !full;
      return;
    }
    if (act === 'allow' || act === 'deny') {
      if (!gate || gate.status !== 'pending') return;
      if (store.send({ type: 'gate', gateId: gate.id, allow: act === 'allow' }))
        asked.set(gate.id, store.gateErrors.get(gate.id) ?? 0);
      key = '';
      return;
    }
    const last = plan?.phase === 'idle' ? lastGate(store.gates.values(), plan.island) : gate;
    const id = act === 'child' ? last?.childId : last?.fromSessionId;
    if (id) deps.openSession(id);
  };
  /** Esc: capture phase, after the admin window's listener and before the terminal's (registration order). */
  const onEsc = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || island === null || e.isComposing || e.defaultPrevented) return;
    if (getComputedStyle(el).visibility !== 'visible') return;
    const t = e.target as HTMLElement | null;
    if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return;
    e.preventDefault();
    api.hide();
  };
  /** A click (not a drag) outside the card closes it; a click on a ship re-opens it right after (the pick runs later). */
  let down: { x: number; y: number; t: number } | null = null;
  const onDown = (e: PointerEvent): void => {
    down = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  };
  const onUp = (e: PointerEvent): void => {
    const d = down;
    down = null;
    if (!d || island === null || el.contains(e.target as Node)) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) >= CAMERA.clickMaxPx) return;
    if (e.timeStamp - d.t >= CAMERA.clickMaxMs) return;
    api.hide();
  };
  el.addEventListener('click', onClick);
  window.addEventListener('keydown', onEsc, true);
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointerup', onUp, true);
  return api;
}
