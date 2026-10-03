import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { Quality } from '../../core/params.ts';
import { MIST } from '../../content/weather.ts';
import { WEATHER_PRESETS } from '../../content/palette.ts';
import { GRID_SAMPLE_GLSL, type WorldTextures } from '../world-textures.ts';
import { SHARED } from '../uniforms.ts';

/**
 * TASK-172 — low mist band (ART_BIBLE §2 "Mist": y 0–6 u, #F2EFEA). 1–3 horizontal
 * camera-following layers merged into ONE geometry (1 draw call, 1 program), drawn
 * bottom-up after the water. Each fragment fades by its world height (full ≤ 1 u,
 * zero ≥ 6 u), softly against the terrain (height texture, no depth read), by
 * distance, and by drifting value noise. Alpha ≤ 0.55 × uMist.
 */
const VERT = /* glsl */ `
uniform vec3 uCameraPos;
attribute float aLayer;
varying vec3 vW;
varying vec2 vC;
void main() {
  // centre the slab on the ground point the camera looks at (overview cameras sit far off-centre)
  vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  float t = fwd.y < -0.05 ? min(uCameraPos.y / -fwd.y, 1200.0) : 300.0;
  vec2 c = floor((uCameraPos.xz + fwd.xz * t) / 8.0) * 8.0;
  vC = c;
  vec3 wp = vec3(position.x + c.x, aLayer, position.z + c.y);
  vW = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uHeightTex;
uniform vec3 uGridMap;
uniform vec3 uCameraPos;
uniform float uTime;
uniform float uMist;
uniform float uNight;
uniform float uDebugMask;
uniform vec4 uWind;
uniform vec3 uFogColor;
uniform vec3 uMistColor;
uniform vec2 uY;      // full, max
uniform vec2 uFar;
uniform float uSoft;
uniform float uAlpha;
uniform vec2 uNoise;  // scale, drift
uniform float uNightK;
varying vec3 vW;
varying vec2 vC;
${GRID_SAMPLE_GLSL}
float mistHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float mistNoise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mistHash(i), mistHash(i + vec2(1.0, 0.0)), u.x),
             mix(mistHash(i + vec2(0.0, 1.0)), mistHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  if (uDebugMask > 0.5) discard;
  float ground = max(marSampleGrid(uHeightTex, vW.xz), 0.0);
  float above = vW.y - ground;
  if (above <= 0.0) discard;
  float a = uAlpha * uMist;
  a *= smoothstep(0.0, uSoft, above);
  a *= 1.0 - smoothstep(uY.x, uY.y, vW.y);
  a *= 1.0 - smoothstep(uFar.x, uFar.y, length(vW.xz - vC));
  // lens: thin out the layer the camera is sitting in
  a *= smoothstep(0.5, 4.0, abs(uCameraPos.y - vW.y));
  vec2 drift = uWind.xy * uTime * uNoise.y;
  vec2 q = (vW.xz - drift) * uNoise.x + vW.y * 3.1;
  float n = mistNoise(q) * 0.65 + mistNoise(q * 2.3 + 17.0 + drift * uNoise.x * 0.5) * 0.35;
  a *= 0.35 + 0.65 * smoothstep(0.25, 0.75, n);
  if (a < 0.004) discard;
  vec3 col = mix(uMistColor, uFogColor, 0.12 + uNightK * uNight);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface MistView {
  mesh: THREE.Mesh;
  /** Visibility from SHARED.uMist / mask mode; call after writeEnvUniforms. */
  update(): void;
}

export function createMist(textures: WorldTextures, quality: Quality, scope: Scope): MistView {
  const layers = [...(MIST.layers[quality] ?? MIST.layers.medium)].sort((a, b) => a - b);
  const parts: THREE.BufferGeometry[] = [];
  for (const y of layers) {
    const g = new THREE.PlaneGeometry(MIST.size, MIST.size, 1, 1);
    g.rotateX(-Math.PI / 2);
    const n = g.attributes.position.count;
    g.setAttribute('aLayer', new THREE.BufferAttribute(new Float32Array(n).fill(y), 1));
    parts.push(g);
  }
  // merge by hand (bottom layer first → back-to-front when viewed from above)
  const geo = scope.add(new THREE.BufferGeometry());
  const posArr: number[] = [];
  const layerArr: number[] = [];
  const idxArr: number[] = [];
  let base = 0;
  for (const g of parts) {
    const p = g.attributes.position.array;
    const l = g.attributes.aLayer.array;
    for (let i = 0; i < p.length; i++) posArr.push(p[i]);
    for (let i = 0; i < l.length; i++) layerArr.push(l[i]);
    const ix = g.index!.array;
    for (let i = 0; i < ix.length; i++) idxArr.push(ix[i] + base);
    base += g.attributes.position.count;
    g.dispose();
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  geo.setAttribute('aLayer', new THREE.Float32BufferAttribute(layerArr, 1));
  geo.setIndex(idxArr);

  const mat = scope.add(
    new THREE.ShaderMaterial({
      name: 'mar-mist',
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uHeightTex: { value: textures.height },
        uGridMap: textures.uGridMap,
        uCameraPos: SHARED.uCameraPos,
        uTime: SHARED.uTime,
        uMist: SHARED.uMist,
        uNight: SHARED.uNight,
        uDebugMask: SHARED.uDebugMask,
        uWind: SHARED.uWind,
        uFogColor: SHARED.uFogColor,
        uMistColor: { value: new THREE.Color(WEATHER_PRESETS.fog.mist.color) },
        uY: { value: new THREE.Vector2(MIST.yFull, WEATHER_PRESETS.fog.mist.yMax) },
        uFar: { value: new THREE.Vector2(...MIST.far) },
        uSoft: { value: MIST.soft },
        uAlpha: { value: MIST.alpha },
        uNoise: { value: new THREE.Vector2(MIST.noiseScale, MIST.drift) },
        uNightK: { value: MIST.night },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'mist';
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 15;
  return {
    mesh,
    update() {
      mesh.visible = SHARED.uMist.value > 0.01 && SHARED.uDebugMask.value < 0.5;
    },
  };
}
