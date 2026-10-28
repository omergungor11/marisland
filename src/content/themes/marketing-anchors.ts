/**
 * Beacon Rock M27 "Cable Carnival" anchors (TASK-516, D-095; study marketing-research §1.2 A, M1 /
 * M3 / M4 / M13). The Marketing plan (world/gen/plans/marketing-anchors.ts) reads the stack tops,
 * the summit lip and the windward cliff face, publishes island anchors and reserves their shapes
 * (scatter and seamarks keep off). No prop, pad or zone is placed here: TASK-518 puts the TASK-517
 * props on the anchors. Distances in u, angles in degrees.
 */
export const MARKETING_ANCHORS = {
  /**
   * Sea-stack tops (profile anchors `stack0…`): the top = the cells within `topTol` of the highest
   * sample within `search` u of the profile anchor; usable radius = the largest disc round the top
   * centre whose ring samples stay within `rimTol` of the top (≤ `maxR`); a stack needs `minR`.
   */
  stack: { search: 7, topTol: 0.35, rimTol: 0.6, maxR: 4, minR: 1.2, minTop: 3 },
  /**
   * Cable car (M1, the mailLine gondola variant): summit lip station → pylons on the stack tops →
   * far station on the last stack (the most stacks that chain, the smallest total turn first;
   * every stack on most seeds, so the line sweeps along the windward arc). Cable seats `seat` u above each pivot's ground (station /
   * mid pylon), sag = span × `sagFrac` in [`sagMin`, `sagMax`] (the mailCableSag parabola), the
   * gondola hangs `hang` u (cable to cabin floor). Gondola floor ≥ `clearWater` over the sea and
   * ≥ `clearLand` over the ground / stack tops, checked every `step` u outside `endSkip` of a
   * station / pylon. Horizontally ≥ `towerClear` from the Broadcast Tower axis and ≥ `shapeGap`
   * from every summit obstacle. Spans ≤ `maxSpan`, turn at a pylon ≤ `maxTurn`.
   */
  cable: {
    seat: { station: 6.5, pylon: 7.5 },
    sagFrac: 0.03,
    sagMin: 0.35,
    sagMax: 1.6,
    hang: 2.2,
    clearWater: 6.5,
    clearLand: 1,
    step: 0.5,
    endSkip: 2.5,
    towerClear: 5,
    shapeGap: 0.6,
    maxSpan: 60,
    maxTurn: 125,
    /** Summit station: a disc on the plateau (≥ top − `drop`, relief ≤ `relief`), `search` u round the tower. */
    station: { r: 2, search: 18, drop: 2, relief: 1.2, gap: 0.5 },
    /** Footprint radius of a mid pylon and of the far station on a stack top. */
    pylonR: 0.8,
    farR: 1.5,
    /** Reserved strip width along every span (scatter keeps off; seamark discs every `discStep`). */
    strip: 3,
    discStep: 4,
  },
  /**
   * Stack roles, one stack each (most roles first, the billboard preferably on the far station's
   * stack, the dive tower off it). `transmitter` (M2 mast, antennaTower v1 foot 0.75) and
   * `diveTower` (M13 platform) stand on a stack top beside its pylon (`r` footprint), ≥ `clear` u
   * horizontally off every span; `seaBillboard` (M3) hangs on the seaward face.
   */
  transmitter: { r: 0.8, clear: 1.3 },
  /**
   * Dive tower: platform pivot on the top rim (`r` footprint), facing a splash pool in the sea
   * `reach` u out from the pivot; pool disc `poolR`, seabed ≥ `depth` below sea level on every
   * sample (centre ≥ `centreDepth`), ≥ `shore` off the coast, off the spans by `clear`
   * (platform) / `poolClear` (pool disc); pool heading ≥ `spanOff` off every span heading.
   * `platformH`: the platform top over the stack top (the dive height = top + platformH; a contract
   * number for TASK-517 / 518, the gondola floor over a pylon is seat.pylon − hang = 5.3).
   */
  diveTower: {
    r: 1,
    clear: 1.8,
    reach: [4, 9] as const,
    poolR: 2.5,
    depth: 2,
    centreDepth: 2.5,
    shore: 1,
    poolClear: 1,
    spanOff: 50,
    platformH: 5,
  },
  /**
   * Sea billboard: a vertical plane on the stack's seaward face (headings every `headStep` within
   * `arc` of the heading from the summit to the stack), its top `topBelow` under the stack top,
   * growing down (0.5 u steps, bottom ≥ `yLo` over the sea) while the face stays behind the plane
   * by ≤ `maxGap` over the whole board; widths `maxW` … `minW` in `wStep` steps; height ≥ `minH`.
   * The widest × tallest board wins.
   */
  billboard: {
    arc: 70,
    headStep: 10,
    yLo: 0.8,
    topBelow: 0.3,
    maxGap: 2.4,
    minW: 3,
    maxW: 7,
    wStep: 1,
    minH: 3,
  },
  /**
   * ON AIR cliff neon (M4): four vertical letters `letter` u tall + `pad` top and bottom, on a
   * windward cliff face (normal = the shore-SDF gradient, `cliffShare` of the face samples
   * Zone.cliff) whose plane the face stays behind by ≤ `maxGap` with nothing poking through; the
   * column hangs from `lipBelow` under the lip, grows down to ≤ `maxExtent` (bottom ≥ `yLo` over
   * the sea); widths `maxW` … `minW`. Headings every `headStep` within `arc` of windward, the one
   * nearest windward + `viewDeg` (the W4 camera side on seed 2024) wins, ≥ `cableClear` off the
   * cable's first span.
   */
  neon: {
    letters: 4,
    letter: 1.4,
    pad: 0.4,
    maxExtent: 9,
    lipBelow: 1.5,
    yLo: 2,
    maxGap: 2.5,
    minW: 2,
    wStep: 1,
    maxW: 4,
    viewDeg: -40,
    arc: 55,
    headStep: 5,
    cableClear: 4,
    /** Minimum share of the face samples that are Zone.cliff. */
    cliffShare: 0.6,
  },
  /**
   * Keep-out margins: seamarks (sea stacks / buoys) round the pool and along the spans; boat
   * routes round the pool (`route`, added to the pool radius).
   */
  seaKeepOut: { pool: 2, span: 3, route: 3 },
} as const;
