import * as THREE from 'three';
import type { EnvState } from '../env/env-state.ts';
import { mistColor, morningMist, type WeatherFx } from '../env/weather.ts';
import { MIST, MORNING_MIST } from '../content/weather.ts';
import { GUST, SWELL } from '../content/anim.ts';
import { POOLS } from '../content/lighting.ts';

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
  /** Weather cloud cover (TASK-172): x = partial-cell threshold, y = its footprint scale. */
  uCloudCover: { value: new THREE.Vector2(0, 0) },
  // ---- sky bodies & night lights (TASK-171)
  /** True sun direction for the sky disc (may be below the horizon; uSunDir is the key light). */
  uSunSkyDir: { value: new THREE.Vector3(0, 1, 0) },
  /** True moon direction (sky disc, water glitter streak). The night key light (uSunDir) is the
   * art-directed MOON.nightKey, not this. */
  uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
  /** x = moon visibility, y = star alpha, z = night bloom ramp (0..1 each). */
  uSkyNight: { value: new THREE.Vector3(0, 0, 0) },
  /** x = lamps on 0..1 (instances stagger inside the ramp), y = late switch-off 0..1, z = beam. */
  uLamps: { value: new THREE.Vector3(0, 0, 0) },
  /** Lantern-pool texture (RG8: R light, G ground height / POOL_HEIGHT_RANGE), per world. */
  uPoolTex: { value: null as THREE.Texture | null },
  /** xy = pool texture origin (world xz), z = 1 / extent (u), w = 1 when a pool texture is bound. */
  uPoolMap: { value: new THREE.Vector4(0, 0, 1, 0) },
  /** Lantern-pool light colour (linear, content POOLS.color). */
  uPoolColor: { value: new THREE.Color(POOLS.color) },
  // ---- weather (TASK-172; all zero / neutral while the weather is fully clear)
  /** x = rain 0..1 (water ripples), y = overcast veil 0..1 (sun disc, glints), z = sky fog-band
   *  widening (sin elevation), w = lighthouse beam boost (+). */
  uWeather: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** Low mist band (chunks/mist.glsl.ts): x = density at sea level (1/u, 0 = off), y = 1/height,
   *  zw = noise drift offset (u). */
  uMist: { value: new THREE.Vector4(0, 1, 0, 0) },
  /** Mist colour (linear; the mist hue at the fog colour's luminance). */
  uMistColor: { value: new THREE.Color(1, 1, 1) },
  /** Mist cap 0..1. */
  uMistMax: { value: 0 },
  /** Post-grade weather saturation delta (read by the composer in JS; not a shader uniform). */
  uWeatherGrade: { value: 0 },
};

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
  SHARED.uSunSkyDir.value.set(env.sunSkyDir.x, env.sunSkyDir.y, env.sunSkyDir.z);
  SHARED.uMoonDir.value.set(env.moonDir.x, env.moonDir.y, env.moonDir.z);
  SHARED.uSkyNight.value.set(env.moonVis, env.starAlpha, env.bloom);
  SHARED.uLamps.value.set(env.lamps, env.lampsLateOff, env.beam);
}

/** Weather → shared uniforms (TASK-172). Neutral values when `fx` is fully clear. */
export function writeWeatherUniforms(
  fx: WeatherFx,
  env: EnvState,
  windDir: number,
  time: number,
): void {
  SHARED.uWeather.value.set(fx.rain, fx.veil, fx.fogBand, fx.beam);
  // morning ground mist (W7): a thin band in clear / cloudy mornings; the weather mist wins
  const mm = morningMist(env.hour, fx.weights);
  const morning = mm * MORNING_MIST.density > fx.mist;
  const density = morning ? mm * MORNING_MIST.density : fx.mist;
  const height = morning ? MORNING_MIST.height : fx.mistHeight;
  const mistOn = density > 0;
  const drift = time * MIST.drift;
  SHARED.uMist.value.set(
    density,
    1 / Math.max(height, 1e-3),
    mistOn ? -Math.cos(windDir) * drift : 0,
    mistOn ? -Math.sin(windDir) * drift : 0,
  );
  SHARED.uMistMax.value = morning ? Math.max(fx.mistMax, mm * MORNING_MIST.max) : fx.mistMax;
  if (mistOn) {
    mistColor(env, _mist);
    SHARED.uMistColor.value.setRGB(_mist.r, _mist.g, _mist.b);
  }
  SHARED.uWeatherGrade.value = fx.saturation;
  SHARED.uSwell.value.x = SWELL.amplitude * fx.swell;
}
const _mist = { r: 1, g: 1, b: 1 };

export function setWind(dir: number, strength: number): void {
  SHARED.uWind.value.set(Math.cos(dir), Math.sin(dir), strength, GUST.wavelength);
}
