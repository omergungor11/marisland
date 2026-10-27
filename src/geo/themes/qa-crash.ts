/**
 * The figure-8 crash track centreline (M24 TASK-501), shared by the track geometry (geo/themes/
 * qa-factory.ts testTrack variant 1), the test cart (render/movers.ts) and the riding dummy
 * (render/culture-movers.ts). Pure maths, no three.
 *
 * Local frame of the testTrack prop (front +z): a lemniscate whose lobes lie along z, crossing in the
 * middle. Strand A (the first crossing) stays on the ground; strand B climbs a ramp, leaves it in a
 * parabola over the crossing and lands on a second ramp. Same `TrackPath` as the loop track, so
 * `cartAt` poses the cart; the lap clock slows the cart on the ramp (speed ∝ √(1 − k·y)) and waits
 * `dwell` s at the gate. Everything is a function of the lap clock, so a capture freezes it.
 */
import { QA_PROVING_MOTION } from '../../content/themes/qa-proving.ts';
import { cartAt, type TrackPath } from './qa-track.ts';

type V3 = [number, number, number];

export interface CrashPath extends TrackPath {
  /** Sample is in flight (no rails) / on a ramp (y > 0, rails raised). */
  air: boolean[];
  /** Plan-arc slope dy/ds at each sample. */
  slope: number[];
  /** Sideways acceleration (u/s²) along the cart's local x at each sample. */
  side: number[];
  /** Lap-clock times of the launch and of the landing. */
  launch: number;
  land: number;
  /** Ramp-top height and the sample index of the crossing on strand B. */
  rampTop: number;
}

const C = QA_PROVING_MOTION.crash;
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Ramp profile at distance `x` along the ramp from its foot (foot blend, then the slope). */
function rampY(x: number): number {
  if (x <= 0) return 0;
  return x < C.foot ? (C.slope * x * x) / (2 * C.foot) : C.slope * (x - C.foot / 2);
}
/** Height of the ramp top. */
export const CRASH_RAMP_TOP = C.slope * (C.ramp - C.foot / 2);

/** Plan point of the lemniscate at angle `th` (z along the lobes). */
const plan = (th: number): [number, number] => [C.halfX * Math.sin(2 * th), C.halfZ * Math.sin(th)];

const TH0 = -0.55;
let cached: CrashPath | null = null;

