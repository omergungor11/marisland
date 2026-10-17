import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { Quality } from '../../core/params.ts';
import type { EnvState } from '../../env/env-state.ts';
import { unitHash } from '../../core/hash.ts';
import { BEAM, COMET, FOG, METEORS, SKY } from '../../content/lighting.ts';
import { SHARED } from '../uniforms.ts';
import type { CultureState } from '../culture-clock.ts';
import { SKY_FRAG, SKY_VERT } from './sky.glsl.ts';

/**
 * Sky dome + fog (ARCHITECTURE §3 "Sky & lights", ART_BIBLE §3). A camera-
 * following BackSide sphere drawn first (no depth), gradient fog → horizon →
 * zenith, a blooming sun disc by day, a moon disc and hashed stars at night,
 * the Comet Night comet and seeded shooting stars (TASK-472 G2).
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
  /**
   * `time` = render clock (s) for the shooting-star schedule, `culture` = the culture clock state
   * (the Research `cometNight` ritual phase drives the comet), `veil` = overcast 0..1.
   */
  update(
    env: EnvState,
    cameraPos: THREE.Vector3,
    time?: number,
    culture?: CultureState | null,
    veil?: number,
  ): void;
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
  beam: { flareRadius?: number; flarePull?: number; dip?: readonly [number, number] } = {},
  quality: Quality = 'medium',
): THREE.ShaderMaterial {
  const isBeam = mode === 'beam';
  const stars = SKY.stars[quality];
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
        value: new THREE.Vector4(SKY.starCells, SKY.starDensity, stars.brightness, SKY.starTwinkle),
      },
      uStarFx: {
        value: new THREE.Vector4(SKY.starTwinkleRate, ...stars.horizonFade, stars.size),
      },
      uBands: { value: new THREE.Vector2(SKY.fogBand, SKY.horizonBand) },
      // comet + shooting star (TASK-472 G2); both off until the dome's update writes them
      uComet: { value: new THREE.Vector4(0, 1, 0, 0) },
      uCometTail: { value: new THREE.Vector4(1, 0, 0, COMET.tailDeg * DEG) },
      uCometLook: {
        value: new THREE.Vector4(
          COMET.headDeg * DEG,
          COMET.headIntensity,
          COMET.tailWidthDeg * DEG,
          COMET.tailFan,
        ),
      },
      uCometColor: { value: new THREE.Color(COMET.color).multiplyScalar(COMET.tailIntensity) },
      uMeteor: { value: new THREE.Vector4(0, 1, 0, -1) },
      uMeteorDir: { value: new THREE.Vector4(1, 0, 0, 0) },
      uMeteorLook: { value: new THREE.Vector3(METEORS.widthDeg * DEG, METEORS.intensity, 0) },
      uMeteorColor: { value: new THREE.Color(METEORS.color) },
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
      uBeamNear: { value: new THREE.Vector4(...BEAM.nearFade, ...(beam.dip ?? BEAM.dip)) },
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

const smooth = (t: number): number => {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
};

/** Unit direction from a bearing (deg, 0 = +x, 90 = +z) and elevation (deg). */
function dirOf(azDeg: number, elDeg: number, out: THREE.Vector3): THREE.Vector3 {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  return out.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
}

/**
 * Comet Night comet (pure, TASK-472 G2): head direction and tail direction (away from the sun,
 * projected onto the head's tangent plane) at ritual phase 0..1; intensity 0 outside / faded.
 */
export function cometAt(
  phase: number,
  sunSkyDir: { x: number; y: number; z: number },
  head: THREE.Vector3,
  tail: THREE.Vector3,
): number {
  if (phase < 0 || phase > 1) return 0;
  dirOf(
    COMET.azimuthDeg,
    COMET.elevation[0] + (COMET.elevation[1] - COMET.elevation[0]) * smooth(phase),
    head,
  );
  _sun.set(sunSkyDir.x, sunSkyDir.y, sunSkyDir.z);
  tail.copy(_sun).addScaledVector(head, -_sun.dot(head)).negate();
  if (tail.lengthSq() < 1e-6) tail.set(0, 1, 0).addScaledVector(head, -head.y);
  tail.normalize();
  return smooth(phase / COMET.fadeIn) * (1 - smooth((phase - (1 - COMET.fadeOut)) / COMET.fadeOut));
}

