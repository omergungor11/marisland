/**
 * Sea-top fun park motion (M53 TASK-672, D-172): the rides' poses as pure closed-form functions of
 * the sim time. No three.js, no state, no `Math.random` / `Date.now`: any `time` seeks to the same
 * pose, so a frozen capture and a long session agree. Numbers: content/life-luna.ts (LUNA_MOTION);
 * the meshes that wear these poses: render/luna-movers.ts.
 */
import { LUNA_MOTION as M } from '../content/life-luna.ts';
import { LUNA_LOOK, lunaCoasterPoints } from '../content/themes/marketing-luna-look.ts';
import { unitHash } from '../core/hash.ts';
import {
  createCoasterSpline,
  sampleCoaster,
  newCoasterSample,
  type CoasterSample,
  type CoasterSpline,
} from '../world/coaster-spline.ts';

const TAU = Math.PI * 2;
const sm = (u: number): number => u * u * (3 - 2 * u);
/** ∫0..u smoothstep. */
const smInt = (u: number): number => u * u * u - (u * u * u * u) / 2;
const wrap = (t: number, p: number): number => ((t % p) + p) % p;

/** A cycle of idle / spin-up / full speed / spin-down (the swing). */
export interface SpinCycle {
  cycle: number;
  rest: number;
  run: number;
  up: number;
  hold: number;
  down: number;
}

/** Speed share 0..1 (0 = `rest`, 1 = `run`) at cycle time `c`. */
export function spinShare(c: number, S: SpinCycle): number {
  if (c < S.up) return sm(c / S.up);
  if (c < S.up + S.hold) return 1;
  if (c < S.up + S.hold + S.down) return 1 - sm((c - S.up - S.hold) / S.down);
  return 0;
}

/** Turns (revolutions) of a cycle-driven rotor at time `t` (continuous, monotone). */
export function spinTurns(t: number, S: SpinCycle): number {
  const full = S.rest * S.cycle + (S.run - S.rest) * (S.up / 2 + S.hold + S.down / 2);
  const c = wrap(t, S.cycle);
  let i: number;
  if (c < S.up) i = S.up * smInt(c / S.up);
  else if (c < S.up + S.hold) i = S.up / 2 + (c - S.up);
  else if (c < S.up + S.hold + S.down) {
    const u = (c - S.up - S.hold) / S.down;
    i = S.up / 2 + S.hold + S.down * (u - smInt(u));
  } else i = S.up / 2 + S.hold + S.down / 2;
  return Math.floor(t / S.cycle) * full + S.rest * c + (S.run - S.rest) * i;
}

/** Gondola height over the base pivot at time `t` (between `lo` and `hi` plus the anticipation lift). */
export function dropHeight(t: number, lo: number, hi: number, D = M.drop): number {
  const c = wrap(t, D.cycle);
  const top = D.climb + D.hold;
  if (c < D.climb) return lo + (hi - lo) * 0.5 * (1 - Math.cos((Math.PI * c) / D.climb));
  if (c < top) {
    const h = c - D.climb;
    const env = Math.sin((Math.PI * h) / D.hold);
    let y = hi + D.shiver.amp * env * Math.sin(TAU * D.shiver.hz * h);
    const a = (h - (D.hold - D.lead)) / D.lead;
    if (a > 0) y += D.anticipate * Math.sin(Math.PI * a);
    return y;
  }
  if (c < top + D.fall) {
    const u = (c - top) / D.fall;
    return hi - (hi - lo) * u * u;
  }
  const tau = c - top - D.fall;
  return (
    lo +
    D.bounce.h * Math.exp(-D.bounce.decay * tau) * Math.abs(Math.sin(Math.PI * D.bounce.hz * tau))
  );
}

/** Carousel turns (revolutions) at `t`: a slow steady turn with a slow gust of speed. */
export function carouselTurns(t: number, C = M.carousel): number {
  return C.rev * (t + ((C.gust * C.gustT) / TAU) * (1 - Math.cos((TAU * t) / C.gustT)));
}

/** Per-ride phase: a fraction of its cycle from the world seed. */
export const ridePhase = (seed: number, ride: number): number => unitHash(seed ^ 0x6c75, ride, 7);

/** ---- the park's frame: the deck's centre and axes, mirrored by `mx` (see world/gen/plans/marketing-luna.ts) */
export interface LunaFrame {
  cx: number;
  cz: number;
  /** Unit heading of the deck's +z (the pier heading). */
  ux: number;
  uz: number;
  mx: 1 | -1;
}

