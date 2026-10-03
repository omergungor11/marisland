import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { EnvState } from '../../env/env-state.ts';
import { FOG, SKY } from '../../content/lighting.ts';
import { SHARED } from '../uniforms.ts';
import { SKY_FRAG, SKY_VERT } from './sky.glsl.ts';
import { WEATHER_SKY } from '../../content/weather.ts';

/**
 * Sky dome + fog (ARCHITECTURE §3 "Sky & lights", ART_BIBLE §3). A camera-
 * following BackSide sphere drawn first (no depth), gradient fog → horizon →
 * zenith, a blooming sun disc by day, a moon disc and hashed stars at night.
 * At the horizon (and below) the dome equals the fog colour, so fogged sea and
 * far islands melt into it with no line.
 *
 * Tone mapping: the dome ends with <tonemapping_fragment>/<colorspace_fragment>;
 * three resolves them per render target, so on low (no composer) it is tone
 * mapped + sRGB-encoded by the renderer and inside the composer it outputs
 * linear HDR — no quality switch needed.
 */
export interface SkyView {
  mesh: THREE.Object3D | null;
  update(env: EnvState, cameraPos: THREE.Vector3): void;
  /** Scene fog object (FogExp2, density from content/lighting FOG). */
  fog: THREE.FogExp2;
}

export function createSky(scene: THREE.Scene, scope: Scope): SkyView {
  const fog = new THREE.FogExp2(0xd6eef7, FOG.density);
  scene.fog = fog;
  SHARED.uFogDensity.value = FOG.density;
  scene.background = new THREE.Color(0xd6eef7);

  const geo = scope.add(new THREE.SphereGeometry(SKY.radius, 48, 24));
  const sunDim = { value: 1 };
  const rad = THREE.MathUtils.DEG2RAD;
  const mat = scope.add(
    new THREE.ShaderMaterial({
      name: 'mar-sky',
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uZenith: SHARED.uZenith,
        uHorizon: SHARED.uHorizon,
        uFogColor: SHARED.uFogColor,
        uSunDir: SHARED.uSunDir,
        uSunColor: SHARED.uSunColor,
        uNight: SHARED.uNight,
        uTime: SHARED.uTime,
        uDebugMask: SHARED.uDebugMask,
        uSunRadius: { value: SKY.sunDiscDeg * 0.5 * rad },
        uSunDisc: { value: SKY.sunDiscIntensity },
        uSunDim: sunDim,
        uSunGlow: { value: new THREE.Vector2(SKY.sunGlow, SKY.sunGlowPower) },
        uMoonRadius: { value: SKY.moonDiscDeg * 0.5 * rad },
        uMoonColor: { value: new THREE.Color(SKY.moonColor).multiplyScalar(SKY.moonIntensity) },
        uStars: { value: new THREE.Vector3(SKY.starCells, SKY.starDensity, SKY.starBrightness) },
        uBands: { value: new THREE.Vector2(SKY.fogBand, SKY.horizonBand) },
      },
    }),
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.matrixAutoUpdate = true;

  scope.defer(() => {
    scene.fog = null;
    scene.background = null;
  });

  return {
    mesh,
    fog,
    update(env, cameraPos) {
      // weather (TASK-172): fog density × fogScale (world-view writes the base density each
      // frame before this), sun disc/glow dimmed under cloud cover. Overcast sky colours are
      // already mixed into env.zenith/horizon by the weather FSM.
      SHARED.uFogDensity.value *= env.fogScale;
      sunDim.value =
        1 -
        WEATHER_SKY.sunDim *
          Math.min(
            1,
            Math.max(0, (env.cloudCover - WEATHER_SKY.coverFrom) / (1 - WEATHER_SKY.coverFrom)),
          );
      fog.color.setRGB(env.fog.r, env.fog.g, env.fog.b);
      fog.density = SHARED.uFogDensity.value;
      (scene.background as THREE.Color).setRGB(env.fog.r, env.fog.g, env.fog.b);
      mesh.position.copy(cameraPos);
    },
  };
}
