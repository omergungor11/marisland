/**
 * World generation entry point (ARCHITECTURE §2). Pure data, no three.js.
 * seed → layout → raw land → shore SDF → shelf/beach heights → zones → chunks → hashes.
 */
import { createRng } from '../core/rng.ts';
import type { WorldData } from './types.ts';
import { GRID_N } from './types.ts';
import { buildChunkFlags } from './gen/chunks.ts';
import { cleanCoast, shoreSdf } from './gen/coast.ts';
import { cellX, cellZ } from './gen/grid.ts';
import { COAST } from './gen/params.ts';
import { combineHashes, hashBytes, hashFloats, hashLayout } from './gen/hash.ts';
import { buildRawLand, finalizeHeight, measurePeaks, nearestIsland } from './gen/heightfield.ts';
import { generateLayout } from './gen/layout.ts';
import { buildZones } from './gen/zones.ts';

export * from './types.ts';
export { CHUNK_HAS_LAND, CHUNK_HAS_SHALLOW } from './gen/chunks.ts';
export { slopeAtCell } from './gen/zones.ts';

export interface GenerateOptions {
  /** 1 = M1 single Hearthholm (default); 'auto' = archipelago (TASK-111). */
  islands?: 1 | 'auto';
  /**
   * Optional clock for `timings` (ms). World code may not read wall time
   * (determinism rule), so the caller injects it; without it timings are 0.
   */
  now?: () => number;
}

/** Keys combined (in this order) into `hashes.world`. */
export const STAGE_HASH_KEYS = ['layout', 'height', 'sdf', 'islandMap', 'zone', 'chunks'] as const;

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
    islands: opts.islands ?? 1,
  });
  lap('layout');

  const rawLand = buildRawLand(islands, windDir, root.fork('height'));
  const land = new Uint8Array(GRID_N * GRID_N);
  for (let i = 0; i < land.length; i++) land[i] = rawLand.raw[i] > 0 ? 1 : 0;
  const cleanup = cleanCoast(land, GRID_N, COAST.closeRadius, COAST.openRadius);
  for (const i of cleanup.added) {
    const isl = nearestIsland(islands, cellX(i % GRID_N), cellZ(Math.floor(i / GRID_N)));
    rawLand.islandMap[i] = isl ? isl.id + 1 : 0;
  }
  for (const i of cleanup.removed) rawLand.islandMap[i] = 0;
  lap('land');

  const sdf = shoreSdf(land, GRID_N);
  lap('sdf');

  const height = finalizeHeight(rawLand, sdf, islands, windDir, root.fork('height'));
  measurePeaks(height, rawLand.islandMap, islands);
  lap('height');

  const zone = buildZones(height, sdf, rawLand.islandMap, islands, windDir, root.fork('zones'));
  lap('zones');

  const chunkFlags = buildChunkFlags(height);
  lap('chunks');

  hashes.layout = hashLayout(windDir, islands);
  hashes.height = hashFloats(height.data);
  hashes.sdf = hashFloats(sdf);
  hashes.islandMap = hashBytes(rawLand.islandMap);
  hashes.zone = hashBytes(zone);
  hashes.chunks = hashBytes(chunkFlags);
  hashes.world = combineHashes(hashes, STAGE_HASH_KEYS);
  lap('hash');
  timings.total = t - t0;

  return {
    seed,
    windDir,
    islands,
    height,
    zone,
    shoreSdf: sdf,
    islandMap: rawLand.islandMap,
    chunkFlags,
    hashes,
    timings,
  };
}
