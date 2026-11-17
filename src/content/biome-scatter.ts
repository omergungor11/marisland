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
 * hull (QA / Design one palm shape, Research one canopy), the world one or two kelp / driftLog variants.
 * T0 blobs: one colour per (island, canopy kind), so an island's canopy shapes must agree within
 * the blob ΔE bound (render/props/batcher.test.ts, p95 ≤ 4.5): the hq layered and the design oval
 * canopies shade 6.8 / 9.3 off their island's mix and are left out.
 */
import { biomeTreePalette, biomeVariant, boulderVariant, KELP, type BiomeDef } from './biomes.ts';
import { FOLIAGE } from './palette.ts';
import { Zone, type ThemeId } from '../world/types.ts';
import type { PlacementRule } from './placement.ts';

/** Variant lists a rule or swap may roll from (per island). */
export type VariantPick =
  | 'canopy'
  | 'palm'
  | 'flora'
  | 'boulder'
  | 'kelp'
  | 'driftLog'
  // TASK-603 coast kit (D-184): rockArch, tidePoolField, duneGrass, ledgeShrub variants
  | 'arch'
  | 'tide'
  | 'dune'
  | 'ledge';

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
  /**
   * TASK-603: the stones of the coast micro-landscapes (sea stacks beside an arch, the rock ring
   * round a waterfall foot). Variants the island (or the world) already
   * draws, so they add no geometry: the island's boulder set, else a world-shared bare boulder.
   */
  stone: { def: string; variants: readonly number[] };
}

/** Shape weights → a variant list of the theme's biome block. */
const shapes = (def: BiomeDef, theme: ThemeId, weights: readonly number[]): number[] =>
  weights.flatMap((w, s) => Array<number>(w).fill(biomeVariant(def, theme, s)));
/** Boulder variants in the theme's moss / lichen set: one cap kind (0 bare, 1 moss, 2 lichen) × silhouettes. */
const boulders = (theme: ThemeId, cap: number, silhouettes: readonly number[]): number[] =>
  silhouettes.map((s) => boulderVariant(theme, cap, s));

const NONE: readonly number[] = [];
/** A bare QA boulder (drawn on QA already): the coast stones of islands without a boulder set. */
const SHARED_STONE: readonly number[] = [boulderVariant('qa', 0, 2)];

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
      arch: shapes('rockArch', 'hq', [0, 1]),
      tide: [0],
      dune: NONE,
      ledge: shapes('ledgeShrub', 'hq', [0, 1]),
    },
    boats: [1],
    dressing: [0, 3],
    stone: { def: 'boulder', variants: boulders('hq', 1, [0, 3]) },
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
      arch: shapes('rockArch', 'marketing', [1]),
      tide: [0],
      dune: NONE,
      ledge: shapes('ledgeShrub', 'marketing', [0, 1]),
    },
    boats: [2],
    dressing: [1, 3],
    stone: { def: 'boulder', variants: SHARED_STONE },
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
      arch: NONE,
      tide: [0],
      dune: NONE,
      ledge: shapes('ledgeShrub', 'coding', [0, 1]),
    },
    boats: [0],
    dressing: [2, 3],
    stone: { def: 'boulder', variants: boulders('coding', 2, [2, 4]) },
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
      arch: shapes('rockArch', 'devops', [1]),
      tide: [2],
      dune: NONE,
      ledge: shapes('ledgeShrub', 'devops', [1]),
    },
    boats: [1],
    dressing: [0, 1],
    stone: { def: 'basaltBoulder', variants: [0, 1, 2] },
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
      arch: NONE,
      tide: [1],
      dune: [0, 1],
      ledge: shapes('ledgeShrub', 'qa', [0, 1]),
    },
    boats: [0],
    dressing: [1, 2],
    stone: { def: 'boulder', variants: boulders('qa', 0, [2, 4]) },
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
      // TASK-692: one palm shape (the twin trunk) on the harbour beach
      palm: shapes('leanPalm', 'design', [0, 1, 0]),
      flora: shapes('floraBush', 'design', [1, 0]),
      boulder: boulders('design', 1, [1, 4]),
      kelp: [0],
      driftLog: [0],
      arch: shapes('rockArch', 'design', [0, 1]),
      tide: [0],
      dune: NONE,
      ledge: shapes('ledgeShrub', 'design', [0, 1]),
    },
    boats: [2],
    dressing: [0, 3],
    stone: { def: 'boulder', variants: boulders('design', 1, [1, 4]) },
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
      kelp: [1],
      driftLog: [0],
      arch: NONE,
      tide: [1],
      dune: [0, 2],
      ledge: shapes('ledgeShrub', 'research', [1]),
    },
    boats: [2],
    dressing: [1, 2],
    stone: { def: 'boulder', variants: SHARED_STONE },
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
  design: ['deciduous', 'palm'],
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

