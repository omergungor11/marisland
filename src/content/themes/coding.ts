/**
 * Coding (Millbrook, flat plateau) — M14b plan §2.2, TASK-363. A modern tech campus: wind
 * turbines on the profile knolls, a solar farm on the profile patch rectangles, a Tech Park
 * (devOffice rows facing a mown lawn quad with the pond turned into a reflecting pool), a Server
 * Yard and a Hack Garden. No farm leftovers: no windmills, crops, hay, barns, cottages, fences or
 * sheep. The planner is world/gen/plans/coding.ts; the numbers it uses are `CODING_PLAN` below.
 */
import { FOLIAGE } from '../palette.ts';
import type { CampusSpec } from '../settlements.ts';
import type { PlacementRule } from '../placement.ts';
import { Zone } from '../../world/types.ts';
import type { ThemeDef } from './index.ts';

/** Coding ground (plan §2.2 hexes). `crater` (never generated on Millbrook) is the reflecting pool. */
const GROUND: ThemeDef['ground'] = {
  // tech lawn with mow stripes (±4 % L, 3 u)
  [Zone.grass]: {
    material: 'lawn',
    base: '#7CC85A',
    layer: { mow: { amplitude: 0.04, period: 3 } },
  },
  // clover meadow (white / pink clover heads)
  [Zone.meadow]: {
    material: 'meadow',
    base: '#96D06A',
    layer: { speckle: ['#FFFFFF', '#F4C9DD'] },
  },
  // solar gravel under the panel rows (field = solar districts + the server yard)
  [Zone.field]: { material: 'gravel', base: '#B9B4A8' },
  // tidy grove
  [Zone.forest]: { material: 'forest', base: '#5DAE4B' },
  // light concrete paths
  [Zone.path]: { material: 'path', base: '#D6D3CB', layer: { amplitude: 0.5 } },
  // blue-grey pavers (pool surround)
  [Zone.plaza]: {
    material: 'paving',
    base: '#C9CED6',
    layer: { tile: { size: 1, grout: '#8A93A0' } },
  },
  // reflecting pool: still blue-teal water look (ripples only)
  [Zone.crater]: {
    material: 'paving',
    base: '#5E9FD2',
    layer: { layers: ['ripples'], amplitude: 0.5 },
  },
};

/** Theme scatter (the global roundTree / pine / bush rules are off on this island). */
const SCATTER: PlacementRule[] = [
  // tidy groves: round trees only where the zone rules grew forest
  {
    def: 'roundTree',
    zones: [Zone.forest],
    minDist: 4.2,
    density: 0.85,
    slopeMax: 0.55,
    heights: [1.0, 30],
    shore: [3, 1000],
    scale: [0.9, 1.15],
  },
  // a few clipped shrubs on the clover meadows
  {
    def: 'bush',
    zones: [Zone.meadow],
    minDist: 6,
    density: 0.35,
    slopeMax: 0.5,
    heights: [0.8, 30],
    shore: [3, 1000],
    cluster: { scale: 18, threshold: 0.15 },
    scale: [0.8, 1.1],
  },
];

/**
 * Planner numbers (world/gen/plans/coding.ts). Lengths in u. The campus frame is the profile
 * patch grid: `u` along the patch axis (FieldPatchData.rotY), `v` across it.
 */
