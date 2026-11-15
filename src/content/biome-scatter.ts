/**
 * Per-island v2 scatter (TASK-600, D-179): which vegetation / rock / boat v2 variants each island
 * rolls, which old scatter defs they replace, and the extra biome layers (rock fields, flower
 * meadow patches, path edges, coast litter, lot hedges, garden plots, harbour boats and dock
 * dressing). Data only; world/gen/scatter.ts and world/gen/biome-scatter.ts read it.
 *
 * Variant encoding is TASK-599 / 601's (`content/biomes.ts`): `biomeVariant(def, theme, shape)`,
 * boulder `cap * 5 + silhouette`, boats `boatVariant(theme, hull)`. A variant repeated in a list is
 * its weight (one `rng.int` per roll, like the old `rng.int(0, variants - 1)`).
 *
 * Draw calls: the batcher buckets non ground-cover props by (def, variant, island), so every
 * distinct variant on an island is a LOD0 + LOD1 group. The swaps below replace an old def's whole
 * rule (same Poisson points, same roll count) and keep each island to 2–3 variants per v2 def.
 * Memory: every distinct (def, variant) is a LOD0 + LOD1 geometry for the whole world (the low
 * ladder L-pairs-hq sits on the 86 MB line), so an island rolls one floraBush shape and one boat
 * hull (QA one palm shape, Research one canopy), the world one or two kelp / driftLog variants.
 * T0 blobs: one colour per (island, canopy kind), so an island's canopy shapes must agree within
 * the blob ΔE bound (render/props/batcher.test.ts, p95 ≤ 4.5): the hq layered and the design oval
 * canopies shade 6.8 / 9.3 off their island's mix and are left out.
 */
import { biomeTreePalette, biomeVariant, boulderVariant, type BiomeDef } from './biomes.ts';
import { FOLIAGE } from './palette.ts';
import { Zone, type ThemeId } from '../world/types.ts';
import type { PlacementRule } from './placement.ts';

/** Variant lists a rule or swap may roll from (per island). */
export type VariantPick = 'canopy' | 'palm' | 'flora' | 'boulder' | 'kelp' | 'driftLog';

/** An old scatter def's placements turned into a v2 def (positions and roll count unchanged). */
export interface ScatterSwap {
  def: string;
  pick: VariantPick;
  /** Share of the rule's placements swapped (default 1: all; < 1 costs one extra roll each). */
  share?: number;
}

export interface IslandBiomeScatter {
  /** Old def id → v2 def, applied to every scatter rule of the island naming the old def. */
  swap: Readonly<Record<string, ScatterSwap>>;
  picks: Readonly<Record<VariantPick, readonly number[]>>;
  /** harbourBoat hulls moored along the docks (0 dinghy, 1 fishing boat, 2 sloop); [] = none. */
  boats: readonly number[];
  /** dockDressing variants on the dock decks (0 net, 1 lobster pot, 2 rope coil, 3 ladder). */
  dressing: readonly number[];
}

/** Shape weights → a variant list of the theme's biome block. */
const shapes = (def: BiomeDef, theme: ThemeId, weights: readonly number[]): number[] =>
  weights.flatMap((w, s) => Array<number>(w).fill(biomeVariant(def, theme, s)));
/** Boulder variants in the theme's moss / lichen set: one cap kind (0 bare, 1 moss, 2 lichen) × silhouettes. */
const boulders = (theme: ThemeId, cap: number, silhouettes: readonly number[]): number[] =>
  silhouettes.map((s) => boulderVariant(theme, cap, s));

const NONE: readonly number[] = [];

