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
} as const;
export type ZoneId = (typeof Zone)[keyof typeof Zone];
export const ZONE_COUNT = 16;

export type ArchetypeId =
  | 'hearthholm'
  | 'beaconrock'
  | 'millbrook'
  | 'emberpeak'
  | 'palmlagoon'
  | 'mossgrove'
  | 'lonelypalm';

export type HeightClass = 'flat' | 'mid' | 'tall';
export type ColorClass = 'green' | 'sand' | 'dark';

export interface IslandData {
  id: number;
  archetype: ArchetypeId;
  /** Display name (seeded syllables; Hearthholm keeps its own). */
  name: string;
  /** Archetype display name from the roster table, e.g. 'Beacon Rock' (camera `island:<name>` matches either). */
  archetypeName: string;
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

export interface WorldData {
  seed: number;
  /** Wind direction in radians (y-up, angle in the xz plane). */
  windDir: number;
  islands: IslandData[];
  height: Heightfield;
  /** Uint8 zone id per sample (same grid as height). */
  zone: Uint8Array;
  /** Signed distance to the coastline in u: >0 on land, <0 in water. Same grid. */
  shoreSdf: Float32Array;
  /** Island id + 1 per sample (0 = open sea). */
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
  /** Fence lines (open polylines, 1.5 u spacing) around Millbrook field patches. */
  fences: Polyline[];
  /** Scattered props (scatter runs inside generateWorld, after settlements). */
  props: PropStore;
  /** Per-chunk flags: bit0 = has land, bit1 = has shallow water (needs a mesh). */
  chunkFlags: Uint8Array;
  /** Stage hashes (hex strings) for determinism snapshots. */
  hashes: Record<string, string>;
  /** Stage timings in ms (informational). */
  timings: Record<string, number>;
}

export interface XZ {
  x: number;
  z: number;
}

/**
 * Polyline in world xz. `islandId` −1 = spans islands (boat routes).
 * `kind`: 'path' | 'stair' | 'boardwalk' (paths), 'route', 'fence'.
 */
export interface Polyline {
  islandId: number;
  kind: string;
  closed: boolean;
  points: XZ[];
  /** Boat routes: indices into `docks` the loop passes (within 6 u of the dock end). */
  stops?: number[];
}

export interface PathGraph {
  /** x, z pairs (world u). */
  nodes: Float32Array;
  /** Node index pairs (undirected). */
  edges: Uint16Array;
}

export type LotKind = 'house' | 'stall' | 'barn' | 'cabin' | 'hut' | 'tower';

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
}

/** Landmark kinds: lighthouse, clocktower, windmill, hotSpring, volcanoCrater, sunkenShip, giantTree, lonelyPalm. */
export interface LandmarkData {
  kind: string;
  x: number;
  z: number;
  rotY: number;
  islandId: number;
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
}

export interface SettlementData {
  islandId: number;
  /** 'village' | 'lighthouse' | 'farm' | 'spring' | 'beachhut' | 'cabin'. */
  kind: string;
  /** Hub the paths radiate from (plaza centre or main landmark); `node` in pathGraph. */
  hub: { x: number; z: number; node: number };
  /** Plaza disc (Zone.plaza), Hearthholm only. */
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
