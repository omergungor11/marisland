/**
 * Deterministic transcendentals (TASK-552, D-132). V8's `Math.sin/cos/tan/atan/atan2/acos/exp/
 * log/pow` and `**` (other than `** 2`) are compiled C++ (glibc / fdlibm ports) that round
 * differently on arm64 and x64: Linux CI and an Apple Silicon Mac got a 1-ulp different
 * `Math.sin`, which flipped a distance tie in a sort and moved two crates (seed 1).
 * These are pure-JS ports of the FreeBSD msun / fdlibm algorithms: JS arithmetic is plain IEEE
 * double (no FMA contraction), so the bits are the same on every platform. `Math.sqrt`,
 * `Math.hypot`, `Math.floor/round/abs/min/max` are exact or pure-arithmetic builtins and stay.
 * World generation (src/world, src/content, src/shared, core noise/rng/poisson) must use these;
 * ESLint enforces it.
 */

const F = new Float64Array(1);
const U = new Uint32Array(F.buffer); // little endian on every target: [lo, hi]

const hiWord = (x: number): number => {
  F[0] = x;
  return U[1] | 0;
};

/** 2^k for k in [-1074, 1023], built by exact doubling. */
const POW2 = new Float64Array(1023 + 1074 + 1);
{
  let v = 1;
  for (let k = 0; k <= 1023; k++, v *= 2) POW2[k + 1074] = v;
  v = 1;
  for (let k = 0; k >= -1074; k--, v /= 2) POW2[k + 1074] = v;
}
const pow2 = (k: number): number => POW2[k + 1074];

/* ---------------------------------------- sin / cos ---------------------------------------- */

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

