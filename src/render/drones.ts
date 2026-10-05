import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { Quality } from '../core/params.ts';
import { createRng } from '../core/rng.ts';
import { DRONES } from '../content/activity.ts';
import { heightAt, type WorldData } from '../world/index.ts';
import { Acc } from '../geo/kit.ts';
import { baseBox, cylB, put } from '../geo/parts.ts';
import { makeDepthMaterial, makeLitMaterial } from './materials/factory.ts';

/**
 * Drone couriers (M14c TASK-384): small quadcopters ferrying a glowing packet between the HQ
 * and the other islands' docks. One InstancedMesh on the shared lit program (props' key, no new
 * program); every pose is a closed-form function of the sim time → deterministic frames.
 * Tier-gated twice: count per quality (none on low) and a dither fade by camera distance so
 * they only show at T2 / T3.
 */
export interface DronesView {
  /** Null when the quality tier has no drones or the world has no routes. */
  mesh: THREE.InstancedMesh | null;
  update(time: number): void;
}

interface Route {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  /** Horizontal leg length (u), flight time (s), full cycle (s), phase (s). */
  dist: number;
  fly: number;
  cycle: number;
  phase: number;
}

/** Quadcopter ≈ 1 u across, pivot at the body centre: body, 4 arms + rotor discs, packet below. */
export function buildDroneGeometry(): THREE.BufferGeometry {
  const acc = new Acc();
  put(acc, baseBox(0.42, 0.16, 0.42), [0, -0.08, 0], DRONES.body, { aoAmt: 0.1 });
  put(acc, baseBox(0.3, 0.05, 0.3), [0, 0.08, 0], DRONES.rotor, { aoAmt: 0 });
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    put(
      acc,
      baseBox(0.62, 0.04, 0.06),
      [Math.cos(a) * 0.3, -0.02, Math.sin(a) * 0.3],
      DRONES.body,
      {
        q,
        aoAmt: 0,
      },
    );
    put(
      acc,
      cylB(0.04, 0.04, 0.06, 5),
      [Math.cos(a) * 0.55, 0.0, Math.sin(a) * 0.55],
      DRONES.rotor,
      {
        aoAmt: 0,
      },
    );
    put(
      acc,
      cylB(0.2, 0.2, 0.015, 8),
      [Math.cos(a) * 0.55, 0.07, Math.sin(a) * 0.55],
      DRONES.rotor,
      {
        aoAmt: 0,
      },
    );
  }
  // tether + glowing packet (screen class: dim glow by day, full at night)
  put(acc, cylB(0.012, 0.012, 0.16, 3), [0, -0.3, 0], DRONES.rotor, { aoAmt: 0 });
  put(acc, baseBox(0.24, 0.2, 0.24), [0, -0.5, 0], DRONES.packet, {
    emissive: 2,
    aoAmt: 0,
    ao: () => 1,
  });
  return acc.finish(createRng(1).fork('drone-faces'), false, true);
}

