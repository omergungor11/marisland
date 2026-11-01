/**
 * Coding M33 site numbers (TASK-544, D-121; plan D-116): the Bot Foundry line, the Drone Port, the
 * robot test track and the Data Lake. The Coding plan (world/gen/plans/coding-foundry.ts) searches
 * and reserves them before the culture kit and the M22 beds, levels them with pads and cuts + zones
 * the lake on the final ground. No prop is placed here: TASK-545 puts the TASK-543 kit
 * on the anchors. Lengths in u, angles in degrees.
 */
import { CODING_M33 as K } from './coding-m33.ts';

export const CODING_FOUNDRY = {
  /**
   * Rect search of every site except the lake (`lake.limits`): the free lawns are crescents round the
   * plateau rim, so a rect may run along the shore and its pad level part of the lip. Candidates every
   * `step` grid samples, every `fine` when none fit.
   */
  search: {
    step: 2,
    fine: 1,
    /** Headings tried off the campus axis (plus the local shore tangent). */
    turns: [0, 90, 45, 135],
    minShore: 3,
    /** Shore distance kept along the rect's edges and across it (u). */
    edgeShore: 1,
    /** Past the reservation (`keep`). */
    gap: 0.4,
    /** Ground relief before levelling. */
    maxRelief: 3,
    /** Score weight of the relief (the bearing and proximity terms are ~1). */
    reliefCost: 0.3,
    /** Per u of shore distance (0: no pull either way). */
    rimCost: 0,
  },
  /** Free stub before each lot door, turbine and the dock during the search (its link comes in). */
  stub: { len: 6, width: 3.5 },
  /** Rects keep this far off the Kite Hill summit: a pad's falloff stays off the flank (u). */
  hillClear: 19,
  /** A target counts as joined when walkable ground lies within this many grid cells of it. */
  joinCells: 4,
  /** Pads: no relaxation against a neighbour (the Tech Park and the kit keep their levels). */
  padStep: 4,
  padMargin: 1,
  /** Past both pad cores: the grid cell between them stays on one level or the other. */
  padClear: 1,
  /** Reservation past the footprint: the pad cores of the pieces placed later stay off this one's. */
  keep: 0.6,
  /** Path pin this far past the rect edge. */
  gateOut: 1.4,
  /**
   * Final ground: land cells within the pad's core + falloff with a stale steep zone turn to lawn
   * when flatter than `flatSlope`; lawn steeper than `steepSlope` turns to cliff (D-109).
   */
  repaint: { reach: 5.5, flatSlope: 0.45, steepSlope: 0.8 },

  /** Foundry: the belt runs along the rect's long axis, its exit end toward the Tech Park. */
  line: {
    segment: K.conveyor.length,
    /** Belt length ≤ this share of the island radius. */
    share: 0.45,
    /** Conveyor segments, largest that fits. */
    segments: [6, 5, 4, 3],
    /** Rect width; lead-in before the belt; chute + landing past it. */
    width: 7,
    lead: 1.5,
    tail: K.conveyor.ramp + 2.3,
    /** Bot lands this far past the belt end (chute + hop). */
    exit: K.conveyor.ramp + 0.9,
    /** Arm bases stand `K.arm.reach` off the belt, the crates `crateOut` off it, on the +side. */
    armOffset: K.arm.reach,
    crateOut: 2.8,
    /** Prefer this bearing off the island centre (west / south-west, D-116). */
    bearing: 200,
    bearingCost: 1,
  },
  /**
   * Drone Port rect `size` [length, width], frame u along its long axis: H pad at `padU`, four masts
   * `mast` off it on the diagonals, hangar at `hangarU`. Largest that fits.
   */
  port: {
    sizes: [
      { size: [13, 9] as const, padU: -2, mast: 2.8, hangarU: 4.6 },
      { size: [11, 7.5] as const, padU: -1.8, mast: 2.4, hangarU: 3.8 },
    ],
    nearCost: 0.03,
  },
  /** Test track rect: `stations` obstacles along its long axis, `pitch` apart. Largest that fits. */
  track: { stations: [4, 3], width: 3.6, pitch: 3.6, end: 1.2, nearCost: 0.05 },
  /** Data Lake. */
  lake: {
    /** Long semi axis ≤ this share of the island radius. */
    share: 0.18,
    /** Semi axes [long, short] of the outline, largest that fits. */
    sizes: [
      [10, 5.5],
      [9, 5],
      [8, 4.5],
      [7, 4],
      [6, 3.5],
      [5, 3.5],
    ] as const,
    /** Reserved rect past the outline (the quay). */
    margin: 1.5,
    limits: { minShore: 4, edgeShore: 1, maxRelief: 3.5 },
    /** Outline radius wobble (3 lobes), share of the ellipse. */
    wobble: 0.08,
    /** Water surface this far below the pad level (it stands on the ground, as the Tech Park pools). */
    dip: 0.5,
    /** Bank: from the outline up to the pad level over this (u). */
    bank: 1.4,
    /** Paved quay width round the outline (Zone.plaza, the pool surround). */
    quay: 1.4,
    /** Prefer this bearing off the island centre (the east shore, D-116). */
    bearing: 0,
    bearingCost: 1,
    /** Published outline points. */
    rimPoints: 24,
    /**
     * Shore pieces: candidate outline angles; each keeps `pieceGap` off everything, `laneGap` off the
     * gate lane, `quayIn` outside the outline, `pieceShore` off the coast; footprint relief before
     * levelling ≤ `pieceRelief`; own pad (`pieceMargin`) on the lake's level; paved `pieceQuay` round.
     */
    shoreSteps: 48,
    pieceGap: 0.4,
    laneGap: 1,
    quayIn: 0.3,
    pieceShore: 1.5,
    pieceRelief: 3,
    pieceMargin: 0.6,
    pieceQuay: 0.6,
    /** Distance of the centre past the outline; keep-out radius. */
    pods: { count: 3, min: 2, out: 1.5, r: 1.3, spacing: 3 },
    pavilion: { out: 3, r: K.pavilion.radius + 0.55 },
    cloud: { out: 2.4, r: K.cloud.anchor },
  },
} as const;
