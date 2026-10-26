/**
 * Prop placement rules (ARCHITECTURE §2 step 7, ART_BIBLE §4/§5). Data only.
 * Layers run in priority order: landmarks → buildings → trees → rocks → bushes → micro → ground cover.
 */
import type { ArchetypeId, IsletKind } from '../world/types.ts';
import { Zone } from '../world/types.ts';

export interface PlacementRule {
  /** PROP_DEFS id. */
  def: string;
  /** Zones that accept the prop (sampled at the candidate). */
  zones: number[];
  /** Poisson disc radius in u (≈ spacing). */
  minDist: number;
  /** Acceptance probability 0–1 after all filters (thins the Poisson set). */
  density: number;
  /** Max terrain slope (rise/run). */
  slopeMax: number;
  /** Height range in u. */
  heights: [number, number];
  /** Shore SDF range in u (positive = inland). */
  shore?: [number, number];
  /** Low-frequency cluster noise: accept where fbm(xz / scale) > threshold → groves/meadows, not sprinkle. */
  cluster?: { scale: number; threshold: number };
  /** Uniform scale range. */
  scale: [number, number];
  /** Only on these archetypes (all when omitted). */
  archetypes?: ArchetypeId[];
  /** Hard cap per island. */
  maxPerIsland?: number;
  /** Zone ids to keep clear of (within `avoidDist` u). */
  avoid?: number[];
  avoidDist?: number;
  /** Only on Millbrook fields of these hues (indices into palette FIELDS). */
  fieldColors?: number[];
  /**
   * Crop rows: snap to a lattice of this spacing (u) aligned with the island's field
   * patches and face along them, so rows read as tilled rows, not scattered sticks.
   */
  fieldRows?: number;
  /** One instance at the body's peak sample instead of a Poisson set (the Lonely Palm). */
  atPeak?: boolean;
  /**
   * Only within `nearDist` u of one of these zones (8 directions at `nearDist` and half of it):
   * rows along a painted feature, e.g. the QA palm rim along the rim walkway (TASK-480).
   */
  near?: number[];
  nearDist?: number;
  /** Placed before every other rule of the body (its rng fork index is unchanged): rows that must win their spots. */
  first?: boolean;
}

const {
  grass,
  meadow,
  forest,
  field,
  sandDry,
  sandWet,
  rock,
  cliff,
  lagoon,
  sandBlack,
  crater,
  path,
  plaza,
} = Zone;

export const PLACEMENT_RULES: readonly PlacementRule[] = [
  // ---- trees (T1)
  {
    def: 'palm',
    zones: [sandDry, grass],
    minDist: 5,
    density: 0.8,
    slopeMax: 0.5,
    // up to the bluff rim (TASK-390: Hearthholm's plateau stands 6–7.5 u above its walls)
    heights: [0.3, 10],
    shore: [1, 14],
    cluster: { scale: 22, threshold: -0.02 },
    scale: [0.85, 1.2],
    archetypes: ['hearthholm'],
    maxPerIsland: 22,
  },
  {
    def: 'palm',
    zones: [sandDry, grass],
    minDist: 4.5,
    density: 0.9,
    slopeMax: 0.5,
    heights: [0.3, 6],
    shore: [1, 14],
    cluster: { scale: 22, threshold: -0.15 },
    scale: [0.85, 1.2],
    archetypes: ['palmlagoon'],
    maxPerIsland: 80,
  },
  {
    def: 'roundTree',
    zones: [grass, meadow, forest],
    minDist: 3.6,
    density: 0.85,
    slopeMax: 0.55,
    heights: [1.0, 30],
    shore: [3, 1000],
    cluster: { scale: 34, threshold: 0.05 },
    scale: [0.8, 1.25],
    archetypes: ['hearthholm', 'millbrook', 'mossgrove', 'beaconrock'],
  },
  {
    def: 'pine',
    zones: [forest, grass, rock],
    minDist: 3.2,
    density: 0.9,
    slopeMax: 0.8,
    heights: [2, 40],
    shore: [3, 1000],
    cluster: { scale: 28, threshold: -0.05 },
    scale: [0.8, 1.3],
    archetypes: ['mossgrove', 'beaconrock', 'emberpeak'],
  },
  {
    def: 'pine',
    zones: [forest],
    minDist: 4,
    density: 0.5,
    slopeMax: 0.7,
    heights: [3, 40],
    shore: [4, 1000],
    cluster: { scale: 30, threshold: 0.2 },
    scale: [0.8, 1.2],
    archetypes: ['hearthholm', 'millbrook'],
  },
  {
    def: 'giantMushroom',
    zones: [forest],
    minDist: 9,
    density: 0.5,
    slopeMax: 0.5,
    heights: [2, 30],
    scale: [0.9, 1.4],
    archetypes: ['mossgrove'],
    maxPerIsland: 14,
  },
  // ---- rocks (T1)
  {
    def: 'rockCluster',
    zones: [rock, cliff, sandDry, grass, sandBlack],
    minDist: 7,
    density: 0.45,
    slopeMax: 2,
    heights: [0.3, 60],
    scale: [0.7, 1.3],
    avoid: [field],
    avoidDist: 3,
  },
  {
    def: 'rockCluster',
    zones: [sandWet, sandDry],
    minDist: 9,
    density: 0.3,
    slopeMax: 2,
    heights: [0, 1.5],
    scale: [0.6, 1.0],
  },
  // ---- bushes & farm (T2)
  {
    def: 'bush',
    zones: [grass, meadow],
    minDist: 3,
    density: 0.55,
    slopeMax: 0.6,
    heights: [0.8, 30],
    shore: [2, 1000],
    cluster: { scale: 18, threshold: 0.1 },
    scale: [0.8, 1.3],
  },
  {
    def: 'cropRow',
    zones: [field],
    minDist: 2.4,
    density: 1,
    // wheat, dark crop and ploughed soil get rows; lavender and tulip fields stay open (D11)
    fieldColors: [0, 1, 2],
    fieldRows: 2.6,
    slopeMax: 0.4,
    heights: [1, 20],
    scale: [0.9, 1.1],
    archetypes: ['millbrook', 'hearthholm'],
  },
  {
    def: 'haybale',
    zones: [field, meadow],
    minDist: 8,
    density: 0.5,
    slopeMax: 0.4,
    heights: [1, 20],
    scale: [0.9, 1.15],
    archetypes: ['millbrook'],
    maxPerIsland: 12,
  },
  // ---- micro / ground cover (T3)
  {
    def: 'reeds',
    zones: [sandWet, lagoon],
    minDist: 1.6,
    density: 0.6,
    slopeMax: 0.5,
    heights: [-0.4, 0.6],
    cluster: { scale: 12, threshold: 0.15 },
    scale: [0.8, 1.3],
  },
  {
    def: 'lilyPad',
    zones: [lagoon],
    minDist: 1.4,
    density: 0.4,
    slopeMax: 1,
    heights: [-4, 0],
    cluster: { scale: 10, threshold: 0.25 },
    scale: [0.8, 1.2],
    archetypes: ['palmlagoon', 'millbrook'],
  },
  {
    def: 'grassTuft',
    zones: [grass, meadow, forest],
    minDist: 1.5,
    density: 0.75,
    slopeMax: 0.8,
    heights: [0.5, 40],
    scale: [0.8, 1.4],
  },
  {
    def: 'flower',
    zones: [meadow, grass],
    minDist: 1.3,
    density: 0.6,
    slopeMax: 0.6,
    heights: [0.8, 30],
    cluster: { scale: 14, threshold: 0.2 },
    scale: [0.8, 1.3],
  },
];

