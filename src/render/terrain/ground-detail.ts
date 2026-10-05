import * as THREE from 'three';
import { DETAIL_LAYER_IDS, GROUND_DETAIL, type DetailLayerId } from '../../content/ground.ts';
import { hashInts } from '../../core/hash.ts';

/**
 * Ground detail layers (M14b TASK-372, D-030): one tileable 256² RGBA8 layer per
 * `DETAIL_LAYER_IDS` entry, built in code from a fixed seed (same bytes on every run and every
 * world), with CPU box-filter mips so the GPU never derives anything (determinism, M14b risk 4).
 *
 * Texel = (R lightness delta, G/B detail normal tilt along u/v, A accent mask), all 0.5-centred
 * except A. R, G and B are zero-mean by construction (mean removed in float, then quantised), so
 * the 1×1 top mip of every layer is 0.5 ± ½ LSB: a far, fully filtered sample adds nothing and the
 * terrain equals its albedo. A's mean is the layer's `meanA`; the shader subtracts it, so accents
 * (flowers, grout, leaves, lichen) are mean-preserving as well.
 */
export interface GroundDetailData {
  size: number;
  layers: number;
  /** Level l: (size >> l)² texels × layers × RGBA, layer-major (DataArrayTexture layout). */
  levels: Uint8Array[];
  /** Mean accent mask per layer (top-mip A / 255). */
  meanA: Float32Array;
}

interface LayerField {
  /** Lightness delta (any range; normalised to ±1 around its mean). */
  L: Float32Array;
  /** Height for the detail normal (texel units of `H`, scaled by `normalScale`). */
  H: Float32Array;
  /** Accent mask 0..1. */
  A: Float32Array;
}

// ---------------------------------------------------------------- periodic noise helpers

/** Hash → [0, 1). */
const h01 = (...p: number[]): number => hashInts(...p) / 4294967296;

const wrap = (v: number, n: number): number => ((v % n) + n) % n;
const smooth = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a: number, b: number, v: number): number => smooth(clamp01((v - a) / (b - a)));

/** Periodic value noise in [−1, 1]: `px` × `py` lattice cells across the `n`-texel tile. */
class PNoise {
  private readonly v: Float32Array;
  constructor(
    seed: number,
    private readonly px: number,
    private readonly py: number,
    private readonly n: number,
  ) {
    this.v = new Float32Array(px * py);
    for (let i = 0; i < this.v.length; i++) this.v[i] = h01(seed, px, py, i) * 2 - 1;
  }
  at(x: number, y: number): number {
    const P = this.px;
    const Q = this.py;
    const gx = (x / this.n) * P;
    const gy = (y / this.n) * Q;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = smooth(gx - ix);
    const fy = smooth(gy - iy);
    const x0 = wrap(ix, P);
    const y0 = wrap(iy, Q);
    const x1 = (x0 + 1) % P;
    const y1 = (y0 + 1) % Q;
    const v = this.v;
    const a = v[y0 * P + x0] + (v[y0 * P + x1] - v[y0 * P + x0]) * fx;
    const b = v[y1 * P + x0] + (v[y1 * P + x1] - v[y1 * P + x0]) * fx;
    return a + (b - a) * fy;
  }
}

/**
 * Periodic fbm in about [−1, 1] from `base` lattice cells (× `aspect` along y), doubling per
 * octave.
 */
function fbm(
  seed: number,
  base: number,
  octaves: number,
  n: number,
  aspect = 1,
): (x: number, y: number) => number {
  const os: PNoise[] = [];
  for (let o = 0; o < octaves; o++)
    os.push(new PNoise(seed + o * 7919, base << o, (base * aspect) << o, n));
  return (x, y) => {
    let s = 0;
    let a = 1;
    let norm = 0;
    for (const o of os) {
      s += o.at(x, y) * a;
      norm += a;
      a *= 0.5;
    }
    return s / norm;
  };
}

