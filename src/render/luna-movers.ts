import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import { LUNA_MOTION as M } from '../content/life-luna.ts';
import { LUNA_KIT } from '../content/themes/marketing-luna.ts';
import { buildProp } from '../geo/registry.ts';
import {
  boatPoses,
  carouselTurns,
  dropHeight,
  frameToDeck,
  makeBoatRig,
  makeTrainClock,
  newBoatPoses,
  ridePhase,
  spinShare,
  spinTurns,
  trainCentres,
  type BoatRig,
  type LunaFrame,
  type TrainClock,
} from '../life/luna-motion.ts';
import { newCoasterSample, sampleCoaster } from '../world/coaster-spline.ts';
import type { WorldData } from '../world/types.ts';
import { SHARED } from './uniforms.ts';
import { makeLitMaterial } from './materials/factory.ts';

/**
 * The sea-top fun park's moving parts (M53 TASK-672, D-172): the chain swing's canopy and chairs,
 * the drop tower's gondola, the carousel platform, the worm train on the mini coaster and the
 * bumper boats, as instanced meshes (one draw call each) on the shared lit program, posed every
 * frame from closed-form functions of the sim time (life/luna-motion.ts; numbers
 * content/life-luna.ts). The park wheel is the land fair's `ferrisWheel`; its rotor is turned by
 * render/movers.ts. Not agents, no shadow pass (like the wheel rotor), hidden past `LUNA_MOTION.far`.
 * A mover's matrix is base * translate(at) * motion (content/themes/marketing-luna.ts); the bases
 * come from the plan's anchors (world/gen/plans/marketing-luna.ts), whose rotY is the store heading
 * (three yaw = pi/2 - rotY). Bulbs on the rotors glow on the shared lamp ramp (emissive vertices).
 * Reduced motion (`uMotionScale`) slows every clock and shrinks the bob / roll.
 */
export interface LunaMoversView {
  group: THREE.Group;
  update(time: number, camPos: THREE.Vector3): void;
}

const _m = new THREE.Matrix4();
const _l = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _qy = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _ay = new THREE.Vector3(0, 1, 0);
const _az = new THREE.Vector3(0, 0, 1);
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const TAU = Math.PI * 2;

type Anchor = { x: number; z: number; rotY: number; y?: number };

/** Base matrix of a fixture anchor: pivot on the plank top, three yaw from the store heading. */
function baseOf(a: Anchor): THREE.Matrix4 {
  _qy.setFromAxisAngle(_ay, Math.PI / 2 - a.rotY);
  return new THREE.Matrix4().compose(_p.set(a.x, a.y ?? 0, a.z), _qy, _s.set(1, 1, 1));
}

/** base * translate(at.x, y, at.z) * rotY(yaw) * scale(sxz, 1, sxz) into `_m`. */
function rotor(
  base: THREE.Matrix4,
  at: readonly [number, number, number],
  y: number,
  yaw: number,
  sxz: number,
): THREE.Matrix4 {
  _qy.setFromAxisAngle(_ay, yaw);
  _l.compose(_p.set(at[0], y, at[2]), _qy, _s.set(sxz, 1, sxz));
  return _m.multiplyMatrices(base, _l);
}

