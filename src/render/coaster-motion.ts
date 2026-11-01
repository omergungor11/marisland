/**
 * Thrill Test Park motion, pure maths over the kit (TASK-541, D-122; no three.js). A lap is one table
 * built from the track's height profile (chain speed up the lift, energy conservation with friction
 * down, a brake curve into the station), inverted by bisection: the pose is a function of the
 * culture-clock day seconds alone, so a frozen capture (`time=12&simt=4`) lands on the exact pose.
 * Bumper cars are closed forms of the sim time: a stream round an ellipse in the rink, one car rams the
 * next per `period`, contact is solved for, nothing is integrated.
 * render/coaster-movers.ts draws, render/culture-movers.ts lights the lamps.
 */
import { CULTURE_CLOCK, CULTURE_RHYTHM } from '../content/cultures/rhythm.ts';
import { QA_COASTER, QA_COASTER_MOTION as M } from '../content/themes/qa-coaster.ts';
import { hashInts } from '../core/hash.ts';
import type { CoasterKit } from '../world/coaster-kit.ts';
import { newCoasterSample, sampleCoaster, type CoasterSample } from '../world/coaster-spline.ts';

const SPH = CULTURE_CLOCK.secondsPerHour;
const DAY = 24 * SPH;
const NOON = (CULTURE_RHYTHM.qa.slots.find((s) => s.id === 'sirenTest')?.hour ?? 12) * SPH;
const smooth = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
const easeOutBack = (x: number): number => {
  const t = Math.min(1, Math.max(0, x)) - 1;
  return 1 + 2.70158 * t * t * t + 1.70158 * t * t;
};
/** Remaining share of an underdamped step, `u` s after it (1 → 0). */
const springLeft = (u: number, omega: number, zeta: number): number => {
  if (u <= 0) return 1;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return (
    Math.exp(-zeta * omega * u) * (Math.cos(wd * u) + ((zeta * omega) / wd) * Math.sin(wd * u))
  );
};

/** The lap of one kit: speed by travelled arc `u` (from the stop, one whole lap), time table. */
export interface CoasterLap {
  length: number;
  /** Table step (u) and the time at each entry; `times[n]` = the lap's duration. */
  du: number;
  times: Float64Array;
  speeds: Float64Array;
  /** Travelled arc while the train is on the chain: the ratchet runs in [chain0, chain1]. */
  chain0: number;
  chain1: number;
  /** Lap seconds when the lead car enters the loop. */
  loopT: number;
}

const wrap = (s: number, L: number): number => ((s % L) + L) % L;

export function createCoasterLap(kit: CoasterKit, cars: number = QA_COASTER.car.cars): CoasterLap {
  const S = M.speed;
  const sp = kit.spline;
  const L = sp.length;
  const n = Math.ceil(L / 0.1);
  const du = L / n;
  const pitch = QA_COASTER.car.pitch;
  const midBack = ((cars - 1) / 2) * pitch;
  const a = newCoasterSample();
  // the gravity run begins when the train's middle has passed the crest
  const crestY = sampleCoaster(sp, kit.crestS, a).pos[1];
  const chain1 = wrap(kit.crestS + midBack - kit.stopS, L);
  const chain0 = wrap(kit.chain[0][0] - kit.stopS, L);
  const speeds = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const u = i * du;
    let v2: number;
    if (u < chain1) {
      const roll = S.startV * S.startV + 2 * S.rollA * u;
      v2 = Math.min(S.chainV * S.chainV, roll);
    } else {
      const y = sampleCoaster(sp, kit.stopS + u - midBack, a).pos[1];
      v2 = S.chainV * S.chainV + 2 * S.g * (crestY - y) - 2 * S.friction * (u - chain1);
      v2 = Math.max(S.minV * S.minV, v2);
    }
    const brake = S.stopV * S.stopV + 2 * S.brakeA * (L - u);
    speeds[i] = Math.sqrt(Math.min(v2, brake));
  }
  const times = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) times[i] = times[i - 1] + (2 * du) / (speeds[i - 1] + speeds[i]);
  const lap: CoasterLap = {
    length: L,
    du,
    times,
    speeds,
    chain0,
    chain1,
    loopT: 0,
  };
  lap.loopT = lapTimeAt(lap, wrap(kit.loopS - kit.stopS, L));
  return lap;
}