/** World point of deck-frame (x, z). */
export function frameToWorld(
  f: LunaFrame,
  x: number,
  z: number,
  out: { x: number; z: number },
): void {
  const X = { x: f.uz, z: -f.ux };
  out.x = f.cx + X.x * f.mx * x + f.ux * z;
  out.z = f.cz + X.z * f.mx * x + f.uz * z;
}

/** Deck-frame point of world (x, z). */
export function frameToDeck(f: LunaFrame, x: number, z: number): { x: number; z: number } {
  const dx = x - f.cx;
  const dz = z - f.cz;
  return { x: f.mx * (dx * f.uz - dz * f.ux), z: dx * f.ux + dz * f.uz };
}

/** ---- bumper boats */
export interface BoatRig {
  n: number;
  frame: LunaFrame;
  /** Orbit amplitude, angular rate and phase per axis, deck frame (pool-centred). */
  ax: number;
  az: number;
  wx: Float64Array;
  wz: Float64Array;
  px: Float64Array;
  pz: Float64Array;
  /** Clamp half extents of a boat's centre. */
  lx: number;
  lz: number;
  /** Bob / roll phase offsets (rad). */
  bob: Float64Array;
  roll: Float64Array;
  /** Yaw to keep when a boat is momentarily still (world three yaw). */
  yaw0: Float64Array;
}

/**
 * The boats of one pool: `starts` are the start spots in the deck frame (pool-centred), `poolW` x
 * `poolD` the open water. Each boat's orbit passes through its start spot at t = 0.
 */
export function makeBoatRig(
  seed: number,
  frame: LunaFrame,
  poolW: number,
  poolD: number,
  starts: readonly { x: number; z: number }[],
  B = M.boat,
): BoatRig {
  const n = starts.length;
  const lx = poolW / 2 - B.r - B.margin;
  const lz = poolD / 2 - B.r - B.margin;
  const ax = lx * B.reach;
  const az = lz * B.reach;
  const h = (i: number, k: number): number => unitHash(seed ^ 0x626f, i, k);
  const rig: BoatRig = {
    n,
    frame,
    ax,
    az,
    wx: new Float64Array(n),
    wz: new Float64Array(n),
    px: new Float64Array(n),
    pz: new Float64Array(n),
    lx,
    lz,
    bob: new Float64Array(n),
    roll: new Float64Array(n),
    yaw0: new Float64Array(n),
  };
  const per = (i: number, k: number): number =>
    (B.period[0] + (B.period[1] - B.period[0]) * h(i, k)) * (1 + B.jitter * (2 * h(i, k + 8) - 1));
  for (let i = 0; i < n; i++) {
    rig.wx[i] = TAU / per(i, 1);
    // the second axis runs at an incommensurate rate so the orbit never closes on itself
    rig.wz[i] = TAU / (per(i, 2) * 0.83);
    const fx = Math.max(-1, Math.min(1, starts[i].x / Math.max(1e-6, ax)));
    const fz = Math.max(-1, Math.min(1, starts[i].z / Math.max(1e-6, az)));
    rig.px[i] = Math.asin(fx);
    rig.pz[i] = Math.asin(fz);
    rig.bob[i] = h(i, 3) * TAU;
    rig.roll[i] = h(i, 4) * TAU;
    rig.yaw0[i] = h(i, 5) * TAU;
  }
  return rig;
}

/** Deck-frame boat centres at `t` (orbit, then pushed apart, then held inside the pool). */
export function boatCentres(
  rig: BoatRig,
  t: number,
  xs: Float64Array,
  zs: Float64Array,
  B = M.boat,
): void {
  const n = rig.n;
  for (let i = 0; i < n; i++) {
    xs[i] = rig.ax * Math.sin(rig.wx[i] * t + rig.px[i]);
    zs[i] = rig.az * Math.sin(rig.wz[i] * t + rig.pz[i]);
  }
  const min = 2 * B.r;
  for (let it = 0; it < B.iters; it++) {
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const dx = xs[j] - xs[i];
        const dz = zs[j] - zs[i];
        const d = Math.hypot(dx, dz);
        if (d >= min) continue;
        // exactly on top of each other: separate along an index-hashed axis
        const a = (i * 7 + j * 3) * 0.9;
        const nx = d < 1e-6 ? Math.cos(a) : dx / d;
        const nz = d < 1e-6 ? Math.sin(a) : dz / d;
        const push = (min - d) / 2;
        xs[i] -= nx * push;
        zs[i] -= nz * push;
        xs[j] += nx * push;
        zs[j] += nz * push;
      }
    for (let i = 0; i < n; i++) {
      xs[i] = Math.max(-rig.lx, Math.min(rig.lx, xs[i]));
      zs[i] = Math.max(-rig.lz, Math.min(rig.lz, zs[i]));
    }
  }
}

