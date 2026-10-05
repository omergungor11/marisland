/**
 * Ground materials (M14b, D-030): what a terrain zone is made of, independent of its colour.
 * Data only. Themes map zone → `GroundSpec` (content/themes/<t>.ts `ground`); the terrain material
 * (TASK-372) turns the base hexes into the albedo/palette textures and adds the zero-mean detail
 * layers below near the camera. A zone a theme does not list keeps today's palette colour.
 */

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
}

/** Defaults per layer (TASK-372 tunes them). */
export const DETAIL_LAYERS: Readonly<Record<DetailLayerId, DetailLayerParams>> = {
  blades: { tile: 2, amplitude: 0.06, normal: 0.35 },
  mow: { tile: 6, amplitude: 0.04, normal: 0 },
  speckle: { tile: 3, amplitude: 0.1, normal: 0.1 },
  litter: { tile: 4, amplitude: 0.08, normal: 0.3 },
  ripples: { tile: 5, amplitude: 0.05, normal: 0.4 },
  cracks: { tile: 6, amplitude: 0.1, normal: 0.6 },
  pebbles: { tile: 2.5, amplitude: 0.08, normal: 0.5 },
  packedEarth: { tile: 4, amplitude: 0.05, normal: 0.2 },
  tiles: { tile: 2, amplitude: 0.06, normal: 0.3 },
  mosaic: { tile: 3, amplitude: 0.09, normal: 0.2 },
};

/** Detail texture size and distance fade (amplitude × (1 − smoothstep(near, far, dist))). */
export const GROUND_DETAIL = {
  size: 256,
  fadeNear: 30,
  fadeFar: 110,
  /** Max detail layers one material evaluates (SwiftShader budget, M14b risk 6). */
  maxLayersPerMaterial: 2,
} as const;

/** Layers a material uses unless a `GroundSpec` overrides them. */
export const MATERIAL_LAYERS: Readonly<Record<GroundMaterial, readonly DetailLayerId[]>> = {
  lawn: ['blades', 'mow'],
  grass: ['blades'],
  meadow: ['blades', 'speckle'],
  forest: ['litter'],
  sand: ['ripples'],
  blackSand: ['ripples'],
  rock: ['cracks'],
  gravel: ['pebbles'],
  path: ['packedEarth'],
  paving: ['tiles'],
};

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
  layer?: GroundLayerParams;
}
