import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { WorldData } from '../../world/types.ts';
import type { WorldTextures } from '../world-textures.ts';
import type { Quality } from '../../core/params.ts';

/**
 * TASK-102 — terrain mesher. STUB until the shader agent lands it: one flat-shaded
 * mesh built from the heightfield so the pipeline runs end to end.
 */
export interface TerrainView {
  group: THREE.Group;
  /** Called on tier change: swap LOD buffers (once per transition). */
  onTier(tier: number): void;
  /** Per-frame uniforms (wet sand lap, etc.). */
  update(time: number): void;
  triangles: number;
}

export function buildTerrain(
  world: WorldData,
  textures: WorldTextures,
  quality: Quality,
  scope: Scope,
): TerrainView {
  void textures;
  void quality;
  const h = world.height;
  const n = h.n;
  const step = 2; // sample every 2nd point for the stub (4 u)
  const cells = Math.floor((n - 1) / step);
  const geo = new THREE.PlaneGeometry(
    cells * step * h.cellSize,
    cells * step * h.cellSize,
    cells,
    cells,
  );
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const ix = Math.round((x - h.originX) / h.cellSize);
    const iz = Math.round((z - h.originZ) / h.cellSize);
    const cx = Math.min(Math.max(ix, 0), n - 1);
    const cz = Math.min(Math.max(iz, 0), n - 1);
    pos.setY(i, h.data[cz * n + cx]);
  }
  geo.translate(
    h.originX + (cells * step * h.cellSize) / 2,
    0,
    h.originZ + (cells * step * h.cellSize) / 2,
  );
  const nonIndexed = geo.toNonIndexed();
  geo.dispose();
  nonIndexed.computeVertexNormals();
  const colors = new Float32Array(nonIndexed.attributes.position.count * 3);
  const p = nonIndexed.attributes.position as THREE.BufferAttribute;
  const sand = new THREE.Color('#F7E1AE');
  const grass = new THREE.Color('#7BC950');
  const rock = new THREE.Color('#8A909C');
  const sea = new THREE.Color('#E3BE84');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const c = y < 0 ? sea : y < 1.2 ? sand : y > 9 ? rock : grass;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  scope.add(nonIndexed);
  const mat = scope.add(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const mesh = new THREE.Mesh(nonIndexed, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return {
    group,
    onTier: () => {},
    update: () => {},
    triangles: p.count / 3,
  };
}
