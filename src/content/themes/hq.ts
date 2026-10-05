/** HQ / Orchestrator (Hearthholm, harbour crescent) — M14b plan §2.1. */
import { FOLIAGE } from '../palette.ts';
import { Zone } from '../../world/types.ts';
import type { ThemeDef } from './index.ts';

const { grass, meadow } = Zone;

/** Civic lawn and flowering-lawn hexes (plan §2.1), shared by the ground table and the beds. */
const LAWN = '#8FCB62';

export const HQ_THEME: ThemeDef = {
  id: 'hq',
  displayName: 'HQ',
  short: 'HQ',
  icon: 'hub',
  accent: '#E8735A',
  teamTints: ['#E8735A', '#F09A7E', '#D45F4A'],
  // Harbour Row: offices along the lanes, a pavilion now and then (the Meeting Garden has its own)
  lotMix: [
    ['hqOffice', 4],
    ['meetingPavilion', 1],
  ],
  crown: 'hqAnnex',
  defSwap: { cottage: 'hqOffice', towerHouse: 'hqAnnex', marketStall: 'coffeeKiosk' },
  landmarkVariant: { clocktower: 2 },
  decor: [
    ['bench', 2],
    ['flowerBed', 2],
    ['lanternPost', 1],
  ],
  pathLanterns: 0.6,
  plazaDecor: { posts: 'lanternPost', seats: 'bench', across: null },
  workers: { weight: 1.4, cap: 12, deskShare: 0.5 },
  accessory: 0,
  ground: {
    [Zone.grass]: { material: 'lawn', base: LAWN, layer: { mow: { amplitude: 0.03, period: 3 } } },
    [Zone.meadow]: {
      material: 'meadow',
      base: '#A9D86E',
      layer: { speckle: ['#FF8A70', '#FFFFFF'] },
    },
    [Zone.forest]: { material: 'forest', base: '#5E9E4A' },
    [Zone.sandDry]: { material: 'sand', base: '#F3DDB0' },
    [Zone.sandWet]: { material: 'sand', base: '#DDB884' },
    [Zone.rock]: { material: 'rock', base: '#A3A7B2' },
    [Zone.path]: {
      material: 'paving',
      base: '#D9C7A4',
      layer: { tile: { size: 0.9, grout: '#B8A27E' } },
    },
    [Zone.plaza]: {
      material: 'paving',
      base: '#D8B894',
      layer: { tile: { size: 1.4, grout: '#C98A6A' } },
    },
    [Zone.field]: { material: 'lawn', base: LAWN },
  },
  // a campus of lawns: fewer, smaller park groves; flowering lawn patches a little more common
  zoneRules: { forestThreshold: 0.3, meadowThreshold: 0.16 },
  patchwork: 'off',
  // the plan places the Orchestrator Tower itself (Central Quad, plans/hq.ts)
  landmarks: {},
  scatter: [
    // flower beds dotted over the flowering lawn
    {
      def: 'flowerBed',
      zones: [meadow, grass],
      minDist: 7,
      density: 0.5,
      slopeMax: 0.3,
      heights: [0.8, 20],
      shore: [5, 1000],
      cluster: { scale: 16, threshold: 0.15 },
      scale: [0.9, 1.15],
      maxPerIsland: 14,
    },
  ],
  scatterOff: ['cropRow', 'haybale'],
  // creature weights: content/life.ts THEME_LIFE (TASK-379)
  life: {},
  // palette FOLIAGE: a canopy of its own would add a T0 blob colour class (draw calls, D-033)
  treePalette: FOLIAGE,
};

/**
 * HQ campus layout (plans/hq.ts), plan §2.1 districts: Central Quad, Harbour Row, Meeting Garden,
 * Ferry Terminal, avenue trees. Distances in u, angles in degrees from the quad → harbour heading.
 */
export const HQ_PLAN = {
  quad: {
    radius: 7,
    /** Search around the harbour anchor (grows by VILLAGE.searchGrow, 5 steps). */
    search: 25,
    minShore: 7,
  },
  /** Orchestrator Tower: inland side of the quad, this far in from the quad edge. */
  tower: { inset: 2.4, slide: [0, 30, -30, 60, -60] },
  /** Coffee kiosks on the quad edge flanking the harbour lane, facing the centre. */
  kiosks: { count: 2, angles: [42, -42, 100, -100, 150, -150], inset: 1.1 },
  /** Harbour moorings at the ferry pier. */
  moorings: { rowboats: [2, 3] as const, sailboats: [1, 2] as const },
  /** Ferry office beside the pier root, in the shallows (pivot = water level). */
  ferry: {
    side: 3.6,
    along: [1, 2, 0, 3, -0.5],
    /** Ground under the office (u): shallow water to the wet sand. */
    depth: [-0.55, 0.35] as const,
    radius: 2.2,
  },
  /** Meeting Garden: a flat lawn disc off the quad with a pavilion ringed by flower beds. */
  garden: {
    /** Min distance from the quad centre; passes tried in order (max footprint relief, max distance). */
    inner: 15,
    passes: [
      { maxRelief: 2, outer: 34 },
      { maxRelief: 3.5, outer: 46 },
    ],
    radius: 5.5,
    minShore: 6,
    beds: [5, 7] as const,
    bedRing: 4.3,
    benches: 2,
    /** Ground under the garden disc becomes flowering lawn (meadow) where it was lawn / grove. */
    paint: Zone.meadow,
  },
  /** Avenue: trees at `spacing` along every lane, `offset` either side; lanterns / benches between. */
  avenue: {
    def: 'roundTree',
    spacing: 6,
    offset: 3.5,
    /** Start past the quad edge. */
    start: 3,
    clear: 1.0,
    lanternEvery: 3,
    lanternOffset: 2.2,
    bench: { every: 4, offset: 2.4 },
  },
  /** Inland dry sand → civic lawn within these pads of the quad edge / lot footprints (u). */
  lawn: { minShore: 4, quadPad: 14, lotPad: 6 },
  /** Banner pairs where the first `lanes` lanes leave the quad, and at the pier root (coral / cream). */
  banners: { gate: 1.7, out: 1.6, lanes: 2, pierClear: 10 },
} as const;