export function createLunaMovers(world: WorldData, scope: Scope): LunaMoversView | null {
  const isl = world.islands.find((i) => i.anchors.lunaDeck);
  if (!isl) return null;
  const A = isl.anchors;
  const seed = world.seed;
  const K = LUNA_KIT;
  const group = new THREE.Group();
  group.name = 'luna-movers';
  const features = { instanced: true, dither: true, emissive: true, rim: true };
  // no dither fade of its own: the group is hidden past `far` (the wheel rotor's way)
  const mat = scope.add(
    makeLitMaterial(features, { fadeNear: 4000, fadeFar: 5000, name: 'luna-movers' }),
  );
  const meshes: THREE.InstancedMesh[] = [];
  const add = (geo: string, variant: number, count: number, name: string): THREE.InstancedMesh => {
    const mesh = new THREE.InstancedMesh(scope.add(buildProp(geo, seed, variant, 0)), mat, count);
    mesh.name = name;
    mesh.castShadow = false;
    scope.add(mesh);
    group.add(mesh);
    meshes.push(mesh);
    return mesh;
  };

  // ---- the three rides
  const swingBase = A.lunaSwing ? baseOf(A.lunaSwing) : null;
  const dropBase = A.lunaDrop ? baseOf(A.lunaDrop) : null;
  const carBase = A.lunaCarousel ? baseOf(A.lunaCarousel) : null;
  const swing = swingBase
    ? add(K.ride.swing.top.geo, K.ride.swing.top.variant, 1, 'luna-swing')
    : null;
  const drop = dropBase ? add(K.ride.drop.car.geo, K.ride.drop.car.variant, 1, 'luna-drop') : null;
  const carousel = carBase
    ? add(K.ride.carousel.top.geo, K.ride.carousel.top.variant, 1, 'luna-carousel')
    : null;
  const phase = {
    swing: ridePhase(seed, 0) * M.swing.cycle,
    drop: ridePhase(seed, 1) * M.drop.cycle,
    carousel: ridePhase(seed, 2) * M.carousel.gustT,
    train: ridePhase(seed, 3),
  };

  // ---- the coaster train: the head, then one mesh per car livery
  const coBase = A.lunaCoaster ? baseOf(A.lunaCoaster) : null;
  let clock: TrainClock | null = null;
  const trainMeshes: THREE.InstancedMesh[] = [];
  if (coBase) {
    clock = makeTrainClock(K.coasterLengths[A.lunaDeckFrame ? A.lunaDeckFrame.z : 1]);
    const T = K.train;
    trainMeshes.push(add(T.head.geo, T.head.variant, 1, 'luna-train-head'));
    for (let k = 0; k < T.cars; k++) {
      const c = T.car[k % T.car.length];
      trainMeshes.push(add(c.geo, c.variant, 1, `luna-train-car${k}`));
    }
  }

  // ---- the bumper boats: livery i % 3
  let nBoats = 0;
  while (A[`lunaBoat${nBoats}`]) nBoats++;
  let rig: BoatRig | null = null;
  const boatMesh: (THREE.InstancedMesh | undefined)[] = [];
  const poses = newBoatPoses(nBoats);
  if (nBoats > 0 && A.lunaPoolSize) {
    const frame: LunaFrame = {
      cx: A.lunaDeck.x,
      cz: A.lunaDeck.z,
      ux: Math.cos(A.lunaDeck.rotY),
      uz: Math.sin(A.lunaDeck.rotY),
      mx: A.lunaDeckFrame && A.lunaDeckFrame.x < 0 ? -1 : 1,
    };
    const starts = Array.from({ length: nBoats }, (_, i) =>
      frameToDeck(frame, A[`lunaBoat${i}`].x, A[`lunaBoat${i}`].z),
    );
    rig = makeBoatRig(seed, frame, A.lunaPoolSize.x, A.lunaPoolSize.z, starts);
    K.boat.forEach((b, v) => {
      let n = 0;
      for (let i = 0; i < nBoats; i++) if (i % K.boat.length === v) n++;
      if (n > 0) boatMesh[v] = add(b.geo, b.variant, n, `luna-boat${v}`);
    });
  }

  const centre = new THREE.Vector3(A.lunaDeck.x, A.carnivalDeck?.y ?? 0, A.lunaDeck.z);
  const sample = newCoasterSample();
  const carS = new Float64Array(K.train.cars + 1);
  const used = new Array<number>(K.boat.length).fill(0);
  const reach = M.far + 60;

  const update = (time: number, camPos: THREE.Vector3): void => {
    group.visible = camPos.distanceToSquared(centre) < reach * reach;
    if (!group.visible) return;
    const m = SHARED.uMotionScale.value;
    const t = time * m;
    if (swing && swingBase) {
      const S = M.swing;
      const c = t + phase.swing;
      const share = spinShare(((c % S.cycle) + S.cycle) % S.cycle, S);
      const at = K.ride.swing.top.at;
      swing.setMatrixAt(
        0,
        rotor(swingBase, at, at[1], spinTurns(c, S) * TAU, 1 + S.fly * share * m),
      );
    }
    if (drop && dropBase) {
      const [lo, hi] = K.ride.drop.car.range ?? [0, 0];
      const at = K.ride.drop.car.at;
      drop.setMatrixAt(0, rotor(dropBase, at, dropHeight(t + phase.drop, lo, hi), 0, 1));
    }
    if (carousel && carBase) {
      const at = K.ride.carousel.top.at;
      carousel.setMatrixAt(
        0,
        rotor(carBase, at, at[1], carouselTurns(t + phase.carousel) * TAU, 1),
      );
    }
    if (clock && coBase) {
      trainCentres(clock.at(t + phase.train * clock.lap), carS);
      trainMeshes.forEach((mesh, k) => {
        sampleCoaster(clock.sp, carS[k], sample);
        _x.fromArray(sample.side);
        _y.fromArray(sample.up);
        _z.fromArray(sample.tangent);
        _l.makeBasis(_x, _y, _z).setPosition(sample.pos[0], sample.pos[1], sample.pos[2]);
        mesh.setMatrixAt(0, _m.multiplyMatrices(coBase, _l));
      });
    }
    if (rig) {
      boatPoses(rig, t, poses, m);
      used.fill(0);
      for (let i = 0; i < nBoats; i++) {
        const p = poses[i];
        const v = i % K.boat.length;
        _qy.setFromAxisAngle(_ay, p.yaw);
        _qy.multiply(_qz.setFromAxisAngle(_az, p.roll));
        _l.compose(_p.set(p.x, p.y, p.z), _qy, _s.set(1, 1, 1));
        (boatMesh[v] as THREE.InstancedMesh).setMatrixAt(used[v]++, _l);
      }
    }
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  };
  update(0, centre);
  return { group, update };
}
