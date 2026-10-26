/**
 * Reef shoals + shared shelves (TASK-488, world plan `W:D1` / `W:K3`; numbers in content REEFS).
 * Pure data, runs on the final heightfield:
 *
 * 1. `planReefs`: `W:K3` sills between neighbouring islands whose coasts come closer than
 *    REEFS.sill.maxGap (along the shortest coast-to-coast line, found on the Voronoi seam of the
 *    two shelves), then 3–6 `W:D1` shoal blobs in the deep water between islands.
 * 2. `raiseReefs`: lifts the seabed to each reef's profile (max with the natural height, never
 *    above the reef's maxY: D-058, no visible land bridge). Returns the natural heights.
 * 3. `buildRoutes` gets `reefNodeMask` (raised cells cost REEFS.routePenalty more per step).
 * 4. `carveReefGaps`: after the routes, every raised cell near a route sinks back to a deep gap,
 *    so a boat never sails over a reef crest; then `reefWeights` = the water shader's tint mask.
 *
 * `openSeaAt` / `reefClearance` / `routeClearance` are the query the TASK-489 whale route uses.
 */
import type { Rng } from '../../core/rng.ts';
import { createNoise, type Noise } from '../../core/noise.ts';
import { clamp01, lerp, smoothstep } from '../../core/math/index.ts';
import { REEFS } from '../../content/reefs.ts';
import type { Heightfield, IslandData, Polyline, ReefData, XZ } from '../types.ts';
import { heightAt } from '../types.ts';
import { cellX, cellZ, GRID_ORIGIN } from './grid.ts';

export interface ReefInput {
  h: Heightfield;
  sdf: Float32Array;
  /** Owning island id + 1 of the nearest coast (water) / of the land (land). */
  owner: Uint8Array;
  islandMap: Uint8Array;
  islands: readonly IslandData[];
}

const cellOf = (h: Heightfield, x: number, z: number): number => {
  const ix = Math.round((x - h.originX) / h.cellSize);
  const iz = Math.round((z - h.originZ) / h.cellSize);
  if (ix < 0 || iz < 0 || ix >= h.n || iz >= h.n) return -1;
  return iz * h.n + ix;
};

/** Nearest land cell of island `id` (islandMap value id + 1) to p, among its coast cells. */
function nearestCoast(inp: ReefInput, id: number, p: XZ): XZ {
  const { h, sdf, islandMap } = inp;
  const isl = inp.islands[id];
  const i0 = Math.max(0, Math.floor((isl.minX - h.originX) / h.cellSize));
  const i1 = Math.min(h.n - 1, Math.ceil((isl.maxX - h.originX) / h.cellSize));
  const j0 = Math.max(0, Math.floor((isl.minZ - h.originZ) / h.cellSize));
  const j1 = Math.min(h.n - 1, Math.ceil((isl.maxZ - h.originZ) / h.cellSize));
  let best = { x: isl.cx, z: isl.cz };
  let bd = Infinity;
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const k = j * h.n + i;
      if (islandMap[k] !== id + 1 || sdf[k] > h.cellSize * 1.5) continue;
      const x = cellX(i);
      const z = cellZ(j);
      const d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = { x, z };
      }
    }
  return best;
}