/** Periodic Worley (F1, F2 in texels, nearest cell id) over `cells`² jittered points. */
class PWorley {
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  readonly cell: number;
  f1 = 0;
  f2 = 0;
  id = 0;
  /** Nearest feature point (texels, unwrapped near the query). */
  nx = 0;
  ny = 0;
  constructor(
    seed: number,
    private readonly cells: number,
    n: number,
    jitter = 0.85,
  ) {
    this.cell = n / cells;
    this.px = new Float32Array(cells * cells);
    this.py = new Float32Array(cells * cells);
    for (let i = 0; i < cells * cells; i++) {
      this.px[i] = 0.5 + (h01(seed, i, 1) - 0.5) * jitter;
      this.py[i] = 0.5 + (h01(seed, i, 2) - 0.5) * jitter;
    }
  }
  at(x: number, y: number): void {
    const C = this.cells;
    const cs = this.cell;
    const cx = Math.floor(x / cs);
    const cy = Math.floor(y / cs);
    let f1 = Infinity;
    let f2 = Infinity;
    let id = 0;
    let nx = 0;
    let ny = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx;
        const gy = cy + dy;
        const k = wrap(gy, C) * C + wrap(gx, C);
        const fx = (gx + this.px[k]) * cs;
        const fy = (gy + this.py[k]) * cs;
        const d = Math.hypot(x - fx, y - fy);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = k;
          nx = fx;
          ny = fy;
        } else if (d < f2) f2 = d;
      }
    this.f1 = f1;
    this.f2 = f2;
    this.id = id;
    this.nx = nx;
    this.ny = ny;
  }
}

function field(n: number): LayerField {
  return { L: new Float32Array(n * n), H: new Float32Array(n * n), A: new Float32Array(n * n) };
}

/** Visit the texels of a wrapped bounding box around (cx, cy) with half-size r. */
function stamp(
  n: number,
  cx: number,
  cy: number,
  r: number,
  fn: (i: number, dx: number, dy: number) => void,
): void {
  const x0 = Math.floor(cx - r);
  const x1 = Math.ceil(cx + r);
  const y0 = Math.floor(cy - r);
  const y1 = Math.ceil(cy + r);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) fn(wrap(y, n) * n + wrap(x, n), x + 0.5 - cx, y + 0.5 - cy);
}

// ---------------------------------------------------------------- the ten layers

type Builder = (n: number, seed: number) => LayerField;

/** Grass blades seen from above: leaning tapered strokes in tufts over dark gaps. */
const blades: Builder = (n, seed) => {
  const f = field(n);
  const soil = fbm(seed + 1, 8, 3, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      f.L[i] = -0.85 + 0.25 * soil(x, y);
      f.H[i] = -0.2;
    }
  const lean = fbm(seed + 2, 3, 2, n);
  const tuft = fbm(seed + 3, 6, 2, n);
  const count = Math.round(3600 * (n / 256) ** 2);
  for (let b = 0; b < count; b++) {
    const rx = h01(seed, b, 10) * n;
    const ry = h01(seed, b, 11) * n;
    if (h01(seed, b, 12) > 0.55 + 0.45 * tuft(rx, ry)) continue;
    const ang = lean(rx, ry) * Math.PI * 1.6 + (h01(seed, b, 13) - 0.5) * 1.8;
    const len = (0.055 + 0.065 * h01(seed, b, 14)) * n;
    const wid = (0.009 + 0.006 * h01(seed, b, 15)) * n;
    const top = 0.55 + 0.45 * h01(seed, b, 16);
    const tone = (h01(seed, b, 17) - 0.5) * 0.5;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    stamp(n, rx + (dx * len) / 2, ry + (dy * len) / 2, len / 2 + wid, (i, px, py) => {
      // position along the blade (0 root … 1 tip) and across it
      const t = 0.5 + (px * dx + py * dy) / len;
      if (t < 0 || t > 1) return;
      const s = Math.abs(px * -dy + py * dx) / (wid * (1 - 0.85 * t) + 0.35);
      if (s >= 1) return;
      const hgt = top * (0.35 + 0.65 * t) * (1 - s * s);
      if (hgt <= f.H[i]) return;
      f.H[i] = hgt;
      f.L[i] = -0.35 + 1.25 * t + tone - 0.25 * s;
    });
  }
  return f;
};

