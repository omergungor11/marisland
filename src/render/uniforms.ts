import * as THREE from 'three';
import type { EnvState } from '../env/env-state.ts';
import { GUST, SWELL } from '../content/anim.ts';

/**
 * Shared uniform objects (ARCHITECTURE §7): every material references these same
 * objects, so EnvState costs one write per frame. Add to a ShaderMaterial with
 * `uniforms: { ...SHARED }` (same object references, not copies) or read them
 * inside onBeforeCompile via `shader.uniforms.uX = SHARED.uX`.
 */
export const SHARED = {
  /** Render time in seconds (clock.time). All GPU motion derives from this. */
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uSunIntensity: { value: 3 },
  uHemiSky: { value: new THREE.Color(1, 1, 1) },
  uHemiGround: { value: new THREE.Color(1, 1, 1) },
  uZenith: { value: new THREE.Color(0.2, 0.5, 0.9) },
  uHorizon: { value: new THREE.Color(0.8, 0.9, 1) },
  uFogColor: { value: new THREE.Color(0.8, 0.9, 1) },
  /** Exponential fog density (ART_BIBLE §3: ≈10 % at 200 u → d ≈ 0.00053). */
  uFogDensity: { value: 0.00053 },
  uShadowTint: { value: new THREE.Color(0.35, 0.4, 0.7) },
  uNight: { value: 0 },
  uGolden: { value: 0 },
  /** xy = wind direction unit vector, z = strength, w = gust wavelength. */
  uWind: { value: new THREE.Vector4(1, 0, GUST.strength, GUST.wavelength) },
  uGustSpeed: { value: GUST.speed },
  /** x = amplitude, y = period. */
  uSwell: { value: new THREE.Vector2(SWELL.amplitude, SWELL.period) },
  uCameraPos: { value: new THREE.Vector3() },
  /** Current tier 0–3 as a float, for tier-dependent shader tweaks. */
  uTier: { value: 0 },
  /** 1 while reduced motion is on → wind/swell × 0.3. */
  uMotionScale: { value: 1 },
  /** Debug mask mode: 0 = off, 1 = semantic mask. */
  uDebugMask: { value: 0 },
  /** Cloud shadows (TASK-153, chunks/cloud-shadow.glsl.ts): xy = wind offset, z = coverage (0 = off), w = strength. */
  uCloudShadow: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** xy = −sunDir.xz / sunDir.y (ground offset per u of altitude), zw = cloud window centre. */
  uCloudSun: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** x = salt, y = active-cell threshold, z = cell size, w = cells. */
  uCloudSeed: { value: new THREE.Vector4(0, 0, 180, 4) },
  /** Weather (TASK-172): rain amount 0..1 (streaks + water ripple rings). */
  uRain: { value: 0 },
  /** Weather: low mist band strength 0..1. */
  uMist: { value: 0 },
  /** Weather: global saturation delta read by the grade (−0.2 rain). Uniform instance so pmndrs can share it. */
  uWeatherSat: new THREE.Uniform(0),
};

/** Base wind strength / swell amplitude (before weather scaling). */
const base: { wind: number; swell: number } = { wind: GUST.strength, swell: SWELL.amplitude };

export type SharedUniforms = typeof SHARED;

export function writeEnvUniforms(
  env: EnvState,
  time: number,
  cameraPos: THREE.Vector3,
  tier: number,
): void {
  SHARED.uTime.value = time;
  SHARED.uSunDir.value.set(env.sunDir.x, env.sunDir.y, env.sunDir.z);
  SHARED.uSunColor.value.setRGB(env.sunColor.r, env.sunColor.g, env.sunColor.b);
  SHARED.uSunIntensity.value = env.sunIntensity;
  SHARED.uHemiSky.value.setRGB(env.hemiSky.r, env.hemiSky.g, env.hemiSky.b);
  SHARED.uHemiGround.value.setRGB(env.hemiGround.r, env.hemiGround.g, env.hemiGround.b);
  SHARED.uZenith.value.setRGB(env.zenith.r, env.zenith.g, env.zenith.b);
  SHARED.uHorizon.value.setRGB(env.horizon.r, env.horizon.g, env.horizon.b);
  SHARED.uFogColor.value.setRGB(env.fog.r, env.fog.g, env.fog.b);
  SHARED.uShadowTint.value.setRGB(env.shadowTint.r, env.shadowTint.g, env.shadowTint.b);
  SHARED.uNight.value = env.night;
  SHARED.uGolden.value = env.golden;
  SHARED.uCameraPos.value.copy(cameraPos);
  SHARED.uTier.value = tier;
  SHARED.uRain.value = env.rain;
  SHARED.uMist.value = env.mist;
  SHARED.uWeatherSat.value = env.saturation;
  SHARED.uWind.value.z = base.wind * env.gustScale;
  SHARED.uSwell.value.x = base.swell * env.swellScale;
}

export function setWind(dir: number, strength: number): void {
  base.wind = strength;
  SHARED.uWind.value.set(Math.cos(dir), Math.sin(dir), strength, GUST.wavelength);
}
