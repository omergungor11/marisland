/**
 * World signature numbers (M23 TASK-490, D-064, WORLD_PLAN B1 / B6 / G7): the three things that turn
 * the 21:00 Launch Day Relay into a night scene of the whole archipelago. Pure data; the engine reads it
 * (render/night/beacons.ts, render/culture-movers.ts, render/particles/fireworks.ts, world/gen/beacons.ts).
 * Times are real seconds on the culture clock (rhythm.ts: 1 game hour = 25 s), so a frozen capture at
 * `time=21&simt=T` replays them exactly.
 */
import type { ThemeId } from '../world/types.ts';

/**
 * `W:B1` beacon network: mini lighthouses on the skerries (placed by the scatter, one per picked
 * skerry) plus the Marketing lighthouse. All turn at BEAM.secondsPerRev (8 s); each one lags the
 * previous by `stepS` in route order (distance from the HQ), so a wave of light runs around the sea.
 */
export const BEACON_NET = {
  /** Skerries that carry a mini lighthouse (at most; fewer skerries = fewer towers). */
  skerries: 3,
  /** Mini lighthouse (u): shaft height and the lamp centre above its pivot. */
  tower: { height: 4.6, lampY: 5.3, rBase: 0.92, rTop: 0.62 },
  /** Phase lag per route-order rank (s). */
  stepS: 1,
  /** Mini beam: scale of the lighthouse beam (length 40 u → ×), opacity ×, flare ×. */
  beam: { scale: 1, opacity: 1, flare: 0.8 },
  /** Camera distance band (u) over which each beam fades out: gone past the second value. */
  fade: [380, 500] as const,
} as const;

/**
 * `W:B6` signal chain: a lamp on each island's highest point. At the relay each island, in step order,
 * sends `flashes` flashes toward the next island (the last one toward the HQ); the HQ lamp is the
 * semaphore's own. The mast + ball + the ray are culture-mover parts (no new program).
 */
export const SIGNAL_CHAIN = {
  /** Mast height above the peak ground (u) and lamp ball radius at rest. */
  mast: 3.8,
  lampR: 0.34,
  /** Night rest glow: ball radius × and the env.night band it fades in over. */
  rest: { r: 0.7, night: [0.55, 0.9] as const },
  flashes: 3,
  /** Into the island's 10 s step: first flash, pitch between flashes, length of one (s), attack share. */
  firstS: 1,
  gapS: 2,
  flashS: 1,
  attack: 0.15,
  /** Flash lamp radius (u) and the ray (a glowing bar toward the next island): length, radius. */
  flashR: 1.15,
  ray: { length: 90, r: 0.55 },
  /**
   * Readable from afar: sizes never fall below this share of the camera distance (ball / flash ball ×
   * `flashPx` / ray radius × `rayPx`), capped at `maxPx` u.
   */
  minScreen: 0.0035,
  flashPx: 2.4,
  rayPx: 0.45,
  maxPx: 2.6,
  /** Accent mixed toward white (0..1) so the flash reads as light, not paint. */
  lighten: 0.4,
  /** Camera distance (u) within which the lamps are drawn (the chain reads from the T0 postcard). */
  range: 1100,
} as const;

/**
 * `W:G7` fireworks: after the relay's 7th step ends (and the Comet Night with it) the HQ harbour fires
 * `bursts` shells for `lengthS` s, in culture accent colours, with a spark glitter on the water.
 * Start = `hour` + `afterS` on the culture clock (22:00 + the 60 s Comet Night = relay end + fade).
 */
export const FIREWORKS = {
  start: { hour: 22, afterS: 60 },
  lengthS: 20,
  /** Shell k colour = the accent of this culture (6 bursts, HQ's own gold is the rocket trail). */
  themes: ['devops', 'qa', 'coding', 'marketing', 'design', 'research'] as readonly ThemeId[],
  /** Show second each shell bursts: three opening shells 3 s apart, then a finale of three close together. */
  times: [1.2, 4, 7, 12.2, 13.4, 14.6] as readonly number[],
  /** Rocket from the pier head: climb time (s) and trail sparks. */
  rocket: { climbS: 1, trail: 5, trailGap: 0.06, size: [0.7, 0.9] as const },
  /** Burst height above the water (u) and where it hangs: out of the pier head and along the bay. */
  height: [36, 58] as const,
  out: [14, 40] as const,
  /** Ground under a shell must be at or below this (u); a spot on land moves `outStep` further out. */
  seaMax: -0.3,
  outStep: 6,
  along: [-34, 34] as const,
  /** Spark count per shell and quality; ring-glyph speed band (u/s, drag 2.5 → radius = v / 2.5). */
  sparks: { low: 48, medium: 150, high: 220 },
  speed: [24, 33] as const,
  size: [0.8, 1.3] as const,
  /** The flash at the moment of the burst: one big white sparkle, size (u) and life (s). */
  flash: { size: [9, 11] as const, life: [0.35, 0.45] as const },
  life: [2.2, 3.1] as const,
  /** White-ish core sparks share and the lighten of the accent for the rest. */
  coreShare: 0.18,
  /** Water glitter per shell and quality: sparks on the sea under the burst. */
  glint: {
    low: 8,
    medium: 26,
    high: 40,
    spread: 26,
    size: [1.3, 2.1] as const,
    life: [1.8, 2.8] as const,
    lag: 0.25,
    dim: 0.9,
  },
  /** Show particles never shrink below this share of the camera distance (readable from afar). */
  minScreenFrac: 0.0045,
  /** The show is cancelled in rain: faded out between these rain levels. */
  rainCut: [0.15, 0.4] as const,
  /** Show particles stay alive this long after the last shell (s). */
  tailS: 4,
  /** Pool: particles reserved per quality (burst + trail + glitter for every shell, with margin). */
  capacity: { low: 600, medium: 1800, high: 2800 },
} as const;
