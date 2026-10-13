import type * as THREE from 'three';
import { SPOT_LIFE } from '../../content/life-spot-critters.ts';
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
 * Capybara ≈ 110 tris, origin on the ground, forward +x: a long square-ish brown barrel (white =
 * instance tint, 2:1 from above), a blunt box head with a squared snout and dark nose, small dark ears,
 * stubby legs and a flat yellow cap with a band (a dome here read as a turtle shell from above).
 * The head and cap nod about the neck (mode 4) so it can doze off.
 */
export function buildCapybara(): THREE.BufferGeometry {
  const K = SPOT_LIFE.colors;
  const b = new TriBuilder();
  const belly = hex(K.capyBelly);
  const dark = hex(K.capyDark);
  const hat = hex(K.hat);
  const band = hex(K.hatBand);
  const eye = hex('#22222C');
  b.clearLimb();
  b.box(v3(-0.1, 0.27, 0), 0.4, 0.17, 0.19, WHITE);
  b.box(v3(-0.1, 0.12, 0), 0.36, 0.05, 0.17, belly);
  for (const [x, z] of [
    [0.18, 0.14],
    [0.18, -0.14],
    [-0.36, 0.14],
    [-0.36, -0.14],
  ])
    b.box(v3(x, 0.05, z), 0.06, 0.06, 0.055, dark);
  // head + cap nod about the neck (pivot x 0.28, y 0.3)
  b.setLimb(0.55, 0.3, 0.28, 4);
  b.box(v3(0.44, 0.33, 0), 0.15, 0.14, 0.13, WHITE);
  b.box(v3(0.62, 0.29, 0), 0.07, 0.1, 0.115, WHITE);
  b.box(v3(0.695, 0.31, 0), 0.015, 0.055, 0.09, dark);
  for (const s of [1, -1]) {
    b.ellipsoid(v3(0.34, 0.49, 0.11 * s), 0.03, 0.035, 0.03, 4, 2, () => dark);
    b.ellipsoid(v3(0.54, 0.38, 0.125 * s), 0.022, 0.026, 0.022, 4, 2, () => eye);
  }
  b.frustum(v3(0.42, 0.465, 0), 0.115, 0.105, 0.018, 10, band);
  b.frustum(v3(0.42, 0.483, 0), 0.1, 0.075, 0.04, 10, hat);
  b.clearLimb();
  return b.finish();
}

/**
 * Fox ≈ 140 tris, sitting (origin between the paws, forward +x): an orange haunch and chest
 * (white = instance tint), cream muzzle and chest, dark ears and socks, a bushy cream-tipped tail
 * curled along the ground (sways, mode 2) and a head that dips a little (mode 4).
 */
export function buildFox(): THREE.BufferGeometry {
  const K = SPOT_LIFE.colors;
  const b = new TriBuilder();
  const cream = hex(K.foxCream);
  const dark = hex(K.foxDark);
  const eye = hex('#22222C');
  b.clearLimb();
  b.ellipsoid(v3(-0.06, 0.17, 0), 0.24, 0.17, 0.17, 7, 4, () => WHITE);
  b.ellipsoid(v3(0.1, 0.31, 0), 0.13, 0.22, 0.12, 6, 4, (t) => (t > 0.4 ? cream : WHITE));
  for (const s of [1, -1]) b.box(v3(0.2, 0.06, 0.07 * s), 0.04, 0.06, 0.03, dark);
  // tail: base orange, tip cream, sways about its root
  b.setLimb(0.45, 0.12, 0, 2);
  b.ellipsoid(v3(-0.36, 0.1, 0.07), 0.18, 0.09, 0.09, 6, 3, () => WHITE);
  b.ellipsoid(v3(-0.52, 0.1, 0.1), 0.09, 0.07, 0.07, 5, 3, () => cream);
  // head
  b.setLimb(0.5, 0.5, 0.1, 4);
  b.ellipsoid(v3(0.15, 0.56, 0), 0.12, 0.1, 0.1, 6, 4, () => WHITE);
  b.ellipsoid(v3(0.26, 0.53, 0), 0.08, 0.05, 0.05, 5, 3, () => cream);
  b.ellipsoid(v3(0.33, 0.54, 0), 0.02, 0.02, 0.025, 4, 2, () => dark);
  for (const s of [1, -1]) {
    b.frustum(v3(0.1, 0.62, 0.06 * s), 0.045, 0, 0.13, 4, dark);
    b.ellipsoid(v3(0.23, 0.58, 0.06 * s), 0.015, 0.02, 0.015, 4, 2, () => eye);
  }
  b.clearLimb();
  return b.finish();
}

