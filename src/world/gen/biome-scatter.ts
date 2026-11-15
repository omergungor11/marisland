/**
 * Biome placement passes after the rule scatter (TASK-600, D-179): lot edges (flowering hedge
 * shrubs + a garden plot behind the house lots) and harbour dressing (harbourBoats in the dock
 * side slots, dockDressing on the decks). Each pass forks its own stream per lot / island, so no
 * earlier prop moves. Numbers and variant lists: content/biome-scatter.ts.
 */
import type { Rng } from '../../core/rng.ts';
import * as dm from '../../core/math/dmath.ts';
import { BIOME_SCATTER, HARBOUR_DRESSING, LOT_EDGES } from '../../content/biome-scatter.ts';
import { boatVariant, HARBOUR_BOAT } from '../../content/biomes.ts';
import { BLOCKED_ZONES, PROP_CAPACITY } from '../../content/placement.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { DOCK } from '../../content/settlements.ts';
import { lotLocalToWorld, lotYaw } from '../lot-frame.ts';
import type { createPropStore } from '../prop-store.ts';
import { heightAt, zoneAt, type WorldData } from '../types.ts';
import { chunkIdAt, slopeAt, type OccupancyGrid } from './scatter.ts';

type Counts = Record<string, number>;
type PropStore = ReturnType<typeof createPropStore>;

function pushProp(
  store: PropStore,
  counts: Counts,
  def: string,
  variant: number,
  x: number,
  y: number,
  z: number,
  rotY: number,
  scale: number,
  islandId: number,
): void {
  const di = PROP_DEF_INDEX[def];
  const d = PROP_DEFS[di];
  if (!d || store.count >= PROP_CAPACITY - 1) return;
  store.push(di, variant, x, y, z, rotY, scale, islandId, chunkIdAt(x, z), d.flags);
  counts[def] = (counts[def] ?? 0) + 1;
}

/** Hedge shrubs at the back corners / middle of every house lot, a garden plot behind it. */
export function scatterLotEdges(
  world: WorldData,
  store: PropStore,
  occupancy: OccupancyGrid,
  root: Rng,
  counts: Counts,
): void {
  const L = LOT_EDGES;
  const h = world.height;
  const ground = (x: number, z: number): boolean =>
    heightAt(h, x, z) >= L.minY &&
    slopeAt(h, x, z) <= L.slopeMax &&
    !BLOCKED_ZONES.includes(zoneAt(h, world.zone, x, z));
  for (const [li, lot] of world.lots.entries()) {
    if (!L.defs.includes(lot.defId)) continue;
    const list = BIOME_SCATTER[world.islands[lot.islandId].theme].picks[L.hedge.pick];
    if (!list.length) continue;
    const rng = root.fork('lot-edges', li);
    const yaw = lotYaw(lot);
    const back = -(lot.d / 2 + L.hedge.back);
    for (const lx of [-lot.w / 2, 0, lot.w / 2]) {
      const variant = list[rng.int(0, list.length - 1)];
      const scale = rng.range(L.hedge.scale[0], L.hedge.scale[1]);
      const rot = rng.range(0, Math.PI * 2);
      const p = lotLocalToWorld(lot, lx, back);
      const r = PROP_DEFS[PROP_DEF_INDEX[L.hedge.def]].footprint * scale;
      if (!ground(p.x, p.z) || !occupancy.isFreeDisc(p.x, p.z, r * 0.6)) continue;
      pushProp(
        store,
        counts,
        L.hedge.def,
        variant,
        p.x,
        heightAt(h, p.x, p.z),
        p.z,
        rot,
        scale,
        lot.islandId,
      );
      occupancy.mark(p.x, p.z, r * 0.6);
    }
    const g = lotLocalToWorld(lot, 0, -(lot.d / 2 + L.garden.back));
    const gv = rng.int(0, L.garden.variants - 1);
    const gr = PROP_DEFS[PROP_DEF_INDEX[L.garden.def]].footprint;
    if (!ground(g.x, g.z) || !occupancy.isFreeDisc(g.x, g.z, gr)) continue;
    pushProp(
      store,
      counts,
      L.garden.def,
      gv,
      g.x,
      heightAt(h, g.x, g.z),
      g.z,
      yaw,
      1,
      lot.islandId,
    );
    occupancy.mark(g.x, g.z, gr);
  }
}

/**
 * harbourBoats in the free side slots of every pier (parallel to it, bow seaward, y = waterline;
 * clear of the life moorings, the boat routes and the seamarks), dockDressing on the decks.
 */
