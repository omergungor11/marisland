/** Animation catalog numbers (ART_BIBLE §6–§7). Data only. */
export const SWELL = { amplitude: 0.15, period: 7 } as const;
export const SHORE_LAP = { period: 4.5, advance: 0.8, wetLag: 0.6 } as const;
export const GUST = { speed: 6, wavelength: 40, strength: 1 } as const;
export const TREE_SWAY = { idlePeriod: 4, idleDeg: 2, gustDeg: 6, squash: 0.03 } as const;
export const PALM_SWAY = { period: 5, trunkDeg: 4, frondDeg: 10, frondLag: 0.3 } as const;
export const GRASS_SWAY = { period: 2.5, deg: 8 } as const;
/** Bloom-in spring (D-008: c=17 gives the bible's 8 % overshoot / 300 ms). */
export const BLOOM_IN = {
  k: 180,
  c: 17,
  staggerMs: 220,
  maxPerFrame: 40,
  ditherMs: 250,
  outMs: 140,
  outDitherMs: 200,
} as const;
export const CLICK_SQUASH = { k: 300, c: 14, squash: 0.85, stretch: 1.15 } as const;
export const BOAT_BOB = { period: 3.2, y: 0.12, rollDeg: 6, pitchDeg: 3, rollLag: 0.8 } as const;
export const CLOUDS = {
  count: [6, 10],
  altitude: [60, 90],
  width: [12, 30],
  drift: 1.5,
  shadowMul: 0.82,
  shadowBlur: 6,
} as const;
export const WINDMILL = { secondsPerRev: 6 } as const;
export const BEACON = {
  secondsPerRev: 8,
  coneLength: 40,
  opacity: 0.35,
  onHours: [18.5, 6.5],
} as const;
export const WINDOWS = {
  onFrom: 18.75,
  onTo: 19.5,
  offAt: 23,
  offFraction: 0.3,
  flicker: [0.2, 0.5],
  flickerAmp: 0.08,
} as const;
export const FIREFLIES = { from: 19.5, to: 4, blink: [1.5, 3], drift: 0.5 } as const;
