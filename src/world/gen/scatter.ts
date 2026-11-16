import { createRng, type Rng } from '../../core/rng.ts';
import { createNoise } from '../../core/noise.ts';
import { poissonDisc } from '../../core/math/poisson.ts';
import {
  ISLET_SCATTER,
  PLACEMENT_RULES,
  BLOCKED_ZONES,
  OCCUPANCY_CELL,
  PROP_CAPACITY,
  GROUND_COVER_CAP,
  type PlacementRule,
} from '../../content/placement.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { THEMES } from '../../content/themes/index.ts';
import { createPropStore, PropFlag, type PropStore } from '../prop-store.ts';
import {
  heightAt,
  sampleGrid,
  zoneAt,
  Zone,
  WORLD_SIZE,
  CHUNK_SIZE,
  CHUNKS_PER_SIDE,
  type IslandData,
  type WorldData,
} from '../types.ts';
import { slopeAtCell } from './zones.ts';
import { OCC_STRUCTURE } from './settlements.ts';
import { pickBeaconSkerries } from './beacons.ts';
import * as dm from '../../core/math/dmath.ts';
import { TALUS } from '../../content/islands.ts';
import { smoothstep } from '../../core/math/index.ts';
import { bluffOf, coveness } from './heightfield.ts';
import {
  BIOME_RULES,
  BIOME_SCATTER,
  COAST_RULES,
  type IslandBiomeScatter,
} from '../../content/biome-scatter.ts';
import { scatterHarbours, scatterLotEdges } from './biome-scatter.ts';
import { scatterCoastFeatures } from './coast-scatter.ts';

/**
 * Prop scatter (ARCHITECTURE §2 step 7): Bridson Poisson per island per rule in
 * priority order; a 1 u OccupancyGrid blocks overlaps and survives into Phase 2.
 */
export interface OccupancyGrid {
  cell: number;
  n: number;
  originX: number;
  originZ: number;
  data: Uint8Array;
  /** No cell ≥ `minValue` (default 1 = anything) within `radius` of (x, z). */
  isFree(x: number, z: number, radius: number, minValue?: number): boolean;
  /**
   * Exact disc test (Phase 2 placement): no cell ≥ `minValue` whose square comes closer than
   * `radius` to (x, z). `isFree` rounds the radius up to whole cells plus slack (scatter
   * semantics, kept for determinism); this one uses the footprint as is.
   */
  isFreeDisc(x: number, z: number, radius: number, minValue?: number): boolean;
  mark(x: number, z: number, radius: number, value?: number): void;
  /** Value of the cell containing (x, z) (0 outside). */
  valueAt(x: number, z: number): number;
}

/** New grid, or a view over existing `data` (Phase 2 validation over `genAux.siteOccupancy`). */
export function createOccupancy(existing?: Uint8Array): OccupancyGrid {
  const cell = OCCUPANCY_CELL;
  const n = Math.ceil(WORLD_SIZE / cell);
  const originX = -WORLD_SIZE / 2;
  const originZ = -WORLD_SIZE / 2;
  const data = existing ?? new Uint8Array(n * n);
  const idx = (x: number, z: number): number => {
    const ix = Math.floor((x - originX) / cell);
    const iz = Math.floor((z - originZ) / cell);
    if (ix < 0 || iz < 0 || ix >= n || iz >= n) return -1;
    return iz * n + ix;
  };
  return {
    cell,
    n,
    originX,
    originZ,
    data,
    isFree(x, z, radius, minValue = 1) {
      const r = Math.max(0, Math.ceil(radius / cell));
      const cx = Math.floor((x - originX) / cell);
      const cz = Math.floor((z - originZ) / cell);
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dz * dz > r * r + r) continue;
          const i = idx(x + dx * cell, z + dz * cell);
          if (i >= 0 && data[i] >= minValue) return false;
        }
      }
      void cx;
      void cz;
      return true;
    },
    isFreeDisc(x, z, radius, minValue = 1) {
      const fx = (x - originX) / cell;
      const fz = (z - originZ) / cell;
      const rc = radius / cell;
      const x0 = Math.max(0, Math.floor(fx - rc));
      const x1 = Math.min(n - 1, Math.floor(fx + rc));
      const z0 = Math.max(0, Math.floor(fz - rc));
      const z1 = Math.min(n - 1, Math.floor(fz + rc));
      for (let iz = z0; iz <= z1; iz++) {
        const dz = fz < iz ? iz - fz : fz > iz + 1 ? fz - iz - 1 : 0;
        for (let ix = x0; ix <= x1; ix++) {
          if (data[iz * n + ix] < minValue) continue;
          const dx = fx < ix ? ix - fx : fx > ix + 1 ? fx - ix - 1 : 0;
          if (dx * dx + dz * dz < rc * rc) return false;
        }
      }
      return true;
    },
    valueAt(x, z) {
      const i = idx(x, z);
      return i >= 0 ? data[i] : 0;
    },
    mark(x, z, radius, value = 1) {
      const r = Math.max(0, Math.ceil(radius / cell));
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dz * dz > r * r + r) continue;
          const i = idx(x + dx * cell, z + dz * cell);
          if (i >= 0) data[i] = value;
        }
      }
    },
  };
}

