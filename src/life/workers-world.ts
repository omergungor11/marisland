/**
 * Worker world queries and spawn planning (Phase 3, TASK-307). Pure data: no three.js, no clock, no
 * `Math.random` — every choice comes from a label-forked `Rng`, so a seed always yields the same
 * seats, quotas and spawn points. Seats come from `content/offices.ts` WORK_SPOTS through
 * `world/lot-frame.ts`, i.e. exactly where the interior geometry builds its desks.
 */
import { ACTIVITY, STILT_SPUR, VILLAGERS, WORKERS } from '../content/life.ts';
import {
  INTERIOR_OF,
  OFFICE_DEFS,
  RAISED_FLOOR,
  WORK_SPOTS,
  floorOf,
  type WorkPose,
} from '../content/offices.ts';
import { THEMES } from '../content/themes.ts';
import type { Rng } from '../core/rng.ts';
import { lotLocalToWorld, lotPivotY } from '../world/lot-frame.ts';
import type { ThemeId, WorldData } from '../world/types.ts';
import type { LifeCtx } from './ctx.ts';
import { allocate, type Mask, type WalkGraph } from './land-world.ts';

export interface Seat {
  /** Index into `world.lots` / `WORK_SPOTS[def]`. */
  lot: number;
  spot: number;
  island: number;
  /** World position of the seat (u); the worker's feet sink by `sit` when seated. */
  x: number;
  z: number;
  /** World heading (xz angle, atan2(dz, dx)) the worker faces at the desk. */
  hd: number;
  pose: WorkPose;
  sit: number;
  /**
   * World y of the floor under the seat: the interior floor the desk is built on (lot pivot +
   * floorOf(def), raised on the stilt lab). NaN = the terrain (shells without an interior, legacy
   * door-side benches).
   */
  floor: number;
  /** Walk-graph node of the lot door. */
  node: number;
  /** Just inside the door (NaN when the seat is outdoors, e.g. a bench). */
  ex: number;
  ez: number;
  /** In front of the door (outpost islands start / end here). */
  dx: number;
  dz: number;
}

/** Every seat of every lot, in lot order then spot order. */
export function seatsOf(world: Pick<WorldData, 'lots' | 'height'>): Seat[] {
  const out: Seat[] = [];
  (world.lots ?? []).forEach((lot, li) => {
    const spots = WORK_SPOTS[lot.defId];
    if (!spots) return;
    const themed = lot.defId in OFFICE_DEFS;
    const floor = INTERIOR_OF[lot.defId] ? lotPivotY(lot, world.height) + floorOf(lot.defId) : NaN;
    const ent = lotLocalToWorld(lot, 0, lot.d / 2 - 0.3);
    const front = lotLocalToWorld(lot, 0, lot.d / 2 + WORKERS.outpost.anchorGap);
    spots.forEach((s, si) => {
      const p = lotLocalToWorld(lot, s.x, s.z);
      const inside = s.z <= lot.d / 2 - 0.2;
      out.push({
        lot: li,
        spot: si,
        island: lot.islandId,
        x: p.x,
        z: p.z,
        // lot-local heading f looks along (sin f, cos f): world heading = rotY - f
        hd: lot.rotY - s.face,
        pose: (themed ? s.pose : WORKERS.legacyPose) as WorkPose,
        sit: s.sit,
        floor,
        node: lot.node,
        ex: inside ? ent.x : NaN,
        ez: inside ? ent.z : NaN,
        dx: front.x,
        dz: front.z,
      });
    });
  });
  return out;
}

