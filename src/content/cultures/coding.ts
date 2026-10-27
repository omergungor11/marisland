/**
 * Rüzgâr Bahçeleri (Wind Gardens). Kit ledger (TASK-411; M22 TASK-479 added the last two): 10 new defs,
 * 9/10 tier >= 2, one tier-1
 * (giantDuck), no tier-0, ORDERED BY PRIORITY (most identity-defining first; if the budget gate
 * drops the per-island cap to 6, cut from the end). Geometry: geo/themes/culture-coding.ts.
 * Not ledger entries (variants of existing defs): bracketHedge = hedge v2, windChimeTower =
 * windTurbine v3 (LOD1 identical to v0), pinwheel = kite v3, weather-vane pods = devPod v2 / v3. Story spots, rhythm and relay by waves 2-3.
 * Placement (TASK-421): `CODING_CULTURE_SITES` below, read by world/gen/plans/coding.ts.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { CultureDef } from './types.ts';

const { grounded, windy, noShadow } = PropFlag;

export const CODING_CULTURE: CultureDef = {
  theme: 'coding',
  id: 'windGardens',
  name: 'Rüzgâr Bahçeleri',
  nameEn: 'Wind Gardens',
  palette: {
    accent: '#5B9BE6',
    roofs: ['#5DA9E9', '#3FB8AF'],
    walls: ['#FAFAF5'],
    trims: ['#D2A679', '#FFE45C'],
  },
  pennant: { cut: 'kite', accent: '#5B9BE6' },
  kit: [
    { id: 'rubberDuck', tier: 3, flags: grounded | noShadow },
    { id: 'kite', tier: 2, flags: grounded | windy },
    { id: 'pergolaDesk', tier: 2, flags: grounded | windy },
    { id: 'hammock', tier: 2, flags: grounded | windy },
    { id: 'kiteRack', tier: 2, flags: grounded | windy },
    { id: 'giantDuck', tier: 1, flags: grounded },
    { id: 'whiteboardA', tier: 3, flags: grounded | noShadow },
    { id: 'mugStack', tier: 3, flags: grounded | noShadow },
    // M22 (TASK-479): the windsock avenue (C11) and the fairy-light bulbs on the quad-end trees (C13)
    { id: 'windsock', tier: 2, flags: grounded | windy },
    { id: 'fairyWreath', tier: 2, flags: windy | noShadow },
  ],
  // emitted by world/gen/plans/coding.ts (TASK-421); `defs` = the props the scene stands on
  storySpots: [
    { kind: 'warmRackCat', defs: ['serverShed'] },
    { kind: 'hammockNap', defs: ['hammock', 'mugStack'] },
    { kind: 'stuckKite', defs: ['kite', 'hedge'] },
    { kind: 'duckCrossing', defs: ['bikeRack', 'reflectingPoolEdge'] },
    { kind: 'bugDoodle', defs: ['whiteboardA', 'rubberDuck'] },
    { kind: 'gullOnDuck', defs: ['giantDuck'] },
    { kind: 'kiteDay', defs: ['kiteRack', 'kite'] },
  ],
  rhythm: [],
  relay: { order: 4, id: 'kiteDay' },
};

/**
 * Wind Gardens placement (TASK-421, world/gen/plans/coding.ts). Lengths in u; `u`/`v` are the Tech
 * Park frame (u along the lawn, v across it; lawn half extents CODING_PLAN.park.lawn).
 */