/**
 * Islet scatter (TASK-471, D-058 `W:D2/K6`): the skerries carry a few rock clusters on their
 * rock / cliff; the Lonely Palm sandbar gets exactly one palm (`maxPerIsland` 1, the islet's
 * own `rng.fork('props', isletId, ruleIndex)`) and a rock or two at the waterline.
 */
export const ISLET_SCATTER: Readonly<Record<IsletKind, readonly PlacementRule[]>> = {
  skerry: [
    {
      def: 'rockCluster',
      zones: [rock, cliff],
      minDist: 4,
      density: 0.8,
      slopeMax: 2.5,
      heights: [0.3, 60],
      scale: [0.8, 1.3],
      maxPerIsland: 3,
    },
  ],
  sandbar: [
    {
      def: 'palm',
      zones: [sandDry, sandWet],
      minDist: 3,
      density: 1,
      slopeMax: 2,
      heights: [0, 3],
      scale: [1.1, 1.3],
      maxPerIsland: 1,
      atPeak: true,
    },
    {
      def: 'rockCluster',
      zones: [sandWet],
      minDist: 4,
      density: 0.5,
      slopeMax: 1,
      heights: [0, 1],
      scale: [0.5, 0.8],
      maxPerIsland: 2,
    },
  ],
};

/** Keep props out of the crater floor etc. */
export const BLOCKED_ZONES: number[] = [
  crater,
  path,
  plaza,
  Zone.streetHq,
  Zone.streetCoding,
  Zone.streetMarketing,
  Zone.streetQa,
  Zone.streetDesign,
  Zone.streetDevops,
  Zone.streetResearch,
];

/** Occupancy grid resolution in u (ARCHITECTURE §2). */
export const OCCUPANCY_CELL = 1;
/** Capacity of the prop store. */
export const PROP_CAPACITY = 70000;
/** Ground-cover total cap (instances) regardless of quality; the batcher gates by chunk. */
export const GROUND_COVER_CAP = 36000;

/**
 * Story-spot keep-out (TASK-485, `world/gen/story-keepout.ts`): planner fixtures that are not the
 * spot's own props, and scatter trees / bushes, stay off the spot's stage. `route` = clearance (u)
 * round a walking critter's path (cross / pace), `stand` = round a pacing bot's beat, an orbit and a
 * critter or tableau bot that stays put. Elevated critters / bots (on a roof, deck, cab) have none.
 * `tall`: these pole defs keep `extra` u more off (a windsock 1.8 u from the Coding duck route hid
 * the ducks from every angle; desks and hedges that close only frame the scene).
 * `own` = radius round the spot within which its own story props (defs, anchors, look-ats) stay;
 * `pass` = fixture defs that never yield (overhead spans: the stage passes under them).
 */
export const STORY_KEEP_OUT = {
  route: 0.9,
  stand: 0.8,
  tall: {
    extra: 1.3,
    defs: ['windsock', 'bannerPole', 'flagMast', 'lanternPost', 'balloonMast'] as readonly string[],
  },
  own: 8,
  pass: ['pennantLine'] as readonly string[],
} as const;
