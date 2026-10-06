/**
 * Ground materials (M14b, D-030): what a terrain zone is made of, independent of its colour.
 * Data only. Themes map zone → `GroundSpec` (content/themes/<t>.ts `ground`); the terrain material
 * (TASK-372) turns the base hexes into the albedo/palette textures and adds the zero-mean detail
 * layers below near the camera. A zone a theme does not list keeps today's palette colour
 * (`DEFAULT_GROUND`).
 */
import { CLIFF_STRATA, GRASS, HAY, ROCK, SAND } from './palette.ts';
import { Zone, type ZoneId } from '../world/types.ts';

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
 * Cliff strata: smooth horizontal bands drawn by the shader at every distance (a 2-D albedo
 * cannot hold them on vertical faces). Band colour = zone colour × (1 ± contrast), the luminance
 * contrast of the two strata colours below; a theme recolours cliffs through the zone base.
 */
export const GROUND_STRATA = {
  colors: CLIFF_STRATA,
  /** Strata strength on the rock zone relative to cliffs (steep rock shows faint bands). */
  rock: 0.45,
  /** Fine sub-bands (near only) as a fraction of the main contrast. */
  fine: 0.35,
  /**
   * Carving (every quality, M14b polish): vertical cracks = ridged value noise along the wall
   * (`crackFreq` per u, × `crackStretch` in y), lines where it exceeds `crackEdge`; darkening
   * `crack` × strata amount, mean-compensated by `crackMean` (the mask's average) so the far
   * colour stays the albedo; faded out once a 2 u cell is under `crackAa` px⁻¹. `ledge` = normal
   * tilt of the strata bands (ledges), `crackNormal` = crack groove tilt.
   */
  crackFreq: 0.55,
  crackStretch: 0.35,
  crackEdge: [0.88, 0.97] as const,
  crackMean: 0.12,
  crackAa: [0.25, 0.7] as const,
  /** Cracks show where the normal y is below crackSteep[0], none above crackSteep[1] (walls). */
  crackSteep: [0.25, 0.45] as const,
  crack: 0.45,
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
};
