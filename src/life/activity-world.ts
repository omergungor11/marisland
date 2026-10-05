/**
 * Activity stops (M14c, TASK-383). Pure data (no three.js, no clock, no `Math.random`): the places a
 * department bot walks to besides desks. Two kinds:
 *  - spots: the outdoor `WORK_SPOTS` of free-standing structures (fixtures: easel, barrier gate,
 *    checklist board, stage, rack row, cooling tower, weather mast, observatory, sculptures, solar
 *    row, wind turbine), mapped from structure-local to world with the lot frame;
 *  - queue slots: a short line in front of a kiosk door (coffee).
 * Every stop remembers the walk-graph node a bot routes to and leaves from (outposts without a
 * graph have node −1: they leave from where they stand and need a clear straight line).
 */
import { ACTIVITY } from '../content/life.ts';
import { OFFICE_DEFS, WORK_SPOTS, type WorkPose } from '../content/offices.ts';
import { lotLocalToWorld } from '../world/lot-frame.ts';
import type { WorldData } from '../world/types.ts';
import { lineOk, type Mask, type WalkGraph } from './land-world.ts';

export interface Stop {
  /** Fixture def (spot) or lot def (queue). */
  def: string;
  island: number;
  /** Walk-graph component, −1 = outpost. */
  comp: number;
  /** Node routed to / returned to (−1 for outposts). */
  node: number;
  x: number;
  z: number;
  /** World heading (xz angle) the bot faces while here. */
  hd: number;
  pose: WorkPose;
  /** Queue slot (0 = front) or −1 for a spot. */
  slot: number;
  /** Index of the slot-0 stop of this queue (queue stops are contiguous); own index for a spot. */
  head: number;
  /** Owner tag for the stop mask (fixture index + 1); 0 = none. */
  tag: number;
}

/** A queue follows the lot facing outwards from its door. */
const QUEUE_DEFS: readonly string[] = ['coffeeKiosk'];

/** Walk-graph component of each island (the settlement hub's, ≥ 3 nodes), −1 for outposts. */
export function islandComps(
  world: Pick<WorldData, 'islands' | 'settlements'>,
  g: WalkGraph,
): number[] {
  const size = new Map<number, number>();
  for (let i = 0; i < g.n; i++)
    if (g.comp[i] >= 0) size.set(g.comp[i], (size.get(g.comp[i]) ?? 0) + 1);
  return world.islands.map((_isl, id) => {
    for (const s of world.settlements ?? []) {
      if (s.islandId !== id || s.hub.node < 0 || s.hub.node >= g.n) continue;
      const c = g.comp[s.hub.node];
      if (c >= 0 && (size.get(c) ?? 0) >= 3) return c;
    }
    return -1;
  });
}

const MAX_LEG = 14;

/** The segment (x0, z0) → (x1, z1) keeps ≥ 55 % of the end's distance from `pivot` (does not cut through the structure). */
function clearOf(
  pivot: { x: number; z: number },
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): boolean {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  const t =
    len2 > 0 ? Math.min(1, Math.max(0, ((pivot.x - x0) * dx + (pivot.z - z0) * dz) / len2)) : 0;
  const d = Math.hypot(x0 + dx * t - pivot.x, z0 + dz * t - pivot.z);
  return d >= 0.55 * Math.hypot(x1 - pivot.x, z1 - pivot.z);
}

/** Nearest ground node of `comp` with a clear line to (x, z), or −1. */
function nodeFor(
  g: WalkGraph,
  mask: Mask,
  comp: number,
  x: number,
  z: number,
  pivot?: { x: number; z: number },
): number {
  let best = -1;
  let bd = MAX_LEG;
  for (let n = 0; n < g.n; n++) {
    if (g.comp[n] !== comp || !Number.isNaN(g.deckY[n])) continue;
    const d = Math.hypot(g.x[n] - x, g.z[n] - z);
    if (
      d < bd &&
      lineOk(mask, g.x[n], g.z[n], x, z) &&
      (!pivot || clearOf(pivot, g.x[n], g.z[n], x, z))
    ) {
      bd = d;
      best = n;
    }
  }
  return best;
}

