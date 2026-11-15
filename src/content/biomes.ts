/**
 * Per-island colour sets and variant encoding for the vegetation / rock / boat v2 defs
 * (TASK-599 / TASK-601, D-174). Pure data: geometry lives in geo/trees.ts, geo/small.ts,
 * geo/coastal-v2.ts and geo/boats-v2.ts.
 *
 * Contract for TASK-600 (worldgen scatter, picks the variants):
 *   variant = biomeIndex * SHAPES[def] + shape      (`biomeVariant`, `splitVariant`)
 * biome index 0 is `neutral` (the legacy FOLIAGE / palette look), 1..7 follow THEME_IDS. A theme's
 * variants of a def are therefore the consecutive block `themeVariants(def, theme)`.
 * The v2 defs are NEW defs appended after every old one (no defId shifts, the old defs' variant
 * counts and the clustered T0 blob colours stay as they are, so no world hash moves until a rule
 * names them). When a rule places a theme's canopy variants, `THEMES[theme].treePalette` must switch
 * to `biomeTreePalette(theme)` in the same commit so the far blobs (T0) keep matching (D-031).
 */
import { THEME_IDS, type ThemeId } from '../world/types.ts';
import { FLOWERS, FOLIAGE, ROOFS, WALL_STRATA, WALLS } from './palette.ts';

export type BiomeId = 'neutral' | ThemeId;
export const BIOME_IDS: readonly BiomeId[] = ['neutral', ...THEME_IDS];

export interface Biome {
  /** Deciduous canopy, lightest to darkest (same order as FOLIAGE.deciduous). */
  deciduous: readonly [string, string, string];
  pine: readonly [string, string];
  palm: readonly [string, string];
  /** Fruit / blossom / ember dots on canopies and the bush flower (null = none). */
  dots: string | null;
  /** Bush flower hues (two). */
  flowers: readonly [string, string];
}

export const BIOMES: Readonly<Record<BiomeId, Biome>> = {
  neutral: {
    deciduous: FOLIAGE.deciduous,
    pine: FOLIAGE.pine,
    palm: FOLIAGE.palm,
    dots: null,
    flowers: [FLOWERS[0], FLOWERS[1]],
  },
  // Hearthholm: the green orchard, red fruit dots
  hq: {
    deciduous: FOLIAGE.deciduous,
    pine: FOLIAGE.pine,
    palm: FOLIAGE.palm,
    dots: ROOFS[1],
    flowers: [FLOWERS[0], FLOWERS[2]],
  },
  // Coding: light spring green
  coding: {
    deciduous: ['#C2F07E', '#9BE06A', '#6FCB5E'],
    pine: ['#5FB98A', '#3F9E78'],
    palm: ['#98E060', '#72C94A'],
    dots: null,
    flowers: [FLOWERS[3], FLOWERS[2]],
  },
  // Beacon Rock: orange-yellow, a canopy turned early
  marketing: {
    deciduous: ['#FFD66B', '#F5A94C', '#E0813A'],
    pine: ['#8FA84E', '#6E8F3F'],
    palm: ['#C9DB4E', '#9EBF3C'],
    dots: ROOFS[1],
    flowers: [FLOWERS[4], FLOWERS[1]],
  },
  // Palmlagoon: mint
  qa: {
    deciduous: ['#A9EBD0', '#7FD8B3', '#4FB892'],
    pine: ['#4FB8A0', '#3A9C86'],
    palm: ['#8DE0B0', '#5CC490'],
    dots: WALLS[1],
    flowers: [FLOWERS[2], FLOWERS[3]],
  },
  // Design: lilac and plum canopies
  design: {
    deciduous: ['#E3B8FF', '#B79BEA', '#8E6FD8'],
    pine: ['#7F6BC0', '#5E4E9E'],
    palm: ['#8FD9B0', '#5CB88A'],
    dots: '#FFC2D4',
    flowers: [FLOWERS[0], FLOWERS[3]],
  },
  // Emberpeak: dark pine, ember dots
  devops: {
    deciduous: ['#6FAE5A', '#4E8F4E', '#326F42'],
    pine: ['#2F6F52', '#245A44'],
    palm: ['#6FB04A', '#4E9438'],
    dots: '#FF6A3D',
    flowers: [FLOWERS[4], '#FFB347'],
  },
  // Lonely Palm: cypress and olive
  research: {
    deciduous: ['#C4CE86', '#9DB066', '#74904F'],
    pine: ['#4E8A6A', '#3C7258'],
    palm: ['#9CCB5A', '#78AB44'],
    dots: '#6B7A52',
    flowers: [FLOWERS[3], FLOWERS[2]],
  },
};

export const biomeIndex = (id: BiomeId): number => BIOME_IDS.indexOf(id);

/** Shapes per biome block of each v2 vegetation def. */
export const SHAPES = {
  /** 0 tall oval, 1 umbrella, 2 layered. */
  canopyTree: 3,
  /** 0 leaning, 1 twin trunk, 2 triple fan. */
  leanPalm: 3,
  /** 0 tall mound with flower sprays, 1 low spreading mound. */
  floraBush: 2,
} as const;
export type BiomeDef = keyof typeof SHAPES;

export const biomeVariant = (def: BiomeDef, biome: BiomeId, shape: number): number =>
  biomeIndex(biome) * SHAPES[def] + (shape % SHAPES[def]);

export const splitVariant = (
  def: BiomeDef,
  variant: number,
): { biome: Biome; biomeId: BiomeId; shape: number } => {
  const n = SHAPES[def];
  const id = BIOME_IDS[Math.floor(variant / n) % BIOME_IDS.length];
  return { biome: BIOMES[id], biomeId: id, shape: variant % n };
};

