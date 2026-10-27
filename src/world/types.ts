/**
 * World data model (ARCHITECTURE §2, D-005). Pure data: typed arrays + plain
 * objects, no three.js. Everything the renderer and Phase 2 editor need.
 */
import type { PropStore } from './prop-store.ts';

/** 1 u = 1 m. World is WORLD_SIZE × WORLD_SIZE centred on the origin. */
export const WORLD_SIZE = 768;
/** Heightfield sample spacing in u (the bible's facet edge). */
export const CELL_SIZE = 2;
/** Samples per side: 768 / 2 + 1. */
export const GRID_N = WORLD_SIZE / CELL_SIZE + 1; // 385
/** Chunk = 32×32 cells = 64 u. */
export const CHUNK_CELLS = 32;
export const CHUNK_SIZE = CHUNK_CELLS * CELL_SIZE; // 64
export const CHUNKS_PER_SIDE = WORLD_SIZE / CHUNK_SIZE; // 12
/** Seabed floor. */
export const SEABED_Y = -40;

export const Zone = {
  deep: 0,
  mid: 1,
  shallow: 2,
  lagoon: 3,
  sandWet: 4,
  sandDry: 5,
  sandBlack: 6,
  grass: 7,
  meadow: 8,
  forest: 9,
  field: 10,
  rock: 11,
  cliff: 12,
  path: 13,
  plaza: 14,
  crater: 15,
  // HQ Seven Gates street tints (TASK-466, D-060): paving in one culture's colour per street,
  // THEME_IDS order (`streetZone(k)`); painted by plans/hq.ts, kept by the path write-back
  streetHq: 16,
  streetCoding: 17,
  streetMarketing: 18,
  streetQa: 19,
  streetDesign: 20,
  streetDevops: 21,
  streetResearch: 22,
} as const;
export type ZoneId = (typeof Zone)[keyof typeof Zone];
export const ZONE_COUNT = 23;
/** Street zone of the culture at THEME_IDS index `k` (0 = HQ). */
export const streetZone = (k: number): number => Zone.streetHq + k;
/** True for the seven culture-tinted street zones (paving, walkable, path class). */
export const isStreetZone = (z: number): boolean => z >= Zone.streetHq && z <= Zone.streetResearch;

export type ArchetypeId =
  | 'hearthholm'
  | 'beaconrock'
  | 'millbrook'
  | 'emberpeak'
  | 'palmlagoon'
  | 'mossgrove'
  | 'lonelypalm';

/** Department theme of an island (Phase 3, D-024). Order is stable: index = variant / accessory index. */
export type ThemeId = 'hq' | 'coding' | 'marketing' | 'qa' | 'design' | 'devops' | 'research';
export const THEME_IDS: readonly ThemeId[] = [
  'hq',
  'coding',
  'marketing',
  'qa',
  'design',
  'devops',
  'research',
];

export type HeightClass = 'flat' | 'mid' | 'tall';
export type ColorClass = 'green' | 'sand' | 'dark';

export interface IslandData {
  id: number;
  archetype: ArchetypeId;
  /** Display name (seeded syllables; Hearthholm keeps its own). */
  name: string;
  /** Archetype display name from the roster table, e.g. 'Beacon Rock' (camera `island:<name>` matches either). */
  archetypeName: string;
  /** Department theme (content/themes THEME_BY_ARCHETYPE). */
  theme: ThemeId;
  /** Centre in world u. */
  cx: number;
  cz: number;
  /** Nominal radius in u. */
  radius: number;
  heightClass: HeightClass;
  colorClass: ColorClass;
  /** Peak height and position (label anchor, landmark anchor). */
  peakY: number;
  peakX: number;
  peakZ: number;
  /** Axis-aligned bounds in u. */
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  /** Bounding-disc radius in u: every land cell of the island lies within it of (cx, cz). */
  reach: number;
  /** Anchor points filled by later stages (settlements). Radians for facing. */
  anchors: Record<string, { x: number; z: number; rotY: number }>;
}

export type IsletKind = 'skerry' | 'sandbar';

/**
 * An islet (TASK-471, D-058): a skerry (sea stack) or the Lonely Palm sandbar. Ids continue
 * after the islands' (`islandMap` value = id + 1), so the heightfield, zone and scatter stages
 * treat it as a land body; nothing else (themes, settlements, labels, routes, cameras) sees it.
 */
