/**
 * The archipelago's one big sea animal (M23 TASK-489, `W:D6`, D-064): a grey whale. A world mover,
 * not an agent. Data only: render/whale.ts (the view), life/whale-pose.ts (the pose timeline),
 * world/gen/whale-route.ts (loop + schedule) and geo/whale.ts (the mesh) read these numbers.
 */
export const WHALE = {
  /** Nose to fluke tips, u (the body ring table in geo/whale.ts is built for this length). */
  length: 14,
  /** Day clock this whale lives on (the culture clock), game hour of the cape pass. */
  capeHour: 17.75,

  /**
   * Route: a closed loop round the archipelago through open sea (`openSeaAt`), found per angle as
   * the outermost obstacle + `pad`, smoothed, then checked every `step` u (pushed out until clear).
   * The whale does one lap per game day, so the pose at any day second is a closed-form function.
   */
  route: {
    angles: 120,
    /** Radius step of the outward scan, u. */
    scan: 4,
    /** Gap kept to the outermost shelf / reef / route at an angle, u. */
    pad: 6,
    /** Max radius the loop may be pushed out to (the world edge is 384). */
    maxR: 372,
    /** Box-filter half width (angle samples) smoothing the radius. */
    smooth: 3,
    /** The cape pass aims this far past the headland anchor, straight out from the island centre, u. */
    capeOffset: 60,
    /** Validation spacing along the polyline, u. */
    step: 4,
    /** Open-sea query overrides while planning (clearance from reefs / boat routes, depth). */
    open: { minDepth: 8, reefClear: 8, routeClear: 20 },
    /** Output polyline resolution (points), Catmull-Rom through the smoothed radii. */
    points: 144,
  },

  /**
   * Schedule: `count` surfacings per day, the first at `capeHour` (the Research cape pass), the
   * gaps seeded in 120 ± `gapJitter` s (90–150 s, summing to the day).
   */
  schedule: { count: 5, gap: 120, gapJitter: 30 },

  /**
   * Surfacing timeline in event seconds `u` (0 = the back starts to rise). The whale is drawn from
   * `u = 0` to `end`; `depth` is the centre height at the start of the rise.
   */
  event: {
    depth: -7.5,
    /** Back rises over `rise`, resting with its top `back` u above the sea. */
    rise: 6,
    back: 1.75,
    /** Blows (event s) and how long each plume lasts. */
    blows: [5.2, 10.4] as const,
    blowSeconds: [3.2, 2.2] as const,
    /** Tail slap (event s of the lift start), see `slap`. */
    slapAt: 15,
    /** Dive: the fluke stands up, the body pitches nose-down and slides under. */
    dive: { from: 18.2, pitch: 64, seconds: 5.2 },
    /** Centre height at the end of the dive (the parabola's floor), and the event end (s). */
    floor: -11,
    end: 26.5,
    /** Forward glide while up, u/s (the loop is followed from the event's lap position). */
    glide: 1.7,
  },

  /** Tail slap curve (seconds since the lift starts): anticipation, lift, whip down, spring back. */
  slap: {
    dip: { deg: -5, seconds: 0.3 },
    lift: { deg: 58, seconds: 0.75 },
    whip: { deg: -14, seconds: 0.24 },
    settle: { omega: 14, zeta: 0.42, seconds: 1.5 },
    /** Total length (s) of the slap incl. the splash. */
    total: 2.6,
  },

  /** Idle swim: tail undulation (deg), body roll (deg), bob (u) and their periods (s). */
  swim: { tailDeg: 7, period: 3.6, rollDeg: 2.4, rollPeriod: 5.2, bob: 0.09, flipperDeg: 12 },

  /** Spout / splash puffs (puff program, placed slots; `edge` = alpha edge of the placed puffs). */
  spout: {
    puffs: 30,
    life: 1.9,
    /** Plume height (u) and base / top diameter. */
    height: 8,
    size: [1.5, 3.4] as const,
    opacity: 0.75,
    spread: 0.45,
    edge: 0.8,
    fadeIn: 0.08,
    /** Blowhole position on the back: along the axis (a, +x forward) and above the surface. */
    blowhole: { a: 3.4, lift: 0.1 },
  },
  splash: {
    puffs: 14,
    life: 1.5,
    radius: [0.8, 4.2] as const,
    height: 2.8,
    size: [0.9, 2.6] as const,
    opacity: 0.9,
    edge: 0.7,
  },

  /** Near-camera dither fade (camera to body centre): hidden inside `far`, whole beyond `near`. */
  fade: { near: 44, far: 20 },

  /** Pick proxy for the click (spheres along the body axis), u. */
  pick: { radius: 2.7, samples: 5 },

  colors: {
    back: '#8CA4C2',
    flank: '#A9BDD6',
    belly: '#F2EFE6',
    groove: '#E6E6DE',
    fin: '#7890AC',
    fluke: '#7C93B0',
    flukeUnder: '#B9C4CF',
    mouth: '#566A82',
    eye: '#232834',
    eyeLight: '#FFFFFF',
    blush: '#F2B5B0',
    mottle: '#9DB3CE',
  },
} as const;
