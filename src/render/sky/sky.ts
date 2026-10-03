import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { EnvState } from '../../env/env-state.ts';

/**
 * TASK-104 — sky dome + fog. STUB: scene background = horizon colour, exponential fog.
 */
export interface SkyView {
  mesh: THREE.Object3D | null;
  update(env: EnvState, cameraPos: THREE.Vector3): void;
  /** Scene fog object to assign (null on the stub means scene.background only). */
  fog: THREE.FogExp2;
}

export function createSky(scene: THREE.Scene, scope: Scope): SkyView {
  const fog = new THREE.FogExp2(0xd6eef7, 0.00053);
  scene.fog = fog;
  scene.background = new THREE.Color(0xcdefff);
  scope.defer(() => {
    scene.fog = null;
    scene.background = null;
  });
  return {
    mesh: null,
    fog,
    update(env) {
      fog.color.setRGB(env.fog.r, env.fog.g, env.fog.b);
      (scene.background as THREE.Color).setRGB(env.horizon.r, env.horizon.g, env.horizon.b);
    },
  };
}
