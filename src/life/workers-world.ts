/**
 * Worker world queries and spawn planning (Phase 3, TASK-307). Pure data: no three.js, no clock, no
 * `Math.random` — every choice comes from a label-forked `Rng`, so a seed always yields the same
 * seats, quotas and spawn points. Seats come from `content/offices.ts` WORK_SPOTS through
 * `world/lot-frame.ts`, i.e. exactly where the interior geometry builds its desks.
 */
import { WORKERS } from '../content/life.ts';
import { OFFICE_DEFS, WORK_SPOTS, type WorkPose } from '../content/offices.ts';
import { THEMES } from '../content/themes.ts';
import type { Rng } from '../core/rng.ts';
import { lotLocalToWorld } from '../world/lot-frame.ts';
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
export function seatsOf(world: Pick<WorldData, 'lots'>): Seat[] {
  const out: Seat[] = [];
  (world.lots ?? []).forEach((lot, li) => {
    const spots = WORK_SPOTS[lot.defId];
    if (!spots) return;
    const themed = lot.defId in OFFICE_DEFS;
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
    order.sort((a, b) => typing(a) - typing(b));
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