/**
 * Deck spurs for raised shells standing in water (the stilt lab, TASK-379). `buildWalkGraph` drops
 * water nodes, so such a door is an isolated node (comp −1) and its seats were unreachable. For
 * each one this adds a chain of deck nodes (`STILT_SPUR.step` apart, feet on `STILT_SPUR.deckY`)
 * from the door to the nearest walkable node within `STILT_SPUR.maxReach`, and marks the door
 * walkable. Spur nodes over walkable ground (≥ `VILLAGERS.minWalkY`) keep their feet on the terrain
 * (deck NaN), only the ones over water stand on the deck. The graph is extended IN PLACE (typed arrays are re-allocated; node ids of existing
 * nodes never change), so every holder of `g` sees it. Doors that are already walkable (a real
 * worldgen spur) are left alone, so this is a fallback that never fights worldgen. Returns the
 * number of spurs added.
 */
export function attachDeckSpurs(ctx: Pick<LifeCtx, 'world' | 'h'>, g: WalkGraph): number {
  const adds: { door: number; to: number; pts: { x: number; z: number }[] }[] = [];
  for (const l of ctx.world.lots ?? []) {
    if (!(RAISED_FLOOR[l.defId] > 0) || l.node < 0 || l.node >= g.n || g.comp[l.node] >= 0)
      continue;
    if (adds.some((a) => a.door === l.node)) continue;
    let to = -1;
    let best: number = STILT_SPUR.maxReach;
    for (let i = 0; i < g.n; i++) {
      if (g.comp[i] < 0) continue;
      const d = Math.hypot(g.x[i] - g.x[l.node], g.z[i] - g.z[l.node]);
      if (d < best) {
        best = d;
        to = i;
      }
    }
    if (to < 0) continue;
    const k = Math.max(0, Math.ceil(best / STILT_SPUR.step) - 1);
    const pts: { x: number; z: number }[] = [];
    for (let j = 1; j <= k; j++) {
      const t = j / (k + 1);
      pts.push({
        x: g.x[l.node] + (g.x[to] - g.x[l.node]) * t,
        z: g.z[l.node] + (g.z[to] - g.z[l.node]) * t,
      });
    }
    adds.push({ door: l.node, to, pts });
  }
  if (adds.length === 0) return 0;
  const n0 = g.n;
  const n1 = n0 + adds.reduce((a, b) => a + b.pts.length, 0);
  const grow = <T extends Float32Array | Int32Array | Uint8Array>(a: T, fill: number): T => {
    const out = new (a.constructor as new (n: number) => T)(n1);
    out.set(a);
    out.fill(fill, n0);
    return out;
  };
  g.x = grow(g.x, 0);
  g.z = grow(g.z, 0);
  g.deckY = grow(g.deckY, STILT_SPUR.deckY);
  g.comp = grow(g.comp, -1);
  g.kind = grow(g.kind, 0);
  g.dockOf = grow(g.dockOf, -1);
  let id = n0;
  for (const a of adds) {
    const c = g.comp[a.to];
    const chain = [a.door];
    for (const p of a.pts) {
      g.x[id] = p.x;
      g.z[id] = p.z;
      if (ctx.h(p.x, p.z) >= VILLAGERS.minWalkY) g.deckY[id] = NaN;
      g.comp[id] = c;
      g.adj.push([]);
      chain.push(id++);
    }
    chain.push(a.to);
    g.comp[a.door] = c;
    g.deckY[a.door] = STILT_SPUR.deckY;
    for (let j = 0; j + 1 < chain.length; j++) {
      g.adj[chain[j]].push(chain[j + 1]);
      g.adj[chain[j + 1]].push(chain[j]);
    }
  }
  g.n = n1;
  return adds.length;
}

/** An outpost stop: in front of a lot door (`lot` ≥ 0), or a fixture / landmark. */
export interface Anchor {
  x: number;
  z: number;
  lot: number;
}

