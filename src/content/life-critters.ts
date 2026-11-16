/**
 * Theme creatures, first wave (TASK-332; ART_BIBLE §7 rows 16 and 27): ducks on the Coding reflecting
 * pool and day butterflies over the Design flowers. Data only.
 */

import { Zone } from '../world/types.ts';

export const DUCKS = {
  /** Zoom tier from which the family is alive (bloom-in like the other land critters). */
  minTier: 2,
  /** Instance size multiplier (chunky-cute, like LAND.size). */
  size: 1.9,
  /** Surface of the pool above the terrain height of its centre, u. */
  surface: 0.05,
  /** Orbit: fraction of the pool half-extents (long axis, short axis) the leader paddles on. */
  orbit: [0.5, 0.42] as const,
  /** Radius wobble ±fraction of the orbit and its angular rate (× the orbit angle). */
  wobble: 0.1,
  wobbleRate: 2.3,
  /** Leader speed along the orbit, u/s, and the angle each follower lags behind the one ahead, rad. */
  speed: 0.55,
  follow: 0.62,
  /** Ducklings are this fraction of the mother's size. */
  duckling: 0.62,
  /** Paddle bob period (s) and the lag between neighbours (fraction of a period, "0.25 s out of phase"). */
  paddle: 1,
  bobLag: 0.25,
  bobAmp: 0.025,
  rollAmp: 0.06,
  /** Head dip (dabble): mean gap and length of one dip, s; per-duck phase. */
  dabble: [7, 1.4] as const,
  pickRadius: 0.5,
  pickHeight: 0.2,
  tints: { mother: '#FFF4D2', duckling: '#FFE06A' },
} as const;

export const BUTTERFLIES = {
  /** Zoom tier from which they fly. */
  minTier: 2,
  /** Daylight window of `night`: full below `day[0]`, gone at `day[1]`. */
  day: [0.3, 0.5] as const,
  /** Butterflies per flower site; a site needs `minFlowers` flower props within `siteRadius` u of its centre. */
  perSite: 3,
  siteRadius: 3.5,
  minFlowers: 5,
  minSeparation: 7,
  /** Candidate flower props examined when ranking sites. */
  candidates: 240,
  /** Instance size (the model's wingspan is about 0.7 u). */
  size: 2.1,
  /** Figure-8 half-extents along the two axes (u), period (s) and height above the ground (u). */
  extentX: [1.1, 2.0] as const,
  extentZ: [0.7, 1.3] as const,
  period: [8, 12] as const,
  height: [0.6, 1.2] as const,
  /** Slow drift of the figure's centre: radius (u) and period (s). */
  drift: [0.8, 31] as const,
  bob: 0.14,
  /** Wing beat in Hz and the narrowest wing squash (fraction of the open span). */
  flapHz: [4.2, 5.4] as const,
  flapMin: 0.18,
  /** Reduced motion: the beat rate fraction. */
  calmFlap: 0.35,
  /** Per-butterfly wing tints (white vertices take the instance tint). */
  tints: ['#FF7FB0', '#FFC93C', '#A98BFF', '#FF8A3D', '#6FC8FF', '#FFFFFF'] as const,
  /** Roll into turns, rad. */
  bank: 0.35,
} as const;

/**
 * Puffins on the Marketing cliff ledges (TASK-332, second wave): a small colony on the flat shelves
 * above the sea. Each bird cycles through idle bobs, a waddle to a neighbour and back, and a short
 * flight loop out over the water; the cycle length is jittered per bird so the colony never syncs.
 */
export const PUFFINS = {
  /** Zoom tier from which they are alive. */
  minTier: 2,
  /** Instance size (the model stands about 0.55 u tall). */
  size: 1.8,
  theme: 'marketing',
  /** Ledge ground: height above the sea (u), flatness (slope) and how far the water must be (u, any direction). */
  ledge: { minY: 2.4, maxY: 14, maxSlope: 0.2, minSea: 1.8, maxSea: 4.5 },
  /** Bare ground a colony stands on (rock / cliff / sand zones), not lawn or a fairground. */
  ground: [Zone.rock, Zone.cliff, Zone.sandDry, Zone.sandWet, Zone.sandBlack] as readonly number[],
  /** Grid step of the ledge search (u) and clearances from props / fixtures / paths / lot edges (u). */
  step: 1,
  clear: { prop: 1.0, fixture: 1.5, path: 1.4, lot: 1.2, anchor: 6 },
  /** The colony: spots within `radius` u of its centre, at least `separation` u apart. */
  radius: 4.5,
  separation: 1.1,
  jitter: 0.3,
  minBirds: 3,
  /** Action cycle length (s) per bird, and the share of cycles that are a flight / a waddle. */
  cycle: [20, 30] as const,
  flightShare: 0.3,
  waddleShare: 0.35,
  /** Idle: breathing squash, head-nod pitch (rad) and period (s), glance yaw (rad) and period (s). */
  breath: 0.035,
  nod: [0.12, 2.6] as const,
  glance: [0.45, 9] as const,
  /** Waddle: speed (u/s), pause at the far end (s), stride length (u), body roll (rad), hop height (u). */
  waddle: { speed: 0.55, pause: 2.5, stride: 0.22, roll: 0.14, hop: 0.03, reach: 1.4 },
  /** Flight: duration (s), seaward reach / sideways sweep / peak height (u), wing flutter (Hz). */
  flight: {
    time: 7,
    reach: [5, 8] as const,
    sweep: [1.5, 3] as const,
    lift: [1.5, 2.6] as const,
    hz: 7,
  },
  tints: { back: '#26262E', belly: '#FFFFFF' },
} as const;
