/**
 * research theme structures (M14b): PropDefs appended to PROP_DEFS after PROP_DEFS_BUILDINGS
 * (content/props.ts, fixed theme order). Geometry: geo/themes/research.ts (+ campus.ts,
 * science.ts, garden.ts). New defs are appended at the end so existing def indices stay stable.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';
import { EMISSIVE, FLOWERS, ROCK, WOOD } from '../palette.ts';
import { CAMPUS_PALETTE as CP, SCIENCE_PALETTE as SP } from '../themes/research.ts';

const { grounded, noShadow } = PropFlag;

export const RESEARCH_PROP_DEFS: readonly PropDef[] = [
  // anemometer rotor spins via aSpin (wind = 0 on all vertices, so not `windy`)
  { id: 'weatherMast', geo: 'weatherMast', tier: 1, variants: 2, footprint: 0.8, flags: grounded },
  // TASK-402a: the summit landmark of Observatory University (~11 u, T0; door + steps on +z)
  // v2 = comet night (TASK-416, LOD1 = v0's); only the planner decides which variant stands
  { id: 'observatory', geo: 'observatory', tier: 0, variants: 3, footprint: 4.0, flags: grounded },
  // floats: pivot = water level, no contact blob (like buoy)
  { id: 'instrumentBuoy', geo: 'instrumentBuoy', tier: 2, variants: 2, footprint: 0.4, flags: 0 },
  // TASK-400 Biodome Lab: the hero dome is the island's T0 landmark; the small domes read from
  // T0 too (D-031, >= 3 u wide); vent pinwheels spin via aSpin
  { id: 'biodomeHero', geo: 'biodomeHero', tier: 0, variants: 1, footprint: 3.2, flags: grounded },
  { id: 'biodome', geo: 'biodome', tier: 0, variants: 1, footprint: 1.8, flags: grounded },
  // rim outcrops (theme scatter), faintly glowing at night
  {
    id: 'crystalCluster',
    geo: 'crystalCluster',
    tier: 1,
    variants: 1,
    footprint: 0.7,
    flags: grounded,
  },
  // floats at the cove pier: pivot = water level, no contact blob (like instrumentBuoy)
  { id: 'researchVessel', geo: 'researchVessel', tier: 1, variants: 1, footprint: 1.3, flags: 0 },

  // TASK-402a campus buildings (>= 3 u wide read from T0, D-031); door on +z, pivot at the ground
  { id: 'facultyHall', geo: 'facultyHall', tier: 0, variants: 3, footprint: 3.2, flags: grounded },
  {
    id: 'libraryRotunda',
    geo: 'libraryRotunda',
    tier: 0,
    variants: 1,
    footprint: 3.6,
    flags: grounded,
  },
  // slender (2 u) but 9.5 u tall: a T1 silhouette that still reads in the postcard view
  // v3 = bell cupola (TASK-416, LOD1 = v0's)
  { id: 'campusTower', geo: 'campusTower', tier: 1, variants: 4, footprint: 1.6, flags: grounded },
  // v2 = QA Bug Zoo (TASK-424): only where the QA plan pins it, random rolls keep v0-v1
  {
    id: 'terrarium',
    geo: 'terrarium',
    tier: 0,
    variants: 3,
    rollVariants: 2,
    footprint: 2.6,
    flags: grounded,
  },
  // sculptures
  {
    id: 'atomSculpture',
    geo: 'atomSculpture',
    tier: 1,
    variants: 1,
    footprint: 1.3,
    flags: grounded,
  },
  { id: 'dnaHelix', geo: 'dnaHelix', tier: 1, variants: 1, footprint: 1.1, flags: grounded },
  {
    id: 'armillarySphere',
    geo: 'armillarySphere',
    tier: 1,
    variants: 1,
    footprint: 1.6,
    flags: grounded,
  },
  {
    id: 'scholarStatue',
    geo: 'scholarStatue',
    tier: 1,
    variants: 2,
    footprint: 1.1,
    flags: grounded,
  },
  {
    id: 'rocketMonument',
    geo: 'rocketMonument',
    tier: 0,
    // v1 = the R13 launch gantry (M22 TASK-483), pinned by the Research plan only
    variants: 2,
    rollVariants: 1,
    footprint: 1.9,
    flags: grounded,
  },
  // outdoor science: radioDish v0 big (~7.4 u), v1 small (~3.6 u)
  { id: 'radioDish', geo: 'radioDish', tier: 0, variants: 2, footprint: 3.2, flags: grounded },
  // v2 = the R20 weather roof (M22 TASK-483), pinned by the Research plan only
  {
    id: 'labPod',
    geo: 'labPod',
    tier: 1,
    variants: 3,
    rollVariants: 2,
    footprint: 2.8,
    flags: grounded,
  },
  // garden kit (flowerBed and bench already exist: HQ defs)
  { id: 'fountain', geo: 'fountain', tier: 1, variants: 1, footprint: 1.9, flags: grounded },
  {
    id: 'hedgeParterre',
    geo: 'hedgeParterre',
    tier: 2,
    // v2-v5 = the R12 maze tiles (M22 TASK-483), pinned by the Research plan only
    variants: 6,
    rollVariants: 2,
    footprint: 2.4,
    flags: grounded,
  },
  { id: 'topiary', geo: 'topiary', tier: 2, variants: 3, footprint: 0.5, flags: grounded },
  { id: 'pergola', geo: 'pergola', tier: 1, variants: 1, footprint: 2.0, flags: grounded },
];

/**
 * Star Academy kit colours (geo/themes/culture-research.ts), all from the campus / science /
 * base palette tables (B6: no new colours). Warm lamplit wood, brass and chalk against cool slate;
 * `glass` is the Research glass (clear pale aqua, flat panes: the biodome pool tint, ART_BIBLE §2).
 */