/** Stops of an island without a walk graph (Lonely Palm's field station): doors, fixtures, the palm. */
export function outpostAnchors(ctx: LifeCtx, id: number, mask: Mask): Anchor[] {
  const w = ctx.world;
  const out: Anchor[] = [];
  const add = (a: Anchor): void => {
    if (mask(a.x, a.z)) out.push(a);
  };
  (w.lots ?? []).forEach((l, li) => {
    if (l.islandId !== id) return;
    const p = lotLocalToWorld(l, 0, l.d / 2 + WORKERS.outpost.anchorGap);
    add({ x: p.x, z: p.z, lot: li });
  });
  for (const f of w.fixtures ?? []) {
    if (f.islandId !== id) continue;
    add({
      x: f.x + Math.cos(f.rotY) * 1.2,
      z: f.z + Math.sin(f.rotY) * 1.2,
      lot: -1,
    });
  }
  const isl = w.islands[id];
  for (const m of w.landmarks ?? []) {
    if (m.islandId !== id || m.kind !== 'lonelyPalm') continue;
    // step off towards the island centre so the palm stays a clean silhouette
    const a = Math.atan2(isl.cz - m.z, isl.cx - m.x);
    add({
      x: m.x + Math.cos(a) * WORKERS.outpost.palmGap,
      z: m.z + Math.sin(a) * WORKERS.outpost.palmGap,
      lot: -1,
    });
  }
  return out;
}

export interface WorkerSpawn {
  island: number;
  theme: ThemeId;
  /** Walk-graph component, −1 = outpost island. */
  comp: number;
  /** Graph node to start on (the lot door when seated); outposts: unused (−1). */
  node: number;
  /** Seat index the worker starts seated at, −1 = standing. */
  seat: number;
  /** Outpost anchor index to start at. */
  anchor: number;
  /** Near-focus ambient slot (M14c): asleep until the camera focuses its island. */
  ambient?: boolean;
}

export interface WorkerPlan {
  spawns: WorkerSpawn[];
  seats: Seat[];
  /** Outpost anchors per island (empty for graph islands). */
  anchors: Anchor[][];
}

/**
 * Allocate `total` workers over the islands by `THEMES[theme].workers.weight` (D'Hondt), capped by
 * the theme cap and what the island can host (seats + a couple of walkers; outposts take 2). The
 * share `deskShare` of an island's workers start seated.
 */