/** Mow stripes: two 3 u bands per tile whose blades lean opposite ways, plus mower grain. */
const mow: Builder = (n, seed) => {
  const f = field(n);
  // mower grain: long along u (stripe direction), fine across
  const grain = fbm(seed + 1, 2, 3, n, 24);
  // stripe sign along v; the height is its integral (a periodic triangle wave), so the normal
  // tilts +v on one stripe and −v on the next (the lighting draws the stripes)
  const sgn = new Float32Array(n);
  for (let y = 0; y < n; y++)
    sgn[y] = Math.max(-1, Math.min(1, Math.sin(((y + 0.5) / n) * Math.PI * 4) * 6));
  let acc = 0;
  const hy = new Float32Array(n);
  for (let y = 0; y < n; y++) {
    acc += sgn[y];
    hy[y] = acc;
  }
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const g = grain(x, y);
      f.L[i] = sgn[y] + 0.35 * g;
      f.H[i] = hy[y] * 0.08 + 0.6 * g;
    }
  return f;
};

/** Flower speckle: clusters of five-petal blossoms (accent mask) on a faintly mottled lawn. */
const speckle: Builder = (n, seed) => {
  const f = field(n);
  const mott = fbm(seed + 1, 8, 3, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) f.L[y * n + x] = 0.18 * mott(x, y);
  const clusters = Math.round(22 * (n / 256) ** 2);
  for (let c = 0; c < clusters; c++) {
    const cx = h01(seed, c, 20) * n;
    const cy = h01(seed, c, 21) * n;
    const count = 2 + Math.floor(h01(seed, c, 22) * 5);
    for (let k = 0; k < count; k++) {
      const a = h01(seed, c, k, 23) * Math.PI * 2;
      const d = Math.sqrt(h01(seed, c, k, 24)) * 0.075 * n;
      const fx = cx + Math.cos(a) * d;
      const fy = cy + Math.sin(a) * d;
      const R = (0.016 + 0.01 * h01(seed, c, k, 25)) * n;
      const rot = h01(seed, c, k, 26) * Math.PI * 2;
      const tone = (h01(seed, c, k, 27) - 0.5) * 0.3;
      stamp(n, fx, fy, R + 1, (i, px, py) => {
        const r = Math.hypot(px, py);
        const th = Math.atan2(py, px) + rot;
        const edge = R * (0.62 + 0.38 * Math.abs(Math.cos(2.5 * th)));
        if (r >= edge + 0.5) return;
        const cov = clamp01(edge + 0.5 - r);
        const centre = r < R * 0.3;
        f.A[i] = Math.max(f.A[i], centre ? cov * 0.45 : cov);
        f.L[i] = centre ? -0.15 : 0.75 + tone - 0.3 * (r / R);
        f.H[i] = Math.max(f.H[i], 1.2 * (1 - (r / (edge + 0.5)) ** 2));
      });
    }
  }
  return f;
};

