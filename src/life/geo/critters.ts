import * as THREE from 'three';
import { CRITTER_COLORS as C } from '../../content/life.ts';
import { hex, TriBuilder, v3 } from './builder.ts';

/**
 * Critter meshes (forward +x, up +y, right +z). Villagers/cats/sheep/crabs have their origin at
 * the ground contact; ducks/capybaras at the water surface. Flat-shaded vertex colours.
 */

/** Cone/frustum side fan: ring at y0 (radius r0) up to y1 (radius r1), `seg` sides. */
function frustum(
  b: TriBuilder,
  cx: number,
  cz: number,
  y0: number,
  r0: number,
  y1: number,
  r1: number,
  seg: number,
  col: THREE.Color,
  cap = false,
): void {
  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * Math.PI * 2;
    const a1 = ((s + 1) / seg) * Math.PI * 2;
    const p0 = v3(cx + Math.cos(a0) * r0, y0, cz + Math.sin(a0) * r0);
    const p1 = v3(cx + Math.cos(a1) * r0, y0, cz + Math.sin(a1) * r0);
    const q0 = v3(cx + Math.cos(a0) * r1, y1, cz + Math.sin(a0) * r1);
    const q1 = v3(cx + Math.cos(a1) * r1, y1, cz + Math.sin(a1) * r1);
    // outward (+r) normal: p1 - p0 is +tangent, q0 - p0 is up; tangent × up points outward (-r)... use p0,q0,q1,p1
    if (r1 < 1e-5) b.tri(p0, q0, p1, col);
    else b.quad(p0, q0, q1, p1, col);
    if (cap) b.tri(v3(cx, y1, cz), q1, q0, col);
  }
}

/**
 * Villager ≈ 70 tris, ~1.3 u tall: capsule body + head + pointed cap. Body and cap are white so
 * `instanceColor` (4 palette tints) dyes them; the face keeps its colours (multiplied by the tint).
 */
export function buildVillager(): THREE.BufferGeometry {
  const b = new TriBuilder();
  const white = hex('#FFFFFF');
  const skin = hex(C.skin);
  const dark = hex('#3B3A5A');
  b.ellipsoid(v3(0, 0.38, 0), 0.26, 0.38, 0.26, 6, 4, () => white);
  b.ellipsoid(v3(0.02, 0.93, 0), 0.19, 0.19, 0.19, 6, 3, () => skin);
  frustum(b, 0.02, 0, 1.05, 0.2, 1.36, 0, 6, white);
  // eyes
  for (const z of [-0.07, 0.07]) {
    b.quad(
      v3(0.2, 0.97, z - 0.02),
      v3(0.2, 0.97, z + 0.02),
      v3(0.2, 0.91, z + 0.02),
      v3(0.2, 0.91, z - 0.02),
      dark,
      dark,
      dark,
      dark,
      true,
    );
  }
  return b.finish();
}

/** Cat body ≈ 50 tris (sitting, ears up); tail is a separate part so it can swish. */
export function buildCat(): THREE.BufferGeometry {
  const b = new TriBuilder();
  const fur = hex(C.catBody);
  const belly = hex(C.catBelly);
  b.ellipsoid(v3(0, 0.2, 0), 0.3, 0.2, 0.16, 6, 3, (t) => (t < 0.3 ? belly : fur));
  b.ellipsoid(v3(0.26, 0.4, 0), 0.14, 0.13, 0.14, 5, 3, () => fur);
  for (const z of [-0.08, 0.08]) {
    b.tri(v3(0.26, 0.5, z - 0.05), v3(0.26, 0.5, z + 0.05), v3(0.26, 0.64, z), fur);
    b.tri(v3(0.26, 0.5, z + 0.05), v3(0.26, 0.5, z - 0.05), v3(0.26, 0.64, z), fur);
  }
  const dark = hex('#3B3A5A');
  for (const z of [-0.06, 0.06])
    b.quad(
      v3(0.4, 0.43, z - 0.015),
      v3(0.4, 0.43, z + 0.015),
      v3(0.4, 0.39, z + 0.015),
      v3(0.4, 0.39, z - 0.015),
      dark,
      dark,
      dark,
      dark,
      true,
    );
  return b.finish();
}

/**
 * Cat tail, base at the origin (pivot), extending to -x and curling up ≈ 24 tris.
 * Authored in body coordinates offset by `CAT_TAIL_PIVOT` (caller positions the part).
 */
export const CAT_TAIL_PIVOT = new THREE.Vector3(-0.28, 0.16, 0);
export function buildCatTail(): THREE.BufferGeometry {
  const b = new TriBuilder();
  const col = hex(C.catBody);
  const pts = [v3(0, 0, 0), v3(-0.18, 0.02, 0), v3(-0.34, 0.12, 0), v3(-0.4, 0.3, 0)];
  const rad = [0.05, 0.045, 0.04, 0.03];
  const ring = (i: number): THREE.Vector3[] =>
    [0, 1, 2, 3].map((k) => {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      return v3(pts[i].x, pts[i].y + Math.cos(a) * rad[i], pts[i].z + Math.sin(a) * rad[i]);
    });
  for (let i = 0; i < pts.length - 1; i++) {
    const a = ring(i);
    const c = ring(i + 1);
    for (let s = 0; s < 4; s++) {
      const s1 = (s + 1) % 4;
      b.quad(a[s], c[s], c[s1], a[s1], col);
    }
  }
  const g = b.finish();
  g.translate(CAT_TAIL_PIVOT.x, CAT_TAIL_PIVOT.y, CAT_TAIL_PIVOT.z);
  return g;
}

