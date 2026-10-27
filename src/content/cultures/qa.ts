/**
 * Müfettişler Adası (Inspectors' Island). Kit ledger (TASK-414; new defs, ≤ 10; ≥ 70 % tier ≥ 2,
 * ≤ 1 tier-1, no tier-0), ORDERED BY PRIORITY: most identity-defining first, so if the budget gate
 * lowers the cap the tail is cut. Variants of existing defs (testHangar v1 hallOfChecks, terrarium
 * v2 bugZoo, sailboat v3 inspection boat) are not ledger entries. Story spots, rhythm and relay are
 * filled by waves 2–3. Placement (TASK-424): `QA_CULTURE_SITES` below, read by
 * world/gen/plans/qa.ts.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { CultureDef } from './types.ts';

const { grounded, windy, noShadow } = PropFlag;

export const QA_CULTURE: CultureDef = {
  theme: 'qa',
  id: 'inspectors',
  name: 'Müfettişler Adası',
  nameEn: "Inspectors' Island",
  palette: {
    accent: '#3FBF8F',
    roofs: ['#7FD8B3', '#FAFAF5'],
    walls: ['#FAFAF5'],
    trims: ['#F5C84C', '#666C7A'],
  },
  pennant: { cut: 'chevron', accent: '#3FBF8F' },
  kit: [
    { id: 'dummyBench', tier: 2, flags: grounded },
    { id: 'inspectionBooth', tier: 2, flags: grounded },
    { id: 'uvLampPost', tier: 2, flags: grounded },
    { id: 'scoreboard', tier: 2, flags: grounded },
    { id: 'bugJar', tier: 3, flags: grounded | noShadow },
    { id: 'conePyramid', tier: 3, flags: grounded | noShadow },
    { id: 'flagMast', tier: 2, flags: grounded | windy },
    { id: 'stampDesk', tier: 3, flags: grounded | noShadow },
    { id: 'clipboardWall', tier: 3, flags: grounded | noShadow },
    // M24 TASK-499 Proving Grounds (D-062 R3-14: cap 12, tier-1 = the drop tower)
    { id: 'dropTower', tier: 1, flags: grounded },
    { id: 'testFan', tier: 2, flags: grounded | windy },
    { id: 'obstacle', tier: 2, flags: grounded },
  ],
  // emitted by world/gen/plans/qa.ts (TASK-424); `defs` = the props the scene stands on
  storySpots: [
    { kind: 'dummyCoffee', defs: ['dummyBench'] },
    { kind: 'gullOnCones', defs: ['conePyramid'] },
    { kind: 'antTrail', defs: ['terrarium', 'bugJar'] },
    { kind: 'scoreboardDrop', defs: ['scoreboard', 'bugJar'] },
    { kind: 'sleepyStamp', defs: ['stampDesk'] },
    { kind: 'crabInspection', defs: ['trafficCone'] },
    { kind: 'greenLight', defs: ['flagMast'] },
    { kind: 'uvBugHunt', defs: ['uvLampPost'] },
  ],
  rhythm: [],
  relay: { order: 3, id: 'greenLightCeremony' },
};

/**
 * Inspectors' Island placement (TASK-424, world/gen/plans/qa.ts). Lengths in u. Local frames are
 * the prop's own: +z = its facing (fixture rotY), +x = (sin rotY, −cos rotY) (the geometry's +x).
 */
