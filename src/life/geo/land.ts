import type * as THREE from 'three';
import { LAND_COLORS as C } from '../../content/life.ts';
import { hex, TriBuilder, v3 } from './builder.ts';

/**
 * Land creatures, forward = +x, up = +y, right = +z, origin between the feet. Built in final u
 * (no instance scale), flat-shaded, chunky. Per-vertex `limb` tags drive the vertex shader:
 *   mode 0  leg / arm swing   limb = (amp, pivotY, phaseOffset, 0)
 *   mode 1  leg lift          limb = (amp, 0, phaseOffset, 1)
 *   mode 2  tail sway         limb = (amp, pivotY, phaseOffset, 2)
 *   mode 3  waving arm        limb = (raise rad, pivotY, pivotZ, 3)
 *   mode 4  head dip          limb = (dip rad, pivotY, pivotX, 4)
 *   mode 5  hat variant       limb = (variant, pivotY, 0, 5)
 * White vertices (1,1,1) take the instance tint; see `life-material.ts`.
 */

const WHITE = hex('#FFFFFF');

/** Villager ≈ 1.2 u tall: legs, shirt capsule, head, swinging arms (right arm waves), 3 hats. */
export function buildVillager(): THREE.BufferGeometry {
  const b = new TriBuilder();
  const trousers = hex(C.trousers);
  const skin = hex(C.skin);
  const eye = hex('#2B2B36');
  const legY = 0.17;
  // legs (swing about the hip)
  for (const side of [1, -1]) {
    b.setLimb(0.9 * side, 0.34, 0, 0);
    b.box(v3(0, legY, 0.095 * side), 0.075, legY, 0.065, trousers);
  }
  b.clearLimb();
  // torso: white = shirt tint
  b.ellipsoid(v3(0, 0.6, 0), 0.19, 0.28, 0.21, 7, 4, () => WHITE);
  // arms: left swings, right waves
  b.setLimb(-0.8, 0.8, 0, 0);
  b.box(v3(0, 0.62, -0.26), 0.05, 0.17, 0.05, WHITE);
  b.setLimb(0.8, 0.8, 0.26, 3);
  b.box(v3(0, 0.62, 0.26), 0.05, 0.17, 0.05, WHITE);
  b.clearLimb();
  // head
  b.ellipsoid(v3(0.01, 1.0, 0), 0.18, 0.18, 0.18, 7, 4, () => skin);
  for (const side of [1, -1])
    b.ellipsoid(v3(0.17, 1.02, 0.07 * side), 0.03, 0.035, 0.03, 4, 2, () => eye);
  // hats: variant 0 beanie, 1 straw, 2 hair bun
  b.setLimb(0, 1.14, 0, 5);
  b.ellipsoid(v3(0, 1.12, 0), 0.2, 0.14, 0.2, 7, 3, () => hex(C.beanie));
  b.ellipsoid(v3(0, 1.26, 0), 0.05, 0.05, 0.05, 4, 2, () => WHITE.clone().multiplyScalar(0.98));
  b.setLimb(1, 1.1, 0, 5);
  b.frustum(v3(0, 1.1, 0), 0.34, 0.3, 0.03, 8, hex(C.straw));
  b.frustum(v3(0, 1.13, 0), 0.17, 0.15, 0.13, 8, hex(C.straw), hex(C.straw));
  b.frustum(v3(0, 1.13, 0), 0.172, 0.172, 0.035, 8, hex(C.strawBand));
  b.setLimb(2, 1.1, 0, 5);
  b.ellipsoid(v3(-0.03, 1.12, 0), 0.19, 0.11, 0.2, 7, 3, () => hex(C.hair));
  b.ellipsoid(v3(-0.1, 1.27, 0), 0.07, 0.07, 0.07, 5, 3, () => hex(C.hair));
  b.clearLimb();
  return b.finish();
}