export const BIOME_SCATTER: Readonly<Record<ThemeId, IslandBiomeScatter>> = {
  // Hearthholm: fruit orchard canopies over the lawns (the avenue keeps its round trees), mossy
  // field stones, flowering hedges; dinghies and fishing boats at the pier
  hq: {
    swap: {
      roundTree: { def: 'canopyTree', pick: 'canopy' },
      bush: { def: 'floraBush', pick: 'flora' },
      rockCluster: { def: 'boulder', pick: 'boulder' },
    },
    picks: {
      canopy: shapes('canopyTree', 'hq', [1, 1, 0]),
      palm: NONE,
      flora: shapes('floraBush', 'hq', [1, 0]),
      boulder: boulders('hq', 1, [0, 3]),
      kelp: NONE,
      driftLog: NONE,
    },
    boats: [1],
    dressing: [0, 3],
  },
  // Beacon Rock: umbrella canopies turned orange-yellow among the stock pines
  marketing: {
    swap: { roundTree: { def: 'canopyTree', pick: 'canopy' } },
    picks: {
      canopy: shapes('canopyTree', 'marketing', [1, 3, 0]),
      palm: NONE,
      flora: NONE,
      boulder: NONE,
      kelp: [0],
      driftLog: [0],
    },
    boats: [2],
    dressing: [1, 3],
  },
  // Coding: the planned (wreathed) round trees stay; lichen rock fields, spring-green shrubs
  coding: {
    swap: {
      bush: { def: 'floraBush', pick: 'flora' },
      rockCluster: { def: 'boulder', pick: 'boulder' },
    },
    picks: {
      canopy: NONE,
      palm: NONE,
      flora: shapes('floraBush', 'coding', [0, 1]),
      boulder: boulders('coding', 2, [2, 4]),
      kelp: NONE,
      driftLog: [0],
    },
    boats: [0],
    dressing: [2, 3],
  },
  // Emberpeak: stock pines and basalt; the scrub turns to ember-flowered bushes
  devops: {
    swap: { bush: { def: 'floraBush', pick: 'flora' } },
    picks: {
      canopy: NONE,
      palm: NONE,
      flora: shapes('floraBush', 'devops', [0, 1]),
      boulder: NONE,
      kelp: [1],
      driftLog: [0],
    },
    boats: [1],
    dressing: [0, 1],
  },
  // Palmlagoon: mint leaning palms on the rim, pale bare boulders
  qa: {
    swap: {
      palm: { def: 'leanPalm', pick: 'palm' },
      bush: { def: 'floraBush', pick: 'flora' },
      rockCluster: { def: 'boulder', pick: 'boulder' },
    },
    picks: {
      canopy: NONE,
      palm: shapes('leanPalm', 'qa', [1, 0, 0]),
      flora: shapes('floraBush', 'qa', [1, 0]),
      boulder: boulders('qa', 0, [2, 4]),
      kelp: [1],
      driftLog: [0],
    },
    boats: [0],
    dressing: [1, 2],
  },
  // Design: lilac layered canopies among the pines (the blossom groves stay), mossy boulders
  design: {
    swap: {
      pine: { def: 'canopyTree', pick: 'canopy', share: 0.3 },
      bush: { def: 'floraBush', pick: 'flora' },
      rockCluster: { def: 'boulder', pick: 'boulder' },
    },
    picks: {
      canopy: shapes('canopyTree', 'design', [0, 0, 1]),
      palm: NONE,
      flora: shapes('floraBush', 'design', [1, 0]),
      boulder: boulders('design', 1, [1, 4]),
      kelp: [0],
      driftLog: [0],
    },
    boats: [2],
    dressing: [0, 3],
  },
  // Lonely Palm: cypress (tall oval) park groves, olive-flowered shrubs
  research: {
    swap: {
      roundTree: { def: 'canopyTree', pick: 'canopy' },
      bush: { def: 'floraBush', pick: 'flora' },
    },
    picks: {
      canopy: shapes('canopyTree', 'research', [1, 0, 0]),
      palm: NONE,
      flora: shapes('floraBush', 'research', [0, 1]),
      boulder: NONE,
      kelp: NONE,
      driftLog: [0],
    },
    boats: [2],
    dressing: [1, 2],
  },
};

