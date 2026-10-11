/**
 * Research — "Biodome Lab" (TASK-400, M17b Concept Archipelago) on the Lonely Palm slot: a
 * breached crater (archetype `crater` + `bluff`) with a cluster of glowing glass biodomes in
 * the bowl, pastel crystal outcrops on the rim and a research vessel moored at the cove pier.
 */
import { FOLIAGE, SAND } from '../palette.ts';
import { Zone } from '../../world/types.ts';
import type { ThemeDef } from './index.ts';

export const RESEARCH_THEME: ThemeDef = {
  id: 'research',
  displayName: 'Research',
  short: 'R&D',
  icon: 'flask',
  accent: '#4FC3C9',
  teamTints: ['#4FC3C9', '#86D9DD', '#36A3A9'],
  lotMix: [['researchHut', 1]],
  crown: null,
  defSwap: {},
  landmarkVariant: {},
  // the biodomes and the vessel are worldgen fixtures (RESEARCH_SITE)
  decor: [],
  pathLanterns: 0,
  plazaDecor: { posts: 'lanternPost', seats: null, across: null },
  workers: { weight: 0.3, cap: 2, deskShare: 0.5 },
  accessory: 6,
  // cove beach keeps its ripples
  ground: {
    [Zone.sandDry]: { material: 'sand', base: SAND.dry, layer: { layers: ['ripples'] } },
    [Zone.sandWet]: { material: 'sand', base: SAND.wet, layer: { layers: ['ripples'] } },
  },
  patchwork: 'off',
  landmarks: {},
  scatter: [
    // pastel crystal outcrops on the crater rim (above the bowl floor)
    {
      def: 'crystalCluster',
      zones: [Zone.grass, Zone.meadow, Zone.rock, Zone.cliff],
      minDist: 1.4,
      density: 1,
      slopeMax: 3,
      heights: [4.05, 12],
      shore: [1, 99],
      scale: [0.8, 1.25],
      maxPerIsland: 5,
    },
    // instrument buoys bob just off the beach (lagoon band: they float at the waterline)
    {
      def: 'instrumentBuoy',
      zones: [Zone.lagoon],
      minDist: 7,
      density: 1,
      slopeMax: 2,
      heights: [-4, -0.15],
      shore: [-7, -1],
      scale: [0.9, 1.1],
      maxPerIsland: 3,
    },
    {
      def: 'starfish',
      zones: [Zone.sandWet],
      minDist: 4,
      density: 0.7,
      slopeMax: 1,
      heights: [0, 0.6],
      scale: [0.8, 1.2],
      maxPerIsland: 4,
    },
  ],
  scatterOff: [],
  // creature weights: THEME_LIFE.research
  life: {},
  treePalette: FOLIAGE,
};

/**
 * Biodome Lab colours (geo/themes/research.ts; ART_BIBLE §2 hexes + the theme accent). Panes
 * are tinted opaque glass (no transparent program): the low band is "plants behind glass"
 * green, the upper band pale aqua / lilac; all panes glow at night in their own tint.
 */
export const BIODOME_PALETTE = {
  frame: '#FAFAF5',
  plinth: '#E9E2D0',
  band: '#4FC3C9',
  door: '#36A3A9',
  lamp: '#FFC870',
  /** Lower panes: foliage seen through the glass. */
  paneLow: ['#5DC98A', '#7FD8A0', '#4FB97E', '#8FDDA6'],
  /** Upper panes: tinted glass. */
  paneHigh: ['#7FDCE0', '#62CED4', '#A6EAE6', '#BBA6F0'],
  /** Pane height split (fraction of the dome radius). */
  paneSplit: 0.5,
  /** Night glow of the panes (emissive weight, 0..1 = window class). */
  paneGlow: 0.75,
  canopy: ['#8FD16A', '#5DBB63', '#7FD34E'],
  /** Pinwheel blades on the vents (theme accent, lilac, sun yellow). */
  blades: ['#4FC3C9', '#B39DFF', '#F5C84C'],
  crystal: ['#4FC3C9', '#9FEAE6', '#C3B0FF', '#DCCEFF'],
  crystalGlow: 0.55,
  rock: ['#A9AEB8', '#8A909C'],
  hull: '#FAFAF5',
  hullBand: '#4FC3C9',
  deck: '#D2A679',
  crane: '#FF7A5C',
  sub: '#F5C84C',
  bridgeGlass: '#9FE3E6',
} as const;

/**
 * Observatory University campus colours (TASK-402a, geo/themes/campus.ts): warm brick and cream
 * stucco halls under teal / slate roofs, a white-and-silver observatory dome, a green-copper
 * library dome, Victorian white-and-teal glasshouses. Glass uses the biodome technique (tinted
 * opaque panes from BIODOME_PALETTE.paneLow / paneHigh, glowing at night).
 */