export interface ScatterResult {
  props: PropStore;
  occupancy: OccupancyGrid;
  /** Count per def id. */
  counts: Record<string, number>;
  /** TASK-603: store index range of the coast feature passes (arches, stacks, tide pools, fall foot). */
  coastFeatures: [from: number, to: number];
}

export function chunkIdAt(x: number, z: number): number {
  const cx = Math.min(
    CHUNKS_PER_SIDE - 1,
    Math.max(0, Math.floor((x + WORLD_SIZE / 2) / CHUNK_SIZE)),
  );
  const cz = Math.min(
    CHUNKS_PER_SIDE - 1,
    Math.max(0, Math.floor((z + WORLD_SIZE / 2) / CHUNK_SIZE)),
  );
  return cz * CHUNKS_PER_SIDE + cx;
}

/**
 * Scatter every rule over every island: the global PLACEMENT_RULES (minus the theme's
 * `scatterOff` defs), then the theme's own `scatter` rules (its island only; `archetypes`
 * ignored). Deterministic: rng.fork('props', islandId, ruleIndex) over that combined list.
 * Pass the occupancy grid pre-marked by settlements (markSites) so props avoid
 * lots, docks, landmarks and paths; ground cover only avoids structures.
 */
export function scatterProps(
  world: WorldData,
  occupancy: OccupancyGrid = createOccupancy(),
): ScatterResult {
  const root = createRng(world.seed);
  const store = createPropStore(PROP_CAPACITY);
  const counts: Record<string, number> = {};
  const h = world.height;
  const noise = createNoise(root.fork('scatter-noise'));
  let groundCoverTotal = 0;

  /**
   * One land body (island or islet): every rule in order, `rng.fork('props', id, ruleIndex)`.
   * A candidate on another body's land is rejected (TASK-471: an islet inside an island's
   * scatter square must not get that island's trees, nor the island the islet's rocks).
   */
  const scatterBody = (
    island: Pick<IslandData, 'id' | 'minX' | 'maxX' | 'minZ' | 'maxZ' | 'peakX' | 'peakZ'>,
    rules: readonly PlacementRule[],
    skip: (rule: PlacementRule, r: number) => boolean,
    label = 'props',
    biome?: IslandBiomeScatter,
  ): void => {
    // `first` rules claim their spots before the rest; each keeps its own rng fork index
    const order = rules.map((_, r) => r);
    order.sort((a, b) => Number(!!rules[b].first) - Number(!!rules[a].first) || a - b);
    for (const r of order) {
      const rule = rules[r];
      if (skip(rule, r)) continue;
      const defIndex = PROP_DEF_INDEX[rule.def];
      const def = PROP_DEFS[defIndex];
      if (!def) continue;
      const isGround = (def.flags & PropFlag.groundCover) !== 0;
      if (isGround && groundCoverTotal >= GROUND_COVER_CAP) continue;
      // TASK-600 (D-179): a v2 rule rolls the island's variant list; a swap turns the old def's
      // placements into the v2 def (same points, same roll count; `share` < 1 rolls once more)
      const swap = biome?.swap[rule.def];
      const pick = rule.pick ?? swap?.pick;
      const list = pick && biome ? biome.picks[pick] : undefined;
      if (rule.pick && !list?.length) continue;
      const swapIndex = swap && list?.length ? PROP_DEF_INDEX[swap.def] : undefined;
      const rng: Rng = root.fork(label, island.id, r);
      const margin = 16;
      const minX = island.minX - margin;
      const maxX = island.maxX + margin;
      const minZ = island.minZ - margin;
      const maxZ = island.maxZ + margin;
      const fieldAngle = world.fields.find((f) => f.islandId === island.id)?.rotY;
      const accept = (x: number, z: number): boolean => {
        const zone = zoneAt(h, world.zone, x, z);
        if (!rule.zones.includes(zone) || BLOCKED_ZONES.includes(zone)) return false;
        const o = ownerAt(world, x, z);
        if (o !== 0 && o !== island.id + 1) return false;
        if (rule.fieldColors) {
          const c = fieldColorAt(world, x, z) - 1;
          if (!rule.fieldColors.includes(c)) return false;
        }
        const y = heightAt(h, x, z);
        if (y < rule.heights[0] || y > rule.heights[1]) return false;
        const s = sampleGrid(h, world.shoreSdf, x, z, -999);
        if (rule.shore && (s < rule.shore[0] || s > rule.shore[1])) return false;
        const slope = slopeAt(h, x, z);
        if (slope > rule.slopeMax) return false;
        if (rule.slopeMin !== undefined && slope < rule.slopeMin) return false;
        if (rule.belowLip !== undefined) {
          // the wall top: within `belowLip` u up the slope the ground flattens out above the candidate
          const a = downhillYaw(h, x, z);
          if (!lipWithin(h, x, z, a, rule.belowLip)) return false;
        }
        if (rule.fallClear !== undefined) {
          const c = rule.fallClear;
          for (const f of world.waterfalls)
            if (segDist(x, z, f.x, f.z, f.baseX, f.baseZ) < f.width + c) return false;
        }
        if (
          rule.cluster &&
          noise.fbm(x / rule.cluster.scale, z / rule.cluster.scale, 3) < rule.cluster.threshold
        )
          return false;
        if (rule.near && rule.nearDist) {
          let hit = false;
          for (let k = 0; k < 16 && !hit; k++) {
            const a = ((k & 7) / 8) * Math.PI * 2;
            const d = k < 8 ? rule.nearDist : rule.nearDist / 2;
            hit = rule.near.includes(zoneAt(h, world.zone, x + dm.cos(a) * d, z + dm.sin(a) * d));
          }
          if (!hit) return false;
        }
        if (rule.avoid && rule.avoidDist) {
          const d = rule.avoidDist;
          for (const [ox, oz] of [
            [d, 0],
            [-d, 0],
            [0, d],
            [0, -d],
          ] as const) {
            if (rule.avoid.includes(zoneAt(h, world.zone, x + ox, z + oz))) return false;
          }
        }
        return true;
      };
      const pts = rule.atPeak
        ? [island.peakX, island.peakZ]
        : poissonDisc(rng, minX, minZ, maxX, maxZ, rule.minDist, accept, isGround ? 12000 : 6000);
      let placed = 0;
      let moved = 0;
      const max = rule.maxPerIsland ?? Infinity;
      for (let i = 0; i < pts.length && placed < max; i += 2) {
        if (rule.density < 1 && rng.next() > rule.density) continue;
        let x = pts[i];
        let z = pts[i + 1];
        const scale = rng.range(rule.scale[0], rule.scale[1]);
        if (rule.fieldRows && fieldAngle !== undefined) {
          // snap onto the field-aligned lattice (u along the patch axis, v across it)
          const c = dm.cos(fieldAngle);
          const sn = dm.sin(fieldAngle);
          const g = rule.fieldRows;
          const u = Math.round((x * c + z * sn) / g) * g;
          const v = Math.round((-x * sn + z * c) / g) * g;
          x = u * c - v * sn;
          z = u * sn + v * c;
          if (!accept(x, z)) continue;
        }
        const swapped =
          swapIndex !== undefined && (swap!.share === undefined || rng.next() < swap!.share);
        const pIndex = swapped ? swapIndex : defIndex;
        const pDef = PROP_DEFS[pIndex];
        // a swap keeps the old def's footprint: the same points survive the occupancy test
        const radius = def.footprint * scale;
        if (!isGround && !occupancy.isFree(x, z, radius)) continue;
        if (isGround && occupancy.valueAt(x, z) === OCC_STRUCTURE) continue;
        if (isGround && groundCoverTotal >= GROUND_COVER_CAP) break;
        const zone = zoneAt(h, world.zone, x, z);
        const floats = zone === Zone.lagoon && !(pDef.flags & PropFlag.underwater);
        const y = floats ? 0 : heightAt(h, x, z);
        const variant =
          (swapped || rule.pick) && list
            ? list[rng.int(0, list.length - 1)]
            : rng.int(0, def.variants - 1);
        let rotY = rng.range(0, Math.PI * 2);
        // prop yaw −a turns local +x onto the patch axis (cos a, sin a)
        if (rule.fieldRows && fieldAngle !== undefined) rotY = -fieldAngle;
        // TASK-603: blade tips under the surface; wall shrubs with their back to the wall
        const top = rule.topClear;
        if (top && y + top.heights[variant % top.heights.length] * scale > -top.below) continue;
        if (rule.face === 'downhill') rotY = downhillYaw(h, x, z);
        store.push(pIndex, variant, x, y, z, rotY, scale, island.id, chunkIdAt(x, z), pDef.flags);
        if (!isGround) occupancy.mark(x, z, radius);
        else groundCoverTotal++;
        placed++;
        if (swapped) {
          counts[pDef.id] = (counts[pDef.id] ?? 0) + 1;
          moved++;
        }
        if (store.count >= PROP_CAPACITY - 1) break;
      }
      counts[rule.def] = (counts[rule.def] ?? 0) + placed - moved;
    }
  };

  for (const island of world.islands) {
    const theme = THEMES[island.theme];
    const biome = BIOME_SCATTER[island.theme];
    // global rules first (same indices as before M14b), then the theme's own rules
    scatterBody(
      island,
      PLACEMENT_RULES.concat(theme.scatter),
      (rule, r) => {
        if (r >= PLACEMENT_RULES.length) return false;
        if (rule.archetypes && !rule.archetypes.includes(island.archetype)) return true;
        return theme.scatterOff.includes(rule.def);
      },
      'props',
      biome,
    );
    // TASK-600: the biome layers after every other rule, on their own forks
    scatterBody(
      island,
      BIOME_RULES,
      (_, r) => !BIOME_RULES[r].themes.includes(island.theme),
      'biome-props',
      biome,
    );
  }
  // M23 (TASK-490): only the picked skerries carry a beacon (the rule's own rng fork, index 1)
  const beacons = pickBeaconSkerries(world.islands, world.islets);
  for (const islet of world.islets)
    scatterBody(
      islet,
      ISLET_SCATTER[islet.kind],
      (rule) => rule.def === 'beaconTower' && !beacons.has(islet.id),
    );
  scatterTalus(world, store, occupancy, root, counts);
  scatterLotEdges(world, store, occupancy, root, counts);
  scatterHarbours(world, store, occupancy, root, counts);
  // TASK-603 (D-184): coast micro-landscapes last, on their own forks (nothing above moves); the
  // features (arches first) claim their spots before the rules
  const from = store.count;
  scatterCoastFeatures(world, store, occupancy, root, counts);
  const coastFeatures: [number, number] = [from, store.count];
  for (const island of world.islands)
    scatterBody(
      island,
      COAST_RULES,
      (_, r) => !COAST_RULES[r].themes.includes(island.theme),
      'coast-props',
      BIOME_SCATTER[island.theme],
    );
  return { props: store, occupancy, counts, coastFeatures };
}

