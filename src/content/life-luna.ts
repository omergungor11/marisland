/**
 * Sea-top fun park life (M53 TASK-672, D-172): how the Marketing "Deniz Üstü Lunapark" moves. Two
 * halves. `LUNA_MOTION`: the rides' closed-form clocks (life/luna-motion.ts, render/luna-movers.ts),
 * each with its own period so the park never moves in unison; every ride's phase is a hash of the
 * world seed (a fraction of its cycle). `LUNA_LIFE`: the visitors, Workers tableau slots like the
 * marina town (life/luna-world.ts; counts, shifts, strolls). Numbers only; anchors:
 * world/gen/plans/marketing-luna.ts, kit: content/themes/marketing-luna.ts. Lengths in u, times in
 * s, speeds in u/s, turns in rev/s, hours in game hours.
 */
import type { Shift } from './life-marina.ts';

/** Reduced motion (`uMotionScale` 0.3) scales speeds and amplitudes by `1 - (1 - scale) * calm`. */
export const LUNA_MOTION = {
  /**
   * Chain swing: a cycle of idle / spin-up / full speed / spin-down. The rotor's turn rate runs
   * `rest` → `run` (rev/s) with smoothstep ramps; `fly` widens the rotor's xz by that share at full
   * speed (the chairs fly out; the canopy widens with them, a small cost of one rigid mesh).
   */
  swing: { cycle: 42, rest: 0.025, run: 0.3, up: 7, hold: 15, down: 9, fly: 0.07 },
  /**
   * Drop tower: climbs slowly (sine ease), hangs at the top with a tiny shiver and an anticipation
   * lift, drops (gravity ease-in), lands with a soft decaying bounce, rests, repeats.
   */
  drop: {
    cycle: 19,
    climb: 8.5,
    hold: 2.2,
    fall: 1.0,
    /** Anticipation: the gondola rises this far (u) over the last `lead` s of the hold. */
    anticipate: 0.14,
    lead: 0.45,
    shiver: { amp: 0.025, hz: 7 },
    /** Landing bounce: peak height (u), decay rate (1/s), bounces per second. */
    bounce: { h: 0.5, decay: 3.4, hz: 1.7 },
  },
  /** Carousel: a steady slow turn with a slow gust (the speed varies by `gust`, period `gustT`). */
  carousel: { rev: 0.075, gust: 0.12, gustT: 23 },
  /** The park wheel keeps the land fair's period (MEDIA_MOVERS) and arrival boost; only its phase is its own. */
  wheel: { phase: 0.37 },
  /**
   * Mini coaster: the worm train rides the loop; speed falls with height (`slow` on the hilltops,
   * `fast` in the valley), tabulated per lap (`table` samples) so the time on the track is closed form.
   */
  train: { slow: 1.25, fast: 3.3, table: 384 },
  /**
   * Bumper boats: each roams its own Lissajous orbit of the pool (`period` s per axis, jittered by
   * `jitter`), is pushed apart from the others (`iters` relaxation passes, boat radius `r`) and keeps
   * `margin` u off the pool edge; bob / roll are small and out of phase. The heading follows the
   * velocity (central difference over `look` s).
   */
  boat: {
    r: 1.15,
    margin: 0.35,
    period: [19, 31] as const,
    jitter: 0.15,
    iters: 8,
    look: 0.25,
    bob: { amp: 0.035, period: 3.1 },
    roll: { amp: 0.05, period: 3.9 },
    /** Share of the pool half-extent the orbit spans before the clamp. */
    reach: 0.92,
  },
  /** Distance (u) the movers stay drawn from the camera. */
  far: 150,
} as const;

/** Visitors per ambient scale (≥ the first column's scale picks the last matching row). */
export interface LunaCounts {
  scale: number;
  strollers: number;
  browsers: number;
  gate: number;
}

export const LUNA_LIFE = {
  /** The park wakes while the camera focus is within `wake` u of the deck centre (3-D), sleeps beyond `sleep`. */
  wake: 55,
  sleep: 70,
  /** Pool slots the park leaves to the campus. */
  reserve: 4,
  /** Never past the worker pool of a quality (low 8, medium 16, high 30) minus `reserve`. */
  counts: [
    { scale: 0, strollers: 2, browsers: 1, gate: 1 },
    { scale: 0.75, strollers: 4, browsers: 3, gate: 1 },
    { scale: 1, strollers: 6, browsers: 5, gate: 1 },
  ] as readonly LunaCounts[],
  /**
   * Strollers walk the `lunaStroll` loop one way or the other at `speed` (eased at both ends of a
   * leg), pausing `pause` s at a stop every `stopEvery` u; jitters are shares.
   */
  stroll: {
    speed: 0.7,
    speedJitter: 0.15,
    pause: [3, 8] as const,
    pauseJitter: 0.3,
    stopEvery: 8,
    /** Look pauses turn this far (rad) from the walking direction toward the pool. */
    lookYaw: 0.5,
  },
  /** Browsers stand at a `lunaStall` spot and shift weight: `gaze` at the stand, now and then `peer`. */
  browser: { cycle: 12, gaze: 7, poses: ['gaze', 'peer'] as const },
  /** The gate greeter stands `inset` u inside the gate (park side) facing the pier and waves at arrivals. */
  gate: { inset: 2.2, beat: { cycle: 15, wave: [8.5, 11.5] as const, pose: 'wave' } },
  /** Hours on the 24 h circle, cycled by rank, edges jittered ±`jitter` h. The park empties after midnight. */
  jitter: 0.35,
  shifts: {
    stroller: [
      [10, 24.5],
      [11, 23],
      [12, 25],
      [10.5, 22.5],
      [13, 24],
      [11.5, 25.5],
    ] as readonly Shift[],
    browser: [
      [10.5, 24],
      [12, 23.5],
      [11, 22],
      [14, 25],
      [12.5, 23],
    ] as readonly Shift[],
    gate: [[10, 24.5]] as readonly Shift[],
  },
} as const;

/** The row of `counts` for an ambient scale. */
export function lunaCounts(scale: number): LunaCounts {
  let row = LUNA_LIFE.counts[0];
  for (const r of LUNA_LIFE.counts) if (scale >= r.scale) row = r;
  return row;
}
