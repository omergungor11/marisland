import { createNoise } from '../../core/noise.ts';
import type { Rng } from '../../core/rng.ts';
import { clamp01, lerp, smax, smoothstep } from '../../core/math/index.ts';
import { WATER_BANDS } from '../../content/palette.ts';
import type { Heightfield, IslandData } from '../types.ts';
import { CELL_SIZE, GRID_N, SEABED_Y } from '../types.ts';
import { cellX, cellZ, GRID_ORIGIN, gridRange } from './grid.ts';
import { ARCHETYPES, BEACH, RAW_FLOOR, SHELF } from './params.ts';
import { PROFILES } from './profiles.ts';

/** Smooth-max width where two islands' land overlaps. */
const ISLAND_BLEND = 3;
/** Beyond this shore distance every shelf variant has reached SEABED_Y. */
const OPEN_SEA =
  Math.max(...Object.values(ARCHETYPES).map((a) => a.shelfWidth)) *
    WATER_BANDS.leewardRingScale *
    (1 + SHELF.widthJitter) +
  SHELF.dropLen +
  SHELF.seabedFall;

export interface RawLand {
  /** Raw land field: > 0 land, RAW_FLOOR … 0 water. */
  raw: Float32Array;
  /** Owning island id + 1 for land samples, 0 for water. */
  islandMap: Uint8Array;
}

/** Soft terrace: floor(h/step)·step blended with a smoothstep riser. */
function terrace(h: number, step: number, strength: number): number {
  if (strength <= 0 || step <= 0) return h;
  const base = Math.floor(h / step) * step;
  const t = (h - base) / step;
  const stepped = base + step * smoothstep(0.3, 0.7, t);
  return lerp(h, stepped, strength);
}

/**
 * Pass A: evaluate every island's profile inside its bounds, normalise its
 * peak to the archetype range, add terraces, and combine (max; smooth-max
 * where two islands' land overlaps). Mutates `anchors` on each island.
 */
export function buildRawLand(islands: IslandData[], windDir: number, rng: Rng): RawLand {
  const n = GRID_N;
  const raw = new Float32Array(n * n).fill(RAW_FLOOR);
  const islandMap = new Uint8Array(n * n);
  for (const isl of islands) {
    const p = ARCHETYPES[isl.archetype];
    const shapeRng = rng.fork('island:shape', isl.id);
    const profile = PROFILES[isl.archetype]({
      island: isl,
      rng: shapeRng,
      noise: createNoise(rng.fork('island:noise', isl.id)),
      windDir,
    });
    isl.anchors = { ...isl.anchors, ...profile.anchors };
    const [x0, x1] = gridRange(isl.minX, isl.maxX);
    const [z0, z1] = gridRange(isl.minZ, isl.maxZ);
    const w = x1 - x0 + 1;
    const local = new Float32Array(w * (z1 - z0 + 1));
    let max = 0;
    for (let iz = z0; iz <= z1; iz++) {
      const z = cellZ(iz);
      for (let ix = x0; ix <= x1; ix++) {
        const v = profile.sample(cellX(ix), z);
        local[(iz - z0) * w + ix - x0] = v;
        if (v > max) max = v;
      }
    }
    const target = rng.fork('island:peak', isl.id).range(p.peak[0], p.peak[1]);
    const scale = max > 0 ? target / max : 1;
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) {
        let v = local[(iz - z0) * w + ix - x0];
        if (v > 0) v = terrace(v * scale, p.terrace.step, p.terrace.strength);
        const i = iz * n + ix;
        const cur = raw[i];
        if (v > 0 && v >= cur) islandMap[i] = isl.id + 1;
        raw[i] = cur > 0 && v > 0 ? smax(cur, v, ISLAND_BLEND) : Math.max(cur, v);
      }
    }
  }
  return { raw, islandMap };
}

/** Nearest island by radius-normalised centre distance. */
export function nearestIsland(islands: IslandData[], x: number, z: number): IslandData | null {
  let best: IslandData | null = null;
  let bd = Infinity;
  for (const isl of islands) {
    const d = Math.hypot(x - isl.cx, z - isl.cz) / isl.radius;
    if (d < bd) {
      bd = d;
      best = isl;
    }
  }
  return best;
}

