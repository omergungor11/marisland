/**
 * Research — "Observatory University" (TASK-402b, M17b; was the TASK-400 Biodome Lab) on the
 * Lonely Palm slot: a terraced campus hill (archetype `campusHill` + `bluff`) with the summit
 * observatory, a quad of faculty halls around the library, formal gardens, a glasshouse row, a
 * research base, radio dishes and a sculpture walk; the research vessel at the cove pier.
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
  // the campus is all worldgen fixtures (RESEARCH_SITE)
  decor: [],
  // lanterns are planner fixtures (one variant: every rolled variant is one more draw call)
  pathLanterns: 0,
  // the planner sets its own benches and lanterns on the quad rim (RESEARCH_SITE.quadDecor)
  plazaDecor: { posts: null, seats: null, across: null },
  workers: { weight: 0.3, cap: 2, deskShare: 0.5 },
  accessory: 6,
  // TASK-402b garden campus: mown lawns, flowering meadow, cream gravel walks, a stone quad
  ground: {
    [Zone.grass]: {
      material: 'lawn',
      base: '#8CCB64',
      layer: { mow: { amplitude: 0.03, period: 3 } },
    },
    [Zone.meadow]: {
      material: 'meadow',
      base: '#A6D86E',
      layer: { speckle: ['#FF8FB1', '#FFFFFF', '#C3B0FF'] },
    },
    [Zone.path]: {
      material: 'paving',
      base: '#E6D8B8',
      layer: { tile: { size: 0.9, grout: '#CFC5AE' } },
    },
    [Zone.plaza]: {
      material: 'paving',
      base: '#E9E2D0',
      layer: { tile: { size: 1.3, grout: '#B9AE96' } },
    },
    [Zone.sandDry]: { material: 'sand', base: SAND.dry, layer: { layers: ['ripples'] } },
    [Zone.sandWet]: { material: 'sand', base: SAND.wet, layer: { layers: ['ripples'] } },
  },
  patchwork: 'off',
  landmarks: {},
  scatter: [
    // park trees in groves between the buildings and gardens (scatter keeps off structures)
    {
      def: 'roundTree',
      zones: [Zone.grass, Zone.meadow],
      minDist: 2.8,
      density: 0.9,
      slopeMax: 0.9,
      heights: [3, 30],
      shore: [2, 99],
      scale: [0.8, 1.2],
      maxPerIsland: 46,
    },
    // palms on the cove beach
    {
      def: 'palm',
      zones: [Zone.sandDry, Zone.grass],
      minDist: 4,
      density: 0.9,
      slopeMax: 0.5,
      heights: [0.3, 3.5],
      shore: [1, 10],
      scale: [0.85, 1.15],
      maxPerIsland: 5,
    },
    // bushes and ground cover after the trees (the global rules would fill the lawns first)
    {
      def: 'bush',
      zones: [Zone.grass, Zone.meadow],
      minDist: 3,
      density: 0.55,
      slopeMax: 0.6,
      heights: [0.8, 30],
      shore: [2, 1000],
      cluster: { scale: 18, threshold: 0.1 },
      scale: [0.8, 1.3],
    },
    {
      def: 'grassTuft',
      zones: [Zone.grass, Zone.meadow],
      minDist: 1.5,
      density: 0.75,
      slopeMax: 0.8,
      heights: [0.5, 40],
      scale: [0.8, 1.4],
    },
    {
      def: 'flower',
      zones: [Zone.meadow, Zone.grass],
      minDist: 1.3,
      density: 0.6,
      slopeMax: 0.6,
      heights: [0.8, 30],
      cluster: { scale: 14, threshold: 0.2 },
      scale: [0.8, 1.3],
    },
    // a few pastel crystal outcrops on the rocky wall tops only
    {
      def: 'crystalCluster',
      zones: [Zone.rock, Zone.cliff],
      minDist: 6,
      density: 0.8,
      slopeMax: 3,
      heights: [2, 12],
      shore: [1, 99],
      scale: [0.8, 1.15],
      maxPerIsland: 3,
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
  // re-added above after the trees; no boulders on the lawns (three rock variants = 6 calls)
  scatterOff: ['bush', 'grassTuft', 'flower', 'rockCluster'],
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
 * Observatory University site plan (TASK-402b, world/gen/plans/research.ts) on the terraced
 * campus hill (archetype `campusHill`: anchors summit, quad, garden, glasshouse, spur, headland,
 * harbour). Distances in u, angles in degrees. Rect sizes are [width, depth] footprints the
 * planner keeps clear; disc radii default to FIXTURE_RADIUS.
 */
