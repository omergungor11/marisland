import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { WorldData } from '../../world/types.ts';
import type { Quality } from '../../core/params.ts';
import type { EnvState } from '../../env/env-state.ts';

/**
 * TASK-153 — clouds + aligned cloud shadows. STUB: nothing rendered; the shader
 * agent replaces this. `shadowMask` is the uniform the terrain/water sample for
 * cloud shadows (0 = no texture → no shadow).
 */
export interface CloudsView {
  group: THREE.Group;
  update(time: number, env: EnvState, cameraPos: THREE.Vector3, tier: number): void;
  /** Cloud-shadow mask parameters for terrain/water (xy = wind drift offset, z = coverage, w = density). */
  shadowParams: { value: THREE.Vector4 };
}

export function createClouds(world: WorldData, quality: Quality, scope: Scope): CloudsView {
  void world;
  void quality;
  void scope;
  return {
    group: new THREE.Group(),
    update: () => {},
    shadowParams: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
}
