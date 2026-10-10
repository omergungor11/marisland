import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { Quality } from '../core/params.ts';
import { PROP_DEF_INDEX } from '../content/props.ts';
import { QA_FACTORY, QA_MOVERS } from '../content/themes/qa.ts';
import type { PropStore } from '../world/prop-store.ts';
import { buildCrateCart } from '../geo/themes/qa-factory.ts';
import { cartAt, trackPath } from '../geo/themes/qa-track.ts';
import { makeDepthMaterial, makeLitMaterial } from './materials/factory.ts';

/**
 * Closed-form movers of the QA Test Factory (M17b TASK-401): one crate per conveyor segment riding
 * the belt (local +z, wrapping at the segment end, so a bridge of segments reads as one steady
 * stream) and one test cart per loop track. One InstancedMesh on the shared lit program (drones'
 * features, no new program); every pose is a function of the sim time only, so captures freeze
 * them. Not life agents. Hidden (no draw call) while the camera is past the dither fade.
 * Placed from the settlement prop store at build time: props moved in edit mode keep their movers
 * where they were (like FIXTURE_EMITTERS before re-grounding).
 */
export interface MoversView {
  /** Null when the world has no conveyors or tracks. */
  mesh: THREE.InstancedMesh | null;
  update(time: number, camPos: THREE.Vector3): void;
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

export function createMovers(store: PropStore, quality: Quality, scope: Scope): MoversView {
  const beltDef = PROP_DEF_INDEX.conveyor;
  const trackDef = PROP_DEF_INDEX.testTrack;
  const belts: Belt[] = [];
  const tracks: THREE.Matrix4[] = [];
  for (let i = 0; i < store.count; i++) {
    if (store.defId[i] === beltDef) belts.push({ m: pivotOf(store, i) });
    else if (store.defId[i] === trackDef) tracks.push(pivotOf(store, i));
  }
  const n = belts.length + tracks.length;
  if (n === 0) return { mesh: null, update: () => undefined };
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
  const beltY = QA_FACTORY.belt.top - QA_FACTORY.crate.chassis;
  const railY = QA_FACTORY.track.railY + QA_FACTORY.track.rail;
  const cs = QA_MOVERS.cartScale;
  // the visibility test: every pivot's distance to the camera against the fade far edge
  const centres = [...belts.map((b) => b.m), ...tracks].map((m) =>
    new THREE.Vector3().setFromMatrixPosition(m),
  );
  const update = (time: number, camPos: THREE.Vector3): void => {
    const far = QA_MOVERS.fadeFar + 20;
    mesh.visible = centres.some((c) => c.distanceToSquared(camPos) < far * far);
    if (!mesh.visible) return;
    const dz = beltOffset(time);
    belts.forEach((b, k) => {
      _l.makeTranslation(0, beltY, dz);
      mesh.setMatrixAt(k, _m.multiplyMatrices(b.m, _l));
    });
    const { i, f } = cartAt(path, time);
    const j = (i + 1) % path.p.length;
    const lerp3 = (a: number[], b: number[], out: THREE.Vector3): THREE.Vector3 =>
      out.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
    lerp3(path.t[i], path.t[j], _z).normalize();
    lerp3(path.u[i], path.u[j], _y).normalize();
    _x.crossVectors(_y, _z).normalize();
    _y.crossVectors(_z, _x);
    lerp3(path.p[i], path.p[j], _p).addScaledVector(_y, railY);
    _l.makeBasis(_x.multiplyScalar(cs), _y.multiplyScalar(cs), _z.multiplyScalar(cs)).setPosition(
      _p,
    );
    tracks.forEach((t, k) => mesh.setMatrixAt(belts.length + k, _m.multiplyMatrices(t, _l)));
    mesh.instanceMatrix.needsUpdate = true;
  };
  // bounds once (crates stay within their segments, carts within their tracks)
  update(0, centres[0]);
  mesh.computeBoundingSphere();
  if (mesh.boundingSphere) mesh.boundingSphere.radius += 8;
  return { mesh, update };
}
