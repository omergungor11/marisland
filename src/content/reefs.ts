/**
 * Reef shoals + shared shelves (TASK-488, world plan `W:D1` / `W:K3`; gen/reefs.ts). Seabed
 * patches raised in the deep water between islands, all of them under water (D-058: no visible
 * land bridge). Heights in u (sea level 0), distances in u. Pure data.
 */
export const REEFS = {
  /**
   * `W:D1` shoals: `count` noise blobs (warped ellipses) whose crest lifts the seabed to
   * `crest` ± `relief`, never above `maxY`. A centre must lie `shore` u from every coast, over
   * seabed at least `minBaseDepth` deep, between two islands (its second-nearest island disc
   * gap ≤ `betweenGap`), `spacing` u from other shoals and `sillClear` u from a sill axis.
   */
  shoal: {
    count: [3, 6] as const,
    radius: [14, 22] as const,
    aspect: [0.5, 0.95] as const,
    crest: [-4.2, -2.4] as const,
    relief: 0.9,
    maxY: -2,
    /** Crest plateau: the lift holds to this fraction of the radius, then falls to flankY. */
    core: 0.5,
    /** Seabed height at the blob's rim (the lift fades out to this). */
    flankY: -13,
    /** Domain warp of the blob edge (fraction of the radius) and its noise wavelength (u). */
    warp: 0.28,
    warpScale: 24,
    /** Crest relief noise wavelength (u). */
    reliefScale: 7,
    shore: [20, 90] as const,
    minBaseDepth: 9,
    betweenGap: 95,
    spacing: 42,
    sillClear: 26,
    tries: 600,
  },
  /**
   * `W:K3` shared shelves: neighbouring islands (their shelves meet) whose layout discs are less
   * than `maxGap` u of water apart (the LAYOUT gap; the coasts themselves sit 60–90 u apart, the
   * discs are larger than the land) get a sill along the shortest coast-to-coast line (at most
   * `maxLength` u), crest `crest` ± `relief` (≤ `maxY`), a plateau
   * `core` × the half width, falling to `flankY` at the edge. The axis meanders up to `wobble` u
   * (zero at both coasts).
   */
  sill: {
    maxGap: 55,
    maxLength: 100,
    /** At most this many sills, shortest first. */
    maxCount: 3,
    crest: -3,
    relief: 0.45,
    maxY: -2.4,
    halfWidth: [10, 14] as const,
    widthJitter: 0.25,
    core: 0.45,
    flankY: -13,
    wobble: 4,
    /** Wavelength (u) of the meander, the width jitter and the crest relief. */
    noiseScale: 26,
    reliefScale: 8,
  },
  /**
   * Deep gap where a boat or ferry route crosses a reef: after the routes are built, every
   * raised cell within `halfWidth` u of a route sample sinks back to `depth` u (never below the
   * natural seabed), easing over `soft` u.
   */
  gap: { depth: 7, halfWidth: 4.5, soft: 4 },
  /** Extra A* cost per coarse step on a raised node: routes go round shoals, cross sills short. */
  routePenalty: 4,
  /** Raised more than this (u) above the natural seabed = part of the reef footprint. */
  liftMin: 0.5,
  /**
   * Open-sea query for big swimmers (TASK-489 whale): seabed at least `minDepth` deep, `reefClear`
   * u outside every reef footprint and `routeClear` u from every boat / ferry polyline.
   */
  openSea: { minDepth: 8, reefClear: 8, routeClear: 20 },
} as const;
