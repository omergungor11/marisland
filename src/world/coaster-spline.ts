/**
 * Roller-coaster centreline: centripetal Catmull-Rom through control points, tabulated by arc length,
 * with a frame that does not flip through an inversion (TASK-540, D-120). Pure data (no three), so
 * world gen, the track mesh (geo/themes/qa-coaster.ts) and the motion task (TASK-541) share one path.
 *
 * Input: control points `[x, y, z]` in the site's local frame (u), y absolute height. The spline is
 * the RAIL-TOP centreline: a car's origin rides on it. `closed` joins the last point back to the first.
 *
 * The frame is parallel-transported (minimal rotation) from "world up projected off the first
 * tangent", so a vertical loop comes back upright instead of flipping where the tangent turns vertical.
 * Where the car is upright already the frame is snapped back to world up (a 3D circuit has holonomy,
 * pure transport would roll the car ~50 deg over a lap); the inverted part of a loop keeps the transport.
 *
 * Sampling is O(1): `sampleCoaster(spline, s)` indexes a uniform-arc table (`ds` apart) and lerps.
 */
import * as dm from '../core/math/dmath.ts';

export type Vec3 = readonly [x: number, y: number, z: number];

export interface CoasterSplineOpts {
  /** Join the last control point back to the first. Default true. */
  closed?: boolean;
  /** Table spacing target in u. Default 0.25. */
  step?: number;
}

export interface CoasterSpline {
  readonly closed: boolean;
  /** Total arc length (u); for a closed spline the lap length. */
  readonly length: number;
  /** Table intervals and their spacing (`length / n`). */
  readonly n: number;
  readonly ds: number;
  /** Flat tables, 3 floats per entry, n + 1 entries (closed: the last repeats the first). */
  readonly pos: Float64Array;
  readonly tan: Float64Array;
  readonly up: Float64Array;
  /** Car local +x (the rider's left): `up × tangent`. */
  readonly side: Float64Array;
  /** Arc length at each control point (same order as the input; `controlS[0] = 0`). */
  readonly controlS: readonly number[];
  /** Largest snap-to-upright rotation applied to the transported frame, radians (diagnostic). */
  readonly twist: number;
}

export interface CoasterSample {
  s: number;
  pos: [number, number, number];
  tangent: [number, number, number];
  up: [number, number, number];
  /** Car local +x: `up × tangent`. A car basis is `makeBasis(side, up, tangent)`. */
  side: [number, number, number];
}

export const newCoasterSample = (): CoasterSample => ({
  s: 0,
  pos: [0, 0, 0],
  tangent: [1, 0, 0],
  up: [0, 1, 0],
  side: [0, 0, -1],
});

type V = [number, number, number];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: V): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V): V => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** Rotate `v` about unit `k` by `a`. */
function rot(v: V, k: V, a: number): V {
  const c = dm.cos(a);
  const s = dm.sin(a);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return [
    v[0] * c + kv[0] * s + k[0] * kd,
    v[1] * c + kv[1] * s + k[1] * kd,
    v[2] * c + kv[2] * s + k[2] * kd,
  ];
}

/**
 * Point `t` in [0, 1] of the centripetal Catmull-Rom segment p1 -> p2 (Barry-Goldman, alpha 0.5). The
 * one evaluator of the project: the site's fit (world/gen/plans/qa-park.ts) and this table share it.
 */
export function coasterSegmentAt(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): V {
  const step = (a: Vec3, b: Vec3): number =>
    Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])) || 1e-6;
  const t1 = step(p0, p1);
  const t2 = t1 + step(p1, p2);
  const t3 = t2 + step(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const out: V = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const a1 = ((t1 - u) * p0[c] + u * p1[c]) / t1;
    const a2 = ((t2 - u) * p1[c] + (u - t1) * p2[c]) / (t2 - t1);
    const a3 = ((t3 - u) * p2[c] + (u - t2) * p3[c]) / (t3 - t2);
    const b1 = ((t2 - u) * a1 + u * a2) / t2;
    const b2 = ((t3 - u) * a2 + (u - t1) * a3) / (t3 - t1);
    out[c] = ((t2 - u) * b1 + (u - t1) * b2) / (t2 - t1);
  }
  return out;
}