const { grass, meadow, forest, rock, cliff, sandDry, sandWet, sandBlack, shallow, field, path } =
  Zone;
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
  // TASK-603 kelp beds (D-184): denser clustered beds on the turquoise shelf; the blade tips stay
  // `topClear.below` u under the surface (D-179: the 1.8 u blades broke it off the Colour Wharf)
  {
    def: 'kelp',
    pick: 'kelp',
    themes: ['marketing', 'devops', 'qa', 'design', 'research'],
    zones: [shallow],
    minDist: 1.25,
    density: 0.8,
    slopeMax: 1.5,
    heights: [-3.8, -1.4],
    shore: [-10, -1.5],
    cluster: { scale: 14, threshold: 0.28 },
    scale: [0.8, 1.2],
    maxPerIsland: 22,
    topClear: { heights: KELP.heights, below: 0.4 },
  },
  // ---- TASK-692 signature clusters (D-191): appended, so the rules above keep their forks
  // Coding: round-tree groves filling the open pockets of the plateau (`openClear`: none in the
  // slivers between the campus pads), the stock FOLIAGE tree its wreathed quad / nap-grove
  // fixtures already draw (no new geometry, T0 blobs keep FOLIAGE); a spring-green shrub fringe
  // round them and big lichen tors (boulder outcrops) in their own noise pockets
  {
    def: 'roundTree',
    themes: ['coding'],
    zones: [grass, meadow],
    minDist: 2.9,
    density: 0.95,
    slopeMax: 0.5,
    heights: [1, 30],
    shore: [6, 1000],
    openClear: 2,
    scale: [0.95, 1.25],
    maxPerIsland: 44,
  },
  {
    def: 'floraBush',
    pick: 'flora',
    themes: ['coding'],
    zones: [grass, meadow],
    minDist: 2.2,
    density: 0.85,
    slopeMax: 0.5,
    heights: [1, 30],
    shore: [5, 1000],
    openClear: 1.5,
    scale: [0.9, 1.2],
    maxPerIsland: 24,
  },
  {
    def: 'boulder',
    pick: 'boulder',
    themes: ['coding'],
    zones: [grass, meadow, rock],
    minDist: 2.2,
    density: 0.9,
    slopeMax: 0.9,
    heights: [1, 40],
    shore: [4, 1000],
    openClear: 2,
    cluster: { scale: 14, threshold: 0.2 },
    scale: [1.1, 1.7],
    maxPerIsland: 12,
  },
  // QA (Palmlagoon): mint palms in the open pockets of the plateau, inland of the rim walk (the rim
  // row lost its strip to the Thrill Test Park, TASK-539: 3 palms on 1001), and a grove at the
  // bluff foot under the walk's 3 u (`QA_RIM_WALK.minY`); plateau palms 10 u inland (plans-qa.test
  // reads the cell SDF at > 8.5), and `openClear` 1.5 keeps the canopies off the towers and sheds
  {
    def: 'leanPalm',
    pick: 'palm',
    themes: ['qa'],
    zones: [grass, meadow],
    minDist: 2.8,
    density: 1,
    slopeMax: 0.5,
    heights: [3, 14],
    shore: [10, 1000],
    openClear: 1.5,
    scale: [0.9, 1.2],
    first: true,
    maxPerIsland: 8,
  },
  {
    def: 'leanPalm',
    pick: 'palm',
    themes: ['qa'],
    zones: [sandDry, grass, meadow],
    minDist: 2.2,
    density: 1,
    slopeMax: 0.5,
    heights: [0.3, 2.95],
    shore: [0.5, 12],
    openClear: 1.5,
    scale: [0.9, 1.2],
    first: true,
    maxPerIsland: 8,
  },
  // Design: its pink-plum palms on the low shore (harbour beach, bluff-foot strips); the dome above
  // stays palm-free (TREE_SPECIES §4). ≥ 2.5 u inland: a palm on the waterline hung its T0 blob
  // over the water (low ladder L-pairs-design, boundary 380: blob 0.5 %). TASK-696: 5 u apart so
  // each crown reads on its own at T1 (2.2 u merged four into one pink mass), on the gentle shore
  // slopes too (slope 0.7, `openClear` 1) so the wider spacing still finds six
  {
    def: 'leanPalm',
    pick: 'palm',
    themes: ['design'],
    zones: [sandDry, grass, meadow, forest],
    minDist: 5,
    density: 1,
    slopeMax: 0.7,
    heights: [0.3, 5],
    shore: [2.5, 12],
    openClear: 1,
    scale: [0.85, 1.15],
    first: true,
    maxPerIsland: 7,
  },
  // TASK-696 Research (Lonely Palm): cypress in the last free spots of the campus. The pads leave no
  // pocket for a grove (D-191: 4 cypress) and the lawn strips beside the paths and the Star Stair are
  // structure pads too, so single trees take any open spot ≥ 0.8 u from a site mark, on gentle
  // slopes as well (≤ 0.9: the shoulders under the rim)
  {
    def: 'canopyTree',
    pick: 'canopy',
    themes: ['research'],
    zones: [grass, meadow, forest],
    minDist: 2.4,
    density: 1,
    slopeMax: 0.9,
    heights: [1, 30],
    shore: [2, 1000],
    openClear: 0.8,
    scale: [0.9, 1.1],
    maxPerIsland: 8,
  },
];

