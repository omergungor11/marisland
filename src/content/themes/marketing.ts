/** Marketing (Beacon Rock, sea stack) — M14b plan §2.4. */
import { FOLIAGE } from '../palette.ts';
import { PLACEMENT_RULES } from '../placement.ts';
import { Zone } from '../../world/types.ts';
import type { ThemeDef } from './index.ts';

/** Brand lawn: grass and meadow alike, magenta / coral flower speckle. */
const BRAND_LAWN = {
  material: 'meadow',
  base: '#9BD66A',
  layer: { speckle: ['#E0457B', '#FF7F6B'] },
} as const;

export const MARKETING_THEME: ThemeDef = {
  id: 'marketing',
  displayName: 'Marketing',
  short: 'MKT',
  icon: 'megaphone',
  accent: '#E35D6A',
  teamTints: ['#E35D6A', '#EE8790', '#C9465A'],
  lotMix: [
    ['broadcastStudio', 2],
    ['billboard', 1],
  ],
  crown: null,
  defSwap: {},
  landmarkVariant: { lighthouse: 2 },
  decor: [
    ['flowerBed', 2],
    ['bannerPole', 1],
    ['bench', 1],
  ],
  pathLanterns: 0.4,
  plazaDecor: { posts: 'lanternPost', seats: 'bannerPole', across: 'bunting' },
  workers: { weight: 0.7, cap: 5, deskShare: 0.5 },
  accessory: 2,
  ground: {
    [Zone.grass]: BRAND_LAWN,
    [Zone.meadow]: BRAND_LAWN,
    [Zone.rock]: { material: 'rock', base: '#D9B48F' },
    [Zone.cliff]: { material: 'rock', base: '#C29A74' },
    // red-painted stair decking
    [Zone.path]: {
      material: 'paving',
      base: '#C9675E',
      layer: { layers: ['tiles'], tile: { size: 0.7, grout: '#8E4A44' } },
    },
    [Zone.plaza]: {
      material: 'paving',
      base: '#E9D3B3',
      layer: { tile: { size: 1.4, grout: '#C9AE88' } },
    },
  },
  // the stack top is lawn, not bare rock (the archetype makes everything above 30 % of the peak
  // rock); steep faces stay rock / cliff by slope
  zoneRules: { rockAboveFrac: 2, meadowThreshold: 0.15 },
  patchwork: 'off',
  // the Broadcast Tower (variant 2 via landmarkVariant) on the summit anchor
  landmarks: { lighthouse: { kind: 'lighthouse', variant: 2 } },
  // flower clumps on the brand lawn: a denser, clustered copy of the global flower rule
  scatter: PLACEMENT_RULES.filter((r) => r.def === 'flower').map((r) => ({
    ...r,
    minDist: 1.1,
    density: 0.75,
    cluster: { scale: 9, threshold: 0.1 },
  })),
  scatterOff: [],
  life: {},
  treePalette: FOLIAGE,
};

/**
 * Marketing island plan tuning (world/gen/plans/marketing.ts): Landing (dock + megaphone kiosk),
 * Clifftop Stage (quad + stage + banner poles), Studio Ledge (broadcastStudio + billboard lot), two
 * billboardV2 facing the archipelago centre, ad buoys. Lengths in u.
 */
export const MARKETING_PLAN = {
  /** Broadcast tower top above its base (geo/landmarks.ts lighthouse body + lamp room). */
  towerHeight: 11,
  /** Landing dock search around the landing anchor; the stair climbs to the tower. */
  dockSearch: 18,
  /** Megaphone kiosk beside the pier root: ring radii and footprint radius. */
  kioskRing: [3, 7] as const,
  kioskRadius: 0.9,
  /** Stage (geo/themes/marketing.ts stage, 5.8 × 4.2) beside the quad, facing it. */
  stage: { w: 5.8, d: 4.2, gap: 0.6, maxRelief: 2.5 },
  /** Banner poles on the quad edge (count, angle off the stage axis in deg). */
  bannerPoles: [130, -130, 180] as const,
  /** Studio Ledge: billboard office lot within this ring past the studio. */
  billboardLotInner: 2.5,
  /** Extra studios up to this many lots in total (the ledge holds 2–3). */
  lots: [2, 3] as const,
  /** billboardV2 (5.2 u board on posts, 5.7 u tall) facing the archipelago centre. */
  billboard: {
    count: 2,
    w: 5.6,
    d: 1.6,
    height: 5.7,
    /** Shore distance window: on a ledge near the edge, not on the cliff lip. */
    shore: [2.5, 9] as const,
    maxRelief: 1.6,
    /** Within this angle (deg) of the island → archipelago-centre heading. */
    spreadDeg: 75,
    /** Board top at least this far below the tower top (one dominant vertical). */
    belowTower: 1,
    spacing: 9,
  },
} as const;
