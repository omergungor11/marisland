/**
 * Settlement, path, dock and boat-route tables (ARCHITECTURE §2 steps 5–6,
 * ART_BIBLE §4 roster "Landmark / Key props", §5 Buildings/Coastal/Landmarks/Decor).
 * Data only — worldgen (src/world/gen/settlements.ts, paths.ts, routes.ts) reads it.
 * Def ids match content/props*.ts. rotY convention everywhere: facing
 * direction (cos rotY, sin rotY) in the xz plane (same as windDir / anchors).
 */
import type { LotKind } from '../world/types.ts';

/** Building footprints in u: [width (across the facing), depth (along the facing)]. */
export const LOT_FOOTPRINT: Readonly<Record<string, readonly [number, number]>> = {
  cottage: [3, 3],
  stiltHut: [3, 3],
  towerHouse: [2.5, 2.5],
  barn: [6, 4],
  logCabin: [4, 3],
  marketStall: [2, 1.5],
};

/** Lot def → lot kind. */
export const LOT_KIND: Readonly<Record<string, LotKind>> = {
  cottage: 'house',
  stiltHut: 'hut',
  towerHouse: 'tower',
  barn: 'barn',
  logCabin: 'cabin',
  marketStall: 'stall',
};

/**
 * Roof colour (index into palette ROOFS) per building variant, mirroring the variant →
 * palette mapping in geo/buildings.ts (cottage cycles WALLS/ROOFS sets 0/2/4, the stilt hut
 * starts one set later, …). Worldgen picks each lot's variant so that no two neighbouring
 * lots share a roof colour; the variant count per def must equal props-buildings `variants`.
 */
export const LOT_ROOFS: Readonly<Record<string, readonly number[]>> = {
  cottage: [0, 2, 4],
  stiltHut: [2, 4],
  towerHouse: [5, 1, 2],
  barn: [5, 0],
  logCabin: [3, 6],
  marketStall: [0, 2, 3],
};

/** Lot kinds that take part in the roof-colour rule (stall awnings are striped, not roofs). */
export const ROOFED_KINDS: readonly LotKind[] = ['house', 'tower', 'hut', 'barn', 'cabin'];

export interface LandmarkSpec {
  /** Occupancy / overlap radius in u (null = no occupancy, e.g. the crater). */
  radius: number | null;
  /** Flatten radius in u (0 = no flatten). */
  flatten: number;
}

/** Landmark kinds → footprint + flatten pad (ART_BIBLE §5 Landmarks). */
export const LANDMARKS: Readonly<Record<string, LandmarkSpec>> = {
  lighthouse: { radius: 3.5, flatten: 3.5 }, // "7 u lawn"
  clocktower: { radius: 2, flatten: 2 },
  windmill: { radius: 3, flatten: 3 },
  hotSpring: { radius: 4, flatten: 4 }, // "8 u ring"
  volcanoCrater: { radius: null, flatten: 0 },
  sunkenShip: { radius: 6, flatten: 0 },
  giantTree: { radius: 5, flatten: 5 }, // "flatten 10 u"
  lonelyPalm: { radius: 1, flatten: 0 },
};

/** Fixed single props (not lots): footprint radius in u. */
export const FIXTURE_RADIUS: Readonly<Record<string, number>> = {
  well: 1,
  buoy: 0.5,
  tidePool: 1,
  messageBottle: 0.3,
};

/** Flatten pads (plateau with smooth falloff). */
export const FLATTEN = {
  /** Core extends this far past a lot footprint (≥ 2√2 so bilinear corners only see the plateau). */
  lotMargin: 2.9,
  /** Core extends this far past a disc radius (plaza, landmarks). */
  discMargin: 1.5,
  /** Falloff width in u outside the core. */
  falloff: 4,
  /** Plateau never below this (land ≥ 0.3 u rule). */
  minHeight: 0.4,
  /** Neighbouring pads whose cores overlap are relaxed to differ by at most this (u). */
  maxStep: 0.2,
} as const;

/** Hearthholm fishing village. */
export const VILLAGE = {
  plazaRadius: 6,
  /** Plaza search: within this of the harbour anchor (grows by `searchGrow` until found). */
  plazaSearch: 25,
  searchGrow: 10,
  plazaMinShore: 6,
  /** Cottage count range. */
  cottages: [10, 16] as const,
  /** Gap between neighbouring lots (u). */
  lotGap: 1.5,
  /** Lot centre distance from the lane centreline. */
  laneOffset: 3.6,
  /** Spacing jitter along lanes (u). */
  laneJitter: 1.2,
  /** Max lane length from the plaza centre. */
  laneLength: 36,
  /** Lot centres need at least this shore distance (cores stay on land). */
  lotMinShore: 6,
  /** Max height range over a lot footprint before flattening (u). */
  lotMaxRelief: 1.6,
  stiltHuts: [2, 4] as const,
  /** Stilt-hut water: depth range and shore distance range (u). */
  /** (Task asked 0.8–2 u at 2–5 u; the 8–12 u shelf is only ≈ 0.6 u deep at 5 u, so 0.5–2 at 2–7.) */
  stiltDepth: [0.5, 2] as const,
  stiltShore: [2, 7] as const,
  /** Stilt huts: min centre spacing to another hut, and min clearance to a pier (+ its basin), u. */
  stiltSpacing: 12,
  stiltDockClear: 9,
  stiltSearch: 40,
  /** Bay test: of 12 rays (length bayRay u) at least this many hit land; relaxed in order. */
  bayRay: 45,
  bayEnclosure: [7, 5, 3] as const,
  /** Lane directions (degrees from the harbour lane), tried in order until the cottage target is met. */
  lanes: [0, 75, -75, 140, -140, 35, -35, 108, -108, 160, -160, 55, -55] as const,
  stalls: [2, 3] as const,
  /**
   * Lots whose centres are closer than this (u) are neighbours for the roof-colour rule:
   * along-lane neighbours (≈ 4.5–5.7 u) and the lot across the lane (7.2 u), not diagonals.
   */
  roofNeighbour: 8,
  rowboats: [3, 5] as const,
  sailboats: [1, 2] as const,
} as const;

