/**
 * Marketing "Horseshoe Harbour" layout (M52 TASK-661, D-170): the numbers of the marina town the
 * plan (world/gen/plans/marketing-marina.ts) grows round the Carnival Pier's flank. The pieces and
 * their sizes come from MARINA_KIT (marketing-marina.ts); this file only says where they go.
 * Lengths in u, angles in degrees.
 *
 * Shape: a round basin of radius `ring.basinR` wrapped by a stone quay ring `ring.width` u wide
 * (one deck height, `ring.deckY` over the sea) that runs from the light mole's head round the back
 * (the Rock's foot) to the tower mole's head; the two heads leave a `ring.mouth` u wide mouth to the
 * open sea. The light mole is the one on the ferry pier's side.
 */

export const MARINA_SITE = {
  ring: {
    /** Basin radius per fit tier (full first): 28 / 26 u across. */
    basinR: [14, 13] as const,
    /** Quay ring width: house 4.5 + promenade 3.3 (terrace on the edge, a lane behind) + back inset. */
    width: 8,
    deckY: 1.35,
    /**
     * Level deck beyond the ring's nominal outer edge (the 2 u grid's bilinear ground stays flat
     * under the house backs), tapered to 0 over `taper` u of arc toward each mole head.
     */
    edgeFlat: 1.8,
    taper: 6,
    /**
     * The deck also runs `innerFlat` u inside the basin edge (the grid's quay face then lies just
     * past it, so the edge furniture stands on level ground); boats keep `yacht.faceGap` off.
     */
    innerFlat: 1,
    /** The quay face falls from the deck to the basin floor over `face` u (sub-cell waterline). */
    face: 2,
    /** Mole flank: the seabed is reached `flank` u out from the deck's edge (rock armour above sea). */
    flank: 2.5,
    /** Gap between the two mole heads (u, deck edge to deck edge). */
    mouth: 7.5,
    /** Fallback tier: the tower mole ends `short` u of arc sooner (wider mouth). */
    short: 7,
  },
  /** Basin dredged to `depth` (cut only); the mouth water blends to the sea bed over `mouthFall`. */
  basin: { depth: 1.8, mouthFall: 6 },
  /**
   * Fit search in the pier frame (u out along the pier, v across toward the marina side; both
   * sides tried): basin centre on a `step` grid over u ∈ `u`, v ∈ basinR + `v`; mouth heading
   * `mouthDeg` from the pier heading toward +v. Rejected when a ring cell must be cut more than
   * `maxCut` u or filled from deeper than `maxFill`; when it touches another body, a reserved site
   * (`reserveGap`), or lies within `pierGap` u of the pier, `headGap` of the T crossbar, or the
   * ferry approach grown by `approachPad`; when basin cells hold land over `basinLand`; when the
   * mouth's axis does not run out over open water (`mouthLen` u, deeper than `mouthDepth`) or less
   * than `backAttach` of the back arc's outer edge touches the island (sdf ≥ −`attachSdf`).
   * Score: fill + `cutW` × cut (u per cell) + `distW` × centre → pier root − `attachW` × attach.
   */
  fit: {
    step: 2,
    u: [4, 28] as const,
    v: [2, 34] as const,
    mouthDeg: [-30, -10, 10, 30, 50, 70] as const,
    maxCut: 3.6,
    maxFill: 30,
    reserveGap: 1,
    pierGap: 4,
    headGap: 4,
    approachPad: 2.5,
    basinLand: 1.2,
    mouthLen: 14,
    mouthDepth: 1,
    backAttach: 0.3,
    attachSdf: 6,
    cutW: 2,
    distW: 3,
    attachW: 400,
    /** Other islands / islets stay at least this far off the ring. */
    clearOther: 18,
    /** Ring land stays this much past the pier's DOCK.awayRate line (the 2 u grid's slack). */
    awayPad: 1.5,
  },
  /**
   * Houses: rows on the ring's outer part, backs `backInset` u inside the nominal outer edge, fronts
   * to the basin centre, `gap` u between neighbours at the front, an `alley` u gap where a lane
   * runs up (`alleys` in the main row, one at each mole root). The back arc (`backDeg` either side
   * of its middle) holds the main row (≤ `mainMax`), each mole ≤ `moleMax`, the last `headKeep` u of
   * arc before each head stay free (the light, the tower). Variants follow `cycle` round the ring
   * (no two neighbours equal); `restaurant` variants get a terrace (house variant → terrace index).
   */
  house: {
    backInset: 0.2,
    gap: 0.3,
    alley: 3.2,
    alleys: 2,
    backDeg: 68,
    /** The main row may run `mainDeg` either side of the back arc's middle (≥ backDeg). */
    mainDeg: 76,
    mainMax: 8,
    moleMax: 5,
    headKeep: 4.5,
    maxRelief: 0.25,
    cycle: [0, 4, 1, 5, 3, 2] as const,
    restaurant: { 0: 0, 1: 1, 3: 2 } as Readonly<Record<number, number>>,
  },
  /** Terraces on the quay edge: front `edge` u back from the basin edge. */
  terrace: { edge: 0.2 },
  /** Stalls in front of non-restaurant houses (main row first), `count`, variants in order. */
  stall: { count: 3, edge: 0.5, variants: [0, 1, 2] as const },
  /**
   * Moored boats stern-to round the basin edge: sterns `faceGap` u off the deck's edge (the grid's
   * quay face), `gap` u between hulls at the bow, variants in `cycle` order, at most `max`, none
   * within `headKeep` u of arc of a mole head.
   */
  yacht: { faceGap: 2.2, gap: 0.7, cycle: [0, 1, 3, 2, 1, 0, 3] as const, max: 14, headKeep: 7 },
  /**
   * Finger pontoons: `runs` of `segs` chained segments from the basin edge toward its centre at
   * `atDeg` from the back arc's middle; a boat alongside each side (`side` u off the pontoon edge),
   * variants `boats`.
   */
  pontoon: {
    runs: 2,
    segs: 1,
    atDeg: [-18, 18] as const,
    side: 0.3,
    boats: [2, 3] as const,
  },
  /** The tower stands on the tower mole's centre line, `back` u of arc in from its head's cap centre. */
  tower: { back: 2.5 },
  /** Edge furniture (the Carnival kit's defs): lanterns at house joints, a bollard per stern line. */
  lantern: { defId: 'lanternPost', variant: 0, inset: 0.45, every: 2 },
  bollard: { defId: 'barrel', variant: 2, inset: 0.35 },
  /** `marinaQuay` anchors every ≈ `quayStep` u of the ring's centre line. */
  quayStep: 2,
  /** Boat-route keep-out round the ring (r = width / 2 + edgeFlat + `pad`) and the basin. */
  keepOut: { pad: 2, hard: 0.65 },
} as const;
