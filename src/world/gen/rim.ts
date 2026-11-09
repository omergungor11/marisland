/**
 * Bluff rim after the sites (TASK-615, M50 G6 / outcrops): the wall-height delta of the bluff pass
 * (gen/rim-shape.ts: headlands higher, the cove side lower, a terrace step) applied clear of every
 * planned piece, then rock knobs on the plateau lip. Pure data.
 */
import type { Rng } from '../../core/rng.ts';
import { smoothstep } from '../../core/math/index.ts';
import { ARCHETYPES, BLUFF, RIM } from '../../content/islands.ts';
import type { IslandData, WorldData } from '../types.ts';
import { Zone } from '../types.ts';
import { cellX, cellZ, gridRange } from './grid.ts';
import { bluffOf, coveness } from './heightfield.ts';
import { Tag } from './profiles.ts';
import { createOccupancy, type OccupancyGrid } from './scatter.ts';
import { deriveZoneCell, type ZoneCellContext } from './zones.ts';
import { OCC_STRUCTURE } from './settlements.ts';

/**
 * Apply the rim delta (TASK-615, `RawLand.rimDelta` from the bluff pass) after the sites: each
 * sample changes by delta · smoothstep(RIM.keep[0], RIM.keep[1], d), d = distance (u) to the
 * nearest occupied cell (lots, landmarks, docks, paths) or fixture, so every planned piece keeps
 * the ground it was planned on. Steep samples of the modulated wall band get Tag.cliff, and every
 * changed sample (and its neighbours) whose zone still equals the generation rule is re-derived.
 */
export function applyRim(
  world: WorldData,
  delta: Float32Array,
  band: Uint8Array,
  occ: OccupancyGrid,
  noise: ZoneCellContext['noise'],
): void {
  const h = world.height;
  const n = h.n;
  const blocked = createOccupancy(occ.data.slice());
  for (const f of world.fixtures) blocked.mark(f.x, f.z, 1);
  const [k0, k1] = RIM.keep;
  const steps: number[] = [];
  for (let r = 1; r <= Math.ceil(k1); r++) steps.push(r);
  const ctx: ZoneCellContext = {
    h,
    sdf: world.shoreSdf,
    islandMap: world.islandMap,
    tags: world.genAux.tags,
    islands: world.islands,
    islets: world.islets,
    windDir: world.windDir,
    noise,
  };
  const changed: number[] = [];
  const add = new Float32Array(n * n);
  for (let iz = 1; iz < n - 1; iz++)
    for (let ix = 1; ix < n - 1; ix++) {
      const i = iz * n + ix;
      const dv = delta[i];
      if (dv === 0 || world.shoreSdf[i] <= 0) continue;
      const x = cellX(ix);
      const z = cellZ(iz);
      let d = Math.ceil(k1);
      for (const r of steps)
        if (!blocked.isFree(x, z, r)) {
          d = r - 1;
          break;
        }
      const v = dv * smoothstep(k0, k1, d);
      if (Math.abs(v) < 1e-4) continue;
      add[i] = v;
      changed.push(i);
    }
  // cells whose zone follows the generation rule (sites paint the rest): re-derived afterwards
  const touched = new Set<number>();
  for (const i of changed) for (const j of [i, i - 1, i + 1, i - n, i + n]) touched.add(j);
  const follow: number[] = [];
  for (const j of touched) {
    if (world.shoreSdf[j] <= 0 || world.islandMap[j] === 0) continue;
    const ix = j % n;
    if (world.zone[j] === deriveZoneCell(ctx, ix, (j - ix) / n, 0)) follow.push(j);
  }
  const before = h.data.slice();
  for (const i of changed) h.data[i] += add[i];
  // the bluff pass tags steep wall-band cells; a cell steep before and flat now (the terrace
  // ledge) loses the tag, a newly steep one gains it (profile tags on flat cells stay)
  const k = BLUFF.cliffTagSlope * 2 * h.cellSize;
  const tags = world.genAux.tags;
  const grad = (d: Float32Array, j: number): number =>
    Math.hypot(d[j + 1] - d[j - 1], d[j + n] - d[j - n]);
  for (const j of touched) {
    if (!band[j]) continue;
    const steep = grad(h.data, j) > k;
    if (steep) tags[j] |= Tag.cliff;
    else if (grad(before, j) > k) tags[j] &= ~Tag.cliff;
  }
  for (const j of follow) {
    const ix = j % n;
    world.zone[j] = deriveZoneCell(ctx, ix, (j - ix) / n, 0);
  }
}

/** Zones a knob may sit on (plateau ground, never paved / sand / wall). */
const KNOB_ZONES = new Set<number>([Zone.grass, Zone.meadow, Zone.forest, Zone.rock, Zone.field]);

/**
 * Rock knobs on the plateau lip (TASK-615): `outcrops` per island (one roll each), raised bumps of
 * RIM.outcrop.height u stretched along the rim, on lip samples (plateau ground with a wall drop of
 * ≥ minDrop u within lipReach u) outside the cove, clear of everything the sites marked in the
 * occupancy grid (paths: the knob core only), of fixtures and of each other. Runs after the sites, before the scatter: heights
 * and zones change only where nothing was planned. Knob cells get Tag.outcrop (→ Zone.rock).
 */
