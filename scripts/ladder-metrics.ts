/**
 * Zoom-ladder consistency metric (D-031, M14b TASK-374) and the M14c motion metric. Pure: raw
 * pixel buffers in, numbers out (no sharp / playwright), so vitest runs it on synthetic images.
 *
 * Ladder step k → k+1 (phase-3.md §6): map the near frame (k+1) into the far frame (k) — a centre
 * crop by r = D[k+1]/D[k], or exactly through the ground plane at the target (`planeMap`, the
 * harness default: at FOV 35° / pitch 48° the plain crop misregisters the top / bottom rows by
 * about 2 cells per 0.7 step) — box-downsample both to 48 × 27 cells in linear RGB, convert to
 * CIE Lab and compare cells that are solid (land or structure) in both semantic masks. Each cell
 * matches its best far-frame neighbour within ±1 cell (`slack`): tall props and relief off the
 * target plane parallax by a cell or two between 0.7 steps (Marketing's pines: 30 → 21 u p95 29.9
 * without, 7.7 with), while an element that was absent in the far frame has no matching neighbour.
 */
import { TERRAIN_MASK } from '../src/content/terrain.ts';
import { WATER } from '../src/content/palette.ts';

export const GRID = { w: 48, h: 27 } as const;

/** Pass criteria (phase-3.md §6, recorded in D-031). */
export const LADDER_THRESHOLDS = {
  /** A cell is compared when both masks are at least this solid. */
  cellSolid: 0.8,
  /**
   * Below this fraction of compared cells a step / pair is reported but not judged. The plan's
   * 25 % would skip every frame ≥ 170 u (the island fills 8–18 % of the grid at pitch 48°) and
   * with it the T0 → T1 campus pop; calibration (TASK-374): those steps are stable at 5 %.
   */
  minLandFrac: 0.05,
  stepMean: 5,
  stepP95: 12,
  /** "No new large element": cells with ΔE above `blobDeltaE` … */
  blobDeltaE: 15,
  /** … form at most this fraction of the compared cells as one 8-connected component. */
  stepBlob: 0.015,
  drift: 4,
  pairMean: 2.5,
  pairBlob: 0.005,
  pairIou: 0.92,
  /** Registration slack (cells): parallax of tall props / relief off the target plane. */
  slack: 1,
} as const;

/** Raw interleaved 8-bit sRGB pixels (RGB or RGBA), row-major, top row first. */
export interface Img {
  width: number;
  height: number;
  channels: number;
  data: Uint8Array;
}

/** Normalised frame coordinates (u right, v down, 0..1) of the near frame → far frame. */
export type MapFn = (u: number, v: number) => [number, number];

export const identityMap: MapFn = (u, v) => [u, v];

/** Pure zoom about the frame centre: the near frame is the centre `r` of the far frame. */
export function cropMap(r: number): MapFn {
  return (u, v) => [0.5 + (u - 0.5) * r, 0.5 + (v - 0.5) * r];
}

/** Orbit view for `planeMap`: vertical FOV and pitch in degrees, distance to the target in u. */
export interface LadderView {
  fovDeg: number;
  aspect: number;
  pitchDeg: number;
  dist: number;
}

/**
 * Exact dolly mapping through the horizontal plane at the target: a near-frame pixel's ray hits
 * the plane, the hit is projected into the far camera (same target, pitch and azimuth). Rays above
 * the horizon fall back to the centre crop.
 */
export function planeMap(near: LadderView, far: LadderView): MapFn {
  const p = (near.pitchDeg * Math.PI) / 180;
  const s = Math.sin(p);
  const c = Math.cos(p);
  const th = Math.tan((near.fovDeg * Math.PI) / 360);
  const crop = cropMap(near.dist / far.dist);
  // target at the origin, camera on +z: forward (0,-s,-c), right (1,0,0), up (0,c,-s)
  return (u, v) => {
    const x = (2 * u - 1) * th * near.aspect;
    const y = (1 - 2 * v) * th;
    const dy = -s + y * c;
    if (dy >= -1e-6) return crop(u, v);
    const dz = -c - y * s;
    const t = (near.dist * s) / -dy;
    const px = x * t;
    const pz = near.dist * c + dz * t;
    // into the far camera at (0, D s, D c)
    const ry = -far.dist * s;
    const rz = pz - far.dist * c;
    const depth = -s * ry - c * rz;
    if (depth <= 1e-6) return crop(u, v);
    const cu = px / depth;
    const cv = (c * ry - s * rz) / depth;
    return [(cu / (th * far.aspect) + 1) / 2, (1 - cv / th) / 2];
  };
}

