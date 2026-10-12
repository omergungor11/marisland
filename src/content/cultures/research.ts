/**
 * Yıldız Akademisi (Star Academy). Kit ledger (TASK-416): 10 new defs, 10/10 tier >= 2, no tier-1,
 * no tier-0, ORDERED BY PRIORITY (most identity-defining first; if the budget gate drops the
 * per-island cap to 6, cut from the end: the first six are tripodTelescope, chalkboard, orrery,
 * lectureSteps, teaTrolley, weatherBalloonCart). Geometry: geo/themes/culture-research.ts. The
 * T0/T1 identity comes from VARIANTS of existing defs (not ledger entries, LOD1 = variant 0's):
 * observatory v2 (comet night: slit wide open, dome glowing teal, balcony telescope) and
 * campusTower v3 (bell cupola). The miniVolcanoTerrarium is its own tier-3 def (the existing
 * terrarium is a 5 u tier-0 glasshouse). Rhythm and relay by waves 2-3.
 * Placement (TASK-426): `RESEARCH_CULTURE_SITES` below, read by world/gen/plans/research.ts.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { CultureDef } from './types.ts';

const { grounded, noShadow } = PropFlag;

export const RESEARCH_CULTURE: CultureDef = {
  theme: 'research',
  id: 'starAcademy',
  name: 'Yıldız Akademisi',
  nameEn: 'Star Academy',
  palette: {
    accent: '#4FC3C9',
    roofs: ['#3FB8AF', '#666C7A'],
    walls: ['#FFF4E0'],
    trims: ['#E0B050', '#C29A74'],
  },
  pennant: { cut: 'star', accent: '#4FC3C9' },
  kit: [
    { id: 'tripodTelescope', tier: 2, flags: grounded },
    { id: 'chalkboard', tier: 2, flags: grounded },
    { id: 'orrery', tier: 2, flags: grounded },
    { id: 'lectureSteps', tier: 2, flags: grounded },
    { id: 'teaTrolley', tier: 2, flags: grounded },
    { id: 'weatherBalloonCart', tier: 2, flags: grounded },
    { id: 'owlBox', tier: 2, flags: grounded },
    { id: 'pigeonPerch', tier: 3, flags: grounded | noShadow },
    { id: 'bookCart', tier: 3, flags: grounded | noShadow },
    { id: 'miniVolcanoTerrarium', tier: 3, flags: grounded | noShadow },
  ],
  // emitted by world/gen/plans/research.ts (TASK-426); `defs` = the props the scene stands on
  storySpots: [
    /** 22:00 Comet Night: the summit telescope + the comet board by the open dome. */
    { kind: 'cometWatch', defs: ['observatory', 'tripodTelescope', 'chalkboard'] },
    /** A scholar on a book-pile stool at a telescope. */
    { kind: 'bookStepGazer', defs: ['tripodTelescope', 'bookCart'] },
    /** Night owl at its nest box (glowing eyes). */
    { kind: 'owlNight', defs: ['owlBox'] },
    { kind: 'teaTime', defs: ['teaTrolley'] },
    /** 09:00–16:00 lecture: bots on the steps, the lecturer at the board. */
    { kind: 'lecture', defs: ['lectureSteps', 'chalkboard'] },
    /** 06:00 the weather balloon rises from the cart by the mast. */
    { kind: 'balloonLaunch', defs: ['weatherBalloonCart', 'weatherMast'] },
    /** A pigeon on a statue's head (the perch beside it). */
    { kind: 'pigeonStatue', defs: ['pigeonPerch'] },
    { kind: 'volcanoSteam', defs: ['miniVolcanoTerrarium'] },
  ],
  rhythm: [],
  relay: { order: 7, id: 'cometNight' },
};

/**
 * Star Academy placement (TASK-426, world/gen/plans/research.ts). Lengths in u, angles in deg.
 * Every piece needs near-level ground round its footprint (`level`) so its pad levels it whole;
 * the other defs block their FIXTURE_RADIUS disc (content/settlements.ts). Variants are pinned.
 */