export function raiseOutcrops(world: WorldData, occ: OccupancyGrid, rng: Rng): void {
  const h = world.height;
  const n = h.n;
  const O = RIM.outcrop;
  for (const isl of world.islands) {
    const range = ARCHETYPES[isl.archetype].rim?.outcrops;
    if (!range || !bluffOf(isl)) continue;
    const r = rng.fork('island', isl.id);
    const want = r.int(range[0], range[1]);
    const fixtures = world.fixtures.filter((f) => f.islandId === isl.id);
    const [x0, x1] = gridRange(isl.minX, isl.maxX);
    const [z0, z1] = gridRange(isl.minZ, isl.maxZ);
    const reach = Math.ceil(O.lipReach / h.cellSize);
    const cand: number[] = [];
    for (let iz = z0 + reach; iz <= z1 - reach; iz++)
      for (let ix = x0 + reach; ix <= x1 - reach; ix++) {
        const i = iz * n + ix;
        if (world.islandMap[i] !== isl.id + 1 || !KNOB_ZONES.has(world.zone[i])) continue;
        const y = h.data[i];
        let low = y;
        for (let dz = -reach; dz <= reach; dz++)
          for (let dx = -reach; dx <= reach; dx++) low = Math.min(low, h.data[i + dz * n + dx]);
        if (y - low < O.minDrop) continue;
        const x = cellX(ix);
        const z = cellZ(iz);
        if (coveness(isl, world.windDir, x, z) > O.maxCove) continue;
        cand.push(i);
      }
    // seeded order (Fisher–Yates), then greedy with spacing and clearance
    for (let k = cand.length - 1; k > 0; k--) {
      const j = r.int(0, k);
      const tmp = cand[k];
      cand[k] = cand[j];
      cand[j] = tmp;
    }
    const placed: { x: number; z: number }[] = [];
    for (const i of cand) {
      if (placed.length >= want) break;
      const x = cellX(i % n);
      const z = cellZ(Math.floor(i / n));
      const R = O.radius[1] * O.stretch;
      if (placed.some((q) => Math.hypot(q.x - x, q.z - z) < O.spacing)) continue;
      // structures and fixtures clear the whole knob; a path may pass its gentle outer flank
      if (!occ.isFree(x, z, R + O.clear, OCC_STRUCTURE)) continue;
      if (!occ.isFree(x, z, R * O.core + O.clear)) continue;
      if (fixtures.some((f) => Math.hypot(f.x - x, f.z - z) < R + O.clear)) continue;
      placed.push({ x, z });
    }
    for (const q of placed) raiseKnob(world, isl, q.x, q.z, r);
  }
}

/** One knob (main bump + a smaller satellite along the rim) at (x, z). */
function raiseKnob(world: WorldData, isl: IslandData, x: number, z: number, r: Rng): void {
  const h = world.height;
  const n = h.n;
  const O = RIM.outcrop;
  const sdf = world.shoreSdf;
  const ix = Math.round((x - h.originX) / h.cellSize);
  const iz = Math.round((z - h.originZ) / h.cellSize);
  // rim tangent from the shore-distance gradient
  const gx = sdf[iz * n + ix + 1] - sdf[iz * n + ix - 1];
  const gz = sdf[(iz + 1) * n + ix] - sdf[(iz - 1) * n + ix];
  const gl = Math.hypot(gx, gz) || 1;
  const tx = -gz / gl;
  const tz = gx / gl;
  const H = r.range(O.height[0], O.height[1]);
  const R = r.range(O.radius[0], O.radius[1]);
  const side = r.chance(0.5) ? 1 : -1;
  const off = R * O.stretch * r.range(0.7, 1);
  const bumps = [
    { x, z, H, R },
    {
      x: x + tx * off * side,
      z: z + tz * off * side,
      H: H * r.range(O.satellite[0], O.satellite[1]),
      R: R * 0.75,
    },
  ];
  const tags = world.genAux.tags;
  const ext = Math.ceil((R * O.stretch) / h.cellSize) + Math.ceil(off / h.cellSize) + 1;
  for (let jz = iz - ext; jz <= iz + ext; jz++)
    for (let jx = ix - ext; jx <= ix + ext; jx++) {
      const j = jz * n + jx;
      if (world.islandMap[j] !== isl.id + 1 || sdf[j] <= 0) continue;
      const px = cellX(jx);
      const pz = cellZ(jz);
      let lift = 0;
      let core = false;
      for (const b of bumps) {
        const dx = px - b.x;
        const dz = pz - b.z;
        const u = (dx * tx + dz * tz) / (b.R * O.stretch);
        const v = (-dx * tz + dz * tx) / b.R;
        const d2 = u * u + v * v;
        if (d2 >= 1) continue;
        const f = 1 - d2;
        lift = Math.max(lift, b.H * f * f);
        if (d2 < O.core * O.core) core = true;
      }
      if (lift <= 0) continue;
      h.data[j] += lift;
      if (core) {
        tags[j] |= Tag.outcrop;
        world.zone[j] = Zone.rock;
      }
    }
}