/** Forest floor: overlapping leaves (half accent-coloured), twigs and dark soil / moss. */
const litter: Builder = (n, seed) => {
  const f = field(n);
  const soil = fbm(seed + 1, 6, 4, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      f.L[i] = -0.45 + 0.35 * soil(x, y);
      f.H[i] = 0.25 * soil(x, y);
    }
  const leaves = Math.round(820 * (n / 256) ** 2);
  for (let l = 0; l < leaves; l++) {
    const cx = h01(seed, l, 30) * n;
    const cy = h01(seed, l, 31) * n;
    const len = (0.03 + 0.022 * h01(seed, l, 32)) * n;
    const wid = len * (0.38 + 0.15 * h01(seed, l, 33));
    const ang = h01(seed, l, 34) * Math.PI * 2;
    const tone = (h01(seed, l, 35) - 0.5) * 0.9;
    const acc = h01(seed, l, 36) < 0.55 ? 1 : 0;
    const z = 0.3 + l / leaves;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    stamp(n, cx, cy, len + 1, (i, px, py) => {
      const u = (px * dx + py * dy) / len;
      const v = (px * -dy + py * dx) / wid;
      // pointed leaf outline: width shrinks toward both tips
      const w = 1 - u * u;
      if (w <= 0 || Math.abs(v) >= w) return;
      if (z <= f.H[i]) return;
      const rib = Math.abs(v) < 0.08 ? -0.25 : 0;
      f.H[i] = z + 0.25 * (1 - (v / w) ** 2);
      f.L[i] = 0.2 + tone + rib - 0.2 * Math.abs(v / w);
      f.A[i] = acc;
    });
  }
  const twigs = Math.round(70 * (n / 256) ** 2);
  for (let t = 0; t < twigs; t++) {
    const cx = h01(seed, t, 40) * n;
    const cy = h01(seed, t, 41) * n;
    const len = (0.05 + 0.08 * h01(seed, t, 42)) * n;
    const ang = h01(seed, t, 43) * Math.PI * 2;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    stamp(n, cx, cy, len / 2 + 2, (i, px, py) => {
      const u = (px * dx + py * dy) / (len / 2);
      const s = Math.abs(px * -dy + py * dx);
      if (Math.abs(u) > 1 || s > 1.4) return;
      f.H[i] = 2.2 - s;
      f.L[i] = -0.7;
      f.A[i] = 0;
    });
  }
  return f;
};

/** Sand ripples: warped asymmetric crests, grain and rare shell bits (accent). */
const ripples: Builder = (n, seed) => {
  const f = field(n);
  const warp = fbm(seed + 1, 2, 3, n);
  const warp2 = fbm(seed + 2, 4, 2, n);
  const grain = fbm(seed + 3, 64, 2, n);
  const waves = 12;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const ph = ((y + 9 * warp(x, y) + 3 * warp2(x, y)) / n) * waves;
      const t = ph - Math.floor(ph);
      // gentle stoss slope, steep lee slope
      const h = t < 0.72 ? smooth(t / 0.72) : smooth((1 - t) / 0.28);
      const g = grain(x, y);
      f.H[i] = 2.4 * h + 0.25 * g;
      f.L[i] = 0.45 * (h - 0.5) + 0.55 * g;
    }
  const shells = Math.round(220 * (n / 256) ** 2);
  for (let s = 0; s < shells; s++) {
    const cx = h01(seed, s, 50) * n;
    const cy = h01(seed, s, 51) * n;
    const R = 0.8 + 1.4 * h01(seed, s, 52);
    stamp(n, cx, cy, R + 1, (i, px, py) => {
      const c = clamp01(R + 0.5 - Math.hypot(px, py));
      if (c <= 0) return;
      f.A[i] = Math.max(f.A[i], c);
      f.L[i] += 0.6 * c;
    });
  }
  return f;
};

/** Rock: plates split by cracks (big + fine), per-plate tone, grain and lichen (accent). */
const cracks: Builder = (n, seed) => {
  const f = field(n);
  const big = new PWorley(seed + 1, 5, n);
  const fine = new PWorley(seed + 2, 13, n);
  const grain = fbm(seed + 3, 16, 3, n);
  const lichen = fbm(seed + 4, 6, 3, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      big.at(x + 0.5, y + 0.5);
      const e1 = big.f2 - big.f1;
      const plate = h01(seed, big.id, 60) - 0.5;
      fine.at(x + 0.5, y + 0.5);
      const e2 = fine.f2 - fine.f1;
      const c1 = 1 - sstep(0.6, 3.2, e1);
      const c2 = (1 - sstep(0.3, 1.6, e2)) * 0.55;
      const crack = Math.max(c1, c2);
      const g = grain(x, y);
      // plates bevel down toward their cracks
      f.H[i] = 3 * sstep(0, 9, e1) + 1.2 * sstep(0, 4, e2) + 1.6 * g;
      f.L[i] = 0.55 * plate + 0.45 * g - 1.3 * crack;
      const li = lichen(x, y);
      f.A[i] = (1 - crack) * sstep(0.28, 0.42, li) * (0.6 + 0.4 * sstep(-0.3, 0.6, g));
    }
  return f;
};

