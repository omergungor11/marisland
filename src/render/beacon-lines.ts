import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { Quality } from '../core/params.ts';
import { MARKETING_M27 as K } from '../content/themes/marketing-m27.ts';
import { MARKETING_M27_MOTION as M } from '../content/themes/marketing-m27-site.ts';
import { buildProp } from '../geo/registry.ts';
import { cableLoops, gondolaPose, newGondolaPose, type CableLoop } from '../world/cable-car.ts';
import type { WorldData } from '../world/types.ts';
import { SHARED } from './uniforms.ts';
import { makeDepthMaterial, makeLitMaterial } from './materials/factory.ts';

/**
 * Beacon Rock cable car gondolas (TASK-518, D-097, MK:M1): `count` cabins per loop
 * (world/cable-car.ts) as mover meshes, never PropStore props (a stored 2.65 u gondola seen first
 * would turn the whole mailLine def tier 2). One instanced mesh per livery (mailLine v5 red, v6
 * cream, alternating) on the shared lit program (no new program), hidden past the fade. Each
 * cabin hangs from its grip on the cable and swings about the hanger pin: `swingDeg` about the
 * cable in gusts, a pitch kick when it brakes or pulls away. The cable itself is part of the
 * static mail-cable mesh (render/mail-lines.ts).
 */
export interface BeaconLinesView {
  group: THREE.Group;
  loops: CableLoop[];
  update(time: number, camPos: THREE.Vector3): void;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);
const _pin = new THREE.Vector3();

export function createBeaconLines(
  world: WorldData,
  quality: Quality,
  scope: Scope,
): BeaconLinesView | null {
  const loops = cableLoops(world.islands);
  if (!loops.length) return null;
  const G = M.gondola;
  const group = new THREE.Group();
  group.name = 'beacon-lines';
  const features = { instanced: true, dither: true, emissive: true, rim: true };
  const mat = scope.add(
    makeLitMaterial(features, { fadeNear: G.fadeNear, fadeFar: G.fadeFar, name: 'beacon-lines' }),
  );
  // cabin k takes livery k % 2
  const per = [0, 1].map((v) => loops.length * Math.ceil((G.count - v) / 2));
  const meshes = K.gondola.variants.map((variant, v) => {
    const m = new THREE.InstancedMesh(
      scope.add(buildProp('mailLine', world.seed, variant, 0)),
      mat,
      Math.max(1, per[v]),
    );
    m.name = `gondolas-${v}`;
    m.castShadow = quality !== 'low';
    if (m.castShadow) m.customDepthMaterial = scope.add(makeDepthMaterial(features, mat.fade));
    m.frustumCulled = true;
    m.count = per[v];
    scope.add(m);
    group.add(m);
    return m;
  });
  const centres = loops.map((L) => {
    const p = L.pieces[Math.floor(L.pieces.length / 4)];
    const a = p.kind === 'span' ? p.a : p.c;
    return new THREE.Vector3(a.x, a.y, a.z);
  });
  const pose = newGondolaPose();
  const deg = Math.PI / 180;
  const grip = K.gondola.grip;
  const pin = K.gondola.pin;
  const update = (time: number, camPos: THREE.Vector3): void => {
    const far = G.fadeFar + 60;
    group.visible = centres.some((c) => c.distanceToSquared(camPos) < far * far);
    if (!group.visible) return;
    const motion = SHARED.uMotionScale.value;
    const n = [0, 0];
    loops.forEach((L, li) => {
      for (let k = 0; k < G.count; k++) {
        gondolaPose(L, k, time, pose);
        // gusts: two incommensurate sines per cabin, the swing about the cable (local z)
        const g =
          0.6 * Math.sin(time * 0.9 + k * 2.3 + li) + 0.4 * Math.sin(time * 2.1 + k * 1.1 + 0.7);
        const roll = G.swingDeg * deg * motion * g;
        // a pitch kick about the cabin's x when the grip brakes / pulls away
        const pitch = -Math.max(-1, Math.min(1, pose.dv / 0.15)) * G.kickDeg * deg * motion;
        const yaw = Math.PI / 2 - pose.heading;
        _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'));
        // the hanger pin hangs `grip − pin` under the grip; the cabin swings about it
        _pin.set(pose.x, pose.y - (grip - pin), pose.z);
        _p.set(0, pin, 0).applyQuaternion(_q);
        _p.subVectors(_pin, _p);
        const v = k % 2;
        meshes[v].setMatrixAt(n[v]++, _m.compose(_p, _q, _s));
      }
    });
    for (const m of meshes) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  };
  update(0, centres[0]);
  return { group, loops, update };
}
