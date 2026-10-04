import type { WorldData } from '../world/types.ts';
import { CHUNK_CELLS, CHUNKS_PER_SIDE } from '../world/types.ts';
import type { DirtyRegion } from '../world/edit-types.ts';
import type { Counters } from '../capture/api.ts';
import { EDIT_RENDER } from '../content/edit.ts';
import type { TerrainView } from './terrain/terrain.ts';
import type { WorldTextures } from './world-textures.ts';
import type { PropBatcher } from './props/batcher.ts';
import type { PropMirror } from './props/prop-mirror.ts';
import { unionRect, type TexRect } from './gl-subimage.ts';

/**
 * Dirty-region rebuild after an edit (TASK-211, ARCHITECTURE Phase 2). Per region:
 * 1. height / SDF (+ ring scale) / zone textures: changed texels only, `texSubImage2D`;
 * 2. props: touched world indices mirrored into the render store, ground-following settlement
 *    props re-grounded, `PropBatcher.rewrite` (matrices, removal fades, appends);
 * 3. terrain chunks: queued (region chunks ∪ chunks within `chunkPadCells` of the bounds ∪
 *    chunks under the samples whose colour inputs changed — `TextureUpdateStats.colorRect`) and
 *    remeshed ≤ `EDIT_RENDER.chunksPerFrame` per frame in `update` — or all at once in capture.
 *    Each chunk refreshes only its colour samples inside the accumulated colour rect.
 * Results depend only on the world data (no clocks / randomness): a rebuilt chunk equals the same
 * chunk built at boot from the edited world.
 */
export interface Rebuilder {
  rebuildDirty(region: DirtyRegion): void;
  /** Per frame: remesh up to `chunksPerFrame` queued chunks. */
  update(): void;
  /** Remesh every queued chunk now. */
  flush(): void;
  /** Queued chunk count. */
  readonly pending: number;
}

export interface RebuildDeps {
  world: WorldData;
  terrain: TerrainView;
  textures: WorldTextures;
  props: PropBatcher;
  mirror: PropMirror;
  /** Capture (`freeze=1`): rebuild synchronously, before the next screenshot. */
  instant: boolean;
  getTime(): number;
  now(): number;
  counters: Counters;
  timings: Record<string, number>;
  chunksPerFrame?: number;
}

/** Chunk ids whose samples [c·32, c·32 + 32] overlap the inclusive cell rect ± `pad`. */
export function chunksOverlapping(
  minI: number,
  maxI: number,
  minJ: number,
  maxJ: number,
  pad = 0,
): number[] {
  const out: number[] = [];
  if (maxI < minI || maxJ < minJ) return out;
  const N = CHUNKS_PER_SIDE;
  // chunk c spans samples [c·32, c·32 + 32] (edges shared with its neighbours)
  const lo = (a: number): number => Math.max(0, Math.ceil((a - pad - CHUNK_CELLS) / CHUNK_CELLS));
  const hi = (b: number): number => Math.min(N - 1, Math.floor((b + pad) / CHUNK_CELLS));
  for (let cz = lo(minJ); cz <= hi(maxJ); cz++)
    for (let cx = lo(minI); cx <= hi(maxI); cx++) out.push(cz * N + cx);
  return out;
}

/** Chunks to remesh for `region`: its own list ∪ every chunk whose samples lie within `pad`. */
export function dirtyChunks(
  region: DirtyRegion,
  pad: number = EDIT_RENDER.chunkPadCells,
): number[] {
  const N = CHUNKS_PER_SIDE;
  const set = new Set<number>();
  for (const c of region.chunks) if (c >= 0 && c < N * N) set.add(c);
  for (const c of chunksOverlapping(region.minI, region.maxI, region.minJ, region.maxJ, pad))
    set.add(c);
  return Array.from(set).sort((a, b) => a - b);
}

export function createRebuilder(d: RebuildDeps): Rebuilder {
  const N = CHUNKS_PER_SIDE;
  const queue: number[] = [];
  const queued = new Uint8Array(N * N);
  /** Per queued chunk: colour samples to refresh (null = geometry / skirts only). */
  const colors: (TexRect | null)[] = new Array(N * N).fill(null);
  const perFrame = d.chunksPerFrame ?? EDIT_RENDER.chunksPerFrame;
  const enqueue = (id: number, color: TexRect | null): void => {
    colors[id] = unionRect(colors[id], color);
    if (queued[id]) return;
    queued[id] = 1;
    queue.push(id);
  };
  d.counters.rebuilds ??= 0;
  let totalMs = 0;
  let total = 0;
  const drain = (max: number): void => {
    let n = 0;
    let ms = 0;
    while (queue.length && n < max) {
      const id = queue.shift()!;
      queued[id] = 0;
      const color = colors[id];
      colors[id] = null;
      const t0 = d.now();
      const neighbours = d.terrain.rebuildChunk(id % N, Math.floor(id / N), color);
      const dt = d.now() - t0;
      // skirts of meshed neighbours follow a chunk that appeared / sank
      for (const nb of neighbours) enqueue(nb, null);
      ms += dt;
      n++;
      d.timings.rebuildMaxMs = Math.max(d.timings.rebuildMaxMs ?? 0, dt);
    }
    if (n) {
      d.timings.rebuildMs = ms / n;
      d.counters.rebuilds += n;
      totalMs += ms;
      total += n;
      d.timings.rebuildAvgMs = totalMs / total;
    }
  };
  const rb: Rebuilder = {
    rebuildDirty(region) {
      const t0 = d.now();
      const tex = d.textures.update(region);
      const t1 = d.now();
      const ids = d.mirror.sync(d.world.props, region.props);
      if (region.maxI >= region.minI)
        ids.push(
          ...d.mirror.reground(region.minI - 1, region.maxI + 1, region.minJ - 1, region.maxJ + 1),
        );
      if (ids.length) d.props.rewrite(ids, d.getTime());
      const t2 = d.now();
      d.timings.rebuildTexMs = t1 - t0;
      d.timings.rebuildUploadMs = tex.uploadMs;
      d.timings.rebuildPropsMs = t2 - t1;
      const c = tex.colorRect;
      for (const id of dirtyChunks(region)) enqueue(id, c);
      const g = tex.geometryRect;
      if (g)
        for (const id of chunksOverlapping(g.x, g.x + g.w - 1, g.y, g.y + g.h - 1, 1))
          enqueue(id, c);
      if (c)
        for (const id of chunksOverlapping(c.x, c.x + c.w - 1, c.y, c.y + c.h - 1)) enqueue(id, c);
      if (d.instant) rb.flush();
    },
    update() {
      if (queue.length) drain(perFrame);
    },
    flush() {
      while (queue.length) drain(Infinity);
    },
    get pending() {
      return queue.length;
    },
  };
  return rb;
}
