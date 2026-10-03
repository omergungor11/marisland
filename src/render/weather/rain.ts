import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { Quality } from '../../core/params.ts';
import { createRng } from '../../core/rng.ts';
import { RAIN } from '../../content/weather.ts';
import { SHARED } from '../uniforms.ts';

/**
 * TASK-172 — rain streaks (ARCHITECTURE §7 "Rain", R5). One BufferGeometry of thin
 * quads (800 / 2000 / 4000 by quality) in a 60×40×60 u box that wraps around the
 * camera in the vertex shader; stateless f(uTime, aSeed). Opaque + dithered (no
 * blending, no overdraw sorting). Streaks whose seed > uRain collapse off-screen, so
 * the count follows the rain amount. 1 draw call, 1 program; hidden when uRain ≤ 0.02.
 */
const VERT = /* glsl */ `
uniform float uTime;
uniform float uRain;
uniform float uDebugMask;
uniform vec3 uCameraPos;
uniform vec4 uWind;
uniform vec3 uBox;
uniform float uDrop;
uniform float uAhead;
uniform vec4 uRainP;   // x speed, y lean, z length, w width
uniform float uMinW;
uniform vec2 uNear;
attribute vec4 aSeed;
varying float vA;
varying float vY;
varying float vAlong;
void main() {
  vA = 0.0; vY = 0.0; vAlong = 0.0;
  if (aSeed.w > uRain || uDebugMask > 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float speed = uRainP.x * (0.85 + 0.3 * fract(aSeed.w * 7.13 + aSeed.x));
  float lean = uRainP.y * (0.6 + 0.4 * uWind.z);
  vec3 vel = vec3(uWind.x * lean, -1.0, uWind.y * lean) * speed;
  // wrap the tiny-period part of time first to keep float precision at large uTime
  float t = mod(uTime, 3600.0);
  // view forward from the view matrix (third row, negated)
  vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vec3 centre = uCameraPos + fwd * uAhead - vec3(0.0, uDrop, 0.0);
  vec3 p = aSeed.xyz * uBox + vel * t;
  vec3 rel = mod(p - centre + 0.5 * uBox, uBox) - 0.5 * uBox;
  vec3 head = centre + rel;
  vec3 dir = normalize(vel);
  vec3 toCam = uCameraPos - head;
  float dist = length(toCam);
  vec3 side = normalize(cross(dir, toCam / max(dist, 1e-3)));
  float w = max(uRainP.w, dist * uMinW);
  vec3 wp = head + side * position.x * w - dir * position.y * uRainP.z;
  // fade at the box faces (wrap pops) and right in front of the lens
  vec3 e = 0.5 * uBox - abs(rel);
  float edge = smoothstep(0.0, 4.0, min(e.x, min(e.y, e.z)));
  vA = edge * smoothstep(uNear.x, uNear.y, dist);
  vY = wp.y;
  vAlong = position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uNight;
uniform vec3 uHemiSky;
varying float vA;
varying float vY;
varying float vAlong;
void main() {
  if (vY < 0.0) discard;
  // bright head, tapering tail
  float a = vA * uAlpha * (1.0 - 0.7 * vAlong) * smoothstep(0.0, 0.08, vAlong + 0.04);
  // interleaved-gradient dither instead of blending (R5)
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (a <= n) discard;
  float hl = dot(uHemiSky, vec3(0.2126, 0.7152, 0.0722));
  vec3 col = mix(uColor, uColor * (0.25 + hl), uNight);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface RainView {
  mesh: THREE.Mesh;
  /** Visibility from SHARED.uRain / mask mode; call after writeEnvUniforms. */
  update(): void;
}

export function createRain(quality: Quality, scope: Scope): RainView {
  const n = RAIN.count[quality];
  const rng = createRng(0x5a17).fork('rain');
  const pos = new Float32Array(n * 4 * 3);
  const seed = new Float32Array(n * 4 * 4);
  const idx = new Uint32Array(n * 6);
  const corners = [-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 1];
  for (let i = 0; i < n; i++) {
    const sx = rng.next();
    const sy = rng.next();
    const sz = rng.next();
    // stratified so any uRain fraction is evenly spread
    const sw = (i + rng.next()) / n;
    for (let c = 0; c < 4; c++) {
      const v = i * 4 + c;
      pos[v * 3] = corners[c * 2];
      pos[v * 3 + 1] = corners[c * 2 + 1];
      seed.set([sx, sy, sz, sw], v * 4);
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const geo = scope.add(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));

  const mat = scope.add(
    new THREE.ShaderMaterial({
      name: 'mar-rain',
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: SHARED.uTime,
        uRain: SHARED.uRain,
        uDebugMask: SHARED.uDebugMask,
        uCameraPos: SHARED.uCameraPos,
        uWind: SHARED.uWind,
        uNight: SHARED.uNight,
        uHemiSky: SHARED.uHemiSky,
        uBox: { value: new THREE.Vector3(...RAIN.box) },
        uDrop: { value: RAIN.boxDrop },
        uAhead: { value: RAIN.ahead },
        uRainP: { value: new THREE.Vector4(RAIN.speed, RAIN.lean, RAIN.length, RAIN.width) },
        uMinW: { value: RAIN.minWidthPerU },
        uNear: { value: new THREE.Vector2(...RAIN.nearFade) },
        uColor: { value: new THREE.Color(RAIN.color) },
        uAlpha: { value: RAIN.alpha },
      },
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'rain';
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 5;
  return {
    mesh,
    update() {
      mesh.visible = SHARED.uRain.value > 0.02 && SHARED.uDebugMask.value < 0.5;
    },
  };
}
