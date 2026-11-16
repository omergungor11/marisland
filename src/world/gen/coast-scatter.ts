/**
 * Coast feature passes (TASK-603, D-184), after every other prop: rock arches off the headland
 * waterline with sea stacks beside them, tide-pool fields, stones round every waterfall foot.
 * Each pass forks its own stream per island / fall, so no earlier prop moves. Numbers and variant lists: content/biome-scatter.ts (COAST_FEATURES, picks).
 */
import type { Rng } from '../../core/rng.ts';
import * as dm from '../../core/math/dmath.ts';
import { poissonDisc } from '../../core/math/poisson.ts';
import { BIOME_SCATTER, COAST_FEATURES } from '../../content/biome-scatter.ts';
import { ROCK_ARCH } from '../../content/biomes.ts';
import { BLOCKED_ZONES } from '../../content/placement.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import type { createPropStore } from '../prop-store.ts';
import { heightAt, sampleGrid, zoneAt, type IslandData, type WorldData } from '../types.ts';
import { pushProp } from './biome-scatter.ts';
import { bluffOf, coveness } from './heightfield.ts';
import { ownerAt, slopeAt, type OccupancyGrid } from './scatter.ts';

type Counts = Record<string, number>;
type PropStore = ReturnType<typeof createPropStore>;
type Xz = { x: number; z: number };

const far = (pts: readonly Xz[], x: number, z: number, d: number): boolean =>
  pts.every((p) => (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) >= d * d);

/**
 * A sample on the island's land, or water whose land within 2.5 u is this island's only (not a
 * skerry's or a neighbour's; with `open`, also water with no land within 2.5 u).
 */
const ownsSpot = (
  world: WorldData,
  isl: IslandData,
  x: number,
  z: number,
  open = false,
): boolean => {
  const o = ownerAt(world, x, z);
  if (o === isl.id + 1) return true;
  if (o !== 0) return false;
  // `open`: open water with no other land within 2.5 u is fine too (an arch pushed off the shore)
  let mine = open;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const n = ownerAt(world, x + dm.cos(a) * 2.5, z + dm.sin(a) * 2.5);
    if (n === isl.id + 1) mine = true;
    else if (n !== 0) return false;
  }
  return mine;
};

/** A stone of the island's coast set, if its footprint is free; marks it. */
function placeStone(
  world: WorldData,
  store: PropStore,
  occupancy: OccupancyGrid,
  counts: Counts,
  rng: Rng,
  isl: IslandData,
  x: number,
  z: number,
  scale: number,
): boolean {
  const stone = BIOME_SCATTER[isl.theme].stone;
  const variant = stone.variants[rng.int(0, stone.variants.length - 1)];
  const rotY = rng.range(0, Math.PI * 2);
  const r = PROP_DEFS[PROP_DEF_INDEX[stone.def]].footprint * scale;
  if (!occupancy.isFreeDisc(x, z, r)) return false;
  pushProp(
    store,
    counts,
    stone.def,
    variant,
    x,
    heightAt(world.height, x, z),
    z,
    rotY,
    scale,
    isl.id,
  );
  occupancy.mark(x, z, r);
  return true;
}

export function scatterCoastFeatures(
  world: WorldData,
  store: PropStore,
  occupancy: OccupancyGrid,
  root: Rng,
  counts: Counts,
): void {
  scatterArches(world, store, occupancy, root, counts);
  scatterTidePools(world, store, occupancy, root, counts);
  scatterFallFeet(world, store, occupancy, root, counts);
}

