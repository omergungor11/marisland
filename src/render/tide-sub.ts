import * as THREE from 'three';
import { RESEARCH_HARBOUR_MOTION } from '../content/themes/research-harbour-site.ts';
import type { Scope } from '../core/scope.ts';
import { buildProp } from '../geo/index.ts';
import type { WorldData } from '../world/types.ts';
import { makeLitMaterial } from './materials/factory.ts';
import { newSubPose, subPathOf, subPose } from './tide-lab-motion.ts';

/**
 * The Research yellow submersible (M31 TASK-534): a geo-only mover (`tideSub`), one instance in the
 * lit instanced program the cargo ships use (no new program), one draw call, none while it lies on
 * the bottom or the camera is past `range`. No shadow pass: it floats on water that shows none.
 */
export interface TideSubView {
  mesh: THREE.InstancedMesh;
  update(day: number, time: number, camPos: THREE.Vector3): void;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();

export function createTideSub(world: WorldData, scope: Scope): TideSubView | null {
  const isl = world.islands.find((i) => i.theme === 'research');
  const P = isl ? subPathOf(isl) : null;
  if (!P) return null;
  const S = RESEARCH_HARBOUR_MOTION.sub;
  const geo = scope.add(buildProp('tideSub', world.seed, 0, 0));
  const mat = scope.add(
    makeLitMaterial(
      { instanced: true, dither: true, emissive: true, rim: true },
      { fadeNear: S.fadeNear, fadeFar: S.fadeFar, name: 'tide-sub' },
    ),
  );
  const mesh = new THREE.InstancedMesh(geo, mat, 1);
  mesh.name = 'tide-sub';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scope.add(mesh);
  const pose = newSubPose();
  return {
    mesh,
    update(day, time, camPos) {
      subPose(P, day, pose);
      mesh.visible =
        pose.phase !== 'down' && camPos.distanceTo(_p.set(pose.x, 0, pose.z)) < S.range;
      if (!mesh.visible) return;
      const w = (time / S.bobPeriod) * Math.PI * 2;
      _p.set(pose.x, pose.y + S.bob * Math.sin(w), pose.z);
      // local +z = (cos heading, sin heading)
      const yaw = Math.atan2(Math.cos(pose.heading), Math.sin(pose.heading));
      _q.setFromEuler(_e.set(pose.pitch, yaw, S.roll * Math.sin(w + 0.8), 'YXZ'));
      mesh.setMatrixAt(0, _m.compose(_p, _q, _s));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    },
  };
}