/**
 * Coast micro-landscape rules (TASK-603, D-184): after every other prop (own fork
 * `coast-props`, island, rule), so nothing placed before moves. Dune crest grass on the
 * backshore sand, shrubs on the bluff wall faces. The arches, sea stacks, tide-pool fields,
 * waterfall foot rocks are passes (COAST_FEATURES): their spots are a thin band the Poisson
 * seeding of a wide-spaced rule misses.
 */
export const COAST_RULES: readonly BiomeRule[] = [
  // dune ridge: crest grass clumps in a band behind the beach, gapped by cluster noise
  {
    def: 'duneGrass',
    pick: 'dune',
    themes: ['qa', 'research'],
    zones: [sandDry, sandWet, grass],
    minDist: 1.15,
    density: 0.85,
    slopeMax: 0.7,
    heights: [0.45, 3],
    shore: [1.4, 6.5],
    cluster: { scale: 8, threshold: 0.05 },
    scale: [0.8, 1.25],
    maxPerIsland: 48,
  },
  // cliff ledges: shrub clumps hanging just under the wall top, back to the wall, spilling over
  // the lip toward the sea (mid-wall puffs read as stuck-on balls, W13 first try)
  {
    def: 'ledgeShrub',
    pick: 'ledge',
    themes: ['hq', 'marketing', 'coding', 'devops', 'qa', 'design', 'research'],
    zones: [cliff, rock],
    minDist: 1.1,
    density: 1,
    slopeMin: 0.9,
    slopeMax: 99,
    heights: [1.4, 40],
    shore: [0.5, 16],
    cluster: { scale: 10, threshold: -0.1 },
    scale: [0.85, 1.25],
    face: 'downhill',
    // a flat step within 1.5 u up the slope and the wall top itself ≤ 1.8 u above (TASK-695: the
    // flat step alone, at 1 u, passed half way up stepped walls: 14 of 38 shrubs on seed 1001 hung
    // 2.2–7.6 u under the top), and off the falls
    belowLip: 1.5,
    belowTop: { drop: 1.8, reach: 8 },
    fallClear: 1,
    maxPerIsland: 18,
  },
];

/**
 * Structured coast features (TASK-603, D-184), placed before COAST_RULES, each on its own fork.
 * Arch (`coast-arch`, island): headland waterline spots scored by the open water round them,
 * pushed seaward and turned until both legs stand clear of the wall and sea or sky shows through
 * the opening both ways (TASK-682). Sea stacks (`coast-stacks`, island) stand off each arch, off
 * its opening axis. Tide-pool fields (`coast-tide`, island). Fall foot (`coast-fall`, fall):
 * stones in the plunge pool and on the flat foot either side of the fall. (No stream-mouth
 * gravel, TASK-685: the one carved stream, Design's, always ends at the Design harbour, whose
 * pier, glass bridge and paths fill its mouth.)
 */
