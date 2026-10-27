/**
 * QA / Audit — the Test Factory (Palmlagoon archetype; M17b TASK-401, was the atoll lagoon of
 * M14b §2.5): a raised plateau on earth walls with a concrete factory yard, sawtooth test
 * hangars joined by conveyor bridges, a crash-test loop track and the QA tower (a giant green
 * check on a lattice mast) as the one dominant vertical. Cheerful and toy-like, not grim.
 */
import { FOLIAGE } from '../palette.ts';
import { PLACEMENT_RULES } from '../placement.ts';
import type { RimWalkwaySpec } from '../rim-walkway.ts';
import { Zone } from '../../world/types.ts';
import type { ThemeDef } from './index.ts';

/**
 * Rim walkway (Q6, TASK-480; world/gen/rim-walkway.ts): a dark safety-rubber walk 2 u in
 * from the plateau lip (the hazard frame round the mint disc from T0/T1), yellow-black hazard posts
 * with a mint rail every 3 u between the walk and the drop. Paints the island's `streetQa` zone
 * (its material is `ground[Zone.streetQa]` below; HQ's QA street keeps HQ's own table).
 */
export const QA_RIM_WALK: RimWalkwaySpec = {
  zone: Zone.streetQa,
  inset: 2,
  halfWidth: 1.15,
  lip: { band: 0.5, steep: 0.8, flat: 0.32, maxSdf: 16 },
  drop: { shore: 1, min: 3 },
  maxSlope: 0.4,
  minY: 3,
  paintOver: [Zone.grass, Zone.meadow, Zone.forest, Zone.sandDry, Zone.field],
  minRun: 6,
  shapeGap: 0.6,
  pathGap: 1.6,
  posts: { def: 'rimPost', variant: 0, end: 1, spacing: 3, inset: 0.8 },
};

/**
 * Palm rim (Q18, TASK-480): the archetype's palm rule turned into a row along the inland side of
 * the rim walk (`near` its zone), at this density / cap; the plateau edge reads as a green fringe.
 */
const PALM_RIM = { density: 0.9, minDist: 3.4, near: 5, maxPerIsland: 34 } as const;

export const QA_THEME: ThemeDef = {
  id: 'qa',
  displayName: 'QA',
  short: 'QA',
  icon: 'magnifier',
  accent: '#3FBF8F',
  teamTints: ['#3FBF8F', '#7FD8B3', '#2E9E74'],
  lotMix: [['testLab', 1]],
  crown: null,
  // placeStiltHut places the archetype's 'stiltHut' def: the dockside lab on stilts
  defSwap: { stiltHut: 'testLabStilt' },
  landmarkVariant: {},
  decor: [
    ['checklistBoard', 2],
    ['trafficCone', 2],
    ['bench', 1],
  ],
  pathLanterns: 0.4,
  // the yard's rim posts are the UV lamps of the night bug hunt (TASK-424)
  plazaDecor: { posts: 'uvLampPost', seats: 'checklistBoard', across: null },
  workers: { weight: 0.9, cap: 7, deskShare: 0.4 },
  accessory: 3,
  ground: {
    [Zone.sandDry]: { material: 'sand', base: '#F6E7C4' },
    [Zone.grass]: { material: 'lawn', base: '#A8D670' },
    [Zone.meadow]: { material: 'lawn', base: '#A8D670' },
    [Zone.path]: { material: 'gravel', base: '#E7E2D5' },
    [Zone.plaza]: {
      material: 'paving',
      base: '#E4EFEA',
      layer: { tile: { size: 2, grout: '#3FBF8F' } },
    },
    // the rim walkway (QA_RIM_WALK): a dark safety-rubber floor flecked hazard yellow and white
    [Zone.streetQa]: {
      material: 'gravel',
      base: '#5A5F6B',
      layer: { speckle: ['#F5C84C', '#FAFAF5'], amplitude: 1.3 },
    },
  },
  patchwork: 'off',
  // the QA tower on the profile's knoll anchor (placed by plans/qa.ts)
  landmarks: { tower: { kind: 'qaTower', variant: 0 } },
  scatter: PLACEMENT_RULES.filter(
    (r) => r.def === 'palm' && r.archetypes?.includes('palmlagoon'),
  ).map(({ cluster: _rimHasNoClusters, ...r }) => ({
    ...r,
    density: PALM_RIM.density,
    minDist: PALM_RIM.minDist,
    // a row up on the plateau rim, inland of the walk (the bluff lifts the land to 7–10 u)
    zones: [Zone.grass, Zone.meadow],
    heights: [QA_RIM_WALK.minY, 12] as const,
    // inland of the walk (centre ≈ lip + 2 u, lip ≈ 6 u in): never between it and the drop
    shore: [9.5, 16] as const,
    near: [QA_RIM_WALK.zone],
    nearDist: PALM_RIM.near,
    first: true,
    maxPerIsland: PALM_RIM.maxPerIsland,
  })),
  scatterOff: ['palm'],
  life: {},
  treePalette: FOLIAGE,
};

