import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { WorldData } from '../../world/types.ts';
import { CHUNK_CELLS, CHUNKS_PER_SIDE } from '../../world/types.ts';
import type { WorldTextures } from '../world-textures.ts';
import type { Quality } from '../../core/params.ts';
import { TERRAIN_LOD } from '../../content/terrain.ts';
import { SHARED } from '../uniforms.ts';
import { buildColorGrid, fillColorGrid } from './terrain-colors.ts';
import {
  addTerrainSurface,
  buildChunkGeometry,
  createVertexColorCache,
  geometryBytes,
  invalidateVertexColors,
  mergeChunkGeometries,
} from './terrain-mesh.ts';
import { createTerrainMaterial } from './terrain-material.ts';
import { makeDepthMaterial } from '../materials/factory.ts';

/**
 * Terrain (ARCHITECTURE §3; M14b D-030, TASK-371). Per 64 u chunk, smooth indexed meshes at the
 * levels of `TERRAIN_LOD.strides` (4 / 2 / 1 / 0.5 u), picked PER CHUNK by camera distance with
 * hysteresis in `update` (not by tier) and geomorphed in the vertex shader so switches never pop.
 * Levels are built lazily: synchronously on the first update and in capture (`instant`), else
 * ≤ `buildsPerFrame` per frame (prefetched ahead of need); 1 u / 0.5 u meshes live in an LRU.
 * An island whose chunks are all at level 0 draws as ONE merged mesh (far views: ~1 call per
 * island instead of one per chunk). One shared material / program; shadow depth shares the
 * props' instanced depth program (chunks and merges are 1-instance InstancedMeshes, D-016).
 *
 * TASK-211: `rebuildChunk` remeshes one chunk's cached levels (and its island merge) from the
 * current world data in place, creates a chunk that became meshable and releases one that
 * became all-deep.
 */
export interface TerrainChunk {
  cx: number;
  cz: number;
  /** Cached mesh per level (null = not built). Level 0 always exists while active. */
  levels: (THREE.InstancedMesh | null)[];
  /** Triangles per cached level. */
  tris: number[];
  /** Level picked by distance (−1 before the first update). */
  level: number;
  /** Level drawn (a coarser cached one while `level` is being built); −1 = merged / hidden. */
  shown: number;
  /** Camera distance to the chunk box at the last update. */
  dist: number;
  /** Surface sample y range (distance box). */
  minY: number;
  maxY: number;
  /** Skirted edges (bits: 1 −z, 2 +z, 4 −x, 8 +x). */
  skirtEdges: number;
  /** False while an edit left the chunk all-deep: meshes released. */
  active: boolean;
  /** Island merge group (index into `TerrainView.merges`). */
  island: number;
  /** Per level: update count when last wanted / drawn (LRU). */
  used: number[];
}

export interface IslandMerge {
  mesh: THREE.InstancedMesh;
  chunks: TerrainChunk[];
  /** Drawn this frame (every active chunk at `mergeLevel`). */
  shown: boolean;
  tris: number;
}

export interface TerrainView {
  group: THREE.Group;
  /** Kept for the world-view tier hook: the LOD no longer follows the tier (TASK-371). */
  onTier(tier: number): void;
  /**
   * Per frame: pick each chunk's level from the camera position (default: `SHARED.uCameraPos`,
   * written by world-view before this runs), build missing levels, swap visibility.
   */
  update(time: number, camera?: THREE.Vector3): void;
  /**
   * Remesh chunk (cx, cz) from the current world data, every cached level + its island merge
   * (TASK-211). `colors`: grid samples whose colour inputs changed (refreshed before meshing,
   * clipped to the chunk); omitted = the whole chunk, null = none (skirt-only rebuilds). Returns
   * the ids of meshed neighbours whose skirt edges changed (the chunk's meshability flipped).
   */
  rebuildChunk(cx: number, cz: number, colors?: SampleRect | null): number[];
  /** Build every needed level synchronously (capture); set by the rebuilder in capture mode. */
  instant: boolean;
  /** Triangles drawn by the current selection. */
  triangles: number;
  /** Bytes of every cached terrain geometry (attributes + indices, merges included). */
  bytes: number;
  /** Level builds still queued (interactive). */
  pending: number;
  chunks: TerrainChunk[];
  merges: IslandMerge[];
  material: THREE.MeshLambertMaterial;
}

