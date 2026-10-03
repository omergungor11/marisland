import { CELL_SIZE, WORLD_SIZE } from '../types.ts';

const BIG = 1e20;

/**
 * 1-D squared distance transform of sampled function f (Felzenszwalb &
 * Huttenlocher 2012). O(n). Writes into d; v/z are scratch.
 */
function edt1d(
  f: Float64Array,
  n: number,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array,
  arg: Int32Array | null,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
    if (arg) arg[q] = v[k];
  }
}

/**
 * Exact Euclidean distance transform (separable, O(w·h)). Returns, per cell,
 * the distance in CELLS to the nearest cell where `mask[i] === target`
 * (0 on those cells). Cells with no target anywhere get a huge value.
 */
export function edt(mask: Uint8Array, w: number, h: number, target: number): Float32Array {
  return edtImpl(mask, w, h, target, false).dist;
}

/**
 * EDT plus the feature transform: `nearest[i]` is the index of the nearest
 * target cell (−1 if there is none). Distances are bit-identical to `edt`.
 */
export function edtNearest(
  mask: Uint8Array,
  w: number,
  h: number,
  target: number,
): { dist: Float32Array; nearest: Int32Array } {
  const r = edtImpl(mask, w, h, target, true);
  return { dist: r.dist, nearest: r.nearest as Int32Array };
}

function edtImpl(
  mask: Uint8Array,
  w: number,
  h: number,
  target: number,
  withNearest: boolean,
): { dist: Float32Array; nearest: Int32Array | null } {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const arg = withNearest ? new Int32Array(n) : null;
  const tmp = new Float64Array(w * h);
  const colArg = withNearest ? new Int32Array(w * h) : null;
  // columns
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = mask[y * w + x] === target ? 0 : BIG;
    edt1d(f, h, d, v, z, arg);
    for (let y = 0; y < h; y++) tmp[y * w + x] = d[y];
    if (colArg && arg) for (let y = 0; y < h; y++) colArg[y * w + x] = arg[y];
  }
  // rows
  const out = new Float32Array(w * h);
  const nearest = withNearest ? new Int32Array(w * h) : null;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) f[x] = tmp[row + x];
    edt1d(f, w, d, v, z, arg);
    for (let x = 0; x < w; x++) out[row + x] = Math.sqrt(d[x]);
    if (nearest && colArg && arg)
      for (let x = 0; x < w; x++) {
        const nx = arg[x];
        nearest[row + x] = d[x] >= BIG ? -1 : colArg[row + nx] * w + nx;
      }
  }
  return { dist: out, nearest };
}

/** SDF magnitude cap when one side is empty (no land at all). */
const SDF_CAP = WORLD_SIZE * 1.5;

/**
 * Signed shore distance in u from a land mask (1 = land): > 0 on land,
 * < 0 in water. The coastline is taken halfway between a land and a water
 * sample, so boundary samples sit at ±CELL_SIZE/2.
 */
export function shoreSdf(land: Uint8Array, n: number): Float32Array {
  return shoreSdfOwners(land, n, null).sdf;
}

/**
 * Shore SDF plus, per cell, the owning island (id + 1) of the nearest coast:
 * land cells keep their own `islandMap` value, water cells take the island of
 * the nearest land cell (exact feature transform, so shelves meet on the
 * Voronoi seam of the coastlines, not of the island centres).
 */
export function shoreSdfOwners(
  land: Uint8Array,
  n: number,
  islandMap: Uint8Array | null,
): { sdf: Float32Array; owner: Uint8Array } {
  const toWater = edt(land, n, n, 0);
  const near = edtNearest(land, n, n, 1);
  const toLand = near.dist;
  const owner = new Uint8Array(n * n);
  if (islandMap)
    for (let i = 0; i < owner.length; i++) {
      const j = land[i] === 1 ? i : near.nearest[i];
      owner[i] = j >= 0 ? islandMap[j] : 0;
    }
  const half = CELL_SIZE / 2;
  const sdf = new Float32Array(n * n);
  for (let i = 0; i < sdf.length; i++) {
    sdf[i] =
      land[i] === 1
        ? Math.min(SDF_CAP, toWater[i] * CELL_SIZE - half)
        : -Math.min(SDF_CAP, toLand[i] * CELL_SIZE - half);
  }
  return { sdf, owner };
}

export interface CoastCleanup {
  /** Samples that became land (filled inlets). */
  added: number[];
  /** Samples that became water (removed spits). */
  removed: number[];
}

/**
 * Close then open the land mask (in place) on the land's bounding box only
 * (padded so the morphology never touches the crop edge). Returned indices
 * are in the full n×n grid.
 */
export function cleanCoast(
  land: Uint8Array,
  n: number,
  closeRadius: number,
  openRadius: number,
  protect: Uint8Array | null = null,
): CoastCleanup {
  let x0 = n;
  let z0 = n;
  let x1 = -1;
  let z1 = -1;
  for (let i = 0; i < land.length; i++) {
    if (land[i] !== 1) continue;
    const x = i % n;
    const z = (i - x) / n;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  if (x1 < 0) return { added: [], removed: [] };
  const pad = Math.ceil(Math.max(closeRadius, openRadius) / CELL_SIZE) + 2;
  x0 = Math.max(0, x0 - pad);
  z0 = Math.max(0, z0 - pad);
  x1 = Math.min(n - 1, x1 + pad);
  z1 = Math.min(n - 1, z1 + pad);
  const w = x1 - x0 + 1;
  const h = z1 - z0 + 1;
  const sub = new Uint8Array(w * h);
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) sub[z * w + x] = land[(z + z0) * n + x + x0];
  const toFull = (j: number): number => {
    const x = j % w;
    return ((j - x) / w + z0) * n + x + x0;
  };
  const added: number[] = [];
  for (const j of morph(sub, w, h, closeRadius, 'close')) {
    const i = toFull(j);
    if (protect && protect[i] !== 0) sub[j] = 0;
    else added.push(i);
  }
  const removed = morph(sub, w, h, openRadius, 'open').map(toFull);
  for (const i of added) land[i] = 1;
  for (const i of removed) land[i] = 0;
  return { added, removed };
}

/** Rectangular-grid closing/opening (in place); returns changed indices. */
function morph(
  mask: Uint8Array,
  w: number,
  h: number,
  radius: number,
  op: 'close' | 'open',
): number[] {
  const r = radius / CELL_SIZE;
  const grow = op === 'close' ? 1 : 0; // value that spreads first
  const toGrow = edt(mask, w, h, grow);
  const tmp = new Uint8Array(w * h);
  for (let i = 0; i < tmp.length; i++) tmp[i] = toGrow[i] <= r ? grow : 1 - grow;
  const back = edt(tmp, w, h, 1 - grow);
  const changed: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== grow && back[i] > r) {
      mask[i] = grow;
      changed.push(i);
    }
  }
  return changed;
}
