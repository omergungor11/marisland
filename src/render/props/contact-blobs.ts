import * as THREE from 'three';
import { SHARED } from '../uniforms.ts';
import { FIELDS_GLSL } from '../shaders/chunks/fields.glsl.ts';
import { BLOOM_IN } from '../../content/anim.ts';
import { MIST_GLSL } from '../shaders/chunks/mist.glsl.ts';

/**
 * Contact-shadow blobs (ART_BIBLE §1): a soft dark disc under every grounded prop,
 * radius 0.6 × footprint, opacity 0.25, tinted with the shadow colour. Instanced,
 * sharing the prop group's `aAppear` so blobs bloom in with their props. The only
 * shadows on low quality.
 */
let geometry: THREE.BufferGeometry | null = null;
let material: THREE.ShaderMaterial | null = null;

function blobGeometry(): THREE.BufferGeometry {
  if (geometry) return geometry;
  const n = 12;
  const pos = new Float32Array((n + 2) * 3);
  const uv = new Float32Array((n + 2) * 2);
  const idx: number[] = [];
  pos[0] = 0;
  pos[1] = 0;
  pos[2] = 0;
  uv[0] = 0;
  uv[1] = 0;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pos[(i + 1) * 3] = Math.cos(a);
    pos[(i + 1) * 3 + 1] = 0;
    pos[(i + 1) * 3 + 2] = Math.sin(a);
    uv[(i + 1) * 2] = Math.cos(a);
    uv[(i + 1) * 2 + 1] = Math.sin(a);
    if (i < n) idx.push(0, i + 2, i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  geometry = g;
  return g;
}

export function blobMaterial(): THREE.ShaderMaterial {
  if (material) return material;
  material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: SHARED.uTime,
      uShadowTint: SHARED.uShadowTint,
      uNight: SHARED.uNight,
      uDebugMask: SHARED.uDebugMask,
      uSpring: { value: new THREE.Vector2(BLOOM_IN.k, BLOOM_IN.c) },
      uMist: SHARED.uMist,
      uMistColor: SHARED.uMistColor,
      uMistMax: SHARED.uMistMax,
    },
    vertexShader: /* glsl */ `
      ${FIELDS_GLSL}
      attribute float aAppear;
      uniform float uTime;
      uniform vec2 uSpring;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        float s = marSpringIn(uTime - aAppear, uSpring.x, uSpring.y);
        vec3 p = position * s;
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uShadowTint;
      uniform float uNight;
      uniform float uDebugMask;
      varying vec2 vUv;
      varying vec3 vWorld;
      ${MIST_GLSL}
      void main() {
        if (uDebugMask > 0.5) discard;
        float r = length(vUv);
        float a = (1.0 - smoothstep(0.55, 1.0, r)) * 0.25 * (1.0 - 0.5 * uNight);
        // the low weather mist (TASK-172) hides the contact shadow with the ground under it
        if (uMist.x > 0.0) a *= 1.0 - marMist(vWorld, cameraPosition);
        if (a < 0.01) discard;
        gl_FragColor = vec4(uShadowTint * 0.6, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  return material;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/** Build a blob InstancedMesh mirroring `mesh` (same count/matrices, shared aAppear). */
export function makeBlobs(
  mesh: THREE.InstancedMesh,
  radii: Float32Array,
  aAppear: THREE.InstancedBufferAttribute,
): THREE.InstancedMesh {
  const g = new THREE.InstancedBufferGeometry();
  const base = blobGeometry();
  g.setAttribute('position', base.attributes.position);
  g.setAttribute('uv', base.attributes.uv);
  g.setIndex(base.index);
  g.setAttribute('aAppear', aAppear);
  const blobs = new THREE.InstancedMesh(g, blobMaterial(), mesh.count);
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, _m);
    _m.decompose(_p, _q, _s);
    const r = radii[i];
    _p.y += 0.06;
    _m.compose(_p, _q, _s.set(r, 1, r));
    blobs.setMatrixAt(i, _m);
  }
  blobs.instanceMatrix.needsUpdate = true;
  blobs.computeBoundingSphere();
  blobs.renderOrder = 5;
  blobs.frustumCulled = true;
  blobs.name = `${mesh.name}:blobs`;
  return blobs;
}
