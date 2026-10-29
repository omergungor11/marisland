/**
 * Research M28 kit on the TASK-524 anchors (TASK-526, D-107): placement numbers of the Star Stair
 * (path + lanterns), the meridian sundial and the rim telescope decks
 * (world/gen/plans/research-m28.ts), and the deck gazers' motion (render/culture-movers.ts).
 * Lengths in u, angles in degrees, times in s.
 */

export const RESEARCH_M28_SITE = {
  stair: {
    /**
     * The stair path's points: the anchor polyline resampled every ≈ `step` u (one flight per
     * point pair, STAIR_FLIGHT.run = 2), plus the link from the foot to the network.
     */
    step: 2,
    /**
     * Foot link: the nearest footpath point within `reach` u whose straight line to the foot
     * keeps `shore` u off the coast and off the path-blocking grid (sampled every `sample` u),
     * else a grid route to the nearest footpath cell within `reach` (grade ≤ `maxSlope`).
     * The top joins the nearest footpath point within `topReach` (the observatory door walk).
     */
    link: {
      reach: 24,
      shore: 1,
      sample: 0.5,
      topReach: 7,
      maxSlope: 0.9,
      /** Small pieces that give way when the route has to cross them (seed 1001: the quad rim). */
      yieldTo: ['lanternPost', 'bench', 'teaTrolley', 'bookCart', 'pennantLine'] as const,
      yieldCost: 6,
    },
    /**
     * Lanterns (lanternPost v3) on the `starLamp` stations, standing on the flight's tread edge
     * `side` u off the centre line (STAIR_FLIGHT research width 1.5: inside the rail), pivot y = the
     * flight's tread line (the crag beside the carved line falls away or rises, so its ground is
     * not the steps'), on the side farther from the other legs; a side keeps `legGap` u off every
     * other leg's centre line and `linkGap` off the links; else the station slides along its own
     * leg by `slide` (u, in order) until a side is free, or is skipped.
     */
    lamp: {
      variant: 3,
      side: 0.62,
      legGap: 0.95,
      linkGap: 0.6,
      slide: [0, -0.6, 0.6, -1.2, 1.2, -1.8, 1.8, -2.4, 2.4] as const,
    },
    /**
     * Groove paint: lawn cells within `core` u of the line that the carve moved by > `depth` u, or
     * steeper than `steep` (under a switchback), become rock (the crag's cliff zone).
     */
    groove: { core: 2, depth: 0.15, steep: 0.6 },
    /**
     * The crag's foot round the top landing (within `reach` u): a lawn cell with a 4-neighbour
     * ≥ `drop` u higher becomes rock (its colour blended up the whole riser face as a green
     * streak above the meridian pad and the quad).
     */
    cragFoot: { reach: 16, drop: 3 },
  },
  sundial: {
    /**
     * Heading (deg, 0 = +x, 90 = +z) of the gnomon shadow at 12:00 = −xz of env
     * `sampleEnv(12).sunDir` (−0.0405, 0.9980, 0.0485): the dial's local +z (blade high end, XII,
     * noon line) points here. A test re-derives it from the sim sun (±0.5).
     */
    noonShadowDeg: -50.16,
    /** Footprint (u): the def's (the dial disc). */
    footprint: 3.0,
  },
  deck: {
    variant: 2,
    /** Footprint radius (u) of the deck (3 × 2 u) for life's solids; the def's is the tripod's. */
    footprint: 1.8,
  },
} as const;

/**
 * Deck gazer (render/culture-movers.ts): one bot on every rim deck's `bot` hook (pose 'gaze'),
 * leaning into the eyepiece; every `period` s (± `jitter`, phase hashed per deck) it straightens
 * and looks up at the sky for `up` s (eased over `ease` s each way), then back to the scope. Body
 * tint = the theme accent, lightened like the stall keepers.
 */
export const RESEARCH_M28_MOTION = {
  gazer: {
    period: 8,
    jitter: 0.12,
    up: 2.6,
    ease: 0.45,
    /** Body pitch (rad): leaning into the eyepiece, and looking up (negative = back). */
    lean: 0.22,
    look: -0.38,
    /** Small idle bob (u) and its period. */
    bob: 0.015,
    bobPeriod: 2.4,
    /** Bot scale: its eye (0.8 u at scale 1) at the eyepiece, ≈ 1 u over the deck boards. */
    scale: 1.25,
    /** Arm pitch (rad, negative = forward / up): hands at the scope, and down while looking up. */
    armsScope: -1.05,
    armsUp: -0.25,
    /** Head turn (rad) while looking up, slowly swept. */
    sweep: 0.25,
  },
} as const;