/** `W:K3` sills: one per island pair whose shelves meet on a seam narrower than maxGap. */
function planSills(inp: ReefInput, rng: Rng): ReefData[] {
  const { h, sdf, owner } = inp;
  const S = REEFS.sill;
  const ni = inp.islands.length;
  const n = h.n;
  // narrowest seam cell per island pair: max sdf (closest to a coast) where owners a | b meet
  const best = new Map<number, { k: number; s: number }>();
  const note = (k: number, a: number, b: number): void => {
    if (a === b || a === 0 || b === 0 || a > ni || b > ni) return;
    const key = Math.min(a, b) * 256 + Math.max(a, b);
    const s = sdf[k];
    const cur = best.get(key);
    if (!cur || s > cur.s) best.set(key, { k, s });
  };
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const k = j * n + i;
      if (sdf[k] >= 0) continue;
      if (sdf[k + 1] < 0) note(k, owner[k], owner[k + 1]);
      if (sdf[k + n] < 0) note(k, owner[k], owner[k + n]);
    }
  const out: ReefData[] = [];
  for (const key of [...best.keys()].sort((a, b) => a - b)) {
    const { k } = best.get(key) as { k: number; s: number };
    const a = Math.floor(key / 256) - 1;
    const b = (key % 256) - 1;
    const ia = inp.islands[a];
    const ib = inp.islands[b];
    // neighbours by the layout's water gap (discs, as LAYOUT spaces them), not coast to coast
    if (Math.hypot(ia.cx - ib.cx, ia.cz - ib.cz) - ia.reach - ib.reach >= S.maxGap) continue;
    const m = { x: cellX(k % n), z: cellZ(Math.floor(k / n)) };
    const pa = nearestCoast(inp, a, m);
    const pb = nearestCoast(inp, b, m);
    const len = Math.hypot(pb.x - pa.x, pb.z - pa.z);
    if (len > S.maxLength || len < 4 * h.cellSize) continue;
    // the line runs over water only (no third island / islet in the way)
    let dry = false;
    for (let t = 3; t <= len - 3 && !dry; t += h.cellSize) {
      const c = cellOf(h, pa.x + ((pb.x - pa.x) * t) / len, pa.z + ((pb.z - pa.z) * t) / len);
      if (c < 0 || sdf[c] > 0) dry = true;
    }
    if (dry) continue;
    const r = rng.fork('sill', a, b);
    out.push({
      kind: 'sill',
      islands: [a, b],
      x0: pa.x,
      z0: pa.z,
      x1: pb.x,
      z1: pb.z,
      halfWidth: r.range(S.halfWidth[0], S.halfWidth[1]),
      crest: S.crest,
      angle: 0,
      aspect: 1,
      salt: r.range(0, 1000),
    });
  }
  // the shortest few only: a star of causeways around the hub would read as a spider
  const length = (r: ReefData): number => Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
  return out.sort((p, q) => length(p) - length(q)).slice(0, S.maxCount);
}

/** Distance from p to the segment a→b and the segment parameter t (0…1). */
function segDist(p: XZ, ax: number, az: number, bx: number, bz: number): { d: number; t: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const L2 = dx * dx + dz * dz || 1;
  const t = clamp01(((p.x - ax) * dx + (p.z - az) * dz) / L2);
  return { d: Math.hypot(p.x - ax - dx * t, p.z - az - dz * t), t };
}

/** Footprint radius of a reef (u) beyond its axis / centre. */
const reach = (r: ReefData): number =>
  r.kind === 'sill' ? r.halfWidth * (1 + REEFS.sill.widthJitter) + REEFS.sill.wobble : r.halfWidth;

/**
 * Distance (u) from p to the outside of the nearest reef footprint: > 0 outside, ≤ 0 over a reef.
 * Uses each reef's bounding shape (axis capsule / disc), a little generous on purpose.
 */
export function reefClearance(reefs: readonly ReefData[], x: number, z: number): number {
  let best = Infinity;
  for (const r of reefs) {
    const d = segDist({ x, z }, r.x0, r.z0, r.x1, r.z1).d - reach(r);
    if (d < best) best = d;
  }
  return best;
}

/** `W:D1` shoal blobs in the deep water between islands, clear of the sills and each other. */
function planShoals(inp: ReefInput, sills: readonly ReefData[], rng: Rng): ReefData[] {
  const { h, sdf, islands } = inp;
  const S = REEFS.shoal;
  const count = rng.int(S.count[0], S.count[1]);
  // candidate window: the archipelago's bounding box
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const isl of islands) {
    x0 = Math.min(x0, isl.cx - isl.reach);
    x1 = Math.max(x1, isl.cx + isl.reach);
    z0 = Math.min(z0, isl.cz - isl.reach);
    z1 = Math.max(z1, isl.cz + isl.reach);
  }
  const out: ReefData[] = [];
  for (let k = 0; k < S.tries && out.length < count; k++) {
    const p = { x: rng.range(x0, x1), z: rng.range(z0, z1) };
    const c = cellOf(h, p.x, p.z);
    if (c < 0) continue;
    const shore = -sdf[c];
    if (shore < S.shore[0] || shore > S.shore[1]) continue;
    if (h.data[c] > -S.minBaseDepth) continue;
    // between islands: the two nearest island discs are both within betweenGap
    const gaps = islands
      .map((isl) => Math.hypot(p.x - isl.cx, p.z - isl.cz) - isl.reach)
      .sort((a, b) => a - b);
    if (gaps.length < 2 || gaps[1] > S.betweenGap) continue;
    if (out.some((o) => Math.hypot(o.x0 - p.x, o.z0 - p.z) < S.spacing)) continue;
    const radius = rng.range(S.radius[0], S.radius[1]);
    if (reefClearance(sills, p.x, p.z) < S.sillClear - REEFS.sill.wobble) continue;
    // the blob must stay in water clear of every coast
    if (shore < radius + 4) continue;
    out.push({
      kind: 'shoal',
      islands: [],
      x0: p.x,
      z0: p.z,
      x1: p.x,
      z1: p.z,
      halfWidth: radius,
      crest: rng.range(S.crest[0], S.crest[1]),
      angle: rng.range(0, Math.PI),
      aspect: rng.range(S.aspect[0], S.aspect[1]),
      salt: rng.range(0, 1000),
    });
  }
  return out;
}