/** Tide-pool fields on the flat wet shore at the waterline, `spacing` u apart, shuffled order. */
function scatterTidePools(
  world: WorldData,
  store: PropStore,
  occupancy: OccupancyGrid,
  root: Rng,
  counts: Counts,
): void {
  const P = COAST_FEATURES.tide;
  const h = world.height;
  const fp = PROP_DEFS[PROP_DEF_INDEX[P.def]].footprint;
  for (const isl of world.islands) {
    const list = BIOME_SCATTER[isl.theme].picks.tide;
    if (!list.length) continue;
    const rng = root.fork('coast-tide', isl.id);
    const accept = (x: number, z: number): boolean => {
      if (ownerAt(world, x, z) !== isl.id + 1) return false;
      const s = sampleGrid(h, world.shoreSdf, x, z, -999);
      if (s < P.shore[0] || s > P.shore[1]) return false;
      const zone = zoneAt(h, world.zone, x, z);
      if (!P.zones.includes(zone) || BLOCKED_ZONES.includes(zone)) return false;
      const y = heightAt(h, x, z);
      return y >= P.heights[0] && y <= P.heights[1] && slopeAt(h, x, z) <= P.slopeMax;
    };
    const pts = poissonDisc(
      rng,
      isl.minX - 4,
      isl.minZ - 4,
      isl.maxX + 4,
      isl.maxZ + 4,
      P.minDist,
      accept,
      6000,
    );
    const order = rng.shuffle(Array.from({ length: pts.length / 2 }, (_, i) => i));
    const placed: Xz[] = [];
    for (const i of order) {
      if (placed.length >= P.perIsland) break;
      const x = pts[i * 2];
      const z = pts[i * 2 + 1];
      const variant = list[rng.int(0, list.length - 1)];
      const scale = rng.range(P.scale[0], P.scale[1]);
      const rotY = rng.range(0, Math.PI * 2);
      if (!far(placed, x, z, P.spacing) || !occupancy.isFreeDisc(x, z, fp * scale)) continue;
      pushProp(store, counts, P.def, variant, x, heightAt(h, x, z), z, rotY, scale, isl.id);
      occupancy.mark(x, z, fp * scale);
      placed.push({ x, z });
    }
  }
}

/** A sited arch: centre, yaw (local +z = the opening axis), base y, view score and the push. */
export interface ArchFit {
  x: number;
  z: number;
  y: number;
  rotY: number;
  /** Open-water share through the opening, the weaker side (0–1). */
  view: number;
  push: number;
  score: number;
}

/**
 * Fit a `variant` × `scale` arch at (x, z) with yaw `rotY` (three yaw: local +z, the opening
 * axis, → (sin, cos); the span, local +x, → (cos, −sin)): null when a leg sits inside a wall or
 * in the air, the ground fills the opening, or either side of the opening sees too little open
 * water (TASK-682, numbers COAST_FEATURES.arch).
 */
export function fitArch(
  world: WorldData,
  x: number,
  z: number,
  rotY: number,
  variant: number,
  scale: number,
): { y: number; view: number } | null {
  const A = COAST_FEATURES.arch;
  const h = world.height;
  const ox = dm.sin(rotY);
  const oz = dm.cos(rotY);
  const sx = oz;
  const sz = -ox;
  const at = (u: number, w: number): number =>
    heightAt(h, x + sx * u + ox * w, z + sz * u + oz * w);
  // the variant's shape (TASK-683: variant = biome block x shape, the block is only the stone)
  const shape = variant % ROCK_ARCH.shapes;
  const leg = A.legAt[shape] * scale;
  const legs = [-1, 1].map((side) => [-A.depth, 0, A.depth].map((w) => at(side * leg, w)));
  const y = (legs[0][1] + legs[1][1]) / 2;
  if (y < A.base[0] || y > A.base[1]) return null;
  for (const l of legs) for (const g of l) if (g > y + A.legBury || g < y - A.legFloat) return null;
  // the outer flank of each leg (its foot is a tube `tube` u thick) stays out of the ground too
  for (const side of [-1, 1])
    for (const w of [-A.depth, 0, A.depth])
      if (at(side * (leg + A.tube * scale), w) > y + A.flankBury) return null;
  // under the opening the ground stays below the line between the two leg feet
  const inner = Math.max(0, leg - A.tube * scale);
  for (const u of [-inner, -inner / 2, 0, inner / 2, inner]) {
    const line = legs[0][1] + ((legs[1][1] - legs[0][1]) * (u + leg)) / (2 * leg);
    for (const w of [-A.depth, 0, A.depth]) if (at(u, w) > line + A.openClear) return null;
  }
  // sight lines through the opening, both ways: from an eye looking down `eyeSlope` (drop per u)
  // through a point `openAt` of the way up the opening; the line sees sea (it meets y = 0 over
  // water) or sky (nothing within `viewRun` u), not a wall (the ground rises over it first)
  const top = (ROCK_ARCH.leg[shape] + ROCK_ARCH.span[shape] * ROCK_ARCH.rise[shape]) * scale;
  let view = 1;
  for (const dir of [-1, 1]) {
    let clear = 0;
    let rays = 0;
    for (const slope of A.eyeSlope)
      for (const f of A.openAt)
        for (const u of A.viewLat) {
          rays++;
          const y0 = y + f * top;
          let hit = false;
          for (let t = A.depth; t <= A.viewRun; t += A.viewStep) {
            const ry = y0 - slope * t;
            const g = at(u, dir * t);
            if (g >= ry) {
              hit = true;
              break;
            }
            if (ry <= 0) break;
          }
          if (!hit) clear++;
        }
    view = Math.min(view, clear / rays);
  }
  return view >= A.minView ? { y, view } : null;
}

