/**
 * HQ harbour town layout (M52 TASK-661, D-170; on HQ since TASK-666, D-171; an open crescent quay
 * on Hearthholm's own bay since TASK-674, D-173): the numbers of the quay town the plan
 * (world/gen/plans/hq-horseshoe.ts) lays along the bay round the HQ ferry pier. The pieces and
 * their sizes come from MARINA_KIT (hq-horseshoe.ts); this file only says where.
 * Lengths in u, angles in degrees.
 *
 * Shape: the bay's own waterline, traced from the bay centre (`anchors.harbour`) and smoothed, is
 * the quay's water edge from horn to horn. Inland of it a paved deck at `ring.deckY` over the sea:
 * a promenade `ring.promenade` u wide everywhere, the full `ring.width` where the house row stands.
 * A stone face drops to a berth strip dredged `berth.width` u out; the rest of the bay stays as it
 * is and open to the sea. A short stub jetty at each end of the quay carries the harbour light
 * (index-0 end) and the round tower (the other end).
 */

export const MARINA_SITE = {
  /**
   * Bay trace: rays from the bay centre every `angleStep`, `rayStep` apart, out to `rMax`, the first
   * sample with shore SDF > `edge` is the waterline. The bay is the run of hits round the back
   * (opposite the mouth heading) while neighbouring hits differ by ≤ `jump`; it is resampled every
   * 1 u and smoothed (`smooth` passes of a 1-2-1 filter), then trimmed at each end while the water
   * side turns more than `maxOff` away from the bay centre (the horn tips). Shorter than `minArc` =
   * no bay. Station tangents span ± `tangentSpan` u.
   */
  bay: {
    angleStep: 1.5,
    rayStep: 0.5,
    rMin: 4,
    rMax: 64,
    edge: 0,
    jump: 6,
    smooth: 10,
    maxOff: 80,
    minArc: 50,
    tangentSpan: 3,
  },
  ring: {
    /** Quay width, water edge → the house backs: promenade + the deepest house + `house.backInset`. */
    width: 8.8,
    /** The promenade strip on the water side (terraces on its edge, the walk behind them). */
    promenade: 3.4,
    deckY: 1.35,
    /** Level deck past the land edge (the 2 u grid's bilinear ground stays flat under house backs). */
    edgeFlat: 1.6,
    /** (ground art, content/ground-art.ts: the coping / face fade toward the quay's ends.) */
    taper: 6,
    /**
     * The deck runs `innerFlat` u past the water edge (the 2 u grid's face then lies just beyond it,
     * so the edge furniture stands level); the stone face falls from there to the berth floor over
     * `face` u (a sub-cell waterline).
     */
    innerFlat: 1,
    face: 2,
    /** Fill behind / under a raised deck reaches the old ground `flank` u out (stub armour too). */
    flank: 2.5,
    /** Cut behind the deck: the old ground is reached `bank` u past the deck's land edge. */
    bank: 2.5,
    /** A deck end beside a gap (the pier root) ramps down to the old ground over `ramp` u. */
    ramp: 3,
  },
  /** Berth strip in front of the quay, dredged to `depth` (cut only), blended out over `fall`. */
  berth: { width: 9, depth: 1.8, fall: 4 },
  /**
   * Fit, per 1 u station of the water edge: the promenade needs the old ground within `maxCut` over
   * the deck and above −`maxFill`; the house strip within `houseCut` over it (the backs cut into a
   * hill that little, never a terrace). The pier root's own quay (the Harbour Guild's crane,
   * crates, awning and timetable, HQ_CULTURE_SITE) keeps `rootGap` u round the root: the deck's gap.
   * Where the old ground is too high the station's water edge
   * may be built out over the shallows, `outMax` u at most, the least that fits (the promenade's
   * where no house stands); the build-out is widened `outWiden` stations each way and smoothed
   * (`outSmooth` passes), and the built-out edge smoothed again (`edgeSmooth` passes) so it stays
   * fair. A house stretch shorter than `minRow` u is none. No deck within `pierGap` u of the ferry pier, `headGap` of
   * its T crossbar, the ferry approach grown by `approachPad`, the pier's leave-the-shore line
   * (DOCK.awayRate, + `awayPad`), `reserveGap` of a reserved site, `clearOther` of another body;
   * the ground within `groundGap` u of a pad's core (a gate's, a kiosk's) is left to the pad and no
   * house stands on it.
   * Inside the quay a run of unfit stations up to `bridge` u long is a gap in the deck (the pier's
   * is always one); a longer one ends the quay (the longest stretch is kept). Tiers by houses:
   * ≥ `fullHouses` full, ≥ `shortHouses` shortened, else none (HQ keeps its plain pier and the M29
   * comb marina, world/gen/marina.ts).
   */
  fit: {
    maxCut: 2.6,
    maxFill: 3,
    houseCut: 4,
    outMax: 6.5,
    outWiden: 6,
    outSmooth: 20,
    edgeSmooth: 24,
    minRow: 4,
    pierGap: 4,
    rootGap: 9,
    headGap: 4,
    approachPad: 1,
    awayPad: 2.5,
    reserveGap: 1,
    groundGap: 1.5,
    clearOther: 18,
    bridge: 10,
    fullHouses: 16,
    shortHouses: 8,
  },
  /**
   * Houses: one row on the land side of the quay, backs `backInset` u inside the quay width, fronts
   * to the water, `gap` u between neighbours at the front, an `alley` u gap after every
   * `alleyEvery` houses (a lane up toward the plaza where it stays on land), at most `max`
   * (trimmed from both ends of the row), none within `endKeep` u of the quay's ends. Variants follow
   * `cycle` along the row (no two neighbours equal); `restaurant` variants get a terrace
   * (house variant → terrace index).
   */
  house: {
    backInset: 0.2,
    gap: 0.3,
    alley: 3.2,
    alleyEvery: 7,
    max: 18,
    endKeep: 3,
    maxRelief: 0.25,
    cycle: [0, 4, 1, 5, 3, 2] as const,
    restaurant: { 0: 0, 1: 1, 3: 2 } as Readonly<Record<number, number>>,
  },
  /** Terraces on the quay edge: front `edge` u back from the water edge. */
  terrace: { edge: 0.2 },
  /** Stalls in front of non-restaurant houses (middle of the row first), `count`, variants in order. */
  stall: { count: 3, edge: 0.5, variants: [0, 1, 2] as const },
  /**
   * Moored boats stern-to along the quay: sterns `faceGap` u off the water edge, `gap` u between
   * hulls, variants in `cycle` order, at most `max`, none within `endKeep` u of a deck end.
   */
  yacht: { faceGap: 2.2, gap: 0.9, cycle: [0, 1, 3, 2, 1, 0, 3] as const, max: 14, endKeep: 3 },
  /**
   * Finger pontoons: `runs` of `segs` chained segments straight out from the water edge at `at`
   * (fractions of the quay's length; the nearest deck station that fits), a boat alongside each
   * side (`side` u off the pontoon edge), variants `boats`.
   */
  pontoon: {
    runs: 2,
    segs: 1,
    at: [0.42, 0.62] as const,
    side: 0.3,
    boats: [2, 3] as const,
  },
  /**
   * Stub jetties at the quay's two ends, along the end tangent out over the water: `len` u (then
   * the shorter `lens` when the long one does not fit), `half` u half width, deck height.
   */
  stub: { lens: [7, 5, 3.5] as const, half: 2.4 },
  /** The tower stands on its stub's centre line, `back` u in from the stub's head. */
  tower: { back: 2.4 },
  /** Edge furniture (the Carnival kit's defs): lanterns at house joints, a bollard per stern line. */
  lantern: { defId: 'lanternPost', variant: 0, inset: 0.45, every: 2 },
  bollard: { defId: 'barrel', variant: 2, inset: 0.35 },
  /** `marinaQuay` anchors every ≈ `quayStep` u of the quay's centre line. */
  quayStep: 2,
  /** The quay walk: `walk` u in from the water edge (between the terraces and the house fronts). */
  walk: 2.9,
  /**
   * Boat-route keep-out: discs every 2 `marinaQuay` points over the berth strip (r = `berth.width`
   * / 2 + `pad`) and round each stub head.
   */
  keepOut: { pad: 1.5, hard: 0.65 },
} as const;