/**
 * Shooting-star schedule (pure, TASK-472 G2): closed form of the render clock and the world seed.
 * Slots of mean interval length; each meteor starts a seeded offset into its slot, so consecutive
 * starts are `METEORS.interval` apart. Returns progress 0..1 (−1 = none) and writes the start
 * direction, streak direction (unit, ⟂ start) and streak length (rad).
 */
export function meteorAt(
  time: number,
  seed: number,
  start: THREE.Vector3,
  dir: THREE.Vector3,
): { progress: number; length: number } {
  const [i0, i1] = METEORS.interval;
  const slot = (i0 + i1) / 2;
  const k = Math.floor(time / slot);
  const t0 = k * slot + unitHash(seed, k, 0x4d45) * ((i1 - i0) / 2);
  const p = (time - t0) / METEORS.seconds;
  if (p < 0 || p > 1) return { progress: -1, length: 0 };
  const az = unitHash(seed, k, 0x4d46) * 360;
  const el =
    METEORS.elevation[0] +
    (METEORS.elevation[1] - METEORS.elevation[0]) * unitHash(seed, k, 0x4d47);
  dirOf(az, el, start);
  // tangent frame: `east` along the horizon, `down` toward it; the streak slants down 20–60°
  _east.set(0, 1, 0).cross(start).normalize();
  _down.copy(_east).cross(start).normalize();
  const slant = (20 + 40 * unitHash(seed, k, 0x4d48)) * DEG;
  const side = unitHash(seed, k, 0x4d49) < 0.5 ? -1 : 1;
  dir
    .copy(_east)
    .multiplyScalar(Math.cos(slant) * side)
    .addScaledVector(_down, Math.sin(slant));
  const length =
    (METEORS.lengthDeg[0] +
      (METEORS.lengthDeg[1] - METEORS.lengthDeg[0]) * unitHash(seed, k, 0x4d4a)) *
    DEG;
  return { progress: p, length };
}

const _sun = new THREE.Vector3();
const _east = new THREE.Vector3();
const _down = new THREE.Vector3();
const _head = new THREE.Vector3();
const _tail = new THREE.Vector3();
const _m0 = new THREE.Vector3();
const _mdir = new THREE.Vector3();

export function createSky(
  scene: THREE.Scene,
  scope: Scope,
  quality: Quality = 'medium',
  seed = 0,
): SkyView {
  const fog = new THREE.FogExp2(0xd6eef7, FOG.density);
  scene.fog = fog;
  SHARED.uFogDensity.value = FOG.density;
  scene.background = new THREE.Color(0xd6eef7);

  const geo = scope.add(new THREE.SphereGeometry(SKY.radius, 48, 24));
  const mat = scope.add(createSkyProgramMaterial('sky', {}, quality));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.matrixAutoUpdate = true;
  const u = mat.uniforms;

  scope.defer(() => {
    scene.fog = null;
    scene.background = null;
  });

  return {
    mesh,
    fog,
    update(env, cameraPos, time = 0, culture = null, veil = 0) {
      fog.color.setRGB(env.fog.r, env.fog.g, env.fog.b);
      fog.density = SHARED.uFogDensity.value;
      (scene.background as THREE.Color).setRGB(env.fog.r, env.fog.g, env.fog.b);
      mesh.position.copy(cameraPos);
      // comet: the Star Academy's Comet Night ritual phase (culture clock), night only
      const fest = culture?.festival.research;
      const phase = fest && fest.id === 'cometNight' ? fest.phase : -1;
      const k = cometAt(phase, env.sunSkyDir, _head, _tail) * env.starAlpha;
      (u.uComet.value as THREE.Vector4).set(_head.x, _head.y, _head.z, k);
      (u.uCometTail.value as THREE.Vector4).set(_tail.x, _tail.y, _tail.z, COMET.tailDeg * DEG);
      // shooting stars: clear full nights only
      const clear = env.starAlpha >= 0.5 && veil < METEORS.veilCut;
      const m = clear ? meteorAt(time, seed, _m0, _mdir) : { progress: -1, length: 0 };
      (u.uMeteor.value as THREE.Vector4).set(_m0.x, _m0.y, _m0.z, m.progress);
      (u.uMeteorDir.value as THREE.Vector4).set(_mdir.x, _mdir.y, _mdir.z, m.length);
      const p = m.progress;
      (u.uMeteorLook.value as THREE.Vector3).z =
        p < 0 ? 0 : Math.min(1, p / 0.15) * Math.pow(1 - p, 0.6) * env.starAlpha;
    },
  };
}
