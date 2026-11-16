/**
 * Coast feature passes (TASK-603, D-184), after every other prop: rock arches on the headland
 * waterline with sea stacks off them, stones round every waterfall foot, gravel along the last
 * metres of the carved streams. Each pass forks its own stream per island / fall / stream, so no
 * earlier prop moves. Numbers and variant lists: content/biome-scatter.ts (COAST_FEATURES, picks).
 */
import type { Rng } from '../../core/rng.ts';
import * as dm from '../../core/math/dmath.ts';
import { poissonDisc } from '../../core/math/poisson.ts';
import { BIOME_SCATTER, COAST_FEATURES } from '../../content/biome-scatter.ts';
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
 * skerry's or a neighbour's).
 */
const ownsSpot = (world: WorldData, isl: IslandData, x: number, z: number): boolean => {
  const o = ownerAt(world, x, z);
  if (o === isl.id + 1) return true;
  if (o !== 0) return false;
  let mine = false;
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
  scatterStreamGravel(world, store, occupancy, root, counts);
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

/**
 * Rock arches: Poisson waterline candidates per island, scored by the open water on two rings
 * round them (a headland sees water on most rays, a bay little); the best `perIsland` stand with
 * the span along the shore (legs at the waterline) and the opening facing the sea. Sea stacks:
 * 2–3 stones off each arch, standing in the shallows.
 */
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
  const sdfAt = (x: number, z: number): number => sampleGrid(h, world.shoreSdf, x, z, -999);
  const routes: Xz[] = world.boatRoutes.flatMap((r) => r.points).concat(world.seamarks);
  const falls: Xz[] = world.waterfalls.map((f) => ({ x: f.baseX, z: f.baseZ }));
  for (const isl of world.islands) {
    const arches = BIOME_SCATTER[isl.theme].picks.arch;
    if (!arches.length) continue;
    const rng = root.fork('coast-arch', isl.id);
    const docks = world.docks.filter((d) => d.islandId === isl.id);
    const accept = (x: number, z: number): boolean => {
      if (Math.abs(sdfAt(x, z)) > A.sdf) return false;
      const y = heightAt(h, x, z);
      if (y < A.heights[0] || y > A.heights[1]) return false;
      if (!ownsSpot(world, isl, x, z)) return false;
      if (BLOCKED_ZONES.includes(zoneAt(h, world.zone, x, z))) return false;
      // (an island without a bluff has no cove: `coveness` is 1 all round; the dock clearance holds)
      if (bluffOf(isl) && coveness(isl, world.windDir, x, z) > A.maxCove) return false;
      return (
        far(docks, x, z, A.dockClear) &&
        far(routes, x, z, A.routeClear) &&
        far(falls, x, z, A.fallClear)
      );
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
    const cands: {
      x: number;
      z: number;
      nx: number;
      nz: number;
      v: number;
      s: number;
      w: number;
    }[] = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i];
      const z = pts[i + 1];
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
      // the legs along the shore tangent stay at the waterline (not up a wall, not out at sea)
      const hw = A.halfWidth[v] * s;
      const legsOk = [-1, 1].every((side) => {
        const lx = x - nz * side * hw;
        const lz = z + nx * side * hw;
        return Math.abs(sdfAt(lx, lz)) <= A.legSdf;
      });
      if (!legsOk) continue;
      cands.push({ x, z, nx, nz, v, s, w });
    }
    // best headland first (stable: Poisson order breaks ties)
    const order = cands.map((_, i) => i).sort((a, b) => cands[b].w - cands[a].w || a - b);
    const placed: (typeof cands)[number][] = [];
    for (const i of order) {
      if (placed.length >= A.perIsland) break;
      const c = cands[i];
      if (!occupancy.isFreeDisc(c.x, c.z, A.radius)) continue;
      // three yaw: local +z (through the opening) → seaward normal (nx, nz)
      pushProp(
        store,
        counts,
        A.def,
        c.v,
        c.x,
        heightAt(h, c.x, c.z),
        c.z,
        dm.atan2(c.nx, c.nz),
        c.s,
        isl.id,
      );
      occupancy.mark(c.x, c.z, A.radius);
      placed.push(c);
    }
    // ---- sea stacks off each arch
    const sr = root.fork('coast-stacks', isl.id);
    for (const c of placed) {
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
        if (placeStone(world, store, occupancy, counts, sr, isl, x, z, scale)) got++;
      }
    }
  }
}

/**
 * Waterfall foot: stones on both sides of the plunge (never on the fall line, where the foam
 * disc is), at the wall foot or in the shallows, so the fall lands in a rock-rimmed pool.
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

/** Stream-mouth gravel: pebbles on both banks of each carved stream's last `length` u. */
function scatterStreamGravel(
  world: WorldData,
  store: PropStore,
  occupancy: OccupancyGrid,
  root: Rng,
  counts: Counts,
): void {
  const G = COAST_FEATURES.gravel;
  const h = world.height;
  for (const [si, stream] of (world.streams ?? []).entries()) {
    const isl = world.islands[stream.islandId];
    const pts = stream.points;
    if (!isl || pts.length < 2) continue;
    const rng = root.fork('coast-gravel', si);
    // the last `length` u of the polyline, walked back from the mouth
    const seg: { a: Xz; b: Xz; len: number }[] = [];
    let total = 0;
    for (let k = pts.length - 1; k > 0 && total < G.length; k--) {
      const len = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
      if (len < 1e-6) continue;
      seg.push({ a: pts[k], b: pts[k - 1], len });
      total += len;
    }
    if (!seg.length) continue;
    const want = rng.int(G.count[0], G.count[1]);
    let got = 0;
    for (let t = 0; t < G.tries && got < want; t++) {
      let s = rng.range(0, Math.min(total, G.length));
      const side = rng.next() < 0.5 ? -1 : 1;
      const bank = rng.range(G.bank[0], G.bank[1]);
      const scale = rng.range(G.scale[0], G.scale[1]);
      let k = 0;
      while (k < seg.length - 1 && s > seg[k].len) s -= seg[k++].len;
      const { a, b, len } = seg[k];
      const tx = (b.x - a.x) / len;
      const tz = (b.z - a.z) / len;
      const u = Math.min(1, s / len);
      const x = a.x + (b.x - a.x) * u - tz * side * bank;
      const z = a.z + (b.z - a.z) * u + tx * side * bank;
      if (heightAt(h, x, z) < 0.05 || slopeAt(h, x, z) > G.slopeMax) continue;
      if (BLOCKED_ZONES.includes(zoneAt(h, world.zone, x, z))) continue;
      if (placeStone(world, store, occupancy, counts, rng, isl, x, z, scale)) got++;
    }
  }
}
