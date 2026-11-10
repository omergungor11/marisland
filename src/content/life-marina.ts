/**
 * Horseshoe Harbour life (M52 TASK-662, D-170): the people of the Marketing island's marina town.
 * They are Workers slots (the department bots, tableau mechanism of content/life.ts TABLEAU), not a
 * new kind: they take the pool of awake workers while the camera looks at the harbour, so the
 * agent count never grows. Anchors: world/gen/plans/marketing-marina.ts; chairs and tables:
 * content/themes/marketing-marina-look.ts. Lengths in u, hours in game hours, speeds in u/s.
 */

/** One working window of a bot, hours on the 24 h circle (`to` may pass midnight: 19.5 → 24.7). */
export type Shift = readonly [from: number, to: number];

export const MARINA_LIFE = {
  /**
   * The town wakes while the camera focus (orbit target) is within `wake` u of the basin (3-D) and
   * goes back to sleep beyond `sleep` (hysteresis); its bots then come first in the worker pool.
   */
  wake: 50,
  sleep: 65,
  /** Pool slots the town leaves to the campus (focus island) however busy the harbour is. */
  reserve: 4,
  /**
   * Bots by the quality's ambient scale (≥ the first column's scale picks the last matching row):
   * strollers on the quay, diners at the terraces, vendors beside the stalls. A row never exceeds
   * its quality's worker pool (low 8, medium 16, high 30), so the agent budget does not move.
   */
  counts: [
    { scale: 0, strollers: 3, diners: 4, vendors: 1 },
    { scale: 0.75, strollers: 5, diners: 9, vendors: 2 },
    { scale: 1, strollers: 8, diners: 12, vendors: 3 },
  ] as readonly { scale: number; strollers: number; diners: number; vendors: number }[],
  /**
   * Strollers: the promenade lane between the terrace chairs and the house awnings, `lane` u out
   * from the basin edge (basin radius + lane), the walk trimmed `endTrim` u at each mole head. They
   * go back and forth at `speed` (average, eased at both ends of a leg), pausing `pause` s at a
   * stop: a lookout over the water every `lookEvery` u, and at each stall. Per-stroller speed
   * jitter ±`speedJitter`, pause jitter ±`pauseJitter` (share).
   */
  stroll: {
    lane: 2.65,
    endTrim: 4,
    speed: 0.8,
    speedJitter: 0.15,
    pause: [5, 11] as const,
    pauseJitter: 0.3,
    lookEvery: 11,
    /** Stalls: stop this many u of lane either side of the stall's centre (not in its counter). */
    stallSide: 1.7,
    /** Look pauses face the water (the basin centre) ± this yaw (rad) per stroller. */
    lookYaw: 0.35,
  },
  /**
   * Diners sit in the terrace chairs facing their table: `hip` = the bot's body bottom above its
   * feet (u), so the feet pivot stands `chairH − hip` above the deck. A table's two chairs are a
   * pair (`chat` ↔ `eat`: the beats cycle, per-bot phase), a lone diner eats / gazes at the water.
   * `eatPose` = the rest pose with a small bow (POSES.huddle).
   */
  diner: {
    hip: 0.37,
    chairDist: 0.67,
    beat: { cycle: 14, chat: 6.5, eat: 11, eatPose: 'huddle', chatPose: 'chat', gazePose: 'gaze' },
  },
  /**
   * Vendors stand beside a stall (the `side` flank, `x` u off its centre, `z` u forward of the
   * pivot), facing the quay; they stand, then wave at the passers-by (`beat`).
   */
  vendor: {
    x: 1.45,
    z: 0.35,
    beat: { cycle: 16, wave: [9, 12] as const, wavePose: 'wave', turnYaw: 0.3 },
  },
  /**
   * Shifts (hours), cycled over the bots of a class by rank, each edge jittered ±`jitter` h (hash).
   * Quiet at night: the strollers thin out after the neon night starts (19:30), the dinner
   * crowd is gone by 22:00, a late table or two stays until after midnight.
   */
  jitter: 0.35,
  shifts: {
    stroller: [
      [9, 23],
      [9.5, 21.5],
      [10.5, 24.5],
      [9, 20.5],
      [11, 22],
      [9.5, 23.5],
      [12, 21],
      [10, 22.5],
    ] as readonly Shift[],
    diner: [
      [12, 22.3],
      [12, 15.5],
      [18.5, 21.5],
      [19.5, 24.7],
      [12.2, 15.2],
      [18.6, 21.6],
      [12, 16],
      [18.4, 21.8],
      [12.4, 22.6],
      [19, 24.3],
      [12.1, 15.4],
      [18.8, 21.7],
    ] as readonly Shift[],
    vendor: [
      [10, 19.5],
      [9.5, 19],
      [10.5, 20],
    ] as readonly Shift[],
  },
  /**
   * Gulls: they perch on the tower's crenellation (`towerTop` u above the tower pivot) and on the
   * quay's edge (every `edgeEvery`-th quay anchor pulled to `edge` u past the basin edge, `y` u
   * above the deck: the bollard row).
   */
  gull: { towerTop: 5.65, edgeEvery: 12, edge: 0.35, y: 0.55 },
} as const;

/** The row of `counts` for an ambient scale. */
export function marinaCounts(scale: number): (typeof MARINA_LIFE.counts)[number] {
  let row = MARINA_LIFE.counts[0];
  for (const r of MARINA_LIFE.counts) if (scale >= r.scale) row = r;
  return row;
}
