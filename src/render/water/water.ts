import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { WorldData } from '../../world/types.ts';
import type { WorldTextures } from '../world-textures.ts';
import type { Quality } from '../../core/params.ts';
import { WATER } from '../../content/palette.ts';

/**
 * TASK-103 — water. STUB until the shader agent lands it: a flat mid-blue plane.
 */
export interface WaterView {
  mesh: THREE.Mesh;
  /** Re-centre the radial grid on the camera (snapped) and push time. */
  update(cameraPos: THREE.Vector3, time: number): void;
  /** Splat a wake/ripple into the foam-trail texture (M6). */
  splat(x: number, z: number, radius: number, strength: number): void;
}

export function createWater(
  world: WorldData,
  textures: WorldTextures,
  quality: Quality,
  scope: Scope,
): WaterView {
  void world;
  void textures;
  void quality;
  const geo = scope.add(new THREE.PlaneGeometry(6000, 6000, 1, 1));
  geo.rotateX(-Math.PI / 2);
  const mat = scope.add(new THREE.MeshLambertMaterial({ color: new THREE.Color(WATER.mid) }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 10;
  return {
    mesh,
    update(cameraPos) {
      mesh.position.set(cameraPos.x, 0, cameraPos.z);
    },
    splat: () => {},
  };
}