export const RESEARCH_SITE = {
  /** Gap kept between structures (u). */
  gap: 0.6,
  /** Door / link pin this far in front of a footprint. */
  doorGap: 1.2,
  /**
   * Level step (u) neighbouring pads may keep (Pad.step): the summit, the quad terrace and the
   * garden lawn stay on their own levels instead of being relaxed into one plateau.
   */
  padStep: 1.6,
  /**
   * Paths keep off ground this close to the shore (u) and steeper than `rimSlope` outside the
   * cove: no walks across the earth walls.
   */
  rimKeep: 6,
  rimSlope: 0.5,
  /** …except within this distance (u) of the pier root (the climb from the cove). */
  rimFree: 20,
  /** Nothing stands on the cove ramp: within this shore distance (u) where the cove is. */
  coveKeep: 12,
  /** Summit observatory: pad radius ≈ 9 u flat; door toward the quad. */
  observatory: {
    def: 'observatory',
    radius: 4.0,
    pad: 4.4,
    search: 8,
    minShore: 6,
    maxRelief: 4,
  },
  /** Campus quad: a paved disc (Zone.plaza, the hub) with the fountain at its centre. */
  quad: {
    radius: 5,
    search: 8,
    minShore: 7,
    maxRelief: 2.6,
    /** Quad centre at least this far from the observatory centre. */
    obsGap: 13,
    fountain: 'fountain',
  },
  /**
   * Quad ring: buildings around the plaza, doors facing the fountain. `angle` = preferred bearing
   * from the quad → observatory axis; slots slide by `stepDeg` up to `slideDeg`; `keepDeg` around
   * the observatory and harbour avenues stays open. `back` = the gap behind the plaza rim.
   */
  ring: {
    stepDeg: 8,
    slideDeg: 64,
    keepDeg: 10,
    back: 1.2,
    /** Extra set-backs tried when the rim slot is blocked. */
    out: [0, 1.6, 3.2],
    /** Flatten margin around a ring building (small: fewer neighbours chain their levels). */
    padMargin: 1,
    minShore: 2.5,
    maxRelief: 3,
    buildings: [
      { def: 'libraryRotunda', variant: 0, angle: 180, size: [7.2, 7.4] as const, slide: 180 },
      { def: 'facultyHall', variant: 0, angle: 112, size: [5.4, 5.4] as const },
      { def: 'facultyHall', variant: 1, angle: -112, size: [5.4, 5.4] as const },
      { def: 'facultyHall', variant: 2, angle: 60, size: [5.4, 5.4] as const },
      { def: 'facultyHall', variant: 0, angle: -60, size: [5.4, 5.4] as const },
      { def: 'campusTower', variant: 0, angle: 146, size: [2.6, 2.6] as const },
      { def: 'facultyHall', variant: 1, angle: -146, size: [5.4, 5.4] as const },
    ],
  },
  /** Scholar statues flanking the library steps (offset across the door axis, in from the rim). */
  statues: { def: 'scholarStatue', side: 2.6, inset: 1.4 },
  /** Benches and lantern posts on the quad rim (bearing offsets from the avenues, deg). */
  quadDecor: { bench: 'bench', lantern: 'lanternPost', benchInset: 1.3, lanternInset: 0.6 },
  /**
   * Formal garden near the `garden` anchor: a grid of hedgeParterre tiles (centre cell = a
   * sculpture when the grid is odd), topiary lines along the long sides, flower beds at the outer
   * corners, benches at the ends. Layouts tried in order, each at `turns` around the quad axis.
   */
  garden: {
    search: 13,
    minShore: 3,
    tile: 4.2,
    pitch: 4.9,
    /** Max relief under one tile / over the whole grid before the pads level it. */
    tileRelief: 2.2,
    gridRelief: 3.6,
    layouts: [
      [3, 3],
      [4, 2],
      [2, 4],
      [3, 2],
      [2, 3],
      [2, 2],
    ] as const,
    turns: [0, 90, 45, 135, 25, 65],
    centre: 'armillarySphere',
    /** Even grids: the sculpture this far past the far end. */
    endStatue: 2.4,
    topiary: { def: 'topiary', out: 1.3, step: 2.45, variants: [1, 0] as const },
    bed: { def: 'flowerBed', out: 1.5 },
    bench: { def: 'bench', out: 1.6 },
  },
  /** Pergola walk from the garden toward the quad (pergolas end to end, open along the walk). */
  pergola: { def: 'pergola', count: 3, minCount: 2, size: [3.2, 2.1] as const, lead: 1.4 },
  /** Glasshouse district: a row of terrariums (+ the biodome conservatory at one end). */
  glasshouse: {
    search: 8,
    minShore: 3,
    maxRelief: 2.6,
    def: 'terrarium',
    count: [3, 4] as const,
    pitch: 5.6,
    /** Row beside the formal garden: this far out past the garden's edge (beyond the topiary). */
    gardenGap: 2.4,
    conservatory: 'biodomeHero',
  },
  /** Research base on the headland: lab pods, a weather mast and a small dish around a yard. */
  base: {
    /** Yard search radii around the headland anchor (tried in order), yards tested per radius. */
    search: [7, 14] as const,
    tries: 10,
    /** Stop widening the search once this many items fit. */
    minItems: 3,
    minShore: 3.5,
    maxRelief: 2.6,
    ring: [3.4, 8] as const,
    items: [
      { def: 'labPod', variant: 1 },
      { def: 'labPod', variant: 0 },
      { def: 'radioDish', variant: 1 },
      { def: 'weatherMast', variant: 0 },
    ],
  },
  /** Big radio dish on the spur behind the summit (+ small dishes beside it). */
  dish: {
    def: 'radioDish',
    search: 7,
    minShore: 3,
    maxRelief: 3.2,
    small: 1,
    smallRing: [5, 7.5] as const,
  },
  /** Sculpture walk: focal points on the avenues. */
  sculptures: {
    /** On the observatory avenue, these fractions of the way quad rim → observatory door. */
    observatory: { def: 'atomSculpture', at: [0.45, 0.3, 0.6] as const, side: 2.2 },
    /** Between the quad and the garden gate. */
    garden: { def: 'dnaHelix', at: [0.5, 0.35, 0.65] as const, side: 2.2 },
    /** On the harbour approach (pier root → quad). */
    harbour: { def: 'rocketMonument', at: [0.55, 0.4, 0.7] as const, side: 2.6 },
    /** Fallback: a lawn spot on this ring around the quad centre. */
    ring: [10, 16] as const,
  },
  dock: { maxSegments: 3, lee: 30 },
  /** Research vessel alongside the pier (hull half length / half beam, side offset from the pier axis). */
  vessel: { def: 'researchVessel', halfLength: 3.3, halfBeam: 1.15, side: 2.1, minDepth: 0.35 },
} as const;
