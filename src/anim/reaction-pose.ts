import { DEG, TAU } from '../core/math/index.ts';
import { stepSpring, type SpringState } from '../core/math/spring.ts';
import { REACTION, type ReactionSpec } from '../content/anim.ts';

/**
 * Pure reaction maths (ARCHITECTURE §5 "Anim"): one scalar spring (k, c from content) drives the
 * pose of the clicked instance. No three import — unit-testable, and a pure function of the
 * accumulated engine time, so capture mode replays a reaction exactly.
 */
export interface Pose {
  /** Local scale of the instance's up axis / its horizontal axes (volume kept: xz = 1/√y). */
  sy: number;
  sxz: number;
  /** World-space lift of the whole instance (u, before instance scale). */
  lift: number;
  /** Extra yaw about the instance's up axis (rad). */
  yaw: number;
  /** Lean about the horizontal axis chosen at click time (rad). */
  tilt: number;
}

export interface ReactionState {
  spec: ReactionSpec;
  /** Seconds since the click. */
  t: number;
  /** Main spring (squash depth / spin remainder / wobble lean). */
  s: SpringState;
  /** Landing-squash spring (hop, emote). */
  land: SpringState;
  landed: number;
  done: boolean;
  pose: Pose;
}

export function startReaction(spec: ReactionSpec, st?: ReactionState): ReactionState {
  const s: SpringState =
    spec.motion === 'squash'
      ? { x: 0, v: spec.kick ?? 0 }
      : spec.motion === 'spin' || spec.motion === 'wobble'
        ? { x: 1, v: 0 }
        : { x: 0, v: 0 };
  const r: ReactionState = st ?? {
    spec,
    t: 0,
    s,
    land: { x: 0, v: 0 },
    landed: 0,
    done: false,
    pose: { sy: 1, sxz: 1, lift: 0, yaw: 0, tilt: 0 },
  };
  r.spec = spec;
  r.t = 0;
  r.s = s;
  r.land = { x: 0, v: 0 };
  r.landed = 0;
  r.done = false;
  return r;
}

const volume = (sy: number): number => 1 / Math.sqrt(sy);
const resting = (s: SpringState, ex = 0.01, ev = 0.05): boolean =>
  Math.abs(s.x) < ex && Math.abs(s.v) < ev;
const arc = (u: number): number => 4 * u * (1 - u);

/** Advance `dt` s and update `r.pose`. */
export function stepReaction(r: ReactionState, dt: number): Pose {
  const d = Math.min(dt, 0.1);
  r.t += d;
  const sp = r.spec;
  const k = sp.k ?? REACTION.spring.k;
  const c = sp.c ?? REACTION.spring.c;
  const p = r.pose;
  p.sy = 1;
  p.lift = 0;
  p.yaw = 0;
  p.tilt = 0;
  switch (sp.motion) {
    case 'squash': {
      const down = REACTION.squashDown;
      if (r.t < down) {
        // anticipation: ease down into the squash (bible: 100–120 ms), then release with a kick
        const u = r.t / down;
        r.s.x = u * u * (3 - 2 * u);
        r.s.v = sp.kick ?? 0;
      } else {
        stepSpring(r.s, 0, k, c, r.t - down < d ? r.t - down : d);
      }
      const x = r.s.x;
      p.sy = 1 - x * (x > 0 ? (sp.squash ?? 0.15) : (sp.stretch ?? 0.12));
      r.done = resting(r.s);
      break;
    }
    case 'hop':
    case 'emote': {
      const dur = sp.duration ?? 0.32;
      const count = sp.motion === 'emote' ? 1 : (sp.count ?? 1);
      const n = Math.min(count, Math.floor(r.t / dur));
      while (r.landed < n) {
        r.landed++;
        r.land.x = 1;
        r.land.v = 0;
      }
      stepSpring(r.land, 0, k, c, d);
      const airborne = r.landed < count;
      const u = airborne ? (r.t - r.landed * dur) / dur : 0;
      p.lift = airborne ? (sp.height ?? 0.3) * arc(u) : 0;
      // stretch in the air, squash on landing
      p.sy = 1 + (airborne ? 0.08 * Math.sin(Math.PI * u) : 0) - 0.12 * r.land.x;
      if (sp.motion === 'emote') {
        p.yaw = (sp.deg ?? 12) * DEG * Math.sin(TAU * 3 * r.t) * Math.exp(-r.t * 4.5);
        r.done = r.t > 0.9;
      } else {
        r.done = !airborne && resting(r.land);
      }
      break;
    }
    case 'spin': {
      stepSpring(r.s, 0, k, c, d);
      const dur = sp.duration ?? 0.45;
      p.yaw = TAU * (sp.turns ?? 1) * (1 - r.s.x);
      p.lift = (sp.height ?? 0.1) * Math.sin(Math.PI * Math.min(r.t / dur, 1));
      r.done = r.t > dur && resting(r.s);
      break;
    }
    case 'wobble': {
      stepSpring(r.s, 0, k, c, d);
      p.tilt = (sp.deg ?? 8) * DEG * r.s.x;
      r.done = resting(r.s, 0.02, 0.2);
      break;
    }
  }
  if (r.t >= REACTION.maxSeconds) r.done = true;
  p.sxz = volume(p.sy);
  return p;
}
