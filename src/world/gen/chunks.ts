import type { Heightfield } from '../types.ts';
import { CHUNK_CELLS, CHUNKS_PER_SIDE } from '../types.ts';
import { CHUNK_SHALLOW_DEPTH } from './params.ts';

export const CHUNK_HAS_LAND = 1;
export const CHUNK_HAS_SHALLOW = 2;

/** Per-chunk flags; a chunk covers samples [c·32, c·32+32] (shared edges included). */
export function buildChunkFlags(h: Heightfield): Uint8Array {
  const n = h.n;
  const flags = new Uint8Array(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE);
  for (let cz = 0; cz < CHUNKS_PER_SIDE; cz++) {
    for (let cx = 0; cx < CHUNKS_PER_SIDE; cx++) {
      let f = 0;
      for (let iz = cz * CHUNK_CELLS; iz <= (cz + 1) * CHUNK_CELLS && iz < n; iz++) {
        for (let ix = cx * CHUNK_CELLS; ix <= (cx + 1) * CHUNK_CELLS && ix < n; ix++) {
          const y = h.data[iz * n + ix];
          if (y > 0) f |= CHUNK_HAS_LAND;
          else if (y > -CHUNK_SHALLOW_DEPTH) f |= CHUNK_HAS_SHALLOW;
        }
      }
      flags[cz * CHUNKS_PER_SIDE + cx] = f;
    }
  }
  return flags;
}
