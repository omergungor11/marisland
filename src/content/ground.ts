/**
 * Ground materials (M14b, D-030): what a terrain zone is made of, independent of its colour.
 * Data only. Themes map zone → `GroundSpec` (content/themes/<t>.ts `ground`); the terrain material
 * (TASK-372) turns the base hexes into the albedo/palette textures and adds the zero-mean detail
 * layers below near the camera. A zone a theme does not list keeps today's palette colour
 * (`DEFAULT_GROUND`).
 */
import {
  FLOWERS,
  FOLIAGE,
  GRASS,
  HAY,
  HOT_SPRING,
  ROCK,
  SAND,
  WALLS,
  WALL_STRATA,
} from './palette.ts';
import { Zone, type ThemeId, type ZoneId } from '../world/types.ts';

/** Global material ids. Order is stable: index = material id in the palette texture. */
export type GroundMaterial =
  | 'lawn'
  | 'grass'
  | 'meadow'
  | 'forest'
  | 'sand'
  | 'blackSand'
  | 'rock'
  | 'gravel'
  | 'path'
  | 'paving';

export const GROUND_MATERIALS: readonly GroundMaterial[] = [
  'lawn',
  'grass',
  'meadow',
  'forest',
  'sand',
  'blackSand',
  'rock',
  'gravel',
  'path',
  'paving',
];

/** Detail layers of the `DataArrayTexture`. Order is stable: index = array layer. */
export type DetailLayerId =
  | 'blades'
  | 'mow'
  | 'speckle'
  | 'litter'
  | 'ripples'
  | 'cracks'
  | 'pebbles'
  | 'packedEarth'
  | 'tiles'
  | 'mosaic';

export const DETAIL_LAYER_IDS: readonly DetailLayerId[] = [
  'blades',
  'mow',
  'speckle',
  'litter',
  'ripples',
  'cracks',
  'pebbles',
  'packedEarth',
  'tiles',
  'mosaic',
];

/** One detail layer: tileable, mean-preserving (every layer's top mip averages to 0 delta). */
export interface DetailLayerParams {
  /** World size of one texture repeat in u. */
  tile: number;
  /** Albedo delta amplitude (linear, ± around the base). */
  amplitude: number;
  /** Detail normal strength (0 = albedo only). */
  normal: number;
  /**
   * Accent blend strength (0 / unset = none): the layer's alpha mask pulls the colour toward the
   * material accent (flowers, grout, leaves, lichen), mean-compensated so the average stays the
   * base colour.
   */
  accent?: number;
}

/** Defaults per layer (TASK-372 tuning; amplitude = ± lightness fraction at full detail). */
export const DETAIL_LAYERS: Readonly<Record<DetailLayerId, DetailLayerParams>> = {
  blades: { tile: 1.6, amplitude: 0.3, normal: 0.55 },
  mow: { tile: 6, amplitude: 0.06, normal: 0.3 },
  speckle: { tile: 3, amplitude: 0.16, normal: 0.25, accent: 0.95 },
  litter: { tile: 3, amplitude: 0.26, normal: 0.5, accent: 0.6 },
  ripples: { tile: 4, amplitude: 0.1, normal: 0.55 },
  cracks: { tile: 6.5, amplitude: 0.26, normal: 0.7, accent: 0.45 },
  pebbles: { tile: 2, amplitude: 0.22, normal: 0.75, accent: 0.35 },
  packedEarth: { tile: 3, amplitude: 0.18, normal: 0.45 },
  tiles: { tile: 2, amplitude: 0.1, normal: 0.6, accent: 0.75 },
  mosaic: { tile: 2.4, amplitude: 0.12, normal: 0.45, accent: 0.6 },
};

/**
 * Detail texture size and distance fade (amplitude × (1 − smoothstep(near, far, dist))). The
 * crisp noisy zone borders fade over the same band; beyond `fadeFar` the terrain is exactly the
 * albedo texture.
 */
