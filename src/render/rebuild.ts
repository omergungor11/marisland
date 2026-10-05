import type { WorldData } from '../world/types.ts';
import { CHUNK_CELLS, CHUNKS_PER_SIDE } from '../world/types.ts';
import { PropFlag } from '../world/prop-store.ts';
import type { DirtyRegion } from '../world/edit-types.ts';
import type { Counters } from '../capture/api.ts';
import { EDIT_RENDER } from '../content/edit.ts';
import type { TerrainView } from './terrain/terrain.ts';
import type { WorldTextures } from './world-textures.ts';
import type { PropBatcher } from './props/batcher.ts';
import type { PropMirror } from './props/prop-mirror.ts';
import {
  unionRect,
  uploadTextureRect,
  type SubImageRenderer,
  type TexRect,
} from './gl-subimage.ts';

/**
 * Dirty-region rebuild after an edit (TASK-211, ARCHITECTURE Phase 2). Per region:
 * 1. height / SDF (+ ring scale) / zone textures: changed texels only, `texSubImage2D`;
 * 2. props: touched world indices mirrored into the render store, ground-following settlement
 *    props re-grounded, `PropBatcher.rewrite` (matrices, removal fades, appends);
 * 3. terrain chunks: queued (region chunks ∪ chunks within `chunkPadCells` of the bounds ∪
 *    chunks under the samples whose colour inputs changed — `TextureUpdateStats.colorRect`) and
 *    remeshed ≤ `EDIT_RENDER.chunksPerFrame` per frame in `update` — or all at once in capture.
 *    A remesh covers every cached LOD level of the chunk and its island merge (TASK-371).
 *    Each chunk refreshes only its colour samples inside the accumulated colour rect.
 * Results depend only on the world data (no clocks / randomness): a rebuilt chunk equals the same
 * chunk built at boot from the edited world.
 *
 * TASK-213: prop listeners (`onProps`) see the touched render indices right before
 * (`before`: e.g. stop click reactions that would restore a stale matrix) and right after the
 * batcher rewrite (`after`: picking proxies, lantern pools). `prewarm` runs the whole path once
 * on unchanged data (JIT + GL sub-image path hot before the first real edit).
 */
export interface PropsListener {
  before?(indices: readonly number[]): void;
  after(indices: readonly number[]): void;
}
export interface Rebuilder {
  rebuildDirty(region: DirtyRegion): void;
  /** Per frame: remesh up to `chunksPerFrame` queued chunks. */
  update(): void;
  /** Remesh every queued chunk now. */
  flush(): void;
  /** Queued chunk count. */
  readonly pending: number;
  /** Subscribe to prop rewrites (TASK-213); returns the unsubscribe. */
  onProps(l: PropsListener): () => void;
  /**
   * TASK-213: run the rebuild path once without changing anything — texture scan of one chunk,
   * the ring-scale re-derivation (scratch copies), one prop re-sync, a remesh of the chunk under
   * (x, z) (or the first meshed chunk) and 1×1 sub-image uploads — so the first live edit does
   * not pay the cold JIT / GL path. Identical data in, identical buffers out: no frame changes.
   * `between` runs between the steps (e.g. wait for the next idle period); resolving `false`
   * aborts (world torn down). Resolves to the time spent in the steps (ms).
   */
  prewarm(x: number, z: number, between?: () => Promise<boolean> | boolean): Promise<number>;
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
  /** Sub-image uploads (prewarm); null → the prewarm skips the GL call. */
  renderer?: SubImageRenderer | null;
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
  // capture (`freeze=1`): terrain LOD levels are built synchronously too (TASK-371)
  if (d.instant) d.terrain.instant = true;
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
  const listeners: PropsListener[] = [];
  const rewriteProps = (ids: readonly number[]): void => {
    for (const l of listeners) l.before?.(ids);
    d.props.rewrite(ids, d.getTime());
    for (const l of listeners) l.after(ids);
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
      if (ids.length) rewriteProps(ids);
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
    onProps(l) {
      listeners.push(l);
      return () => {
        const k = listeners.indexOf(l);
        if (k >= 0) listeners.splice(k, 1);
      };
    },
    async prewarm(x, z, between) {
      const w = d.world;
      const h = w.height;
      // the meshed chunk under (x, z), else the first meshed one
      const ci = Math.floor((x - h.originX) / h.cellSize / CHUNK_CELLS);
      const cj = Math.floor((z - h.originZ) / h.cellSize / CHUNK_CELLS);
      const want = ci >= 0 && cj >= 0 && ci < N && cj < N ? cj * N + ci : -1;
      const chunk =
        d.terrain.chunks.find((c) => c.active && c.cz * N + c.cx === want) ??
        d.terrain.chunks.find((c) => c.active);
      if (!chunk) return 0;
      const i0 = chunk.cx * CHUNK_CELLS;
      const j0 = chunk.cz * CHUNK_CELLS;
      const mid = CHUNK_CELLS / 2;
      const steps: (() => void)[] = [
        // texture scan (heights, zones, SDF + ring flips): nothing changed → nothing uploaded
        () =>
          void d.textures.update({
            chunks: [],
            minI: i0 + mid,
            maxI: i0 + mid,
            minJ: j0 + mid,
            maxJ: j0 + mid,
            props: [],
            sdf: true,
          }),
        // the ring-scale re-derivation a coast change runs (scratch copies only)
        () => d.textures.prewarm(i0 + mid, j0 + mid),
        // one live world prop re-synced and rewritten in place (same values → same matrices)
        () => {
          const s = w.props;
          for (let i = 0; i < Math.min(s.count, d.mirror.editBase); i++) {
            if (s.flags[i] & PropFlag.removed) continue;
            rewriteProps(d.mirror.sync(s, [i]));
            break;
          }
        },
        // remesh with every colour refreshed: identical data → identical buffers (new upload)
        () => void d.terrain.rebuildChunk(chunk.cx, chunk.cz),
        // one texSubImage2D of an unchanged texel per world texture (R16F, RG16F, R8: the
        // first sub-image update of each format pays a driver stall)
        ...[d.textures.height, d.textures.sdf, d.textures.zone].map(
          (tex) => () =>
            void uploadTextureRect(d.renderer ?? null, tex, { x: i0, y: j0, w: 1, h: 1 }),
        ),
      ];
      let ms = 0;
      for (const [k, step] of steps.entries()) {
        if (k > 0 && between && !(await between())) return ms;
        const t0 = d.now();
        step();
        const dt = d.now() - t0;
        d.timings[`editPrewarmStep${k}Ms`] = dt;
        ms += dt;
      }
      d.timings.editPrewarmMs = ms;
      return ms;
    },
  };
  return rb;
}