/**
 * Perched seabird ≈ 100 tris (gull; the pigeon is the same model tinted grey), forward +x, origin
 * under the belly: a plump white body (white = instance tint), grey folded wings and tail, a head
 * with an orange beak that pecks (mode 4 head dip about the neck).
 */
export function buildPerched(): THREE.BufferGeometry {
  const K = SPOT_LIFE.colors;
  const b = new TriBuilder();
  const wing = hex(K.birdWing);
  const tipc = hex(K.birdTip);
  const beak = hex('#FF9A3C');
  const eye = hex('#2B2B36');
  b.clearLimb();
  b.ellipsoid(v3(0, 0.2, 0), 0.3, 0.19, 0.21, 8, 4, () => WHITE);
  for (const s of [1, -1]) {
    b.ellipsoid(v3(-0.04, 0.25, 0.17 * s), 0.25, 0.11, 0.05, 6, 3, () => wing);
    b.ellipsoid(v3(-0.27, 0.23, 0.15 * s), 0.1, 0.05, 0.04, 4, 2, () => tipc);
    b.box(v3(0.02, 0.02, 0.07 * s), 0.03, 0.02, 0.012, beak);
  }
  b.ellipsoid(v3(-0.34, 0.22, 0), 0.13, 0.05, 0.09, 5, 3, () => wing);
  // head + beak dip about the neck
  b.setLimb(1.1, 0.3, 0.22, 4);
  b.ellipsoid(v3(0.27, 0.38, 0), 0.13, 0.12, 0.12, 6, 4, () => WHITE);
  const tip = v3(0.52, 0.34, 0);
  const inside = v3(0.36, 0.36, 0);
  const cs = [v3(0.36, 0.4, 0.045), v3(0.36, 0.4, -0.045), v3(0.36, 0.31, 0)];
  b.triOut(cs[0], cs[1], tip, inside, beak);
  b.triOut(cs[1], cs[2], tip, inside, beak);
  b.triOut(cs[2], cs[0], tip, inside, beak);
  for (const s of [1, -1])
    b.ellipsoid(v3(0.33, 0.42, 0.085 * s), 0.02, 0.025, 0.02, 4, 2, () => eye);
  b.clearLimb();
  return b.finish();
}

/**
 * Owl ≈ 120 tris, upright on its feet (origin under the body, forward +x): a round brown body
 * (white = instance tint) with a cream belly, a facial disc, two big eyes that glow at night
 * (per-vertex emissive), ear tufts, a hooked beak and folded wings.
 */
export function buildOwl(): THREE.BufferGeometry {
  const K = SPOT_LIFE.colors;
  const b = new TriBuilder();
  const cream = hex(K.owlCream);
  const wing = hex(K.owlWing);
  const gold = hex(K.owlEye);
  const beak = hex('#E8943C');
  b.clearLimb();
  b.ellipsoid(v3(0, 0.3, 0), 0.2, 0.3, 0.2, 8, 5, (t) => (t < 0.45 ? cream : WHITE));
  b.ellipsoid(v3(0.02, 0.68, 0), 0.21, 0.18, 0.22, 8, 4, () => WHITE);
  b.ellipsoid(v3(0.15, 0.68, 0), 0.07, 0.13, 0.16, 6, 3, () => cream);
  for (const s of [1, -1]) {
    b.ellipsoid(v3(-0.02, 0.32, 0.19 * s), 0.1, 0.23, 0.05, 6, 4, () => wing);
    b.frustum(v3(0.0, 0.8, 0.12 * s), 0.05, 0, 0.13, 4, wing);
    b.box(v3(0.1, 0.02, 0.07 * s), 0.07, 0.02, 0.025, beak);
  }
  b.ellipsoid(v3(-0.18, 0.1, 0), 0.07, 0.06, 0.1, 5, 3, () => wing);
  const tip = v3(0.3, 0.62, 0);
  const inside = v3(0.18, 0.66, 0);
  const corners = [v3(0.2, 0.67, 0.035), v3(0.2, 0.67, -0.035), v3(0.2, 0.58, 0)];
  b.triOut(corners[0], corners[1], tip, inside, beak);
  b.triOut(corners[1], corners[2], tip, inside, beak);
  b.triOut(corners[2], corners[0], tip, inside, beak);
  b.setEmissive(1);
  for (const s of [1, -1])
    b.ellipsoid(v3(0.2, 0.72, 0.085 * s), 0.035, 0.05, 0.05, 5, 3, () => gold);
  b.setEmissive(0);
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