export const CODING_CULTURE_SITES = {
  /**
   * Obstacle footprint (local x, local z) of the rect defs; the others block their
   * FIXTURE_RADIUS disc (content/settlements.ts).
   */
  rect: { pergolaDesk: [3.6, 2.9], hammock: [4.4, 1.3], kiteRack: [3.9, 1.0] },
  lawn: {
    /** Pergola desks on each lawn strip between the paved spine and the edge hedges: u, |v|. */
    pergolaU: [-2.6, 2.6] as const,
    pergolaV: 4.55,
    /** One whiteboard per strip at the outer end (+u on the +v strip, −u on the −v one). */
    boardU: 5.35,
    /** Board variants per strip: 1 = the bug doodle (story), 2 = `</>` + tick. */
    boards: [1, 2] as const,
    /** Mug crate between the two desks of a strip (u). */
    mugU: 0,
    /** The board's rubber duck: this far in front of the board (toward the spine). */
    boardDuck: 0.95,
  },
  pool: {
    /** Rubber ducks afloat in the pool without the giant duck: count range, offsets (pool u, v). */
    ducks: [1, 2] as const,
    duckAt: [
      [-1.3, 0.45],
      [1.1, -0.5],
    ] as const,
  },
  hammock: {
    /** Nap fallback between the two quad-end trees far from the hub: v between them. */
    treeV: 2.3,
    /** The nap's mug crate: this far from the hammock centre (out from the mast / to the spine). */
    napMug: 1.25,
    /** One hammock at each turbine foot: ring radius range, angle samples, ground limits. */
    ring: [4.8, 7.2] as const,
    samples: 16,
    /** Keep off the mast's service path: max cos between the hammock's and the park's bearing. */
    parkCos: 0.2,
    maxRelief: 0.6,
    minShore: 3,
    gap: 0.8,
  },
  kites: {
    /**
     * Kite field, as far windward as it fits: tries in order [min windwardness (cos of the angle
     * between the wind source and the site's bearing from the island centre), rect along the wind,
     * across]; later tries take any bearing and a smaller field. Then ground limits.
     */
    tries: [
      [0.25, 9, 9],
      [-0.3, 8, 8],
      [-1.1, 7, 7],
      [-1.1, 6, 5],
    ] as const,
    step: 2,
    minShore: 5,
    maxRelief: 1.0,
    gap: 1.2,
    /** Kites on poles across the windward edge (u), flying downwind; the rack at the lee edge. */
    count: [3, 5] as const,
    /** Fewer kites on a narrow field: poles at least this far apart across the wind. */
    minGap: 1.7,
    poleU: 2.6,
    spread: 3.4,
    jitter: 0.35,
    rackU: -3.2,
    /** Rack variant 1 has one empty slot: the kite stuck in the Hack Garden hedge. */
    rackVariant: 1,
    rackDuck: [2.3, 0.2] as const,
    /**
     * Kite Hill (TASK-497, `CO:C2`): with a hill the kites stand round its foot instead of the field:
     * pole sites on rings at `ring` u from the foot radius (KITE_HILL.foot; − = up the slope),
     * `samples` bearings each from the downwind side round, taken greedily at least `minGap` u apart
     * up to `count[1]` poles; the rack stands `rackOut` u outside the foot facing the hill, on a pad
     * `rackPad` u past its frame.
     */
    hill: {
      ring: [-3, -1.5, -4.5, 0, -6, 1.5, -7.5, 3] as const,
      samples: 36,
      count: [8, 12] as const,
      minGap: 5,
      maxRelief: 1.2,
      minShore: 3,
      gap: 0.6,
      rackOut: 3,
      rackPad: 0.5,
    },
  },
  /**
   * Kite Hill bench (TASK-497): bench v`variant` beside the path up the hill, `side` u off the path
   * centreline (its near edge `pathGap` u off the path), facing away from the summit; tried at path points `r` u from the summit (nearest
   * `r[0]` first), footprint `rect` [w, d], ground relief ≤ `maxRelief` u.
   */
  hillBench: {
    variant: 0,
    r: [5.5, 12] as const,
    side: 2.2,
    pathGap: 0.25,
    rect: [1.6, 0.7] as const,
    maxRelief: 0.5,
  },
  garden: {
    /** Hack Garden closed end becomes a `{` (hedge v2 bracketHedge); the entrance two `}`. */
    bracketVariant: 2,
    gateV: 2.35,
    /** The stuck kite's pole stands this far outside the closed end (its kite hangs over it). */
    stuckKiteU: 1.05,
    stuckKiteV: 1.4,
    /** Without a Hack Garden the kite sticks on a lawn-edge hedge: pole at (u, |v|) in the park. */
    lawnStuck: [8.6, 5.3] as const,
  },
  /** The tallest turbine (variant 0) becomes the wind chime tower (windTurbine v3, same LOD1). */
  chimeVariant: 3,
  /** Pagoda plinth radius round the chime tower foot (obstacle). */
  chimeRadius: 2.6,
  /**
   * M22 quick wins (TASK-479, WORLD_PLAN §4.3). Lengths in u. Glyph / grove / meadow sites are found
   * on the plateau after the Wind Gardens kit stands (so they never move it): `ring` = distance from
   * the Tech Park centre, `phase` samples per ring step.
   */
  m22: {
    /** C4 pinwheel meadow: a cols × rows grid of pinwheels (kite v3) on a clover bed, facing the wind. */
    pinwheels: {
      /** [columns, rows] tried in order (the bed is `margin` bigger than the grid, rows along U). */
      grids: [
        [6, 8],
        [5, 6],
        [4, 5],
      ] as const,
      spacing: 1.3,
      margin: 2.5,
      jitter: 0.18,
      /** Search ring round the park, ground limits. */
      ring: [12, 80] as const,
      maxRelief: 3.5,
      minShore: 3,
    },
    /** C9 hedge glyphs `{ < / > }`: letters of straight hedge pieces (hedge v0, 2 u long), 6 u tall. */
    glyphs: {
      gap: 1.1,
      /** Piece length of the hedge def and the hedge the strokes are made of (variant). */
      piece: 2,
      /** Layouts tried in order (stacked 6 u, one row 6 u, one row 4.5 u): lines of letters and the
       * letter height; lines are `lineGap` apart, the clover bed is `margin` bigger than the text,
       * the search leans toward `bearing` (rad, 0 = +x, π/2 = +z). */
      layouts: [
        {
          lines: [
            ['{', '}'],
            ['<', '/', '>'],
          ],
          height: 6,
        },
        { lines: [['{', '<', '/', '>', '}']], height: 6 },
        { lines: [['{', '<', '/', '>', '}']], height: 4.5 },
        { lines: [['{', '<', '/', '>', '}']], height: 3.6 },
      ] as const,
      lineGap: 1.4,
      margin: 2.2,
      ring: [10, 90] as const,
      bearing: Math.PI / 4,
      maxRelief: 4.5,
      minShore: 3,
    },
    /** Width of the strips kept clear from the hub to every lot, turbine and the dock while the sites are searched. */
    corridor: 3.5,
    /** C11 windsock avenue: poles on both long sides of the Tech Park, outside the perimeter walk. */
    windsocks: {
      u: [-10.6, -6.4, -2.1, 2.1, 6.4, 10.6] as const,
      /** Distance beyond the perimeter walk (v). */
      out: 1.35,
    },
    /** C13 fairy lights: lanterns at the four lawn corners (warm park) + wreaths on the quad-end trees. */
    lanternCorner: 0.9,
    /** C15 nap grove: six hammocks strung between round trees, west lobe. */
    grove: {
      /** [rows, columns] of hammocks, tried in order. */
      layouts: [
        [2, 3],
        [3, 2],
      ] as const,
      /** Hammock pitch along the row (u) and between rows (v); trees stand at the pitch midpoints. */
      pitchU: 5.2,
      pitchV: 3.6,
      /** Ground limits (the free rect is cols × pitchU + 2.4 by rows × pitchV + 1.6). */
      maxRelief: 3.5,
      minShore: 3,
      /** Mug crate beside every other hammock: offset along u / v. */
      mug: [0.2, 1.0] as const,
    },
    /** Devpod roofs wear weather vanes: devPod variants 2 / 3 (wearing the v0 / v1 roofs). */
    vaneVariants: [2, 3] as const,
  },
} as const;
