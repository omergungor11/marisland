import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { Quality } from '../core/params.ts';
import { PROP_DEF_INDEX } from '../content/props.ts';
import { QA_FACTORY, QA_MOVERS } from '../content/themes/qa.ts';
import { DEVOPS_MOVERS } from '../content/themes/devops.ts';
import { DEVOPS_WORKS } from '../content/props-themes/devops.ts';
import { DOCK } from '../content/settlements.ts';
import { MEDIA_MOVERS, MEDIA_ROCK } from '../content/themes/marketing.ts';
import type { PropStore } from '../world/prop-store.ts';
import type { WorldData, XZ } from '../world/types.ts';
import { buildCrateCart } from '../geo/themes/qa-factory.ts';
import { buildCargoShip } from '../geo/themes/devops-works.ts';
import { buildWheelRotor } from '../geo/themes/marketing-media.ts';
import { cartFrame, newCartFrame, trackPath } from '../geo/themes/qa-track.ts';
import { crashPath, landingSquash } from '../geo/themes/qa-crash.ts';
import { SHARED } from './uniforms.ts';
import { makeDepthMaterial, makeLitMaterial } from './materials/factory.ts';
import { pierLoop, shipPose, trainAt, type Loop } from './harbour-routes.ts';
import { createDevopsLines, type DevopsLinesView } from './devops-lines.ts';

/**
 * Closed-form movers of the QA Test Factory (M17b TASK-401): one crate per conveyor segment riding
 * the belt (local +z, wrapping at the segment end, so a bridge of segments reads as one steady
 * stream) and one test cart per loop track. One InstancedMesh on the shared lit program (drones'
 * features, no new program); every pose is a function of the sim time only, so captures freeze
 * them. Not life agents. Hidden (no draw call) while the camera is past the dither fade.
 * Placed from the settlement prop store at build time: props moved in edit mode keep their movers
 * where they were (like FIXTURE_EMITTERS before re-grounding).
 * TASK-405 (DevOps "Ember Works"): the crate-cart mesh also carries the ore trains on the foundry
 * rail lines (render/harbour-routes.ts trainAt; y from the rail segment props), and a second mesh
 * sails the cargo ships round a loop off each DevOps pier head (pierLoop / shipPose).
 * TASK-403: the Marketing ferris wheel rotors are a second InstancedMesh (same lit program) that
 * turns about each wheel's hub at MEDIA_MOVERS.wheelPeriod; a T0 silhouette, so it is drawn at
 * every distance.
 */
export interface MoversView {
  /** Null when the world has no conveyors, tracks or rail lines. */
  mesh: THREE.InstancedMesh | null;
  /** Cargo ships (null when no DevOps pier has a loop in water). */
  ships: THREE.InstancedMesh | null;
  /** Ferris wheel rotors; null when the world has no ferris wheel. */
  wheels: THREE.InstancedMesh | null;
  /** DevOps M25 funicular cars + ore buckets (TASK-507, render/devops-lines.ts); null without a world. */
  lines: DevopsLinesView | null;
  update(time: number, camPos: THREE.Vector3): void;
}

/** A foundry rail line: start, unit direction, length, rail-top heights sampled every 1 u. */
interface Rail {
  a: XZ;
  u: XZ;
  L: number;
  y: Float32Array;
}

