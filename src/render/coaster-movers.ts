import * as THREE from 'three';
import type { Quality } from '../core/params.ts';
import type { Scope } from '../core/scope.ts';
import { QA_COASTER as F, QA_COASTER_MOTION as M } from '../content/themes/qa-coaster.ts';
import { buildProp } from '../geo/index.ts';
import type { Lod } from '../geo/types.ts';
import { coasterKitOf, type CoasterKit } from '../world/coaster-kit.ts';
import { newCoasterSample } from '../world/coaster-spline.ts';
import type { WorldData } from '../world/types.ts';
import {
  arrivalNod,
  bumperFrame,
  carSample,
  coasterStateAt,
  createCoasterShow,
  newBumperFrame,
  newCoasterState,
  seatPop,
  type CoasterShow,
} from './coaster-motion.ts';
import { makeLitMaterial } from './materials/factory.ts';

/**
 * The Thrill Test Park's movers (M32 TASK-541, D-122): the train with its dummy / capped bot riders
 * and the bumper cars, all geo-only meshes in the lit instanced program the cargo ships use (no new
 * program), one InstancedMesh per (geo, variant, LOD) built on first use. Riders are car-attached
 * instances, not agents. Nothing draws past `range`; LOD1 past the plan's `lod0`; no shadow pass.
 * Kit frame × the site's pivot (the track prop's matrix), so the whole kit scales with the site.
 */
export interface CoasterMoversView {
  group: THREE.Group;
  update(day: number, time: number, camPos: THREE.Vector3): void;
  /** Instances drawn last frame (tests, debugging). */
  stats(): { instances: number };
}

const _m = new THREE.Matrix4();
const _c = new THREE.Matrix4();
const _l = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _axisY = new THREE.Vector3(0, 1, 0);
const _axisX = new THREE.Vector3(1, 0, 0);
const _nod = new THREE.Matrix4();

/** The world matrix of the kit frame: a prop at the site's origin (three's rotation.y = π/2 − rotY). */
export function coasterPivot(kit: CoasterKit): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(kit.origin.x, kit.groundY, kit.origin.z),
    new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.atan2(Math.cos(kit.rotY), Math.sin(kit.rotY)),
    ),
    new THREE.Vector3(kit.scale, kit.scale, kit.scale),
  );
}

interface Pool {
  meshes: Partial<Record<Lod, THREE.InstancedMesh>>;
  n: number;
  /** Mesh written this frame. */
  cur: THREE.InstancedMesh | null;
}