export function scatterHarbours(
  world: WorldData,
  store: PropStore,
  occupancy: OccupancyGrid,
  root: Rng,
  counts: Counts,
): void {
  const H = HARBOUR_DRESSING;
  const h = world.height;
  const routePts = world.boatRoutes.flatMap((r) => r.points);
  const far = (x: number, z: number, pts: readonly { x: number; z: number }[], d: number) =>
    pts.every((p) => (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) >= d * d);
  for (const [di, dock] of world.docks.entries()) {
    const biome = BIOME_SCATTER[world.islands[dock.islandId].theme];
    const theme = world.islands[dock.islandId].theme;
    const rng = root.fork('harbour', di);
    const fx = dm.cos(dock.rotY);
    const fz = dm.sin(dock.rotY);
    // perp = the barrel / lantern side of the planks (render/props/settlement-props.ts)
    const px = -fz;
    const pz = fx;
    // three yaw: local +z (bow) → (fx, fz); local +x (planks, ladder) → (fx, fz)
    const bow = dm.atan2(fx, fz);
    const planks = dm.atan2(-fz, fx);
    const boatSides: number[] = [];
    // ---- boats
    if (biome.boats.length) {
      const slots: { x: number; z: number; side: number; k: number }[] = [];
      for (let k = dock.segments - 1; k >= 1; k--)
        for (const side of [1, -1]) {
          const a = DOCK.segment * k + 1;
          slots.push({
            x: dock.x + fx * a + px * side * DOCK.mooringSide,
            z: dock.z + fz * a + pz * side * DOCK.mooringSide,
            side,
            k,
          });
        }
      const placed: { x: number; z: number; len: number }[] = [];
      for (const s of slots) {
        if (placed.length >= H.boatsPerDock) break;
        const hull = biome.boats[rng.int(0, biome.boats.length - 1)];
        const len = HARBOUR_BOAT.length[hull];
        if (heightAt(h, s.x, s.z) > -(HARBOUR_BOAT.draft[hull] + H.keel)) continue;
        if (placed.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < (o.len + len) / 2 + 0.4))
          continue;
        const clearOfMoorings = world.moorings.every(
          (m) =>
            Math.hypot(m.x - s.x, m.z - s.z) >=
            len / 2 + (m.defId === 'sailboat' ? H.mooringClear : H.mooringClear / 2),
        );
        if (!clearOfMoorings) continue;
        if (!far(s.x, s.z, routePts, H.routeClear) || !far(s.x, s.z, world.seamarks, H.routeClear))
          continue;
        // hull ends and middle, a little outboard of the slot (the pier's own pad stays inboard)
        const free = [-0.35, 0, 0.35].every((t) =>
          occupancy.isFreeDisc(
            s.x + fx * t * len + px * s.side * H.outboard,
            s.z + fz * t * len + pz * s.side * H.outboard,
            H.hullTest,
          ),
        );
        if (!free) continue;
        pushProp(
          store,
          counts,
          'harbourBoat',
          boatVariant(theme, hull),
          s.x,
          0,
          s.z,
          bow,
          1,
          dock.islandId,
        );
        occupancy.mark(s.x, s.z, H.boatRadius);
        placed.push({ x: s.x, z: s.z, len });
        boatSides.push(s.side);
      }
    }
    // ---- deck dressing: the far segments first, one item each, the side away from the barrels
    if (!biome.dressing.length || dock.segments < 2) continue;
    const items = rng.shuffle(biome.dressing.slice());
    let k = dock.segments - 2;
    for (const v of items) {
      if (k < 1) break;
      const a = DOCK.segment * k + 1;
      const cx = dock.x + fx * a;
      const cz = dock.z + fz * a;
      if (v === 3) {
        // the ladder hangs off the deck edge on a boat's side (else the free side) over water
        const side = boatSides[0] ?? -1;
        const x = cx + fx * H.ladderAlong + px * side * H.ladderSide;
        const z = cz + fz * H.ladderAlong + pz * side * H.ladderSide;
        if (heightAt(h, x, z) > -H.ladderDepth) continue;
        // ladder plane = local x-y: along the planks, rotated a half turn on the −perp side
        pushProp(
          store,
          counts,
          'dockDressing',
          v,
          x,
          H.deckY,
          z,
          side > 0 ? planks : planks + Math.PI,
          1,
          dock.islandId,
        );
      } else {
        const x = cx - px * H.itemSide;
        const z = cz - pz * H.itemSide;
        pushProp(
          store,
          counts,
          'dockDressing',
          v,
          x,
          H.deckY,
          z,
          rng.range(0, Math.PI * 2),
          1,
          dock.islandId,
        );
      }
      k--;
    }
  }
}
