/**
 * Research Tide-Lab kit on the TASK-532 anchors (TASK-534, D-118): placement numbers
 * (world/gen/plans/research-harbour-kit.ts) and the harbour's motion (render/tide-lab-motion.ts,
 * render/culture-movers.ts, render/tide-sub.ts). Lengths in u, times in s of the culture clock day
 * (1 game hour = CULTURE_CLOCK.secondsPerHour s), colours #rrggbb.
 */

export const RESEARCH_HARBOUR_SITE = {
  lab: {
    /**
     * The lab pier: `dock` pieces scaled so their planks stand level with the lab deck (0.7 u ×
     * `pierScale` ≈ deck y 1.0) with their posts still in the water; pieces overlap to fit the
     * length, every other one `seam` u higher (no coplanar planks).
     */
    pierScale: 1.43,
    pierVariant: 0,
    seam: 0.012,
  },
  gauge: { variant: 0 },
  /**
   * Ruin pieces (`sunkenCity` variants, content/themes/research-m31.ts order) per slot kind, picked
   * on `rng.fork('harbour').fork('ruins')`. Repeats weigh a variant. `paving` lies on the bed;
   * `arch` and `top` stand at seaY - waterline, so they break the surface; a `column` is sunk so
   * its top lands in `columnTop[variant]` [min, max] (world y): whole columns stay under the
   * turquoise water (their square capital at the surface read as a floating board), broken stubs
   * may just break it (the kit's sea height would make every column a 1.8 u post).
   */
  ruins: {
    paving: [4, 4, 4, 4, 5, 7] as const,
    arch: [2, 3] as const,
    column: [0, 1, 1] as const,
    top: [6, 6, 3] as const,
    columnTop: { 0: [-0.42, -0.2], 1: [-0.35, 0.12] } as const,
  },
  /**
   * The submersible's way mooring → round the arm tip → dive point: a route over the water grid
   * (every cell ≥ `minDepth` deep, ≥ `shore` u off land, ≥ `clear` u off the pier, T-head, vessel,
   * lab and ruin slots; ×`nearCost` within `near` u of land or the ferry berth so it keeps to the
   * middle of the channel), string-pulled, its corners cut `chaikin` times, published as
   * `subPath0..K` every ≈ `step` u (anchor rotY = heading along it). The hull leaves its slot along
   * the pier heading for `leave` u first. `checkDepth` / `checkShore`: what the smoothed line must
   * still satisfy, else the un-smoothed one is published.
   */
  subPath: {
    minDepth: 0.9,
    shore: 1,
    clear: 1,
    near: 3,
    nearCost: 2,
    leave: 2.5,
    chaikin: 2,
    step: 2,
    sample: 0.5,
    reach: 40,
    checkDepth: 0.75,
    checkShore: 0.5,
  },
} as const;

