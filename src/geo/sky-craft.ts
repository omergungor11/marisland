import * as THREE from 'three';
import { createRng } from '../core/rng.ts';
import { SKY_CRAFT as C } from '../content/sky-craft.ts';
import { Acc, col } from './kit.ts';
import { baseBox, cylB, lathe, put, TAU } from './parts.ts';

/** Gores around the envelope; stripes cycle through `SKY_CRAFT.stripes`. */
const GORES = 12;

/**
 * Hot-air balloon, pivot at the envelope centre (envelope y −6 … +6.5, ≈ 10 u across, basket at
 * y ≈ −9). Pastel gores, cream mouth band, four ropes, burner with a glowing flame.
 */
export function buildBalloonGeometry(lod = 0): THREE.BufferGeometry {
  const acc = new Acc();
  const gores = lod > 0 ? 8 : GORES;
  const profile: Array<[number, number]> = [
    [0.95, -6.0],
    [2.2, -5.0],
    [3.6, -3.6],
    [4.6, -1.8],
    [4.9, 0.4],
    [4.4, 2.8],
    [3.2, 4.8],
    [1.6, 6.0],
    [0.001, 6.5],
  ];
  const stripes = C.stripes.map(col);
  const trim = col(C.trim);
  put(
    acc,
    lathe(profile, gores),
    [0, 0, 0],
    (p) => {
      if (p.y < -4.4) return trim;
      const a = (Math.atan2(p.x, p.z) + TAU) % TAU;
      return stripes[Math.floor((a / TAU) * gores) % stripes.length];
    },
    { aoAmt: 0.18 },
  );
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * TAU) / 4;
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(Math.sin(a) * 0.1, 0, -Math.cos(a) * 0.1),
    );
    put(acc, baseBox(0.07, 2.0, 0.07), [Math.cos(a) * 0.62, -7.95, Math.sin(a) * 0.62], C.rope, {
      q,
      aoAmt: 0,
    });
  }
  put(acc, cylB(0.22, 0.3, 0.35, 5), [0, -6.5, 0], C.burner, { aoAmt: 0 });
  put(acc, new THREE.ConeGeometry(0.22, 0.65, 5), [0, -5.95, 0], C.flame, {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
  put(acc, baseBox(1.5, 1.0, 1.5), [0, -9.2, 0], C.basket, { aoAmt: 0.25 });
  put(acc, baseBox(1.62, 0.12, 1.62), [0, -8.3, 0], C.rope, { aoAmt: 0 });
  return acc.finish(createRng(7).fork('balloon-faces'), false, true);
}

/**
 * Airship, pivot at the hull centre, nose toward +z (hull 26 u long, 8 u across). Cream hull with
 * a coloured band, four tail fins, a small gondola with lit windows.
 */
export function buildAirshipGeometry(lod = 0): THREE.BufferGeometry {
  const acc = new Acc();
  const A = C.airship;
  const L = 13;
  const R = 3.9;
  const steps = lod > 0 ? 6 : 8;
  const profile: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI;
    profile.push([Math.max(0.001, R * Math.sin(th)), L * Math.cos(th)]);
  }
  // lathe axis is y; roll it onto z (profile y = +L maps to z = +L, the nose)
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const hull = col(A.hull);
  const belly = col(A.belly);
  const band = col(A.band);
  put(
    acc,
    lathe(profile, lod > 0 ? 8 : 10),
    [0, 0, 0],
    (p) => (Math.abs(p.z - 2.2) < 1.3 ? band : p.y < -R * 0.35 ? belly : hull),
    { q, aoAmt: 0.2 },
  );
  for (let k = 0; k < 4; k++) {
    const a = (k * TAU) / 4;
    const fq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
    const off = new THREE.Vector3(0, 3.0, 0).applyQuaternion(fq);
    put(acc, baseBox(0.18, 3.4, 3.4), [off.x, off.y, off.z - 10.2], A.fins[k % 2], {
      q: fq,
      aoAmt: 0,
    });
  }
  put(acc, baseBox(1.5, 1.1, 4.4), [0, -4.7, 1.2], A.cabin, { aoAmt: 0.2 });
  put(acc, baseBox(0.12, 0.35, 1.7), [0, -3.85, 1.2], A.cabin, { aoAmt: 0 });
  for (const sx of [-1, 1])
    for (const z of [0.1, 1.5, 2.8])
      put(acc, baseBox(0.05, 0.4, 0.7), [sx * 0.76, -4.55, z], A.window, {
        emissive: 1,
        aoAmt: 0,
        ao: () => 1,
      });
  return acc.finish(createRng(8).fork('airship-faces'), false, true);
}
