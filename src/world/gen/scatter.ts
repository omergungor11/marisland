import { createRng, type Rng } from '../../core/rng.ts';
import { createNoise } from '../../core/noise.ts';
import { poissonDisc } from '../../core/math/poisson.ts';
import {
  PLACEMENT_RULES,
  BLOCKED_ZONES,
  OCCUPANCY_CELL,
  PROP_CAPACITY,
  GROUND_COVER_CAP,
  type PlacementRule,
} from '../../content/placement.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { createPropStore, PropFlag, type PropStore } from '../prop-store.ts';
import {
  heightAt,
  sampleGrid,
  zoneAt,
  Zone,
  WORLD_SIZE,
  CHUNK_SIZE,
  CHUNKS_PER_SIDE,
  type WorldData,
} from '../types.ts';
import { slopeAtCell } from './zones.ts';
import { OCC_STRUCTURE } from './settlements.ts';

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
  isFree(x: number, z: number, radius: number): boolean;
  mark(x: number, z: number, radius: number, value?: number): void;
  /** Value of the cell containing (x, z) (0 outside). */
  valueAt(x: number, z: number): number;
}

export function createOccupancy(): OccupancyGrid {
  const cell = OCCUPANCY_CELL;
  const n = Math.ceil(WORLD_SIZE / cell);
  const originX = -WORLD_SIZE / 2;
  const originZ = -WORLD_SIZE / 2;
  const data = new Uint8Array(n * n);
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
    isFree(x, z, radius) {
      const r = Math.max(0, Math.ceil(radius / cell));
      const cx = Math.floor((x - originX) / cell);
      const cz = Math.floor((z - originZ) / cell);
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dz * dz > r * r + r) continue;
          const i = idx(x + dx * cell, z + dz * cell);
          if (i >= 0 && data[i]) return false;
        }
      }
      void cx;
      void cz;
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
 * Scatter every rule over every island. Deterministic: rng.fork('props', islandId, ruleIndex).
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

  for (const island of world.islands) {
    for (let r = 0; r < PLACEMENT_RULES.length; r++) {
      const rule = PLACEMENT_RULES[r];
      if (rule.archetypes && !rule.archetypes.includes(island.archetype)) continue;
      const defIndex = PROP_DEF_INDEX[rule.def];
      const def = PROP_DEFS[defIndex];
      if (!def) continue;
      const isGround = (def.flags & PropFlag.groundCover) !== 0;
      if (isGround && groundCoverTotal >= GROUND_COVER_CAP) continue;
      const rng: Rng = root.fork('props', island.id, r);
      const margin = 16;
      const minX = island.minX - margin;
      const maxX = island.maxX + margin;
      const minZ = island.minZ - margin;
      const maxZ = island.maxZ + margin;
      const fieldAngle = world.fields.find((f) => f.islandId === island.id)?.rotY;
      const accept = (x: number, z: number): boolean => {
        const zone = zoneAt(h, world.zone, x, z);
        if (!rule.zones.includes(zone) || BLOCKED_ZONES.includes(zone)) return false;
        if (rule.fieldColors) {
          const c = fieldColorAt(world, x, z) - 1;
          if (!rule.fieldColors.includes(c)) return false;
        }
        const y = heightAt(h, x, z);
        if (y < rule.heights[0] || y > rule.heights[1]) return false;
        const s = sampleGrid(h, world.shoreSdf, x, z, -999);
        if (rule.shore && (s < rule.shore[0] || s > rule.shore[1])) return false;
        if (slopeAt(h, x, z) > rule.slopeMax) return false;
        if (
          rule.cluster &&
          noise.fbm(x / rule.cluster.scale, z / rule.cluster.scale, 3) < rule.cluster.threshold
        )
          return false;
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
      const pts = poissonDisc(
        rng,
        minX,
        minZ,
        maxX,
        maxZ,
        rule.minDist,
        accept,
        isGround ? 12000 : 6000,
      );
      let placed = 0;
      const max = rule.maxPerIsland ?? Infinity;
      for (let i = 0; i < pts.length && placed < max; i += 2) {
        if (rule.density < 1 && rng.next() > rule.density) continue;
        let x = pts[i];
        let z = pts[i + 1];
        const scale = rng.range(rule.scale[0], rule.scale[1]);
        if (rule.fieldRows && fieldAngle !== undefined) {
          // snap onto the field-aligned lattice (u along the patch axis, v across it)
          const c = Math.cos(fieldAngle);
          const sn = Math.sin(fieldAngle);
          const g = rule.fieldRows;
          const u = Math.round((x * c + z * sn) / g) * g;
          const v = Math.round((-x * sn + z * c) / g) * g;
          x = u * c - v * sn;
          z = u * sn + v * c;
          if (!accept(x, z)) continue;
        }
        const radius = def.footprint * scale;
        if (!isGround && !occupancy.isFree(x, z, radius)) continue;
        if (isGround && occupancy.valueAt(x, z) === OCC_STRUCTURE) continue;
        if (isGround && groundCoverTotal >= GROUND_COVER_CAP) break;
        const zone = zoneAt(h, world.zone, x, z);
        const floats = zone === Zone.lagoon && !(def.flags & PropFlag.underwater);
        const y = floats ? 0 : heightAt(h, x, z);
        const variant = rng.int(0, def.variants - 1);
        let rotY = rng.range(0, Math.PI * 2);
        // prop yaw −a turns local +x onto the patch axis (cos a, sin a)
        if (rule.fieldRows && fieldAngle !== undefined) rotY = -fieldAngle;
        store.push(defIndex, variant, x, y, z, rotY, scale, island.id, chunkIdAt(x, z), def.flags);
        if (!isGround) occupancy.mark(x, z, radius);
        else groundCoverTotal++;
        placed++;
        if (store.count >= PROP_CAPACITY - 1) break;
      }
      counts[rule.def] = (counts[rule.def] ?? 0) + placed;
    }
  }
  return { props: store, occupancy, counts };
}

function slopeAt(
  h: { n: number; cellSize: number; originX: number; originZ: number; data: Float32Array },
  x: number,
  z: number,
): number {
  const ix = Math.min(h.n - 1, Math.max(0, Math.round((x - h.originX) / h.cellSize)));
  const iz = Math.min(h.n - 1, Math.max(0, Math.round((z - h.originZ) / h.cellSize)));
  return slopeAtCell(h, ix, iz);
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