/** Gravel: rounded pebbles with per-stone tone (some accent-coloured) and dark gaps. */
const pebbles: Builder = (n, seed) => {
  const f = field(n);
  const w = new PWorley(seed + 1, 20, n, 0.9);
  const grain = fbm(seed + 2, 32, 2, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      w.at(x + 0.5, y + 0.5);
      const e = w.f2 - w.f1;
      const r = w.cell * (0.42 + 0.12 * h01(seed, w.id, 71));
      const dome = clamp01(1 - w.f1 / r) * sstep(0.5, 2.2, e);
      const tone = h01(seed, w.id, 70) - 0.5;
      const g = grain(x, y);
      f.H[i] = 4 * Math.sqrt(dome);
      f.L[i] = dome > 0 ? 0.9 * tone + 0.35 * dome + 0.15 * g : -1;
      f.A[i] = dome > 0 && h01(seed, w.id, 72) < 0.35 ? sstep(0, 0.15, dome) : 0;
    }
  return f;
};

/** Packed earth: mottled worn soil with half-buried small stones. */
const packedEarth: Builder = (n, seed) => {
  const f = field(n);
  const mott = fbm(seed + 1, 4, 4, n);
  const grit = fbm(seed + 2, 48, 2, n);
  const w = new PWorley(seed + 3, 22, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      w.at(x + 0.5, y + 0.5);
      const keep = h01(seed, w.id, 80) < 0.3;
      const r = w.cell * (0.18 + 0.12 * h01(seed, w.id, 81));
      const stone = keep ? clamp01(1 - w.f1 / r) : 0;
      const m = mott(x, y);
      const g = grit(x, y);
      f.H[i] = 0.9 * m + 0.35 * g + 2.4 * Math.sqrt(stone);
      f.L[i] = 0.55 * m + 0.3 * g + (stone > 0 ? 0.5 + 0.3 * (h01(seed, w.id, 82) - 0.5) : 0);
    }
  return f;
};

/** Pavers: running-bond rectangles (4 × 8 per tile), bevelled, per-paver tone; grout = accent. */
const tiles: Builder = (n, seed) => {
  const f = field(n);
  const wear = fbm(seed + 1, 8, 3, n);
  const cols = 4;
  const rows = 8;
  const pw = n / cols;
  const ph = n / rows;
  const grout = 0.012 * n;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const row = Math.floor((y + 0.5) / ph);
      const xs = wrap(x + 0.5 + (row & 1) * pw * 0.5, n);
      const col = Math.floor(xs / pw);
      const ex = Math.min(xs - col * pw, (col + 1) * pw - xs);
      const ey = Math.min(y + 0.5 - row * ph, (row + 1) * ph - (y + 0.5));
      const e = Math.min(ex, ey);
      const g = 1 - sstep(grout * 0.5, grout, e);
      const tone = h01(seed, row, col, 90) - 0.5;
      const wv = wear(x, y);
      f.A[i] = g;
      f.H[i] = 3 * sstep(grout * 0.5, grout * 2.6, e) + 0.4 * wv;
      f.L[i] = (1 - g) * (0.6 * tone + 0.3 * wv) - 0.5 * g;
    }
  return f;
};

/** Mosaic: small irregular tesserae, each a step along base ↔ accent, with grout lines. */
const mosaic: Builder = (n, seed) => {
  const f = field(n);
  const w = new PWorley(seed + 1, 16, n, 0.7);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      w.at(x + 0.5, y + 0.5);
      const e = w.f2 - w.f1;
      const g = 1 - sstep(0.6, 1.6, e);
      const pick = Math.floor(h01(seed, w.id, 100) * 4) / 3;
      f.A[i] = (1 - g) * pick;
      f.H[i] = 2 * sstep(0.6, 3, e);
      f.L[i] = (1 - g) * 0.7 * (h01(seed, w.id, 101) - 0.5) - 0.7 * g;
    }
  return f;
};

