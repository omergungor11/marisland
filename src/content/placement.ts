/**
 * Prop placement rules (ARCHITECTURE §2 step 7, ART_BIBLE §4/§5). Data only.
 * Layers run in priority order: landmarks → buildings → trees → rocks → bushes → micro → ground cover.
 */
import type { ArchetypeId } from '../world/types.ts';
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
    heights: [0.3, 6],
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

/** Keep props out of the crater floor etc. */
export const BLOCKED_ZONES: number[] = [crater, path, plaza];

/** Occupancy grid resolution in u (ARCHITECTURE §2). */
export const OCCUPANCY_CELL = 1;
/** Capacity of the prop store. */
export const PROP_CAPACITY = 70000;
/** Ground-cover total cap (instances) regardless of quality; the batcher gates by chunk. */
export const GROUND_COVER_CAP = 36000;