/** Sills first (they decide where shoals may go), then shoals. */
export function planReefs(inp: ReefInput, rng: Rng): ReefData[] {
  const sills = planSills(inp, rng.fork('sills'));
  return [...sills, ...planShoals(inp, sills, rng.fork('shoals'))];
}

/** Reef footprint weight (1 on the crest plateau → 0 at the rim) of the last `reefY` call. */
let footprint = 0;

/** Reef surface height at p (−Infinity outside its footprint); sets `footprint`. */
function reefY(r: ReefData, noise: Noise, x: number, z: number): number {
  footprint = 0;
  if (r.kind === 'sill') {
    const S = REEFS.sill;
    const dx = r.x1 - r.x0;
    const dz = r.z1 - r.z0;
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    const along = (x - r.x0) * ux + (z - r.z0) * uz;
    const t = along / len;
    if (t < -0.15 || t > 1.15) return -Infinity;
    const f = 1 / S.noiseScale;
    const env = Math.sin(Math.PI * clamp01(t));
    const off = S.wobble * env * noise.n2(along * f + r.salt, r.salt * 0.37);
    const across = Math.abs(-(x - r.x0) * uz + (z - r.z0) * ux - off);
    const w = r.halfWidth * (1 + S.widthJitter * noise.n2(along * f + r.salt + 17.3, 4.1));
    // beyond the ends the capsule rounds off
    const endD = t < 0 ? -t * len : t > 1 ? (t - 1) * len : 0;
    const d = Math.hypot(across, endD);
    if (d >= w) return -Infinity;
    const crest = r.crest + S.relief * noise.n2(x / S.reliefScale + r.salt, z / S.reliefScale);
    const fall = smoothstep(w * S.core, w, d);
    footprint = 1 - fall;
    return Math.min(S.maxY, lerp(crest, S.flankY, fall));
  }
  const S = REEFS.shoal;
  const cx = x - r.x0;
  const cz = z - r.z0;
  const ca = Math.cos(r.angle);
  const sa = Math.sin(r.angle);
  const lx = (cx * ca + cz * sa) / r.halfWidth;
  const lz = (-cx * sa + cz * ca) / (r.halfWidth * r.aspect);
  const dw = Math.hypot(lx, lz) + S.warp * noise.fbm(x / S.warpScale + r.salt, z / S.warpScale, 2);
  if (dw >= 1) return -Infinity;
  const crest = r.crest + S.relief * noise.fbm(x / S.reliefScale, z / S.reliefScale + r.salt, 2);
  const fall = smoothstep(S.core, 1, dw);
  footprint = 1 - fall;
  return Math.min(S.maxY, lerp(crest, S.flankY, fall));
}

/**
 * Natural seabed under the reefs: `raised` = 1 where a reef lifted the sample; `weight` = reef
 * footprint 0…1 over water (also where the natural shelf is already shallower: a sill's tint
 * runs on into the islands' rings), lowered again by the route gaps.
 */
export interface ReefField {
  natural: Float32Array;
  raised: Uint8Array;
  weight: Float32Array;
}

/**
 * Raise the seabed under every reef (max with the natural height; land and shallower water are
 * never touched).
 */
export function raiseReefs(h: Heightfield, reefs: readonly ReefData[], rng: Rng): ReefField {
  const base = h.data.slice();
  const raised = new Uint8Array(base.length);
  const weight = new Float32Array(base.length);
  const noise = createNoise(rng);
  const n = h.n;
  for (const r of reefs) {
    const R = reach(r) + h.cellSize;
    const i0 = Math.max(0, Math.floor((Math.min(r.x0, r.x1) - R - GRID_ORIGIN) / h.cellSize));
    const i1 = Math.min(n - 1, Math.ceil((Math.max(r.x0, r.x1) + R - GRID_ORIGIN) / h.cellSize));
    const j0 = Math.max(0, Math.floor((Math.min(r.z0, r.z1) - R - GRID_ORIGIN) / h.cellSize));
    const j1 = Math.min(n - 1, Math.ceil((Math.max(r.z0, r.z1) + R - GRID_ORIGIN) / h.cellSize));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = j * n + i;
        if (h.data[k] >= 0) continue;
        const y = reefY(r, noise, cellX(i), cellZ(j));
        if (footprint > weight[k]) weight[k] = footprint;
        if (y > h.data[k]) {
          h.data[k] = y;
          raised[k] = 1;
        }
      }
  }
  return { natural: base, raised, weight };
}