/** Build the arc-length table, tangents and the parallel-transported frame. */
export function createCoasterSpline(
  points: ReadonlyArray<Vec3>,
  opts: CoasterSplineOpts = {},
): CoasterSpline {
  const closed = opts.closed ?? true;
  const step = opts.step ?? 0.25;
  if (points.length < 3) throw new Error('coaster spline: need at least 3 control points');
  const P = points.map((p) => [p[0], p[1], p[2]] as V);
  const m = P.length;
  const segs = closed ? m : m - 1;
  const at = (i: number): V => {
    if (closed) return P[((i % m) + m) % m];
    if (i < 0) return [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1], 2 * P[0][2] - P[1][2]];
    if (i >= m)
      return [
        2 * P[m - 1][0] - P[m - 2][0],
        2 * P[m - 1][1] - P[m - 2][1],
        2 * P[m - 1][2] - P[m - 2][2],
      ];
    return P[i];
  };
  // dense polyline (about 5 cm) with the cumulative length at each control point
  const dx: number[] = [];
  const dy: number[] = [];
  const dz: number[] = [];
  const dcum: number[] = [];
  const ctrlDense: number[] = [];
  let total = 0;
  for (let i = 0; i < segs; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const k = Math.max(8, Math.ceil(len(sub(at(i + 1), at(i))) / 0.05));
    ctrlDense.push(dx.length);
    for (let j = 0; j < k; j++) {
      const p = coasterSegmentAt(p0, p1, p2, p3, j / k);
      if (dx.length > 0)
        total += Math.hypot(
          p[0] - dx[dx.length - 1],
          p[1] - dy[dy.length - 1],
          p[2] - dz[dz.length - 1],
        );
      dx.push(p[0]);
      dy.push(p[1]);
      dz.push(p[2]);
      dcum.push(total);
    }
  }
  // close the polyline (closed) / append the last control point (open)
  const last: V = closed ? at(0) : at(m - 1);
  total += Math.hypot(
    last[0] - dx[dx.length - 1],
    last[1] - dy[dy.length - 1],
    last[2] - dz[dz.length - 1],
  );
  dx.push(last[0]);
  dy.push(last[1]);
  dz.push(last[2]);
  dcum.push(total);
  if (!closed) ctrlDense.push(dx.length - 1);
  const length = total;
  const n = Math.max(8, Math.round(length / step));
  const ds = length / n;
  // resample uniformly in arc length
  const pos = new Float64Array((n + 1) * 3);
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const s = i * ds;
    while (j < dcum.length - 2 && dcum[j + 1] < s) j++;
    const span = dcum[j + 1] - dcum[j] || 1;
    const f = Math.min(1, Math.max(0, (s - dcum[j]) / span));
    pos[i * 3] = dx[j] + (dx[j + 1] - dx[j]) * f;
    pos[i * 3 + 1] = dy[j] + (dy[j + 1] - dy[j]) * f;
    pos[i * 3 + 2] = dz[j] + (dz[j + 1] - dz[j]) * f;
  }
  if (closed) {
    for (let k = 0; k < 3; k++) pos[n * 3 + k] = pos[k];
  }
  const P3 = (i: number): V => {
    const k = closed ? ((i % n) + n) % n : Math.min(n, Math.max(0, i));
    return [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]];
  };
  // tangents: central difference on the uniform table
  const tan = new Float64Array((n + 1) * 3);
  for (let i = 0; i <= n; i++) {
    const t = norm(sub(P3(i + 1), P3(i - 1)));
    tan.set(t, i * 3);
  }
  if (closed) tan.copyWithin(n * 3, 0, 3);
  const T = (i: number): V => [tan[i * 3], tan[i * 3 + 1], tan[i * 3 + 2]];
  // parallel transport of "up"
  const upT = new Float64Array((n + 1) * 3);
  const t0 = T(0);
  const wu: V = [0, 1, 0];
  let u: V = sub(wu, [t0[0] * t0[1], t0[1] * t0[1], t0[2] * t0[1]]);
  if (len(u) < 1e-3) u = [0, 0, 1];
  u = norm(u);
  upT.set(u, 0);
  for (let i = 1; i <= n; i++) {
    const a = T(i - 1);
    const b = T(i);
    const axis = cross(a, b);
    const al = len(axis);
    if (al > 1e-9) u = rot(u, [axis[0] / al, axis[1] / al, axis[2] / al], dm.atan2(al, dot(a, b)));
    // re-orthogonalise against the new tangent
    const d = dot(u, b);
    u = norm([u[0] - b[0] * d, u[1] - b[1] * d, u[2] - b[2] * d]);
    upT.set(u, i * 3);
  }
  // Parallel transport alone drifts on a 3D circuit (holonomy: ~50 deg over a lap with hills and
  // turns), so cars would roll for no reason. Snap the frame back to "world up" wherever the car is
  // upright already (transported up within ~70 deg of the projected world up, tangent not near
  // vertical); the weight fades out through the vertical sides and the inverted part of a loop,
  // where the transported frame is kept as is (it agrees with the snap just before the sides).
  const sm = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  let twist = 0;
  for (let i = 0; i <= n; i++) {
    const ti = T(i);
    if (Math.abs(ti[1]) > 0.999) continue;
    const ui: V = [upT[i * 3], upT[i * 3 + 1], upT[i * 3 + 2]];
    const r = norm([-ti[1] * ti[0], 1 - ti[1] * ti[1], -ti[1] * ti[2]]);
    const c = dot(ui, r);
    const w = sm(-0.2, 0.3, c) * (1 - sm(0.8, 0.95, Math.abs(ti[1])));
    if (w <= 0) continue;
    const beta = dm.atan2(dot(cross(ui, r), ti), c) * w;
    twist = Math.max(twist, Math.abs(beta));
    upT.set(rot(ui, ti, beta), i * 3);
  }
  if (closed) for (let k = 0; k < 3; k++) upT[n * 3 + k] = upT[k];
  const side = new Float64Array((n + 1) * 3);
  for (let i = 0; i <= n; i++) {
    side.set(cross([upT[i * 3], upT[i * 3 + 1], upT[i * 3 + 2]], T(i)), i * 3);
  }
  // control point arc lengths (nearest dense sample)
  const controlS = ctrlDense.slice(0, m).map((di) => dcum[di]);
  return { closed, length, n, ds, pos, tan, up: upT, side, controlS, twist };
}