// ---------------------------------------------------------------- colour
const SRGB_LUT = Float64Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});

export type Lab = [number, number, number];

/** Linear sRGB (D65) → CIE L*a*b*. */
export function linearToLab(r: number, g: number, b: number): Lab {
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number): number =>
    t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 / 116) * t + 16 / 116;
  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIEDE2000 colour difference (kL = kC = kH = 1). */
export function deltaE2000(a: Lab, b: Lab): number {
  const [L1, a1, b1] = a;
  const [L2, a2, b2] = b;
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm7 = ((C1 + C2) / 2) ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cm7 / (Cm7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (bb: number, aa: number): number => {
    if (bb === 0 && aa === 0) return 0;
    const h = Math.atan2(bb, aa) / rad;
    return h < 0 ? h + 360 : h;
  };
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);
  const Lpm = (L1 + L2) / 2;
  const Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hpm += h1p + h2p < 360 ? 360 : -360;
    hpm /= 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hpm - 30) * rad) +
    0.24 * Math.cos(2 * hpm * rad) +
    0.32 * Math.cos((3 * hpm + 6) * rad) -
    0.2 * Math.cos((4 * hpm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const Cpm7 = Cpm ** 7;
  const Rc = 2 * Math.sqrt(Cpm7 / (Cpm7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2);
  const Sc = 1 + 0.045 * Cpm;
  const Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  const l = dLp / Sl;
  const cc = dCp / Sc;
  const hh = dHp / Sh;
  return Math.sqrt(l * l + cc * cc + hh * hh + Rt * cc * hh);
}

// ---------------------------------------------------------------- cells
/** For every grid cell of the near frame: the far-frame pixel rectangle it covers. */
function cellRects(img: Img, map: MapFn): Int32Array {
  const { w, h } = GRID;
  const out = new Int32Array(w * h * 4);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let u0 = Infinity;
      let v0 = Infinity;
      let u1 = -Infinity;
      let v1 = -Infinity;
      for (const [cu, cv] of [
        [i / w, j / h],
        [(i + 1) / w, j / h],
        [i / w, (j + 1) / h],
        [(i + 1) / w, (j + 1) / h],
      ]) {
        const [mu, mv] = map(cu, cv);
        u0 = Math.min(u0, mu);
        u1 = Math.max(u1, mu);
        v0 = Math.min(v0, mv);
        v1 = Math.max(v1, mv);
      }
      // pixels whose centres fall inside; at least one (the nearest), clamped to the frame
      const clampX = (x: number): number => Math.min(img.width, Math.max(0, x));
      const clampY = (y: number): number => Math.min(img.height, Math.max(0, y));
      let x0 = clampX(Math.round(u0 * img.width));
      let x1 = clampX(Math.round(u1 * img.width));
      let y0 = clampY(Math.round(v0 * img.height));
      let y1 = clampY(Math.round(v1 * img.height));
      if (x1 <= x0) [x0, x1] = x0 >= img.width ? [img.width - 1, img.width] : [x0, x0 + 1];
      if (y1 <= y0) [y0, y1] = y0 >= img.height ? [img.height - 1, img.height] : [y0, y0 + 1];
      out.set([x0, y0, x1, y1], (j * w + i) * 4);
    }
  return out;
}

/** Box-downsampled linear RGB per cell (3 floats per cell), sampled through `map`. */
export function downsample(img: Img, map: MapFn = identityMap): Float64Array {
  const n = GRID.w * GRID.h;
  const rects = cellRects(img, map);
  const out = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) {
    const [x0, y0, x1, y1] = rects.subarray(k * 4, k * 4 + 4);
    let r = 0;
    let g = 0;
    let b = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const o = (y * img.width + x) * img.channels;
        r += SRGB_LUT[img.data[o]];
        g += SRGB_LUT[img.data[o + 1]];
        b += SRGB_LUT[img.data[o + 2]];
      }
    const c = (x1 - x0) * (y1 - y0);
    out[k * 3] = r / c;
    out[k * 3 + 1] = g / c;
    out[k * 3 + 2] = b / c;
  }
  return out;
}

