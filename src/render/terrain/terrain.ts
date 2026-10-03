import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { WorldData } from '../../world/types.ts';
import { CHUNK_CELLS, CHUNKS_PER_SIDE } from '../../world/types.ts';
import type { WorldTextures } from '../world-textures.ts';
import type { Quality } from '../../core/params.ts';
import { TERRAIN_LOD } from '../../content/terrain.ts';
import { buildColorGrid } from './terrain-colors.ts';
import { buildChunkGeometry } from './terrain-mesh.ts';
import { createTerrainMaterial } from './terrain-material.ts';

/**
 * TASK-102 — terrain mesher (ARCHITECTURE §3, ART_BIBLE §1/§2). Per-chunk
 * (32×32 cells) faceted meshes at LOD0 = 2 u and LOD1 = 4 u, both built up
 * front; `onTier` swaps visibility. One shared material / program.
 */
export interface TerrainChunk {
  cx: number;
  cz: number;
  lods: [THREE.Mesh, THREE.Mesh];
  /** Lowest vertex y including skirts. */
  minY: number;
  /** Skirted edges (bits: 1 −z, 2 +z, 4 −x, 8 +x). */
  skirtEdges: number;
}

export interface TerrainView {
  group: THREE.Group;
  /** Called on tier change: swap LOD buffers (once per transition). */
  onTier(tier: number): void;
  /** Per-frame uniforms (wet sand lap, etc.). */
  update(time: number): void;
  /** LOD0 triangle total. */
  triangles: number;
  /** LOD1 triangle total. */
  trianglesLod1: number;
  chunks: TerrainChunk[];
  material: THREE.MeshLambertMaterial;
  /** Currently visible LOD (0 or 1). */
  lod: number;
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
  const group = new THREE.Group();
  group.name = 'terrain';
  const chunks: TerrainChunk[] = [];
  let tri0 = 0;
  let tri1 = 0;
  const N = CHUNKS_PER_SIDE;
  const meshed = new Uint8Array(N * N);
  for (let cz = 0; cz < N; cz++)
    for (let cx = 0; cx < N; cx++) meshed[cz * N + cx] = chunkNeedsMesh(world, cx, cz) ? 1 : 0;
  // Skirts only where a meshed neighbour could disagree (LOD seams); edges facing
  // skipped deep chunks get none — an edge-on wall there reads as a dotted line.
  const has = (cx: number, cz: number): boolean =>
    cx >= 0 && cz >= 0 && cx < N && cz < N && meshed[cz * N + cx] === 1;
  for (let cz = 0; cz < N; cz++) {
    for (let cx = 0; cx < N; cx++) {
      if (!meshed[cz * N + cx]) continue;
      const edges =
        (has(cx, cz - 1) ? 1 : 0) |
        (has(cx, cz + 1) ? 2 : 0) |
        (has(cx - 1, cz) ? 4 : 0) |
        (has(cx + 1, cz) ? 8 : 0);
      let minY = Infinity;
      const mk = (lod: number): THREE.Mesh => {
        const { geometry, stats } = buildChunkGeometry(world, grid, cx, cz, lod, edges);
        scope.add(geometry);
        if (lod === 0) tri0 += stats.triangles;
        else tri1 += stats.triangles;
        minY = Math.min(minY, stats.minY);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `terrain-${cx}-${cz}-lod${lod}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.visible = lod === 0;
        group.add(mesh);
        return mesh;
      };
      const lods: [THREE.Mesh, THREE.Mesh] = [mk(0), mk(1)];
      chunks.push({ cx, cz, lods, minY, skirtEdges: edges });
    }
  }

  const view: TerrainView = {
    group,
    chunks,
    material,
    triangles: tri0,
    trianglesLod1: tri1,
    lod: 0,
    onTier(tier: number) {
      const lod = tier <= 0 ? 1 : 0;
      view.lod = lod;
      for (const c of chunks) {
        c.lods[0].visible = lod === 0;
        c.lods[1].visible = lod === 1;
      }
    },
    update() {
      // all animated terms read SHARED.uTime directly
    },
  };
  return view;
}
