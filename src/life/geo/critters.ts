import type * as THREE from 'three';
import { hex, TriBuilder, v3 } from './builder.ts';

/**
 * First-wave theme creatures, forward +x, up +y, right +z. Built in final u, flat-shaded; the
 * limb tags follow `life-material.ts` (duck tail = mode 2, head dip = mode 4).
 */
const WHITE = hex('#FFFFFF');

/** Duck ≈ 90 tris, origin on the water: white body (instance tint), orange beak, dark eyes, wagging tail. */
export function buildDuck(): THREE.BufferGeometry {
  const b = new TriBuilder();
  const beak = hex('#FF9A3C');
  const eye = hex('#2B2B36');
  b.clearLimb();
  b.ellipsoid(v3(0, 0.13, 0), 0.24, 0.13, 0.17, 7, 4, () => WHITE);
  // folded wings
  for (const s of [1, -1])
    b.ellipsoid(v3(-0.03, 0.18, 0.13 * s), 0.14, 0.08, 0.05, 5, 3, () => WHITE);
  // tail wags sideways about its root
  b.setLimb(0.5, 0.14, 0, 2);
  b.ellipsoid(v3(-0.25, 0.2, 0), 0.08, 0.06, 0.06, 5, 3, () => WHITE);
  // head + beak dip about the neck (dabbling)
  b.setLimb(1.0, 0.24, 0.17, 4);
  b.ellipsoid(v3(0.18, 0.31, 0), 0.1, 0.1, 0.1, 6, 4, () => WHITE);
  const tip = v3(0.38, 0.29, 0);
  const inside = v3(0.28, 0.3, 0);
  const corners = [v3(0.26, 0.33, 0.05), v3(0.26, 0.33, -0.05), v3(0.26, 0.26, 0)];
  b.triOut(corners[0], corners[1], tip, inside, beak);
  b.triOut(corners[1], corners[2], tip, inside, beak);
  b.triOut(corners[2], corners[0], tip, inside, beak);
  for (const s of [1, -1])
    b.ellipsoid(v3(0.23, 0.34, 0.075 * s), 0.02, 0.025, 0.02, 4, 2, () => eye);
  b.clearLimb();
  return b.finish();
}

/**
 * Butterfly ≈ 30 tris: double-sided wing triangles (white = instance tint), a dark body. The
 * wingspan lies along z, so the CPU wing beat squashes `scale.z`. Mode 6 with glyph 0 is the limb
 * tag that leaves every vertex untouched for an instance with a default `aGait`.
 */
export function buildButterfly(): THREE.BufferGeometry {
  const b = new TriBuilder();
  const body = hex('#4A3F55');
  const dot = hex('#FFFFFF').multiplyScalar(0.94);
  b.setLimb(0, 0, 0, 6);
  const wing = (a: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, col: THREE.Color): void => {
    b.tri(a, c, d, col);
    b.tri(a, d, c, col);
  };
  for (const s of [1, -1]) {
    wing(v3(0.04, 0, 0.02 * s), v3(0.17, 0, 0.36 * s), v3(-0.08, 0, 0.27 * s), WHITE);
    wing(v3(-0.02, 0, 0.02 * s), v3(-0.08, 0, 0.27 * s), v3(-0.17, 0, 0.12 * s), dot);
  }
  b.ellipsoid(v3(0, 0, 0), 0.14, 0.035, 0.035, 5, 3, () => body);
  b.clearLimb();
  return b.finish();
}