/**
 * QA Test Factory plan tuning (world/gen/plans/qa.ts). Lengths in u; footprints are [w, d] with
 * d along the facing (door) direction, like LOT_FOOTPRINT.
 */
export const QA_PLAN = {
  /** Factory yard: a concrete disc (Zone.plaza, the island's network hub) near the `yard` anchor. */
  yardR: 7,
  yardSearch: 16,
  yardMinShore: 13,
  yardMaxRelief: 2,
  yardLanding: 0.03,
  /** Harbour pier in the lee cove (carved when shallow). */
  dockMaxDist: 24,
  /** Customs Port (TASK-508): a port within this of the harbour anchor may keep the original pier. */
  portCove: 26,
  dockLee: 30,
  /** Lots keep this far (u, obstacle disc) from the pier root. */
  dockClear: 5,
  /** QA tower (landmark 'qaTower'): highest clear spot near the knoll, inland, off the yard. */
  towerSearch: 14,
  towerMinShore: 5,
  towerYardGap: 7,
  towerRelief: 1.4,
  /** Test hangars on the yard rim, door to the yard: count, footprint, gap past the yard edge. */
  hangars: [3, 3] as const,
  hangar: [9, 6.5] as const,
  hangarGap: 1.6,
  hangarMinShore: 3.5,
  hangarRelief: 2.4,
  /** Rim angles tried per hangar; consecutive hangars ≥ this far apart around the yard (deg). */
  hangarAngles: 36,
  hangarSpreadDeg: 75,
  /** Conveyor bridge: segment length (= geo), bridge only hangar pairs this far apart (centres). */
  beltSeg: 2,
  beltSpan: [9, 24] as const,
  /** Dockside stilt lab: cove water within this of the pier root. */
  stiltSearch: 22,
  /** Crash-test loop track: footprint (= geo QA_TRACK bounds + margin), search, ground. */
  track: [7, 14] as const,
  trackSearch: 30,
  trackMinShore: 3.5,
  trackRelief: 2.2,
  trackYardGap: 3,
  /** Checkpoints: a barrier gate every `gateEvery` u of a campus lane from `gateStart`, ± `gateSearch`. */
  gateEvery: 20,
  gateStart: 5,
  gateSearch: 8,
  gateRadius: 1.6,
  gateSpacing: 12,
  /** Gates stand on straight stretches: tangent over ± this many lane samples (1 u), max bend. */
  gateTangent: 3,
  gateStraightDeg: 30,
  /** Checklist board right of a gate, traffic cones left of it (along, side). */
  boardSide: 2.7,
  cone: [1.4, 1.5] as const,
  /** Campus lots (test labs) around the yard: CampusSpec fields (sites.ts campusLots). */
  campus: {
    lots: [4, 5] as const,
    quadSearch: 0,
    quadMinShore: 0,
    quadMaxRelief: 0,
    quadLee: 0,
    minShore: 3,
    maxRelief: 2.2,
    lanes: [0, 75, -75, 140, -140, 35, -35, 108, -108, 160, -160] as const,
    laneLength: 30,
    ring: [3, 22] as const,
    maxFieldSamples: 5,
  },
} as const;

