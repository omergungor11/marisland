/** DevOps (Emberpeak, volcano) — M14b plan §2.3. */
import { FOLIAGE } from '../palette.ts';
import { Zone } from '../../world/types.ts';
import type { ThemeDef } from './index.ts';

const { grass, meadow, forest, rock, cliff, sandBlack, sandWet, path, plaza } = Zone;

export const DEVOPS_THEME: ThemeDef = {
  id: 'devops',
  displayName: 'DevOps',
  short: 'OPS',
  icon: 'gear',
  accent: '#FF9F43',
  teamTints: ['#FF9F43', '#FFBC78', '#E5822A'],
  lotMix: [
    ['dataCenter', 2],
    ['rackShed', 2],
    ['antennaMast', 1],
  ],
  crown: 'antennaMast',
  defSwap: {},
  landmarkVariant: {},
  decor: [
    ['cableSpool', 2],
    ['warningSign', 1],
    ['crate', 1],
  ],
  pathLanterns: 0.5,
  plazaDecor: { posts: 'lanternPost', seats: 'cableSpool', across: null },
  workers: { weight: 1.0, cap: 8, deskShare: 0.4 },
  accessory: 5,
  ground: {
    [sandBlack]: { material: 'blackSand', base: '#5B5566' },
    [sandWet]: { material: 'blackSand', base: '#4E4958' },
    // lower slopes: dry scrub instead of lawn green
    [grass]: { material: 'grass', base: '#8FA05A' },
    [meadow]: {
      material: 'meadow',
      base: '#98A863',
      layer: { speckle: ['#D9C27A', '#B8A06A'] },
    },
    [forest]: { material: 'forest', base: '#3F6B45' },
    // basalt with cracks (rock), darker walls (rim, notch); lifted from the bible's #4F4C57, which
    // read as a black hole over the whole cone
    [rock]: {
      material: 'rock',
      base: '#7A7584',
      // crack accents in basalt greys (the stock lichen reads as pale blotches on dark rock)
      layer: { layers: ['cracks'], speckle: ['#958FA0', '#5A5664'] },
    },
    [cliff]: {
      material: 'rock',
      base: '#6B6674',
      layer: { layers: ['cracks'], speckle: ['#958FA0', '#5A5664'] },
    },
    // steel grating / dark gravel paths
    [path]: { material: 'gravel', base: '#6E6A72' },
    // concrete pads with yellow safety lines (pad grout)
    [plaza]: {
      material: 'paving',
      base: '#9A979E',
      layer: { layers: ['tiles'], tile: { size: 1.9, grout: '#F5C84C' } },
    },
  },
  // pines stay low (no upper-slope forest)
  zoneRules: { forestThreshold: 0.5, forestMaxFrac: 0.18 },
  patchwork: 'off',
  landmarks: {},
  scatter: [
    {
      def: 'pine',
      zones: [forest, grass],
      minDist: 5,
      density: 0.55,
      slopeMax: 0.7,
      heights: [1.5, 9],
      shore: [4, 1000],
      cluster: { scale: 26, threshold: 0 },
      scale: [0.8, 1.15],
    },
    {
      def: 'basaltBoulder',
      zones: [rock, cliff, sandBlack, grass, meadow],
      minDist: 7,
      density: 0.5,
      slopeMax: 2,
      heights: [0.3, 34],
      scale: [0.7, 1.3],
    },
    {
      def: 'steamVent',
      zones: [rock, grass, meadow],
      minDist: 12,
      density: 0.7,
      slopeMax: 0.9,
      heights: [5, 30],
      scale: [0.9, 1.2],
      maxPerIsland: 7,
    },
    {
      def: 'cableSpool',
      zones: [grass, meadow, sandBlack],
      minDist: 12,
      density: 0.6,
      slopeMax: 0.4,
      heights: [0.5, 14],
      shore: [2, 1000],
      scale: [0.9, 1.1],
      maxPerIsland: 4,
    },
    {
      def: 'warningSign',
      zones: [grass, meadow, rock],
      minDist: 14,
      density: 0.6,
      slopeMax: 0.8,
      heights: [2, 30],
      scale: [0.9, 1.1],
      maxPerIsland: 5,
    },
  ],
  // the theme rules above replace the global pines / rock clusters; dry scrub has no flowers
  scatterOff: ['pine', 'rockCluster', 'flower'],
  // creature weights: THEME_LIFE.devops (none)
  life: {},
  // scatter pines are the stock pine geometry, so blobs keep the stock canopy hexes (D-031)
  treePalette: FOLIAGE,
};

/**
 * DevOps site plan tuning (world/gen/plans/devops.ts). Distances in u, heights in u above sea.
 * Terraces: one dataCenter per pad; consecutive pads stand > 2 lot-pad bounds apart
 * (`spacing`) so FLATTEN.maxStep relaxation never merges them into one plateau, and each next
 * pad sits `rise` lower or higher (a staircase along the lee flank).
 */
export const DEVOPS_SITE = {
  plant: {
    /** Cooling towers: ring around the hot-spring (cooling pool) centre. */
    ring: [7, 13] as const,
    /** Tower obstacle / pad radius and the gap between the two towers' centres. */
    radius: 2,
    pair: [5, 8] as const,
    maxRelief: 3.5,
    minShore: 3,
  },
  terraces: {
    count: [3, 4] as const,
    /** First (top) terrace: distance from the plant. */
    fromPlant: [14, 40] as const,
    spacing: [14, 19] as const,
    rise: [1.5, 6] as const,
    riseTarget: 2.5,
    /** Pad centres within this height band (lee flank: off the beach, below the rim). */
    y: [3, 18] as const,
    minShore: 6,
    maxRelief: 4.5,
    /** Concrete apron around each data center (district rect = footprint + 2 × apron). */
    apron: 1.6,
    /** Every terrace keeps this far from the plant pads (no relaxation with them). */
    plantClear: 14,
    /** Candidate first terraces tried (best first) until a chain of `count[1]` stands. */
    starts: 40,
    /** Min leewardness of a start, per pass (lee flank first, then any side). */
    lee: [0.25, -1] as const,
  },
  quad: {
    /** Ops quad (settlement plaza) radius. */
    radius: 4,
    /** Passes near the top terrace: [max relief, search radius, max level difference] (u). */
    passes: [
      [2.5, 14, 1.2],
      [4, 20, 1.2],
      [6, 26, 1.6],
    ] as const,
    /** Fallback search radius around the plant when no terrace stands. */
    fallbackSearch: 40,
  },
  ridge: {
    /** Antenna masts: distance from the crater centre, min height, spacing between masts. */
    dist: [13, 22] as const,
    minY: 14,
    count: [2, 3] as const,
    gap: 12,
    maxRelief: 4,
    angles: 48,
  },
  yard: {
    /** Rack yard: on black sand nearest the dock root (within this ring). */
    search: [5, 60] as const,
    sheds: 2,
    racks: [2, 3] as const,
    shedGap: 1.8,
    minShore: 2,
    maxRelief: 3.5,
    /** Max shed pad level: the yard stays down on the beach (no raised shelf by the water). */
    maxY: 3.5,
    /** District rect margin around the sheds and racks. */
    margin: 1.2,
  },
  pipeline: {
    /** Pipe route: min shore distance and max slope (rise / run) of a straight run. */
    minShore: 1.5,
    maxSlope: 1.4,
    /** Clearance kept from obstacles (lots, landmarks, fixtures) except its two ends. */
    clear: 0.9,
    /** Obstacle half-width registered along the pipe (scatter keeps off it). */
    halfWidth: 0.6,
  },
  dock: { rowboats: [1, 2] as const },
} as const;