function kSin(x: number, y: number, iy: boolean): number {
  const z = x * x;
  const w = z * z;
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
  const v = z * x;
  if (!iy) return x + v * (S1 + z * r);
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.0875723212981748279e-9;
const C6 = -1.13596475577881948265e-11;

function kCos(x: number, y: number): number {
  const z = x * x;
  const w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z;
  const v = 1 - hz;
  return v + (1 - v - hz + (z * r - x * y));
}

const INV_PIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417; // first 33 bits of pi/2
const PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.0771005063039659766e-11;
const PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.0222662487111664558e-21;
const PIO2_3T = 8.47842766036889956997e-32;
const TWO_PI = 6.283185307179586;

/** Reduced argument (y0 + y1) and quadrant of the last `remPio2` call. */
let rY0 = 0;
let rY1 = 0;

/** x = n·π/2 + (rY0 + rY1), |rY0| ≤ π/4 (fdlibm medium-size Cody–Waite, 3 stages). */
function remPio2(x: number): number {
  // Beyond ±2^19·π/2 the 33-bit split loses exactness; world angles never get there, so fold
  // with the exact IEEE remainder first (deterministic, merely less accurate).
  if (!(Math.abs(x) < 823549.6)) x %= TWO_PI;
  const t = Math.abs(x);
  const n = Math.floor(t * INV_PIO2 + 0.5);
  let r = t - n * PIO2_1;
  let w = n * PIO2_1T;
  let y0 = r - w;
  const j = (hiWord(t) >>> 20) & 0x7ff;
  if (j - ((hiWord(y0) >>> 20) & 0x7ff) > 16) {
    let u = r;
    w = n * PIO2_2;
    r = u - w;
    w = n * PIO2_2T - (u - r - w);
    y0 = r - w;
    if (j - ((hiWord(y0) >>> 20) & 0x7ff) > 49) {
      u = r;
      w = n * PIO2_3;
      r = u - w;
      w = n * PIO2_3T - (u - r - w);
      y0 = r - w;
    }
  }
  const y1 = r - y0 - w;
  if (x < 0) {
    rY0 = -y0;
    rY1 = -y1;
    return -n;
  }
  rY0 = y0;
  rY1 = y1;
  return n;
}

const PIO4 = 7.85398163397448278999e-1;

export function sin(x: number): number {
  if (Math.abs(x) <= PIO4) return x === 0 ? x : kSin(x, 0, false);
  if (!Number.isFinite(x)) return NaN;
  const n = remPio2(x) & 3;
  if (n === 0) return kSin(rY0, rY1, true);
  if (n === 1) return kCos(rY0, rY1);
  if (n === 2) return -kSin(rY0, rY1, true);
  return -kCos(rY0, rY1);
}

export function cos(x: number): number {
  if (Math.abs(x) <= PIO4) return kCos(x, 0);
  if (!Number.isFinite(x)) return NaN;
  const n = remPio2(x) & 3;
  if (n === 0) return kCos(rY0, rY1);
  if (n === 1) return -kSin(rY0, rY1, true);
  if (n === 2) return -kCos(rY0, rY1);
  return kSin(rY0, rY1, true);
}

export const tan = (x: number): number => sin(x) / cos(x);

/* ------------------------------------------ atan ------------------------------------------- */

const ATAN_HI = [
  4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1,
  1.570796326794896558,
];
const ATAN_LO = [
  2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17,
  6.12323399573676603587e-17,
];
const AT0 = 3.33333333333329318027e-1;
const AT1 = -1.99999999998764832476e-1;
const AT2 = 1.42857142725034663711e-1;
const AT3 = -1.1111110405462355788e-1;
const AT4 = 9.09088713343650656196e-2;
const AT5 = -7.69187620504482999495e-2;
const AT6 = 6.66107313738753120669e-2;
const AT7 = -5.83357013379057348645e-2;
const AT8 = 4.97687799461593236017e-2;
const AT9 = -3.6531572744216915527e-2;
const AT10 = 1.62858201153657823623e-2;

export function atan(x0: number): number {
  if (x0 !== x0) return NaN;
  let x = Math.abs(x0);
  let id: number;
  if (x >= 7.378697629483821e19) {
    const z = ATAN_HI[3] + ATAN_LO[3];
    return x0 < 0 ? -z : z;
  }
  if (x < 0.4375) {
    if (x < 7.450580596923828e-9) return x0;
    id = -1;
    x = x0;
  } else if (x < 1.1875) {
    if (x < 0.6875) {
      id = 0;
      x = (2 * x - 1) / (2 + x);
    } else {
      id = 1;
      x = (x - 1) / (x + 1);
    }
  } else if (x < 2.4375) {
    id = 2;
    x = (x - 1.5) / (1 + 1.5 * x);
  } else {
    id = 3;
    x = -1 / x;
  }
  const z = x * x;
  const w = z * z;
  const s1 = z * (AT0 + w * (AT2 + w * (AT4 + w * (AT6 + w * (AT8 + w * AT10)))));
  const s2 = w * (AT1 + w * (AT3 + w * (AT5 + w * (AT7 + w * AT9))));
  if (id < 0) return x - x * (s1 + s2);
  const r = ATAN_HI[id] - (x * (s1 + s2) - ATAN_LO[id] - x);
  return x0 < 0 ? -r : r;
}

const PI = 3.141592653589793116;
const PI_LO = 1.2246467991473532e-16;
const PI_O2 = 1.570796326794896558;

export function atan2(y: number, x: number): number {
  if (x !== x || y !== y) return NaN;
  if (x === 1) return atan(y);
  const yNeg = y < 0 || Object.is(y, -0);
  const xNeg = x < 0 || Object.is(x, -0);
  if (y === 0) return xNeg ? (yNeg ? -PI : PI) : y;
  if (x === 0) return yNeg ? -PI_O2 : PI_O2;
  const ay = Math.abs(y);
  const ax = Math.abs(x);
  let z: number;
  if (ax === Infinity) {
    if (ay === Infinity) z = xNeg ? 3 * (PI / 4) : PI / 4;
    else return xNeg ? (yNeg ? -PI : PI) : yNeg ? -0 : 0;
    return yNeg ? -z : z;
  }
  if (ay === Infinity) return yNeg ? -PI_O2 : PI_O2;
  const q = ay / ax;
  if (q > 1.152921504606847e18) z = PI_O2 + 0.5 * PI_LO;
  else if (xNeg && q < 8.673617379884035e-19) z = 0;
  else z = atan(q);
  if (!xNeg) return yNeg ? -z : z;
  return yNeg ? z - PI_LO - PI : PI - (z - PI_LO);
}

/** acos(x) = 2·atan2(√(1−x), √(1+x)); exact at ±1. */
export const acos = (x: number): number => 2 * atan2(Math.sqrt(1 - x), Math.sqrt(1 + x));

/* ------------------------------------------- exp ------------------------------------------- */

const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.442695040888963387;
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.6533902205465251539e-6;
const P5 = 4.13813679705723846039e-8;

export function exp(x: number): number {
  if (x !== x) return NaN;
  if (x > 7.09782712893383973096e2) return Infinity;
  if (x < -7.4513321910194110842e2) return 0;
  const ax = Math.abs(x);
  let hi = 0;
  let lo = 0;
  let k = 0;
  if (ax > 0.34657359027997264) {
    if (ax < 1.0397207708399179) {
      hi = x < 0 ? x + LN2_HI : x - LN2_HI;
      lo = x < 0 ? -LN2_LO : LN2_LO;
      k = x < 0 ? -1 : 1;
    } else {
      k = Math.trunc(INV_LN2 * x + (x < 0 ? -0.5 : 0.5));
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    }
    x = hi - lo;
  } else if (ax < 3.725290298461914e-9) {
    return 1 + x;
  }
  const t = x * x;
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((x * c) / (c - 2) - x);
  const y = 1 - (lo - (x * c) / (2 - c) - hi);
  return k >= -1021 ? y * pow2(k) : y * pow2(k + 1000) * pow2(-1000);
}

/* ------------------------------------------- log ------------------------------------------- */

const LG1 = 6.66666666666673513e-1;
const LG2 = 3.999999999940941908e-1;
const LG3 = 2.857142874366239149e-1;
const LG4 = 2.222219843214978396e-1;
const LG5 = 1.818357216161805012e-1;
const LG6 = 1.531383769920937332e-1;
const LG7 = 1.479819860511658591e-1;

export function log(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return x;
  let k = 0;
  if (x < 2.2250738585072014e-308) {
    k -= 54;
    x *= 18014398509481984; // 2^54
  }
  F[0] = x;
  let hx = U[1] | 0;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  const i0 = (hx + 0x95f64) & 0x100000;
  U[1] = hx | (i0 ^ 0x3ff00000); // x or x/2 into [√2/2, √2)
  k += i0 >> 20;
  const f = F[0] - 1;
  const dk = k;
  if ((0x000fffff & (2 + hx)) < 3) {
    if (f === 0) return k === 0 ? 0 : dk * LN2_HI + dk * LN2_LO;
    const R = f * f * (0.5 - 0.3333333333333333 * f);
    return k === 0 ? f - R : dk * LN2_HI - (R - dk * LN2_LO - f);
  }
  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const i = (hx - 0x6147a) | (0x6b851 - hx);
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const R = t2 + t1;
  if (i > 0) {
    const hfsq = 0.5 * f * f;
    return k === 0
      ? f - (hfsq - s * (hfsq + R))
      : dk * LN2_HI - (hfsq - (s * (hfsq + R) + dk * LN2_LO) - f);
  }
  return k === 0 ? f - s * (f - R) : dk * LN2_HI - (s * (f - R) - dk * LN2_LO - f);
}

/* ------------------------------------------- pow ------------------------------------------- */

/**
 * x^y. Integer |y| ≤ 64 by repeated squaring (exact for small powers); otherwise
 * exp(y·log x), good to a few ulp for the moderate exponents generation uses.
 */
export function pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (x !== x || y !== y) return NaN;
  if (y === 0.5 && x >= 0) return Math.sqrt(x);
  if (Number.isInteger(y) && Math.abs(y) <= 64) {
    let n = Math.abs(y);
    let b = x;
    let r = 1;
    while (n > 0) {
      if (n & 1) r *= b;
      b *= b;
      n >>= 1;
    }
    return y < 0 ? 1 / r : r;
  }
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) {
    if (!Number.isInteger(y)) return NaN;
    const m = exp(y * log(-x));
    return y % 2 === 0 ? m : -m;
  }
  return exp(y * log(x));
}

/** Real cube root: exp(log|x| / 3) and one Newton step. */
export function cbrt(x: number): number {
  if (x === 0 || x !== x || !Number.isFinite(x)) return x;
  const a = Math.abs(x);
  let t = exp(log(a) / 3);
  t -= (t * t * t - a) / (3 * t * t);
  return x < 0 ? -t : t;
}
