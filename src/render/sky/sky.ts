import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { EnvState } from '../../env/env-state.ts';
import { BEAM, FOG, SKY } from '../../content/lighting.ts';
import { SHARED } from '../uniforms.ts';
import { SKY_FRAG, SKY_VERT } from './sky.glsl.ts';

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

const DEG = THREE.MathUtils.DEG2RAD;

/**
 * The dome program's material. `mode` 'sky' = the dome (opaque list, drawn first, no depth),
 * 'beam' = the lighthouse beam (additive, depth-tested, transparent list). Both have identical
 * shader source and program-key flags (BackSide; CustomBlending ONE/ZERO for the sky so neither
 * is "opaque") → three compiles ONE program for both. Every uniform is supplied by both
 * materials (a shared program keeps uniform state between them).
 */
export function createSkyProgramMaterial(
  mode: 'sky' | 'beam',
  beam: { flareRadius?: number; flarePull?: number } = {},
): THREE.ShaderMaterial {
  const isBeam = mode === 'beam';
  return new THREE.ShaderMaterial({
    name: isBeam ? 'mar-beam' : 'mar-sky',
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: isBeam,
    transparent: isBeam,
    blending: isBeam ? THREE.AdditiveBlending : THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.ZeroFactor,
    blendEquation: THREE.AddEquation,
    fog: false,
    uniforms: {
      uMode: { value: isBeam ? 1 : 0 },
      uZenith: SHARED.uZenith,
      uHorizon: SHARED.uHorizon,
      uFogColor: SHARED.uFogColor,
      uFogDensity: SHARED.uFogDensity,
      uSunSkyDir: SHARED.uSunSkyDir,
      uSunColor: SHARED.uSunColor,
      uMoonDir: SHARED.uMoonDir,
      uSkyNight: SHARED.uSkyNight,
      uLamps: SHARED.uLamps,
      uNight: SHARED.uNight,
      uTime: SHARED.uTime,
      uDebugMask: SHARED.uDebugMask,
      uWeather: SHARED.uWeather,
      uSun: {
        value: new THREE.Vector4(
          SKY.sunDiscDeg * 0.5 * DEG,
          SKY.sunDiscIntensity,
          SKY.sunHorizonScale,
          SKY.sunGrowBelow,
        ),
      },
      uSunGlow: { value: new THREE.Vector3(SKY.sunEdge, SKY.sunGlow, SKY.sunGlowPower) },
      uMoon: {
        value: new THREE.Vector4(
          SKY.moonDiscDeg * 0.5 * DEG,
          SKY.moonEdge,
          SKY.moonPhase,
          SKY.moonEarthshine,
        ),
      },
      uMoonColor: { value: new THREE.Color(SKY.moonColor).multiplyScalar(SKY.moonIntensity) },
      uMoonHalo: { value: new THREE.Vector4(...SKY.moonHalo) },
      uMoonHaloColor: { value: new THREE.Color(SKY.moonHaloColor) },
      uStars: {
        value: new THREE.Vector4(
          SKY.starCells,
          SKY.starDensity,
          SKY.starBrightness,
          SKY.starTwinkle,
        ),
      },
      uStarFx: {
        value: new THREE.Vector4(SKY.starTwinkleRate, ...SKY.starHorizonFade, SKY.starSize),
      },
      uBands: { value: new THREE.Vector2(SKY.fogBand, SKY.horizonBand) },
      uBeamColor: { value: new THREE.Color(BEAM.color) },
      uBeamMotion: {
        value: new THREE.Vector4(
          (Math.PI * 2) / BEAM.secondsPerRev,
          BEAM.tiltDeg * DEG,
          beam.flareRadius ?? BEAM.flareRadius,
          beam.flarePull ?? BEAM.flarePull,
        ),
      },
      uBeamLook: {
        value: new THREE.Vector4(BEAM.opacity, BEAM.backOpacity, BEAM.edgePower, BEAM.fadeIn),
      },
      uBeamFx: {
        value: new THREE.Vector4(
          BEAM.fadeOut[0],
          BEAM.fadeOut[1],
          BEAM.flareIntensity,
          BEAM.flareFacing,
        ),
      },
    },
  });
}

export function createSky(scene: THREE.Scene, scope: Scope): SkyView {
  const fog = new THREE.FogExp2(0xd6eef7, FOG.density);
  scene.fog = fog;
  SHARED.uFogDensity.value = FOG.density;
  scene.background = new THREE.Color(0xd6eef7);

  const geo = scope.add(new THREE.SphereGeometry(SKY.radius, 48, 24));
  const mat = scope.add(createSkyProgramMaterial('sky'));
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
      fog.color.setRGB(env.fog.r, env.fog.g, env.fog.b);
      fog.density = SHARED.uFogDensity.value;
      (scene.background as THREE.Color).setRGB(env.fog.r, env.fog.g, env.fog.b);
      mesh.position.copy(cameraPos);
    },
  };
}
