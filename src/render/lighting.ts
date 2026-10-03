import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { EnvState } from '../env/env-state.ts';
import type { Quality } from '../core/params.ts';
import { QUALITY_PRESETS } from '../core/quality.ts';
import { LIGHT_RIG, SHADOW } from '../content/lighting.ts';
import { fitShadow, type ShadowFit } from './shadows.ts';

/**
 * Light rig (ARCHITECTURE §3 "Sky & lights", ART_BIBLE §3): one DirectionalLight
 * (sun by day, moon at night — EnvState already swaps direction and colour) and
 * one HemisphereLight (blue-violet sky / grass-tinted ground → cool shade in
 * Lambert). The shadow camera is re-fitted to the view every frame.
 */
export interface LightRig {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  group: THREE.Group;
  /** Last shadow fit (debug/HUD). */
  fit: ShadowFit;
  update(env: EnvState, camera: THREE.PerspectiveCamera, focus: THREE.Vector3): void;
}

export function createLightRig(quality: Quality, scope: Scope): LightRig {
  const preset = QUALITY_PRESETS[quality];
  const group = new THREE.Group();
  group.name = 'lights';
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.name = 'sun';
  sun.castShadow = preset.shadows;
  if (preset.shadows) {
    sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    sun.shadow.bias = SHADOW.bias;
    sun.shadow.normalBias = SHADOW.normalBiasMin;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 1200;
  }
  group.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xcfeaff, 0xb9d08a, LIGHT_RIG.hemiDay);
  hemi.name = 'hemi';
  group.add(hemi);
  scope.defer(() => sun.shadow.dispose());

  const maxSize = SHADOW.maxSize[quality] ?? 760;
  const _dir = new THREE.Vector3();
  const fit: ShadowFit = { size: 0, texel: 0, points: 0 };

  return {
    sun,
    hemi,
    group,
    fit,
    update(env, camera, focus) {
      const night = env.night;
      sun.color.setRGB(env.sunColor.r, env.sunColor.g, env.sunColor.b);
      sun.intensity =
        env.sunIntensity * THREE.MathUtils.lerp(LIGHT_RIG.sunScale, LIGHT_RIG.moonScale, night);
      hemi.color.setRGB(env.hemiSky.r, env.hemiSky.g, env.hemiSky.b);
      hemi.groundColor.setRGB(env.hemiGround.r, env.hemiGround.g, env.hemiGround.b);
      hemi.intensity = THREE.MathUtils.lerp(LIGHT_RIG.hemiDay, LIGHT_RIG.hemiNight, night);
      _dir.set(env.sunDir.x, env.sunDir.y, env.sunDir.z).normalize();
      if (preset.shadows) {
        fitShadow(sun, camera, _dir, focus, preset.shadowMapSize, maxSize, fit);
      } else {
        sun.target.position.copy(focus);
        sun.position.copy(focus).addScaledVector(_dir, 400);
      }
    },
  };
}