export const QA_CULTURE_SITES = {
  /** Small kit props: keep this far from other obstacles, max relief over the disc, pad margin. */
  gap: 0.3,
  maxRelief: 0.8,
  padMargin: 0.4,
  /** Obstacle rect (local x, z) of the flat defs; the others block their FIXTURE_RADIUS disc. */
  rect: { clipboardWall: [2.8, 0.45], scoreboard: [2.7, 0.5], hammock: [4.4, 1.3] },
  /** Footpath pins (lot doors, landmark access, pier root) stay this clear. */
  pinClear: 1.4,
  /** Pads more than this apart in height are another level (keep out of their relax bound). */
  stepTol: 1.2,
  /** The first hangar (furthest round from the harbour) is the Hall of Checks: testHangar v1. */
  hallVariant: 1,
  hall: {
    /**
     * Stamp desk right of the door, the clipboard wall left of it (hall local x, z past the front);
     * mirrored when a conveyor bridge leaves on that side.
     */
    desk: [2.6, 1.15] as const,
    /**
     * Clipboard wall candidates (x mirrored with the desk): against the wall, a step out, or past
     * the hangar corner on the desk's side.
     */
    boards: [
      [-3.0, 0.45],
      [-3.0, 1.4],
      [5.1, 0.45],
      // M24 TASK-499: the Proving Grounds ground shifts the lots; further spots along the wall
      [-4.1, 0.45],
      [-4.1, 1.4],
      [-3.0, 2.3],
      [5.1, 1.4],
    ] as const,
  },
  /** Inspection booth beside a barrier gate: on the cone side first, (side, along) offsets. */
  booth: {
    max: 2,
    size: 2.8,
    side: [3.4, 4.1] as const,
    along: [0, 1.6, -1.6, 3.2, -3.2] as const,
    /** The slab gets a wider level pad: tolerate a gate on the plateau's soft rim. */
    maxRelief: 1.1,
    pad: 1.2,
  },
  /** Flag mast at the QA tower foot: ring radius past the tower's, angle samples. */
  mast: { ring: 1.6, samples: 16 },
  /**
   * Scoreboards: v0 ("BUGS: 0") on the yard rim facing the yard, across from the hall; v1
   * ("BUGS: 1", the escaped ladybug) beside the loop track facing it, with a bug jar.
   */
  scoreboard: { yardRing: 1.7, samples: 36, trackSide: 1.4, jar: [2.0, 0.5] as const },
  /** Dummy benches round the yard rim (between hangars and lanes; else just inside it), facing it. */
  benches: { count: [1, 2] as const, rings: [1.3, -2.4] as const, minApartDeg: 50 },
  /** UV lamp posts beside the loop track: (local x past the side, z) per lamp, count range. */
  uvLamps: {
    count: [2, 4] as const,
    side: 0.9,
    at: [3.6, -3.6] as const,
  },
  /** Cone pyramid past one end of the loop track (local z past the end). */
  cones: { end: 1.4 },
  /**
   * Bug jars by the test labs: candidates (lot local x as a fraction of the half width + offset,
   * z as a fraction of the half depth + offset): front corners, then under the side windows.
   */
  jars: {
    labs: 3,
    at: [
      [1, -0.7, 1, 0.45],
      [-1, 0.7, 1, 0.45],
      [1, 0.5, 0, 0],
      [-1, -0.5, 0, 0],
    ] as const,
  },
  /** Bug Zoo (terrarium v2) near a lab: ring around the lab, door gap for its footpath pin. */
  zoo: {
    variant: 2,
    ring: [7, 11] as const,
    samples: 12,
    minShore: 3,
    maxRelief: 1.4,
    doorGap: 1.4,
    pad: 1.5,
    /** Its bug jar and the ant trail story: (zoo local x, z). */
    jar: [2.0, 3.0] as const,
    ants: [-2.2, 3.4] as const,
  },
  /** The crab's inspection: a cone on the cove beach near the pier root (height band, search). */
  crab: { y: [0.5, 1.3] as const, search: 14, minFromRoot: 3, minShore: 0.3, maxRelief: 1.2 },
  /** Story spot heights above the ground (gull on the pyramid tip). */
  gullY: 2.4,
  /**
   * Q15 grandstand (TASK-480): `dummyBench` variant 1 beside the loop track, front to it; candidate
   * (local x past the track side, z) in the track frame, obstacle rect [w, d].
   */
  grandstand: {
    variant: 1,
    rect: [4.6, 1.9] as const,
    side: [1.3, 2.6] as const,
    at: [0, 2.5, -2.5, 4.5, -4.5] as const,
    maxRelief: 1,
  },
  /**
   * Q18 hammocks on the rim (TASK-480; Coding's `hammock` def, teal variant): this far inland of the
   * walk centreline, walk samples every `step` u, at most `count`, at least `apart` u apart.
   */
  hammocks: { count: 2, variant: 1, back: 3.1, step: 2, apart: 26, maxRelief: 0.6 },
  /**
   * Q10 buoy slalom (TASK-480): `count` inspection buoys `spacing` u apart on the inspection boat's
   * ring (radius + CULTURE_BOATS.patrol.margin), on a stretch at least `depth` u deep (± `pad`
   * samples of the stretch too), as far round from the pier as the stretch allows. `scale`: the
   * slalom buoys' instance size (TASK-485: they read too small in every frame with the plateau).
   */
  slalom: { count: 8, spacing: 6.5, depth: 2.5, pad: 2, angles: 180, scale: 1.5 },
} as const;
