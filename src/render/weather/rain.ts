import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { Quality } from '../../core/params.ts';
import type { EnvState } from '../../env/env-state.ts';
import { hexToLinear, luminance } from '../../env/env-state.ts';
import { createRng } from '../../core/rng.ts';
import { RAIN } from '../../content/weather.ts';
import { RAIN_KIND } from './rain.glsl.ts';

/**
 * TASK-172 rain (ARCHITECTURE §7): one InstancedMesh of camera-facing streak quads in a
 * camera-local wrapped box (rain.glsl.ts). It draws with the puff material — the puff program has
 * a rain branch (kind 4) — so rain adds a draw call but no shader program. The box edge follows
 * the camera ↔ focus distance in octave steps, so the streak density on screen is the same at
 * every zoom tier. Intensity scales the instance count (`mesh.count`); 0 hides the mesh (no draw
 * call). Cost: 2 tris per streak, RAIN.count per quality (counted as particles).
 */
export interface RainView {
  mesh: THREE.InstancedMesh;
  /** Streaks drawn this frame. */
  count(): number;
  update(
    intensity: number,
    env: EnvState,
    cameraPos: THREE.Vector3,
    cameraDir: THREE.Vector3,
    focusDist: number,
    windDir: number,
    windStrength: number,
  ): void;
}

interface RainUniforms {
  uRainBox: { value: THREE.Vector4 };
  uRainCentre: { value: THREE.Vector3 };
  uRainMotion: { value: THREE.Vector4 };
  uRainLook: { value: THREE.Vector4 };
  uRainColor: { value: THREE.Color };
}

const RAIN_RGB = hexToLinear(RAIN.color);
const RAIN_L = Math.max(luminance(RAIN_RGB), 1e-4);

/** `material` = the puff ShaderMaterial (particles/puffs.ts) carrying the uRain* uniforms. */
export function createRain(
  seed: number,
  quality: Quality,
  scope: Scope,
  material: THREE.ShaderMaterial,
): RainView {
  const capacity = RAIN.count[quality];
  const geo = scope.add(new THREE.BufferGeometry());
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0]), 3),
  );
  geo.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(4).fill(RAIN_KIND), 1));
  // unused by the rain branch, but three keys programs on `vertexNormals`: without it the shared
  // puff material would compile a second program for this mesh
  geo.setAttribute(
    'normal',
    new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3),
  );
  geo.setIndex([0, 1, 2, 2, 1, 3]); // front-facing for the camera-facing ribbon (FrontSide)
  const drops = new Float32Array(capacity * 4);
  const rng = createRng(seed).fork('rain');
  for (let i = 0; i < drops.length; i++) drops[i] = rng.next();
  geo.setAttribute('aDrop', new THREE.InstancedBufferAttribute(drops, 4));

  const u = material.uniforms as unknown as RainUniforms;
  const mesh = new THREE.InstancedMesh(geo, material, capacity);
  mesh.name = 'rain';
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false; // positions come from the vertex shader
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 8; // after land/props, before the water (10)

  let drawn = 0;
  const _c = new THREE.Vector3();
  return {
    mesh,
    count: () => drawn,
    update(intensity, env, cameraPos, cameraDir, focusDist, windDir, windStrength) {
      drawn = intensity > 0 ? Math.round(capacity * Math.min(1, intensity)) : 0;
      mesh.count = drawn;
      mesh.visible = drawn > 0;
      if (!drawn) return;
      // box edge in octave steps of RAIN.box.min (a zoom only reshuffles drops at a step)
      const B = RAIN.box;
      const want = Math.min(B.max, Math.max(B.min, focusDist * B.k));
      const edge = Math.min(B.max, B.min * 2 ** Math.round(Math.log2(want / B.min)));
      const s = edge / RAIN.refEdge;
      u.uRainBox.value.set(edge, edge * B.aspectY, edge, RAIN.opacity);
      _c.copy(cameraDir)
        .multiplyScalar(edge * RAIN.ahead)
        .add(cameraPos);
      u.uRainCentre.value.copy(_c);
      const lean = RAIN.lean * windStrength * s;
      u.uRainMotion.value.set(
        Math.cos(windDir) * lean,
        Math.sin(windDir) * lean,
        RAIN.speed * s,
        RAIN.streakSeconds,
      );
      u.uRainLook.value.set(
        RAIN.widthRad,
        RAIN.nearFade[0] * s,
        RAIN.nearFade[1] * s,
        RAIN.edgeFade,
      );
      // lit by the (weathered) fog colour: pale against land and sea, dark at night
      const k = RAIN.base + (RAIN.lit * luminance(env.fog)) / RAIN_L;
      u.uRainColor.value.setRGB(RAIN_RGB.r * k, RAIN_RGB.g * k, RAIN_RGB.b * k);
    },
  };
}
