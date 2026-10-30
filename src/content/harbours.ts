/**
 * Ferry harbour skeleton (M31 TASK-532, D-112 / D-113; study `mar-plans/study/harbours.html`):
 * the numbers of the shared harbour every ferry island grows out of its lee cove dock —
 * a T-head ferry pier (the island's dock, lengthened; its head is the ferry berth), a breakwater
 * arm that follows the coast `arm.offset` u out to sea and closes on the coast at its root, the
 * sheltered basin between the pier and the arm, and the pier-root kiosk sites (waiting shelter,
 * ticket booth, timetable board) plus the harbour light on the arm's tip.
 * world/gen/plans/harbour.ts reads it; the per-island instances (Research's Tide-Lab, later
 * Marketing / Design) add their own sites on top. Distances in u, angles in degrees.
 *
 * Frame: `u` = the pier heading (out to sea), `v` = across it toward the arm (the side the
 * planner picks per seed: `sigma`). Pier-root offsets below are [u, v] in that frame; a
 * negative v lies on the far side from the arm.
 */
export interface HarbourParams {
  /**
   * T-head ferry pier = the island's dock run out to `segments` (DOCK.segment u each; at least
   * `minSegments`, every new segment over water, `sideClear` u clear both sides, moving away from
   * the shore at DOCK.awayRate). `head` = the T crossbar at the pier end ({w across, d along}).
   */
  pier: {
    segments: number;
    minSegments: number;
    sideClear: number;
    head: { w: number; d: number };
  };
  /**
   * The ferry berth: `out` u past the pier end along the heading (= DOCK.basinOffset, the point the
   * boat-route stop aims at, so the HQ ferries dwell there). `approach` = the corridor the ferry
   * comes in by: `len` u on from the berth, `half` u either side; harbour sites keep off it.
   */
  berth: { out: number; approach: { len: number; half: number } };
  /**
   * Breakwater arm: the shore-distance contour `offset` u out (pre-arm shore SDF), walked from the
   * pier axis toward the arm side in `step` u steps; the arm itself runs from arc `tipArc` (the
   * tip, the harbour light) for `length` u (at least `minLength`, cut short where the contour has
   * turned `maxTurnDeg` or the seabed under it leaves `depth` [min, max] deep), then turns
   * straight back to the coast (the root). Crest: `crestY` u high on the centre line, dome
   * `crestDome` (fraction lower at the crest edge), half width `half` [tip, root]; the flank falls
   * back to the seabed over `flank` u. Only water samples are raised. `clearOther` u off any other
   * land body (islands, islets); the tip keeps `mouth` u off the T-head's arm-side end (the basin
   * mouth). Side pick: the feasible side whose arm seabed is nearest `idealDepth`.
   * Zones of the new land (painted on the final ground): below `rockY` wet sand (the flanks); above
   * it rock armour on the seaward side of the crest line (≥ `armour` u out) and over the first
   * `rockTip` u from the tip (the mole head under the light), dry sand on the sheltered side, so
   * from afar the arm reads as a sand spit of the island with a rock face to the sea.
   */
  arm: {
    offset: number;
    step: number;
    tipArc: number;
    length: number;
    minLength: number;
    maxTurnDeg: number;
    depth: readonly [number, number];
    idealDepth: number;
    crestY: number;
    crestDome: number;
    half: readonly [number, number];
    flank: number;
    clearOther: number;
    mouth: number;
    rockY: number;
    armour: number;
    rockTip: number;
  };
  /**
   * Sheltered basin between the pier and the arm: from `from` u along the pier to the pier end,
   * `pierGap` u off the pier axis to `armGap` u short of the arm's crest edge; dredged to `depth`
   * (cut only; `fall` u blend) so the moored boats float.
   */
  basin: { from: number; pierGap: number; armGap: number; depth: number; fall: number };
  /**
   * Pier-root kiosk sites on the cove land: preferred [u, v] (v < 0 = away from the arm), rect
   * footprint `size` [w, d] facing the pier axis / the sea; searched `search` u round the
   * preferred spot (step `stepU`), `minShore` u off the coast, relief ≤ `maxRelief`, `laneGap`
   * u off the pier → campus avenue, `gap` u off every obstacle. Reserved blocking.
   */
  kiosks: {
    search: number;
    step: number;
    minShore: number;
    maxRelief: number;
    laneGap: number;
    gap: number;
    shelter: { at: readonly [number, number]; size: readonly [number, number] };
    booth: { at: readonly [number, number]; size: readonly [number, number] };
    board: { at: readonly [number, number]; size: readonly [number, number] };
  };
  /** The harbour light stands `inset` u back from the arm's tip on its crest centre line. */
  light: { inset: number };
  /**
   * Boat routes keep off the pier (`pier` u round points every 2 u of it) and the T crossbar
   * (`head` u round its two ends) and the basin mouth; the berth past the head stays reachable.
   * The smoothed routes keep `hard` × the radius off these discs (and off the island instance's
   * own sites: the Tide-Lab lab, city and dive point).
   */
  keepOut: { pier: number; head: number; hard: number };
}

/** Per-theme harbours (D-112: Research pilot; Marketing / Design reuse the skeleton later). */
export const HARBOURS: Partial<Record<'research' | 'marketing' | 'design', HarbourParams>> = {
  research: {
    pier: { segments: 6, minSegments: 4, sideClear: 1.6, head: { w: 8, d: 2.4 } },
    berth: { out: 3, approach: { len: 18, half: 5 } },
    arm: {
      offset: 10,
      step: 1,
      tipArc: 13,
      length: 26,
      minLength: 16,
      maxTurnDeg: 110,
      depth: [0.4, 3.2],
      idealDepth: 1.3,
      crestY: 1.35,
      crestDome: 0.3,
      half: [1.2, 1.5],
      flank: 2,
      clearOther: 18,
      mouth: 5,
      rockY: 0.7,
      armour: 0.2,
      rockTip: 6,
    },
    basin: { from: 1.5, pierGap: 1.2, armGap: 1.4, depth: 1.8, fall: 1.5 },
    kiosks: {
      search: 6,
      step: 0.5,
      minShore: 0.8,
      maxRelief: 1,
      laneGap: 1.6,
      gap: 0.6,
      shelter: { at: [-3.2, -4], size: [3.2, 2.2] },
      booth: { at: [-2.6, 3.4], size: [1.6, 1.6] },
      board: { at: [-1.6, -1.9], size: [1.2, 0.5] },
    },
    light: { inset: 0.6 },
    keepOut: { pier: 2.5, head: 3, hard: 0.6 },
  },
};