/** Sheep ≈ 0.85 long, 0.6 tall: lumpy wool blob, dark head (dips to graze) and legs. */
export function buildSheep(): THREE.BufferGeometry {
  const b = new TriBuilder();
  const dark = hex(C.sheepFace);
  const leg = hex(C.sheepLeg);
  const wool = hex(C.wool);
  b.ellipsoid(v3(0, 0.4, 0), 0.36, 0.25, 0.28, 8, 5, () => wool);
  // fluffy lumps
  b.ellipsoid(v3(0.1, 0.55, 0.1), 0.2, 0.16, 0.18, 6, 4, () => wool);
  b.ellipsoid(v3(-0.12, 0.56, -0.08), 0.2, 0.16, 0.18, 6, 4, () => wool);
  b.ellipsoid(v3(0.14, 0.5, -0.17), 0.16, 0.14, 0.14, 5, 3, () => wool);
  b.ellipsoid(v3(-0.38, 0.42, 0), 0.11, 0.11, 0.11, 5, 3, () => wool);
  // legs
  const swing = [
    [0.2, 0.12, 0.7],
    [0.2, -0.12, -0.7],
    [-0.2, 0.12, -0.7],
    [-0.2, -0.12, 0.7],
  ];
  for (const [x, z, a] of swing) {
    b.setLimb(a, 0.3, 0, 0);
    b.box(v3(x, 0.15, z), 0.04, 0.15, 0.04, leg);
  }
  // head (dips about the neck)
  b.setLimb(0.9, 0.46, 0.3, 4);
  b.ellipsoid(v3(0.43, 0.47, 0), 0.14, 0.13, 0.12, 6, 4, () => dark);
  for (const side of [1, -1]) {
    b.ellipsoid(v3(0.38, 0.52, 0.14 * side), 0.05, 0.03, 0.07, 4, 2, () => dark);
    b.ellipsoid(v3(0.54, 0.5, 0.05 * side), 0.025, 0.03, 0.025, 4, 2, () =>
      hex('#FFFFFF').multiplyScalar(0.9),
    );
  }
  b.ellipsoid(v3(0.38, 0.6, 0), 0.1, 0.07, 0.1, 5, 3, () => wool);
  b.clearLimb();
  return b.finish();
}

/** Cat ≈ 0.55 long: body, head with ears, four legs, a tail that sways. */
export function buildCat(): THREE.BufferGeometry {
  const b = new TriBuilder();
  const eye = hex(C.catEye);
  const nose = hex(C.catInner);
  b.ellipsoid(v3(0, 0.21, 0), 0.27, 0.13, 0.13, 7, 4, () => WHITE);
  b.ellipsoid(v3(0.28, 0.31, 0), 0.12, 0.11, 0.11, 6, 3, () => WHITE);
  for (const side of [1, -1]) {
    b.frustum(v3(0.27, 0.38, 0.065 * side), 0.045, 0, 0.09, 4, WHITE);
    b.ellipsoid(v3(0.385, 0.33, 0.05 * side), 0.016, 0.02, 0.016, 4, 2, () => eye);
  }
  b.ellipsoid(v3(0.395, 0.3, 0), 0.015, 0.012, 0.02, 4, 2, () => nose);
  const gait = [
    [0.17, 0.07, 0.8],
    [0.17, -0.07, -0.8],
    [-0.17, 0.07, -0.8],
    [-0.17, -0.07, 0.8],
  ];
  for (const [x, z, a] of gait) {
    b.setLimb(a, 0.16, 0, 0);
    b.box(v3(x, 0.08, z), 0.035, 0.08, 0.03, WHITE);
  }
  // tail: three stacked bars curling up from the rump
  b.setLimb(1.2, 0.2, 0, 2);
  b.box(v3(-0.29, 0.26, 0), 0.03, 0.06, 0.028, WHITE);
  b.box(v3(-0.31, 0.37, 0), 0.028, 0.055, 0.026, WHITE);
  b.box(v3(-0.3, 0.47, 0), 0.026, 0.05, 0.024, WHITE);
  b.clearLimb();
  return b.finish();
}

/** Crab ≈ 0.6 wide: flat shell, two claws (clack), six legs that tick, eye stalks. */
export function buildCrab(): THREE.BufferGeometry {
  const b = new TriBuilder();
  const shell = hex(C.crabShell);
  const leg = hex(C.crabLeg);
  const eye = hex(C.crabEye);
  b.ellipsoid(v3(0, 0.12, 0), 0.2, 0.1, 0.3, 8, 4, () => shell);
  for (const side of [1, -1]) {
    b.setLimb(0.9 * side, 0.16, 0, 0);
    b.box(v3(0.2, 0.15, 0.2 * side), 0.045, 0.03, 0.05, leg);
    b.ellipsoid(v3(0.3, 0.16, 0.22 * side), 0.09, 0.055, 0.075, 5, 3, () => shell);
  }
  // legs: three per side, lifting in alternation
  let k = 0;
  for (const side of [1, -1]) {
    for (const x of [0.11, 0, -0.11]) {
      b.setLimb(0.05, 0, (k++ % 2) * Math.PI, 1);
      b.box(v3(x, 0.06, 0.33 * side), 0.016, 0.03, 0.1, leg);
    }
  }
  b.clearLimb();
  for (const side of [1, -1]) {
    b.box(v3(0.14, 0.21, 0.09 * side), 0.012, 0.03, 0.012, leg);
    b.ellipsoid(v3(0.14, 0.255, 0.09 * side), 0.03, 0.03, 0.03, 4, 2, () => eye);
  }
  return b.finish();
}