export function createCoasterMovers(
  world: WorldData,
  quality: Quality,
  scope: Scope,
): CoasterMoversView | null {
  const isl = world.islands.find((i) => i.theme === 'qa');
  const kit = isl ? coasterKitOf(isl) : null;
  if (!kit) return null;
  const plan = M.plan[quality];
  const group = new THREE.Group();
  group.name = 'coaster-movers';
  const mat = scope.add(
    makeLitMaterial(
      { instanced: true, dither: true, emissive: true, rim: true },
      { fadeNear: plan.fadeNear, fadeFar: plan.fadeFar, name: 'coaster-movers' },
    ),
  );
  const pivot = coasterPivot(kit);
  const show: CoasterShow = createCoasterShow(kit, plan.cars);
  const st = newCoasterState();
  const frame = newBumperFrame(plan.bumpers);
  const smp = newCoasterSample();
  const seats = 2;
  const pools = new Map<string, Pool>();
  const capOf: Record<string, number> = {
    coasterCar: plan.cars,
    coasterRider: plan.cars * seats + plan.bumpers,
    bumperCar: plan.bumpers,
  };
  const pool = (id: string, v: number): Pool => {
    const key = `${id}:${v}`;
    let p = pools.get(key);
    if (!p) pools.set(key, (p = { meshes: {}, n: 0, cur: null }));
    return p;
  };
  const meshOf = (id: string, v: number, lod: Lod): THREE.InstancedMesh => {
    const p = pool(id, v);
    let mesh = p.meshes[lod];
    if (!mesh) {
      const geo = scope.add(buildProp(id, world.seed, v, lod));
      mesh = new THREE.InstancedMesh(geo, mat, capOf[id]);
      mesh.name = `coaster:${id}:${v}:L${lod}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.visible = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scope.add(mesh);
      group.add(mesh);
      p.meshes[lod] = mesh;
    }
    return mesh;
  };
  const put = (id: string, v: number, lod: Lod, m: THREE.Matrix4): void => {
    const p = pool(id, v);
    const mesh = meshOf(id, v, lod);
    if (p.cur !== mesh) {
      p.cur = mesh;
      p.n = 0;
    }
    if (p.n >= capOf[id]) return;
    mesh.setMatrixAt(p.n++, m);
  };
  let drawn = 0;
  const flush = (): void => {
    drawn = 0;
    for (const p of pools.values()) {
      for (const mesh of Object.values(p.meshes)) {
        const on = mesh === p.cur && p.n > 0;
        mesh.visible = on;
        mesh.count = on ? p.n : 0;
        if (on) {
          drawn += p.n;
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingSphere();
        }
      }
      p.cur = null;
      p.n = 0;
    }
  };
  /** A rider sits at the car's seat hook: car matrix × seat offset × pop scale. */
  const seatList = F.car;
  return {
    group,
    update(day, time, camPos) {
      const dist = camPos.distanceTo(_p.set(kit.origin.x, kit.groundY, kit.origin.z));
      if (dist > plan.range) {
        flush();
        return;
      }
      const lod: Lod = dist < plan.lod0 ? 0 : 1;
      coasterStateAt(show, day, st);
      const nod = arrivalNod(st.lap < 0 ? st.sinceStop : -1);
      const parked = st.lap < 0;
      const I = M.idle;
      let seatK = 0;
      for (let k = 0; k < plan.cars; k++) {
        carSample(kit, st.u, k, smp);
        _x.set(smp.side[0], smp.side[1], smp.side[2]);
        _y.set(smp.up[0], smp.up[1], smp.up[2]);
        _z.set(smp.tangent[0], smp.tangent[1], smp.tangent[2]);
        _c.makeBasis(_x, _y, _z);
        _c.setPosition(smp.pos[0], smp.pos[1], smp.pos[2]);
        if (nod !== 0) _c.multiply(_nod.makeRotationAxis(_axisX, nod));
        _m.multiplyMatrices(pivot, _c);
        // mint first and last, yellow between (the fixture's train)
        put('coasterCar', k % 2, lod, _m);
        for (const sx of [1, -1]) {
          const s = seatK % 2;
          const scale =
            st.bots > 0 && st.dummy <= 0
              ? seatPop(st.sinceBoard, seatK) * st.bots
              : st.bots > 0
                ? st.bots
                : st.dummy;
          const bots = st.bots > 0 && st.dummy <= 0;
          seatK++;
          if (scale < 0.01) continue;
          // parked: arms down (variant + 3) and a slow breath + bob, closed form on the sim clock (TASK-559)
          const ph = time * I.hz * Math.PI * 2 + (seatK - 1) * I.phase;
          const idle = parked ? Math.sin(ph) : 0;
          _l.compose(
            _p.set(sx * seatList.seatX, seatList.seatY + I.bob * idle, seatList.seatZ),
            _q.identity(),
            _s.set(scale, scale * (1 + I.breath * idle), scale),
          );
          _m.multiplyMatrices(pivot, _c).multiply(_l);
          put('coasterRider', (bots ? 1 + s : 0) + (parked ? 3 : 0), lod, _m);
        }
      }
      // bumper cars + their drivers
      const R = kit.rink;
      const B = M.bumpers;
      if (plan.bumpers > 0) {
        bumperFrame(time, plan.bumpers, R.w, R.d, world.seed, frame);
        const y0 = R.y + F.rink.floorH;
        frame.cars.forEach((c, i) => {
          _q.setFromAxisAngle(_axisY, c.yaw);
          _c.compose(
            _p.set(R.x + c.x, y0, R.z + c.z),
            _q,
            _s.set(1 + c.squash * 0.5, 1, 1 - c.squash),
          );
          _m.multiplyMatrices(pivot, _c);
          put('bumperCar', i % 3, lod, _m);
          _l.compose(_p.set(0, B.rider.y, B.rider.z), _q.identity(), _s.setScalar(B.rider.scale));
          _m.multiplyMatrices(pivot, _c).multiply(_l);
          put('coasterRider', 1 + (i % 2), lod, _m);
        });
      }
      flush();
    },
    stats: () => ({ instances: drawn }),
  };
}