/** Rail lines of `world` with their rail-top heights from the railTrack segment props. */
function railsOf(world: WorldData, store: PropStore): Rail[] {
  const def = PROP_DEF_INDEX.railTrack;
  const out: Rail[] = [];
  for (const f of world.fences) {
    if (f.kind !== 'rail' || f.points.length < 2) continue;
    const a = f.points[0];
    const b = f.points[f.points.length - 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1) continue;
    const u = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
    // segment centres on this line, by their projection
    const segs: [number, number][] = [];
    for (let i = 0; i < store.count; i++) {
      if (store.defId[i] !== def) continue;
      const dx = store.x[i] - a.x;
      const dz = store.z[i] - a.z;
      if (Math.abs(dx * -u.z + dz * u.x) > 0.5) continue;
      const s = dx * u.x + dz * u.z;
      if (s >= -1 && s <= L + 1) segs.push([s, store.y[i]]);
    }
    if (segs.length === 0) continue;
    segs.sort((p, q) => p[0] - q[0]);
    const y = new Float32Array(Math.ceil(L) + 1);
    for (let k = 0; k < y.length; k++) {
      let j = 0;
      while (j < segs.length - 1 && segs[j + 1][0] < k) j++;
      const [s0, y0] = segs[j];
      const [s1, y1] = segs[Math.min(segs.length - 1, j + 1)];
      const w = s1 > s0 ? Math.min(1, Math.max(0, (k - s0) / (s1 - s0))) : 0;
      y[k] = y0 + (y1 - y0) * w + DEVOPS_WORKS.rail.top;
    }
    out.push({ a, u, L, y });
  }
  return out;
}

/** Rail-top height at offset `s` along the rail (clamped). */
function railTop(r: Rail, s: number): number {
  const k = Math.min(r.y.length - 1, Math.max(0, s));
  const i = Math.max(0, Math.min(r.y.length - 2, Math.floor(k)));
  return r.y.length < 2 ? r.y[0] : r.y[i] + (r.y[i + 1] - r.y[i]) * (k - i);
}

interface Belt {
  m: THREE.Matrix4;
}

const _m = new THREE.Matrix4();
const _l = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _axis = new THREE.Vector3(0, 1, 0);

