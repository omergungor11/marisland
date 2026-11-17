import type { BurstSpec } from './anim.ts';
import type { BotChassis } from './bot-look.ts';
import { WORKERS } from './life.ts';

/**
 * Bot motion (TASK-592, cute-motion skill). Data only: lengths in u, angles in rad, times in s.
 * Everything runs on the workers' fixed-step sim clock (or the engine clock for the line-up), so a
 * capture's `simt` fixes the pose; reduced motion scales the amplitudes by `motionScale`.
 */
const DEG = Math.PI / 180;

export interface ChassisGait {
  /** One footstep = half a leg cycle (s). */
  stepPeriod: number;
  /** Walk hop height (u) and squash share at foot-down. */
  hop: number;
  squash: number;
  /** Side roll amplitude (rad) in step with the feet. */
  roll: number;
  /** Forward lean while walking (rad, nose down), eased in with the walk. */
  lean: number;
  /** Smooth glide: hop follows sin^2 (no sharp foot-down) instead of |sin|. */
  glide: boolean;
}

export const BOT_GAIT: Record<BotChassis, ChassisGait> = {
  // the pre-592 bot: quick stepper
  scout: {
    stepPeriod: WORKERS.stepPeriod,
    hop: WORKERS.hop,
    squash: WORKERS.squash,
    roll: WORKERS.sway,
    lean: 0,
    glide: false,
  },
  // heavy waddle: slow wide steps, big side roll, low hop
  hauler: { stepPeriod: 0.55, hop: 0.05, squash: 0.05, roll: 6 * DEG, lean: 0, glide: false },
  // gliding: tiny hop, gentle forward lean
  spire: { stepPeriod: 0.45, hop: 0.04, squash: 0.02, roll: 1 * DEG, lean: 4 * DEG, glide: true },
};

export type BotBeat = 'stretch' | 'look' | 'tap' | 'wrist';
export const BOT_BEATS: readonly BotBeat[] = ['stretch', 'look', 'tap', 'wrist'];

/** Idle beats at a pause / desk: a new one every `every` s (hash(id) phase and jitter), each `len` s long. */
export const BOT_BEAT = {
  every: [5, 11] as const,
  /** First beat is due in [0, firstMax] s from spawn (hash), so neighbours never match. */
  firstMax: 6,
  len: { stretch: 1.3, look: 1.8, tap: 1.4, wrist: 1.5 } as Record<BotBeat, number>,
  /** Stretch: lean back (rad), arm raise, squash gain. */
  stretch: { pitch: 0.14, arm: 0.7, squash: 0.05 },
  /** Look around: head yaw sweep (rad) and a small look-up. */
  look: { yaw: 0.85, pitch: 0.05 },
  /** Foot tap: bounce (u) and side wiggle (rad), taps per beat. */
  tap: { bounce: 0.035, roll: 0.035, taps: 4 },
  /** Wrist check: arm half raised, head dips to look at it (rad). */
  wrist: { arm: 0.45, pitch: -0.13 },
  /** Ease in / out share of the beat (smoothstep). */
  edge: 0.2,
} as const;

/** Waiting gate: the bot tips its head up at the gem (pitch rad, ease rate 1/s); the gem pulses amber. */
export const BOT_GATE = {
  lookPitch: 0.3,
  lambda: 5,
  gem: { color: '#FFB224', period: 1.1, scale: 0.14, mix: 0.8 },
} as const;

const DONE_ANTICIPATE = 0.1;
const DONE_AIR = 0.46;

/** Session done: one hop (anticipation squash, arc, land squash) and a ring of 6 sparkles at the apex. */
export const BOT_DONE = {
  anticipate: DONE_ANTICIPATE,
  squashDown: 0.82,
  air: DONE_AIR,
  height: 0.42,
  land: 0.2,
  landSquash: 0.86,
  sparkles: {
    glyph: 'sparkle',
    count: 6,
    pattern: 'ring',
    colors: ['#FFF6C2', '#FFE08A'],
    size: [0.24, 0.32],
    life: [0.55, 0.75],
    speed: [1.2, 1.7],
    from: 'top',
    delay: DONE_ANTICIPATE + DONE_AIR * 0.5,
  } as BurstSpec,
} as const;

/** Chassis / look swap at rest: squash down, swap under a poof, pop back with overshoot. */
export const BOT_SWAP = {
  squashS: 0.16,
  squashY: 0.55,
  /** Spring-back (k, c): the usual pop (zeta about 0.5). */
  pop: { k: 220, c: 15 },
  popS: 0.5,
  poof: {
    glyph: 'puff',
    count: 8,
    pattern: 'ring',
    colors: ['#FFFFFF', '#F4EFE6'],
    size: [0.3, 0.45],
    life: [0.45, 0.65],
    speed: [0.9, 1.4],
    from: 'mid',
  } as BurstSpec,
} as const;

/** `aSeed` accessory code that matches no hat variant (0..6): the head is bare (line-up `hatless`). */
export const BOT_NO_HAT = 7;

/**
 * Line-up v2 (`?bots=<mode>`, TASK-677): QA bots standing on open ground (the empty gravel patch SW of the
 * Coding solar panels), facing a low front camera. Modes: `looks` = the nine looks in one row, `eyes` = the
 * five eye states on one look, `muster` = a loose crowd of fleet bots (F-bots), `lineup` = the old
 * 9 looks x 5 eye states grid (retired shot id F-bot-lineup, URL kept). `hatless` drops the department hat so
 * the heads read.
 */
export const BOT_LINEUP = {
  island: 'coding',
  /** Centre offset from the settlement plaza (u): the paved lawn E of the Coding reflecting pool (TASK-690: the old gravel patch W of the solar field gained a turbine, tent and posts; picked by scanning props, fixtures, lots, districts and paths for a clear box on seed 1001). */
  offset: { x: -22.5, z: -2 },
  /** Roles worn by the nine looks (column order), '' = none. */
  roles: [
    'shader',
    'engine',
    'worldgen',
    'props',
    'life',
    'qa',
    'devops',
    'docs',
    '',
  ] as readonly string[],
  /** Idle breathing bob (u, s) and the done-row hop period (s). */
  bob: { y: 0.02, period: 2.6 },
  doneHopEvery: 3.2,
  modes: {
    lineup: { cols: 9, rows: 5, gapX: 1.8, gapZ: 2.3, hatless: true, jitter: 0 },
    looks: { cols: 9, rows: 1, gapX: 1.2, gapZ: 1, hatless: true, jitter: 0 },
    eyes: { cols: 5, rows: 1, gapX: 1.5, gapZ: 1, hatless: true, jitter: 0 },
    pair: { cols: 3, rows: 1, gapX: 4.4, gapZ: 1, hatless: true, jitter: 0 },
    muster: { cols: 5, rows: 3, gapX: 2.1, gapZ: 2.2, hatless: false, jitter: 0.4 },
  },
  /** `pair` mode: look code (chassis * 3 + head) per column, one per chassis; each gets its panel portrait beside it. */
  pairLooks: [0, 4, 8],
  /** `pair` portrait: world offset right of the bot (u) and the share of the bot's screen height it is drawn at. */
  pairPortrait: { dx: 1.75, scale: 1.05 },
  /** Look shown by every bot of the `eyes` mode (chassis index, head index = scout / monitor: the flat face). */
  eyesLook: { chassis: 0, head: 0 },
} as const;
export type BotLineupMode = keyof typeof BOT_LINEUP.modes;
