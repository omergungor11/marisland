import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { Quality } from '../../core/params.ts';
import { PUFFS } from '../../content/anim.ts';
import { CLOUD, EMISSIVE } from '../../content/palette.ts';
import { SHARED } from '../uniforms.ts';
import { PUFF_FRAG, PUFF_VERT } from '../clouds/cloud.glsl.ts';
import { hash32 } from '../clouds/cloud-field.ts';

/**
 * TASK-153 — stateless GPU smoke / steam puffs (ART_BIBLE §7 #20/#21, ARCHITECTURE §5).
 * One InstancedMesh of a smooth icosphere; every instance is a puff slot whose
 * position/scale/fade are `f(uTime, aSeed)` in the vertex shader. Opaque with
 * Bayer-dither fade (no blending, no sorting). One draw call, one program.
 */
export const PUFF_CHIMNEY = 0;
export const PUFF_STEAM = 1;
export const PUFF_SPRING = 2;
/** Internal: ring-puff burp slots added with every steam emitter. */
export const PUFF_RING = 3;
export type PuffKind = typeof PUFF_CHIMNEY | typeof PUFF_STEAM | typeof PUFF_SPRING;

export interface Puffs {
  mesh: THREE.InstancedMesh;
  /** Register an emitter; slots are written immediately, call `finalize()` after a batch. */
  addEmitter(x: number, y: number, z: number, kind: PuffKind): void;
  /** Upload attributes after `addEmitter` calls. */
  finalize(): void;
  /** No CPU work (uTime is shared); kept for API symmetry. */
  update(time: number): void;
  /** Slots in use / capacity / dropped (over capacity). */
  stats(): { used: number; capacity: number; dropped: number };
}

const KIND_CFG = {
  [PUFF_CHIMNEY]: PUFFS.chimney,
  [PUFF_STEAM]: PUFFS.steam,
  [PUFF_SPRING]: PUFFS.spring,
} as const;

export function createPuffs(scope: Scope, quality: Quality): Puffs {
  const capacity = PUFFS.capacity[quality];
  const geo = scope.add(new THREE.IcosahedronGeometry(1, 1));
  // smooth normals = unit position (smooth-shaded exception)
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(i, x / l, y / l, z / l);
  }

  const aSeed = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  const aOrigin = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const aKind = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  const aShape = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const aMove = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
  geo.setAttribute('aSeed', aSeed);
  geo.setAttribute('aOrigin', aOrigin);
  geo.setAttribute('aKind', aKind);
  geo.setAttribute('aShape', aShape);
  geo.setAttribute('aMove', aMove);

  const B = PUFFS.burp;
  const defines: Record<string, string> = {};
  if (quality === 'low') defines.MAR_DIRECT = '';
  const mat = scope.add(
    new THREE.ShaderMaterial({
      name: 'puffs',
      vertexShader: PUFF_VERT,
      fragmentShader: PUFF_FRAG,
      defines,
      uniforms: {
        uTime: SHARED.uTime,
        uWind: SHARED.uWind,
        uMotionScale: SHARED.uMotionScale,
        uSunDir: SHARED.uSunDir,
        uSunColor: SHARED.uSunColor,
        uSunIntensity: SHARED.uSunIntensity,
        uHemiSky: SHARED.uHemiSky,
        uFogColor: SHARED.uFogColor,
        uFogDensity: SHARED.uFogDensity,
        uCameraPos: SHARED.uCameraPos,
        uNight: SHARED.uNight,
        uGolden: SHARED.uGolden,
        uDebugMask: SHARED.uDebugMask,
        uTop: { value: new THREE.Color(CLOUD.top) },
        uBelly: { value: new THREE.Color(CLOUD.belly) },
        uBellyNight: { value: new THREE.Color(CLOUD.bellyNight) },
        // lava lerped toward lantern amber: pure lava red over blue-white steam reads pink
        uLava: {
          value: new THREE.Color(EMISSIVE.lava).lerp(new THREE.Color(EMISSIVE.lantern), 0.5),
        },
        uLavaGlow: { value: new THREE.Vector2(PUFFS.lavaGlow.day, PUFFS.lavaGlow.night) },
        uBurp: { value: new THREE.Vector4(B.period, B.life, B.radius, B.rise) },
        uBurpSize: { value: new THREE.Vector4(B.size[0], B.size[1], B.pulse, PUFFS.fadeLast) },
      },
      fog: false,
      lights: false,
    }),
  );

  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.name = 'puffs';
  mesh.count = 0;
  mesh.frustumCulled = false; // positions come from the vertex shader
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // instanceMatrix stays identity (unused by the shader)

  let used = 0;
  let dropped = 0;
  let emitters = 0;

  const put = (
    x: number,
    y: number,
    z: number,
    kind: number,
    seed: number,
    shape: readonly [number, number, number, number],
    drift: number,
    jitter: number,
  ): void => {
    if (used >= capacity) {
      dropped++;
      return;
    }
    const i = used++;
    aSeed.setX(i, seed);
    aOrigin.setXYZ(i, x, y, z);
    aKind.setX(i, kind);
    aShape.setXYZW(i, shape[0], shape[1], shape[2], shape[3]);
    aMove.setXY(i, drift, jitter);
  };

  return {
    mesh,
    addEmitter(x, y, z, kind) {
      const cfg = KIND_CFG[kind];
      const e = emitters++;
      const phase = (hash32(e * 7919 + kind * 104729 + 1) >>> 8) / 16777216;
      const life = cfg.spawn * cfg.slots;
      for (let s = 0; s < cfg.slots; s++) {
        put(
          x,
          y,
          z,
          kind,
          (s / cfg.slots + phase) % 1,
          [cfg.size[0], cfg.size[1], cfg.rise, life],
          cfg.drift,
          cfg.jitter,
        );
      }
      if (kind === PUFF_STEAM) {
        for (let r = 0; r < B.ring; r++)
          put(x, y + 1, z, PUFF_RING, (r + 0.5 * phase) / B.ring, [0, 0, 0, 1], 0, 0);
      }
    },
    finalize() {
      mesh.count = used;
      for (const a of [aSeed, aOrigin, aKind, aShape, aMove]) {
        a.clearUpdateRanges();
        a.needsUpdate = true;
      }
    },
    update: () => {},
    stats: () => ({ used, capacity, dropped }),
  };
}