export const GROUND_DETAIL = {
  size: 256,
  fadeNear: 30,
  fadeFar: 110,
  /** Max detail layers one material evaluates (SwiftShader budget, M14b risk 6). */
  maxLayersPerMaterial: 2,
  /** Fixed seed of the code-built detail layers (same texture for every world). */
  seed: 0x6d61726c,
  /** Zone-border warp: amplitude in grid cells and wavelength in u (organic material edges). */
  borderWarp: 0.42,
  borderWarpScale: 2.6,
  /**
   * Far / low colour: crispness of material borders (0 = the smooth Catmull-Rom colour, 1 = a
   * thresholded edge), applied where two corner colours differ by more than `borderContrast`
   * (linear RGB distance, ramp → full) so smooth ramps stay smooth.
   */
  borderSharpen: 0.85,
  borderContrast: [0.04, 0.12] as const,
  /** Half-width of the border blend (fraction of the cell weight; crisp ≈ 0.06). */
  borderSoft: 0.07,
  /** Accent pick (accent 1 vs 2) changes over patches of about this size in u. */
  accentPatch: 1.7,
  /** Normal-y band where the side projections take over (triplanar on steep ground). */
  steep: [0.55, 0.8] as const,
} as const;

/** Layers a material uses unless a `GroundSpec` overrides them (first = primary). */
export const MATERIAL_LAYERS: Readonly<Record<GroundMaterial, readonly DetailLayerId[]>> = {
  lawn: ['blades', 'mow'],
  grass: ['blades'],
  meadow: ['blades', 'speckle'],
  forest: ['litter', 'blades'],
  sand: ['ripples'],
  blackSand: ['ripples'],
  rock: ['cracks'],
  gravel: ['pebbles'],
  path: ['packedEarth'],
  paving: ['tiles'],
};

/**
 * Accent colours per material (accent 1, accent 2; picked per patch): flowers, leaves, lichen,
 * stones, grout. `GroundLayerParams.speckle` / `tile.grout` override them per zone.
 */
export const MATERIAL_ACCENTS: Readonly<Record<GroundMaterial, readonly [string, string]>> = {
  lawn: ['#FFFFFF', '#FFE07A'],
  grass: ['#FFFFFF', '#FFE07A'],
  meadow: ['#FFFFFF', '#FFD45E'],
  forest: ['#C98A3E', '#9C6B3C'],
  sand: ['#FFF4DC', '#D9B98A'],
  blackSand: ['#8C8494', '#3E3946'],
  rock: ['#C7C98A', '#E4E0D2'],
  gravel: ['#EEE8DA', '#8E887C'],
  path: ['#ECE3CF', '#9A8F7C'],
  paving: ['#9E927F', '#9E927F'],
};

/**
 * Earth walls (TASK-391, M17b concept look): every steep land face above the water — sea bluffs,
 * low banks, Beacon Rock, terrace walls — is drawn by the shader (a 2-D albedo cannot hold
 * vertical detail) as layered soil: horizontal strata in the island theme's band tones
 * (`strata`, TASK-613), a grass lip hanging over the top edge with drips, a dark cool line under
 * the lip, a darker cool wall foot and a wet line just above the water. Every quality, every
 * distance: the bands fade to their mean only once a band is under ~2 px tall.
 */
