import { WATER } from './palette.ts';

/**
 * Waterfalls off the bluff lips (M17b "Concept Archipelago", TASK-395). Data only:
 * world/gen/waterfalls.ts places them, render/waterfalls.ts builds the ribbons + foam discs on
 * the lit program (`aSpin.w` = −SURFACE.flow) and the mist puffs. Colours come from the palette.
 */
export const WATERFALLS = {
  /** Falls per bluff island (inclusive range, one roll per island from its own rng fork). */
  count: [1, 3] as const,
  /** Lip: a non-cliff land cell this high (u) next to a cliff cell, within `lipSdf` u of the shore. */
  minDrop: 3.5,
  lipSdf: 10,
  /** The fall must reach water (terrain < −`baseDepth` u) within `maxRun` u of the lip. */
  maxRun: 12,
  baseDepth: 0.15,
  /** Steepness drop / run of the face (bluff walls are ~1.5; ramps and dunes stay below). */
  minSteep: 0.6,
  /** Cove factor (heightfield `coveness`) above this = harbour beach, no falls. */
  maxCove: 0.25,
  /** Keep-out distances (u): dock root / end, lot edge, landmark, fixture. */
  avoid: { dock: 16, lot: 7, landmark: 10, fixture: 4 },
  /** Two falls on one island stand at least this far apart (u). */
  spacing: 28,
  /**
   * Score = height · lipH + valley · concavity (u; the lip lower than its neighbours `valleyReach`
   * u along the rim, also measured `valleyInland` u inland) + stream (a carved stream ends within
   * `streamReach` u) + jitter · rng.
   */
  score: { height: 0.25, valley: 1.2, stream: 4, jitter: 0.6 },
  valleyReach: 6,
  valleyInland: 8,
  streamReach: 12,
  /** Ribbon width range (u); a stream-fed fall takes the top of the range. */
  width: [2.6, 3.6] as const,
} as const;

/** Look of the falls (render/waterfalls.ts + the flow branch in materials/activity-glsl.ts). */
export const WATERFALL_LOOK = {
  /** The channel starts this many u inland of the lip and hovers `lift` u over the ground. */
  inland: 2.2,
  lift: 0.2,
  /** Gap (u) between the falling sheet and the wall, along the sheet normal (no z-fight). */
  gap: 0.35,
  /** Ballistic throw off the rim: y drops `throwK` · s² (s = u past the rim). */
  throwK: 0.9,
  /** The sheet widens by this factor toward the water; convex bulge (u) across it. */
  spread: 1.35,
  bulge: 0.18,
  /** Rows along the sheet (arc-length resampled), columns across. */
  rows: 18,
  cols: 4,
  /** Foam disc on the water: radius = width · `radius` + `pad` u, `y` u over sea level. */
  foam: { radius: 0.9, pad: 1.4, y: 0.12, rings: 3, segments: 18 },
  /**
   * Flow: speed (u/s along the sheet), streak spacing (u), lanes across, white streak length
   * (fraction of the spacing), edge wobble (fraction of the half width), rounded head length (u),
   * white share of the averaged sheet once the streaks shrink below a pixel (T0 / T1).
   */
  flow: { speed: 3.2, spacing: 3, lanes: 6, white: 0.75, edge: 0.22, cap: 1.2, farWhite: 0.45 },
  /** Foam rings: expansion speed (u/s), spacing (u), solid core (fraction of the radius). */
  ring: { speed: 0.9, spacing: 0.9, core: 0.35 },
  colors: { water: WATER.shallow, light: WATER.lagoon, foam: WATER.foam },
  /** Mist puffs at the foot (puff emitters, PUFFS.mist sizes) per fall. */
  mistEmitters: { low: 1, medium: 1, high: 2 },
} as const;