export const RESEARCH_CULTURE_KIT = {
  glass: '#8EEBE0',
  glassFrame: CP.trim,
  /** Slate chalkboard + oak frame + chalk hues. */
  board: CP.shutterInside,
  boardFrame: WOOD.logs,
  chalk: CP.trim,
  chalkTeal: CP.tubeBand,
  chalkGold: CP.gold,
  chalkPink: FLOWERS[0],
  /** Woods. */
  wood: WOOD.planks,
  woodDark: WOOD.logs,
  woodDeep: WOOD.dark,
  /** Brass / bronze / steel. */
  brass: SP.brass,
  bronze: SP.bronze,
  bronzeDark: SP.bronzeDark,
  steel: CP.silver,
  steelDark: ROCK[2],
  /** Painted enamel. */
  white: CP.tube,
  cream: CP.stucco,
  teal: CP.tubeBand,
  tealDeep: CP.door,
  roofTeal: CP.roofTeal,
  roofSlate: CP.roofSlate,
  copper: CP.copper,
  copperLight: CP.copperLight,
  stone: CP.stone,
  stoneDark: CP.stoneDark,
  lens: CP.lens,
  /** Book spines. */
  books: [
    CP.brick,
    CP.roofTeal,
    CP.gold,
    CP.roofSlate,
    CP.copper,
    CP.planter,
    CP.door,
    CP.brickDark,
  ],
  /** Foliage / soil / pigeons / owl. */
  fern: CP.fern,
  flowers: CP.flowers,
  soil: CP.soil,
  pigeon: ROCK[0],
  pigeonDark: ROCK[1],
  owlBrown: WOOD.logs,
  owlCream: CP.stucco,
  /** Lamp glow (emissive 1) and the mini volcano's lava / ember. */
  lamp: CP.window,
  lampWarm: EMISSIVE.lantern,
  lava: EMISSIVE.lava,
  basalt: SP.nozzle,
  rocketRed: SP.rocketRed,
  planets: [SP.rocketRed, CP.tubeBand, CP.gold, CP.flowers[0], CP.flowers[2], CP.copper],
} as const;

/**
 * M19 TASK-416 "Star Academy" kit (geo/themes/culture-research.ts; ledger: content/cultures/
 * research.ts). Appended at the END of PROP_DEFS (content/props.ts) so no existing defId shifts.
 * No tier 0/1: the campus identity at T0/T1 comes from the observatory and campusTower variants
 * (same LOD1 as their variant 0). None of the defs reaches isLargeStructure (< 3 u high, smaller
 * plan extent < 3 u). Tier-3 micro props skip the shadow pass (B4).
 */