export const GROUND_WALL = {
  /**
   * Band tones per island theme (palette.ts `WALL_STRATA`, cycled bottom → top); their linear mean
   * is the island's wall colour (albedo of `Zone.cliff`, the far colour of every wall).
   */
  strata: WALL_STRATA,
  /**
   * Wall weight by smooth normal y (full below [0], none above [1]): cliff / rock zones are walls
   * by worldgen (slope > ZONE_RULES.cliffSlope ≈ ny 0.74 per 2 u cell), so a loose band; other
   * zones only on near-vertical faces.
   */
  ny: { cliff: [0.62, 0.86] as const, soil: [0.38, 0.55] as const },
  /**
   * Wall weight per zone (0..1; unset = 1). Vegetation is never a wall by itself: steep green
   * slopes worldgen left green (the Design dome) stay green; bluffs it marks cliff are walls.
   */
  zoneWeight: {
    [Zone.grass]: 0,
    [Zone.meadow]: 0,
    [Zone.forest]: 0,
    [Zone.field]: 0,
    [Zone.path]: 0.5,
    [Zone.plaza]: 0.5,
    [Zone.crater]: 0,
    [Zone.streetHq]: 0.5,
    [Zone.streetCoding]: 0.5,
    [Zone.streetMarketing]: 0.5,
    [Zone.streetQa]: 0.5,
    [Zone.streetDesign]: 0.5,
    [Zone.streetDevops]: 0.5,
    [Zone.streetResearch]: 0.5,
  } as Partial<Record<ZoneId, number>>,
  /**
   * Soil walls (sand, path / plaza) are coastal: they fade out between coast[0] and
   * coast[1] u inland and where the wall foot stands footMax[0] → [1] u above the sea, so a steep
   * hillside stays green. Cliff zones are walls anywhere, in the wall colour; rock zones only on
   * the soil band (near-vertical faces, so a rock cone gets no contour rings), stratified in their
   * own albedo colour with `rockContrast` of the band tones.
   */
  coast: [8, 13] as const,
  footMax: [1.5, 3.5] as const,
  rockContrast: 0.5,
  /** Walls lower than this (u, top − foot) fade out over minHeight[0] → [1]. */
  minHeight: [0.4, 1.0] as const,
  /** Slope probes (u) up / down the fall line for the wall top and foot. */
  probe: [1.2, 2.6, 4.5, 7] as const,
  /**
   * Strata: band height `band` u at sea level, growing × (1 + y / bandGrow) with height (a 5–7 u
   * bluff ≈ 3 bands of 1.6–2.6 u, the 25 u Beacon stack ≈ 7 bands up to 7 u, so ≥ 2 read at T0),
   * thickness wobble (× the local band height / band), ± lightness hash per band, and the fade
   * to the wall mean between bandFade[0] → [1] of a band per pixel (≈ 3 → 1.8 px).
   */
  band: 1.6,
  bandGrow: 8,
  bandWobble: 0.45,
  bandJitter: 0.05,
  bandFade: [0.32, 0.55] as const,
  /** Rock-zone walls (own albedo): tones cycle by a per-band hash, mean normalised to 1. */
  tones: [
    [1.2, 1.12, 0.98],
    [1.0, 0.98, 0.96],
    [0.8, 0.68, 0.6],
    [1.08, 1.0, 0.88],
    [0.9, 0.82, 0.78],
  ] as const,
  /** Grass lip: hangs `lip` u below the top edge plus drips up to `drip` u, `dripFreq` per u. */
  lip: 0.3,
  drip: 1.1,
  dripFreq: 0.85,
  /** The lip is the top's albedo `lipInset` u in from the edge, × `lipShade` (its overhang). */
  lipInset: 2.5,
  lipShade: 0.86,
  /**
   * Dark line under the lip (the overhang's shadow): width (u, never under `lipLinePx` pixels so
   * it survives at T0 / T1), darkening and cool lean (b − r share, ART_BIBLE P4).
   */
  lipLine: 0.45,
  lipLinePx: 1.3,
  lipLineDark: 0.5,
  lipLineCool: 0.22,
  /** Wall foot: cool darkening over the lowest `footHeight` u of the wall (above its foot). */
  footHeight: 3,
  footDark: 0.4,
  footCool: 0.2,
  /** Wet line above the water: height (u), wobble (u), darkening and cool lean (b − r share). */
  wetHeight: 0.6,
  wetWobble: 0.18,
  wetDark: 0.42,
  wetCool: 0.25,
  /** Dark groove at each strata boundary (near only: while a band is over ~15 px; T2 G4 read). */
  groove: 0.18,
  /** Grain: share of the near detail layer's lightness kept on the wall. */
  grain: 0.6,
  /**
   * Macro cells (TASK-613, G4): low-frequency value noise along the wall (`macroCell` u ≈ 3.4×
   * the 6.5 u crack-layer repeat, `macroCellY` u in y) moves the wall lightness ± `macroTone` and
   * the grain share between macroGrain[0] → [1] × `grain`, so no detail tile reads twice on one
   * wall. Zero-mean noise (every quality).
   */
  macroCell: 22,
  macroCellY: 9,
  macroTone: 0.11,
  macroGrain: [0.35, 1.25] as const,
  /**
   * Carving (every quality, M14b polish): vertical cracks = ridged value noise along the wall
   * (`crackFreq` per u, × `crackStretch` in y), lines where it exceeds `crackEdge`; darkening
   * `crack` × wall weight, mean-compensated by `crackMean` (the mask's average) so the far
   * colour stays the albedo; faded out once a 2 u cell is under `crackAa` px⁻¹. `ledge` = normal
   * tilt of the strata bands (ledges), `crackNormal` = crack groove tilt.
   */
  crackFreq: 0.55,
  crackStretch: 0.35,
  crackEdge: [0.88, 0.97] as const,
  crackMean: 0.12,
  crackAa: [0.08, 0.2] as const,
  /** Cracks show where the normal y is below crackSteep[0], none above crackSteep[1] (walls). */
  crackSteep: [0.25, 0.45] as const,
  crack: 0.32,
  ledge: 0.35,
  crackNormal: 0.25,
} as const;

