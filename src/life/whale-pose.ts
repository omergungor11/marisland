import { WHALE } from '../content/whale.ts';

/**
 * The whale's pose over one surfacing (M23 TASK-489): a pure closed-form function of the event
 * seconds `u` (render/whale.ts maps the culture-clock day onto it), so a frozen capture lands on
 * the exact pose. No three.js, no state.
 *
 * Timeline (WHALE.event): the back rises over `rise` s from deep water, the blowhole blows twice
 * while it rests at the surface, the tail lifts and slaps the water (anticipation dip, lift, whip,
 * underdamped settle), then the body arches, pitches nose-down so the fluke stands up and the whole
 * animal slides under on a parabola. `motion` (reduced motion, 0..1) calms the idle swim and keeps
 * the dive shallow (no fluke-up, no slap).
 */
export interface WhalePose {
  /** Body centre height above the sea, u. */
  y: number;
  /** Whole-body pitch, rad (+ nose up). */
  pitch: number;
  /** Spine curvature, rad per u (+ = back arched: nose and tail lean down). */
  arch: number;
  /** Progressive tail bend from mid body, rad (+ tail up). */
  tail: number;
  /** Extra flex of the fluke alone, rad (+ up). */
  fluke: number;
  /** Roll about the body axis, rad. */
  roll: number;
  /** Pectoral flipper paddle angle, rad. */
  fin: number;
  /** Tail undulation (vertical wave) amplitude rad and phase rad. */
  wag: number;
  wagPhase: number;
  /** Forward distance glided since the event started, u. */
  forward: number;
  /** Whether any of the whale can be above the water (the view hides the mesh otherwise). */
  up: boolean;
}

export const makePose = (): WhalePose => ({
  y: -9,
  pitch: 0,
  arch: 0,
  tail: 0,
  fluke: 0,
  roll: 0,
  fin: 0,
  wag: 0,
  wagPhase: 0,
  forward: 0,
  up: false,
});

const DEG = Math.PI / 180;
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const easeOutSine = (x: number): number => Math.sin(clamp01(x) * Math.PI * 0.5);
const easeOutCubic = (x: number): number => 1 - Math.pow(1 - clamp01(x), 3);
const easeInQuad = (x: number): number => clamp01(x) * clamp01(x);

/** Back height at rest: its top is `back` u above the sea (body half height ≈ 1.95 at the middle). */
export const REST_Y = WHALE.event.back - 1.95;

/** Underdamped step response remainder (1 → 0) `s` seconds after a step, zero initial velocity. */
function springLeft(s: number, omega: number, zeta: number): number {
  if (s <= 0) return 1;
  const z = Math.min(0.995, zeta);
  const wd = omega * Math.sqrt(1 - z * z);
  return Math.exp(-z * omega * s) * (Math.cos(wd * s) + ((z * omega) / wd) * Math.sin(wd * s));
}

/**
 * Tail slap angle (rad) `tau` s after the lift starts (0 outside [0, total]): a small dip first
 * (anticipation), the lift, the fast whip down onto the water and the springy settle.
 */
export function slapAngle(tau: number): number {
  const S = WHALE.slap;
  if (!(tau > 0 && tau < S.total)) return 0;
  const tLift = S.dip.seconds + S.lift.seconds;
  const tWhip = tLift + S.whip.seconds;
  if (tau < S.dip.seconds) return S.dip.deg * DEG * Math.sin((tau / S.dip.seconds) * Math.PI * 0.5);
  if (tau < tLift) {
    const k = easeOutCubic((tau - S.dip.seconds) / S.lift.seconds);
    return (S.dip.deg + (S.lift.deg - S.dip.deg) * k) * DEG;
  }
  if (tau < tWhip) {
    const k = easeInQuad((tau - tLift) / S.whip.seconds);
    return (S.lift.deg + (S.whip.deg - S.lift.deg) * k) * DEG;
  }
  return S.whip.deg * DEG * springLeft(tau - tWhip, S.settle.omega, S.settle.zeta);
}

/** Seconds after the slap lift starts at which the tail meets the water. */
export const SLAP_IMPACT =
  WHALE.slap.dip.seconds + WHALE.slap.lift.seconds + WHALE.slap.whip.seconds;

/**
 * Pose at event second `u` (the whale is drawn for 0 ≤ u ≤ end). `clickTau` = seconds since a
 * click-triggered slap started (< 0 or NaN = none).
 */
export function whalePose(
  out: WhalePose,
  u: number,
  motion: number,
  clickTau = Number.NaN,
): WhalePose {
  const E = WHALE.event;
  const W = WHALE.swim;
  const m = clamp01(motion);
  const calm = 0.3 + 0.7 * m;
  // height: rise from the deep, rest at the surface, sink on the dive parabola
  const rise = easeOutSine(u / E.rise);
  let y = E.depth + (REST_Y - E.depth) * rise;
  y += W.bob * m * Math.sin((u / W.period) * Math.PI * 2) * smooth((u - E.rise) / 2);
  const diveT = E.dive.from;
  const sinkT = diveT + E.dive.seconds * 0.35;
  if (u > sinkT) {
    const w = clamp01((u - sinkT) / (E.end - sinkT));
    y = y + (E.floor - y) * w * w;
  }
  // pitch: nose up a touch while rising, level at the surface, nose-down on the dive
  const up0 = 9 * DEG * (1 - smooth(u / E.rise));
  const dive = smooth((u - diveT) / (E.dive.seconds * 0.7));
  out.pitch = up0 - E.dive.pitch * DEG * calm * dive;
  out.arch = 0.05 * dive * calm;
  // tail: idle undulation, the slap(s), a lift while diving so the fluke stands up
  const slap = (u >= E.slapAt && m >= 0.5 ? slapAngle(u - E.slapAt) : 0) + slapAngle(clickTau);
  out.tail = slap * 0.55 + 0.1 * dive * calm + 0.16 * (1 - dive) * smooth((u - 3) / 3);
  out.fluke = slap * 0.45 - 0.35 * dive * calm;
  out.wag = W.tailDeg * DEG * m * (1 - dive);
  out.wagPhase = (u / W.period) * Math.PI * 2;
  out.roll = W.rollDeg * DEG * m * Math.sin((u / W.rollPeriod) * Math.PI * 2) * (1 - dive);
  out.fin = W.flipperDeg * DEG * calm * Math.sin((u / (W.period * 0.8)) * Math.PI * 2 + 1.1);
  out.y = y;
  out.forward = E.glide * u;
  out.up = u >= 0 && u <= E.end && y + 2.2 + 6.8 * Math.max(0, -Math.sin(out.pitch)) > -0.3;
  return out;
}

/** Blow `k` (0-based) age 0..1 over its plume at event second `u`, or -1 when not blowing. */
export function blowAge(u: number, k: number): number {
  const t = u - WHALE.event.blows[k];
  const d = WHALE.event.blowSeconds[k];
  return t < 0 || t > d + WHALE.spout.life ? -1 : t;
}