/** 0 on the windward side → 1 on the leeward side of an island. */
export function leewardness(isl: IslandData, windDir: number, x: number, z: number): number {
  const dx = x - isl.cx;
  const dz = z - isl.cz;
  const len = Math.hypot(dx, dz) || 1;
  const dot = (dx * Math.cos(windDir) + dz * Math.sin(windDir)) / len;
  return smoothstep(-0.2, 0.7, dot);
}

/** Underwater height at distance `d` (u) from shore: lip → shelf → drop → seabed. */
export function shelfHeight(d: number, width: number, dropDepth: number): number {
  const shelf = SHELF.lip - (SHELF.depth + SHELF.lip) * smoothstep(0, width, d);
  const drop = (dropDepth - SHELF.depth) * smoothstep(width, width + SHELF.dropLen, d);
  const a = width + SHELF.dropLen;
  const fall = (-SEABED_Y - dropDepth) * smoothstep(a, a + SHELF.seabedFall, d);
  return shelf - drop - fall;
}

/**
 * Pass B: final heights from the raw land field and the exact shore SDF.
 * Land: beach ramp BEACH.min → BEACH.max over beachWidth, blended into the
 * profile. Water: shelf whose width is 1.5× on the leeward side, then the
 * drop-off and the seabed. Land stays > 0 and water < 0, so the land mask
 * (and therefore the SDF) is unchanged.
 */
export function finalizeHeight(
  rawLand: RawLand,
  sdf: Float32Array,
  islands: IslandData[],
  windDir: number,
  rng: Rng,
): Heightfield {
  const n = GRID_N;
  const { raw, islandMap } = rawLand;
  const noise = createNoise(rng.fork('shelf'));
  const data = new Float32Array(n * n);
  const ns = 1 / SHELF.noiseScale;
  for (let iz = 0; iz < n; iz++) {
    const z = cellZ(iz);
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      const s = sdf[i];
      const x = cellX(ix);
      if (s > 0) {
        const isl = islands[islandMap[i] - 1];
        const bw = ARCHETYPES[isl.archetype].beachWidth;
        const beach = BEACH.min + (BEACH.max - BEACH.min) * clamp01(s / bw);
        data[i] = lerp(beach, Math.max(raw[i], beach), smoothstep(0, bw, s));
      } else if (-s > OPEN_SEA) {
        data[i] = SEABED_Y;
      } else {
        const isl = nearestIsland(islands, x, z);
        let width = 8;
        if (isl) {
          const base = ARCHETYPES[isl.archetype].shelfWidth;
          const lee = leewardness(isl, windDir, x, z);
          width = base * lerp(1, WATER_BANDS.leewardRingScale, lee);
        }
        width *= 1 + SHELF.widthJitter * noise.fbm(x * ns, z * ns, 2);
        const t = 0.5 + 0.5 * noise.n2(x * ns * 0.8 + 31.7, z * ns * 0.8 - 12.9);
        const dropDepth = lerp(SHELF.dropDepth[0], SHELF.dropDepth[1], t);
        data[i] = shelfHeight(-s, width, dropDepth);
      }
    }
  }
  return { data, n, cellSize: CELL_SIZE, originX: GRID_ORIGIN, originZ: GRID_ORIGIN };
}

/** Fill peakX/Y/Z per island from the final grid (label + landmark anchor). */
export function measurePeaks(h: Heightfield, islandMap: Uint8Array, islands: IslandData[]): void {
  for (const isl of islands) {
    isl.peakY = -Infinity;
  }
  for (let i = 0; i < islandMap.length; i++) {
    const id = islandMap[i];
    if (id === 0) continue;
    const isl = islands[id - 1];
    if (h.data[i] > isl.peakY) {
      isl.peakY = h.data[i];
      isl.peakX = cellX(i % h.n);
      isl.peakZ = cellZ(Math.floor(i / h.n));
    }
  }
  for (const isl of islands) if (isl.peakY === -Infinity) isl.peakY = 0;
}