export function planWorkers(
  ctx: LifeCtx,
  g: WalkGraph,
  mask: Mask,
  total: number,
  rng: Rng,
): WorkerPlan {
  const w = ctx.world;
  attachDeckSpurs(ctx, g);
  const seats = seatsOf(w);
  const compSize = new Map<number, number>();
  for (let i = 0; i < g.n; i++)
    if (g.comp[i] >= 0) compSize.set(g.comp[i], (compSize.get(g.comp[i]) ?? 0) + 1);

  const info = w.islands.map((isl, id) => {
    let comp = -1;
    for (const s of w.settlements ?? []) {
      if (s.islandId !== id || s.hub.node < 0 || s.hub.node >= g.n) continue;
      const c = g.comp[s.hub.node];
      if (c >= 0 && (compSize.get(c) ?? 0) >= 3) {
        comp = c;
        break;
      }
    }
    const mine = seats.map((_s, k) => k).filter((k) => seats[k].island === id);
    const reach =
      comp >= 0 ? mine.filter((k) => seats[k].node >= 0 && g.comp[seats[k].node] === comp) : mine;
    const anchors = comp < 0 ? outpostAnchors(ctx, id, mask) : [];
    const T = THEMES[isl.theme].workers;
    const cap =
      comp >= 0
        ? Math.min(
            T.cap,
            reach.length > 0 ? reach.length + 2 : Math.floor((compSize.get(comp) ?? 0) / 3),
          )
        : anchors.length >= 2
          ? Math.min(T.cap, 2)
          : 0;
    return { id, theme: isl.theme, comp, reach, anchors, weight: cap > 0 ? T.weight : 0, cap, T };
  });
  const quota = allocate(
    total,
    info.map((i) => ({ weight: i.weight, cap: i.cap })),
  );

  const spawns: WorkerSpawn[] = [];
  const anchors: Anchor[][] = info.map((i) => i.anchors);
  info.forEach((it, k) => {
    const q = quota[k];
    if (q <= 0) return;
    const r = rng.fork('workers', it.id);
    // seated at t = 0: prefer seats that type (visible work), the rest in shuffled order
    const order = r.shuffle(it.reach.slice());
    const typing = (s: number): number => (WORKERS.typeAmount[seats[s].pose] > 0 ? 0 : 1);
    // a deck lab (stilt) is only visited on purpose: its typing seats go to the front of the queue
    const remote = (s: number): number =>
      RAISED_FLOOR[w.lots[seats[s].lot].defId] > 0 && typing(s) === 0 ? 0 : 1;
    order.sort((a, b) => remote(a) - remote(b) || typing(a) - typing(b));
    const seated = Math.min(order.length, Math.ceil(q * it.T.deskShare));
    for (let s = 0; s < seated; s++) {
      const seat = order[s];
      spawns.push({
        island: it.id,
        theme: it.theme,
        comp: it.comp,
        node: seats[seat].node,
        seat,
        anchor:
          it.comp < 0
            ? Math.max(
                0,
                it.anchors.findIndex((a) => a.lot === seats[seat].lot),
              )
            : -1,
      });
    }
    const rest = q - seated;
    if (rest <= 0) return;
    if (it.comp < 0) {
      for (let s = 0; s < rest; s++)
        spawns.push({
          island: it.id,
          theme: it.theme,
          comp: -1,
          node: -1,
          seat: -1,
          anchor: (seated + s + 1) % it.anchors.length,
        });
      return;
    }
    const cand: number[] = [];
    for (let n = 0; n < g.n; n++) if (g.comp[n] === it.comp) cand.push(n);
    r.shuffle(cand);
    const chosen: number[] = [];
    for (const minSep of [8, 3, 0]) {
      for (const c of cand) {
        if (chosen.length >= rest) break;
        if (chosen.includes(c)) continue;
        if (
          spawns.every(
            (o) =>
              o.island !== it.id ||
              o.node < 0 ||
              Math.hypot(g.x[o.node] - g.x[c], g.z[o.node] - g.z[c]) >= minSep,
          ) &&
          chosen.every((o) => Math.hypot(g.x[o] - g.x[c], g.z[o] - g.z[c]) >= minSep)
        )
          chosen.push(c);
      }
    }
    for (const node of chosen)
      spawns.push({ island: it.id, theme: it.theme, comp: it.comp, node, seat: -1, anchor: -1 });
  });
  return { spawns, seats, anchors };
}

/**
 * Near-focus ambient slots (TASK-383): `round(ACTIVITY.slots[theme] × scale)` per island that hosts
 * workers (a walk graph, or an outpost with an anchor: its work spots carry it; outposts take at most
 * `ACTIVITY.outpostSlots`). They carry no start position: a slot is placed when it wakes.
 */
export function planAmbient(
  ctx: Pick<LifeCtx, 'world'>,
  base: WorkerPlan,
  comps: readonly number[],
  scale: number,
): WorkerSpawn[] {
  const out: WorkerSpawn[] = [];
  if (!(scale > 0)) return out;
  ctx.world.islands.forEach((isl, id) => {
    const comp = comps[id] ?? -1;
    if (comp < 0 && (base.anchors[id]?.length ?? 0) < 1) return;
    const want = ACTIVITY.slots[isl.theme] ?? 0;
    const room = Math.min(want, comp < 0 ? ACTIVITY.outpostSlots : want);
    // at least 4 where the island can host them: a thin campus is still a campus at low quality
    const n = Math.max(Math.round(room * scale), Math.min(room, 4));
    for (let k = 0; k < n; k++)
      out.push({
        island: id,
        theme: isl.theme,
        comp,
        node: -1,
        seat: -1,
        anchor: -1,
        ambient: true,
      });
  });
  return out;
}
