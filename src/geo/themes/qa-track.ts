/**
 * The crash-test loop track centreline (M17b TASK-401), shared by the track geometry
 * (geo/themes/qa.ts testTrack) and the test cart (render/movers.ts). Pure maths, no three.
 *
 * Local frame of the testTrack prop (front +z): an oval with its straights along z; on the +x
 * straight the rails climb a vertical loop that shifts sideways by `shift`, so the way in and the
 * way out run side by side. Each sample carries a frame: `t` tangent, `u` rail-up (upside down at
 * the loop top), `r` = u × t (the cart's local +x). `time` is the lap clock: the cart slows going
 * up the loop (speed ∝ √(1 − k·y)) and waits `dwell` s at the start.
 */
import { QA_FACTORY, QA_MOVERS } from '../../content/themes/qa.ts';

type V3 = [number, number, number];

export interface TrackPath {
  p: V3[];
  t: V3[];
  u: V3[];
  r: V3[];
  /** Arc length at each sample (u) and the closed loop's total. */
  s: number[];
  length: number;
  /** Lap clock at each sample (s) and the full lap incl. the dwell. */
  time: number[];
  lap: number;
  /** Bounds of the rails in the local xz plane (centred on the origin). */
  halfX: number;
  halfZ: number;
}

const T = QA_FACTORY.track;
const smooth = (x: number): number => x * x * (3 - 2 * x);
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

let cached: TrackPath | null = null;

/** The track centreline sampled every ≈ `step` u (cached for the default step). */
export function trackPath(step = 0.25): TrackPath {
  if (step === 0.25 && cached) return cached;
  const { a, b, loopR: R, shift: w } = T;
  const rr = b + w / 2;
  // pieces as parametric functions of τ ∈ [0, 1] (+ the loop flag for the frame)
  const pieces: { len: number; at: (k: number) => V3; loop: boolean }[] = [
    { len: a, at: (k) => [b, 0, -a + a * k], loop: false },
    {
      len: 2 * Math.PI * R,
      at: (k) => {
        const th = 2 * Math.PI * k;
        return [b + w * smooth(k), R * (1 - Math.cos(th)), R * Math.sin(th)];
      },
      loop: true,
    },
    { len: a, at: (k) => [b + w, 0, a * k], loop: false },
    {
      len: Math.PI * rr,
      at: (k) => [w / 2 + rr * Math.cos(Math.PI * k), 0, a + rr * Math.sin(Math.PI * k)],
      loop: false,
    },
    { len: 2 * a, at: (k) => [-b, 0, a - 2 * a * k], loop: false },
    {
      len: Math.PI * b,
      at: (k) => [b * Math.cos(Math.PI + Math.PI * k), 0, -a + b * Math.sin(Math.PI + Math.PI * k)],
      loop: false,
    },
  ];
  const raw: { p: V3; loop: boolean }[] = [];
  for (const pc of pieces) {
    const n = Math.max(2, Math.ceil(pc.len / step));
    for (let i = 0; i < n; i++) raw.push({ p: pc.at(i / n), loop: pc.loop });
  }
  // centre the rails' plan bounds on the origin
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const { p } of raw) {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    z0 = Math.min(z0, p[2]);
    z1 = Math.max(z1, p[2]);
  }
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const N = raw.length;
  const p: V3[] = raw.map(({ p: q }) => [q[0] - cx, q[1], q[2] - cz]);
  const t: V3[] = [];
  const u: V3[] = [];
  const r: V3[] = [];
  for (let i = 0; i < N; i++) {
    const A = p[(i + N - 1) % N];
    const B = p[(i + 1) % N];
    const ti = norm([B[0] - A[0], B[1] - A[1], B[2] - A[2]]);
    // side: horizontal right of the oval's way (+x on the loop straight); up = t × side
    const side: V3 = raw[i].loop ? [1, 0, 0] : norm([ti[2], 0, -ti[0]]);
    const ui = norm(cross(ti, side));
    t.push(ti);
    u.push(ui);
    r.push(cross(ui, ti));
  }
  const s = [0];
  const time: number[] = [QA_MOVERS.cartDwell];
  const k = (1 - QA_MOVERS.cartTop * QA_MOVERS.cartTop) / (2 * R);
  const speed = (y: number): number => QA_MOVERS.cartSpeed * Math.sqrt(Math.max(0.05, 1 - k * y));
  for (let i = 1; i <= N; i++) {
    const A = p[i - 1];
    const B = p[i % N];
    const ds = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    s.push(s[i - 1] + ds);
    time.push(time[i - 1] + ds / speed((A[1] + B[1]) / 2));
  }
  const out: TrackPath = {
    p,
    t,
    u,
    r,
    s: s.slice(0, N),
    length: s[N],
    time: time.slice(0, N),
    lap: time[N],
    halfX: (x1 - x0) / 2,
    halfZ: (z1 - z0) / 2,
  };
  if (step === 0.25) cached = out;
  return out;
}

/**
 * Cart pose on the lap clock: sample index and blend (0..1) toward the next sample. Waits at
 * sample 0 for the dwell, then runs the lap.
 */
export function cartAt(path: TrackPath, time: number): { i: number; f: number } {
  let c = time % path.lap;
  if (c < 0) c += path.lap;
  const tm = path.time;
  if (c <= tm[0]) return { i: 0, f: 0 };
  let lo = 0;
  let hi = tm.length - 1;
  if (c >= tm[hi]) {
    const f = (c - tm[hi]) / (path.lap - tm[hi]);
    return { i: hi, f: Math.min(1, Math.max(0, f)) };
  }
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (tm[m] <= c) lo = m;
    else hi = m;
  }
  return { i: lo, f: (c - tm[lo]) / (tm[hi] - tm[lo]) };
}