/**
 * T0 blob palette (D-031) per island: the biome ramp for the canopy kinds its v2 trees replaced,
 * FOLIAGE for the kinds still drawn by the stock defs (the stock pine / palm / round tree geometry
 * is FOLIAGE-coloured whatever the theme, so its blobs keep FOLIAGE).
 */
const BIOME_CANOPY_KINDS: Readonly<Record<ThemeId, readonly ('deciduous' | 'palm')[]>> = {
  hq: ['deciduous'],
  marketing: ['deciduous'],
  coding: [],
  devops: [],
  qa: ['palm'],
  design: ['deciduous'],
  research: ['deciduous'],
};

/**
 * The v2 def and the weighted variant list behind a canopy kind's T0 blobs on `theme` (null = the
 * stock def): render/props/batcher.ts takes the blob colour from this geometry, not a ramp ratio.
 */
export const biomeCanopy = (
  theme: ThemeId,
  kind: string,
): { def: string; variants: readonly number[] } | null => {
  if (kind !== 'deciduous' && kind !== 'palm') return null;
  if (!BIOME_CANOPY_KINDS[theme].includes(kind)) return null;
  const picks = BIOME_SCATTER[theme].picks;
  return kind === 'palm'
    ? { def: 'leanPalm', variants: picks.palm }
    : { def: 'canopyTree', variants: picks.canopy };
};

/** `THEMES[theme].treePalette`: `biomeTreePalette(theme)` on the replaced kinds, FOLIAGE elsewhere. */
export const themeTreePalette = (
  theme: ThemeId,
): { deciduous: readonly string[]; pine: readonly string[]; palm: readonly string[] } => {
  const b = biomeTreePalette(theme);
  const k = BIOME_CANOPY_KINDS[theme];
  return {
    deciduous: k.includes('deciduous') ? b.deciduous : FOLIAGE.deciduous,
    pine: FOLIAGE.pine,
    palm: k.includes('palm') ? b.palm : FOLIAGE.palm,
  };
};

/** A biome layer rule: `themes` = the islands it runs on (`pick` rolls their variant lists). */
export interface BiomeRule extends PlacementRule {
  themes: readonly ThemeId[];
}

const { grass, meadow, rock, sandDry, sandWet, sandBlack, shallow, field, path } = Zone;
const ROCKY: readonly ThemeId[] = ['hq', 'coding', 'qa', 'design'];

/**
 * Biome layers, after every global and theme rule of an island (own rng fork, so no earlier prop
 * moves): rock fields, flower meadow patches, path edges, coast litter.
 */