/** Sheep ≈ 75 tris: wool blob, dark head, 4 stubby legs. Wool is white (instanceColor stays white). */
export function buildSheep(): THREE.BufferGeometry {
  const b = new TriBuilder();
  const wool = hex(C.wool);
  const head = hex(C.sheepHead);
  b.ellipsoid(v3(0, 0.42, 0), 0.42, 0.3, 0.34, 6, 4, () => wool);
  b.ellipsoid(v3(0.4, 0.46, 0), 0.14, 0.14, 0.12, 4, 3, () => head);
  for (const x of [-0.22, 0.22])
    for (const z of [-0.14, 0.14]) frustum(b, x, z, 0, 0.045, 0.2, 0.06, 3, head);
  return b.finish();
}

/** Crab body ≈ 40 tris; flat, wide along z (it walks sideways), claws are a separate part. */
export function buildCrab(): THREE.BufferGeometry {
  const b = new TriBuilder();
  const shell = hex(C.crab);
  const dark = hex('#3B3A5A');
  b.ellipsoid(v3(0, 0.1, 0), 0.22, 0.09, 0.3, 6, 3, () => shell);
  for (const z of [-0.1, 0.1])
    b.quad(
      v3(0.2, 0.2, z - 0.025),
      v3(0.2, 0.2, z + 0.025),
      v3(0.2, 0.15, z + 0.025),
      v3(0.2, 0.15, z - 0.025),
      dark,
      dark,
      dark,
      dark,
      true,
    );
  for (const side of [-1, 1])
    for (const x of [-0.12, 0, 0.12])
      b.tri(
        v3(x - 0.03, 0.08, side * 0.26),
        v3(x + 0.03, 0.08, side * 0.26),
        v3(x + 0.02, 0.0, side * 0.46),
        shell,
      );
  for (const side of [-1, 1])
    for (const x of [-0.12, 0, 0.12])
      b.tri(
        v3(x + 0.03, 0.08, side * 0.26),
        v3(x - 0.03, 0.08, side * 0.26),
        v3(x + 0.02, 0.0, side * 0.46),
        shell,
      );
  return b.finish();
}

/** Crab claws (both), pivot at the front of the body, rotate about z to clack. ≈ 16 tris. */
export const CRAB_CLAW_PIVOT = new THREE.Vector3(0.24, 0.14, 0);
export function buildCrabClaws(): THREE.BufferGeometry {
  const b = new TriBuilder();
  const claw = hex(C.crabClaw);
  for (const side of [-1, 1])
    b.ellipsoid(v3(0.34, 0.16, side * 0.34), 0.13, 0.07, 0.09, 4, 2, () => claw);
  return b.finish();
}

/** Duck ≈ 50 tris at the water surface; body white-ish yellow, orange beak. */
export function buildDuck(): THREE.BufferGeometry {
  const b = new TriBuilder();
  const body = hex(C.duck);
  const beak = hex(C.duckBeak);
  b.ellipsoid(v3(0, 0.1, 0), 0.2, 0.12, 0.14, 6, 3, () => body);
  b.ellipsoid(v3(0.17, 0.27, 0), 0.09, 0.09, 0.09, 5, 3, () => body);
  b.tri(v3(0.24, 0.29, 0.04), v3(0.24, 0.29, -0.04), v3(0.35, 0.26, 0), beak);
  b.tri(v3(0.24, 0.29, -0.04), v3(0.24, 0.29, 0.04), v3(0.35, 0.26, 0), beak);
  return b.finish();
}

/** Capybara head ≈ 60 tris, floating in the spring with an orange yuzu on top. */
export function buildCapybara(): THREE.BufferGeometry {
  const b = new TriBuilder();
  const fur = hex(C.capybara);
  const yuzu = hex(C.yuzu);
  const dark = hex('#3B3A5A');
  b.ellipsoid(v3(0, 0.12, 0), 0.24, 0.14, 0.17, 6, 3, () => fur);
  b.ellipsoid(v3(0.2, 0.1, 0), 0.1, 0.09, 0.1, 5, 3, () => fur);
  for (const z of [-0.1, 0.1]) {
    b.ellipsoid(v3(-0.06, 0.27, z), 0.04, 0.04, 0.04, 4, 2, () => fur);
    b.quad(
      v3(0.17, 0.2, z - 0.015),
      v3(0.17, 0.2, z + 0.015),
      v3(0.17, 0.17, z + 0.015),
      v3(0.17, 0.17, z - 0.015),
      dark,
      dark,
      dark,
      dark,
      true,
    );
  }
  b.ellipsoid(v3(0.02, 0.33, 0), 0.08, 0.07, 0.08, 5, 3, () => yuzu);
  return b.finish();
}