const lapTimeAt = (lap: CoasterLap, u: number): number => {
  const f = u / lap.du;
  const i = Math.min(lap.times.length - 2, Math.floor(f));
  return lap.times[i] + (lap.times[i + 1] - lap.times[i]) * (f - i);
};
/** Travelled arc at `t` lap seconds (bisection on the table). */
export function lapArcAt(lap: CoasterLap, t: number): number {
  const T = lap.times;
  if (t <= 0) return 0;
  if (t >= T[T.length - 1]) return lap.length;
  let lo = 0;
  let hi = T.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (T[m] <= t) lo = m;
    else hi = m;
  }
  return (lo + (t - T[lo]) / (T[hi] - T[lo])) * lap.du;
}

/** The chain's stop-go: the arc each click covers is run in `move` of the click, then held. */
export function ratchet(lap: CoasterLap, u: number): number {
  if (u <= lap.chain0 || u >= lap.chain1) return u;
  const C = M.click;
  const x = (u - lap.chain0) / C.link;
  const k = Math.floor(x);
  const r = lap.chain0 + C.link * (k + smooth((x - k) / C.move));
  // meets the plain arc at the top of the chain
  return Math.min(lap.chain1, r);
}

/** The day's show: dummy waits, dummy lap, lamp + bots board, bot lap, off. Fits a whole number of times per day. */
export interface CoasterShow {
  lap: CoasterLap;
  /** Seconds per show, fitted so `DAY / cycle` is whole (the wrap at midnight stays seamless). */
  cycle: number;
  /** Show seconds: dummy lap starts, bots' lap starts. */
  dummyAt: number;
  botAt: number;
  /** Day seconds of a show's start (bot train enters the loop at noon + noonLead). */
  zero: number;
  /** Dummy's and bots' dwell extra (the fit's slack, s). */
  dwell0: number;
}

export function createCoasterShow(
  kit: CoasterKit,
  cars: number = QA_COASTER.car.cars,
): CoasterShow {
  const lap = createCoasterLap(kit, cars);
  const T = lap.times[lap.times.length - 1];
  const D = M.dwell;
  const min = D.dummy + T + D.swap + T + D.off;
  const count = Math.max(1, Math.floor(DAY / min));
  const cycle = DAY / count;
  const dwell0 = D.dummy + (cycle - min);
  const dummyAt = dwell0;
  const botAt = dummyAt + T + D.swap;
  return { lap, cycle, dummyAt, botAt, zero: NOON + M.noonLead - botAt - lap.loopT, dwell0 };
}

export type RiderKind = 'dummy' | 'bots';

export interface CoasterState {
  /** Travelled arc of the lead car, ratchet applied (0 at the stop); `lap` = which lap is running (−1 = standing). */
  u: number;
  lap: number;
  /** Speed (u/s) of the moment, 0 standing. */
  v: number;
  /** Seats: dummy scale, bots scale (per seat k: `seatPop`). 0 hidden. */
  dummy: number;
  bots: number;
  /** Seconds into the bots' boarding (for the stagger), −1 before it. */
  sinceBoard: number;
  /** ✓ lamp: 0 off, 1 lit; seconds since it lit (−1 off). */
  lamp: number;
  sinceLamp: number;
  /** Seconds since the train's last stop (the arrival nod). */
  sinceStop: number;
  /** Seconds since the chain's last click (−1 not on the chain); the arc of that click. */
  sinceClick: number;
}

export const newCoasterState = (): CoasterState => ({
  u: 0,
  lap: -1,
  v: 0,
  dummy: 1,
  bots: 0,
  sinceBoard: -1,
  lamp: 0,
  sinceLamp: -1,
  sinceStop: 0,
  sinceClick: -1,
});

