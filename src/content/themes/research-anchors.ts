/**
 * Research M28 "Summit Observatory" anchors (TASK-524, D-105; study marketing-research §2.2 A,
 * R2 / R3 / R4): the Star Stair up the summit crag, the meridian terrace beside it, the rim
 * telescope deck sites. The Research plan (world/gen/plans/research-anchors.ts) searches and
 * reserves them at plan time and settles them on the final ground in its `finish` (the stair's
 * grade line carved into the crag). No prop is placed here: TASK-526 puts the TASK-525 props on
 * the anchors. Distances in u, angles in degrees.
 */

export const RESEARCH_ANCHORS = {
  /**
   * Bearing (0 = +x, 90 = +z) of the sun's noon side: env `sampleEnv(12).sunDir` xz ≈
   * (−0.040, 0.049) → 130° (the day arc runs −x → +x over the +z side). "South" below.
   */
  southDeg: 130,
  /**
   * R3 meridian terrace: a disc of radius `r` (the 6 u sundial) at the crag's foot beside the
   * summit, its pad core `gap` u off the summit pad core, on a bearing from the observatory (every
   * `stepDeg`) ≥ `flankGap` off the stair face, the one farthest from the quad and the headland
   * first, `minShore` off the coast, clear of every obstacle by `gap` + `margin`. Its own pad
   * (`margin`; `step`: no neighbour relaxes it). The noon sun stands ≈ 86° high, so only
   * something over the dial could shade the noon line: the disc is reserved blocking.
   */
  meridian: {
    r: 3,
    margin: 2,
    step: 10,
    gap: 0.6,
    stepDeg: 15,
    flankGap: 50,
    minShore: 4,
  },
  /**
   * R2 Star Stair: a polyline from the quad terrace up the crag face to the observatory door,
   * three legs and two switchbacks, searched at plan time on the ground the pads will leave (the
   * summit / quad pad levels blended over their falloff), after the quad ring. Frame: the
   * observatory → quad axis turned by a tier's `turns` (u out, v across); top landing at u =
   * `top`, switchbacks at ∓ / ± a tier's `across` u, the foot at `footAcross` (≤ the
   * switchbacks'), u in `radial` by the tier's `steps`; legs ≥ `minLeg`, every switchback turning
   * ≥ `minTurn`, total length in `length`, the first and last legs `legGap` apart. Every `sample`
   * u a leg keeps `minShore` off the coast, `halfWidth` + `gap` off every obstacle (the landing
   * excepted; it may reach `plazaIn` onto the quad plaza) and `pathGap` off every footpath
   * outside `join` u of its ends (finish: the observatory door's own walk excepted). The foot lies
   * ≤ `footReach` past the quad pad core and ≤ `footAbove` over the quad. The grade line foot →
   * top (one grade along the arc, ≤ `maxGrade`) is what the finish `carve` writes; the largest
   * gap between it and the ground (≤ the tier's `maxCut`) scores (`cutCost`), with the length
   * (0.02 per u off the preferred), the turn and `footCost` × the foot's distance to the quad.
   * Lantern stations every ≈ `lampStep` u, `lamps` [min, max] of them.
   */
  stair: {
    /**
     * When the quad ring leaves no face for the stair, these pieces give way where its legs run
     * (the stair is the signature; a faculty hall or a rim lantern is one of several).
     */
    yieldTo: ['facultyHall', 'lanternPost', 'bench'] as const,
    /** Plan-time keep-out on the summit ring before the door (centre `at` u out). */
    landing: { at: 5.8, r: 1.8 },
    top: [5, 5.4] as const,
    /** The foot's offset across (u, ≤ the switchbacks'): the last leg may end on the axis. */
    footAcross: [8, 6, 4, 3, 1.5, 0] as const,
    radial: [6, 16] as const,
    minLeg: 3,
    minTurn: 100,
    /** Total length [min, max, preferred] (u). */
    length: [16, 28, 21] as const,
    sample: 0.5,
    /** The search tests shore / obstacles on a raster of this cell (u; nearest cell). */
    raster: 0.25,
    maxGrade: 0.85,
    /**
     * Search tiers, tried in order until one finds a stair: the lattice steps (u, coarse then
     * fine), the face turns (deg), the switchback offsets across (u), the largest cut (u).
     */
    tiers: [
      {
        steps: [1, 0.5],
        turns: [0, -15, 15, -30, 30, -45, 45],
        across: [3, 4, 5, 6, 7, 8],
        maxCut: 5,
      },
      {
        steps: [1],
        turns: [0, -15, 15, -30, 30, -45, 45, -60, 60, -75, 75],
        across: [2, 3, 4, 5, 6, 7, 8, 9, 10],
        maxCut: 6.5,
      },
    ] as const,
    cutCost: 0.3,
    /**
     * Finish carve of the grade line: full within `core` u of a leg, blended over `fall`; never
     * within `keepOff` u of another obstacle or of another pad's core.
     */
    carve: { core: 2, fall: 1, keepOff: 1.5 },
    /** Half width (u) of the legs' reservation (≥ the carve's core + keep-off and `pathGap`). */
    reserve: 2.5,
    minShore: 4,
    halfWidth: 1,
    gap: 1.5,
    pathGap: 2.2,
    join: 5,
    footAbove: 1.2,
    /** The legs may reach this far (u) onto the quad plaza disc (the foot on its rim). */
    plazaIn: 1,
    /** The foot lies within this (u) past the quad pad core (on the terrace lawn round the quad). */
    footReach: 10,
    /** Score weight of the foot's distance from the quad centre (per u). */
    footCost: 0.03,
    legGap: 2.6,
    lampStep: 3,
    lamps: [6, 8] as const,
  },
  /**
   * R4 rim telescope decks: `w` × `d` sites (w along the coast) on the lawn at the earth-wall lip,
   * facing out to sea (rotY = outward shore normal), reserved at plan time after the headland
   * base. The deck's sea edge sits `lipIn` u inside the lip; the ground drops ≥ `drop` u within
   * `beyond` u past it (an edge, not a lawn); relief under the deck ≤ `maxRelief`; clear of
   * obstacles by `gap`, of the cove (coveness < `cove`), ≥ `pier` u from the pier root,
   * `promontory` off the headland, ≥ `apart` u between decks (down to `minApart`); `count`
   * [min, max]. Candidates every `grid` u with shore distance in `shore`, the most windward first.
   * Finish: a deck stays when no footpath comes within `pathGap` and its relief is ≤
   * `settleRelief`; fewer than `count[0]` left are topped up from the final lip (`topUp`).
   */
  deck: {
    w: 3,
    d: 2,
    shore: [2.5, 8] as const,
    lipIn: 0.4,
    beyond: 3,
    drop: 1,
    maxRelief: 0.5,
    grid: 0.5,
    gap: 0.4,
    pathGap: 1,
    cove: 0.45,
    pier: 14,
    /** Off the `headland` anchor (the gantry, the base, the dish); the empty spur is welcome. */
    promontory: 10,
    apart: 14,
    minApart: 5,
    count: [2, 3] as const,
    /** Finish: relief the deck floor may have gained since (later pads' falloff; on posts). */
    settleRelief: 1,
    /** Finish top-up when fewer than `count[0]` are left: shore band, gap, spacing (u). */
    topUp: { shore: [1.5, 10] as const, gap: 0.2, apart: 4 },
  },
} as const;