/**
 * Low-frequency macro variation baked into the albedo (seeded per world, identical at every
 * distance): ± lightness and a small green ↔ yellow lean on vegetation, two wavelengths in u.
 */
export const GROUND_MACRO = {
  wavelengths: [30, 9] as const,
  weights: [0.65, 0.35] as const,
  lightness: { veg: 0.07, sand: 0.035, rock: 0.05, paved: 0.025, under: 0.03 },
  vegHue: 0.05,
  /**
   * Moisture / wear blotches on vegetation (TASK-614, G2): a seeded two-octave field (u
   * wavelengths, weights) whose high side reads as sunny / dry patches (lighter by `dryLight`,
   * leaning toward the theme's `lean`) and its low side as moist hollows (darker by `moistDark`,
   * cool lean `moistCool`, b − r share, ART_BIBLE P4). Smoothstep edges over the `dry` / `moist`
   * field ranges keep the blotch borders soft (≥ 10 u at the 34 u octave).
   */
  blotch: {
    wavelengths: [34, 15] as const,
    weights: [0.65, 0.35] as const,
    dry: [0.05, 0.5] as const,
    moist: [-0.1, -0.55] as const,
    dryLight: 0.08,
    moistDark: 0.12,
    moistCool: 0.05,
  },
  /**
   * Theme lean of the dry patches (linear lerp toward `lean` by `mix` × the patch weight): the
   * plateau top's own hue per island, so two islands read apart by their ground alone.
   */
  themeLean: {
    default: { lean: GRASS[0], mix: 0.3 },
    // Hearthholm: warm yellow-green
    hq: { lean: GRASS[0], mix: 0.42 },
    // Coding: cool blue-green under the slate walls
    coding: { lean: FOLIAGE.deciduous[1], mix: 0.4 },
    // Beacon Rock: dry straw
    marketing: { lean: HAY, mix: 0.36 },
    // Palmlagoon: mint
    qa: { lean: HOT_SPRING, mix: 0.36 },
    // Design: a pink-tinged meadow
    design: { lean: FLOWERS[0], mix: 0.1 },
    // Emberpeak: ash-green
    devops: { lean: ROCK[0], mix: 0.3 },
    // Lonely Palm: warm olive (straw over the green)
    research: { lean: HAY, mix: 0.36 },
  } as Readonly<Record<ThemeId | 'default', { lean: string; mix: number }>>,
  /**
   * Worn grass beside paths / plazas / streets (TASK-614): within `reach` grid cells of a paved
   * sample, darker by `dark` and desaturated by `desat` (sRGB share), fading linearly with the
   * cell distance.
   */
  worn: { reach: 2, dark: 0.09, desat: 0.15 },
  /**
   * Grass → sand edge (TASK-614, W-G5): vegetation within `reach` cells of sand lerps toward a dry
   * blend of its own colour and the neighbouring sand base (`dryShare` of the sand) by up to
   * `mix`, sand within `sandReach` cells of vegetation toward the same blend by up to `sandMix`,
   * so the colour step at the class border is small and the edge reads as a 4–6 u gradient. A
   * value-noise speckle (`speckleScale` u, ± `speckle` of the weight) breaks it into dry-grass
   * tufts and pebbly patches.
   */
  /**
   * Grass never muddy (W-G2): vegetation HSL saturation is lifted to at least this, capped at the
   * saturation of the zone's own base colour (DevOps scrub stays scrub).
   */
  vegSatFloor: 0.5,
  shore: {
    reach: 3,
    sandReach: 2,
    mix: 0.6,
    sandMix: 0.32,
    dryShare: 0.55,
    speckleScale: 3.4,
    speckle: 0.45,
  },
} as const;

/**
 * Albedo smoothing (M14b polish): binomial blur of `radius` samples over same-class neighbours
 * (vegetation, sand, rock, …) baked into the albedo, so zone patches inside one material family
 * read as soft rounded shapes instead of 2 u blocks. Class borders are kept.
 */
export const GROUND_SMOOTH = {
  radius: 2,
  kernel: [1, 4, 6, 4, 1] as const,
} as const;

