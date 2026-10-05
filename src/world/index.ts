/**
 * World generation entry point (ARCHITECTURE §2). Pure data, no three.js.
 * seed → layout → raw land → shore SDF → shelf/beach heights → zones → settlements
 * (pads, paths, docks) → boat routes → chunks → occupancy + prop scatter → hashes.
 */
import { createRng } from '../core/rng.ts';
import type { WorldData } from './types.ts';
import { GRID_N, Zone } from './types.ts';
import { buildChunkFlags } from './gen/chunks.ts';
import { cleanCoast, dropIslets, shoreSdfOwners } from './gen/coast.ts';
import { cellX, cellZ } from './gen/grid.ts';
import { COAST } from '../content/islands.ts';
import { combineHashes, hashBytes, hashFloats, hashLayout } from './gen/hash.ts';
import {
  buildRawLand,
  finalAnchors,
  finalizeHeight,
  measurePeaks,
  nearestIsland,
} from './gen/heightfield.ts';
import { generateLayout } from './gen/layout.ts';
import { Tag } from './gen/profiles.ts';
import { buildZones } from './gen/zones.ts';
import { buildSettlements, markSites } from './gen/settlements.ts';
import { buildRoutes } from './gen/routes.ts';
import { createOccupancy, scatterProps } from './gen/scatter.ts';
import { compactPropStore, createPropStore } from './prop-store.ts';
import { hashPolylines, hashProps, hashSites } from './gen/hash.ts';
import { EDIT_PROPS } from '../content/edit.ts';

export * from './types.ts';
export * from './edit-types.ts';
export { CHUNK_HAS_LAND, CHUNK_HAS_SHALLOW } from './gen/chunks.ts';
export { slopeAtCell } from './gen/zones.ts';
export { PropFlag, PROP_FLAGS, growPropStore, propCapacity, type PropStore } from './prop-store.ts';
export {
  applyEdit,
  canPlace,
  canonicalCmd,
  decodeLog,
  editHash,
  encodeLog,
  propIdAt,
  propIndexOf,
  replay,
  type EditPatchData,
  type PlaceCheck,
} from './edit.ts';

export interface GenerateOptions {
  /** 'auto' = archipelago of 5–7 islands (default); 1 = single Hearthholm (M1 tests). */
  islands?: 1 | 'auto';
  /**
   * Optional clock for `timings` (ms). World code may not read wall time
   * (determinism rule), so the caller injects it; without it timings are 0.
   */
  now?: () => number;
}

/** Keys combined (in this order) into `hashes.world`. */
export const STAGE_HASH_KEYS = [
  'layout',
  'height',
  'sdf',
  'islandMap',
  'zone',
  'fields',
  'chunks',
  'sites',
  'routes',
  'props',
] as const;

export function generateWorld(seed: number, opts: GenerateOptions = {}): WorldData {
  const now = opts.now ?? ((): number => 0);
  const timings: Record<string, number> = {};
  const hashes: Record<string, string> = {};
  const root = createRng(seed);
  const t0 = now();
  let t = t0;
  const lap = (key: string): void => {
    const t1 = now();
    timings[key] = t1 - t;
    t = t1;
  };

  const { windDir, islands } = generateLayout(root.fork('layout'), {
    islands: opts.islands ?? 'auto',
  });
  lap('layout');

  const rawLand = buildRawLand(islands, windDir, root.fork('height'));
  const land = new Uint8Array(GRID_N * GRID_N);
  for (let i = 0; i < land.length; i++) land[i] = rawLand.raw[i] > 0 ? 1 : 0;
  const protect = new Uint8Array(GRID_N * GRID_N);
  for (let i = 0; i < protect.length; i++) protect[i] = rawLand.tags[i] & Tag.noFill;
  const cleanup = cleanCoast(land, GRID_N, COAST.closeRadius, COAST.openRadius, protect);
  for (const i of cleanup.added) {
    const isl = nearestIsland(islands, cellX(i % GRID_N), cellZ(Math.floor(i / GRID_N)));
    rawLand.islandMap[i] = isl ? isl.id + 1 : 0;
  }
  for (const i of cleanup.removed) rawLand.islandMap[i] = 0;
  for (const i of dropIslets(land, GRID_N, rawLand.islandMap, COAST.minIsletCells, protect))
    rawLand.islandMap[i] = 0;
  lap('land');

  const { sdf, owner } = shoreSdfOwners(land, GRID_N, rawLand.islandMap);
  lap('sdf');

  const height = finalizeHeight(rawLand, sdf, owner, islands, windDir, root.fork('height'));
  measurePeaks(height, rawLand.islandMap, islands);
  finalAnchors(height, owner, rawLand.tags, islands);
  lap('height');

  const zone = buildZones(
    { h: height, sdf, islandMap: rawLand.islandMap, owner, tags: rawLand.tags, islands, windDir },
    root.fork('zones'),
  );
  lap('zones');

  const sites = buildSettlements(
    {
      h: height,
      sdf,
      zone,
      islandMap: rawLand.islandMap,
      islands,
      windDir,
      streams: rawLand.streams ?? [],
      fields: rawLand.fields,
    },
    root.fork('sites'),
  );
  // field hues only where the zone is still `field` (lots, paths and plaza took the rest)
  const fieldColor = rawLand.fieldColor;
  const fieldHue = fieldColor.slice();
  for (let i = 0; i < fieldColor.length; i++) if (zone[i] !== Zone.field) fieldColor[i] = 0;
  lap('sites');

  const boatRoutes = buildRoutes(
    { h: height, sdf, islands, docks: sites.docks },
    root.fork('routes'),
  );
  lap('routes');

  const chunkFlags = buildChunkFlags(height);
  lap('chunks');

  const world: WorldData = {
    seed,
    windDir,
    islands,
    height,
    zone,
    shoreSdf: sdf,
    islandMap: rawLand.islandMap,
    streams: rawLand.streams,
    settlements: sites.settlements,
    pathGraph: sites.pathGraph,
    paths: sites.paths,
    boatRoutes,
    landmarks: sites.landmarks,
    lots: sites.lots,
    docks: sites.docks,
    moorings: sites.moorings,
    fixtures: sites.fixtures,
    fences: sites.fences,
    fields: rawLand.fields,
    fieldColor,
    districts: [],
    props: createPropStore(0),
    chunkFlags,
    zonePainted: new Uint8Array(GRID_N * GRID_N),
    genAux: { tags: rawLand.tags, fieldHue, siteOccupancy: new Uint8Array(0) },
    hashes,
    timings,
  };
  const occupancy = createOccupancy();
  markSites(occupancy, world, sites.shapes);
  world.genAux.siteOccupancy = occupancy.data.slice();
  // spare slots for Phase 2 edits; hashes and consumers only read `count` entries
  world.props = compactPropStore(scatterProps(world, occupancy).props, EDIT_PROPS.propHeadroom);
  world.props.editBase = world.props.count;
  lap('props');

  hashes.layout = hashLayout(windDir, islands);
  hashes.height = hashFloats(height.data);
  hashes.sdf = hashFloats(sdf);
  hashes.islandMap = hashBytes(rawLand.islandMap);
  hashes.zone = hashBytes(zone);
  hashes.fields = hashBytes(fieldColor);
  hashes.chunks = hashBytes(chunkFlags);
  hashes.sites = hashSites(world);
  hashes.routes = hashPolylines(boatRoutes);
  hashes.props = hashProps(world.props);
  hashes.world = combineHashes(hashes, STAGE_HASH_KEYS);
  lap('hash');
  timings.total = t - t0;
  return world;
}