export interface BoatPose {
  /** World xz of the boat's pivot, y over the water line. */
  x: number;
  y: number;
  z: number;
  /** Three yaw (about +y, front = +z) and the roll about the boat's own z. */
  yaw: number;
  roll: number;
}

export const newBoatPoses = (n: number): BoatPose[] =>
  Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0, yaw: 0, roll: 0 }));

const _a = { x: 0, z: 0 };
const _b = { x: 0, z: 0 };

/** World poses of every boat at `t` into `out`. */
export function boatPoses(rig: BoatRig, t: number, out: BoatPose[], motion = 1, B = M.boat): void {
  const n = rig.n;
  const c = [new Float64Array(n), new Float64Array(n)];
  const p = [new Float64Array(n), new Float64Array(n)];
  const q = [new Float64Array(n), new Float64Array(n)];
  boatCentres(rig, t, c[0], c[1], B);
  boatCentres(rig, t - B.look, p[0], p[1], B);
  boatCentres(rig, t + B.look, q[0], q[1], B);
  for (let i = 0; i < n; i++) {
    frameToWorld(rig.frame, c[0][i], c[1][i], _a);
    const o = out[i];
    o.x = _a.x;
    o.z = _a.z;
    frameToWorld(rig.frame, p[0][i], p[1][i], _a);
    frameToWorld(rig.frame, q[0][i], q[1][i], _b);
    const vx = _b.x - _a.x;
    const vz = _b.z - _a.z;
    o.yaw = Math.hypot(vx, vz) > 1e-4 ? Math.atan2(vx, vz) : rig.yaw0[i];
    o.y = B.bob.amp * motion * Math.sin((TAU * t) / B.bob.period + rig.bob[i]);
    o.roll = B.roll.amp * motion * Math.sin((TAU * t) / B.roll.period + rig.roll[i]);
  }
}

/** ---- the worm train */
export interface TrainClock {
  sp: CoasterSpline;
  /** Seconds per lap. */
  lap: number;
  /** Cumulative lap time at each table arc step (`table + 1` entries). */
  time: Float64Array;
  /** Arc length of the head's front at time `t`. */
  at(t: number): number;
}

/** The train's clock on the loop of `length` (LUNA_KIT.coasterLengths[i]): slower on the hills. */
export function makeTrainClock(length: number, T = M.train): TrainClock {
  const sp = createCoasterSpline(lunaCoasterPoints(length), { closed: true });
  const N = T.table;
  const ys = new Float64Array(N + 1);
  const tmp = newCoasterSample();
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k <= N; k++) {
    sampleCoaster(sp, (k / N) * sp.length, tmp);
    ys[k] = tmp.pos[1];
    lo = Math.min(lo, ys[k]);
    hi = Math.max(hi, ys[k]);
  }
  const v = (y: number): number =>
    T.fast + (T.slow - T.fast) * sm((y - lo) / Math.max(1e-6, hi - lo));
  const time = new Float64Array(N + 1);
  const ds = sp.length / N;
  for (let k = 1; k <= N; k++) time[k] = time[k - 1] + ds / ((v(ys[k - 1]) + v(ys[k])) / 2);
  const lap = time[N];
  return {
    sp,
    lap,
    time,
    at(t: number): number {
      const c = wrap(t, lap);
      let a = 0;
      let b: number = N;
      while (b - a > 1) {
        const m = (a + b) >> 1;
        if (time[m] <= c) a = m;
        else b = m;
      }
      const k = (c - time[a]) / Math.max(1e-9, time[b] - time[a]);
      return (a + k) * ds;
    },
  };
}

/**
 * Arc length of each car's centre when the head's front is at `front`: car 0 is the head, then the
 * passenger cars (LUNA_LOOK.train), `gap` apart. Allocation-free.
 */
export function trainCentres(front: number, out: Float64Array): void {
  const T = LUNA_LOOK.train;
  let s = front;
  for (let i = 0; i < out.length; i++) {
    const len = i === 0 ? T.head.len : T.car.len;
    out[i] = s - len / 2;
    s -= len + T.gap;
  }
}

/** Pose (kit frame) of a car centre at arc length `s`: position, and the basis side / up / tangent. */
export function trainSample(clock: TrainClock, s: number, out: CoasterSample): CoasterSample {
  return sampleCoaster(clock.sp, s, out);
}