export const BIOME_RULES: readonly BiomeRule[] = [
  // rock fields: boulder clusters where the low-frequency noise peaks
  {
    def: 'boulder',
    pick: 'boulder',
    themes: ROCKY,
    zones: [grass, meadow, rock],
    minDist: 2.6,
    density: 0.85,
    slopeMax: 1.2,
    heights: [0.8, 40],
    shore: [3, 1000],
    cluster: { scale: 24, threshold: 0.34 },
    scale: [0.45, 1.05],
    avoid: [field],
    avoidDist: 3,
    maxPerIsland: 14,
  },
  // flower meadow patches: dense Poisson flower ground cover in clustered meadow pockets
  {
    def: 'flower',
    themes: ['marketing', 'coding', 'qa', 'design', 'research'],
    zones: [meadow, grass],
    minDist: 0.75,
    density: 0.85,
    slopeMax: 0.5,
    heights: [0.8, 30],
    shore: [3, 1000],
    cluster: { scale: 11, threshold: 0.32 },
    scale: [0.9, 1.4],
  },
  // flowering shrubs in the meadow pockets
  {
    def: 'floraBush',
    pick: 'flora',
    themes: ['hq', 'coding', 'qa', 'design', 'research'],
    zones: [meadow],
    minDist: 3,
    density: 0.7,
    slopeMax: 0.5,
    heights: [0.8, 30],
    shore: [3, 1000],
    cluster: { scale: 11, threshold: 0.36 },
    scale: [0.7, 1.05],
    maxPerIsland: 10,
  },
  // path edges: grass tufts and small stones along the footpaths
  {
    def: 'grassTuft',
    themes: ['hq', 'marketing', 'coding', 'devops', 'qa', 'design', 'research'],
    zones: [grass, meadow],
    minDist: 0.9,
    density: 0.8,
    slopeMax: 0.8,
    heights: [0.4, 40],
    near: [path],
    nearDist: 1.4,
    scale: [0.8, 1.3],
  },
  {
    def: 'boulder',
    pick: 'boulder',
    themes: ROCKY,
    zones: [grass, meadow, sandDry],
    minDist: 5,
    density: 0.55,
    slopeMax: 0.8,
    heights: [0.4, 40],
    near: [path],
    nearDist: 2,
    scale: [0.26, 0.42],
    maxPerIsland: 16,
  },
  // coast litter: a driftwood log or two on the dry beach, kelp on the rocky shelf
  {
    def: 'driftLog',
    pick: 'driftLog',
    themes: ['marketing', 'coding', 'devops', 'qa', 'design', 'research'],
    zones: [sandDry, sandWet, sandBlack],
    minDist: 7,
    density: 0.7,
    slopeMax: 0.6,
    heights: [0.05, 2.2],
    shore: [0.3, 7],
    scale: [0.85, 1.15],
    maxPerIsland: 3,
  },
  {
    def: 'kelp',
    pick: 'kelp',
    themes: ['marketing', 'devops', 'qa', 'design'],
    zones: [shallow],
    minDist: 1.6,
    density: 0.7,
    slopeMax: 1.5,
    heights: [-2.6, -0.9],
    shore: [-8, -1.5],
    cluster: { scale: 14, threshold: 0.25 },
    scale: [0.8, 1.2],
    maxPerIsland: 10,
  },
];

/**
 * Lot edges (garden side of the house lots): flowering hedge shrubs at the back corners and the
 * back middle, a garden plot behind (`garden` def, its variant rolled). Lot-local: `u` across the
 * facing, `v` along it (the door at +v). Skipped where the ground is not free, too steep or water.
 */
export const LOT_EDGES = {
  defs: ['cottage', 'towerHouse', 'logCabin'] as readonly string[],
  hedge: { def: 'floraBush', pick: 'flora' as VariantPick, back: 0.9, scale: [0.75, 0.95] },
  garden: { def: 'flowerBed', back: 2.8, variants: 3 },
  slopeMax: 0.5,
  minY: 0.4,
} as const;

/**
 * Harbour dressing along `world.docks`: `boats` harbourBoats per dock in the side slots
 * (`DOCK.mooringSide` off the plank axis, parallel to the pier, bow seaward, y at the waterline),
 * `dressing` items on the deck (`deckY` = dock deck top, the side away from the barrels; the ladder
 * at the deck edge over water ≥ `ladderDepth` deep).
 */
export const HARBOUR_DRESSING = {
  boatsPerDock: 2,
  /** Water depth under a boat: its draft + this. */
  keel: 0.5,
  /** Clearance (u) from a life mooring and from a boat route sample. */
  mooringClear: 3.4,
  routeClear: 4.5,
  /** Occupancy mark round a placed boat (u). */
  boatRadius: 0.9,
  /**
   * Free test: discs of `hullTest` u at the hull ends and middle, `outboard` u past the slot
   * (the pier's own pad reaches ≈ 1.5 u off its axis, the slot is 1.8 u off it).
   */
  outboard: 0.9,
  hullTest: 0.55,
  deckY: 0.7,
  /** Lateral offset of the deck items (the barrels sit at −0.45) and of the ladder (deck edge). */
  itemSide: 0.3,
  ladderSide: 0.62,
  /** Along-plank offset of the ladder from the segment centre (the posts stand at the centre). */
  ladderAlong: 0.6,
  ladderDepth: 0.5,
} as const;