export interface IsletData {
  id: number;
  kind: IsletKind;
  cx: number;
  cz: number;
  radius: number;
  reach: number;
  peakY: number;
  peakX: number;
  peakZ: number;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface Heightfield {
  /** GRID_N × GRID_N heights in u, row-major (z then x). */
  data: Float32Array;
  n: number;
  cellSize: number;
  /** World x/z of sample (0,0). */
  originX: number;
  originZ: number;
}

/** A carved stream (Mossgrove): polyline in world u from source to mouth. */
export interface StreamData {
  islandId: number;
  points: { x: number; z: number }[];
}

/**
 * A reef (TASK-488). `sill`: axis from the coast of `islands[0]` (x0, z0) to the coast of
 * `islands[1]` (x1, z1), `halfWidth` = half width. `shoal`: a blob centred at (x0, z0) = (x1, z1),
 * `halfWidth` = radius along `angle`, `aspect` × radius across. `crest` = top height (u, < 0).
 */
export interface ReefData {
  kind: 'sill' | 'shoal';
  islands: number[];
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  halfWidth: number;
  crest: number;
  angle: number;
  aspect: number;
  /** Noise offset of this reef's shape. */
  salt: number;
}

export interface WorldData {
  seed: number;
  /** Wind direction in radians (y-up, angle in the xz plane). */
  windDir: number;
  islands: IslandData[];
  /** Skerries + the Lonely Palm sandbar (TASK-471); ids follow the islands'. */
  islets: IsletData[];
  height: Heightfield;
  /** Uint8 zone id per sample (same grid as height). */
  zone: Uint8Array;
  /** Signed distance to the coastline in u: >0 on land, <0 in water. Same grid. */
  shoreSdf: Float32Array;
  /** Island (or islet) id + 1 per sample (0 = open sea). */
  islandMap: Uint8Array;
  /** Carved streams (optional; Mossgrove). */
  streams?: StreamData[];
  /** One entry per island with a settlement / outpost (TASK-131). */
  settlements: SettlementData[];
  /** Footpath graph for villagers: nodes = x,z pairs (world u), edges = node index pairs. */
  pathGraph: PathGraph;
  /** Smoothed footpaths (open polylines, ≈ 2 u spacing) between graph junctions; props follow them. */
  paths: Polyline[];
  /** Boat routes: closed loops over water ≥ 1.5 u deep, ≈ 2 u spacing (TASK-133). */
  boatRoutes: Polyline[];
  landmarks: LandmarkData[];
  lots: LotData[];
  docks: DockData[];
  /** Boat moorings along docks (life agents spawn here). */
  moorings: MooringData[];
  /** Single fixed props placed by settlements (well, buoys, tide pools, message bottle). */
  fixtures: FixtureData[];
  /**
   * Seamarks (TASK-474; gen/seamarks.ts): channel buoys along the ferry routes and sea-stack
   * fields off the windward coasts. Fixtures on the water, placed after the routes; `islandId` is
   * the nearest island (decor stream), not a settlement's. Hashed as `hashes.seamarks`.
   */
  seamarks: FixtureData[];
  /**
   * HQ yacht marina (TASK-505; gen/marina.ts): comb piers, breakwater, the cove-mouth star fort, the
   * moored fleet (`sailboat` variants 6-8) and the channel gates round the ferry stop. All floating
   * fixtures (render pivot y = 0), appended to the prop store last. Hashed as `hashes.marina`.
   */
  marina: FixtureData[];
  /**
   * Reef shoals + shared-shelf sills (TASK-488, `W:D1` / `W:K3`; gen/reefs.ts): raised seabed
   * between islands, always under water, already baked into `height` (and so into its hash).
   */
  reefs: ReefData[];
  /** Per sample 0…255: how much the seabed was raised by a reef (water shader tint mask). */
  reefWeight: Uint8Array;
  /** Fence lines (open polylines, 1.5 u spacing) along Millbrook field-patch edges. */
  fences: Polyline[];
  /** Millbrook patchwork: one rectangle per crop field (colour index into palette FIELDS). */
  fields: FieldPatchData[];
  /**
   * Field colour per sample (same grid): 1 + index into palette FIELDS where the zone is
   * `field`, else 0. Terrain colours read it so the patchwork shows ≥ 4 hues (sweep D11).
   */
  fieldColor: Uint8Array;
  /** Theme districts (M14b): solar fields, quads, yards, gardens… Filled by the theme plans. */
  districts: DistrictData[];
  /** Culture story spots (M19): T3 mini scenes emitted by the theme plans, in plan order. */
  storySpots: StorySpot[];
  /** Waterfalls off the bluff lips (M17b TASK-395; gen/waterfalls.ts). Not hashed. */
  waterfalls: WaterfallData[];
  /** Scattered props (scatter runs inside generateWorld, after settlements). */
  props: PropStore;
  /** Per-chunk flags: bit0 = has land, bit1 = has shallow water (needs a mesh). */
  chunkFlags: Uint8Array;
  /**
   * Phase 2: 1 where the user painted the zone (TASK-202). Painted zones win over local
   * re-derivation until the height of that sample changes again. All 0 after generation.
   */
  zonePainted: Uint8Array;
  /** Generation-time masks kept so edits can re-derive data with the generation rules. */
  genAux: GenAux;
  /** Stage hashes (hex strings) for determinism snapshots. */
  hashes: Record<string, string>;
  /** Stage timings in ms (informational). */
  timings: Record<string, number>;
}

/** Generation leftovers needed by Phase 2 edits (not hashed into `hashes`). */
export interface GenAux {
  /** Profile `Tag` bits per sample (lagoon, cliff, crater, pond, field, meadow…). */
  tags: Uint8Array;
  /** Field hue per sample before settlements took cells (1 + palette FIELDS index, 0 = none). */
  fieldHue: Uint8Array;
  /**
   * Static OccupancyGrid data (1 u cells, `OCC_STRUCTURE` / `OCC_PATH`) after settlements and
   * before scatter: lots, docks, landmarks, plaza, footpaths. Edit placement validation reads it.
   */
  siteOccupancy: Uint8Array;
}

export interface XZ {
  x: number;
  z: number;
}

/**
 * Polyline in world xz. `islandId` −1 = spans islands (boat routes).
 * `kind`: 'path' | 'stair' | 'boardwalk' (paths), 'route' | 'ferry' (boat routes), 'fence'.
 */
export interface Polyline {
  islandId: number;
  kind: string;
  closed: boolean;
  points: XZ[];
  /** Boat routes: indices into `docks` the loop passes (within 6 u of the dock end). */
  stops?: number[];
  /** Ferry routes (M19 TASK-420): seconds the boat rests at each stop. */
  dwell?: number;
  /** Funicular sections (TASK-507): rail-top height at every piece joint (world/funicular.ts). */
  levels?: number[];
}

export interface PathGraph {
  /** x, z pairs (world u). */
  nodes: Float32Array;
  /** Node index pairs (undirected). */
  edges: Uint16Array;
}

export type LotKind =
  | 'house'
  | 'stall'
  | 'barn'
  | 'cabin'
  | 'hut'
  | 'tower'
  | 'office'
  | 'studio'
  | 'lab'
  | 'shed'
  | 'kiosk'
  | 'pavilion'
  | 'outpost';

/** Campus role of a lot (informational; life and decor read it). 'legacy' = pre-Phase-3 building. */
export type LotRole = 'main' | 'office' | 'annex' | 'kiosk' | 'pavilion' | 'legacy';

/**
 * A building lot. Ground under it is flattened (except kind 'hut' = stilt hut
 * over water). rotY: facing (door) direction (cos rotY, sin rotY).
 */
export interface LotData {
  defId: string;
  x: number;
  z: number;
  rotY: number;
  islandId: number;
  kind: LotKind;
  /** Footprint width (across the facing) and depth (along it), u. */
  w: number;
  d: number;
  /** pathGraph node at the door. */
  node: number;
  /**
   * Building variant (wall/roof colour set, content/settlements LOT_ROOFS). Chosen in
   * worldgen so path-adjacent lots never share a roof colour (sweep D12).
   */
  variant: number;
  role: LotRole;
}

/**
 * A rectangular crop field (Millbrook patchwork). Same rect convention as lots:
 * `d` along (cos rotY, sin rotY), `w` across it. `color` = index into palette FIELDS.
 */
export interface FieldPatchData {
  islandId: number;
  x: number;
  z: number;
  rotY: number;
  w: number;
  d: number;
  color: number;
}

/** District kinds (M14b). Extend the union when a theme plan needs a new kind. */
export type DistrictKind =
  | 'solar'
  | 'quad'
  | 'yard'
  | 'garden'
  | 'terrace'
  | 'stage'
  | 'sandbox'
  | 'sculpture'
  /** HQ compass plaza (TASK-466): the round plaza the TASK-468 mosaic paints; rotY = the harbour heading, w = d = 2 r. The street rays are the `cultureGate` fixtures' bearings from its centre. */
  | 'compass'
  // Design Glass Conservatory (TASK-467): the glasshouse block and the windmill meadow
  | 'glasshouses'
  | 'windmill'
  /** Marketing Ad Boulevard (TASK-481): the straight street the terrain shader lays the red carpet over; rotY = the street heading, w = its width, d = its length. */
  | 'carpet';

/**
 * A theme district (M14b): a rectangle with a purpose (render emits its props, e.g. solar rows on
 * a lattice). Same rect convention as lots / field patches: `d` along (cos rotY, sin rotY), `w`
 * across it, centre (x, z).
 */
export interface DistrictData {
  islandId: number;
  kind: DistrictKind;
  x: number;
  z: number;
  rotY: number;
  w: number;
  d: number;
}

/** Landmark kinds: lighthouse, clocktower, windmill, hotSpring, volcanoCrater, sunkenShip, giantTree, lonelyPalm. */
export interface LandmarkData {
  kind: string;
  x: number;
  z: number;
  rotY: number;
  islandId: number;
  /** Geometry variant chosen by the planner (e.g. Coding turbine heights); unset = theme / rolled. */
  variant?: number;
}

/** Dock: starts on the shore at (x, z) and runs `segments` × 2 u along (cos rotY, sin rotY). */
export interface DockData {
  x: number;
  z: number;
  rotY: number;
  segments: number;
  islandId: number;
  /** pathGraph node at the dock root (−1 if unconnected). */
  node: number;
}

/**
 * A waterfall (TASK-395): lip on the bluff rim at (x, y, z), falling along (cos rotY, sin rotY)
 * into the sea at (baseX, baseZ). `stream` = a carved stream feeds it; `seed` ∈ [0, 1).
 */
export interface WaterfallData {
  islandId: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  baseX: number;
  baseZ: number;
  width: number;
  stream: boolean;
  seed: number;
}
export interface MooringData {
  defId: 'rowboat' | 'sailboat';
  x: number;
  z: number;
  rotY: number;
  islandId: number;
  /** Index into `docks`. */
  dock: number;
}

export interface FixtureData {
  defId: string;
  x: number;
  z: number;
  rotY: number;
  islandId: number;
  /** Geometry variant chosen by the planner (e.g. straight vs corner kerb); unset = rolled. */
  variant?: number;
  /** Instance scale (unset = 1): the Research arboretum's oversized round tree (M22 TASK-483). */
  scale?: number;
}

export interface SettlementData {
  islandId: number;
  /** 'village' | 'lighthouse' | 'farm' | 'spring' | 'beachhut' | 'cabin' | 'campus'. */
  kind: string;
  theme: ThemeId;
  /** Hub the paths radiate from (plaza centre or main landmark); `node` in pathGraph. */
  hub: { x: number; z: number; node: number };
  /** Plaza / campus quad disc (Zone.plaza); null when the island has none. */
  plaza: { x: number; z: number; r: number } | null;
  /** Indices into world.lots / landmarks / docks. */
  lots: number[];
  landmarks: number[];
  docks: number[];
}

/** Bilinear height lookup. Outside the grid → SEABED_Y. */
export function heightAt(h: Heightfield, x: number, z: number): number {
  const fx = (x - h.originX) / h.cellSize;
  const fz = (z - h.originZ) / h.cellSize;
  const n = h.n;
  if (fx < 0 || fz < 0 || fx > n - 1 || fz > n - 1) return SEABED_Y;
  const x0 = Math.min(Math.floor(fx), n - 2);
  const z0 = Math.min(Math.floor(fz), n - 2);
  const tx = fx - x0;
  const tz = fz - z0;
  const d = h.data;
  const i = z0 * n + x0;
  const a = d[i];
  const b = d[i + 1];
  const c = d[i + n];
  const e = d[i + n + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + e * tx) * tz;
}

/** Bilinear lookup on any float grid sharing the heightfield layout. */
export function sampleGrid(
  h: Heightfield,
  grid: Float32Array,
  x: number,
  z: number,
  outside: number,
): number {
  const fx = (x - h.originX) / h.cellSize;
  const fz = (z - h.originZ) / h.cellSize;
  const n = h.n;
  if (fx < 0 || fz < 0 || fx > n - 1 || fz > n - 1) return outside;
  const x0 = Math.min(Math.floor(fx), n - 2);
  const z0 = Math.min(Math.floor(fz), n - 2);
  const tx = fx - x0;
  const tz = fz - z0;
  const i = z0 * n + x0;
  return (
    (grid[i] * (1 - tx) + grid[i + 1] * tx) * (1 - tz) +
    (grid[i + n] * (1 - tx) + grid[i + n + 1] * tx) * tz
  );
}

/** Nearest zone id at a world position. */
export function zoneAt(h: Heightfield, zone: Uint8Array, x: number, z: number): number {
  const ix = Math.round((x - h.originX) / h.cellSize);
  const iz = Math.round((z - h.originZ) / h.cellSize);
  if (ix < 0 || iz < 0 || ix >= h.n || iz >= h.n) return Zone.deep;
  return zone[iz * h.n + ix];
}

/**
 * A culture story spot (M19, TASK-408): a quiet T3 mini scene on an island, emitted by the theme
 * plans (`SitePlan.stories`; world y = final ground + the plan's pos.y, e.g. a crane cab) into
 * `world.storySpots`. `kind` is a content key (content/cultures StorySpotDef.kind),
 * `defs` the prop def ids placed at the spot (same ids `appendSettlementProps.push` takes).
 */
export interface StorySpot {
  kind: string;
  islandId: number;
  pos: { x: number; y: number; z: number };
  rotY: number;
  defs: readonly string[];
}
