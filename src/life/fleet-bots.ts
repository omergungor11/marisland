/**
 * Fleet <-> life binding (TASK-564, `mar-plans/FLEET.md`): every live session (queued / running /
 * waiting) of an island claims one of its department bots; the bot walks to a desk, sits there and
 * wears the island's accent beacon (life/workers.ts `pin`). When the session is done / failed /
 * stopped the bot is released after `FLEET_BOTS.releaseDelayS` of SIM time and goes back to its
 * routine. The mapping is `fleet-bots-map.ts`. Store events only mark the binding dirty; the work
 * happens in `update(simTime)`, so a capture's `simt` fixes the result (no wall clock here).
 * TASK-590: a bound bot also takes the session's look (`botLook(sessionId, island, agent, eyesFor(status,
 * pending gate))`): the chassis / head / role item swap at the desk, the eye state follows the status.
 */
import { botLook, eyesFor, type BotLook, type BotSessionStatus } from '../content/bot-look.ts';
import { FLEET_BOTS } from '../content/fleet.ts';
import type { FleetStore } from '../fleet/client.ts';
import { isLive, type FleetSession } from '../fleet/protocol.ts';
import { THEME_IDS, type ThemeId } from '../world/types.ts';
import type { BoundBot } from './fleet-beacons.ts';
import { assignBots, type BotSession } from './fleet-bots-map.ts';

/** What the binding needs from the workers kind (`Workers` implements it). */
export interface BotHost {
  /** Always-on workers of the department at THEME_IDS index `theme`, in slot order. */
  residentsOf(theme: number): readonly number[];
  pin(i: number): void;
  unpin(i: number): void;
  /** Look of the bot holding a session (null = its resident look again); the host swaps chassis at rest. */
  setLook?(i: number, look: BotLook | null): void;
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
  /** The bound bots and their departments (the beacons follow them); a new array only when the set changes. */
  boundBots(): readonly BoundBot[];
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
  store: Pick<FleetStore, 'sessions' | 'subscribe'> & Partial<Pick<FleetStore, 'gates'>>,
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
  let list: BoundBot[] = [];
  /** Hand every binding its session's look (eyes from the status and a pending hand-off gate). */
  const looks = (): void => {
    if (!host?.setLook) return;
    for (const [id, b] of bindings) {
      const s = store.sessions.get(id);
      if (!s) continue;
      let gate = false;
      if (store.gates)
        for (const g of store.gates.values())
          if (g.status === 'pending' && g.fromSessionId === id) gate = true;
      host.setLook(
        b.bot,
        botLook(
          id,
          b.island as ThemeId,
          (s.agent ?? '').toLowerCase(),
          eyesFor(s.status as BotSessionStatus, gate),
        ),
      );
    }
  };
  const refresh = (): void => {
    list = [...bindings.values()].map((b) => ({ bot: b.bot, island: b.island as ThemeId }));
  };
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
    refresh();
    looks();
  };

  return {
    update(simTime) {
      if (!host) return;
      if (dirty) reconcile(simTime);
      for (const [id, b] of bindings) {
        if (b.releaseAt < 0 || simTime < b.releaseAt) continue;
        host.unpin(b.bot);
        host.setLook?.(b.bot, null);
        byBot.delete(b.bot);
        bindings.delete(id);
        // the freed bot may belong to a waiting session that found the island full
        dirty = true;
        refresh();
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
    boundBots() {
      return list;
    },
    dispose() {
      unsub();
      for (const b of bindings.values()) {
        host?.unpin(b.bot);
        host?.setLook?.(b.bot, null);
      }
      bindings.clear();
      byBot.clear();
      list = [];
    },
  };
}
