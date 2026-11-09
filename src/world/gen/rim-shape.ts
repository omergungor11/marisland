/**
 * Bluff rim silhouette, the wall-height table (TASK-615, M50 G6): wall height by bearing round
 * the coast and the terrace sector. Kept apart from gen/rim.ts (applied after the sites) so the
 * heightfield pass imports no planner module. Pure data.
 */
import type { Rng } from '../../core/rng.ts';
import { smoothstep } from '../../core/math/index.ts';
import * as dm from '../../core/math/dmath.ts';
import { ARCHETYPES, RIM, type RimParams } from '../../content/islands.ts';
import type { IslandData } from '../types.ts';
import { cellX, cellZ, gridRange } from './grid.ts';
import { bluffOf } from './heightfield.ts';

const TAU = Math.PI * 2;

/** Per-island rim modulation: wall height and terrace weight by bearing from the centre. */
export interface RimShape {
  /** Wall height (u) at the coast in the direction of (x, z). */
  wallAt(x: number, z: number): number;
  /** 0 → 1 inside the terrace sector (0 everywhere without a terrace). */
  terraceAt(x: number, z: number): number;
  /** Lower step height as a fraction of the wall, and the ledge width (u). */
  frac: number;
  ledge: number;
}

/** Circular box blur of `a` over ±`r` bins. */
function blurRing(a: Float64Array, r: number): Float64Array {
  const n = a.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += a[(i + k + n) % n];
    out[i] = s / (2 * r + 1);
  }
  return out;
}

/** Bearing of (x, z) from the island centre in [0, TAU). */
function bearing(isl: IslandData, x: number, z: number): number {
  const a = dm.atan2(z - isl.cz, x - isl.cx);
  return a < 0 ? a + TAU : a;
}

/** Linear lookup of a ring table at bearing `a`. */
function ringAt(t: Float64Array, a: number): number {
  const n = t.length;
  const f = (a / TAU) * n;
  const i0 = Math.floor(f);
  const w = f - i0;
  return t[((i0 % n) + n) % n] * (1 - w) + t[(i0 + 1) % n] * w;
}

/**
 * Rim shape of a bluff island with a `rim` block, or null. The modulation m(θ) ∈ [−1, 1] mixes a
 * seeded lobe wave (`lobes` lobes), the headland term (coast radius above its broad trend, so a
 * promontory stands higher) and the cove side (lower towards the cove anchor / leeward bearing);
 * wall(θ) = max(RIM.minWall, wall · (1 + amp · m)). The terrace sector faces away from the cove.
 */
export function rimShape(
  isl: IslandData,
  wall: number,
  islandMap: Uint8Array,
  n: number,
  windDir: number,
  rng: Rng,
): RimShape | null {
  const p: RimParams | undefined = ARCHETYPES[isl.archetype].rim;
  if (!p || wall <= 0) return null;
  const B = RIM.bins;
  // coast radius per bearing bin (farthest own land sample)
  const rad = new Float64Array(B);
  const [x0, x1] = gridRange(isl.minX, isl.maxX);
  const [z0, z1] = gridRange(isl.minZ, isl.maxZ);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      if (islandMap[iz * n + ix] !== isl.id + 1) continue;
      const x = cellX(ix);
      const z = cellZ(iz);
      const b = Math.min(B - 1, Math.floor((bearing(isl, x, z) / TAU) * B));
      const d = Math.hypot(x - isl.cx, z - isl.cz);
      if (d > rad[b]) rad[b] = d;
    }
  let mean = 0;
  for (let b = 0; b < B; b++) mean += rad[b];
  mean /= B;
  for (let b = 0; b < B; b++) if (rad[b] === 0) rad[b] = mean;
  const trend = blurRing(rad, Math.round(B * RIM.headlandWindow));
  const bump = new Float64Array(B);
  for (let b = 0; b < B; b++) bump[b] = rad[b] - trend[b];
  const head = blurRing(bump, 1);
  let hmax = 1e-6;
  for (let b = 0; b < B; b++) hmax = Math.max(hmax, Math.abs(head[b]));
  // cove bearing: the cove disc's anchor, else the leeward direction
  const ca = bluffOf(isl)?.coveAnchor;
  const a = ca ? (isl.anchors.cove ?? isl.anchors[ca.key]) : undefined;
  const coveDir = a ? dm.atan2(a.z - isl.cz, a.x - isl.cx) : windDir;
  const lobes = rng.int(p.lobes[0], p.lobes[1]);
  const phase = rng.range(0, TAU);
  const W = RIM.weights;
  const m = new Float64Array(B);
  let mmax = 1e-6;
  for (let b = 0; b < B; b++) {
    const th = ((b + 0.5) / B) * TAU;
    const cove = Math.max(0, dm.cos(th - coveDir));
    m[b] =
      W.lobe * dm.cos(lobes * th + phase) + (W.headland * head[b]) / hmax - W.cove * cove * cove;
    mmax = Math.max(mmax, Math.abs(m[b]));
  }
  const wallT = new Float64Array(B);
  for (let b = 0; b < B; b++) wallT[b] = Math.max(RIM.minWall, wall * (1 + (p.amp * m[b]) / mmax));
  const t = p.terrace;
  const centre = t
    ? coveDir + Math.PI + rng.range(-1, 1) * RIM.terraceSwingDeg * (Math.PI / 180)
    : 0;
  const half = t ? (t.arcDeg / 2) * (Math.PI / 180) : 0;
  const soft = RIM.terraceSoftDeg * (Math.PI / 180);
  // bins are centred at (b + 0.5) / B: shift the lookup by half a bin
  const shift = Math.PI / B;
  return {
    wallAt: (x, z) => ringAt(wallT, (bearing(isl, x, z) - shift + TAU) % TAU),
    terraceAt: (x, z) => {
      if (!t) return 0;
      const d = Math.abs(
        dm.atan2(dm.sin(bearing(isl, x, z) - centre), dm.cos(bearing(isl, x, z) - centre)),
      );
      return 1 - smoothstep(half - soft, half + soft, d);
    },
    frac: t?.frac ?? 0,
    ledge: t?.ledge ?? 0,
  };
}