export function cellsToLab(cells: Float64Array): Lab[] {
  const out: Lab[] = [];
  for (let k = 0; k < cells.length; k += 3)
    out.push(linearToLab(cells[k], cells[k + 1], cells[k + 2]));
  return out;
}

// ---------------------------------------------------------------- semantic mask
const hex = (h: string): [number, number, number] => {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
/** `debug=mask` colours that are not solid: water bands, seabed, sky (black), clouds (white). */
const EMPTY_COLOURS = [
  ...[WATER.deep, WATER.mid, WATER.shallow, WATER.lagoon, WATER.foam, TERRAIN_MASK.seabed].map(hex),
  [0, 0, 0],
  [255, 255, 255],
];
/** Flat unlit terrain colours above the sea; anything else (lit props) is a structure. */
const TERRAIN_COLOURS = [TERRAIN_MASK.land, TERRAIN_MASK.wetSand, TERRAIN_MASK.rock].map(hex);
const MASK_TOL = 6;

/** 0 = empty (water / sky / cloud), 1 = terrain land, 2 = structure / prop. */
export function maskClass(r: number, g: number, b: number): 0 | 1 | 2 {
  const near = (c: number[]): boolean =>
    Math.abs(c[0] - r) <= MASK_TOL &&
    Math.abs(c[1] - g) <= MASK_TOL &&
    Math.abs(c[2] - b) <= MASK_TOL;
  if (EMPTY_COLOURS.some(near)) return 0;
  return TERRAIN_COLOURS.some(near) ? 1 : 2;
}

export interface MaskCells {
  /** Fraction of the cell that is land or structure. */
  solid: Float64Array;
  /** Fraction of the cell that is structure (lit props). */
  struct: Float64Array;
}

export function maskCells(img: Img, map: MapFn = identityMap): MaskCells {
  const n = GRID.w * GRID.h;
  const rects = cellRects(img, map);
  const solid = new Float64Array(n);
  const struct = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const [x0, y0, x1, y1] = rects.subarray(k * 4, k * 4 + 4);
    let s = 0;
    let st = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const o = (y * img.width + x) * img.channels;
        const cl = maskClass(img.data[o], img.data[o + 1], img.data[o + 2]);
        if (cl > 0) s++;
        if (cl === 2) st++;
      }
    const c = (x1 - x0) * (y1 - y0);
    solid[k] = s / c;
    struct[k] = st / c;
  }
  return { solid, struct };
}

