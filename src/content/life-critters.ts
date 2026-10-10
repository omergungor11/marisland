/**
 * Theme creatures, first wave (TASK-332; ART_BIBLE §7 rows 16 and 27): ducks on the Coding reflecting
 * pool and day butterflies over the Design flowers. Data only.
 */

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
