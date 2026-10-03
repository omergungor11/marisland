import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { WorldData } from '../world/types.ts';
import { heightAt } from '../world/types.ts';
import { SHARED } from './uniforms.ts';
import { BEACON } from '../content/anim.ts';
import { EMISSIVE } from '../content/palette.ts';
import type { EnvState } from '../env/env-state.ts';

/**
 * Lighthouse beam (ART_BIBLE §7 #19): a 40 u cone rotating 8 s/rev, opacity 0.35,
 * additive, on from dusk to dawn (driven by EnvState.night). One mesh per lighthouse.
 */
export interface BeaconView {
  group: THREE.Group;
  update(time: number, env: EnvState): void;
}

export function createBeacons(world: WorldData, scope: Scope): BeaconView {
  const group = new THREE.Group();
  group.name = 'beacons';
  const lighthouses = world.landmarks.filter((l) => l.kind === 'lighthouse');
  if (!lighthouses.length) return { group, update: () => {} };
  const len = BEACON.coneLength;
  const geo = scope.add(new THREE.CylinderGeometry(7, 0.6, len, 16, 1, true));
  geo.rotateZ(-Math.PI / 2); // axis along +x, apex at the lamp
  geo.translate(len / 2, 0, 0);
  const mat = scope.add(
    new THREE.ShaderMaterial({
      uniforms: {
        uNight: SHARED.uNight,
        uColor: { value: new THREE.Color(EMISSIVE.lantern) },
        uOpacity: { value: BEACON.opacity },
      },
      vertexShader: /* glsl */ `
        varying float vAlong;
        varying vec3 vNormalW;
        varying vec3 vPosW;
        void main() {
          vAlong = position.x / ${len.toFixed(1)};
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vPosW = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uNight;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlong;
        varying vec3 vNormalW;
        varying vec3 vPosW;
        void main() {
          vec3 v = normalize(cameraPosition - vPosW);
          float rim = pow(abs(dot(v, vNormalW)), 1.2);
          float fade = (1.0 - vAlong) * (1.0 - vAlong);
          float a = uOpacity * smoothstep(0.25, 0.7, uNight) * fade * (0.35 + 0.65 * rim);
          if (a < 0.003) discard;
          gl_FragColor = vec4(uColor * 1.6, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  const meshes: THREE.Mesh[] = [];
  for (const l of lighthouses) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(l.x, heightAt(world.height, l.x, l.z) + 12.6, l.z);
    m.renderOrder = 20;
    m.frustumCulled = false;
    group.add(m);
    meshes.push(m);
  }
  return {
    group,
    update(time, env) {
      const on = env.night > 0.25;
      group.visible = on;
      if (!on) return;
      const a = (time / BEACON.secondsPerRev) * Math.PI * 2;
      for (let i = 0; i < meshes.length; i++) meshes[i].rotation.y = -a + i * 1.3;
    },
  };
}