/** State at culture-clock day seconds `day`. */
export function coasterStateAt(sh: CoasterShow, day: number, out: CoasterState): CoasterState {
  const { lap, cycle, dummyAt, botAt } = sh;
  const T = lap.times[lap.times.length - 1];
  const t = wrap(day - sh.zero, cycle);
  const P = M.pop;
  out.u = 0;
  out.lap = -1;
  out.v = 0;
  out.sinceClick = -1;
  const inLap = (at: number): number => t - at;
  const dummyBack = dummyAt + T;
  const botBack = botAt + T;
  const lapRun = (u0: number, which: number): void => {
    const u = lapArcAt(lap, u0);
    out.lap = which;
    out.u = ratchet(lap, u);
    const f = Math.min(lap.speeds.length - 1, Math.round(u / lap.du));
    out.v = lap.speeds[f];
    if (u > lap.chain0 && u < lap.chain1) {
      const C = M.click;
      const k = Math.floor((u - lap.chain0) / C.link);
      out.sinceClick = (u - (lap.chain0 + k * C.link)) / M.speed.chainV;
    }
  };
  if (t >= dummyAt && t < dummyBack) lapRun(inLap(dummyAt), 0);
  else if (t >= botAt && t < botBack) lapRun(inLap(botAt), 1);
  // seats: the dummy rides lap 0, gets off during the swap, the bots board; the bots get off, the dummy back
  const swap0 = dummyBack + M.lamp.delay + 0.5;
  out.dummy = t < swap0 ? 1 : 1 - smooth((t - swap0) / P.out);
  out.bots = 0;
  out.sinceBoard = -1;
  const board = swap0 + P.out;
  if (t >= board && t < botBack + M.dwell.off * 0.3) {
    out.sinceBoard = t - board;
    out.bots = 1;
  } else if (t >= botBack + M.dwell.off * 0.3) {
    const off = t - (botBack + M.dwell.off * 0.3);
    out.bots = 1 - smooth(off / P.out);
    out.dummy = smooth((off - P.out) / P.in);
  }
  // the lamp: lit after the dummy's lap until the bots are off
  const lit = dummyBack + M.lamp.delay;
  const dark = botBack + M.dwell.off * 0.7;
  out.lamp = t >= lit && t < dark ? 1 : 0;
  out.sinceLamp = out.lamp ? t - lit : -1;
  // arrival nod: since the last return (wraps to the previous show's)
  out.sinceStop = t >= botBack ? t - botBack : t >= dummyBack ? t - dummyBack : t + cycle - botBack;
  return out;
}

/** Scale of a bot in seat `k` (0, 1, …) `since` s into the boarding. */
export const seatPop = (since: number, k: number): number =>
  since < 0 ? 0 : easeOutBack((since - k * M.pop.stagger) / M.pop.in);

/** Arrival nod (radians on the cars' pitch). */
export const arrivalNod = (sinceStop: number): number =>
  sinceStop < 0 || sinceStop > 2 ? 0 : -M.nod.amp * springLeft(sinceStop, M.nod.omega, M.nod.zeta);

/** Sample of car `k` of a train (0 = lead), with `u` from `coasterStateAt`. */
export function carSample(
  kit: CoasterKit,
  u: number,
  k: number,
  out: CoasterSample,
): CoasterSample {
  return sampleCoaster(kit.spline, kit.stopS + u - k * QA_COASTER.car.pitch, out);
}

/* ------------------------------------ bumper cars ------------------------------------ */

export interface BumperPose {
  x: number;
  z: number;
  /** Heading: atan2 of local +z = (sin yaw, cos yaw) in the kit's (x, z). */
  yaw: number;
  /** Contact squash (0..1) on the car's long axis. */
  squash: number;
}

export interface BumperFrame {
  cars: BumperPose[];
  /** The current ram's contact: rink-local spot + seconds since the hit (−1 before it). */
  hit: { x: number; z: number; since: number };
}