/** Three yaw turning local +z down the terrain slope at (x, z) (central differences over 1 u). */
export function downhillYaw(h: WorldData['height'], x: number, z: number): number {
  const gx = heightAt(h, x + 1, z) - heightAt(h, x - 1, z);
  const gz = heightAt(h, x, z + 1) - heightAt(h, x, z - 1);
  return dm.atan2(-gx, -gz);
}

/**
 * Talus at the bluff wall foot (TASK-615, TALUS): after every rule, on its own
 * `rng.fork('talus', islandId)`, so no existing prop moves. A candidate needs a wall top ≥
 * `rise[0]` u above it within `reach` u (8 directions); acceptance ramps to `rise[1]` against a
 * position hash, so the taller headland walls collect the most rocks.
 */
function scatterTalus(
  world: WorldData,
  store: ReturnType<typeof createPropStore>,
  occupancy: OccupancyGrid,
  root: Rng,
  counts: Record<string, number>,
): void {
  const T = TALUS;
  const defIndex = PROP_DEF_INDEX[T.def];
  const def = PROP_DEFS[defIndex];
  if (!def) return;
  const h = world.height;
  for (const isl of world.islands) {
    // (a theme that switches the rock clusters off gets no talus either)
    if (!bluffOf(isl) || THEMES[isl.theme].scatterOff.includes(T.def)) continue;
    const rng = root.fork('talus', isl.id);
    const accept = (x: number, z: number): boolean => {
      const s = sampleGrid(h, world.shoreSdf, x, z, -999);
      if (s < T.shore[0] || s > T.shore[1]) return false;
      const o = ownerAt(world, x, z);
      // a water sample belongs to the island whose coast is nearest: the shore SDF band is narrow
      if (o !== 0 && o !== isl.id + 1) return false;
      if (Math.hypot(x - isl.cx, z - isl.cz) > isl.radius * 2) return false;
      const y = heightAt(h, x, z);
      if (y < T.heights[0] || y > T.heights[1]) return false;
      const zone = zoneAt(h, world.zone, x, z);
      if (!(T.zones as readonly number[]).includes(zone) || BLOCKED_ZONES.includes(zone))
        return false;
      if (coveness(isl, world.windDir, x, z) > T.maxCove) return false;
      let top = -Infinity;
      for (let k = 0; k < 16; k++) {
        const a = ((k & 7) / 8) * Math.PI * 2;
        const d = k < 8 ? T.reach[1] : T.reach[0];
        top = Math.max(top, heightAt(h, x + dm.cos(a) * d, z + dm.sin(a) * d));
      }
      const rise = top - y;
      if (rise < T.rise[0]) return false;
      // position hash in [0, 1): deterministic thinning by wall height
      let q = Math.imul(Math.round(x * 8), 0x27d4eb2d) ^ Math.imul(Math.round(z * 8), 0x165667b1);
      q = Math.imul(q ^ (q >>> 15), 0x2c1b3c6d);
      q ^= q >>> 13;
      return (q >>> 0) / 4294967296 < smoothstep(T.rise[0], T.rise[1], rise);
    };
    const pts = poissonDisc(
      rng,
      isl.minX - 4,
      isl.minZ - 4,
      isl.maxX + 4,
      isl.maxZ + 4,
      T.minDist,
      accept,
      6000,
    );
    let placed = 0;
    for (let i = 0; i < pts.length && placed < T.maxPerIsland; i += 2) {
      const x = pts[i];
      const z = pts[i + 1];
      const scale = rng.range(T.scale[0], T.scale[1]);
      const radius = def.footprint * scale;
      if (!occupancy.isFree(x, z, radius)) continue;
      const variant = rng.int(0, def.variants - 1);
      const rotY = rng.range(0, Math.PI * 2);
      const y = heightAt(h, x, z);
      store.push(defIndex, variant, x, y, z, rotY, scale, isl.id, chunkIdAt(x, z), def.flags);
      occupancy.mark(x, z, radius);
      placed++;
      if (store.count >= PROP_CAPACITY - 1) return;
    }
    counts[T.def] = (counts[T.def] ?? 0) + placed;
  }
}

