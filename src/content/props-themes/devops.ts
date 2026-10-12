/**
 * devops theme structures (M14b, TASK-376): PropDefs appended to PROP_DEFS after PROP_DEFS_BUILDINGS
 * (content/props.ts, fixed theme order). Geometry: geo/themes/devops.ts.
 */
import { PropFlag } from '../../world/prop-store.ts';
import { OFFICE_PAL } from '../palette-offices.ts';
import { THEMES } from '../themes/index.ts';
import type { PropDef } from '../props.ts';

const { grounded } = PropFlag;

export const DEVOPS_COLORS = {
  /** Cooling tower concrete (OFFICE_PAL.devops wall family) + rim / band accent. */
  concrete: OFFICE_PAL.devops[1].wall,
  concreteDark: OFFICE_PAL.devops[0].wall,
  accent: THEMES.devops.accent,
  accentDeep: OFFICE_PAL.devops[0].roof,
  /** Pipe body steel, flange, support. */
  pipe: '#C4C9D3',
  flange: '#8A909C',
  support: '#6F7685',
  valve: '#E35D6A',
  basalt: '#4F4C57',
  basaltLight: '#6A6676',
  dark: '#3A3F4D',
  /** Safety yellow + black stripe (warning sign). */
  hazard: '#F5C84C',
  hazardBlack: '#3A3F4D',
  spoolWood: '#D2A679',
  spoolWoodDark: '#A8754F',
  cable: '#FF9F43',
  cableBlack: '#4F4A5E',
  rack: '#B4B9C4',
  rackDark: '#6F7685',
  led: ['#7CFFB0', '#FFC870', '#7CC4FF'],
  lamp: '#FF5A4A',
} as const;

/**
 * TASK-405 "Ember Works" structures (geo/themes/devops-works.ts): sizes in u (local x = width,
 * z = depth, the fixture's rotY faces local +z) and colours. Palette: ART_BIBLE §2 roofs
 * (Docker blue `#5DA9E9`, teal `#3FB8AF`, yellow, coral) on the DevOps concrete / steel family;
 * lava `#FF6A3D` and window `#FFC870` glow at night through the emissive path.
 */
export const DEVOPS_WORKS = {
  container: {
    /** One container: length (x), width (z), height. */
    l: 5,
    w: 2.1,
    h: 2,
    colors: ['#5DA9E9', '#3FB8AF', '#FF9F43', '#F5C84C', '#E35D6A', '#4C8FD0'],
    rib: '#E9EEF5',
    door: '#3A3F4D',
  },
  /** One stack: columns side by side along z, `tiers` containers each (asymmetric). */
  stack: { tiers: [3, 2, 1] as const, gap: 0.12 },
  /**
   * containerYard prefab: stacks (centre x, z; `turn` mirrors the tiers) in a row along the quay,
   * the crane over the middle one; footprint (x × z) for the planner.
   */
  yard: {
    stacks: [
      { x: 0, z: 0, turn: false },
      { x: -6.3, z: -0.6, turn: true },
      { x: 6.3, z: -0.6, turn: true },
    ] as const,
    /** The crane straddles the stack at x = crane.x; the control tower stands on the quay. */
    crane: { x: 0 },
    tower: { x: -6.6, z: 4.9 },
    footprint: [18.4, 13] as const,
  },
  crane: {
    /** Gantry: legs at ±legX (x) and ±legZ (z), girder top, boom out to +boomZ over the quay. */
    legX: 2.2,
    legZ: 3.8,
    top: 9,
    boomZ: 9,
    backZ: -5,
    leg: 0.32,
    body: '#FF9F43',
    bodyDark: '#E5822A',
    steel: '#8A909C',
    cab: '#FFF4E0',
    cable: '#4F4A5E',
  },
  tower: {
    /** Harbour control tower (part of the yard prefab): base, shaft, glass cab, cap, pinwheel. */
    base: 2.6,
    shaft: 1.3,
    shaftH: 8,
    cabW: 3.2,
    cabH: 2,
    roofH: 0.5,
    mast: 1.4,
    radarR: 1.1,
    wall: '#FFF4E0',
    trim: '#3FB8AF',
    glass: '#FFC870',
    roof: '#5DA9E9',
    radar: '#E9EEF5',
  },
  foundry: {
    /** Furnace hall (x × z × h), monitor roof, two chimneys at the back, glowing mouth + trough. */
    w: 6.6,
    d: 4.2,
    h: 3.6,
    roofRise: 1.3,
    chimneyR: 0.55,
    chimneyH: 10,
    /** Chimney centres (x, z) in the hall frame. */
    chimneys: [
      { x: -2.1, z: -1.1 },
      { x: 2.3, z: -1.3 },
    ] as const,
    wall: '#9C8C86',
    brick: '#C2675A',
    roof: '#5A5664',
    trim: '#F5C84C',
    lavaHot: '#FFB347',
    iron: '#6F7685',
    footprint: [7, 5.4] as const,
  },
  smithy: {
    w: 3.4,
    d: 3,
    h: 2.4,
    roofRise: 1.1,
    chimneyH: 4.6,
    /** Chimney centre (x, z) in the hut frame; the forge stands in front of it. */
    chimney: { x: -0.7, z: 0.95 },
    wall: '#E7D3BC',
    timber: '#8A5A3B',
    roof: '#E8735A',
    glow: '#FF6A3D',
    anvil: '#5A5664',
    footprint: [3.8, 4.6] as const,
  },
  /** containerRow (TASK-405 density pass): one loose stack on the quay, tiers per column. */
  row: { tiers: [2, 2, 1] as const, footprint: [5.4, 6.8] as const },
  /** fuelTank: two horizontal tanks on saddles side by side (z), a catwalk and a filler pipe. */
  tank: {
    r: 0.78,
    len: 3,
    gap: 0.2,
    body: '#FFF4E0',
    band: '#FF9F43',
    saddle: '#6F7685',
    footprint: [3.6, 2.8] as const,
  },
  /** forklift: a small yellow yard truck with its mast up front (+z) carrying a crate pallet. */
  forklift: {
    w: 1.1,
    l: 1.7,
    body: '#F5C84C',
    dark: '#3A3F4D',
    seat: '#E5822A',
    pallet: '#D2A679',
    footprint: [1.4, 2.4] as const,
  },
  rail: {
    /** Segment length (x), gauge (rail centres at ±gauge / 2), rail top. */
    len: 2,
    gauge: 1.1,
    top: 0.22,
    steel: '#8A909C',
    sleeper: '#8A5A3B',
    ballast: '#7C7682',
  },
  ship: {
    /** Cargo ship mover (render/movers.ts): hull length (z), beam, deck height, containers. */
    l: 11,
    beam: 3.4,
    deck: 1.1,
    hull: '#E35D6A',
    hullLow: '#3A3F4D',
    deckCol: '#D9CFC2',
    bridge: '#FFF4E0',
    window: '#FFC870',
    funnel: '#FF9F43',
  },
} as const;