/** Arc length wrapped into [0, length) (closed) or clamped (open). */
export function wrapCoasterS(sp: CoasterSpline, s: number): number {
  if (sp.closed) {
    const r = s % sp.length;
    return r < 0 ? r + sp.length : r;
  }
  return Math.min(sp.length, Math.max(0, s));
}

/** Pose at arc length `s` (u) into `out` (allocates when omitted). */
export function sampleCoaster(
  sp: CoasterSpline,
  s: number,
  out: CoasterSample = newCoasterSample(),
): CoasterSample {
  const w = wrapCoasterS(sp, s);
  const f = w / sp.ds;
  const i = Math.min(sp.n - 1, Math.floor(f));
  const k = f - i;
  const a = i * 3;
  const b = a + 3;
  const lerp = (t: Float64Array, o: [number, number, number]): void => {
    o[0] = t[a] + (t[b] - t[a]) * k;
    o[1] = t[a + 1] + (t[b + 1] - t[a + 1]) * k;
    o[2] = t[a + 2] + (t[b + 2] - t[a + 2]) * k;
  };
  out.s = w;
  lerp(sp.pos, out.pos);
  lerp(sp.tan, out.tangent);
  lerp(sp.up, out.up);
  const tl = Math.hypot(...out.tangent) || 1;
  out.tangent[0] /= tl;
  out.tangent[1] /= tl;
  out.tangent[2] /= tl;
  // keep up orthonormal to the tangent
  const d = dot(out.up, out.tangent);
  out.up[0] -= out.tangent[0] * d;
  out.up[1] -= out.tangent[1] * d;
  out.up[2] -= out.tangent[2] * d;
  const ul = Math.hypot(...out.up) || 1;
  out.up[0] /= ul;
  out.up[1] /= ul;
  out.up[2] /= ul;
  const sd = cross(out.up, out.tangent);
  out.side[0] = sd[0];
  out.side[1] = sd[1];
  out.side[2] = sd[2];
  return out;
}