export const RESEARCH_CULTURE_PROP_DEFS: readonly PropDef[] = [
  {
    id: 'tripodTelescope',
    geo: 'tripodTelescope',
    tier: 2,
    // v2 = the rim telescope deck (M28 TASK-525), pinned by the Research plan only
    variants: 3,
    rollVariants: 2,
    footprint: 0.9,
    flags: grounded,
  },
  // v3 = the R9 specimen plate (M22 TASK-483), pinned by the Research plan only
  {
    id: 'chalkboard',
    geo: 'chalkboard',
    tier: 2,
    variants: 4,
    rollVariants: 3,
    footprint: 1.0,
    flags: grounded,
  },
  { id: 'orrery', geo: 'orrery', tier: 2, variants: 2, footprint: 1.2, flags: grounded },
  {
    id: 'lectureSteps',
    geo: 'lectureSteps',
    tier: 2,
    variants: 2,
    footprint: 2.4,
    flags: grounded,
  },
  { id: 'teaTrolley', geo: 'teaTrolley', tier: 2, variants: 2, footprint: 0.7, flags: grounded },
  {
    id: 'weatherBalloonCart',
    geo: 'weatherBalloonCart',
    tier: 2,
    variants: 2,
    footprint: 1.0,
    flags: grounded,
  },
  { id: 'owlBox', geo: 'owlBox', tier: 2, variants: 2, footprint: 0.6, flags: grounded },
  {
    id: 'pigeonPerch',
    geo: 'pigeonPerch',
    tier: 3,
    variants: 2,
    footprint: 0.6,
    flags: grounded | noShadow,
  },
  {
    id: 'bookCart',
    geo: 'bookCart',
    tier: 3,
    variants: 3,
    footprint: 0.7,
    flags: grounded | noShadow,
  },
  {
    id: 'miniVolcanoTerrarium',
    geo: 'miniVolcanoTerrarium',
    tier: 3,
    variants: 2,
    footprint: 0.6,
    flags: grounded | noShadow,
  },
];

/**
 * M22 TASK-483 Research quick-win variants (geo/themes/research-m22.ts); only the Research plan pins
 * them, random rolls keep the old variants (`rollVariants`). Lengths in u, prop-local frame.
 *  - R12 hedge maze tiles: hedgeParterre v2-v5 (props-themes/research-maze.ts).
 *  - R20 weather roof: labPod v2, a yawing anemometer head (cup wheel + vane tail) on the roof.
 *  - R13 launch gantry: rocketMonument v1, the retro rocket beside a red lattice gantry tower with
 *    hoses; the test-firing steam rises at `steamAt`.
 *  - R17 bell hour: the campusTower v3 belfry bells hang from `bells` (culture movers swing them).
 *  - R9 specimen plate: chalkboard v3, a brass plate on an oak post.
 */
export const RESEARCH_M22 = {
  labPodWeather: { variant: 2, mastH: 1.0, tailLen: 0.62, hubZ: 0.2, cupArm: 0.4, scale: 1.45 },
  gantry: {
    variant: 1,
    /** Tower centre (x), square half side at the base / top, height, swing-arm height. */
    towerX: -1.75,
    base: 0.62,
    top: 0.42,
    height: 4.9,
    armY: 3.4,
    steel: '#E35D6A',
    steelDark: '#B8434F',
    hose: ['#4FC3C9', '#FAFAF5'] as const,
    /** Footprint of the whole piece (x, z) for the planner, and its steam nozzle (prop-local). */
    footprint: [5.0, 3.2] as const,
    steamAt: [0, 0.5, 0] as const,
  },
  /** campusTower v3 belfry bells: hinge height on the beam, z of the two bells, size (u). */
  bells: { hingeY: 6.8, z: [-0.7, 0.7] as const, radius: 0.3, height: 0.55 },
  plate: { variant: 3, height: 1.25, scale: 1.5 },
} as const;

/** Defs of the M22 Research variants, for the prop showcase (`gallery-shots.ts research`). */
export const RESEARCH_M22_PROP_IDS: readonly string[] = [
  'hedgeParterre',
  'labPod',
  'rocketMonument',
  'chalkboard',
  'campusTower',
];