export const CODING_PLAN = {
  turbine: {
    /** Obstacle radius at the foot and flatten pad radius. */
    radius: 1.6,
    flatten: 2,
    /** Turbines in all: knolls first, then the highest free plateau spots. */
    count: 3,
    /** Extra turbines: min shore distance and min spacing to turbines / campus centre. */
    minShore: 7,
    spacing: 18,
    /** Extra turbines keep this gap to every obstacle (open ground around the mast). */
    gap: 4,
  },
  park: {
    /** Lawn quad half extents (u, v). */
    lawn: [12.5, 7] as const,
    /** Perimeter walk offset past the lawn edge. */
    walk: 1.6,
    /** Paved spine (u, v) of blue-grey pavers: the central plaza disc between twin pools. */
    paving: [19, 6.2] as const,
    plazaR: 3.2,
    /** Twin reflecting pools (the pond): size (u, v), centres at ±poolU. */
    pool: [5.2, 3.2] as const,
    poolU: 6.2,
    /** Office rows: centres along u, gap between the walk and the lot front edge. */
    slots: [-8.2, 0, 8.2] as const,
    rowGap: 2.8,
    /** Rows facing the quad: [+v row, −v row] lot defs per slot. */
    rows: [
      ['devOffice', 'devOffice', 'devOffice'],
      ['devPod', 'devOffice', 'devPod'],
    ] as const,
    /** Footprint limits for office slots (before flattening). */
    minShore: 4,
    maxRelief: 2.6,
    /** Move the park this far toward the island centre (steps) when the pond sits near the coast. */
    shift: [0, 3, 6, 9, 12] as const,
    /** Pond fill: blend the dip up to the surrounding plateau inside [r0, r1]. */
    fill: [7, 11.5] as const,
    fillRing: [12, 15] as const,
    /** Trees in rows across both quad ends (v offsets) at this u inset from the lawn end. */
    treeV: [-4.6, 0, 4.6] as const,
    treeInset: 1.4,
    /** Clipped hedges along the long lawn edges (u centres), inset from the edge. */
    hedgeU: [-8.6, -6.4, 6.4, 8.6] as const,
    hedgeInset: 0.6,
  },
  yard: {
    /** Server Yard rect (u, v), shed slots along u, search ring around the park. */
    size: [13, 7] as const,
    slots: [-4, 0, 4] as const,
    ring: [24, 40] as const,
    maxRelief: 1.6,
    minShore: 5,
  },
  garden: {
    /** Hack Garden rect (u, v): hedge border, desk pairs (benches), bike rack at the entrance. */
    size: [10, 7] as const,
    ring: [20, 38] as const,
    maxRelief: 1.4,
    minShore: 5,
  },
  solar: {
    /** Sample step inside a patch rectangle when trimming it to clean ground. */
    step: 1,
    /** Trimmed rect shrinks by this per side (service lanes between neighbouring blocks). */
    inset: 0.5,
    /**
     * Blocks snap to the panel lattice render lays over a `solar` district
     * (render/props/settlement-props.ts DISTRICT_LATTICE: rows `pitch` apart, `len` segments,
     * `margin` at the edges; `depth` = a row's panel depth). Smallest block: [segments, rows].
     */
    lattice: { len: 5, pitch: 3, margin: 1.5, depth: 1.5 },
    minLattice: [2, 2] as const,
    /** Below this farm area (u²) the other cells of the patch grid take solar blocks too. */
    minArea: 450,
    /** Ground a block may cover: slope, height floor, shore distance, clearance to obstacles. */
    maxSlope: 0.4,
    minHeight: 1,
    minShore: 3,
    clear: 1,
  },
  dock: { maxDist: 20, lee: 40, rowboats: [1, 2] as const },
  /** Lot floor: devPods ringed around the park until this many lots stand. */
  minLots: 7,
  /** Campus spec of the fallback ring (sites.ts placeNear). */
  fill: {
    lots: [7, 7],
    quadR: 12,
    quadSearch: 0,
    quadMinShore: 0,
    quadMaxRelief: 0,
    quadLee: 0,
    minShore: 4,
    maxRelief: 2.2,
    lanes: [],
    laneLength: 0,
    ring: [4, 16],
    maxFieldSamples: 5,
  } satisfies CampusSpec,
} as const;

export const CODING_THEME: ThemeDef = {
  id: 'coding',
  displayName: 'Coding',
  short: 'CODE',
  icon: 'code',
  accent: '#5B9BE6',
  teamTints: ['#5B9BE6', '#82B6F0', '#4479C9'],
  lotMix: [
    ['devOffice', 3],
    ['devPod', 2],
    ['serverShed', 1],
  ],
  crown: null,
  defSwap: {},
  landmarkVariant: {},
  decor: [
    ['bikeRack', 2],
    ['hedge', 2],
    ['bench', 1],
  ],
  pathLanterns: 0.5,
  plazaDecor: { posts: 'lanternPost', seats: 'hedge', across: null },
  workers: { weight: 1.6, cap: 12, deskShare: 0.6 },
  accessory: 1,
  ground: GROUND,
  // tidy campus: fewer, rounder groves
  zoneRules: { forestThreshold: 0.3 },
  // the planner trims the profile patch rectangles into solar districts (no farm hues, no fences)
  patchwork: 'districts',
  // turbine heights by knoll rank: variant 0 = 15 u (the dominant one), 1 = 12 u, 2 = 10 u
  landmarks: {
    knoll0: { kind: 'windTurbine', variant: 0 },
    knoll1: { kind: 'windTurbine', variant: 1 },
    knoll2: { kind: 'windTurbine', variant: 2 },
  },
  scatter: SCATTER,
  scatterOff: ['cropRow', 'haybale', 'roundTree', 'pine', 'bush'],
  // creature weights: content/life.ts THEME_LIFE (coding: no sheep)
  life: {},
  // scatter trees are the shared roundTree geometry (palette FOLIAGE); blobs must match them
  treePalette: FOLIAGE,
};
