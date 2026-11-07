/**
 * Fleet <-> life binding (TASK-564, `mar-plans/FLEET.md`): every live session (queued / running /
 * waiting) of an island claims one of its department bots; the bot walks to a desk, sits there and
 * wears the island's accent beacon (life/workers.ts `pin`). When the session is done / failed /
 * stopped the bot is released after `FLEET_BOTS.releaseDelayS` of SIM time and goes back to its
 * routine. The mapping is `fleet-bots-map.ts`. Store events only mark the binding dirty; the work
 * happens in `update(simTime)`, so a capture's `simt` fixes the result (no wall clock here).
 */
import { FLEET_BOTS } from '../content/fleet.ts';
import type { FleetStore } from '../fleet/client.ts';
import { isLive, type FleetSession } from '../fleet/protocol.ts';
import { THEME_IDS, type ThemeId } from '../world/types.ts';
import { assignBots, type BotSession } from './fleet-bots-map.ts';

/** What the binding needs from the workers kind (`Workers` implements it). */
export interface BotHost {
  /** Always-on workers of the department at THEME_IDS index `theme`, in slot order. */
  residentsOf(theme: number): readonly number[];
  pin(i: number): void;
  unpin(i: number): void;
}

export interface FleetBots {
  /** Apply store changes and expire releases; `simTime` = the workers' sim clock (s). */
  update(simTime: number): void;
  /** The session worker `i` holds (hover tip), null when it holds none. */
  sessionOf(i: number): FleetSession | null;
  /** The department whose resident pool worker `i` is in (bot click without a session, M41). */
  islandOf(i: number): ThemeId | null;
  /** Bots currently pinned (tests / reports). */
  readonly bound: number;
  dispose(): void;
}

interface Binding {
  island: string;
  slot: number;
  bot: number;
  /** Sim time the bot is released at; −1 while the session is live. */
  releaseAt: number;
}

export function bindFleetToBots(
  store: Pick<FleetStore, 'sessions' | 'subscribe'>,
  life: { kinds: { workers?: BotHost } },
  opts: { releaseDelayS?: number } = {},
): FleetBots {
  const host = life.kinds.workers;
  const delay = opts.releaseDelayS ?? FLEET_BOTS.releaseDelayS;
  const bindings = new Map<string, Binding>();
  const byBot = new Map<number, string>();
  const pools: Record<string, readonly number[]> = {};
  const counts: Record<string, number> = {};
  THEME_IDS.forEach((t, k) => {
    pools[t] = host ? host.residentsOf(k) : [];
    counts[t] = pools[t].length;
  });
  let dirty = true;
  const unsub = store.subscribe(() => (dirty = true));

  const reconcile = (now: number): void => {
    dirty = false;
    // live sessions plus the bound ones still in their release delay occupy a slot
    const occupying: BotSession[] = [];
    for (const s of store.sessions.values()) {
      const b = bindings.get(s.id);
      if (isLive(s)) {
        occupying.push(s);
        if (b) b.releaseAt = -1;
      } else if (b) {
        if (b.releaseAt < 0) b.releaseAt = now + delay;
        occupying.push(s);
      }
    }
    // a bound session the store dropped (snapshot after a bridge restart) is released like an ended one
    for (const [id, b] of bindings)
      if (!store.sessions.has(id)) {
        if (b.releaseAt < 0) b.releaseAt = now + delay;
        occupying.push({ id, island: b.island });
      }
    const keep = new Map<string, number>();
    for (const [id, b] of bindings) keep.set(id, b.slot);
    const slots = assignBots(occupying, counts, keep);
    for (const s of occupying) {
      const slot = slots.get(s.id);
      if (slot === undefined || bindings.has(s.id)) continue;
      const bot = pools[s.island][slot];
      host?.pin(bot);
      byBot.set(bot, s.id);
      bindings.set(s.id, { island: s.island, slot, bot, releaseAt: -1 });
    }
  };

  return {
    update(simTime) {
      if (!host) return;
      if (dirty) reconcile(simTime);
      for (const [id, b] of bindings) {
        if (b.releaseAt < 0 || simTime < b.releaseAt) continue;
        host.unpin(b.bot);
        byBot.delete(b.bot);
        bindings.delete(id);
        // the freed bot may belong to a waiting session that found the island full
        dirty = true;
      }
    },
    sessionOf(i) {
      const id = byBot.get(i);
      return id ? (store.sessions.get(id) ?? null) : null;
    },
    islandOf(i) {
      return THEME_IDS.find((t) => pools[t].includes(i)) ?? null;
    },
    get bound() {
      return bindings.size;
    },
    dispose() {
      unsub();
      for (const b of bindings.values()) host?.unpin(b.bot);
      bindings.clear();
      byBot.clear();
    },
  };
}