/** Inclusive-origin sample rect (x = column, y = row), as `gl-subimage` TexRect. */
export interface SampleRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Chunk needs a mesh: has land / shallow water, or any sample above the deep cutoff. */
export function chunkNeedsMesh(world: WorldData, cx: number, cz: number): boolean {
  if (world.chunkFlags[cz * CHUNKS_PER_SIDE + cx] !== 0) return true;
  const h = world.height;
  const n = h.n;
  for (let iz = cz * CHUNK_CELLS; iz <= (cz + 1) * CHUNK_CELLS; iz++)
    for (let ix = cx * CHUNK_CELLS; ix <= (cx + 1) * CHUNK_CELLS; ix++)
      if (h.data[iz * n + ix] > TERRAIN_LOD.skipBelow) return true;
  return false;
}

/**
 * Level for a chunk at camera distance `dist` (u). `current` < 0 → no history (first pick,
 * capture): plain bands. Else hysteresis: finer below band × (1 − h), coarser above × (1 + h).
 */
export function pickLevel(dist: number, current: number, finest: number): number {
  const B = TERRAIN_LOD.bands;
  if (current < 0) {
    let k = 0;
    while (k < B.length && dist < B[k]) k++;
    return Math.min(k, finest);
  }
  const hy = TERRAIN_LOD.hysteresis;
  let lv = Math.min(current, finest);
  while (lv < finest && dist < B[lv] * (1 - hy)) lv++;
  while (lv > 0 && dist > B[lv - 1] * (1 + hy)) lv--;
  return lv;
}

/** Level worth having cached ahead (interactive prefetch). */
function prefetchLevel(dist: number, finest: number): number {
  const B = TERRAIN_LOD.bands;
  let k = 0;
  while (k < B.length && dist < B[k] * (1 + TERRAIN_LOD.prefetch)) k++;
  return Math.min(k, finest);
}

