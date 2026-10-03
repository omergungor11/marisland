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
  width: [22, 44],
  drift: 1.5,
  shadowMul: 0.82,
  shadowBlur: 6,
  /** Periodic cloud field (TASK-153): `cells`² jittered candidate cells per `tile` u square,
   *  centred on the archipelago → every tile-sized window holds exactly `count` clouds. */
  tile: 720,
  cells: 4,
  /** Cell jitter range (fraction of a cell) — keeps neighbours ≥ 0.4 cell apart. */
  jitter: [0.2, 0.8],
  /** Footprint ellipse depth / length (geometry is normalised to this). */
  aspect: 0.55,
  /** Shadow ellipse half-length as a fraction of half the cloud width. */
  shadowFit: 0.92,
  /** Edge-wobble amplitude of the shadow outline, u (2 octaves of value noise). */
  wobble: 3,
  /** Clouds scale to 0 within this distance of the tile edge (wrap point). */
  edgeFade: 70,
  /** Sun elevation clamp for the projected shadow offset (sin of elevation). */
  minSunY: 0.3,
  /** Cloud shadows per quality (≈ 4 hashes per active cell per terrain/water/prop fragment). */
  shadowOn: { low: true, medium: true, high: true },
  /** Breathing: scale ±amp over period s. */
  breathe: { amp: 0.025, period: 9 },
  /** Fade to 0 when the zoom tier reaches `hideTier`, over `fade` s. */
  hideTier: 2,
  fade: 0.5,
} as const;
/** Smoke and steam puffs (ART_BIBLE §7 #20/#21; stateless GPU, ARCHITECTURE §5). Sizes are diameters, u. */
export const PUFFS = {
  chimney: { spawn: 1.2, slots: 3, size: [0.2, 0.9], rise: 4, drift: 2, jitter: 0.15 },
  steam: { spawn: 0.6, slots: 12, size: [2, 8], rise: 25, drift: 14, jitter: 1.2 },
  spring: { spawn: 0.8, slots: 5, size: [0.6, 2.4], rise: 5, drift: 1.5, jitter: 0.4 },
  /** Ring-puff burp on steam emitters every `period` s. */
  burp: { period: 40, ring: 7, life: 3.5, radius: 7, rise: 6, size: [3, 6.5], pulse: 1.5 },
  /** Fraction of a puff's life spent fading (dither) at the end. */
  fadeLast: 0.4,
  capacity: { low: 240, medium: 600, high: 900 },
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