/**
 * Coarse-node reef flags for the route A* (`cell` = coarse spacing in samples): 1 where any
 * sample within ± cell / 2 is raised more than REEFS.liftMin above its natural height.
 */
export function reefNodeMask(h: Heightfield, f: ReefField, k: number): Uint8Array {
  const cn = Math.floor((h.n - 1) / k) + 1;
  const out = new Uint8Array(cn * cn);
  for (let cz = 0; cz < cn; cz++)
    for (let cx = 0; cx < cn; cx++) {
      let hit = 0;
      for (let dz = -k + 1; dz <= k - 1 && !hit; dz++)
        for (let dx = -k + 1; dx <= k - 1 && !hit; dx++) {
          const ix = cx * k + dx;
          const iz = cz * k + dz;
          if (ix < 0 || iz < 0 || ix >= h.n || iz >= h.n) continue;
          const i = iz * h.n + ix;
          if (f.raised[i] && h.data[i] - f.natural[i] > REEFS.liftMin) hit = 1;
        }
      out[cz * cn + cx] = hit;
    }
  return out;
}

/**
 * Deep gaps: every raised cell within REEFS.gap.halfWidth (+ soft) of a route sample sinks
 * toward −gap.depth (never below its natural height). Routes stay valid (deeper only).
 */
export function carveReefGaps(h: Heightfield, f: ReefField, routes: readonly Polyline[]): void {
  const base = f.natural;
  const G = REEFS.gap;
  const n = h.n;
  const R = G.halfWidth + G.soft;
  const reach = Math.ceil(R / h.cellSize);
  const pull = new Float32Array(n * n);
  for (const route of routes)
    for (const p of route.points) {
      const ci = Math.round((p.x - h.originX) / h.cellSize);
      const cj = Math.round((p.z - h.originZ) / h.cellSize);
      for (let j = cj - reach; j <= cj + reach; j++)
        for (let i = ci - reach; i <= ci + reach; i++) {
          if (i < 0 || j < 0 || i >= n || j >= n) continue;
          const k = j * n + i;
          if (!f.raised[k] && f.weight[k] <= 0) continue;
          const d = Math.hypot(cellX(i) - p.x, cellZ(j) - p.z);
          const w = 1 - smoothstep(G.halfWidth, R, d);
          if (w > pull[k]) pull[k] = w;
        }
    }
  for (let k = 0; k < n * n; k++) {
    if (pull[k] <= 0) continue;
    f.weight[k] *= 1 - pull[k];
    if (!f.raised[k]) continue;
    const y = Math.min(h.data[k], lerp(h.data[k], -G.depth, pull[k]));
    h.data[k] = Math.max(base[k], y);
  }
}

/**
 * Water-shader reef mask per sample (0…255): the reef footprint weight after the route gaps. The
 * shader multiplies it by a depth fade, so a carved gap or a later edit that digs the reef out
 * loses the tint by itself.
 */
export function reefWeights(f: ReefField): Uint8Array {
  const out = new Uint8Array(f.weight.length);
  for (let k = 0; k < out.length; k++) out[k] = Math.round(255 * clamp01(f.weight[k]));
  return out;
}

/** Distance (u) from p to the nearest sample of any route polyline (Infinity without routes). */
export function routeClearance(routes: readonly Polyline[], x: number, z: number): number {
  let best = Infinity;
  for (const r of routes) {
    const pts = r.points;
    const m = r.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < m; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const d = segDist({ x, z }, a.x, a.z, b.x, b.z).d;
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * Open sea for big swimmers (TASK-489 whale): seabed ≥ REEFS.openSea.minDepth deep, ≥ reefClear
 * outside every reef and ≥ routeClear from every boat / ferry route (override per call).
 */
export function openSeaAt(
  world: { height: Heightfield; reefs: readonly ReefData[]; boatRoutes: readonly Polyline[] },
  x: number,
  z: number,
  opts: Partial<{ minDepth: number; reefClear: number; routeClear: number }> = {},
): boolean {
  const o = { ...REEFS.openSea, ...opts };
  return (
    heightAt(world.height, x, z) <= -o.minDepth &&
    reefClearance(world.reefs, x, z) >= o.reefClear &&
    routeClearance(world.boatRoutes, x, z) >= o.routeClear
  );
}