export function buildTerrain(
  world: WorldData,
  textures: WorldTextures,
  quality: Quality,
  scope: Scope,
): TerrainView {
  const L = TERRAIN_LOD;
  const finest = L.finest[quality];
  const grid = buildColorGrid(world);
  const vcol = createVertexColorCache(world.height.n); // TODO(TASK-372)
  const { material } = createTerrainMaterial(world, textures, quality);
  addTerrainSurface(material, textures.height, world.height);
  scope.add(material);
  // Shadow casting through the props' depth program (D-016): chunks are 1-instance
  // InstancedMeshes (identity instance matrix, exact) so the factory's instanced depth material
  // (no wind / bloom / fade on terrain) replaces three's default non-instanced depth program.
  const depth = scope.add(makeDepthMaterial({}));
  depth.name = 'terrain:depth';
  const group = new THREE.Group();
  group.name = 'terrain';
  const chunks: TerrainChunk[] = [];
  const N = CHUNKS_PER_SIDE;
  const h = world.height;
  const size = CHUNK_CELLS * h.cellSize;
  const byId: (TerrainChunk | undefined)[] = new Array(N * N);
  const meshed = new Uint8Array(N * N);
  for (let cz = 0; cz < N; cz++)
    for (let cx = 0; cx < N; cx++) meshed[cz * N + cx] = chunkNeedsMesh(world, cx, cz) ? 1 : 0;
  // Skirts only where a meshed neighbour could disagree (LOD seams); edges facing
  // skipped deep chunks get none — an edge-on wall there reads as a dotted line.
  const has = (cx: number, cz: number): boolean =>
    cx >= 0 && cz >= 0 && cx < N && cz < N && meshed[cz * N + cx] === 1;
  const edgesOf = (cx: number, cz: number): number =>
    (has(cx, cz - 1) ? 1 : 0) |
    (has(cx, cz + 1) ? 2 : 0) |
    (has(cx - 1, cz) ? 4 : 0) |
    (has(cx + 1, cz) ? 8 : 0);

  const newMesh = (geometry: THREE.BufferGeometry, name: string): THREE.InstancedMesh => {
    const mesh = new THREE.InstancedMesh(geometry, material, 1);
    mesh.name = name;
    mesh.customDepthMaterial = depth;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    group.add(mesh);
    return mesh;
  };
  const setGeometry = (mesh: THREE.InstancedMesh, g: THREE.BufferGeometry): void => {
    mesh.geometry.dispose();
    mesh.geometry = g;
    // InstancedMesh bounds are cached from the first culling test
    mesh.boundingSphere = null;
    mesh.boundingBox = null;
  };
  const releaseMesh = (mesh: THREE.InstancedMesh): void => {
    mesh.geometry.dispose();
    mesh.dispose();
    group.remove(mesh);
  };

  // island merge groups: every chunk belongs to the island it is nearest to (centre − radius)
  const merges: IslandMerge[] = world.islands.map((isl) => ({
    mesh: newMesh(new THREE.BufferGeometry(), `terrain-island-${isl.id}`),
    chunks: [],
    shown: false,
    tris: 0,
  }));
  const islandOf = (cx: number, cz: number): number => {
    const x = h.originX + (cx + 0.5) * size;
    const z = h.originZ + (cz + 0.5) * size;
    let best = 0;
    let bestD = Infinity;
    world.islands.forEach((isl, k) => {
      const d = Math.hypot(x - isl.cx, z - isl.cz) - isl.radius;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    return best;
  };
  const refreshMerge = (g: IslandMerge): void => {
    const parts = g.chunks.filter((c) => c.active).map((c) => c.levels[L.mergeLevel]!.geometry);
    setGeometry(g.mesh, parts.length ? mergeChunkGeometries(parts) : new THREE.BufferGeometry());
    g.tris = g.chunks.reduce((t, c) => t + (c.active ? c.tris[L.mergeLevel] : 0), 0);
  };

  const sampleRange = (c: TerrainChunk): void => {
    const n = h.n;
    let lo = Infinity;
    let hi = -Infinity;
    for (let iz = c.cz * CHUNK_CELLS; iz <= (c.cz + 1) * CHUNK_CELLS; iz++)
      for (let ix = c.cx * CHUNK_CELLS; ix <= (c.cx + 1) * CHUNK_CELLS; ix++) {
        const y = h.data[iz * n + ix];
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
    c.minY = lo;
    c.maxY = hi;
  };

  const buildLevel = (c: TerrainChunk, level: number): void => {
    const { geometry, stats } = buildChunkGeometry(
      world,
      grid,
      c.cx,
      c.cz,
      level,
      c.skirtEdges,
      vcol,
    );
    const m = c.levels[level];
    if (m) setGeometry(m, geometry);
    else c.levels[level] = newMesh(geometry, `terrain-${c.cx}-${c.cz}-l${level}`);
    c.tris[level] = stats.triangles;
  };
  const dropLevel = (c: TerrainChunk, level: number): void => {
    const m = c.levels[level];
    if (!m) return;
    releaseMesh(m);
    c.levels[level] = null;
    c.tris[level] = 0;
  };

  const makeChunk = (cx: number, cz: number): TerrainChunk => {
    const c: TerrainChunk = {
      cx,
      cz,
      levels: L.strides.map(() => null),
      tris: L.strides.map(() => 0),
      level: -1,
      shown: -1,
      dist: Infinity,
      minY: 0,
      maxY: 0,
      skirtEdges: edgesOf(cx, cz),
      active: true,
      island: islandOf(cx, cz),
      used: L.strides.map(() => 0),
    };
    sampleRange(c);
    buildLevel(c, L.mergeLevel);
    chunks.push(c);
    byId[cz * N + cx] = c;
    // row-major order, so a merge rebuilt after edits equals a fresh build's
    const list = merges[c.island].chunks;
    const at = list.findIndex((k) => k.cz * N + k.cx > cz * N + cx);
    list.splice(at < 0 ? list.length : at, 0, c);
    return c;
  };

  let frame = 0;
  let picked = false;
  const queue: [TerrainChunk, number][] = [];

  const view: TerrainView = {
    group,
    chunks,
    merges,
    material,
    instant: false,
    triangles: 0,
    bytes: 0,
    pending: 0,
    onTier() {
      // distance LOD (TASK-371): nothing follows the tier
    },
    update(_time, camera = SHARED.uCameraPos.value) {
      frame++;
      const first = !picked;
      picked = true;
      const sync = first || view.instant;
      const active = chunks.filter((c) => c.active);
      for (const c of active) {
        const x0 = h.originX + c.cx * size;
        const z0 = h.originZ + c.cz * size;
        const dx = Math.max(x0 - camera.x, 0, camera.x - x0 - size);
        const dy = Math.max(c.minY - camera.y, 0, camera.y - c.maxY);
        const dz = Math.max(z0 - camera.z, 0, camera.z - z0 - size);
        c.dist = Math.hypot(dx, dy, dz);
        c.level = pickLevel(c.dist, sync ? -1 : c.level, finest);
      }
      // at most `finestMaxChunks` at the finest level: the nearest keep it
      const fine = active.filter((c) => c.level === L.strides.length - 1);
      if (fine.length > L.finestMaxChunks) {
        fine.sort((a, b) => a.dist - b.dist || a.cz - b.cz || a.cx - b.cx);
        for (const c of fine.slice(L.finestMaxChunks)) c.level--;
      }
      // builds: needed levels first (nearest first), then prefetch
      queue.length = 0;
      for (const c of active) {
        c.used[c.level] = frame;
        if (!c.levels[c.level]) queue.push([c, c.level]);
      }
      if (sync) for (const [c, lv] of queue) buildLevel(c, lv);
      else {
        const need = queue.length;
        for (const c of active) {
          const want = prefetchLevel(c.dist, finest);
          if (want > c.level && !c.levels[want]) {
            c.used[want] = frame;
            queue.push([c, want]);
          }
        }
        const byDist = (a: [TerrainChunk, number], b: [TerrainChunk, number]): number =>
          a[0].dist - b[0].dist || b[1] - a[1];
        const needed = queue.slice(0, need).sort(byDist);
        const ahead = queue.slice(need).sort(byDist);
        const todo = [...needed, ...ahead];
        for (const [c, lv] of todo.slice(0, L.buildsPerFrame)) buildLevel(c, lv);
        view.pending = Math.max(0, todo.length - L.buildsPerFrame);
      }
      // visibility: island merges, else each chunk's level (or the best coarser cached one)
      let tris = 0;
      for (const g of merges) {
        const live = g.chunks.filter((c) => c.active);
        g.shown = live.length > 0 && live.every((c) => c.level === L.mergeLevel);
        g.mesh.visible = g.shown;
        if (g.shown) tris += g.tris;
      }
      for (const c of active) {
        let lv = -1;
        if (!merges[c.island].shown) {
          lv = c.level;
          while (!c.levels[lv]) lv--;
          c.used[lv] = frame;
          tris += c.tris[lv];
        }
        c.shown = lv;
        c.levels.forEach((m, k) => {
          if (m) m.visible = k === lv;
        });
      }
      view.triangles = tris;
      // LRU: evict the least recently used fine levels over the cache caps
      for (let lv = 0; lv < L.strides.length; lv++) {
        const cap = L.cache[lv];
        const cached = active.filter((c) => c.levels[lv]);
        if (cached.length <= cap) continue;
        cached.sort((a, b) => a.used[lv] - b.used[lv] || b.dist - a.dist);
        for (const c of cached.slice(0, cached.length - cap))
          if (c.used[lv] < frame) dropLevel(c, lv);
      }
      countBytes();
    },
    rebuildChunk(cx, cz, colors) {
      const id = cz * N + cx;
      const need = chunkNeedsMesh(world, cx, cz);
      const flipped = (meshed[id] === 1) !== need;
      meshed[id] = need ? 1 : 0;
      const neighbours: number[] = [];
      if (flipped)
        for (const [dx, dz] of NEIGHBOURS) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (has(nx, nz)) neighbours.push(nz * N + nx);
        }
      const c = byId[id];
      if (!need) {
        if (c?.active) {
          for (let lv = 0; lv < L.strides.length; lv++) dropLevel(c, lv);
          c.active = false;
          c.shown = -1;
          refreshMerge(merges[c.island]);
        }
        countBytes();
        return neighbours;
      }
      const x0 = cx * CHUNK_CELLS;
      const z0 = cz * CHUNK_CELLS;
      const rect =
        colors === undefined
          ? [x0, x0 + CHUNK_CELLS, z0, z0 + CHUNK_CELLS]
          : colors
            ? [
                Math.max(x0, colors.x),
                Math.min(x0 + CHUNK_CELLS, colors.x + colors.w - 1),
                Math.max(z0, colors.y),
                Math.min(z0 + CHUNK_CELLS, colors.y + colors.h - 1),
              ]
            : null;
      if (rect) {
        fillColorGrid(world, grid, rect[0], rect[1], rect[2], rect[3]);
        // TODO(TASK-372): the colour cache goes with the `color` attribute
        invalidateVertexColors(vcol, h.n, rect[0], rect[1], rect[2], rect[3]);
      }
      if (!c) {
        refreshMerge(merges[makeChunk(cx, cz).island]);
        countBytes();
        return neighbours;
      }
      c.skirtEdges = edgesOf(cx, cz);
      sampleRange(c);
      if (!c.active) {
        c.active = true;
        c.level = -1;
        buildLevel(c, L.mergeLevel);
      } else for (let lv = 0; lv < L.strides.length; lv++) if (c.levels[lv]) buildLevel(c, lv);
      refreshMerge(merges[c.island]);
      countBytes();
      return neighbours;
    },
  };

  const countBytes = (): void => {
    let b = 0;
    for (const c of chunks) for (const m of c.levels) if (m) b += geometryBytes(m.geometry);
    for (const g of merges) b += geometryBytes(g.mesh.geometry);
    view.bytes = b;
  };

  // The chunk meshes / geometries change during edits: dispose whatever is current (world scope).
  scope.defer(() => {
    for (const c of chunks) for (const m of c.levels) if (m) releaseMesh(m);
    for (const g of merges) releaseMesh(g.mesh);
  });

  for (let cz = 0; cz < N; cz++)
    for (let cx = 0; cx < N; cx++) if (meshed[cz * N + cx]) makeChunk(cx, cz);
  for (const g of merges) refreshMerge(g);
  countBytes();
  return view;
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];
