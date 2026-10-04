import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { WorldData } from '../../world/types.ts';
import { CHUNK_CELLS, CHUNKS_PER_SIDE } from '../../world/types.ts';
import type { WorldTextures } from '../world-textures.ts';
import type { Quality } from '../../core/params.ts';
import { TERRAIN_LOD } from '../../content/terrain.ts';
import { buildColorGrid, fillColorGrid } from './terrain-colors.ts';
import { buildChunkGeometry } from './terrain-mesh.ts';
import { createTerrainMaterial } from './terrain-material.ts';
import { makeDepthMaterial } from '../materials/factory.ts';

/**
 * TASK-102 — terrain mesher (ARCHITECTURE §3, ART_BIBLE §1/§2). Per-chunk
 * (32×32 cells) faceted meshes at LOD0 = 2 u and LOD1 = 4 u, both built up
 * front; `onTier` swaps visibility. One shared material / program; shadow depth shares the
 * props' instanced depth program (chunks are 1-instance InstancedMeshes).
 *
 * TASK-211: `rebuildChunk` remeshes one chunk from the current world data in place (new
 * geometry on the same mesh objects; the old geometry is disposed), creates the meshes of a
 * chunk that became meshable and hides + releases one that became all-deep.
 */
export interface TerrainChunk {
  cx: number;
  cz: number;
  lods: [THREE.Mesh, THREE.Mesh];
  /** Lowest vertex y including skirts. */
  minY: number;
  /** Skirted edges (bits: 1 −z, 2 +z, 4 −x, 8 +x). */
  skirtEdges: number;
  /** False while an edit left the chunk all-deep: meshes hidden, geometry released. */
  active: boolean;
  /** Triangles per LOD (for the view totals). */
  tris: [number, number];
}

export interface TerrainView {
  group: THREE.Group;
  /** Called on tier change: swap LOD buffers (once per transition). */
  onTier(tier: number): void;
  /** Per-frame uniforms (wet sand lap, etc.). */
  update(time: number): void;
  /**
   * Remesh chunk (cx, cz) from the current world data, all LODs (TASK-211). `colors`: grid
   * samples whose colour inputs changed (refreshed before meshing, clipped to the chunk);
   * omitted = the whole chunk, null = none (skirt-only rebuilds). Returns the ids of meshed
   * neighbours whose skirt edges changed (the chunk's meshability flipped) — remesh those too.
   */
  rebuildChunk(cx: number, cz: number, colors?: SampleRect | null): number[];
  /** LOD0 triangle total. */
  triangles: number;
  /** LOD1 triangle total. */
  trianglesLod1: number;
  chunks: TerrainChunk[];
  material: THREE.MeshLambertMaterial;
  /** Currently visible LOD (0 or 1). */
  lod: number;
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

export function buildTerrain(
  world: WorldData,
  textures: WorldTextures,
  quality: Quality,
  scope: Scope,
): TerrainView {
  const grid = buildColorGrid(world);
  const { material } = createTerrainMaterial(world, textures, quality);
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
  // Never uploaded: an all-deep chunk's hidden meshes point at it after an edit.
  const empty = new THREE.BufferGeometry();
  empty.name = 'terrain:empty';
  // The chunk meshes / geometries change during edits: dispose whatever is current (world scope).
  scope.defer(() => {
    for (const c of chunks)
      for (const m of c.lods) {
        if (m.geometry !== empty) m.geometry.dispose();
        (m as THREE.InstancedMesh).dispose();
      }
    empty.dispose();
  });

  const view: TerrainView = {
    group,
    chunks,
    material,
    triangles: 0,
    trianglesLod1: 0,
    lod: 0,
    onTier(tier: number) {
      const lod = tier <= 0 ? 1 : 0;
      view.lod = lod;
      for (const c of chunks) {
        c.lods[0].visible = c.active && lod === 0;
        c.lods[1].visible = c.active && lod === 1;
      }
    },
    update() {
      // all animated terms read SHARED.uTime directly
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
          for (let lod = 0; lod < 2; lod++) {
            const m = c.lods[lod];
            if (m.geometry !== empty) m.geometry.dispose();
            m.geometry = empty;
            m.visible = false;
          }
          view.triangles -= c.tris[0];
          view.trianglesLod1 -= c.tris[1];
          c.tris = [0, 0];
          c.active = false;
        }
        return neighbours;
      }
      const x0 = cx * CHUNK_CELLS;
      const z0 = cz * CHUNK_CELLS;
      if (colors === undefined)
        fillColorGrid(world, grid, x0, x0 + CHUNK_CELLS, z0, z0 + CHUNK_CELLS);
      else if (colors)
        fillColorGrid(
          world,
          grid,
          Math.max(x0, colors.x),
          Math.min(x0 + CHUNK_CELLS, colors.x + colors.w - 1),
          Math.max(z0, colors.y),
          Math.min(z0 + CHUNK_CELLS, colors.y + colors.h - 1),
        );
      if (!c) {
        makeChunk(cx, cz);
        return neighbours;
      }
      const edges = edgesOf(cx, cz);
      let minY = Infinity;
      for (let lod = 0; lod < 2; lod++) {
        const { geometry, stats } = buildChunkGeometry(world, grid, cx, cz, lod, edges);
        const m = c.lods[lod];
        if (m.geometry !== empty) m.geometry.dispose();
        m.geometry = geometry;
        if (lod === 0) view.triangles += stats.triangles - c.tris[0];
        else view.trianglesLod1 += stats.triangles - c.tris[1];
        c.tris[lod] = stats.triangles;
        minY = Math.min(minY, stats.minY);
      }
      c.minY = minY;
      c.skirtEdges = edges;
      c.active = true;
      c.lods[0].visible = view.lod === 0;
      c.lods[1].visible = view.lod === 1;
      return neighbours;
    },
  };

  const makeChunk = (cx: number, cz: number): TerrainChunk => {
    const edges = edgesOf(cx, cz);
    let minY = Infinity;
    const tris: [number, number] = [0, 0];
    const mk = (lod: number): THREE.Mesh => {
      const { geometry, stats } = buildChunkGeometry(world, grid, cx, cz, lod, edges);
      tris[lod] = stats.triangles;
      minY = Math.min(minY, stats.minY);
      const mesh = new THREE.InstancedMesh(geometry, material, 1);
      mesh.name = `terrain-${cx}-${cz}-lod${lod}`;
      mesh.customDepthMaterial = depth;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.visible = lod === view.lod;
      group.add(mesh);
      return mesh;
    };
    const lods: [THREE.Mesh, THREE.Mesh] = [mk(0), mk(1)];
    const c: TerrainChunk = { cx, cz, lods, minY, skirtEdges: edges, active: true, tris };
    view.triangles += tris[0];
    view.trianglesLod1 += tris[1];
    chunks.push(c);
    byId[cz * N + cx] = c;
    return c;
  };

  for (let cz = 0; cz < N; cz++)
    for (let cx = 0; cx < N; cx++) if (meshed[cz * N + cx]) makeChunk(cx, cz);
  return view;
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];
