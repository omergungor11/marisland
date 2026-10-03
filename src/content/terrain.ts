/**
 * Terrain look tunables (ART_BIBLE §1 faceting, §2 palette). Pure data — the
 * mesher (render/terrain) reads these; hex values come from the palette.
 */
import { CLIFF_STRATA, EMISSIVE, GRASS, HAY, ROCK, SAND, WATER } from './palette.ts';

export const TERRAIN_COLORS = {
  sandDry: SAND.dry,
  sandWet: SAND.wet,
  sandBlack: SAND.black,
  /** Grass by height band: [beach, mid, hill]; crests lerp toward `tip`. */
  grassBands: [GRASS[3], GRASS[2], GRASS[1]] as const,
  grassTip: GRASS[0],
  /** Meadow = grass lerped toward this by `meadowMix` (lighter / yellower). */
  meadowTint: GRASS[0],
  meadowMix: 0.3,
  /** Forest floor = GRASS[3] × this. */
  forest: GRASS[3],
  forestDarken: 0.9,
  field: HAY,
  fieldMix: 0.45,
  /** Rock by slope: gentle → steep. */
  rock: [ROCK[0], ROCK[1], ROCK[2]] as const,
  cliffStrata: [CLIFF_STRATA[0], CLIFF_STRATA[1]] as const,
  path: '#D4C3A0',
  plaza: '#CDBFA6',
  crater: '#6A5F6B',
  /** Seabed below the wet-sand ramp; muted blue-grey so the shallow ring reads turquoise. */
  seabed: '#5C7E8E',
  /** Deep seabed (fades in toward −20 u). */
  seabedDeep: '#4D6E80',
} as const;

/** Debug semantic mask colours (VISUAL_QA mask metrics). Output unlit, exact. */
export const TERRAIN_MASK = {
  land: '#50C878',
  wetSand: '#E3BE84',
  rock: '#8A909C',
  seabed: WATER.deep,
} as const;

export const TERRAIN_SHAPE = {
  /** Height band for grass colour ramp, as fraction of the island peak. */
  grassBandLow: 1.5,
  grassBandHighFrac: 0.65,
  /** Underwater ramp: wet sand down to `wetDepth`, seabed below `seabedDepth`, deep seabed at `deepDepth`. */
  wetDepth: 3,
  seabedDepth: 6,
  deepDepth: 20,
  /** Rock colour slope range (gradient magnitude). */
  rockSlope: [0.55, 1.4] as const,
  /** Cliff strata band thickness in u and band wobble amplitude. */
  strataBand: 2.5,
  strataWobble: 0.6,
  /** Crest lightening toward grass tip (0..1) at full convexity. */
  crestTip: 0.2,
  crestScale: 1.2,
} as const;

export const TERRAIN_JITTER = {
  /** ±HSL lightness (absolute, 0..1). */
  lightness: 0.03,
  /** ±hue in degrees. */
  hueDeg: 4,
} as const;

export const TERRAIN_AO = {
  /** Max darkening (fraction of lightness). ART_BIBLE: −15…−25 %. */
  max: 0.25,
  /** Concavity (u) giving full crease term. */
  creaseFull: 0.35,
  creaseWeight: 0.7,
  /** Horizon term: 8 directions × `steps` samples of `stepCells` grid cells. */
  steps: 3,
  stepCells: 1,
  horizonWeight: 0.8,
  /** Mean horizon elevation slope (rise/run) giving full horizon term. */
  horizonFull: 0.4,
  /** Shade leans cool: at full occlusion r −x, b +x (fraction of the darkening). */
  coolShift: 0.3,
  /** Sand takes only this fraction of the occlusion (open beaches stay bright). */
  sandScale: 0.35,
} as const;

export const TERRAIN_LOD = {
  /** Sample stride per LOD (×2 u). */
  strides: [1, 2] as const,
  /** Skirt depth below the lower edge vertex, u (+ half the edge height delta). */
  skirt: 2,
  /** Skirt top sits this far below the edge so it never z-fights the surface. */
  skirtInset: 0.15,
  /** Chunks whose every sample is below this are skipped (deep sea). */
  skipBelow: -35,
} as const;

export const TERRAIN_FX = {
  /** Fresnel rim strength × horizon colour (ART_BIBLE §3). */
  rim: 0.15,
  rimPower: 3,
  /** Caustics: brightening amount and depth range (u below 0). */
  caustic: 0.1,
  causticDepth: 14,
  /** Shore lap: period s, advance u, SDF band u. */
  lapPeriod: 4.5,
  lapAdvance: 0.8,
  lapBand: 1.2,
  lapWetMix: 0.75,
  /** Land never darker than this HSL lightness (ART_BIBLE §2, plus margin). */
  minLandL: 0.14,
} as const;

/**
 * Emberpeak crater glow (D5, ART_BIBLE §7 #22 "lava glow 3 s, emissive 0.7–1.0, lights the crater
 * rim at night"): an emissive term on the crater walls in the terrain shader (no light). Strongest
 * on the crater floor, 0 at the rim (`radius` u around the crater anchor); `day` + `night` × night.
 */
export const CRATER_GLOW = {
  color: EMISSIVE.lava,
  radius: 9,
  day: 0.05,
  night: 0.5,
  pulse: [0.7, 1.0] as const,
  period: 3,
} as const;
