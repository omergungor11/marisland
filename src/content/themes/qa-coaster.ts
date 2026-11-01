/**
 * QA Thrill Test Park coaster kit (TASK-540, D-120; D-115 plan, study mar-plans/study/lunapark.html).
 * Look and size tables of the track builder, station, cars, riders, bumper cars, cotton-candy cart and
 * the TESTED board (geo/themes/qa-coaster.ts), the FIXTURE spline the gallery and the tests ride, and
 * the numbers TASK-541 reads. Defs: content/props-themes/qa-coaster.ts. TASK-539 owns the real spline
 * and publishes it in the same `{ points, closed }` format as `QA_COASTER_FIXTURE`.
 */

/** White / mint / yellow toy palette (same family as the Proving Grounds). */
export const COASTER_PAL = {
  white: '#FAFAF5',
  cream: '#F2EFE4',
  mint: '#7FD8B3',
  mintMid: '#3FBF8F',
  mintDeep: '#2E9E74',
  yellow: '#F5C84C',
  yellowDeep: '#D9A92E',
  steel: '#A9AEB8',
  steelDark: '#666C7A',
  rubber: '#4F4A5E',
  concrete: '#C9CCD2',
  red: '#E35D6A',
  pink: '#F4A6C0',
  sky: '#CDEBFF',
  ink: '#4F4A5E',
} as const;
const P = COASTER_PAL;

export const QA_COASTER = {
  /**
   * Track (all u). The spline is the RAIL-TOP centreline. Cross-section: two rails `gauge` apart
   * (centres), a ladder of mint ties, one white spine beam under the ties, columns to the ground.
   */
  track: {
    gauge: 0.9,
    railR: 0.045,
    tieEvery: 1.1,
    tieLen: 1.5,
    tieW: 0.17,
    tieH: 0.07,
    spineDrop: 0.3,
    spineR: 0.11,
    /** Adaptive rail / spine stations: advance until the tangent has turned `maxTurn` rad or `maxStep` u. */
    maxStep: 2.0,
    minStep: 0.35,
    maxTurn: 0.2,
    /** Chain lift: a dark chain between the rails, links of `link` u alternating two greys. */
    chain: { link: 0.4, r: 0.05, drop: 0.07 },
    /** Columns: a bent every `supportEvery` u of arc, none where the rail is closer than `minClear` to the ground. */
    supportEvery: 5.5,
    minClear: 0.45,
    sink: 0.25,
    /** A-frame (two raked legs) above this clearance; one column below it. */
    aFrame: 4.5,
    colR0: 0.1,
    colRk: 0.011,
    colRmax: 0.24,
    saddle: { w: 1.5, h: 0.1, d: 0.3 },
    foot: { w: 0.55, h: 0.14 },
    /** Where the rail is steeper than this (|tangent.y|) and not inverted the column stands outside it. */
    steepY: 0.75,
    invertedUp: 0.3,
    /** LOD1: rails + spine only, coarse. */
    lod1: { maxStep: 4, maxTurn: 0.4, supportEvery: 11 },
    rail: P.white,
    spine: P.white,
    spineLoop: P.yellow,
    tie: '#B5E9D1',
    column: P.white,
    saddleCol: P.mint,
    foot0: P.concrete,
    chainA: P.steelDark,
    chainB: P.steel,
  },
  /** Cars (mover meshes). Origin on the rail top at the car's centre, front +z, up +y, left +x. */
  car: {
    length: 2.1,
    width: 1.2,
    wheelR: 0.15,
    wheelBase: 1.3,
    /** Seat centres (car-local): two abreast, hip height above the rail top. */
    seatX: 0.27,
    seatY: 0.96,
    seatZ: -0.12,
    /** A train is `cars` cars `pitch` apart (centre to centre). */
    cars: 3,
    pitch: 2.9,
    mint: P.mint,
    yellow: P.yellow,
    trim: P.white,
    seat: P.mintDeep,
    footprint: 1.2,
  },
  /** Riders sit at a car seat: origin on the seat surface (hips), facing +z. */
  rider: { height: 1.1, footprint: 0.3 },
  /** Bumper cars (mover meshes): origin on the floor, front +z. */
  bumper: { r: 0.62, h: 0.78, footprint: 0.75 },
  /** Station: a boarding platform beside the track, canopy over it. Origin on the ground. */
  station: {
    length: 11,
    depth: 3.4,
    /** Local z of the track centreline, rail-top height above the pivot. */
    trackZ: 0,
    railY: 1.1,
    deckY: 0.78,
    deckZ0: 0.7,
    postH: 3.1,
    roofRise: 0.7,
    footprint: 5.6,
  },
  board: { w: 2.6, h: 2.5 },
  cart: { footprint: 1.0 },
} as const;