/** TASK-393: the tower is built at its old size (8 / 7 u) and stretched in y by this factor. */
export const COOLING_TOWER_RISE = 1.6;
/** Cooling tower nominal heights per variant (u). */
export const COOLING_TOWER_HEIGHTS = [13, 11.5] as const;

export const DEVOPS_PROP_DEFS: readonly PropDef[] = [
  // T0 geothermal plant landmark: hyperboloid tower, steam emitter above the lip
  {
    id: 'coolingTower',
    geo: 'coolingTower',
    tier: 0,
    variants: 2,
    footprint: 2.6,
    flags: grounded,
  },
  { id: 'pipe', geo: 'pipe', tier: 2, variants: 3, footprint: 1.0, flags: grounded },
  { id: 'cableSpool', geo: 'cableSpool', tier: 2, variants: 2, footprint: 0.7, flags: grounded },
  { id: 'steamVent', geo: 'steamVent', tier: 2, variants: 2, footprint: 0.5, flags: grounded },
  { id: 'warningSign', geo: 'warningSign', tier: 3, variants: 2, footprint: 0.4, flags: grounded },
  {
    id: 'basaltBoulder',
    geo: 'basaltBoulder',
    tier: 1,
    variants: 3,
    footprint: 1.2,
    flags: grounded,
  },
  { id: 'rackRow', geo: 'rackRow', tier: 2, variants: 2, footprint: 1.6, flags: grounded },
  // TASK-405 "Ember Works": one variant each (one draw call per def); ≥ 3 u structures from T0
  {
    id: 'containerYard',
    geo: 'containerYard',
    tier: 0,
    variants: 1,
    footprint: 11,
    flags: grounded,
  },
  { id: 'foundry', geo: 'foundry', tier: 0, variants: 1, footprint: 3.8, flags: grounded },
  // T2: the smithies are small; their LOD1 group would cost a far draw call in the postcard
  { id: 'smithy', geo: 'smithy', tier: 2, variants: 1, footprint: 2.1, flags: grounded },
  { id: 'railTrack', geo: 'railTrack', tier: 2, variants: 1, footprint: 1.0, flags: grounded },
  // density pass: quay stock and machinery (the row is ≥ 3 u, so it draws from T0 like the yard)
  {
    id: 'containerRow',
    geo: 'containerRow',
    tier: 0,
    variants: 1,
    footprint: 3.2,
    flags: grounded,
  },
  { id: 'fuelTank', geo: 'fuelTank', tier: 2, variants: 1, footprint: 1.8, flags: grounded },
  { id: 'forklift', geo: 'forklift', tier: 2, variants: 1, footprint: 0.9, flags: grounded },
];