/** Variants of `def` for one island's biome (consecutive block). */
export const themeVariants = (def: BiomeDef, biome: BiomeId): readonly number[] =>
  Array.from({ length: SHAPES[def] }, (_, s) => biomeVariant(def, biome, s));

export const BIOME_DEF_VARIANTS: Readonly<Record<BiomeDef, number>> = {
  canopyTree: SHAPES.canopyTree * BIOME_IDS.length,
  leanPalm: SHAPES.leanPalm * BIOME_IDS.length,
  floraBush: SHAPES.floraBush * BIOME_IDS.length,
};

/** The theme's `treePalette` once its biome variants are placed (same shape as FOLIAGE). */
export const biomeTreePalette = (
  id: BiomeId,
): { deciduous: readonly string[]; pine: readonly string[]; palm: readonly string[] } => ({
  deciduous: BIOMES[id].deciduous,
  pine: BIOMES[id].pine,
  palm: BIOMES[id].palm,
});

// ------------------------------------------------------------------ rocks

/** Boulder: 5 silhouettes x 3 caps, variant = cap * 5 + silhouette. */
export const BOULDER = {
  silhouettes: 5,
  /** 0 bare, 1 moss cap, 2 lichen cap. */
  caps: 3,
  /** Lichen cap hues (pale sage, orange speckle). */
  lichen: ['#C9D1A0', '#E9B26A'],
  /** Strata line colour mix (the thin pale band across the rock). */
  strataLine: '#CFD3DA',
  /** LOD0 height per silhouette, u (def `heights`). */
  heights: [0.55, 1.9, 0.5, 1.2, 0.9],
} as const;
export const BOULDER_VARIANTS = BOULDER.silhouettes * BOULDER.caps;

// ------------------------------------------------------------------ boats

export interface BoatSet {
  hull: string;
  sail: string;
  stripe: string;
}

/** Hull / sail / stripe per biome (hull index = same as BIOME_IDS), all palette or WALL_STRATA hues. */
export const BOAT_SETS: Readonly<Record<BiomeId, BoatSet>> = {
  neutral: { hull: ROOFS[5], sail: WALLS[1], stripe: ROOFS[0] },
  hq: { hull: ROOFS[0], sail: WALLS[1], stripe: ROOFS[5] },
  coding: { hull: ROOFS[2], sail: WALLS[1], stripe: ROOFS[3] },
  marketing: { hull: ROOFS[1], sail: ROOFS[3], stripe: WALLS[1] },
  qa: { hull: ROOFS[6], sail: WALLS[0], stripe: ROOFS[2] },
  design: { hull: ROOFS[4], sail: WALLS[2], stripe: ROOFS[3] },
  devops: { hull: WALL_STRATA.devops[1], sail: WALL_STRATA.devops[0], stripe: ROOFS[0] },
  research: { hull: WALL_STRATA.research[1], sail: WALL_STRATA.research[0], stripe: ROOFS[5] },
};

/** harbourBoat hulls: variant = biomeIndex * 3 + hull. `draft` = how far the keel sits under the waterline pivot. */
export const HARBOUR_BOAT = {
  hulls: ['dinghy', 'fishingBoat', 'sloop'] as const,
  length: [2.7, 4.6, 5.2],
  draft: [0.12, 0.28, 0.42],
  /** Mast / top height above the waterline pivot, u. */
  height: [1.0, 3.6, 5.4],
} as const;
export const HARBOUR_BOAT_VARIANTS = HARBOUR_BOAT.hulls.length * BIOME_IDS.length;
export const boatVariant = (biome: BiomeId, hull: number): number =>
  biomeIndex(biome) * HARBOUR_BOAT.hulls.length + (hull % HARBOUR_BOAT.hulls.length);
export const splitBoatVariant = (v: number): { set: BoatSet; hull: number } => ({
  set: BOAT_SETS[BIOME_IDS[Math.floor(v / HARBOUR_BOAT.hulls.length) % BIOME_IDS.length]],
  hull: v % HARBOUR_BOAT.hulls.length,
});

/** Dock dressing variants (deck-top pivot; the ladder hangs below it). */
export const DOCK_DRESSING = {
  names: ['net', 'lobsterPot', 'ropeCoil', 'ladder'] as const,
  height: [0.95, 0.5, 0.26, 0.5],
  /** The ladder reaches this far under the pivot. */
  ladderDrop: 1.1,
} as const;

/** Buoy variants appended after the Colour Wharf paint pots (old buoy def: 0 harbour, 1/2 channel, 3..6 pots). */
export const BUOY_V2 = {
  first: 7,
  names: ['spar', 'mooringBall', 'potFloats'] as const,
  height: [1.5, 0.6, 0.33],
} as const;

// ------------------------------------------------------------------ coast litter

/** `kelp` (tier 3, windy, water-tinted) and `driftLog` (tier 3). */
export const KELP = {
  variants: 3,
  /** Blade colours bottom -> tip, water tinted (palette seaweed + lagoon). */
  blades: ['#2E7F66', '#3E9A6A', '#6FBF7A'],
  heights: [1.8, 1.1, 2.4],
} as const;
export const DRIFT_LOG = { variants: 3, heights: [0.52, 0.55, 0.42] } as const;

/** Gallery showcases (`?gallery=1&ids=vegetation|boats`, scripts/gallery-shots.ts). */
export const VEGETATION_SHOWCASE_IDS: readonly string[] = [
  'canopyTree',
  'leanPalm',
  'floraBush',
  'boulder',
  'kelp',
  'driftLog',
];
export const BOAT_SHOWCASE_IDS: readonly string[] = ['harbourBoat', 'dockDressing', 'buoy'];