/** Control-point format TASK-539 publishes: site-local `[x, y, z]`, y absolute. */
export interface CoasterSplineData {
  points: ReadonlyArray<readonly [number, number, number]>;
  closed: boolean;
  /** Control point index ranges (inclusive) of the station platform and of the chain lift(s). */
  stationPoints: readonly [number, number];
  chainPoints: ReadonlyArray<readonly [number, number]>;
}

const R_LOOP = 3.6;
const LOOP_SHIFT = 3.0;
const smooth = (x: number): number => x * x * (3 - 2 * x);

function fixture(): CoasterSplineData {
  const pts: Array<readonly [number, number, number]> = [];
  const add = (x: number, y: number, z: number): number => pts.push([x, y, z]) - 1;
  // station straight (z = 0, flat), then the chain lift up to the crest
  const st0 = add(-8, 1.1, 0);
  add(-3, 1.1, 0);
  add(2, 1.1, 0);
  const st1 = add(6, 1.25, 0);
  const lift0 = st1;
  add(10, 2.1, 0);
  add(14, 4.2, 0);
  add(18, 6.9, 0);
  add(22, 9.7, 0);
  const lift1 = add(26, 12, 0);
  // crest and the drop into the loop
  add(30, 12.7, 0);
  add(33, 11.5, 0);
  add(35.5, 8.5, 0);
  add(37.5, 4.7, 0);
  add(39.2, 2.2, 0);
  // vertical loop, sideways shift so the way out passes beside the way in
  const x0 = 42;
  const y0 = 1.5;
  for (let k = 0; k <= 12; k++) {
    const th = (k / 12) * Math.PI * 2;
    add(x0 + R_LOOP * Math.sin(th), y0 + R_LOOP * (1 - Math.cos(th)), LOOP_SHIFT * smooth(k / 12));
  }
  // camelback: two airtime hills
  add(46, 1.6, LOOP_SHIFT);
  add(50, 5.0, LOOP_SHIFT);
  add(54, 1.8, LOOP_SHIFT);
  add(58, 4.0, LOOP_SHIFT);
  add(62, 1.7, LOOP_SHIFT);
  // east U-turn
  const r2 = 7.5;
  for (let k = 1; k <= 5; k++) {
    const th = (k / 6) * Math.PI;
    add(62 + r2 * Math.sin(th), 1.7 + 0.1 * k, LOOP_SHIFT + r2 * (1 - Math.cos(th)));
  }
  // return leg with a bunny hill, heading -x on z = 3 + 15
  const zr = LOOP_SHIFT + 2 * r2;
  add(62, 2.4, zr);
  add(54, 2.6, zr);
  add(46, 3.6, zr);
  add(38, 2.2, zr);
  add(30, 2.8, zr);
  add(20, 3.2, zr);
  add(10, 2.3, zr);
  add(1, 2.2, zr);
  add(-8, 2.2, zr);
  // west U-turn back to the start of the station straight
  const r3 = zr / 2;
  for (let k = 1; k <= 5; k++) {
    const th = (k / 6) * Math.PI;
    add(-8 - r3 * Math.sin(th), 2.2 - (1.1 * k) / 6, r3 + r3 * Math.cos(th));
  }
  return {
    points: pts,
    closed: true,
    stationPoints: [st0, st1],
    chainPoints: [[lift0, lift1]],
  };
}

/** The gallery / test spline: station, chain lift, camelback and one loop. Same format as TASK-539's. */
export const QA_COASTER_FIXTURE: CoasterSplineData = fixture();

/** The loop's centre column x and entry z (for the tests); the fixture's loop sits at x0 = 42. */
export const QA_COASTER_FIXTURE_LOOP = { x: 42, radius: R_LOOP, shift: LOOP_SHIFT } as const;

/** Triangle budget of the fixture track: LOD0 per metre / total, LOD1 fraction (pinned by tests). */
export const QA_COASTER_BUDGET = { perMetre: 40, lod1Fraction: 0.3 } as const;
