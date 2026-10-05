/** Design / Art (Mossgrove, forest dome) — M14b plan §2.6 (TASK-367). */
import { FOLIAGE } from '../palette.ts';
import type { CampusSpec } from '../settlements.ts';
import { Zone } from '../../world/types.ts';
import type { ThemeDef } from './index.ts';

const { grass, meadow, forest } = Zone;

/**
 * Site layout of the Design island (world/gen/plans/design.ts): an art campus in the forest.
 * - Atelier Glade: ateliers + gallery pavilions around a mosaic quad (lanes + ring fill).
 * - Sculpture Garden: an open, levelled meadow clearing with primary-colour T0 sculptures.
 * - Easel Walk: easels on one bank of the stream, facing the water, linked into a bank path.
 * - Mushroom Grove: a cluster of giant mushrooms in the forest.
 */
export const DESIGN_SITES = {
  glade: {
    lots: [4, 6],
    quadR: 4.5,
    quadSearch: 25,
    quadMinShore: 6,
    quadMaxRelief: 2.5,
    quadLee: 0,
    minShore: 4,
    maxRelief: 2.5,
    lanes: [0, 75, -75, 140, -140, 35, -35, 108, -108, 160, -160],
    laneLength: 26,
    ring: [3, 20],
    maxFieldSamples: 5,
  } satisfies CampusSpec,
  clearing: {
    /** Disc radius (u): ≥ 6 so the clearing is ≥ 12 u wide (plan §5 TASK-367). */
    radius: 7,
    /** Max relief over the disc before levelling, tried in order (u). */
    maxRelief: [2, 3, 4.5, 6, 8, 10],
    /** Preferred distance from the quad centre (u); score cost per u off it. */
    quadDist: 24,
    quadDistCost: 0.04,
    /** Gap to other obstacles (quad, tree, lots) and to the stream line past the radius (u). */
    gap: 2.5,
    streamClear: 3,
    /** Sculptures: count range, kinds cycled in a seeded order, on an arc at this fraction of the radius. */
    sculptures: [3, 5] as const,
    kinds: ['sculptureTorus', 'sculptureStack', 'sculptureArch'] as const,
    ringFrac: 0.55,
    /** Open arc of the ring toward the quad (deg): the garden path enters there. */
    entranceDeg: 100,
  },
  easels: {
    count: [4, 5] as const,
    /** Bank offsets from the stream centre line tried in order (u), spacing along it (u). */
    offsets: [3.4, 2.8, 4.2],
    spacing: 6,
    /** Max relief over a 1.2 u disc at the easel (u): the stream runs down the steep dome flank. */
    maxRelief: 2,
    radius: 0.7,
    /** Bank path pin this far behind the easel (u). */
    pinBack: 1.6,
  },
  grove: {
    mushrooms: [5, 7] as const,
    radius: 6,
    /** Mushroom spacing and obstacle radius (u). */
    spacing: 2.6,
    mushroomR: 1.1,
    /** Distance from the quad and the clearing (u). */
    minSep: 14,
    quadDist: 22,
    /** Relief tiers over the grove disc (u); forest ground first, then any green ground. */
    maxRelief: [5, 8] as const,
  },
} as const;

export const DESIGN_THEME: ThemeDef = {
  id: 'design',
  displayName: 'Design',
  short: 'ART',
  icon: 'palette',
  accent: '#B07CE0',
  teamTints: ['#B07CE0', '#C9A2EC', '#9260C4'],
  lotMix: [
    ['atelier', 2],
    ['galleryPavilion', 1],
  ],
  crown: null,
  // the log cabin is gone (plan §2.6): the planner never asks for it, so no swap is needed
  defSwap: {},
  landmarkVariant: { giantTree: 2 },
  decor: [
    ['flowerBed', 3],
    ['paintPotPlanter', 2],
    ['bench', 1],
  ],
  pathLanterns: 0.35,
  workers: { weight: 0.9, cap: 7, deskShare: 0.5 },
  accessory: 4,
  ground: {
    // wildflower meadow: pink / yellow blossoms on the lawn, lilac / white in the moist meadows
    [grass]: {
      material: 'meadow',
      base: '#8FCF6A',
      layer: { speckle: ['#FF8FB1', '#FFD45E'], amplitude: 1.1 },
    },
    [meadow]: {
      material: 'meadow',
      base: '#8FCF6A',
      layer: { speckle: ['#C9A2EC', '#FFFFFF'], amplitude: 1.15 },
    },
    // moss floor with leaf litter and fallen blossom petals
    [forest]: {
      material: 'forest',
      base: '#4E8E4A',
      layer: { layers: ['litter', 'blades'], speckle: ['#E8A0B8', '#C98A3E'] },
    },
    // confetti gravel paths
    [Zone.path]: {
      material: 'gravel',
      base: '#E8D6B8',
      layer: { layers: ['pebbles', 'speckle'], speckle: ['#FF6F91', '#5FB8F0'] },
    },
    // mosaic quad
    [Zone.plaza]: {
      material: 'paving',
      base: '#E6D3C0',
      layer: { layers: ['mosaic'], tile: { size: 0.25, grout: '#B07CE0' } },
    },
  },
  // open the dome a little: meadow clearings for the sheep and the garden, forest still dominant
  zoneRules: { forestThreshold: -0.4, meadowThreshold: -0.05 },
  patchwork: 'off',
  landmarks: { giantTree: { kind: 'giantTree', variant: 2 } },
  scatter: [
    // blossom round trees replace the green round trees (same rule shape)
    {
      def: 'blossomTree',
      zones: [grass, meadow, forest],
      minDist: 3.6,
      density: 0.85,
      slopeMax: 0.8,
      heights: [1.0, 30],
      shore: [3, 1000],
      cluster: { scale: 26, threshold: -0.1 },
      scale: [0.8, 1.25],
    },
    // dense pine stands keep the dome wooded between the blossom groves
    {
      def: 'pine',
      zones: [forest],
      minDist: 3.4,
      density: 0.85,
      // the dome flanks are steep (slope 0.8–1.4 on a third of the forest): pines cover them
      slopeMax: 1.3,
      heights: [2, 40],
      shore: [4, 1000],
      cluster: { scale: 20, threshold: -0.45 },
      scale: [0.8, 1.3],
    },
    // dense wildflowers in the meadows
    {
      def: 'flower',
      zones: [meadow, grass],
      minDist: 1,
      density: 0.8,
      slopeMax: 0.6,
      heights: [0.8, 30],
      cluster: { scale: 12, threshold: -0.1 },
      scale: [0.9, 1.4],
    },
    {
      def: 'paintPotPlanter',
      zones: [grass, meadow],
      minDist: 7,
      density: 0.5,
      slopeMax: 0.35,
      heights: [1, 30],
      shore: [4, 1000],
      scale: [0.9, 1.1],
      maxPerIsland: 10,
    },
    {
      def: 'easel',
      zones: [meadow, grass],
      minDist: 12,
      density: 0.5,
      slopeMax: 0.3,
      heights: [1, 30],
      shore: [5, 1000],
      scale: [1, 1],
      maxPerIsland: 3,
    },
  ],
  scatterOff: ['roundTree'],
  // sheep weight comes from content/life.ts THEME_LIFE.design (5 × meadow cells)
  life: {},
  // deciduous = the blossom trees only (roundTree is off here), so far blobs stay pink (D-031)
  // blossomTree is its own canopy kind (render/props/clusters.ts); other deciduous stay green
  treePalette: FOLIAGE,
};