export const CAMPUS_PALETTE = {
  brick: '#C98A6B',
  brickDark: '#B27258',
  stucco: '#F3E6CC',
  stone: '#E9E2D0',
  stoneDark: '#CFC5AE',
  trim: '#FAFAF5',
  roofTeal: '#3E9FA6',
  roofSlate: '#5E6F82',
  copper: '#6DBFA1',
  copperLight: '#93D8BC',
  door: '#36A3A9',
  wood: '#A8754F',
  /** Window panes (emissive 1: warm lamp light at night). */
  window: '#FFE0A0',
  /** Observatory. */
  dome: '#F4F2EC',
  domeRib: '#B9C2CC',
  silver: '#C9D1D9',
  tube: '#E8ECF0',
  tubeBand: '#4FC3C9',
  lens: '#2E3C52',
  shutterInside: '#34425A',
  gold: '#F5C84C',
  /** Terrarium interiors. */
  soil: '#8A6A4E',
  fern: ['#5DBB63', '#7FD34E', '#3E9A52'],
  flowers: ['#FF8FB1', '#FFD166', '#C3B0FF', '#FF9E7A'],
  trunk: '#B68A5E',
  planter: '#E8735A',
} as const;

/**
 * Campus sculptures, research bases and garden kit colours (TASK-402a, geo/themes/science.ts and
 * geo/themes/garden.ts). Bronze / white marble / brass for the sculptures, white + teal for the
 * outdoor science kit; the garden reuses the Coding hedge greens and the flowerBed bloom tones.
 */
export const SCIENCE_PALETTE = {
  bronze: '#B9854B',
  bronzeDark: '#8E6236',
  marble: '#F2EFE8',
  brass: '#E3B65B',
  plinth: '#E9E2D0',
  plinthDark: '#CFC5AE',
  /** Atom: nucleus lumps, orbit rings, electron beads. */
  nucleus: ['#FF8FB1', '#4FC3C9', '#FFD166'],
  orbit: '#C9D1D9',
  electron: '#4FC3C9',
  /** DNA: strands (teal, coral) and rung halves. */
  strand: ['#4FC3C9', '#FF7A5C'],
  rung: ['#F5C84C', '#C3B0FF'],
  /** Rocket. */
  rocketBody: '#FAFAF5',
  rocketRed: '#E35D6A',
  rocketBand: '#4FC3C9',
  nozzle: '#4F4A5E',
  /** Radio dish / lab pods. */
  dish: '#FAFAF5',
  dishRing: '#86D9DD',
  mount: '#C9D1D9',
  podBody: '#FAFAF5',
  podBand: '#4FC3C9',
  podLeg: '#6F7685',
  portholeGlow: '#BFE6FF',
  solar: '#335A9C',
  /** Garden kit. */
  gravel: '#E6D8B8',
  hedge: '#4E9C4B',
  hedgeTop: '#69B857',
  water: '#8FDCEB',
  waterDeep: '#6FC8DC',
  terracotta: '#E8735A',
  wood: '#D2A679',
  white: '#FAFAF5',
  vine: ['#5DBB63', '#7FD34E', '#3E9A52'],
  blooms: ['#FF8FB1', '#FFD166', '#C3B0FF', '#FF9E7A', '#FAFAF5'],
} as const;

/**
 * Biodome Lab site plan (world/gen/plans/research.ts). Distances in u; footprints are the
 * fixture radii (content/settlements FIXTURE_RADIUS) the planner keeps clear.
 */
export const RESEARCH_SITE = {
  /**
   * Hero biodome on the profile's `dome` anchor (searched within `search` u if it does not fit).
   * `pad`: flatten-pad core radius (margin 0) — small, so the falloff stops short of the crest.
   */
  hero: { def: 'biodomeHero', radius: 3.2, pad: 2.8, search: 3, minShore: 2.5 },
  /** Smaller domes around the hero (count, ring distance from the hero centre). */
  small: { def: 'biodome', radius: 1.8, pad: 1.6, count: 2, ring: [4.4, 7] as const, minShore: 2 },
  /** Kept free in front of the hero door: cos of the half-angle around the door direction. */
  doorCos: 0.55,
  /** Gap kept between the domes and other obstacles. */
  gap: 0.3,
  /** Max height relief under a small dome before its pad levels it. */
  maxRelief: 2.2,
  /** Door spot in front of each dome (path pin), past its radius. */
  doorGap: 1.2,
  dock: { maxSegments: 3 },
  /** Research vessel alongside the pier (hull half length / half beam, side offset from the pier axis). */
  vessel: { def: 'researchVessel', halfLength: 3.3, halfBeam: 1.15, side: 2.1, minDepth: 0.35 },
} as const;