/** Test Factory structure look (geo/themes/qa.ts): sizes in u, colours as hex. */
export const QA_FACTORY = {
  hangar: {
    w: 9,
    d: 6.5,
    /** Wall top; sawtooth rows of `rise` on top (glazing faces the door side). */
    h: 4,
    teeth: 3,
    rise: 1.45,
    /**
     * One colourway, one variant: a second variant cost a draw call per tier (+ its shadow) on
     * every frame that shows the factory.
     */
    // Q16 (TASK-480, R3-14 white-mint-yellow toy factory): white walls (the old #FFDDB0 read grey
    // in shade), two mint bands, a bigger yellow door
    wall: '#FAFAF5',
    roof: '#3FBF8F',
    /** Pastel bands (wall foot + `band2` above it), fan blades. */
    band: '#7FD8B3',
    /** Foot band height; second mint band (above the window rows): bottom over the plinth top, height. */
    band1: 1.0,
    band2: [2.85, 0.32] as const,
    /** Wall-top cap band (yellow) and its height. */
    cap: '#F5C84C',
    capH: 0.34,
    /** Door width / height (u). */
    doorW: 3.7,
    doorH: 3.05,
    blade: '#CDEBFF',
    trim: '#2E9E74',
    plinth: '#A9AEB8',
    door: '#F5C84C',
    stripe: '#4F4A5E',
    window: '#FFE9B8',
    /** Sawtooth north-light glazing (sky glass by day, lit at night). */
    glass: '#A8DDF5',
    /** Extractor fans on the front wall (spin with the wind, like the windmill): radius. */
    fanR: 0.42,
    /** Short chimneys (every variant): roof-local (x, z), height above the wall top, radius. */
    chimneys: [
      { x: -3, z: -1.7 },
      { x: 2.6, z: -1.9 },
    ] as const,
    chimneyH: 2.4,
    chimneyR: 0.45,
    chimneyBody: '#FAFAF5',
    chimneyBand: '#E35D6A',
  },
  belt: {
    /** Segment length along local z (= QA_PLAN.beltSeg), belt top, belt width. */
    seg: 2,
    top: 2.7,
    width: 0.95,
    frame: '#F5C84C',
    surface: '#6F7685',
    roller: '#A9AEB8',
    leg: '#7FD8B3',
  },
  crate: {
    /** Crate cube edge; chassis (hidden in the belt, wheels on the track) height. */
    size: 0.6,
    chassis: 0.16,
    wood: '#E2B887',
    band: '#B8875A',
    sticker: '#3FBF8F',
    wheel: '#4F4A5E',
    frame: '#F5C84C',
  },
  track: {
    /** Half straight length, half oval width, loop radius, lateral loop shift, rail gauge. */
    a: 3.4,
    b: 2.1,
    loopR: 1.45,
    shift: 0.8,
    gauge: 0.56,
    /** Rail height over the slab, rail half-thickness. */
    railY: 0.2,
    rail: 0.07,
    slab: '#E7E2D5',
    infield: '#A8D670',
    rails: '#FAFAF5',
    loop: '#3FBF8F',
    sleeper: '#B8875A',
    post: '#A9AEB8',
    flag: '#4F4A5E',
    pad: '#E35D6A',
  },
  tower: {
    /** Mast height (to the sign foot), base / top half-widths, lattice bays. */
    h: 13,
    base: 1.5,
    top: 0.55,
    bays: 6,
    leg: '#F5F2EA',
    brace: '#7FD8B3',
    /** Check sign: board radius, stroke thickness. */
    board: 2.7,
    stroke: 0.95,
    boardColor: '#FAFAF5',
    rim: '#2E9E74',
    check: '#3FBF8F',
    lamp: '#E35D6A',
    plinth: '#A9AEB8',
  },
} as const;

/**
 * Closed-form movers (render/movers.ts): crates riding the conveyor bridges and the test cart on
 * the loop track. One InstancedMesh on the shared lit program; poses are functions of the sim
 * time only, so captures freeze them. Not agents (no life budget).
 */
export const QA_MOVERS = {
  /** Belt speed (u/s); one crate per segment, so they follow at `beltSeg` spacing. */
  beltSpeed: 1.1,
  /** Cart: speed on the flat (u/s), fraction of it left at the loop top, instance scale. */
  cartSpeed: 3,
  cartTop: 0.5,
  cartScale: 1.25,
  /** Pause at the start gate each lap (s). */
  cartDwell: 1.2,
  /** Dither fade by camera distance (u): crates are a T1–T3 detail. */
  fadeNear: 150,
  fadeFar: 210,
} as const;
