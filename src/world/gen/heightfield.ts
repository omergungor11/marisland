import { createNoise } from '../../core/noise.ts';
import type { Rng } from '../../core/rng.ts';
import { clamp01, lerp, smax, smoothstep } from '../../core/math/index.ts';
import { WATER_BANDS } from '../../content/palette.ts';
import type { Heightfield, IslandData, StreamData } from '../types.ts';
import { CELL_SIZE, GRID_N, SEABED_Y } from '../types.ts';
import { cellX, cellZ, GRID_ORIGIN, gridRange } from './grid.ts';
import {
  ARCHETYPES,
  BEACH,
  LAGOON,
  RAW_FLOOR,
  SHELF,
  WINDWARD_CLIFF,
} from '../../content/islands.ts';
import { PROFILES, Tag } from './profiles.ts';

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
  /** Profile Tag bits per sample (OR of every island whose bounds cover it). */
  tags: Uint8Array;
  /** Profile polylines (Mossgrove stream). */
  streams: StreamData[];
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
  const tags = new Uint8Array(n * n);
  const streams: StreamData[] = [];
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
    for (const pts of profile.streams ?? []) streams.push({ islandId: isl.id, points: pts });
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
        if (profile.tag) tags[iz * n + ix] |= profile.tag(cellX(ix), z);
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
  return { raw, islandMap, tags, streams };
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

/**
 * 1 inside the ±WINDWARD_CLIFF.halfAngleDeg sector facing into the wind
 * (islands with `windwardCliff` only), 0 elsewhere, smooth at the edges.
 */
export function windwardCliffness(isl: IslandData, windDir: number, x: number, z: number): number {
  if (!ARCHETYPES[isl.archetype].windwardCliff) return 0;
  const dx = x - isl.cx;
  const dz = z - isl.cz;
  const len = Math.hypot(dx, dz) || 1;
  const up = -(dx * Math.cos(windDir) + dz * Math.sin(windDir)) / len;
  const ch = Math.cos((WINDWARD_CLIFF.halfAngleDeg * Math.PI) / 180);
  return smoothstep(ch - WINDWARD_CLIFF.soft, ch + WINDWARD_CLIFF.soft, up);
}

/** Underwater height at distance `d` (u) from shore: lip → shelf → drop → seabed. */
export function shelfHeight(
  d: number,
  width: number,
  dropDepth: number,
  dropLen: number = SHELF.dropLen,
): number {
  const shelf = SHELF.lip - (SHELF.depth + SHELF.lip) * smoothstep(0, width, d);
  const drop = (dropDepth - SHELF.depth) * smoothstep(width, width + dropLen, d);
  const a = width + dropLen;
  const fall = (-SEABED_Y - dropDepth) * smoothstep(a, a + SHELF.seabedFall, d);
  return shelf - drop - fall;
}

/**
 * Pass B: final heights from the raw land field and the exact shore SDF.
 * Land: beach ramp BEACH.min → beachMax over beachWidth, blended into the
 * profile (forced-cliff cells skip the beach). Water: shelf of the island
 * owning the nearest coast (`owner`), 1.5× wider on the leeward side, none
 * on Beacon Rock's windward face; then the drop-off and the seabed. Enclosed
 * lagoons get a −2…−4 u floor. Land stays > 0 and water < 0, so the land
 * mask (and therefore the SDF) is unchanged.
 */
