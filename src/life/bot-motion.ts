import { BOT_BEAT, BOT_DONE, BOT_SWAP, type BotBeat } from '../content/bot-motion.ts';
import { springIn } from '../core/math/spring.ts';

/**
 * Closed-form bot motion curves (TASK-592), no three import: every function is a pure function of
 * the time since the motion began, so a frozen capture and a re-simulated sim agree exactly.
 */

/** Pose offsets of one motion at one instant (all additive, zero = rest). */
export interface BotPose {
  /** Heading offset (rad), pitch (rad, + = nose up), roll (rad). */
  yaw: number;
  pitch: number;
  roll: number;
  /** Lift above the feet (u). */
  y: number;
  /** Arm raise 0..1 (the `wave` arm pose amount). */
  arm: number;
  /** Vertical scale multiplier (x / z follow by volume). */
  sy: number;
}

export const restPose = (): BotPose => ({ yaw: 0, pitch: 0, roll: 0, y: 0, arm: 0, sy: 1 });

const smooth = (u: number): number => {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
};

/** 0 -> 1 -> 0 envelope of a beat, `edge` share eased at each end. */
export function beatEnv(u: number, edge: number = BOT_BEAT.edge): number {
  if (u <= 0 || u >= 1) return 0;
  return Math.min(smooth(u / edge), smooth((1 - u) / edge));
}

/** Idle beat `beat` at progress `u` 0..1 (zero outside), written into `out`. */
export function beatPose(beat: BotBeat, u: number, out: BotPose): BotPose {
  const e = beatEnv(u);
  switch (beat) {
    case 'stretch': {
      const B = BOT_BEAT.stretch;
      const s = Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
      out.pitch += B.pitch * s;
      out.arm = Math.max(out.arm, B.arm * s);
      out.sy *= 1 + B.squash * s;
      break;
    }
    case 'look': {
      const B = BOT_BEAT.look;
      // right, then left, then back to centre: one full sine under the envelope
      out.yaw += B.yaw * Math.sin(2 * Math.PI * u) * e;
      out.pitch += B.pitch * e;
      break;
    }
    case 'tap': {
      const B = BOT_BEAT.tap;
      const ph = u * B.taps * Math.PI * 2;
      out.y += B.bounce * Math.max(0, Math.sin(ph)) * e;
      out.roll += B.roll * Math.sin(ph * 0.5) * e;
      break;
    }
    case 'wrist': {
      const B = BOT_BEAT.wrist;
      out.arm = Math.max(out.arm, B.arm * e);
      out.pitch += B.pitch * e;
      break;
    }
  }
  return out;
}

/**
 * The done hop at `t` s since it began: anticipation squash, arc, land squash and settle.
 * Returns false once it is over (out untouched).
 */
export function doneHop(t: number, out: BotPose): boolean {
  const D = BOT_DONE;
  const total = D.anticipate + D.air + D.land;
  if (t < 0 || t >= total) return false;
  if (t < D.anticipate) {
    out.sy *= 1 - (1 - D.squashDown) * Math.sin((Math.PI / 2) * (t / D.anticipate));
  } else if (t < D.anticipate + D.air) {
    const u = (t - D.anticipate) / D.air;
    out.y += D.height * 4 * u * (1 - u);
    // stretch on the way up, settle toward 1 at the apex, stretch again falling
    out.sy *= 1 + 0.08 * Math.cos(Math.PI * u) * Math.cos(Math.PI * u);
  } else {
    const u = (t - D.anticipate - D.air) / D.land;
    out.sy *= 1 - (1 - D.landSquash) * Math.sin(Math.PI * u);
  }
  return true;
}

/** Duration of the done hop (s). */
export const DONE_TOTAL = BOT_DONE.anticipate + BOT_DONE.air + BOT_DONE.land;

/** Phase of a look swap: before the swap instant (`swapped` false) the bot squashes, after it pops back. */
export function swapScale(t: number): { sy: number; swapped: boolean; done: boolean } {
  const S = BOT_SWAP;
  if (t < S.squashS) {
    const u = t / S.squashS;
    return { sy: 1 - (1 - S.squashY) * smooth(u), swapped: false, done: false };
  }
  const e = t - S.squashS;
  if (e >= S.popS) return { sy: 1, swapped: true, done: true };
  // spring from the squashed pose to 1 with overshoot (springIn runs 0 -> 1)
  const s = springIn(e, S.pop.k, S.pop.c);
  return { sy: S.squashY + (1 - S.squashY) * s, swapped: true, done: false };
}