export const RESEARCH_CULTURE_SITES = {
  /** THE observatory is the comet-night variant (slit open, TASK-416). */
  observatoryVariant: 2,
  /**
   * Footprint grown by `grow` has at most `relief` u relief before its own pad; a pad core keeps
   * `padKeep` u off other pads' footprints, else the ground must already be `flat` (no pad).
   */
  level: { grow: 1, relief: 2, flat: 0.2, padKeep: 0.3, padLevel: 0.6, breakKeep: 0.6 },
  /** Pad margin round every culture piece off the plaza. */
  pad: 1.2,
  /** Gap kept to other obstacles (on the paving / on the lawn). */
  gap: { plaza: 0.3, lawn: 0.6 },
  /**
   * Every piece keeps this far off the plan's path pins (hub, doors, gates, pier); the planner
   * also keeps every pin linked to the hub over open cells (no pockets round the fountain).
   */
  pinKeep: 1.6,
  /** Lawn pieces keep this far off the avenues (quad rim → observatory door / garden gate). */
  avenueKeep: 2.2,
  /** Orrery on the quad paving: this far from the fountain centre, off the avenue mouths. */
  orrery: { at: [3.1, 3.4] as const, angles: 24, keepDeg: 26, variant: 0 },
  /**
   * In front of the library (along its door axis from the front face): the tea trolley and book
   * carts beside the door (`side` u off the axis), the door itself (`door` u half width) open.
   */
  library: {
    front: [0.9, 1.5, 2.1] as const,
    side: [3.6, 2.9, 4.3, 2.2] as const,
    door: 1.4,
    trolley: { variant: 0 },
    books: { count: [1, 2] as const, variants: [0, 1] as const },
  },
  /**
   * Faculty pennant lines (pennantLine, poles 6 u apart): the first spans the library front (the
   * research faculty), the others cross the quad's avenues (harbour, garden, observatory) every
   * `spacing` u from `start` u past the paving; the other faculties in THEME_IDS order.
   */
  pennants: {
    count: 7,
    half: 3,
    poleR: 0.2,
    libraryGap: 1.4,
    start: 0.2,
    spacing: 3,
    /** Candidate cord spots every `step` u up to `reach` u past `start`. */
    step: 1,
    reach: 10,
    /** Pole ground within this of the cord centre's (the line is rigid). */
    poleDrop: 0.35,
    cordDepth: 0.6,
    /** The cord strip keeps clear of every obstacle bigger than this (u radius / half side). */
    bigR: 1.5,
  },
  /**
   * Lecture steps + chalkboard on the lawn round the quad (`ring` u from its centre): the board
   * `boardAt` u in front of the steps, facing them; the class looks away from the quad.
   */
  lecture: {
    ring: [8, 30] as const,
    turns: [0, 45, -45, 90, -90, 135, -135, 180] as const,
    /** Site: steps (v1 straight, 3.84 × 2.55 u; pivot `back` u in front of their centre). */
    steps: { w: 4.0, d: 2.6, back: 0.7, variant: 1 },
    board: { at: 2.2, w: 1.7, d: 1.1, variant: 1 },
    gap: 0.3,
    minShore: 2,
    relief: 2.2,
  },
  /**
   * Summit: a telescope (+ a book-pile stool) and the comet board on the observatory's rim, off
   * its door side; the owl box (glowing eyes) behind it.
   */
  summit: {
    /** Spots round the dome (bearings), the door sector kept open, gap to the dome. */
    angles: 28,
    doorKeepDeg: 50,
    /** Piece centres within this of the dome's rim (the ring that ends up flat on the cone). */
    flat: 0.9,
    /** …where the ground before the pads is within this of the observatory pad's level. */
    drop: 0.8,
    /** The owl box pole and the board stand on thin legs: their ground nearer the level still. */
    slimDrop: 0.5,
    gap: 0.25,
    tripodVariant: 0,
    /** The book-pile stool (bookCart v2): beside the eyepiece, `side` across, `back` behind. */
    stool: { side: 0.8, back: 0.35, r: 0.32, variant: 2 },
    /** The comet board (v0: comet + "?"), nearest the telescope, facing it. */
    board: { variant: 0, w: 1.6, d: 1.0, cell: 0.5 },
    owlVariant: 1,
  },
  /**
   * Tripod telescopes on the terrace edges facing the sea: shore distance window, at least
   * `minUp` u above sea, `spread` u apart.
   */
  tripods: { count: [1, 2] as const, shore: [3.5, 9] as const, minUp: 4, spread: 10, variant: 1 },
  /**
   * The weather balloon cart (v0 tethered) beside the base's weather mast (ring radii); with no
   * room there, on the lawn `fallback` u from the observatory centre.
   */
  balloon: {
    ring: [1.9, 5] as const,
    angles: 16,
    variant: 0,
    owlVariant: 0,
    fallback: [7, 12] as const,
  },
  /** Pigeon perches beside the statues (scholar statues first, then the sculptures). */
  pigeons: {
    max: 2,
    statues: ['scholarStatue', 'atomSculpture', 'dnaHelix', 'armillarySphere', 'rocketMonument'],
    out: 0.7,
    angles: 12,
    /** Beside a statue's pad the ground must already be this flat (a tiny T3 perch). */
    flat: 0.7,
  },
  /** Mini volcano terrariums in a row in front of the glasshouses. */
  volcanoes: {
    count: [3, 2, 1] as const,
    pitch: 1.2,
    front: [1.0, 1.6, 2.2, 3.0, 4.0] as const,
    slide: [0, 1.5, -1.5, 3, -3, 4.5, -4.5] as const,
  },
} as const;
