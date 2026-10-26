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
  /**
   * Camera distance band (u) over which each beam fades out: gone past the second value (TASK-496:
   * was 380–500, which hid every beam from the postcard).
   */
  fade: [900, 1200] as const,
  /** Lamp flare floor: never smaller than this share of the camera distance (u / u). */
  flareMin: 0.006,
} as const;

/**
 * `W:B6` signal chain: a lamp on each island's highest point. At the relay each island, in step order,
 * sends `flashes` flashes toward the next island (the last one toward the HQ); the HQ lamp is the
 * semaphore's own. The mast + ball are culture-mover parts, the ray a beam-program mesh (no new program).
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
  /** Lamp ball radius × at the flash peak (the light itself is the beam's flare). */
  flashGrow: 0.6,
  /**
   * TASK-496 (D-074): the signal is a soft beam (the lighthouse beam program, one call while it
   * flashes) from the lamp to the next island's lamp. Each flash, its light front runs out and reaches
   * the next lamp at `reach` of the flash (eased), and the next lamp answers with a catch pop. Beam:
   * peak opacity, cross-section × of the 40 u cone, front softness (share of the length), flare radius
   * (u; × `flarePx` of the lamp's screen floor) and HDR intensity.
   */
  reach: 0.45,
  beam: { opacity: 0.6, width: 0.7, soft: 0.1, flare: 2.2, flarePx: 3, flareIntensity: 2.4 },
  /** Catch at the next lamp: radius (u / × px) and how long it fades (share of a flash). */
  catch: { r: 1.6, px: 2.2, fade: 0.5 },
  /**
   * Readable from afar: lamp sizes never fall below this share of the camera distance, capped at
   * `maxPx` u.
   */
  minScreen: 0.0035,
  maxPx: 2.6,
  /** Accent mixed toward white (0..1) so the flash reads as light, not paint. */
  lighten: 0.4,
  /** Camera distance (u) within which the lamps are drawn (the chain reads from the T0 postcard). */
  range: 1100,
} as const;

/**
 * `W:G7` fireworks: after the relay's 7th step ends (and the Comet Night with it) the HQ harbour fires
 * `bursts` shells for `lengthS` s, in culture accent colours, mirrored on the water.
 * Start = `hour` + `afterS` on the culture clock (22:00 + the 60 s Comet Night = relay end + fade).
 */
export const FIREWORKS = {
  start: { hour: 22, afterS: 60 },
  lengthS: 20,
  /** Shell k colour = the accent of this culture (6 bursts, HQ's own gold is the rocket trail). */
  themes: ['devops', 'qa', 'coding', 'marketing', 'design', 'research'] as readonly ThemeId[],
  /** Show second each shell bursts: three opening shells 3 s apart, then a finale of three close together. */
  times: [1.2, 4, 7, 12.2, 13.4, 14.6] as readonly number[],
  /**
   * Shell kind per shell (TASK-496, D-074): a peony (streaking sparks that hang, then sink) or a
   * willow (gold-tinted sparks sagging into long trails).
   */
  kinds: ['peony', 'willow', 'peony', 'willow', 'peony', 'peony'] as readonly (
    'peony' | 'willow'
  )[],
  /** Rocket from the pier head: climb time (s), its streak trail (s) and size (u). */
  rocket: { climbS: 1, trailS: 0.35, size: [1.1, 1.3] as const },
  /** Burst height above the water (u) and where it hangs: out of the pier head and along the bay. */
  height: [36, 58] as const,
  out: [14, 40] as const,
  /** Ground under a shell must be at or below this (u); a spot on land moves `outStep` further out. */
  seaMax: -0.3,
  outStep: 6,
  along: [-34, 34] as const,
  /** Spark count per shell and quality; speed band (u/s, drag 2.5 → radius = v / 2.5). */
  sparks: { low: 48, medium: 150, high: 220 },
  speed: [28, 38] as const,
  size: [0.9, 1.4] as const,
  life: [2.2, 3.1] as const,
  /** Peony sparks are streaks over the path of their last `trailS` s. */
  trailS: 0.3,
  /**
   * Willow shells: life, speed, spark size, spark count × of a peony, trail (s) and the share of the
   * HQ gold mixed into the accent.
   */
  willow: {
    life: [3.4, 4.2] as const,
    speed: [20, 27] as const,
    size: [0.55, 0.85] as const,
    share: 0.6,
    trailS: 0.6,
    gold: 0.55,
  },
  /** The flash at the moment of the burst: a white glow disc, size (u) and life (s). */
  flash: { size: [7, 8] as const, life: [0.25, 0.32] as const },
  /** White-ish core sparks share and the lighten of the accent for the rest. */
  coreShare: 0.18,
  /**
   * The sea reflection: per shell and quality, mirror sparks (each a shell spark seen in the sea under
   * the camera's eye, a vertical shimmer), size × of a spark, brightness ×.
   */
  mirror: { low: 14, medium: 48, high: 72, size: 1.7, dim: 0.55 },
  /** Show particles never shrink below this share of the camera distance (readable from afar). */
  minScreenFrac: 0.0045,
  /** The show is cancelled in rain: faded out between these rain levels. */
  rainCut: [0.15, 0.4] as const,
  /** Show particles stay alive this long after the last shell (s). */
  tailS: 4,
  /** Pool: particles reserved per quality (rocket + burst + flash + mirror for every shell, with margin). */
  capacity: { low: 600, medium: 1800, high: 2800 },
} as const;