/** Small settlements on the other archetypes. */
export const OUTPOSTS = {
  /** Beacon Rock keeper hut: ring around the lighthouse. */
  keeperRing: [6, 12] as const,
  buoys: [2, 4] as const,
  buoyDepth: [2, 9] as const,
  buoyShore: [6, 22] as const,
  buoySpacing: 8,
  /** Millbrook farm. */
  farmCottages: [2, 4] as const,
  farmRing: [7, 12] as const,
  fenceFields: [2, 4] as const,
  /** Min field samples inside a patch rectangle for it to get a fence. */
  fenceMinCells: 30,
  fenceStep: 1.5,
  /** Fence runs shorter than this many posts are dropped (no stray sticks). */
  fenceMinRun: 5,
  /** Mossgrove cabin distance from the stream mouth. */
  cabinRing: [6, 24] as const,
  cabinMaxRelief: 3.5,
  cabinStreamClear: 4,
  /** Palmlagoon tide pools. */
  tidePools: [2, 3] as const,
  tidePoolSpacing: 10,
} as const;

/** Docks (ARCHITECTURE §2 step 5: water > 2 u deep within reach of the shore). */
export const DOCK = {
  segment: 2,
  /**
   * The pier runs out until its end stands in at least this depth (u): past the turquoise
   * shelf, where a sailboat can moor (sweep D8 — 2 u ended mid-shallows).
   */
  endDepth: 3.5,
  /** Palmlagoon's atoll channel docks (no carving; the lagoon floor is 2–4 u). */
  lagoonEndDepth: 2.25,
  maxSegments: 12,
  minSegments: 2,
  /** Shore normal = SDF gradient over ± this span (u) at the pier root. */
  normalSpan: 4,
  /** Every pier sample must be ≥ awayRate × t − awaySlack u from shore (never along it). */
  awayRate: 0.85,
  awaySlack: 1,
  /** Hearthholm: score penalty when the end reaches depth but not the blue band (zone mid). */
  shallowEndPenalty: 8,
  /** Carved fallback (shelf too shallow within reach): at most this many segments. */
  carveSegments: 8,
  /** Channel carve along a fallback pier and the turning basin depth (u, ≥ endDepth). */
  channelWidth: 3,
  channelDepth: 3.8,
  /** Moorings: rowboats need this depth, spaced along the dock sides. */
  rowboatDepth: 0.8,
  mooringSide: 1.8,
  /** Turning basin carved past every dock end so boat routes can reach it. */
  basinOffset: 3,
  basinRadius: 3.2,
} as const;

/** Footpaths (ARCHITECTURE §2 step 6). */
export const PATHS = {
  /** cost = 1 + slopeCost·slope (+ stairQuad·slope² on stair islands). */
  slopeCost: 8,
  maxSlope: 1.2,
  /** Beacon Rock stair: steeper edges allowed, quadratic penalty → switchbacks. */
  stairMaxSlope: 6,
  stairQuad: 24,
  /** Stair search corridor half-width around landing → lighthouse (u). */
  stairCorridor: 7,
  /** Link searches try a ±linkWindow u window around the pin before the whole island. */
  linkWindow: 26,
  /** Cost multiplier on cells already used by a path (paths merge). */
  reuse: 0.45,
  /** Min shore distance for path cells (u). */
  minShore: 0.6,
  /** Zone.path within this of the centreline. */
  halfWidth: 1,
  carve: 0.15,
  /** Catmull-Rom subdivisions per control edge; output resampled at `step`. */
  smooth: 3,
  step: 2,
} as const;

/** Boat routes (TASK-133). */
export const ROUTES = {
  /** Coarse A* grid spacing (u). */
  cell: 4,
  count: [2, 4] as const,
  /** Every route sample: depth ≥ minDepth and shore distance ≥ minShore. */
  minDepth: 1.5,
  minShore: 2,
  /** Coarse node passable if every heightfield sample within ±cell/2 is at least this deep. */
  nodeDepth: 1.7,
  nodeShore: 2.3,
  /** Preferred depth band (shelf edge) — outside it the cost rises. */
  preferDepth: [3, 10] as const,
  /** A dock is "visited" when the route passes within this of its end. */
  dockReach: 6,
  docksPerRoute: [2, 3] as const,
  /** Circling loops: waypoint rays per island. */
  circleRays: 8,
  /** Cost added near previously routed cells (return legs take another course). */
  repel: 2.5,
  /** Route legs search the waypoints' bounding box grown by this (u) before the whole world. */
  legMargin: 80,
  resample: 2,
} as const;
