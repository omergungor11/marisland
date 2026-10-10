import { createNoise } from '../../core/noise.ts';
import type { Rng } from '../../core/rng.ts';
import { clamp01, lerp, smax, smoothstep } from '../../core/math/index.ts';
import { WATER_BANDS } from '../../content/palette.ts';
import type { FieldPatchData, Heightfield, IslandData, StreamData } from '../types.ts';
import { CELL_SIZE, GRID_N, heightAt, SEABED_Y } from '../types.ts';
import { cellX, cellZ, GRID_ORIGIN, gridRange } from './grid.ts';
import {
  ARCHETYPES,
  BEACH,
  BLUFF,
  LAGOON,
  RAW_FLOOR,
  SHELF,
  WINDWARD_CLIFF,
  type BluffParams,
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
  /** Crop-field rectangles (Millbrook). */
  fields: FieldPatchData[];
  /** Field colour per sample (1 + FIELDS index, 0 = none); masked to Zone.field later. */
  fieldColor: Uint8Array;
  /** Bluff wall height per island id (u; 0 = no bluff). */
  bluffWall: Float32Array;
}

/** The island's bluff block when it is switched on, else null. */
export function bluffOf(isl: IslandData): BluffParams | null {
  const b = ARCHETYPES[isl.archetype].bluff;
  return b && b.on ? b : null;
}

/** Horizontal run (u) of a bluff wall of height `wall`: `wallShape` max slope = wall/(run·(1 − knee)). */
export function bluffRun(wall: number): number {
  return wall / ((1 - BLUFF.knee) * Math.tan((BLUFF.maxSlopeDeg * Math.PI) / 180));
}

/**
 * Bluff wall profile 0 → 1 over t ∈ [0, 1]: a straight face with parabolic blends over the
 * first / last `knee` fraction (a crisp rim, max slope 1/(1 − knee) instead of smoothstep's 1.5).
 */
export function wallShape(t: number): number {
  const k = BLUFF.knee;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const m = 1 / (1 - k);
  if (t < k) return (0.5 * m * t * t) / k;
  if (t > 1 - k) return 1 - (0.5 * m * (1 - t) * (1 - t)) / k;
  return m * (t - 0.5 * k);
}

/**
 * 1 inside the bluff island's cove, 0 on the bluff coast, smooth at the edges. The cove is the
 * disc around `coveAnchor` when the island has that anchor, else the leeward sector.
 */
export function coveness(isl: IslandData, windDir: number, x: number, z: number): number {
  const b = bluffOf(isl);
  if (!b) return 1;
  const a = b.coveAnchor ? (isl.anchors.cove ?? isl.anchors[b.coveAnchor.key]) : undefined;
  if (b.coveAnchor && a) {
    const d = Math.hypot(x - a.x, z - a.z) / isl.radius;
    return 1 - smoothstep(b.coveAnchor.radius[0], b.coveAnchor.radius[1], d);
  }
  const dx = x - isl.cx;
  const dz = z - isl.cz;
  const len = Math.hypot(dx, dz) || 1;
  const dot = (dx * Math.cos(windDir) + dz * Math.sin(windDir)) / len;
  const ch = Math.cos((b.coveHalfDeg * Math.PI) / 180);
  return smoothstep(ch - BLUFF.coveSoft, ch + BLUFF.coveSoft, dot);
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
  const fields: FieldPatchData[] = [];
  const fieldColor = new Uint8Array(n * n);
  const bluffWall = new Float32Array(islands.length);
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
    for (const f of profile.fields ?? []) fields.push({ islandId: isl.id, ...f });
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
        if (profile.fieldColor) {
          const c = profile.fieldColor(cellX(ix), z);
          if (c > 0) fieldColor[iz * n + ix] = c;
        }
      }
    }
    const bluff = bluffOf(isl);
    const peak = bluff ? bluff.peak : p.peak;
    const target = rng.fork('island:peak', isl.id).range(peak[0], peak[1]);
    // the bluff lifts the whole plateau by `wall`; the profile keeps the rest of the peak
    const wall = bluff ? rng.fork('island:bluff', isl.id).range(bluff.wall[0], bluff.wall[1]) : 0;
    bluffWall[isl.id] = wall;
    const scale = max > 0 ? (target - wall) / max : 1;
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
  return { raw, islandMap, tags, streams, fields, fieldColor, bluffWall };
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
        const low =
          tags[i] & Tag.cliff
            ? Math.max(raw[i], BEACH.min)
            : lerp(beach, Math.max(raw[i], beach), smoothstep(0, bw, s));
        data[i] = low;
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
  const hf: Heightfield = {
    data,
    n,
    cellSize: CELL_SIZE,
    originX: GRID_ORIGIN,
    originZ: GRID_ORIGIN,
  };
  applyBluffs(hf, rawLand, sdf, islands, windDir);
  smoothShelfSeams(data, sdf, owner, n);
  return hf;
}

/**
 * Bluff pass (TASK-390), on top of the low (beach-ringed) land heights already in `h`: every
 * bluff island's plateau is lifted by its wall height, rising as a wall right at the shore;
 * inside the cove the low ground stays and the lift ramps up gently behind it. Wall cells
 * get Tag.cliff. A `coveAnchor.flattest` cove is centred on the flattest disc near the
 * anchor, measured on the low heights — where the theme planner will put its quad — and
 * stored as the island's `cove` anchor.
 */