/** `islandMap` value at a world position (nearest sample; 0 outside the grid). */
export function ownerAt(world: WorldData, x: number, z: number): number {
  const h = world.height;
  const ix = Math.round((x - h.originX) / h.cellSize);
  const iz = Math.round((z - h.originZ) / h.cellSize);
  if (ix < 0 || iz < 0 || ix >= h.n || iz >= h.n) return 0;
  return world.islandMap[iz * h.n + ix];
}

export function slopeAt(
  h: { n: number; cellSize: number; originX: number; originZ: number; data: Float32Array },
  x: number,
  z: number,
): number {
  const ix = Math.min(h.n - 1, Math.max(0, Math.round((x - h.originX) / h.cellSize)));
  const iz = Math.min(h.n - 1, Math.max(0, Math.round((z - h.originZ) / h.cellSize)));
  return slopeAtCell(h, ix, iz);
}

/** Distance (u) from (px, pz) to the segment (ax, az)–(bx, bz). */
export function segDist(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0;
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}

/**
 * A wall lip within `d` u up the slope from (x, z) (`yaw` = downhill, local +z): some sample on
 * the way (0.25 u steps) is flat (slope ≤ 0.6) and higher than the start (TASK-684).
 */
export function lipWithin(
  h: Parameters<typeof slopeAt>[0],
  x: number,
  z: number,
  yaw: number,
  d: number,
): boolean {
  const y = heightAt(h, x, z);
  const sx = dm.sin(yaw);
  const sz = dm.cos(yaw);
  for (let s = 0.25; s <= d + 1e-6; s += 0.25) {
    const ux = x - sx * s;
    const uz = z - sz * s;
    if (slopeAt(h, ux, uz) <= 0.6 && heightAt(h, ux, uz) > y) return true;
  }
  return false;
}

export type { PlacementRule };

/** Field hue at a world position (nearest sample): 1 + palette FIELDS index, 0 = none. */
function fieldColorAt(world: WorldData, x: number, z: number): number {
  const h = world.height;
  const ix = Math.round((x - h.originX) / h.cellSize);
  const iz = Math.round((z - h.originZ) / h.cellSize);
  if (ix < 0 || iz < 0 || ix >= h.n || iz >= h.n) return 0;
  return world.fieldColor[iz * h.n + ix];
}