export function finalizeHeight(
  rawLand: RawLand,
  sdf: Float32Array,
  owner: Uint8Array,
  islands: IslandData[],
  windDir: number,
  rng: Rng,
): Heightfield {
  const n = GRID_N;
  const { raw, islandMap, tags } = rawLand;
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
        const p = ARCHETYPES[isl.archetype];
        const bw = p.beachWidth;
        const bMax = p.beachMax ?? BEACH.max;
        const beach = BEACH.min + (bMax - BEACH.min) * clamp01(s / bw);
        data[i] =
          tags[i] & Tag.cliff
            ? Math.max(raw[i], BEACH.min)
            : lerp(beach, Math.max(raw[i], beach), smoothstep(0, bw, s));
      } else if (-s > OPEN_SEA) {
        data[i] = SEABED_Y;
      } else {
        const isl = owner[i] > 0 ? islands[owner[i] - 1] : null;
        let width = 8;
        let dropLen: number = SHELF.dropLen;
        if (isl) {
          const base = ARCHETYPES[isl.archetype].shelfWidth;
          const lee = leewardness(isl, windDir, x, z);
          width = base * lerp(1, WATER_BANDS.leewardRingScale, lee);
          const cliff = windwardCliffness(isl, windDir, x, z);
          if (cliff > 0) {
            width = lerp(width, WINDWARD_CLIFF.shelfWidth, cliff);
            dropLen = lerp(dropLen, WINDWARD_CLIFF.dropLen, cliff);
          }
        }
        width *= 1 + SHELF.widthJitter * noise.fbm(x * ns, z * ns, 2);
        const t = 0.5 + 0.5 * noise.n2(x * ns * 0.8 + 31.7, z * ns * 0.8 - 12.9);
        const dropDepth = lerp(SHELF.dropDepth[0], SHELF.dropDepth[1], t);
        let y = shelfHeight(-s, width, dropDepth, dropLen);
        if (tags[i] & Tag.lagoon) {
          const floor = -lerp(LAGOON.min, LAGOON.max, smoothstep(width, LAGOON.rampLen, -s));
          y = Math.max(y, floor);
        }
        data[i] = y;
      }
    }
  }
  smoothShelfSeams(data, sdf, owner, n);
  return { data, n, cellSize: CELL_SIZE, originX: GRID_ORIGIN, originZ: GRID_ORIGIN };
}

/**
 * Where two islands' shelves meet (owner changes between neighbouring water
 * cells) the per-island widths can leave a step; box-blur a band of
 * SHELF.seamBlur cells around the seam. Cells near a coast are left alone.
 */
function smoothShelfSeams(
  data: Float32Array,
  sdf: Float32Array,
  owner: Uint8Array,
  n: number,
): void {
  const r = SHELF.seamBlur;
  const seam = new Uint8Array(n * n);
  let any = false;
  for (let iz = 1; iz < n - 1; iz++)
    for (let ix = 1; ix < n - 1; ix++) {
      const i = iz * n + ix;
      if (sdf[i] > 0) continue;
      const o = owner[i];
      if (owner[i + 1] !== o || owner[i + n] !== o) {
        any = true;
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++) {
            const jx = ix + dx;
            const jz = iz + dz;
            if (jx >= 0 && jz >= 0 && jx < n && jz < n) seam[jz * n + jx] = 1;
          }
      }
    }
  if (!any) return;
  const src = data.slice();
  for (let iz = 0; iz < n; iz++)
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      if (!seam[i] || sdf[i] > -3) continue;
      let sum = 0;
      let cnt = 0;
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const jx = ix + dx;
          const jz = iz + dz;
          if (jx < 0 || jz < 0 || jx >= n || jz >= n) continue;
          const j = jz * n + jx;
          if (sdf[j] > 0) continue;
          sum += src[j];
          cnt++;
        }
      data[i] = Math.min(-SHELF.depth, sum / cnt);
    }
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

/**
 * Anchors that need final heights: `wreck` = deepest enclosed-lagoon cell of
 * each atoll (sunken ship, W6).
 */
export function finalAnchors(
  h: Heightfield,
  owner: Uint8Array,
  tags: Uint8Array,
  islands: IslandData[],
): void {
  for (const isl of islands) {
    if (isl.archetype !== 'palmlagoon') continue;
    let best = -1;
    let bestY = Infinity;
    for (let i = 0; i < h.data.length; i++) {
      if (owner[i] !== isl.id + 1 || !(tags[i] & Tag.lagoon) || h.data[i] >= 0) continue;
      if (h.data[i] < bestY) {
        bestY = h.data[i];
        best = i;
      }
    }
    if (best >= 0)
      isl.anchors.wreck = { x: cellX(best % h.n), z: cellZ(Math.floor(best / h.n)), rotY: 0 };
  }
}