const BUILDERS: Readonly<Record<DetailLayerId, Builder>> = {
  blades,
  mow,
  speckle,
  litter,
  ripples,
  cracks,
  pebbles,
  packedEarth,
  tiles,
  mosaic,
};

// ---------------------------------------------------------------- packing + mips

/** RGBA floats (0..255 scale) of one layer at level 0. */
function packLayer(f: LayerField, n: number): Float32Array {
  const N = n * n;
  const out = new Float32Array(N * 4);
  // lightness: remove the mean, scale the peak to ±1
  let mean = 0;
  for (let i = 0; i < N; i++) mean += f.L[i];
  mean /= N;
  let peak = 1e-6;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(f.L[i] - mean));
  // normals: periodic central differences (they sum to exactly 0 over the tile); scale so the
  // RMS tilt is 0.45, clamp, then re-centre (the clamp may move the mean by a hair)
  const gx = new Float32Array(N);
  const gy = new Float32Array(N);
  let ss = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const ax = f.H[y * n + ((x + 1) % n)] - f.H[y * n + ((x + n - 1) % n)];
      const ay = f.H[((y + 1) % n) * n + x] - f.H[((y + n - 1) % n) * n + x];
      gx[i] = -ax * 0.5;
      gy[i] = -ay * 0.5;
      ss += gx[i] * gx[i] + gy[i] * gy[i];
    }
  const s = ss > 0 ? 0.45 / Math.sqrt(ss / N / 2) : 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < N; i++) {
    gx[i] = Math.max(-1, Math.min(1, gx[i] * s));
    gy[i] = Math.max(-1, Math.min(1, gy[i] * s));
    mx += gx[i];
    my += gy[i];
  }
  mx /= N;
  my /= N;
  for (let i = 0; i < N; i++) {
    out[i * 4] = 127.5 + 127.5 * ((f.L[i] - mean) / peak);
    out[i * 4 + 1] = 127.5 + 127.5 * Math.max(-1, Math.min(1, gx[i] - mx));
    out[i * 4 + 2] = 127.5 + 127.5 * Math.max(-1, Math.min(1, gy[i] - my));
    out[i * 4 + 3] = 255 * clamp01(f.A[i]);
  }
  return out;
}

/** 2×2 box filter of a `n`² RGBA float level. */
function halve(src: Float32Array, n: number): Float32Array {
  const m = n >> 1;
  const out = new Float32Array(m * m * 4);
  for (let y = 0; y < m; y++)
    for (let x = 0; x < m; x++)
      for (let c = 0; c < 4; c++) {
        const a = (2 * y * n + 2 * x) * 4 + c;
        const b = ((2 * y + 1) * n + 2 * x) * 4 + c;
        out[(y * m + x) * 4 + c] = (src[a] + src[a + 4] + src[b] + src[b + 4]) * 0.25;
      }
  return out;
}

const quant = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/** Build every layer and its mip chain (pure; deterministic for a given size and seed). */
export function buildGroundDetail(
  size: number = GROUND_DETAIL.size,
  seed: number = GROUND_DETAIL.seed,
): GroundDetailData {
  const layers = DETAIL_LAYER_IDS.length;
  const nLevels = Math.log2(size) + 1;
  const levels: Uint8Array[] = [];
  for (let l = 0; l < nLevels; l++) {
    const w = size >> l;
    levels.push(new Uint8Array(w * w * 4 * layers));
  }
  const meanA = new Float32Array(layers);
  DETAIL_LAYER_IDS.forEach((id, z) => {
    let lv = packLayer(BUILDERS[id](size, hashInts(seed, z)), size);
    for (let l = 0; l < nLevels; l++) {
      const w = size >> l;
      const dst = levels[l];
      const off = z * w * w * 4;
      for (let k = 0; k < w * w * 4; k++) dst[off + k] = quant(lv[k]);
      if (l + 1 < nLevels) lv = halve(lv, w);
    }
    meanA[z] = levels[nLevels - 1][z * 4 + 3] / 255;
  });
  return { size, layers, levels, meanA };
}