/** Prop pivot matrix (position, yaw about +y, uniform scale) of store index `i`. */
function pivotOf(s: PropStore, i: number): THREE.Matrix4 {
  _q.setFromAxisAngle(_axis, s.rotY[i]);
  _p.set(s.x[i], s.y[i], s.z[i]);
  _s.setScalar(s.scale[i]);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

/** Crate offset along a belt segment at `time` (local z, pivot = segment centre). */
export function beltOffset(time: number): number {
  const L = QA_FACTORY.belt.seg;
  let f = (time * QA_MOVERS.beltSpeed) / L;
  f -= Math.floor(f);
  return (f - 0.5) * L;
}

/** Ferris wheel rotors: one instance per wheel, hub at (0, hubY, 0) of the frame, turning about local z. */
function createWheels(
  store: PropStore,
  scope: Scope,
): { mesh: THREE.InstancedMesh | null; update(time: number): void } {
  const def = PROP_DEF_INDEX.ferrisWheel;
  const hubs: THREE.Matrix4[] = [];
  for (let i = 0; i < store.count; i++)
    if (store.defId[i] === def)
      hubs.push(
        pivotOf(store, i).multiply(
          new THREE.Matrix4().makeTranslation(0, MEDIA_ROCK.wheel.hubY, 0),
        ),
      );
  if (hubs.length === 0) return { mesh: null, update: () => undefined };
  const features = { instanced: true, dither: true, emissive: true, rim: true };
  const mat = scope.add(
    makeLitMaterial(features, {
      fadeNear: MEDIA_MOVERS.fadeNear,
      fadeFar: MEDIA_MOVERS.fadeFar,
      name: 'wheels',
    }),
  );
  const mesh = new THREE.InstancedMesh(scope.add(buildWheelRotor()), mat, hubs.length);
  mesh.name = 'wheels';
  // no shadow pass: the open rotor's shadow is a few thin lines (one draw call less, W11 budget)
  mesh.castShadow = false;
  scope.add(mesh);
  const rot = new THREE.Matrix4();
  const update = (time: number): void => {
    rot.makeRotationZ((time / MEDIA_MOVERS.wheelPeriod) * Math.PI * 2);
    hubs.forEach((h, k) => mesh.setMatrixAt(k, _m.multiplyMatrices(h, rot)));
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  mesh.computeBoundingSphere();
  return { mesh, update };
}

export function createMovers(
  store: PropStore,
  quality: Quality,
  scope: Scope,
  world?: WorldData,
): MoversView {
  const wheels = createWheels(store, scope);
  const beltDef = PROP_DEF_INDEX.conveyor;
  const trackDef = PROP_DEF_INDEX.testTrack;
  const belts: Belt[] = [];
  const tracks: THREE.Matrix4[] = [];
  // M24 TASK-501: testTrack variant 1 is the figure-8 crash track (its own centreline and cart pose)
  const crashes: boolean[] = [];
  for (let i = 0; i < store.count; i++) {
    if (store.defId[i] === beltDef) belts.push({ m: pivotOf(store, i) });
    else if (store.defId[i] === trackDef) {
      tracks.push(pivotOf(store, i));
      crashes.push(store.variant[i] === 1);
    }
  }
  const rails = world ? railsOf(world, store) : [];
  const cars = DEVOPS_MOVERS.train.cars;
  const ships = world ? createShips(world, quality, scope) : null;
  const lines = world ? createDevopsLines(world, store, quality, scope) : null;
  const n = belts.length + tracks.length + rails.length * cars;
  if (n === 0)
    return {
      mesh: null,
      wheels: wheels.mesh,
      ships: ships?.mesh ?? null,
      lines,
      update: (t, c) => {
        wheels.update(t);
        ships?.update(t, c);
        lines?.update(t, c);
      },
    };
  const features = { instanced: true, dither: true, emissive: true, rim: true };
  const geo = scope.add(buildCrateCart());
  const mat = scope.add(
    makeLitMaterial(features, {
      fadeNear: QA_MOVERS.fadeNear,
      fadeFar: QA_MOVERS.fadeFar,
      name: 'movers',
    }),
  );
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.name = 'movers';
  mesh.castShadow = quality !== 'low';
  mesh.customDepthMaterial = scope.add(makeDepthMaterial(features, mat.fade));
  scope.add(mesh);
  const path = trackPath();
  const crash = crashPath();
  const loopFrame = newCartFrame();
  const crashFrame = newCartFrame();
  const beltY = QA_FACTORY.belt.top - QA_FACTORY.crate.chassis;
  const railY = QA_FACTORY.track.railY + QA_FACTORY.track.rail;
  const cs = QA_MOVERS.cartScale;
  // the visibility test: every pivot's distance to the camera against the fade far edge
  const centres = [...belts.map((b) => b.m), ...tracks].map((m) =>
    new THREE.Vector3().setFromMatrixPosition(m),
  );
  for (const r of rails)
    centres.push(new THREE.Vector3(r.a.x + (r.u.x * r.L) / 2, r.y[0], r.a.z + (r.u.z * r.L) / 2));
  const T = DEVOPS_MOVERS.train;
  const base = belts.length + tracks.length;
  const update = (time: number, camPos: THREE.Vector3): void => {
    wheels.update(time);
    ships?.update(time, camPos);
    lines?.update(time, camPos);
    const far = QA_MOVERS.fadeFar + 20;
    mesh.visible = centres.some((c) => c.distanceToSquared(camPos) < far * far);
    if (!mesh.visible) return;
    // ore trains: crate carts in a row along the rail, local +z along the line
    rails.forEach((r, ri) => {
      const [s0] = trainAt(r.L, time);
      for (let k = 0; k < cars; k++) {
        const s = s0 + k * T.gap;
        _p.set(r.a.x + r.u.x * s, railTop(r, s), r.a.z + r.u.z * s);
        _x.set(r.u.z * T.scale, 0, -r.u.x * T.scale);
        _y.set(0, T.scale, 0);
        _z.set(r.u.x * T.scale, 0, r.u.z * T.scale);
        _l.makeBasis(_x, _y, _z).setPosition(_p);
        mesh.setMatrixAt(base + ri * cars + k, _l);
      }
    });
    const dz = beltOffset(time);
    belts.forEach((b, k) => {
      _l.makeTranslation(0, beltY, dz);
      mesh.setMatrixAt(k, _m.multiplyMatrices(b.m, _l));
    });
    const motion = SHARED.uMotionScale.value;
    const poses = [cartFrame(path, time, loopFrame), cartFrame(crash, time, crashFrame)];
    const squash = landingSquash(crash, time, motion);
    tracks.forEach((t, k) => {
      const isCrash = crashes[k];
      const fr = poses[isCrash ? 1 : 0];
      const d = isCrash ? squash : 0;
      _p.set(fr.p[0], fr.p[1], fr.p[2]).addScaledVector(_y.set(fr.y[0], fr.y[1], fr.y[2]), railY);
      _x.set(fr.x[0], fr.x[1], fr.x[2]).multiplyScalar(cs * (1 + d * 0.5));
      _y.set(fr.y[0], fr.y[1], fr.y[2]).multiplyScalar(cs * (1 - d));
      _z.set(fr.z[0], fr.z[1], fr.z[2]).multiplyScalar(cs * (1 + d * 0.5));
      _l.makeBasis(_x, _y, _z).setPosition(_p);
      mesh.setMatrixAt(belts.length + k, _m.multiplyMatrices(t, _l));
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  // bounds once (crates stay within their segments, carts within their tracks)
  update(0, centres[0]);
  mesh.computeBoundingSphere();
  if (mesh.boundingSphere) mesh.boundingSphere.radius += 8;
  return { mesh, wheels: wheels.mesh, ships: ships?.mesh ?? null, lines, update };
}

/** Cargo ships (TASK-405): `perDock` per DevOps pier whose loop lies in water. */
function createShips(
  world: WorldData,
  quality: Quality,
  scope: Scope,
): { mesh: THREE.InstancedMesh; update(time: number, camPos: THREE.Vector3): void } | null {
  const S = DEVOPS_MOVERS.ship;
  const loops: Loop[] = [];
  for (const d of world.docks) {
    if (world.islands[d.islandId]?.theme !== 'devops') continue;
    const dir = { x: Math.cos(d.rotY), z: Math.sin(d.rotY) };
    const L = pierLoop(world.height, d, dir, d.segments * DOCK.segment);
    if (L) loops.push(L);
  }
  if (loops.length === 0) return null;
  const features = { instanced: true, dither: true, emissive: true, rim: true };
  const geo = scope.add(buildCargoShip());
  const mat = scope.add(
    makeLitMaterial(features, {
      fadeNear: DEVOPS_MOVERS.fadeNear,
      fadeFar: DEVOPS_MOVERS.fadeFar,
      name: 'ships',
    }),
  );
  const mesh = new THREE.InstancedMesh(geo, mat, loops.length * S.perDock);
  mesh.name = 'ships';
  mesh.castShadow = quality !== 'low';
  mesh.customDepthMaterial = scope.add(makeDepthMaterial(features, mat.fade));
  scope.add(mesh);
  const centres = loops.map(
    (L) =>
      new THREE.Vector3(
        L.a.x + L.t.x * L.len * 0.5 + L.f.x * L.r,
        0,
        L.a.z + L.t.z * L.len * 0.5 + L.f.z * L.r,
      ),
  );
  const update = (time: number, camPos: THREE.Vector3): void => {
    const far = DEVOPS_MOVERS.fadeFar + 20;
    mesh.visible = centres.some((c) => c.distanceToSquared(camPos) < far * far);
    if (!mesh.visible) return;
    loops.forEach((L, li) => {
      for (let k = 0; k < S.perDock; k++) {
        const p = shipPose(L, time, k, S.perDock);
        _x.set(p.hz, 0, -p.hx);
        _y.set(0, 1, 0);
        _z.set(p.hx, 0, p.hz);
        _p.set(p.x, 0.04 * Math.sin(time * 1.3 + k * 2.1 + li), p.z);
        _l.makeBasis(_x, _y, _z).setPosition(_p);
        mesh.setMatrixAt(li * S.perDock + k, _l);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0, centres[0]);
  mesh.computeBoundingSphere();
  if (mesh.boundingSphere) mesh.boundingSphere.radius += S.straight + S.turnR * 2;
  return { mesh, update };
}
