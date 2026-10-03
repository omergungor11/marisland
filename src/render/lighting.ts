import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { EnvState } from '../env/env-state.ts';
import type { Quality } from '../core/params.ts';
import { QUALITY_PRESETS } from '../core/quality.ts';

/**
 * TASK-104 — light rig. STUB: sun + hemisphere driven by EnvState; shadow camera
 * is a fixed box (the fitted-frustum version replaces `update`).
 */
export interface LightRig {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  group: THREE.Group;
  update(env: EnvState, camera: THREE.PerspectiveCamera, focus: THREE.Vector3): void;
}

export function createLightRig(quality: Quality, scope: Scope): LightRig {
  const preset = QUALITY_PRESETS[quality];
  const group = new THREE.Group();
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = preset.shadows;
  if (preset.shadows) {
    sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.04;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 1200;
  }
  group.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xcfeaff, 0xb9d08a, 1.2);
  group.add(hemi);
  scope.defer(() => sun.shadow.dispose());
  const _dir = new THREE.Vector3();
  return {
    sun,
    hemi,
    group,
    update(env, _camera, focus) {
      sun.color.setRGB(env.sunColor.r, env.sunColor.g, env.sunColor.b);
      sun.intensity = env.sunIntensity;
      hemi.color.setRGB(env.hemiSky.r, env.hemiSky.g, env.hemiSky.b);
      hemi.groundColor.setRGB(env.hemiGround.r, env.hemiGround.g, env.hemiGround.b);
      _dir.set(env.sunDir.x, env.sunDir.y, env.sunDir.z);
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(_dir, 400);
      const half = 260;
      const c = sun.shadow.camera;
      c.left = -half;
      c.right = half;
      c.top = half;
      c.bottom = -half;
      c.updateProjectionMatrix();
    },
  };
}