/**
 * Rock arches: Poisson waterline candidates per island, scored by the open water on two rings
 * round them (a headland sees water on most rays, a bay little). Each one is pushed seaward and
 * turned until it stands clear of the wall with open water through the opening on both sides
 * (`fitArch`); the best fit per island stands (TASK-682). Sea stacks: 2–3 stones off each arch,
 * in the shallows, clear of the opening axis.
 */
export function archFits(
  world: WorldData,
  isl: IslandData,
  rng: Rng,
): { cands: Xz[]; fits: (ArchFit & { v: number; s: number; nx: number; nz: number })[] } {
  const A = COAST_FEATURES.arch;
  const h = world.height;
  const arches = BIOME_SCATTER[isl.theme].picks.arch;
  const sdfAt = (x: number, z: number): number => sampleGrid(h, world.shoreSdf, x, z, -999);
  const routes: Xz[] = world.boatRoutes.flatMap((r) => r.points).concat(world.seamarks);
  const falls: Xz[] = world.waterfalls.map((f) => ({ x: f.baseX, z: f.baseZ }));
  const docks = world.docks.filter((d) => d.islandId === isl.id);
  const clear = (x: number, z: number): boolean =>
    far(docks, x, z, A.dockClear) &&
    far(routes, x, z, A.routeClear) &&
    far(falls, x, z, A.fallClear);
  const accept = (x: number, z: number): boolean => {
    if (Math.abs(sdfAt(x, z)) > A.sdf) return false;
    const y = heightAt(h, x, z);
    if (y < A.heights[0] || y > A.heights[1]) return false;
    if (!ownsSpot(world, isl, x, z)) return false;
    if (BLOCKED_ZONES.includes(zoneAt(h, world.zone, x, z))) return false;
    // (an island without a bluff has no cove: `coveness` is 1 all round; the dock clearance holds)
    if (bluffOf(isl) && coveness(isl, world.windDir, x, z) > A.maxCove) return false;
    return clear(x, z);
  };
  const pts = poissonDisc(
    rng,
    isl.minX - 6,
    isl.minZ - 6,
    isl.maxX + 6,
    isl.maxZ + 6,
    A.minDist,
    accept,
    6000,
  );
  const cands: Xz[] = [];
  const fits: (ArchFit & { v: number; s: number; nx: number; nz: number })[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i];
    const z = pts[i + 1];
    cands.push({ x, z });
    const v = arches[rng.int(0, arches.length - 1)];
    const s = rng.range(A.scale[0], A.scale[1]);
    let wet = 0;
    for (const ring of A.ring)
      for (let k = 0; k < A.rays; k++) {
        const a = (k / A.rays) * Math.PI * 2;
        if (heightAt(h, x + dm.cos(a) * ring, z + dm.sin(a) * ring) < 0) wet++;
      }
    const w = wet / (A.rays * A.ring.length);
    if (w < A.minWater) continue;
    // seaward normal = −∇ shore SDF
    let nx = sdfAt(x - 1.5, z) - sdfAt(x + 1.5, z);
    let nz = sdfAt(x, z - 1.5) - sdfAt(x, z + 1.5);
    const len = Math.hypot(nx, nz);
    if (len < 1e-3) continue;
    nx /= len;
    nz /= len;
    let best: ArchFit | null = null;
    for (let push = 0; push <= A.pushMax + 1e-6; push += A.pushStep) {
      const px = x + nx * push;
      const pz = z + nz * push;
      if (!ownsSpot(world, isl, px, pz, true) || !clear(px, pz)) continue;
      for (let k = 0; k < A.yaws; k++) {
        const rotY = (k / A.yaws) * Math.PI;
        const f = fitArch(world, px, pz, rotY, v, s);
        if (!f) continue;
        const score = f.view + A.headland * w - A.pushCost * push;
        if (!best || score > best.score)
          best = { x: px, z: pz, y: f.y, rotY, view: f.view, push, score };
      }
    }
    if (best) fits.push({ ...best, v, s, nx, nz });
  }
  return { cands, fits };
}

