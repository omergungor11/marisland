import { CULTURE_CLOCK, CULTURE_RHYTHM } from '../content/cultures/rhythm.ts';
import { QA_PROVING, QA_PROVING_MOTION } from '../content/themes/qa-proving.ts';

/**
 * Proving Grounds closed-form motion (M24 TASK-501): the drop tower's crate and the test fan's
 * siren speed-up. Pure maths of the sim time / culture-clock day seconds, so a capture replays them.
 * The crash cart and dummy live in geo/themes/qa-crash.ts (they share the track centreline).
 */

const DROP = QA_PROVING_MOTION.drop;
const K = QA_PROVING.tower.crate;
const smoother = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * c * (c * (c * 6 - 15) + 10);
};

export interface DropState {
  /** Crate centre height in the tower frame. */
  y: number;
  /** Landing squash 0 … `squashDepth` (the crate is squeezed, its foot stays on the pad). */
  squash: number;
  /** Seconds since the crate landed (−1 while it is not in the post-landing window). */
  since: number;
  /** ✓ lamp glow 0 … 1. */
  lamp: number;
}

/** Seconds of the crate's fall for the reduced-motion slow factor `slow` (g shrinks with slow²). */
export function dropFall(slow = 1): number {
  const h = K.top - K.rest;
  return Math.sqrt((2 * h) / DROP.g) * slow;
}

/**
 * The drop-tower crate at sim time `time`. Cycle (`period` s): rest on the pad, lift, hang with a
 * short shake, free fall, landing squash. `motion` (reduced motion 0 … 1) lengthens the lift and the
 * fall up to `slowMax` x and softens the squash.
 */
export function dropState(time: number, motion: number, out: DropState): DropState {
  const slow = 1 + (DROP.slowMax - 1) * (1 - motion);
  const lift = DROP.lift * slow;
  const fall = dropFall(slow);
  const h = K.top - K.rest;
  let c = (time + DROP.phase) % DROP.period;
  if (c < 0) c += DROP.period;
  const tHang = DROP.rest + lift;
  const tFall = tHang + DROP.hang;
  const tLand = tFall + fall;
  let y = K.rest;
  let squash = 0;
  let since = -1;
  if (c >= DROP.rest && c < tHang) y = K.rest + h * smoother((c - DROP.rest) / lift);
  else if (c >= tHang && c < tFall) {
    // a hair of sway, then a quick shake before the drop
    const shake = Math.max(0, (c - (tFall - 0.5)) / 0.5);
    y = K.top + 0.025 * Math.sin(c * 2.4) + 0.05 * shake * Math.sin(c * 55) * motion;
  } else if (c >= tFall && c < tLand) {
    const u = c - tFall;
    y = K.top - (h / (fall * fall)) * u * u;
  } else if (c >= tLand) {
    since = c - tLand;
    const e = since / DROP.squash;
    if (e < 1)
      squash = DROP.squashDepth * motion * Math.exp(-4 * e) * Math.cos(e * Math.PI * 2.5) * (1 - e);
  }
  out.y = y;
  out.squash = squash;
  out.since = since >= 0 && since < Math.max(DROP.lamp, DROP.dust.life) ? since : -1;
  out.lamp =
    since < 0 || since >= DROP.lamp
      ? 0
      : Math.min(1, since / 0.08) * (1 - smoother((since - (DROP.lamp - 1)) / 1));
  return out;
}

/* ------------------------------------- fan -------------------------------------- */

const SIREN = CULTURE_RHYTHM.qa.slots.find((s) => s.id === 'sirenTest');
const SPH = CULTURE_CLOCK.secondsPerHour;
const DAY = 24 * SPH;
const FAN = QA_PROVING_MOTION.fan;

/**
 * Extra blade angle (radians) of the test fan at culture-clock day seconds `day`: a smooth speed
 * bump of `fan.revs` whole turns inside the siren test, so the blades speed up, then settle back to
 * their wind-driven turn with no jump (whole turns = 0 mod 2π; 0 outside the ritual).
 */
export function fanSpinExtra(day: number): number {
  if (!SIREN?.seconds) return 0;
  const T = SIREN.seconds;
  const r = FAN.ramp;
  const peak = (2 * Math.PI * FAN.revs) / (T - r);
  let u = (((day - SIREN.hour * SPH) % DAY) + DAY) % DAY;
  if (u >= T) return 0;
  if (u < r) return (peak * u * u) / (2 * r);
  if (u < T - r) return peak * (u - r / 2);
  u = T - u;
  return peak * (T - r) - (peak * u * u) / (2 * r);
}
