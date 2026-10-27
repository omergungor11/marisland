/**
 * QA "Proving Grounds" kit (M24 TASK-499; WORLD_PLAN §4.5, D-062 R3-14): the toy-factory test yard on
 * the meadow beside the loop track. Look and size tables of the three new defs (geo/themes/qa-proving.ts),
 * the white / mint / yellow palette they share, and the placement numbers of world/gen/plans/qa.ts.
 * Defs: content/props-themes/qa-proving.ts.
 */

/** Toy-factory palette (white / mint / yellow, a little wood and rubber); the kit uses nothing else. */
export const PROVING_PAL = {
  white: '#FAFAF5',
  mint: '#7FD8B3',
  mintMid: '#3FBF8F',
  mintDeep: '#2E9E74',
  yellow: '#F5C84C',
  steel: '#A9AEB8',
  rubber: '#4F4A5E',
  wood: '#E2B887',
  woodDark: '#B8875A',
  red: '#E35D6A',
  sky: '#CDEBFF',
} as const;

const P = PROVING_PAL;

export const QA_PROVING = {
  /** Q2 drop tower (tier 1): 10 u lattice with a crate on the guide rails and a check lamp at the foot. */
  tower: {
    /** Plinth height, lattice height (to the head frame), head housing height. */
    plinth: 0.3,
    h: 8.6,
    head: 0.9,
    /** Lattice half widths at the foot and at the head, bays. */
    base: 1.3,
    top: 1.05,
    bays: 4,
    leg: P.white,
    brace: P.mint,
    rail: P.steel,
    housing: P.yellow,
    roof: P.mintDeep,
    pad: P.yellow,
    lamp: P.red,
    /**
     * The crate: cube edge, resting centre height (on the landing pad) and the top position's
     * centre height (hanging under the head). TASK-501 moves it between the two on the x = z = 0 axis.
     */
    crate: { size: 1.1, rest: 0.86, top: 8.05, wood: P.wood, band: P.woodDark, sticker: P.mintMid },
    /** The check lamp at the foot: pedestal (x, z) in front of the tower, height, lens radius. */
    footLamp: { x: 0, z: 2.1, h: 1.15, r: 0.26 },
    check: P.mintMid,
  },
  /** Q4 giant test fan (tier 2): 4 u of blades in a cage, a dummy on a streamer pole in front. */
  fan: {
    hubY: 2.95,
    blades: 5,
    bladeR: 2.0,
    bladeW: 0.62,
    cageR: 2.3,
    /** Streamer pole: z in front of the base, height, streamer segments. */
    poleZ: 3.0,
    poleH: 3.7,
    blade: P.yellow,
    cage: P.mintDeep,
    body: P.white,
    foot: P.mint,
    dummy: P.yellow,
    streamers: [P.yellow, P.mintMid, P.white] as const,
  },
  /** Q5 obstacle course (tier 2, 4 variants): hurdle, tyre stack, balance beam, slalom cones. */
  course: {
    variants: ['hurdle', 'tyreStack', 'balanceBeam', 'slalom'] as const,
    heights: [1.1, 1.15, 0.8, 0.75] as const,
  },
} as const;

/** Variant indices of the `obstacle` def. */
export const OBSTACLE_VARIANT = { hurdle: 0, tyreStack: 1, balanceBeam: 2, slalom: 3 } as const;

/**
 * Proving Grounds placement (world/gen/plans/qa.ts). Lengths in u; rects are [w, d] in the prop's
 * own frame (front +z). The stunt yard is a reserved flat rect of ~2× the loop track for the second
 * (figure-8 crash) track of TASK-501: nothing else is placed on it.
 */
export const QA_PROVING_PLAN = {
  /** Reserved stunt yard rects, tried in order (first that fits wins): ≈ 2× testTrack's [7, 14]. */
  stunt: [
    [14, 28],
    [12, 24],
    [10, 20],
    [9, 18],
  ] as const,
  /**
   * Candidate centres: every sample within `stuntSearch` of the loop track, both rect axes tried, score
   * = relief + `stuntNear` × distance. The first pass also wants `stuntKitPads[0]` of free flat ground round
   * the rect (room for the tower, fan and course): passes with a smaller pad follow, the last has none.
   */
  stuntSearch: 50,
  stuntNear: 0.02,
  stuntFar: 0.5,
  stuntFarCap: 45,
  stuntKitPads: [4, 2, 0] as const,
  stuntMinShore: 3.5,
  stuntRimClear: [8, 0] as const,
  stuntRelief: 1.8,
  stuntGap: 1.2,
  stuntTrackGap: 4.6,
  /** Level pad margin of the reservation. */
  stuntPad: 0.6,
  /** Kit pieces: relief tolerance, level pad margin, minimum shore. */
  maxRelief: 1.0,
  pad: 0.5,
  minShore: 3,
  /** Drop tower at a short end of the yard: gaps past the end to the lattice centre, obstacle radius. */
  towerGaps: [3.4, 4.4, 5.6] as const,
  towerR: 2.1,
  towerAlong: [0, 0.4, -0.4] as const,
  /**
   * Test fan beside a long side: gaps past the side to the fan base, along-lane offsets (fraction of
   * d / 2), obstacle discs of the fan and of its dummy pole (3 u in front, toward the yard).
   */
  fanGaps: [4.2, 5.2, 6.4] as const,
  fanAlong: [0, 0.3, -0.3, 0.55, -0.55] as const,
  fanR: 1.7,
  poleR: 0.5,
  /**
   * Obstacle course: pieces in lane order (variant, obstacle rect [w, d], `turn` = long axis along the
   * lane), `courseGap` between them, offsets (gap past the yard's long side to the nearest piece
   * edge) and start offsets along the lane (fraction of d / 2).
   */
  course: [
    { variant: 0, w: 2.9, d: 1.0, turn: false },
    { variant: 1, w: 2.7, d: 1.0, turn: false },
    { variant: 2, w: 4.4, d: 1.0, turn: true },
    { variant: 3, w: 4.2, d: 1.3, turn: true },
  ] as const,
  courseGap: 1.5,
  courseOffsets: [2.4, 3.4, 4.6, 6] as const,
  courseStarts: [-0.7, -0.4, -1, 0, 0.3] as const,
  courseAlong: [0, 0.5, -0.5, 0.85, -0.85, 0.25, -0.25] as const,
} as const;
