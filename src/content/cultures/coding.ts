/**
 * Rüzgâr Bahçeleri (Wind Gardens). Kit ledger (TASK-411): 8 new defs, 7/8 tier >= 2, one tier-1
 * (giantDuck), no tier-0, ORDERED BY PRIORITY (most identity-defining first; if the budget gate
 * drops the per-island cap to 6, cut from the end). Geometry: geo/themes/culture-coding.ts.
 * Not ledger entries (variants of existing defs): bracketHedge = hedge v2, windChimeTower =
 * windTurbine v3 (LOD1 identical to v0). Story spots, rhythm and relay by waves 2-3.
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
} as const;