function scatterArches(
  world: WorldData,
  store: PropStore,
  occupancy: OccupancyGrid,
  root: Rng,
  counts: Counts,
): void {
  const A = COAST_FEATURES.arch;
  const S = COAST_FEATURES.stacks;
  const h = world.height;
  const routes: Xz[] = world.boatRoutes.flatMap((r) => r.points).concat(world.seamarks);
  for (const isl of world.islands) {
    if (!BIOME_SCATTER[isl.theme].picks.arch.length) continue;
    const { fits } = archFits(world, isl, root.fork('coast-arch', isl.id));
    // best view first (stable: Poisson order breaks ties)
    const order = fits.map((_, i) => i).sort((a, b) => fits[b].score - fits[a].score || a - b);
    const placed: (typeof fits)[number][] = [];
    for (const i of order) {
      if (placed.length >= A.perIsland) break;
      const c = fits[i];
      if (!occupancy.isFreeDisc(c.x, c.z, A.radius)) continue;
      pushProp(store, counts, A.def, c.v, c.x, c.y, c.z, c.rotY, c.s, isl.id);
      occupancy.mark(c.x, c.z, A.radius);
      placed.push(c);
    }
    // ---- sea stacks off each arch (seaward of the waterline candidate's normal), off its axis
    const sr = root.fork('coast-stacks', isl.id);
    for (const c of placed) {
      const ox = dm.sin(c.rotY);
      const oz = dm.cos(c.rotY);
      const want = sr.int(S.count[0], S.count[1]);
      let got = 0;
      for (let t = 0; t < S.tries && got < want; t++) {
        const out = sr.range(S.out[0], S.out[1]);
        const along = sr.range(-S.along, S.along);
        const scale = sr.range(S.scale[0], S.scale[1]);
        const x = c.x + c.nx * out - c.nz * along;
        const z = c.z + c.nz * out + c.nx * along;
        const y = heightAt(h, x, z);
        if (y < S.heights[0] || y > S.heights[1] || !far(routes, x, z, A.routeClear)) continue;
        // lateral distance to the opening axis through the arch centre
        if (Math.abs((x - c.x) * oz - (z - c.z) * ox) < S.axisClear) continue;
        if (placeStone(world, store, occupancy, counts, sr, isl, x, z, scale)) got++;
      }
    }
  }
}

/**
 * Waterfall foot: stones on both sides of the plunge (never on the fall line, where the foam
 * disc is), in the plunge pool or on the flat foot (slope cap: never up the wall), so the fall
 * lands in a rock-rimmed pool.
 */
function scatterFallFeet(
  world: WorldData,
  store: PropStore,
  occupancy: OccupancyGrid,
  root: Rng,
  counts: Counts,
): void {
  const F = COAST_FEATURES.fall;
  const h = world.height;
  for (const [fi, fall] of world.waterfalls.entries()) {
    const isl = world.islands[fall.islandId];
    if (!isl) continue;
    const rng = root.fork('coast-fall', fi);
    const fx = dm.cos(fall.rotY);
    const fz = dm.sin(fall.rotY);
    const want = rng.int(F.count[0], F.count[1]);
    let got = 0;
    for (let t = 0; t < F.tries && got < want; t++) {
      const side = t % 2 === 0 ? 1 : -1;
      const lat = fall.width / 2 + rng.range(F.ring[0], F.ring[1]);
      const along = rng.range(F.along[0], F.along[1]);
      const scale = rng.range(F.scale[0], F.scale[1]);
      const x = fall.baseX - fz * side * lat + fx * along;
      const z = fall.baseZ + fx * side * lat + fz * along;
      const y = heightAt(h, x, z);
      if (y < F.heights[0] || y > F.heights[1] || slopeAt(h, x, z) > F.slopeMax) continue;
      if (BLOCKED_ZONES.includes(zoneAt(h, world.zone, x, z))) continue;
      if (placeStone(world, store, occupancy, counts, rng, isl, x, z, scale)) got++;
    }
  }
}