function applyBluffs(
  h: Heightfield,
  rawLand: RawLand,
  sdf: Float32Array,
  islands: IslandData[],
  windDir: number,
): void {
  const { raw, islandMap, tags, bluffWall } = rawLand;
  const n = h.n;
  const data = h.data;
  const wallSdf = bluffSdf(sdf, islandMap, bluffWall, n);
  for (const isl of islands) {
    const ca = bluffOf(isl)?.coveAnchor;
    const a = ca ? isl.anchors[ca.key] : undefined;
    if (!ca || !a) continue;
    const c = ca.flattest ? flattestDisc(h, sdf, islandMap, isl, a, ca.flattest) : a;
    isl.anchors.cove = { x: c.x, z: c.z, rotY: 0 };
  }
  const low = data.slice();
  const wallBand = new Uint8Array(n * n);
  for (let iz = 0; iz < n; iz++) {
    const z = cellZ(iz);
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      if (sdf[i] <= 0 || bluffWall[islandMap[i] - 1] <= 0) continue;
      const isl = islands[islandMap[i] - 1];
      const bluff = bluffOf(isl);
      if (!bluff) continue;
      const wall = bluffWall[isl.id];
      const x = cellX(ix);
      const cove = coveness(isl, windDir, x, z);
      const run = bluffRun(wall);
      const ws = wallSdf[i];
      const c0 = ARCHETYPES[isl.archetype].beachWidth + bluff.coveFlat;
      // the profile eases in behind the rim so it does not steepen the face itself
      const ground = lerp(
        BEACH.min,
        Math.max(raw[i], BEACH.min),
        smoothstep(0, run + BLUFF.rimEase, ws),
      );
      const high = ground + wall * wallShape(ws / run);
      const cv = low[i] + wall * smoothstep(c0, c0 + bluff.coveRamp, ws);
      data[i] = lerp(high, cv, cove);
      if (cove < BLUFF.cliffTagCove && ws < run + BLUFF.cliffTagPad) wallBand[i] = 1;
    }
  }
  // steep wall-band cells are Tag.cliff → Zone.cliff (the shader's earth-wall look); the
  // gentle foot / rim cells stay untagged so they never turn into a rock strip
  const k = BLUFF.cliffTagSlope * 2 * CELL_SIZE;
  for (let i = n; i < n * n - n; i++) {
    if (!wallBand[i]) continue;
    if (Math.hypot(data[i + 1] - data[i - 1], data[i + n] - data[i - n]) > k) tags[i] |= Tag.cliff;
  }
}

/**
 * Centre of the flattest `r` u disc (height spread over its centre, rim and half-rim) within
 * `search` u of `c` (grown by `grow` u up to 5 times while nothing qualifies) with at least
 * `minShore` u of shore distance, + 0.02 / u of distance to `c` — the HQ quad rule
 * (plans/hq.ts). Falls back to `c`.
 */
function flattestDisc(
  h: Heightfield,
  sdf: Float32Array,
  islandMap: Uint8Array,
  isl: IslandData,
  c: { x: number; z: number },
  f: { search: number; grow: number; minShore: number; r: number },
): { x: number; z: number } {
  const spread = (x: number, z: number): number => {
    let lo = heightAt(h, x, z);
    let hi = lo;
    for (let k = 0; k < 8; k++) {
      const ax = Math.cos((k / 8) * Math.PI * 2);
      const az = Math.sin((k / 8) * Math.PI * 2);
      for (const rr of [f.r, f.r / 2]) {
        const y = heightAt(h, x + ax * rr, z + az * rr);
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
    }
    return hi - lo;
  };
  for (let search = f.search; search <= f.search + 5 * f.grow; search += f.grow) {
    const [x0, x1] = gridRange(c.x - search, c.x + search);
    const [z0, z1] = gridRange(c.z - search, c.z + search);
    let best: { x: number; z: number } | null = null;
    let bs = Infinity;
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const i = iz * h.n + ix;
        if (islandMap[i] !== isl.id + 1 || sdf[i] < f.minShore) continue;
        const x = cellX(ix);
        const z = cellZ(iz);
        const d = Math.hypot(x - c.x, z - c.z);
        if (d > search) continue;
        const score = spread(x, z) + 0.02 * d;
        if (score < bs) {
          bs = score;
          best = { x, z };
        }
      }
    if (best) return best;
  }
  return c;
}

/**
 * Shore distance that drives the bluff walls: the exact SDF box-blurred over BLUFF.sdfBlur
 * cells on bluff-island land (water and other land keep the raw value), so the wall rim
 * follows the coast smoothly instead of the 2 u staircase of the binary land mask.
 */
function bluffSdf(
  sdf: Float32Array,
  islandMap: Uint8Array,
  bluffWall: Float32Array,
  n: number,
): Float32Array {
  const r = BLUFF.sdfBlur;
  const out = sdf.slice();
  for (let iz = r; iz < n - r; iz++)
    for (let ix = r; ix < n - r; ix++) {
      const i = iz * n + ix;
      const id = islandMap[i];
      if (id === 0 || sdf[i] <= 0 || bluffWall[id - 1] <= 0) continue;
      let sum = 0;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) sum += sdf[i + dz * n + dx];
      out[i] = Math.max(0, sum / ((2 * r + 1) * (2 * r + 1)));
    }
  return out;
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
