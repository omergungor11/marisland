/**
 * QA "Thrill Test Park" site (M32 TASK-539, D-115 / D-119; study mar-plans/study/lunapark.html): the
 * numbers of world/gen/plans/qa-park.ts. A closed coaster track (station, chain lift, turn, drop,
 * loop, camelback, return turn) round a bumper-car rink, in one reserved rect beside the Proving
 * Grounds. Lengths in u, heights over the station's ground, angles in degrees.
 *
 * Template frame = the prop frame of the rect (`rectShape(x, z, rotY, w, d)`): local +z along the
 * rect's depth (world `dirOf(rotY)`), local +x its width (world (sin rotY, −cos rotY)). The track
 * runs +z along the station lane (−x side) and comes back −z along the far lane (+x side).
 */
import * as dm from '../../core/math/dmath.ts';

const DEG = Math.PI / 180;

/** A template control point: [local x, height over the station's ground, local z]. */
export type CoasterTemplatePoint = readonly [number, number, number];

/** Rail height (u over the ground) of the station's level run and the loop's foot. */
const DECK = 0.9;

/**
 * The vertical loop on the far lane: `n` points round a teardrop (radius `r`, top stretched by
 * `tear`), running −z along the lane at the foot, its lanes `shift` u apart across so the two rails
 * pass beside each other at the foot.
 */
export const COASTER_LOOP = { x: 3.7, shift: 1.6, z: 1.2, r: 2.75, tear: 0.35, foot: DECK, n: 8 };

function loopPoints(): CoasterTemplatePoint[] {
  const L = COASTER_LOOP;
  const out: CoasterTemplatePoint[] = [];
  for (let k = 0; k <= L.n; k++) {
    const a = (k / L.n) * 360 * DEG;
    const up = (1 - dm.cos(a)) / 2;
    out.push([
      L.x + (L.shift * k) / L.n,
      L.foot + (2 * L.r + 2 * L.tear) * up,
      L.z - L.r * dm.sin(a),
    ]);
  }
  return out;
}

/**
 * The track in travel order, part by part (a closed loop: the last point runs into the first).
 * Centripetal Catmull-Rom through these. The station's points are collinear and level, so the
 * spline is exactly level between the second and the second-last of them.
 */
export const COASTER_TEMPLATE = {
  station: [
    [-4.5, DECK, -10.5],
    [-4.5, DECK, -8.5],
    [-4.5, DECK, -6.5],
    [-4.5, DECK, -4.5],
    [-4.5, DECK, -2.5],
    [-4.5, DECK, -0.8],
  ],
  lift: [
    [-4.5, 1.15, 0.8],
    [-4.5, 2.2, 2.6],
    [-4.5, 3.4, 4.6],
    [-4.5, 4.6, 6.6],
    [-4.5, 5.8, 8.6],
    [-4.45, 6.9, 10.4],
  ],
  turn: [
    [-3.8, 7.6, 12],
    [-2.2, 7.9, 13.2],
    [0, 7.9, 13.7],
    [2.2, 7.7, 13.2],
    [3.4, 7, 11.9],
  ],
  drop: [
    [3.7, 5.5, 10.2],
    [3.7, 3.4, 8.4],
    [3.7, 1.6, 6.2],
    [3.7, 0.95, 3.6],
  ],
  loop: loopPoints(),
  camel: [
    [5.3, 1.1, -1.4],
    [5.3, 2.6, -3.4],
    [5.3, 4.3, -5.2],
    [5.3, 4.75, -6.6],
    [5.3, 4, -8.1],
    [5.1, 2.3, -9.9],
  ],
  back: [
    [4.5, 1.2, -11.6],
    [3.1, DECK, -13],
    [0.9, DECK, -13.8],
    [-1.4, DECK, -13.6],
    [-3.3, DECK, -12.5],
  ],
} as const satisfies Record<string, readonly CoasterTemplatePoint[]>;

/** Track parts in travel order. */
export const COASTER_PARTS = ['station', 'lift', 'turn', 'drop', 'loop', 'camel', 'back'] as const;
export type CoasterPart = (typeof COASTER_PARTS)[number];