/** Outdoor work spots and queue slots of the world, in a fixed order (fixtures, then lots). */
export function buildStops(
  world: Pick<WorldData, 'fixtures' | 'lots' | 'islands' | 'settlements'> &
    Partial<Pick<WorldData, 'districts'>>,
  g: WalkGraph,
  mask: Mask,
  /** Mask that ignores one fixture's own footprint (tag = fixture index + 1); default: `mask`. */
  stopMask: (x: number, z: number, skip: number) => boolean = (x, z) => mask(x, z),
): Stop[] {
  const comps = islandComps(world, g);
  const out: Stop[] = [];
  (world.fixtures ?? []).forEach((f, fi) => {
    const spots = WORK_SPOTS[f.defId];
    if (!spots || f.defId in OFFICE_DEFS) return;
    const comp = comps[f.islandId] ?? -1;
    // the structure's own footprint (tag fi + 1) does not block its work spots
    const own: Mask = (x, z) => stopMask(x, z, fi + 1);
    for (const s of spots) {
      const p = lotLocalToWorld(f, s.x, s.z);
      if (!own(p.x, p.z)) continue;
      const node = comp >= 0 ? nodeFor(g, own, comp, p.x, p.z, f) : -1;
      if (comp >= 0 && node < 0) continue;
      out.push({
        def: f.defId,
        island: f.islandId,
        comp,
        node,
        x: p.x,
        z: p.z,
        hd: f.rotY - s.face,
        pose: s.pose,
        slot: -1,
        head: out.length,
        tag: fi + 1,
      });
    }
  });
  // districts: stand at the edge of a solar field and inspect it (one stop per side, at most two)
  for (const d of world.districts ?? []) {
    const spec = ACTIVITY.districtSpots[d.kind];
    if (!spec) continue;
    const comp = comps[d.islandId] ?? -1;
    let taken = 0;
    const sides: [number, number, number][] = [
      [0, d.d / 2 + spec.gap, Math.PI],
      [0, -d.d / 2 - spec.gap, 0],
      [d.w / 2 + spec.gap, 0, -Math.PI / 2],
      [-d.w / 2 - spec.gap, 0, Math.PI / 2],
    ];
    for (const [lx, lz, face] of sides) {
      if (taken >= spec.count) break;
      const p = lotLocalToWorld(d, lx, lz);
      if (!mask(p.x, p.z)) continue;
      const node = comp >= 0 ? nodeFor(g, mask, comp, p.x, p.z) : -1;
      if (comp >= 0 && node < 0) continue;
      out.push({
        def: spec.def,
        island: d.islandId,
        comp,
        node,
        x: p.x,
        z: p.z,
        hd: d.rotY - face,
        pose: spec.pose,
        slot: -1,
        head: out.length,
        tag: 0,
      });
      taken++;
    }
  }
  const Q = ACTIVITY.queue;
  for (const l of world.lots ?? []) {
    if (!QUEUE_DEFS.includes(l.defId)) continue;
    const comp = comps[l.islandId] ?? -1;
    if (comp < 0 || l.node < 0 || l.node >= g.n || g.comp[l.node] !== comp) continue;
    const head = out.length;
    for (let k = 0; k < Q.length; k++) {
      const p = lotLocalToWorld(l, 0, l.d / 2 + Q.offset + k * Q.gap);
      if (!mask(p.x, p.z)) break;
      out.push({
        def: l.defId,
        island: l.islandId,
        comp,
        node: l.node,
        x: p.x,
        z: p.z,
        hd: l.rotY + Math.PI,
        pose: 'stand',
        slot: k,
        head,
        tag: 0,
      });
    }
    // a one-slot line is just a spot: keep it only when at least two people can wait
    if (out.length - head < 2) out.length = head;
  }
  return out;
}