/** Pads: the HQ hub plus every dock's outer end (world u, ground y). */
function routesOf(world: WorldData, n: number, seed: number): Route[] {
  const rng = createRng(seed).fork('drones');
  const hq = world.settlements.find((s) => s.theme === 'hq');
  const pads: Array<{ x: number; z: number; island: number }> = [];
  for (const d of world.docks) {
    const L = d.segments * 2 * 0.8;
    pads.push({ x: d.x + Math.cos(d.rotY) * L, z: d.z + Math.sin(d.rotY) * L, island: d.islandId });
  }
  if (!hq || !pads.length) return [];
  const home = { x: hq.hub.x, z: hq.hub.z, island: hq.islandId };
  const away = pads.filter((p) => p.island !== home.island);
  if (!away.length) return [];
  const ground = (x: number, z: number): number => Math.max(0, heightAt(world.height, x, z));
  const out: Route[] = [];
  for (let i = 0; i < n; i++) {
    // even drones: HQ ↔ a department dock; odd: dock ↔ dock (inter-department deliveries)
    const b = away[i % away.length];
    const a =
      i % 2 === 0 || away.length < 2
        ? home
        : away[(i + 1 + rng.int(0, away.length - 2)) % away.length];
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const fly = dist / DRONES.speed;
    const cycle = 2 * (fly + DRONES.dwell);
    out.push({
      ax: a.x,
      ay: ground(a.x, a.z) + DRONES.padY,
      az: a.z,
      bx: b.x,
      by: ground(b.x, b.z) + DRONES.padY,
      bz: b.z,
      dist,
      fly,
      cycle,
      phase: rng.range(0, cycle),
    });
  }
  return out;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3();

/** Pose of route `r` at time `t` into `_p` / `_q` (pure; exported shape for tests via `dronePose`). */
function pose(r: Route, t: number, k: number): void {
  let u = (t + r.phase) % r.cycle;
  if (u < 0) u += r.cycle;
  // [dwell at A][fly A→B][dwell at B][fly B→A]
  let from = 0;
  let s: number;
  let flying = false;
  if (u < DRONES.dwell) s = 0;
  else if (u < DRONES.dwell + r.fly) {
    flying = true;
    s = (u - DRONES.dwell) / r.fly;
  } else if (u < 2 * DRONES.dwell + r.fly) s = 1;
  else {
    flying = true;
    from = 1;
    s = (u - 2 * DRONES.dwell - r.fly) / r.fly;
  }
  // eased progress along the leg (still at both ends) and its speed
  const e = 0.5 - 0.5 * Math.cos(Math.PI * s);
  const v = flying ? ((Math.PI * 0.5 * Math.sin(Math.PI * s)) / r.fly) * r.dist : 0;
  const w = from === 0 ? e : 1 - e;
  const pr = from === 0 ? s : 1 - s;
  const x = r.ax + (r.bx - r.ax) * w;
  const z = r.az + (r.bz - r.az) * w;
  // climb out / descend in over `climb` seconds' worth of the leg
  const c = Math.min(0.45, (DRONES.climb * DRONES.speed) / Math.max(r.dist, 1));
  const lift = flying ? smooth(0, c, pr) * smooth(0, c, 1 - pr) : 0;
  const base = r.ay + (r.by - r.ay) * w;
  const y =
    base +
    (DRONES.cruiseY - base) * lift +
    DRONES.bob * Math.sin((t * 2 * Math.PI) / DRONES.bobPeriod + k * 1.7);
  _p.set(x, y, z);
  const dx = (r.bx - r.ax) * (from === 0 ? 1 : -1);
  const dz = (r.bz - r.az) * (from === 0 ? 1 : -1);
  // heading toward travel (model front = +z), nose down with speed
  _e.set(DRONES.bank * v, Math.atan2(dx, dz), 0);
  _q.setFromEuler(_e);
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** World position of drone `k` at time `t` (tests / harness). */
export function dronePosition(r: Route, t: number, k = 0): [number, number, number] {
  pose(r, t, k);
  return [_p.x, _p.y, _p.z];
}

export function createDrones(
  world: WorldData,
  quality: Quality,
  scope: Scope,
  seed: number,
): DronesView {
  const n = DRONES.count[quality];
  const routes = n > 0 ? routesOf(world, n, seed) : [];
  if (!routes.length) return { mesh: null, update: () => undefined };
  const features = { instanced: true, dither: true, emissive: true, rim: true };
  const geo = scope.add(buildDroneGeometry());
  const mat = scope.add(
    makeLitMaterial(features, {
      fadeNear: DRONES.fadeNear,
      fadeFar: DRONES.fadeFar,
      name: 'drones',
    }),
  );
  const mesh = new THREE.InstancedMesh(geo, mat, routes.length);
  mesh.name = 'drones';
  mesh.castShadow = quality !== 'low';
  mesh.customDepthMaterial = scope.add(makeDepthMaterial(features, mat.fade));
  scope.add(mesh);
  _s.setScalar(DRONES.scale);
  const update = (time: number): void => {
    routes.forEach((r, k) => {
      pose(r, time, k);
      mesh.setMatrixAt(k, _m.compose(_p, _q, _s));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };
  update(0);
  return { mesh, update };
}

export type { Route as DroneRoute };
export { routesOf as droneRoutes };
