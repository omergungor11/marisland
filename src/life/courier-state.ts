/**
 * Courier plan (M51, TASK-621, D-164): where each island's ship is and what it carries, as a pure
 * function of the fleet store's gates and sessions and a clock `now` (ms). No mutable state, so a
 * snapshot / reconnect / capture lands on the right phase. Times are the bridge's wall ms.
 *
 * Per island ONE ship serves the gates whose `fromIsland` it is, in answer order (`answeredAt`,
 * then `createdAt`; answer order keeps the plan time-consistent when the user answers out of
 * order). A gate counts only as far as `now` has reached: an answer after `now` is still pending.
 *   pending           crate on deck, ship at its pier (`loading`)
 *   allowed           `outbound` for the voyage, `delivered` (crate hops onto the dock, unload dwell,
 *                     then the ship waits at the target berth) until the child session ends
 *   child ended       `returning` with a scroll (`fail` for an error), then `idle` while the scroll
 *                     is unloaded; the next gate sails after that
 *   denied            the crate lifts off, idle
 */
import { COURIER } from '../content/fleet-ships.ts';
import { isLive, type FleetGate, type FleetSession } from '../fleet/protocol.ts';
import { THEME_IDS, type ThemeId } from '../world/types.ts';

export type CourierPhase = 'idle' | 'loading' | 'outbound' | 'delivered' | 'returning';

export interface CourierPlan {
  island: ThemeId;
  phase: CourierPhase;
  /** Where the leg starts / ends (islands); equal to `island` when the ship stays home. The idle phase that unloads a scroll keeps the leg it just sailed (target -> home). */
  from: ThemeId;
  to: ThemeId;
  /** The gate this phase belongs to (card, picking); null when idle without history. */
  gateId: string | null;
  /** Phase start / end, ms (`t1` is Infinity while waiting for the user or the child). */
  t0: number;
  t1: number;
  /** Crates on deck now, the TO island of each, oldest gate first. */
  crates: ThemeId[];
  /** A report scroll on deck (returning) or being unloaded (idle right after). */
  scroll?: 'ok' | 'fail';
  /** Time of the latest deck change (crate loaded / unloaded / lifted, scroll loaded / unloaded), ms. */
  hopAt?: number;
  /** Denied crate being lifted off (its TO island). */
  lift?: ThemeId;
}

export interface CourierOpts {
  /** Voyage seconds between two islands (route length based); default the clamp minimum. */
  voyageS?: (from: ThemeId, to: ThemeId) => number;
}

const S = 1000;

export function courierState(
  gates: Iterable<FleetGate>,
  sessions: ReadonlyMap<string, FleetSession>,
  now: number,
  opts: CourierOpts = {},
): CourierPlan[] {
  const dur = opts.voyageS ?? ((): number => COURIER.voyageS[0]);
  const all = [...gates].filter((g) => g.createdAt <= now);
  return THEME_IDS.map((island) => plan(island, all, sessions, now, dur));
}

interface Seg {
  g: FleetGate;
  depart: number;
  arrive: number;
  unloadEnd: number;
  returnStart: number;
  returnEnd: number;
  homeEnd: number;
  scroll: 'ok' | 'fail';
}

function plan(
  island: ThemeId,
  all: FleetGate[],
  sessions: ReadonlyMap<string, FleetSession>,
  now: number,
  dur: (from: ThemeId, to: ThemeId) => number,
): CourierPlan {
  const mine = all
    .filter((g) => g.fromIsland === island)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  const answered = (g: FleetGate): number =>
    g.status === 'pending' ? Infinity : (g.answeredAt ?? g.createdAt);
  const eff = (g: FleetGate): 'pending' | 'allowed' | 'denied' =>
    answered(g) > now ? 'pending' : g.status;

  const served = mine
    .filter((g) => eff(g) === 'allowed')
    .sort((a, b) => answered(a) - answered(b) || a.createdAt - b.createdAt);
  const segs: Seg[] = [];
  let free = -Infinity;
  for (const g of served) {
    const depart = Math.max(answered(g), free);
    const arrive = depart + dur(island, g.toIsland) * S;
    const unloadEnd = arrive + COURIER.dwell.unload * S;
    const child = g.childId ? sessions.get(g.childId) : undefined;
    const ended =
      child && !isLive(child) && child.endedAt !== undefined && child.endedAt <= now
        ? child.endedAt
        : undefined;
    const returnStart = ended !== undefined ? Math.max(ended, unloadEnd) : Infinity;
    const returnEnd = returnStart + dur(g.toIsland, island) * S;
    const homeEnd = returnEnd + COURIER.dwell.unload * S;
    segs.push({
      g,
      depart,
      arrive,
      unloadEnd,
      returnStart,
      returnEnd,
      homeEnd,
      scroll: child?.status === 'error' ? 'fail' : 'ok',
    });
    free = homeEnd;
  }

  // crates on deck: pending gates, allowed ones not yet delivered (queued or sailing)
  const deck = mine
    .filter(
      (g) =>
        eff(g) === 'pending' ||
        (eff(g) === 'allowed' && now < (segs.find((s) => s.g === g)?.arrive ?? Infinity)),
    )
    .map((g) => ({ to: g.toIsland, at: g.createdAt, id: g.id }));
  const crates = deck.map((d) => d.to);
  const base = { island, crates };

  for (const s of segs) {
    const { g } = s;
    if (now < s.depart) break;
    if (now < s.arrive)
      return {
        ...base,
        phase: 'outbound',
        from: island,
        to: g.toIsland,
        gateId: g.id,
        t0: s.depart,
        t1: s.arrive,
        hopAt: s.depart,
      };
    if (now < s.returnStart)
      return {
        ...base,
        phase: 'delivered',
        from: island,
        to: g.toIsland,
        gateId: g.id,
        t0: s.arrive,
        t1: s.returnStart,
        hopAt: s.arrive,
      };
    if (now < s.returnEnd)
      return {
        ...base,
        phase: 'returning',
        from: g.toIsland,
        to: island,
        gateId: g.id,
        t0: s.returnStart,
        t1: s.returnEnd,
        scroll: s.scroll,
        hopAt: s.returnStart,
      };
    if (now < s.homeEnd)
      return {
        ...base,
        phase: 'idle',
        from: g.toIsland,
        to: island,
        gateId: g.id,
        t0: s.returnEnd,
        t1: s.homeEnd,
        scroll: s.scroll,
        hopAt: s.returnEnd,
      };
  }

  // at home
  const lastSeg =
    segs.length > 0 && now >= segs[segs.length - 1].homeEnd ? segs[segs.length - 1] : null;
  if (deck.length > 0) {
    const first = deck[0];
    const pop = Math.max(...deck.map((d) => d.at));
    const t0 = Math.max(pop, lastSeg?.homeEnd ?? -Infinity);
    return {
      ...base,
      phase: 'loading',
      from: island,
      to: first.to,
      gateId: first.id,
      t0,
      t1: Infinity,
      hopAt: pop,
    };
  }
  const denied = mine
    .filter((g) => eff(g) === 'denied')
    .sort((a, b) => answered(a) - answered(b))
    .pop();
  const out: CourierPlan = {
    ...base,
    phase: 'idle',
    from: island,
    to: island,
    gateId: lastSeg?.g.id ?? denied?.id ?? null,
    t0: lastSeg?.homeEnd ?? (denied ? answered(denied) : -Infinity),
    t1: Infinity,
  };
  if (denied && now - answered(denied) < COURIER.crateHop.seconds * S) {
    out.lift = denied.toIsland;
    out.hopAt = answered(denied);
  }
  return out;
}
