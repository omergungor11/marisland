/**
 * Coding M33 motion numbers (TASK-545, D-124): the Bot Foundry's indexing line, the bots that hop off it,
 * the test track's first-step bots, the tethered cloud, pod steam and the pavilion glow. Closed form in
 * the sim time: render/foundry-motion.ts, meshes render/foundry-movers.ts, steam / glow scenes
 * render/culture-movers.ts. Times in s, lengths in u, angles in rad unless named.
 */
import { BOT_SCALE as S, CODING_M33 as K } from './coding-m33.ts';

/** Bot-frame heights (feet at 0) of what an arm carries: the socket tops (geo/themes/coding-m33.ts). */
const BODY_TOP = 0.56 * S;
const HEAD_TOP = 0.97 * S;
/** Belt top over the ground (the slats' hook y). */
const BELT_Y = K.conveyor.beltY + 0.014;
/** The arm stands on this plinth (TASK-545): tall enough for the claw to clear a bot's head. */
const PLINTH = 0.4;
/** Claw tips over the arm's ground at lift 0. */
const CLAW_Y = PLINTH + K.arm.gripY - 0.14;

export const CODING_FOUNDRY_MOTION = {
  /** Per quality: site gate (u from the yard), LOD0 inside `lod0`, walkers' route, first-step bots. */
  plan: {
    low: { range: 90, lod0: 0, fadeNear: 70, fadeFar: 90, walkLen: 8, trackBots: 1 },
    medium: { range: 120, lod0: 42, fadeNear: 96, fadeFar: 120, walkLen: 34, trackBots: 3 },
    high: { range: 150, lod0: 60, fadeNear: 120, fadeFar: 150, walkLen: 34, trackBots: 4 },
  },
  line: {
    /** One index: the belt moves one station pitch, then stands while the arms work. */
    period: 5,
    move: 1.3,
    beltY: BELT_Y,
    /** Belt-stop settle and part-landing press: squash share, decay /s, rad/s. */
    settle: { amt: 0.05, decay: 6, freq: 20 },
    /** The arms never move in sync: per-station lag. */
    armLag: 0.14,
  },
  arm: {
    plinth: PLINTH,
    /** Times inside the arm's period: pick (part appears), swing out, part let go, swing back, down. */
    pickAt: 0.3,
    swingOut: [0.65, 1.85] as const,
    releaseAt: 2.4,
    swingBack: [2.8, 4.0] as const,
    /** Riser travel on the way up from the crate and on the way down to it. */
    raise: [0.4, 0.9] as const,
    lower: [4.0, 4.6] as const,
    /** Dip when pressing the part home, over the last `dipFor` s before the release. */
    dip: 0.06,
    dipFor: 0.35,
    /** Overshoot of the swing past each end (share of the half turn), its decay. */
    overshoot: 0.03,
    /** Lift (u) with the part placed, per station: its top meets the socket (body, head, antenna). */
    lift: [
      BELT_Y + BODY_TOP - CLAW_Y,
      BELT_Y + HEAD_TOP - CLAW_Y,
      BELT_Y + HEAD_TOP + 0.02 - CLAW_Y,
    ] as const,
    /** Part frame = a bot's: its top in that frame, hung under the claw tips. */
    partTop: [BODY_TOP, HEAD_TOP, HEAD_TOP + 0.02] as const,
    clawY: CLAW_Y,
    /** Part pop while it leaves the crate. */
    popFor: 0.18,
  },
  hop: {
    /** After the bot stops at the belt end: wait, crouch, in the air; landing squash decay. */
    wait: 0.35,
    crouch: 0.22,
    air: 0.75,
    height: 0.75,
    squash: 0.12,
    /** Looks round on the landing before it walks. */
    stand: 0.5,
    /** Landing past the belt's end (the site's `exit` anchor, for tests). */
    exitU: K.conveyor.ramp + 0.9,
  },
  walk: {
    /** The new bot joins the pool's pace: spacing along the path = speed × line period. */
    speed: 0.95,
    /** One hop step: seconds, height; roll per step (rad). */
    step: 0.34,
    stepH: 0.09,
    roll: 0.07,
    /** Route resample (u), corners cut by Chaikin passes. */
    sample: 1,
    /** Yard side lanes off the belt's axis: past the crates on the arms' side, on the free side. */
    laneArms: 4.2,
    laneFree: 2.6,
    /** A footpath end this near the route's end carries it on. */
    pathNear: 0.6,
    /** Shrinks away at the route's end (the illusion's hand-off to the agent pool). */
    outFor: 0.45,
  },
  track: {
    /** botCourse variant of each station in walking order (cones, steps, bridge, ramp). */
    order: [2, 0, 3, 1] as const,
    /** Side lane offset of the walk back, off the course's axis. */
    returnV: 1.38,
    /** A first-step bot's pace, per lap phase jitter. */
    speed: 0.62,
    speedReturn: 0.95,
    step: 0.42,
    stepH: 0.06,
    roll: 0.13,
    /** Hop over a rise (u per u of course) and the cheer at the course's end. */
    cheer: { height: 0.55, length: 1.2 },
    /** Slalom swing off the cones (geo: cones at ±0.32). */
    slalom: 0.42,
  },
  /** The tethered cloud: slow tilts about its anchor (deg), two periods, drawn far (T0 by size). */
  cloud: {
    deg: [2.4, 1.7] as const,
    periods: [11, 17] as const,
    yawDeg: 6,
    yawPeriod: 29,
    range: { low: 320, medium: 520, high: 620 },
  },
  /** Cooling steam of a server pod (soft puffs). */
  steam: {
    /** The pod's `steam` hook. */
    at: [-0.45, K.pod.h + 0.62, -0.1] as const,
    n: 4,
    life: 3.4,
    rise: 2.2,
    drift: 0.9,
    size: [0.32, 1.1] as const,
    opacity: 0.62,
    /** Unlit puffs read as dark smoke against the night sky: thin them out. */
    opacityNight: 0.16,
    edge: 0.55,
    range: 80,
  },
  /** The quantum pavilion's core and the sparks orbiting it: dim by day, full at night. */
  glow: {
    color: '#7FD4FF',
    gold: '#FFD76A',
    /** The pavilion's `glow` hook. */
    at: [0, 1.08, 0] as const,
    core: { base: 0.17, r: 1.05, night: 1.3, pulse: 0.1, period: 3.7 },
    sparks: { n: 3, r: 0.48, size: 0.055, sizeNight: 0.085, period: 5.3, y: 0.62, bob: 0.22 },
    range: 150,
  },
} as const;