// ---------------------------------------------------------------- components
/** Sizes of the 8-connected components of `on` cells on a w × h grid, largest first. */
export function components(on: ArrayLike<boolean>, w: number, h: number): number[] {
  const seen = new Uint8Array(w * h);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!on[s] || seen[s]) continue;
    seen[s] = 1;
    stack.push(s);
    let size = 0;
    while (stack.length) {
      const k = stack.pop() as number;
      size++;
      const x = k % w;
      const y = (k - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (on[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
    }
    sizes.push(size);
  }
  return sizes.sort((a, b) => b - a);
}

function iou(a: ArrayLike<boolean>, b: ArrayLike<boolean>): number {
  let inter = 0;
  let uni = 0;
  for (let k = 0; k < a.length; k++) {
    if (a[k] && b[k]) inter++;
    if (a[k] || b[k]) uni++;
  }
  return uni === 0 ? 1 : inter / uni;
}

// ---------------------------------------------------------------- step / pair
export interface StepMetrics {
  /** Cells compared (solid in both) and their fraction of the grid. */
  compared: number;
  landFrac: number;
  /** False when `landFrac` < minLandFrac: reported, not judged. */
  judged: boolean;
  mean: number;
  p95: number;
  max: number;
  /** Largest 8-connected component of compared cells with ΔE > blobDeltaE, fraction of compared. */
  blob: number;
  blobCells: number;
  /** IoU of the solid (land + structure) cell masks over the whole grid. */
  iou: number;
  /** IoU of the structure-dominated cells (≥ 50 % lit props). */
  structIou: number;
  /** ΔE per cell (NaN where not compared), for heat maps. */
  heat: Float64Array;
}

/**
 * Compare the near frame (+ its mask) with the far frame (+ mask) sampled through `map`
 * (near → far coordinates): the far frame's matching region against the whole near frame.
 */
export function compareFrames(
  near: Img,
  nearMask: Img,
  far: Img,
  farMask: Img,
  map: MapFn,
  slack: number = LADDER_THRESHOLDS.slack,
): StepMetrics {
  const T = LADDER_THRESHOLDS;
  const n = GRID.w * GRID.h;
  const A = cellsToLab(downsample(near));
  const mA = maskCells(nearMask);
  const mB = maskCells(farMask, map);
  // far-frame samples shifted by up to ±slack cells: a cell matches its best neighbour
  const Bs: Lab[][] = [];
  for (let dy = -slack; dy <= slack; dy++)
    for (let dx = -slack; dx <= slack; dx++)
      Bs.push(cellsToLab(downsample(far, (u, v) => map(u + dx / GRID.w, v + dy / GRID.h))));
  const heat = new Float64Array(n).fill(NaN);
  const vals: number[] = [];
  const hot: boolean[] = new Array<boolean>(n).fill(false);
  for (let k = 0; k < n; k++) {
    if (mA.solid[k] < T.cellSolid || mB.solid[k] < T.cellSolid) continue;
    let d = Infinity;
    for (const B of Bs) d = Math.min(d, deltaE2000(B[k], A[k]));
    heat[k] = d;
    vals.push(d);
    hot[k] = d > T.blobDeltaE;
  }
  const compared = vals.length;
  const sorted = [...vals].sort((a, b) => a - b);
  const blobCells = components(hot, GRID.w, GRID.h)[0] ?? 0;
  const solidA = Array.from(mA.solid, (v) => v >= 0.5);
  const solidB = Array.from(mB.solid, (v) => v >= 0.5);
  const structA = Array.from(mA.struct, (v) => v >= 0.5);
  const structB = Array.from(mB.struct, (v) => v >= 0.5);
  return {
    compared,
    landFrac: compared / n,
    judged: compared / n >= T.minLandFrac,
    mean: compared ? vals.reduce((a, b) => a + b, 0) / compared : 0,
    p95: compared ? sorted[Math.min(compared - 1, Math.floor(0.95 * compared))] : 0,
    max: compared ? sorted[compared - 1] : 0,
    blob: compared ? blobCells / compared : 0,
    blobCells,
    iou: iou(solidA, solidB),
    structIou: iou(structA, structB),
    heat,
  };
}

/**
 * Island drift: ΔE2000 between the mean colour of the same ground region in two frames — the
 * near frame's footprint (sampled in the far frame through `map`), cells solid in both masks. The
 * harness compares every ladder frame with the drift reference frame (`FRAMING.ladder.driftRef`,
 * the whole island at T1), so a far frame does not average the neighbouring islands in and a near
 * frame is not compared with the whole island. Null below 4 common cells.
 */
export function regionDrift(
  near: Img,
  nearMask: Img,
  far: Img,
  farMask: Img,
  map: MapFn,
): number | null {
  const a = downsample(near);
  const b = downsample(far, map);
  const mA = maskCells(nearMask);
  const mB = maskCells(farMask, map);
  const sa = [0, 0, 0];
  const sb = [0, 0, 0];
  let c = 0;
  for (let k = 0; k < mA.solid.length; k++) {
    if (mA.solid[k] < LADDER_THRESHOLDS.cellSolid || mB.solid[k] < LADDER_THRESHOLDS.cellSolid)
      continue;
    for (let i = 0; i < 3; i++) {
      sa[i] += a[k * 3 + i];
      sb[i] += b[k * 3 + i];
    }
    c++;
  }
  if (c < 4) return null;
  return deltaE2000(
    linearToLab(sa[0] / c, sa[1] / c, sa[2] / c),
    linearToLab(sb[0] / c, sb[1] / c, sb[2] / c),
  );
}

/** Threshold failures of a ladder step (`pair` = boundary pair criteria). Unjudged → none. */
export function stepFailures(m: StepMetrics, pair: boolean): string[] {
  const T = LADDER_THRESHOLDS;
  if (!m.judged) return [];
  const f: string[] = [];
  const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
  if (pair) {
    if (m.mean > T.pairMean) f.push(`mean ΔE ${m.mean.toFixed(2)} > ${T.pairMean}`);
    if (m.blob > T.pairBlob) f.push(`blob ${pct(m.blob)} > ${pct(T.pairBlob)}`);
    if (m.iou < T.pairIou) f.push(`IoU ${m.iou.toFixed(3)} < ${T.pairIou}`);
  } else {
    if (m.mean > T.stepMean) f.push(`mean ΔE ${m.mean.toFixed(2)} > ${T.stepMean}`);
    if (m.p95 > T.stepP95) f.push(`p95 ΔE ${m.p95.toFixed(1)} > ${T.stepP95}`);
    if (m.blob > T.stepBlob) f.push(`blob ${pct(m.blob)} > ${pct(T.stepBlob)}`);
  }
  return f;
}

// ---------------------------------------------------------------- motion (M14c)
export interface MotionMetrics {
  /** Fraction of the crop's pixels that changed. */
  changedFrac: number;
  /** 8-connected clusters of changed pixels with at least `minCluster` pixels. */
  clusters: number;
  largest: number;
}

/** M14c acceptance of a T3 campus `deltaT` = 0.5 s pair (phase-3.md M14c). */
export const LIVE_THRESHOLDS = { changedFrac: 0.03, clusters: 5 } as const;

/** Misses of a live pair against `LIVE_THRESHOLDS` (empty = pass). */
export function liveFailures(m: MotionMetrics): string[] {
  const f: string[] = [];
  if (m.changedFrac < LIVE_THRESHOLDS.changedFrac)
    f.push(`motion ${(m.changedFrac * 100).toFixed(1)}% < ${LIVE_THRESHOLDS.changedFrac * 100}%`);
  if (m.clusters < LIVE_THRESHOLDS.clusters)
    f.push(`clusters ${m.clusters} < ${LIVE_THRESHOLDS.clusters}`);
  return f;
}

/**
 * Motion between a frame and its `deltaT` pair inside a crop (normalised x0, y0, x1, y1): a pixel
 * changed when any channel differs by more than `threshold`; clusters smaller than `minCluster`
 * pixels (noise, sparkle) are not counted. With a `debug=mask` frame of the first view, only solid
 * pixels (land, structures — not water / sky / clouds) count, so foam and swell do not pass for
 * campus life. TASK-383 / 384 acceptance: ≥ 3 % changed, ≥ 5 clusters (`LIVE_THRESHOLDS`).
 */
export function motionMetric(
  a: Img,
  b: Img,
  crop: [number, number, number, number] = [0, 0, 1, 1],
  threshold = 24,
  minCluster = 6,
  mask?: Img,
): MotionMetrics {
  if (a.width !== b.width || a.height !== b.height) throw new Error('motion: size mismatch');
  if (mask && (mask.width !== a.width || mask.height !== a.height))
    throw new Error('motion: mask size mismatch');
  const x0 = Math.round(crop[0] * a.width);
  const y0 = Math.round(crop[1] * a.height);
  const w = Math.round(crop[2] * a.width) - x0;
  const h = Math.round(crop[3] * a.height) - y0;
  const on = new Array<boolean>(w * h).fill(false);
  let changed = 0;
  let counted = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = (y0 + y) * a.width + x0 + x;
      if (mask) {
        const om = k * mask.channels;
        if (maskClass(mask.data[om], mask.data[om + 1], mask.data[om + 2]) === 0) continue;
      }
      counted++;
      const oa = k * a.channels;
      const ob = k * b.channels;
      let d = 0;
      for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.data[oa + c] - b.data[ob + c]));
      if (d > threshold) {
        on[y * w + x] = true;
        changed++;
      }
    }
  const sizes = components(on, w, h).filter((s) => s >= minCluster);
  return {
    changedFrac: counted ? changed / counted : 0,
    clusters: sizes.length,
    largest: sizes[0] ?? 0,
  };
}