/** Per-zone overrides of the layer look (all optional; unset = DETAIL_LAYERS / MATERIAL_LAYERS). */
export interface GroundLayerParams {
  /** Replaces MATERIAL_LAYERS[material] (≤ GROUND_DETAIL.maxLayersPerMaterial). */
  layers?: readonly DetailLayerId[];
  /** Multiplies every layer's amplitude. */
  amplitude?: number;
  /** Mow stripes: ± lightness fraction and stripe period in u (aligned to the district grid). */
  mow?: { amplitude: number; period: number };
  /** Speckle colours (flowers, confetti gravel, ember glints). */
  speckle?: readonly string[];
  /** Tile / mosaic pattern: tile size in u and grout / accent colour. */
  tile?: { size: number; grout: string };
}

/** What one zone of one themed island looks like. */
export interface GroundSpec {
  material: GroundMaterial;
  /** Base albedo hex (the far / averaged colour; detail only adds zero-mean variation). */
  base: string;
  /**
   * Ramp zones (grass bands, rock slope, wet-sand drying): fraction of the default ramp contrast
   * kept around the base (1 / unset = full; low values = an even material, e.g. basalt).
   */
  ramp?: number;
  layer?: GroundLayerParams;
}

/**
 * Today's ground per zone (used where a theme lists nothing): material + reference base colour.
 * A theme `GroundSpec.base` replaces the reference; zones with ramps (grass height bands and
 * crests, rock slope, seabed depth, wet sand drying inland) keep their ramp relative to it.
 * Meadow / forest / cliff references are the derived colours of `content/terrain.ts` (meadow =
 * grass lerp tip 0.3, forest = shade × 0.9, cliff = strata mean; linear lerps).
 */
export const DEFAULT_GROUND: Readonly<Record<ZoneId, GroundSpec>> = {
  [Zone.deep]: { material: 'sand', base: '#4D6E80' },
  [Zone.mid]: { material: 'sand', base: '#5C7E8E' },
  [Zone.shallow]: { material: 'sand', base: '#5C7E8E' },
  [Zone.lagoon]: { material: 'sand', base: '#5C7E8E' },
  [Zone.sandWet]: { material: 'sand', base: SAND.wet },
  [Zone.sandDry]: { material: 'sand', base: SAND.dry },
  [Zone.sandBlack]: { material: 'blackSand', base: SAND.black },
  [Zone.grass]: { material: 'grass', base: GRASS[2] },
  [Zone.meadow]: { material: 'meadow', base: '#98D35B' },
  [Zone.forest]: { material: 'forest', base: '#5AA641' },
  [Zone.field]: { material: 'lawn', base: HAY },
  [Zone.rock]: { material: 'rock', base: ROCK[1] },
  [Zone.cliff]: { material: 'rock', base: '#CEA882' },
  [Zone.path]: { material: 'path', base: '#D4C3A0' },
  [Zone.plaza]: { material: 'paving', base: '#CDBFA6' },
  [Zone.crater]: { material: 'rock', base: '#6A5F6B' },
  // culture street tints (TASK-466): plain paving unless the island's theme tints them
  [Zone.streetHq]: { material: 'paving', base: '#CDBFA6' },
  [Zone.streetCoding]: { material: 'paving', base: '#CDBFA6' },
  [Zone.streetMarketing]: { material: 'paving', base: '#CDBFA6' },
  [Zone.streetQa]: { material: 'paving', base: '#CDBFA6' },
  [Zone.streetDesign]: { material: 'paving', base: '#CDBFA6' },
  [Zone.streetDevops]: { material: 'paving', base: '#CDBFA6' },
  [Zone.streetResearch]: { material: 'paving', base: '#CDBFA6' },
};

/**
 * Painted light on the island body (TASK-617, M50 direction C, ART_BIBLE P4 / §3): terms in the
 * terrain program's lit output, every quality (a dot, a pow and a smoothstep per pixel).
 * - `rim`: sun-facing silhouettes (grazing view × facing the key light) lift toward a warm cream ×
 *   the sun colour, so the bluff top and the island edge separate from the sea without an outline.
 * - `shade`: daytime floor for the darkest land (cone shadow side at golden hour): pixels whose lit
 *   luminance falls under `floor` (linear) get up to `lift` × albedo × the env shadow tint back,
 *   so shade stays blue-violet instead of sinking to black; lit ground is untouched, off at night.
 */
export const GROUND_LIGHT = {
  rim: 0.32,
  rimPower: 3,
  /** Facing gate: smoothstep over n·sun. */
  rimFacing: [0.0, 0.45] as const,
  rimColor: WALLS[0],
  shade: { floor: 0.12, lift: 1.0 },
} as const;