/**
 * Zero-mean check: the largest |top-mip R/G/B − 0.5| over all layers (in 0..1 units; ≤ 1/255
 * means a fully filtered sample adds no lightness or tilt) and whether the mip chain is the exact
 * box filter of level 0 (each level within one LSB of the 2×2 mean of the level above).
 */
export function verifyGroundDetail(d: GroundDetailData): { maxMeanError: number; mipsOk: boolean } {
  const top = d.levels[d.levels.length - 1];
  let maxMeanError = 0;
  for (let z = 0; z < d.layers; z++)
    for (let c = 0; c < 3; c++)
      maxMeanError = Math.max(maxMeanError, Math.abs(top[z * 4 + c] / 255 - 0.5));
  let mipsOk = true;
  for (let l = 1; l < d.levels.length && mipsOk; l++) {
    const n = d.size >> (l - 1);
    const m = n >> 1;
    const src = d.levels[l - 1];
    const dst = d.levels[l];
    for (let z = 0; z < d.layers && mipsOk; z++)
      for (let y = 0; y < m && mipsOk; y++)
        for (let x = 0; x < m; x++)
          for (let c = 0; c < 4; c++) {
            const o = z * n * n * 4;
            const a = o + (2 * y * n + 2 * x) * 4 + c;
            const b = o + ((2 * y + 1) * n + 2 * x) * 4 + c;
            const avg = (src[a] + src[a + 4] + src[b] + src[b + 4]) / 4;
            // float chain vs re-quantised parents: rounding drifts ≤ 1 LSB per level
            if (Math.abs(dst[z * m * m * 4 + (y * m + x) * 4 + c] - avg) > 1.01) mipsOk = false;
          }
  }
  return { maxMeanError, mipsOk };
}

let cached: GroundDetailData | null = null;

/** The detail layers, built once per page (CPU bytes shared by every world's GPU texture). */
export function groundDetailData(): GroundDetailData {
  cached ??= buildGroundDetail();
  return cached;
}

/** The slice of `THREE.WebGLRenderer` the mip upload needs. */
export interface MipUploadRenderer {
  getContext(): unknown;
  properties: { get(o: object): unknown };
  state: { bindTexture(target: number, tex: unknown): void };
}

/**
 * GPU texture of the detail layers. three uploads level 0 only for array textures (it allocates
 * `mipmaps.length` levels with texStorage3D), so `onUpdate` — called right after every upload,
 * including after a context restore — writes the CPU mips 1…n with `texSubImage3D`. Without a
 * renderer (unit tests) the GPU would derive the mips instead.
 */
export function createGroundDetailTexture(
  renderer: MipUploadRenderer | null,
): THREE.DataArrayTexture {
  const d = groundDetailData();
  const tex = new THREE.DataArrayTexture(d.levels[0], d.size, d.size, d.layers);
  tex.name = 'terrain:groundDetail';
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  tex.flipY = false;
  tex.unpackAlignment = 1;
  if (renderer) {
    tex.generateMipmaps = false;
    tex.mipmaps = d.levels.map((data, l) => ({
      data,
      width: d.size >> l,
      height: d.size >> l,
    }));
    tex.onUpdate = () => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const p = renderer.properties.get(tex) as { __webglTexture?: WebGLTexture };
      if (!p.__webglTexture || typeof gl.texSubImage3D !== 'function') return;
      renderer.state.bindTexture(gl.TEXTURE_2D_ARRAY, p.__webglTexture);
      for (let l = 1; l < d.levels.length; l++) {
        const w = d.size >> l;
        gl.texSubImage3D(
          gl.TEXTURE_2D_ARRAY,
          l,
          0,
          0,
          0,
          w,
          w,
          d.layers,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          d.levels[l],
        );
      }
    };
  } else tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
