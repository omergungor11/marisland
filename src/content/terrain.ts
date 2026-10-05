/**
 * Terrain look tunables (ART_BIBLE §1 faceting, §2 palette). Pure data — the
 * mesher (render/terrain) reads these; hex values come from the palette.
 */
import { CLIFF_STRATA, EMISSIVE, FIELDS, GRASS, HAY, ROCK, SAND, WATER } from './palette.ts';

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
  /** Patchwork hues by world.fieldColor (1 + index); `field` when a cell has none. */
  fields: FIELDS,
  /** Field = grass lerped toward its patch hue by this (strong enough to read at T1). */
  fieldMix: 0.8,
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

/**
 * Cliff facets (M14b risk #1, TASK-371): on steep ground the shading normal blends to the flat
 * normal of the 2 u grid triangle under the fragment (independent of the mesh level, so no LOD
 * pop), keeping cliffs carved while hills stay smooth. `ny` = facet normal y: smooth above
 * ny[1], fully faceted below ny[0].
 */
export const TERRAIN_FACETS = {
  ny: [0.55, 0.75] as const,
} as const;

/**
 * Distance LOD (M14b D-030, TASK-371). Chunks pick a mesh level by camera distance (u, to the
 * chunk's bounding box), not by tier. The world grid stays 2 u; every level samples the smooth
 * Catmull-Rom surface (shared/terrain-sample.ts).
 */
export const TERRAIN_LOD = {
  /** Mesh stride per level in u, coarse → fine. */
  strides: [4, 2, 1, 0.5] as const,
  /** bands[k]: distance below which level k + 1 replaces level k (4 u ≥ 300, 2 u ≥ 120, 1 u ≥ 40). */
  bands: [300, 120, 40] as const,
  /** Switch finer below band × (1 − h), coarser above band × (1 + h). */
  hysteresis: 0.1,
  /**
   * Geomorph: odd vertices of level k blend to level k − 1 over this fraction of the band's
   * length, ending at band × (1 − h), so a level switch never moves a vertex.
   */
  morph: 0.2,
  /** Finest level per quality: low 2 u, medium 1 u, high 0.5 u. */
  finest: { low: 1, medium: 2, high: 3 } as const,
  /** At most this many chunks at 0.5 u (the nearest win). */
  finestMaxChunks: 9,
  /** Interactive: a level is built ahead once the chunk is within band × (1 + prefetch). */
  prefetch: 0.35,
  /**
   * Cached chunk meshes per level (LRU; levels 0–1 are never evicted, nor a level drawn or wanted
   * this frame). 0.5 u: a 64 u chunk box within 36 u of the camera → at most 4 drawn.
   */
  cache: [Infinity, Infinity, 20, 6] as const,
  /** Interactive level builds per frame (capture builds synchronously). */
  buildsPerFrame: 2,
  /** Merge rule: an island's chunks draw as ONE mesh of this level while all of them are at it. */
  mergeLevel: 0,
  /** Skirt depth below the edge vertex, u (+ half the larger height step along the edge). */
  skirt: 2,
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