/** Motion. Closed form in the culture-clock day seconds (the sub) or the sim time (the rest). */
export const RESEARCH_HARBOUR_MOTION = {
  /**
   * The submersible (a geo-only mover, `tideSub`): cruises the path out at `speed` to arrive for
   * the dive at `diveHour`, sinks over `sink` s, lies on the bottom, rises from `surfaceHour` over
   * `sink` s (pivoting back toward home meanwhile), cruises home and pivots at the mooring over
   * `dockTurn` s (leaving, it swings onto the path over its first `swing` u). `keel` u above the bed
   * when down, where it is hidden.
   */
  sub: {
    diveHour: 9,
    surfaceHour: 16,
    speed: 1.9,
    sink: 7,
    dockTurn: 8,
    swing: 2.5,
    keel: 0.25,
    pitch: 0.2,
    bob: 0.035,
    bobPeriod: 3.4,
    roll: 0.025,
    range: 170,
    fadeNear: 140,
    fadeFar: 170,
  },
  /** Fish schools round the ruins: one ring of `n` fish on each of up to `schools` ruin tops. */
  fish: {
    schools: 3,
    n: 12,
    /** Ring radius (u, ± `wander` over `wanderPeriod` s) and seconds per lap (± `jitter`). */
    r: 2.6,
    wander: 0.7,
    wanderPeriod: 13,
    lapS: 13,
    jitter: 0.15,
    /** School spread along the ring (rad), across it (u) and swimming depth (world y, ± `sway`). */
    spreadRad: 1.15,
    across: 0.7,
    y: -0.4,
    sway: 0.08,
    size: 0.62,
    colors: ['#FF6A2A', '#FFB400', '#FF4F6E'] as const,
    range: 90,
  },
  /** The tide tank's fish (hook `tank`): small ones circling inside the glass. */
  tankFish: { n: 4, lapS: 9, size: 0.5, colors: ['#FF9E5E', '#FFE27A'] as const },
  /**
   * Bubbles while the sub is down: a plume at the dive point and, thinner, at each ruin top
   * (`topShare` of `n`), each ball rising from `depth` to the surface over `lifeS`, a ring popping
   * where it breaks. They are visible only near the surface at the dive point (water alpha 0.97),
   * so the surface ring and the domes carry it there.
   */
  bubbles: {
    n: 7,
    topN: 3,
    lifeS: 2.8,
    depth: 1.1,
    spread: 0.55,
    wobble: 0.08,
    size: [0.05, 0.11] as const,
    color: '#EAFBFF',
    ring: { r: 0.42, life: 0.9, tube: 0.5, color: '#F2FFFF' },
    /** The sink itself boils harder over its first seconds. */
    burstS: 9,
    burstScale: 1.7,
    range: 110,
  },
  /**
   * Ferry arrival ritual (`harbourArrival`, life/ferry.ts: the ferry that stands at this berth):
   * the deck-rail lamps come on in turn round the lab and the tank's open top glows, a keeper pops
   * out on the sea side of the deck and waves at the boat, the harbour light double-flashes, a
   * ripple runs off the berth. `rise` / `fall` s of the envelope, `linger` s past the ferry's leaving.
   */
  arrival: {
    rise: 0.7,
    fall: 1.6,
    linger: 3,
    /** Lab glow lamps (lab frame, on the deck rail and the roof; `delay` s after the arrival). */
    lamps: [
      { at: [-3.1, 1.92, -2.2], r: 0.13, delay: 0.1, color: '#FFD98A' },
      { at: [0.0, 1.92, -2.2], r: 0.13, delay: 0.35, color: '#FFD98A' },
      { at: [3.1, 1.92, -2.2], r: 0.13, delay: 0.6, color: '#FFD98A' },
      { at: [3.1, 1.92, 2.2], r: 0.13, delay: 0.85, color: '#FFD98A' },
      { at: [-3.1, 1.92, 2.2], r: 0.13, delay: 1.1, color: '#FFD98A' },
      { at: [-1.25, 3.5, -0.35], r: 0.2, delay: 1.35, color: '#FFE9B0' },
    ] as const,
    /** The tank's open top: a flat glow on its water (lab frame, half sizes). */
    tankGlow: {
      at: [2.0, 2.3, -0.15] as const,
      size: [0.82, 0.07, 0.62] as const,
      delay: 0.5,
      color: '#9FF0EA',
    },
    /** Lab frame: the keeper's spot on the deck's sea side (facing −z) and its arm wave. */
    keeper: { at: [0.62, 1.0, -1.85] as const, scale: 1.1, waveHz: 1.3, tint: '#7FE0D8' },
    /** Harbour light flash: at lamp y, radius, seconds per pulse, pulses. */
    flash: { r: 0.72, period: 0.9, pulses: 2, color: '#FFF0C0' },
    ripple: {
      rings: 2,
      period: 2.2,
      r0: 1.2,
      r1: 4.2,
      tube: 0.3,
      color: '#F2FFFF',
      y: 0.06,
      lastS: 4.4,
    },
    range: 150,
  },
} as const;