export const COAST_FEATURES = {
  arch: {
    def: 'rockArch',
    perIsland: 1,
    /** Poisson spacing of the candidates (u) and their window: |shore SDF| ≤ `sdf`, height range. */
    minDist: 3,
    sdf: 1.2,
    heights: [-0.45, 0.6] as const,
    /** Not inside the harbour cove (heightfield `coveness`). */
    maxCove: 0.2,
    /** Headland score: water share of `rays` samples on rings `ring` u out; candidates need ≥ `minWater`. */
    ring: [7, 13] as const,
    rays: 24,
    minWater: 0.58,
    /**
     * TASK-682 siting: from each waterline candidate the arch is pushed seaward 0…`pushMax` u in
     * `pushStep` steps and turned through `yaws` opening axes (over a half turn). A fit stands
     * on its legs (leg axes ± `legAt`[variant] × scale along the span, sampled ± `depth` across
     * it): base y = the legs' mean ground, inside `base`; each leg's ground within + `legBury` /
     * − `legFloat` u of it (no leg inside a wall, none in the air), the outer flank of each foot
     * (leg + `tube`) no more than `flankBury` u under ground; under the opening (span
     * within `legAt` − `tube`) the ground stays `openClear` u under the line between the feet.
     * View, both ways along the opening axis: sight lines from an eye looking down `eyeSlope`
     * (drop per u, a cam a few u up) through `openAt` of the opening height at `viewLat` u
     * across it, walked `viewStep` u to `viewRun` u: a line that meets the sea or runs out sees
     * sea / sky, one that meets the ground first sees a wall. Each side needs ≥ `minView` clear.
     * Score = the weaker side + `headland` × the ring score − `pushCost` × push (u).
     */
    pushMax: 6,
    pushStep: 0.5,
    yaws: 16,
    legAt: [1.7, 2.1, 2.6] as const,
    depth: 0.6,
    base: [-0.9, 0.45] as const,
    legBury: 0.45,
    legFloat: 0.45,
    flankBury: 0.6,
    tube: 0.7,
    openClear: 0.25,
    eyeSlope: [0.2, 0.32] as const,
    openAt: [0.3, 0.6, 0.85] as const,
    viewLat: [-0.6, 0, 0.6] as const,
    viewRun: 30,
    viewStep: 0.5,
    minView: 0.8,
    headland: 0.3,
    pushCost: 0.02,
    /** Occupancy disc (u) and clearances from a boat route / seamark sample and a dock (u). */
    radius: 2.4,
    routeClear: 6,
    /** Clear of a waterfall foot (its foam disc, mist and rock ring). */
    fallClear: 12,
    dockClear: 14,
    scale: [0.95, 1.15] as const,
  },
  stacks: {
    /**
     * Stones off each arch: count range, distance seaward (u) and along the shore (u) of the arch;
     * none within `axisClear` u of the opening axis (they would block the view through it).
     */
    count: [2, 3] as const,
    axisClear: 2.5,
    out: [2.6, 6] as const,
    along: 5,
    heights: [-0.45, 0.3] as const,
    scale: [0.85, 1.45] as const,
    tries: 10,
  },
  tide: {
    /**
     * Tide-pool fields (`coast-tide`, island): a rock shelf with pools on the flat wet shore at
     * the waterline, never in the water. Candidates on a `minDist` Poisson set, taken in a
     * shuffled order at least `spacing` u apart.
     */
    def: 'tidePoolField',
    perIsland: 2,
    zones: [sandWet, sandBlack, rock] as readonly number[],
    minDist: 2.5,
    shore: [0.3, 2.4] as const,
    heights: [0.06, 0.8] as const,
    slopeMax: 0.45,
    spacing: 22,
    scale: [0.8, 1] as const,
  },
  fall: {
    /** Stones round each waterfall foot: count range, ring radius past half the fall width (u). */
    count: [4, 6] as const,
    ring: [0.4, 4] as const,
    /** Offset along the fall direction (u; + = out to sea). */
    along: [-0.6, 4.5] as const,
    /**
     * In the plunge pool or on the flat foot only (TASK-684: slope cap 2 and up to 1.8 u high put
     * stones on the wall face), tops above the water.
     */
    heights: [-0.55, 0.6] as const,
    slopeMax: 0.7,
    /** Smaller than the old 0.7–1.3: the flat foot is a narrow strip, big stones filled it at 2–3. */
    scale: [0.5, 0.95] as const,
    tries: 120,
  },
} as const;

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
