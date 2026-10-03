import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { Quality } from '../../core/params.ts';
import type { WorldTextures } from '../world-textures.ts';
import { createRain, type RainView } from './rain.ts';
import { createMist, type MistView } from './mist.ts';

/**
 * TASK-172 — weather render side: rain streaks + low mist band. Both are driven
 * entirely by SHARED uniforms (uRain, uMist, uCameraPos, uTime, uWind); `update()`
 * only toggles visibility so a clear day costs 0 draws. Water ripples live in the
 * water shader (uRain).
 */
export interface WeatherView {
  group: THREE.Group;
  rain: RainView;
  mist: MistView;
  /** Call each frame after writeEnvUniforms. */
  update(): void;
}

export function createWeatherView(
  textures: WorldTextures,
  quality: Quality,
  scope: Scope,
): WeatherView {
  const group = new THREE.Group();
  group.name = 'weather';
  const rain = createRain(quality, scope);
  const mist = createMist(textures, quality, scope);
  group.add(rain.mesh, mist.mesh);
  return {
    group,
    rain,
    mist,
    update() {
      rain.update();
      mist.update();
    },
  };
}
