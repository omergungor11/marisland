/**
 * Research "Tide-Lab" harbour (M31 TASK-532, D-113; study `mar-plans/study/harbours.html`,
 * marketing-research §2.3 R5 / R6 / R19): the Research instance on the shared harbour skeleton
 * (content/harbours.ts). world/gen/plans/research-harbour.ts reads it. Distances in u. Pier-frame
 * offsets are [u along the pier, v across it]; v < 0 = the side away from the breakwater arm.
 * No prop is placed here: TASK-534 puts the TASK-533 kit on the anchors.
 */
export const RESEARCH_HARBOUR = {
  /**
   * Stilt marine lab (R5) at the end of a second pier on the open side (away from the arm): a
   * `size` [w across the pier, d along it] footprint, its centre searched in `u` × `v` (step
   * `step`; |v| ≥ 9 keeps the levelled seabed off the ferry pier's dredged channel) nearest `pref`, `gap` u of water all round (off the coast and the T-head), clear of
   * the ferry approach by `approachGap`; the seabed under it (+ `gap`) is levelled into `depth`
   * [min, max] u (blended over `fall` u outside); the lab pier runs from its shore-side edge back
   * to the coast (≥ `pierMin` u over water, `pierWidth` wide). Boat routes keep `keepOut` u past
   * its half diagonal.
   */
  lab: {
    size: [6, 5] as const,
    pref: [8.5, -9.5] as const,
    u: [5, 12] as const,
    v: [-15, -9] as const,
    step: 0.5,
    gap: 1,
    approachGap: 1.5,
    headGap: 2,
    depth: [1.1, 1.8] as const,
    fall: 1.5,
    pierMin: 2,
    pierWidth: 1.6,
    keepOut: 4,
  },
  /**
   * Research vessel slot in the basin (alongside the pier on the arm side): its centre `back` u
   * short of the T crossbar, `S.vessel.side` u off the pier axis (falls back to the old pier spots
   * when the hull does not float there). The yellow submersible (R6) moors beside it, further into
   * the basin: `gap` u between the hulls, `halfBeam` / `halfLength` its own hull, `minDepth` under
   * it. Its dive point (`dive`) lies over ≥ `minDepth` u of water `out` [min, max] u seaward of the
   * arm's crest line beside the sunken city, `shore` u off any land, `berthGap` u off the ferry
   * berth and off the approach; boat routes keep `keepOut` u off it.
   */
  vessel: { back: 0.8 },
  sub: { gap: 0.5, halfBeam: 0.7, halfLength: 1.6, minDepth: 1 },
  dive: { out: [5, 16] as const, minDepth: 3.2, ring: 2, shore: 4, berthGap: 12, keepOut: 7 },
  /**
   * Tide gauge (R19) on the cove beach on the open side: a waterline point (shore SDF in `shore`
   * [min, max]) at pier-frame v in `v` (preferred `pref`), `gap` u off every site; disc `r`.
   */
  gauge: { v: [-9, -2.5] as const, pref: -4.5, shore: [0.2, 1.4] as const, gap: 0.8, r: 0.8 },
  /**
   * Half-sunken city (the user's idea, D-112) in the lagoon the arm encloses (Zone.lagoon on the
   * final shore distance: water alpha 0.55; deeper water would not read from above). Curvilinear
   * street plan along the arm: columns every `pitch` u of the arm's arc from `from` u past the tip
   * to `endInset` u short of its bend, rows `rowPitch` u apart across the lagoon (centre row = the
   * main street), each lattice point ≥ `armGap` u off the arm land and `coastGap` u off the coast,
   * `siteGap` u off the basin / lab / pier sites. Kinds: the main street and every `crossEvery`-th
   * column (counted from the plaza column, the middle one of those with water) are paving; the
   * plaza = the plaza column ± `plaza` columns, all rows; an arch where a cross street meets the
   * main street; every other lattice point a column; `tops` [min, max] of the column / arch points
   * become broken tower / arch tops above the water (`topsApart` u apart, picked on
   * `rng.fork('harbour').fork('city')`). Seabed: within
   * `cellR` u of a slot levelled to `street` (paving / arch) or `block` (column / top) u under the
   * water line, blended to the old seabed over `blend` u, never shallower than `minDepth`.
   * At least `minSlots` slots or no city. Boat routes / seamarks keep `keepOut` u off every slot.
   */
  city: {
    from: 5,
    endInset: 1.5,
    pitch: 2,
    rowPitch: 1.8,
    armGap: 0.8,
    coastGap: 1.2,
    siteGap: 1.5,
    crossEvery: 4,
    plaza: 0,
    tops: [2, 4] as const,
    topsApart: 3.5,
    cellR: 1.4,
    street: 1.25,
    block: 0.85,
    blend: 2,
    minDepth: 0.6,
    minSlots: 12,
    keepOut: 4,
  },
} as const;
