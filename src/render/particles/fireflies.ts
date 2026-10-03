import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { WorldData } from '../../world/types.ts';
import { heightAt, Zone, zoneAt } from '../../world/types.ts';
import { createRng } from '../../core/rng.ts';
import { SHARED } from '../uniforms.ts';
import { EMISSIVE } from '../../content/palette.ts';
import { FIREFLIES } from '../../content/anim.ts';
import { FIELDS_GLSL } from '../shaders/chunks/fields.glsl.ts';

/**
 * Fireflies (ART_BIBLE §7 #17): stateless GPU points near forests, meadows and the
 * village from 19:30 to 04:00 — blink 1.5–3 s, drift 0.5 u, glow 0 → 1 → 0 (smoothstep).
 * Rendered as small camera-facing quads brighter than 1.0 so bloom picks them up.
 */
export interface FirefliesView {
  mesh: THREE.InstancedMesh;
  update(cameraX: number, cameraZ: number): void;
}

export function createFireflies(world: WorldData, count: number, scope: Scope): FirefliesView {
  const rng = createRng(world.seed).fork('fireflies');
  const origins = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  let placed = 0;
  let tries = 0;
  while (placed < count && tries < count * 40) {
    tries++;
    const isl = world.islands[rng.int(0, world.islands.length - 1)];
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, isl.radius * 0.9);
    const x = isl.cx + Math.cos(a) * r;
    const z = isl.cz + Math.sin(a) * r;
    const zone = zoneAt(world.height, world.zone, x, z);
    if (
      zone !== Zone.forest &&
      zone !== Zone.meadow &&
      zone !== Zone.grass &&
      zone !== Zone.plaza &&
      zone !== Zone.path
    )
      continue;
    const y = heightAt(world.height, x, z);
    if (y < 0.5) continue;
    origins[placed * 3] = x;
    origins[placed * 3 + 1] = y + rng.range(0.6, 2.2);
    origins[placed * 3 + 2] = z;
    seeds[placed] = rng.next();
    placed++;
  }
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(0.22, 0.22);
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);
  geo.setIndex(quad.index);
  geo.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origins, 3));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  geo.instanceCount = placed;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: SHARED.uTime,
      uNight: SHARED.uNight,
      uDebugMask: SHARED.uDebugMask,
      uMotionScale: SHARED.uMotionScale,
      uColor: { value: new THREE.Color(EMISSIVE.firefly) },
      uBlink: { value: new THREE.Vector2(FIREFLIES.blink[0], FIREFLIES.blink[1]) },
      uDrift: { value: FIREFLIES.drift },
    },
    vertexShader: /* glsl */ `
      ${FIELDS_GLSL}
      attribute vec3 aOrigin;
      attribute float aSeed;
      uniform float uTime, uNight, uMotionScale, uDrift;
      uniform vec2 uBlink;
      varying float vGlow;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        float period = mix(uBlink.x, uBlink.y, fract(aSeed * 7.31));
        float ph = fract(uTime / period + aSeed);
        float glow = smoothstep(0.0, 0.5, ph) * (1.0 - smoothstep(0.5, 1.0, ph));
        vGlow = glow * smoothstep(0.35, 0.8, uNight);
        float t = uTime * uMotionScale;
        vec3 drift = vec3(sin(t * 0.7 + aSeed * 31.0), sin(t * 0.9 + aSeed * 17.0) * 0.5, cos(t * 0.6 + aSeed * 23.0)) * uDrift;
        vec3 world = aOrigin + drift;
        vec4 mv = viewMatrix * vec4(world, 1.0);
        mv.xy += position.xy * (0.7 + 0.5 * glow);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uDebugMask;
      varying float vGlow;
      varying vec2 vUv;
      void main() {
        if (uDebugMask > 0.5 || vGlow < 0.02) discard;
        float d = length(vUv - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.3, 1.0, d)) * vGlow;
        if (a < 0.03) discard;
        gl_FragColor = vec4(uColor * (1.2 + 1.3 * vGlow), 1.0);
      }
    `,
    transparent: false,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, placed);
  mesh.frustumCulled = false;
  mesh.renderOrder = 18;
  mesh.name = 'fireflies';
  scope.add(geo);
  scope.add(mat);
  scope.add(quad);
  scope.defer(() => mesh.dispose());
  return { mesh, update: () => {} };
}