export const newBumperFrame = (n: number): BumperFrame => ({
  cars: Array.from({ length: n }, () => ({ x: 0, z: 0, yaw: 0, squash: 0 })),
  hit: { x: 0, z: 0, since: -1 },
});

const onEllipse = (th: number, a: number, b: number): [number, number] => [
  a * Math.cos(th),
  b * Math.sin(th),
];

/** The extra angle that brings car (θ0) into contact with the one ahead (θ1 ≥ θ0, bisection). */
function contactAngle(th0: number, th1: number, a: number, b: number, c: number): number {
  const [x1, z1] = onEllipse(th1, a, b);
  let lo = 0;
  let hi = th1 - th0;
  for (let k = 0; k < 14; k++) {
    const m = (lo + hi) / 2;
    const [x, z] = onEllipse(th0 + m, a, b);
    if (Math.hypot(x1 - x, z1 - z) > c) lo = m;
    else hi = m;
  }
  return lo;
}

/** Poses of the `n` cars at sim time `t` in a rink `w` × `d` centred on the origin. */
export function bumperFrame(
  t: number,
  n: number,
  w: number,
  d: number,
  seed: number,
  out: BumperFrame,
): BumperFrame {
  const B = M.bumpers;
  const a = w / 2 - B.margin;
  const b = d / 2 - B.margin;
  const om = (2 * Math.PI) / B.lapS;
  const gap = (2 * Math.PI) / n;
  const j = Math.floor(t / B.period);
  const u = t - j * B.period;
  const striker = hashInts(seed, j, 541) % n;
  const struck = (striker + 1) % n;
  const tHit = B.rush;
  // angles at the hit (the base stream at j * period + tHit)
  const base = (i: number, at: number): number => om * at + i * gap;
  const hitAt = j * B.period + tHit;
  const delta = contactAngle(base(striker, hitAt), base(striker, hitAt) + gap, a, b, B.contact);
  // the whole ram dies out before the next one starts
  const fade = 1 - smooth((u - (B.period - 0.6)) / 0.6);
  const since = u - tHit;
  const strike =
    since < 0 ? delta * (u / tHit) * (u / tHit) : delta * springLeft(since, B.omega, B.zeta) * fade;
  // the struck car jumps forward, then eases back: rises from 0, peaks, settles (difference of two decays)
  const jolt =
    since < 0
      ? 0
      : (gap - delta * 0.5) *
        B.jolt *
        0.5 *
        (1 - springLeft(since, B.omega * 1.6, B.zeta)) *
        Math.exp(-since * 1.1) *
        fade;
  for (let i = 0; i < n; i++) {
    let th = base(i, t);
    if (i === striker) th += strike;
    else if (i === struck) th += jolt;
    const [x, z] = onEllipse(th, a, b);
    const c = out.cars[i];
    c.x = x;
    c.z = z;
    // along the ellipse, a slow wander, a spin kick on the two that met
    const tx = -a * Math.sin(th);
    const tz = b * Math.cos(th);
    const ph = (i * 2.4 + 0.7) % (2 * Math.PI);
    let yaw = Math.atan2(tx, tz) + B.wander * Math.sin((t / B.wanderS) * 2 * Math.PI + ph);
    let sq = 0;
    if (since >= 0 && (i === striker || i === struck)) {
      const k = (i === striker ? -1 : 1) * B.spin;
      yaw += k * (1 - springLeft(since, B.omega, B.zeta)) * Math.exp(-since * 0.9) * fade;
      sq = B.squash * Math.exp(-since * 7);
    }
    c.yaw = yaw;
    c.squash = sq;
  }
  const [xa, za] = onEllipse(base(striker, hitAt) + delta, a, b);
  const [xb, zb] = onEllipse(base(striker, hitAt) + gap, a, b);
  out.hit.x = (xa + xb) / 2;
  out.hit.z = (za + zb) / 2;
  out.hit.since = since;
  return out;
}