export const QA_PARK = {
  /**
   * Reserved footprint [w, d] at scale 1: a stadium round z = 0 (end discs of radius w / 2, the
   * U-turns), the track + its supports + a walkers' margin.
   */
  rect: [13.4, 28.6] as const,
  /**
   * Site tiers, tried in order: the template's uniform scale and the shore distance the stadium's
   * edge keeps (the rim walk and the palm row start ≈ 8–10 u in: 3 = over the lip, the rim walk gives way
   * and the supports reach down the wall).
   */
  tiers: [
    { scale: 1, rim: 9 },
    { scale: 0.9, rim: 9 },
    { scale: 0.8, rim: 9 },
    { scale: 1, rim: 7 },
    { scale: 0.9, rim: 7 },
    { scale: 0.8, rim: 7 },
    { scale: 0.9, rim: 5 },
    { scale: 0.8, rim: 5 },
    { scale: 0.8, rim: 3 },
  ] as const,
  /** Candidates per tier: the best frame in each of `sectors` bearings round the yard. */
  sectors: 8,
  /** Trials with the two test tracks (plans/qa.ts `placeProvingAndPark`), then no park. */
  trials: 24,
  /** A site is first choice when the stunt yard keeps this much free ground round it (the kit's)… */
  kitPad: 2,
  /** … looked for over this many trials once any site leaves the yard at all. */
  kitTrials: 8,
  /** With a site, the loop track's and the stunt yard's scores add these × the distance to it. */
  provingNear: 0.06,
  stuntNear: 0.8,
  /** Candidate centres: land samples within `search` of the yard. */
  search: 62,
  /** Headings tried per candidate centre (every `stepDeg`). */
  stepDeg: 15,
  minCentreShore: 7,
  minShore: 3,
  /** Relief under a level pad before levelling (the ground between pads may fall away). */
  maxRelief: 2,
  /** Gap off every other obstacle and lane. */
  gap: 1,
  /** Score = `near` × the centre's shore distance (the outer strip) + … */
  near: 0.1,
  /** … `entrySide` × the entry's distance from the yard + `reliefCost` × pad relief. */
  entrySide: 0.02,
  reliefCost: 0.5,
  /** Level pads in the template frame, [x, z, w, d] (scaled with the site); margin past each. */
  pads: {
    /** One level under the station and the rink. */
    deck: [-1.75, -5.25, 9.7, 9.5] as const,
    loop: [4.5, 2.2, 4.8, 6] as const,
  },
  padMargin: 0.6,
  /** The station platform: centre (x, z) beside the station lane, [w, d] (the level run). */
  station: { x: -5.6, z: -5.5, w: 1.8, d: 6 },
  /** Bumper-car rink floor: centre (x, z), [w, d]. In the infield, inside the rink pad. */
  rink: { x: 0, z: -5.2, w: 6, d: 7.5 },
  /**
   * The apron outside the rect's station side: `w` wide, `d` long, centred at local `z` (scaled),
   * relief ≤ `maxRelief`, `gap` off the other obstacles and lanes. The footpath ends `entry` u past
   * the rect's edge at `z`; the board and the candy cart stand at the same offset at their z.
   */
  apron: { w: 3, d: 10, z: -5.5, entry: 1.5, boardZ: -9, candyZ: -2, maxRelief: 2, gap: 0.8 },
  /** Fit on the final ground: rails at least this far over the ground (u). */
  clearance: { track: 0.6, loop: 0.7 },
  /** Fit passes, and how far a raise spreads along the control points (each step × `spread`). */
  fit: { passes: 6, spread: 0.5, reach: 2, sample: 0.5 },
  /** The lift's crest stays this far (× scale) over the loop's crown (gravity carries the train). */
  head: 0.5,
  /** The kit's variants of old defs (TASK-541; geo/themes/qa-coaster.ts COASTER_VARIANTS): TESTED board, candy cart. */
  kit: { board: 2, candy: 1, maxRelief: 0.8 },
  /** Zones on the final ground (D-109): within the rect + `reach`, soft cells above `steep` → cliff. */
  zones: { reach: 5, steep: 0.9, flat: 0.45 },
} as const;
