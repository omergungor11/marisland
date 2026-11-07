/**
 * QA Thrill Test Park coaster kit (TASK-540, D-120; D-115 plan, study mar-plans/study/lunapark.html).
 * Look and size tables of the track builder, station, cars, riders, bumper cars, cotton-candy cart and
 * the TESTED board (geo/themes/qa-coaster.ts), the FIXTURE spline the gallery and the tests ride, and
 * the numbers TASK-541 reads. Defs: content/props-themes/qa-coaster.ts. TASK-539 owns the real spline
 * and publishes it in the same `{ points, closed }` format as `QA_COASTER_FIXTURE`.
 */
import * as dm from '../../core/math/dmath.ts';

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
    maxTurn: 0.15,
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
    /** LOD1: rails + spine only, coarse, fatter so the white line holds at island distance. */
    lod1: { maxStep: 4, maxTurn: 0.4, supportEvery: 11, railR: 0.1, spineR: 0.2 },
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
    /**
     * A train is `cars` cars `pitch` apart (centre to centre). 3.2, not the fixture's 2.9: on the real
     * loop (kit-frame radius 2.75, the fixture's was 3.6) cars at 2.9 touch at the top, 3.2 clears them
     * by 0.18 u (world/coaster-kit.test.ts, D-122).
     */
    cars: 3,
    pitch: 3.2,
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
    /** Local z of the track centreline; rail-top height above the pivot (the site's DECK: pivot on the pad). */
    trackZ: 0,
    railY: 0.9,
    deckY: 0.58,
    deckZ0: 0.7,
    postH: 3.1,
    roofRise: 0.7,
    /** Solid / blob radius: small, the deck is a long thin rect and the footpath ends behind it. */
    footprint: 2.2,
    /** The ✓ lamp's mast height over the deck (clear of the roof) and its inset from the -x end / the deck's back. */
    lamp: { mast: 3.7, x: 0.55, z: 0.5, r: 0.2 },
  },
  board: { w: 2.6, h: 2.5, lamp: { y: 2.42, z: 0.02, r: 0.24 } },
  cart: { footprint: 1.0 },
  /** Bumper rink, part of the built site track (kit frame). Floor checker + a rubber curb + a light frame. */
  rink: {
    floorH: 0.12,
    tiles: [6, 8] as const,
    tileA: P.cream,
    tileB: '#CFEFE0',
    curb: { h: 0.3, w: 0.22, color: P.rubber, top: P.yellow },
    post: { h: 2.5, r: 0.07, color: P.white },
    beam: { h: 0.09, color: P.mint },
    bulbs: { perSide: 4, r: 0.075, color: P.yellow },
  },
} as const;

/**
 * The coaster's motion (TASK-541, D-122; render/coaster-motion.ts). Lengths in kit u (the kit is scaled
 * as a whole by the site's scale), seconds, on the culture clock's day seconds so a frozen capture lands
 * on the exact pose and the noon siren always finds the bots on the loop.
 */
export const QA_COASTER_MOTION = {
  speed: {
    /** Station roll-out: from `startV`, accelerating at `rollA`, up to the chain's speed. */
    startV: 0.5,
    rollA: 1.1,
    chainV: 1.7,
    /** Gravity run: v² = chainV² + 2 g (crest − y) − 2 friction × arc, on the middle car. */
    g: 7,
    friction: 0.1,
    /** Never slower than this past the crest (the loop's crown). */
    minV: 2.2,
    /** The brake run into the station: v² ≤ stopV² + 2 brakeA × (arc left). */
    brakeA: 5.5,
    stopV: 0.6,
  },
  /** Chain-lift ratchet: the train advances `link` u in `move` of the click, then holds (no audio: the eye hears it). */
  click: {
    link: 0.85,
    move: 0.55,
    ring: { life: 0.45, r0: 0.2, r1: 0.95, minY: 0.5, color: '#FF5C8A' },
  },
  /** Arrival nod (spring on the cars' pitch, rad). */
  nod: { amp: 0.14, omega: 10, zeta: 0.3 },
  /** Riders on the parked train: arms down, breathing (scale y) and a small seat bob (u), Hz, phase step per seat (rad). */
  idle: { hz: 0.45, breath: 0.035, bob: 0.025, phase: 1.3 },
  /** Seconds between runs: the dummy waits, then lamp on + bots board, then the bots get off. Longest first. */
  dwell: { dummy: 6, swap: 7, off: 4 },
  /** Boarding pop (s), stagger per seat (s). */
  pop: { out: 0.25, in: 0.4, stagger: 0.09 },
  /** The ✓ lamp: delay after the dummy's return, glow scale over the lens at rest / peak, flash decay, ring. */
  lamp: {
    delay: 0.7,
    r0: 1.1,
    r1: 2.2,
    tau: 0.7,
    color: '#7BF2BC',
    flash: { life: 0.9, r0: 0.3, r1: 2.2 },
    /**
     * During the noon siren the lamp blinks at this rate (Hz) and sends sound rings out round its mast.
     * TASK-555: flat rings along `dir` (up), widening past the roof (station depth 3.4) as they rise
     * `travel` (a small ring out of the +z face read as a hoop on the roof).
     */
    sirenHz: 2.2,
    sirenRing: {
      rings: 3,
      period: 1.8,
      r0: 0.4,
      r1: 3.1,
      travel: 1.1,
      dir: [0, 1, 0] as const,
      color: P.cream,
    },
  },
  /** At 12:00 + `noonLead` s the bot train's lead car enters the loop. */
  noonLead: 4,
  /** Bumper cars: kit frame; a stream round an ellipse in the rink, one car rams the next per `period`. */
  bumpers: {
    margin: 0.82,
    lapS: 19,
    period: 3.1,
    rush: 0.55,
    contact: 1.42,
    /** Struck car's jolt forward (fraction of the free gap), recoil spring, spin kick (rad). */
    jolt: 0.45,
    omega: 6,
    zeta: 0.42,
    spin: 0.55,
    /** Slow heading wander (rad, s) and squash on contact. */
    wander: 0.22,
    wanderS: 3.7,
    squash: 0.12,
    /** Driver: a capped bot, hips over the floor; scale. */
    rider: { y: 0.42, z: -0.06, scale: 0.8 },
    spark: { life: 0.45, r0: 0.1, r1: 0.9, ball: 0.22, color: '#FFE28A', y: 0.5 },
  },
  /**
   * By quality: bumper cars, cars, LOD0 movers within `lod0` u (0 = never), dither fade and range (u from
   * the site origin). Low stops at T2: hidden meshes count in the memory budget, so T1 views must not build them.
   */
  plan: {
    low: { bumpers: 3, lod0: 0, cars: 2, fadeNear: 90, fadeFar: 112, range: 118 },
    medium: { bumpers: 5, lod0: 62, cars: 3, fadeNear: 140, fadeFar: 175, range: 180 },
    high: { bumpers: 6, lod0: 90, cars: 3, fadeNear: 170, fadeFar: 215, range: 225 },
  },
  /** The culture scene's range (lamp glow, click ring, sparks). */
  sceneRange: 170,
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
    add(x0 + R_LOOP * dm.sin(th), y0 + R_LOOP * (1 - dm.cos(th)), LOOP_SHIFT * smooth(k / 12));
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
    add(62 + r2 * dm.sin(th), 1.7 + 0.1 * k, LOOP_SHIFT + r2 * (1 - dm.cos(th)));
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
    add(-8 - r3 * dm.sin(th), 2.2 - (1.1 * k) / 6, r3 + r3 * dm.cos(th));
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