/** The crash track centreline sampled every ≈ `step` u (cached for the default step). */
export function crashPath(step = 0.25): CrashPath {
  if (step === 0.25 && cached) return cached;
  // plan length by dense integration, then θ-uniform samples
  const dense = 4000;
  let est = 0;
  for (let k = 0; k < dense; k++) {
    const a = plan(TH0 + (k / dense) * Math.PI * 2);
    const b = plan(TH0 + ((k + 1) / dense) * Math.PI * 2);
    est += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const N = Math.ceil(est / step);
  const th = (i: number): number => TH0 + (i / N) * Math.PI * 2;
  const xz: [number, number][] = [];
  const sPlan: number[] = [0];
  for (let i = 0; i < N; i++) xz.push(plan(th(i)));
  for (let i = 1; i <= N; i++) {
    const a = xz[i - 1];
    const b = xz[i % N];
    sPlan.push(sPlan[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  // plan arc length at the crossing on strand B (θ = π) and the ramp / flight stations
  let sc = 0;
  let best = Infinity;
  for (let i = 0; i < N; i++) {
    const d = Math.abs(th(i) - Math.PI);
    if (d < best) {
      best = d;
      sc = sPlan[i];
    }
  }
  const s1 = sc - C.flight / 2;
  const s0 = s1 - C.ramp;
  const s2 = sc + C.flight / 2;
  const s3 = s2 + C.ramp;
  const yAt = (s: number): number => {
    if (s <= s0 || s >= s3) return 0;
    if (s < s1) return rampY(s - s0);
    if (s <= s2) {
      const u = s - s1;
      return CRASH_RAMP_TOP + C.slope * u - (C.slope / C.flight) * u * u;
    }
    return rampY(s3 - s);
  };
  const p: V3[] = xz.map((q, i) => [q[0], yAt(sPlan[i]), q[1]]);
  const air = sPlan.slice(0, N).map((s) => s > s1 && s < s2);
  const t: V3[] = [];
  const u: V3[] = [];
  const r: V3[] = [];
  for (let i = 0; i < N; i++) {
    const A = p[(i + N - 1) % N];
    const B = p[(i + 1) % N];
    const ti = norm([B[0] - A[0], B[1] - A[1], B[2] - A[2]]);
    const side = norm([ti[2], 0, -ti[0]]);
    const ui = norm(cross(ti, side));
    t.push(ti);
    u.push(ui);
    r.push(cross(ui, ti));
  }
  // slope and sideways acceleration at the flat speed (the cart's local x is r)
  const slope: number[] = [];
  const sideAcc: number[] = [];
  for (let i = 0; i < N; i++) {
    const A = p[(i + N - 1) % N];
    const B = p[(i + 1) % N];
    const ds = Math.hypot(B[0] - A[0], B[2] - A[2]) || 1;
    slope.push((B[1] - A[1]) / ds);
    const t0 = t[(i + N - 1) % N];
    const t1 = t[(i + 1) % N];
    const dt: V3 = [(t1[0] - t0[0]) / ds, (t1[1] - t0[1]) / ds, (t1[2] - t0[2]) / ds];
    sideAcc.push((dt[0] * r[i][0] + dt[1] * r[i][1] + dt[2] * r[i][2]) * C.speed * C.speed);
  }
  const s = [0];
  const time: number[] = [C.dwell];
  const speed = (y: number): number => C.speed * Math.sqrt(Math.max(0.1, 1 - C.slow * y));
  for (let i = 1; i <= N; i++) {
    const A = p[i - 1];
    const B = p[i % N];
    const ds = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    s.push(s[i - 1] + ds);
    time.push(time[i - 1] + ds / speed((A[1] + B[1]) / 2));
  }
  let x1 = 0;
  let z1 = 0;
  for (const q of p) {
    x1 = Math.max(x1, Math.abs(q[0]));
    z1 = Math.max(z1, Math.abs(q[2]));
  }
  const at = (st: number): number => {
    let k = 0;
    while (k < N - 1 && sPlan[k + 1] < st) k++;
    return time[k];
  };
  const out: CrashPath = {
    p,
    t,
    u,
    r,
    s: s.slice(0, N),
    length: s[N],
    time: time.slice(0, N),
    lap: time[N],
    halfX: x1,
    halfZ: z1,
    air,
    slope,
    side: sideAcc,
    launch: at(s1),
    land: at(s2),
    rampTop: CRASH_RAMP_TOP,
  };
  if (step === 0.25) cached = out;
  return out;
}

/** Lap clock 0 … lap at sim time `time`. */
export function lapClock(path: TrackPath, time: number): number {
  const c = time % path.lap;
  return c < 0 ? c + path.lap : c;
}

/** Seconds since the cart landed (the lap clock, wrapped), or −1 before the lap's landing. */
export function sinceLanding(path: CrashPath, time: number): number {
  return lapClock(path, time) - path.land;
}

const D = QA_PROVING_MOTION.dummy;
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

/** Cart squash 0 … `squashDepth` (× `motion`) after the landing: a damped bounce that overshoots once. */
export function landingSquash(path: CrashPath, time: number, motion = 1): number {
  const e = sinceLanding(path, time) / C.squash;
  if (e < 0 || e >= 1) return 0;
  return C.squashDepth * motion * Math.exp(-4 * e) * Math.cos(e * Math.PI * 2.5) * (1 - e);
}

export interface DummyPose {
  /** About the cart's local z (sideways lean) and x (forward lean), radians. */
  roll: number;
  pitch: number;
  /** Hop above the seat (u, cart-local). */
  hop: number;
}

/**
 * The riding dummy's lean at sim time `time`: outward in the turns (sideways acceleration), back on
 * the ramp and forward on the way down, a spring and a hop after the landing, and a slow idle wobble.
 * `motion` (reduced motion, 0 … 1) scales every term.
 */
export function dummyPose(
  path: CrashPath,
  time: number,
  motion: number,
  out: DummyPose,
): DummyPose {
  const { i, f } = cartAt(path, time);
  const j = (i + 1) % path.p.length;
  const side = path.side[i] + (path.side[j] - path.side[i]) * f;
  const slope = path.slope[i] + (path.slope[j] - path.slope[i]) * f;
  let roll = clamp(side / 2.2, -1, 1) * D.lean;
  let pitch = -clamp(slope / C.slope, -1, 1) * D.pitch;
  const dt = sinceLanding(path, time);
  let hop = 0;
  if (dt >= 0 && dt < 4 * C.springTau) {
    const env = Math.exp(-dt / C.springTau);
    pitch += 0.5 * env * Math.sin(dt * Math.PI * 2 * C.springHz);
    roll += 0.25 * env * Math.sin(dt * Math.PI * 2 * C.springHz * 1.3 + 1);
    hop = C.hop * env * Math.abs(Math.sin(dt * Math.PI * C.springHz));
  }
  roll += D.idle * Math.sin(time * Math.PI * 2 * D.idleHz);
  pitch += D.idle * 0.7 * Math.sin(time * Math.PI * 2 * D.idleHz * 1.37 + 1);
  out.roll = roll * motion;
  out.pitch = pitch * motion;
  out.hop = hop * (0.5 + 0.5 * motion);
  return out;
}
