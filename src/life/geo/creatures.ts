import type * as THREE from 'three';
import { LIFE_COLORS as C } from '../../content/life.ts';
import { hex, TriBuilder, v3 } from './builder.ts';

/**
 * Gull, forward = +x, up = +y, right = +z, origin at the body centre. Each wing is two flat
 * double-sided panels: an inner arm raised to the elbow and a swept, pointed, dark-tipped hand
 * dropping to the tip (the gull "M" seen head-on); the vertex shader hinges them at |z| = 0.12.
 * ≈ 53 tris, span ≈ 2.2 u, nose to tail ≈ 1.4 u. (TASK-399: the old 3.4 u span of near-rectangular
 * 1.5 u slabs read as planks at T2 range and as stray rotors next to wind turbines.)
 */
export function buildGull(): THREE.BufferGeometry {
  const b = new TriBuilder();
  const body = hex(C.gullBody);
  const wing = hex(C.gullWing);
  const tip = hex(C.gullTip);
  b.ellipsoid(v3(0, 0, 0), 0.42, 0.18, 0.17, 6, 3, () => body);
  b.ellipsoid(v3(0.42, 0.09, 0), 0.15, 0.13, 0.13, 4, 2, () => body);
  // beak
  b.tri(v3(0.54, 0.08, 0.05), v3(0.54, 0.08, -0.05), v3(0.74, 0.05, 0), hex(C.gullBeak));
  // tail
  b.quad(
    v3(-0.36, 0.02, 0.08),
    v3(-0.36, 0.02, -0.08),
    v3(-0.66, 0.0, -0.14),
    v3(-0.66, 0.0, 0.14),
    wing,
    wing,
    wing,
    wing,
    true,
  );
  for (const side of [1, -1]) {
    const q = (x: number, y: number, z: number): THREE.Vector3 => v3(x, y, z * side);
    // root (front, back), elbow (front, back), tip (front, back)
    const r0 = q(0.22, 0.03, 0.12);
    const r1 = q(-0.22, 0.03, 0.12);
    const e0 = q(0.16, 0.13, 0.6);
    const e1 = q(-0.24, 0.13, 0.55);
    const t0 = q(-0.28, 0.0, 1.08);
    const t1 = q(-0.52, 0.0, 0.98);
    if (side > 0) {
      b.quad(r0, r1, e1, e0, wing, wing, wing, wing, true);
      b.quad(e0, e1, t1, t0, wing, wing, tip, tip, true);
    } else {
      b.quad(r0, e0, e1, r1, wing, wing, wing, wing, true);
      b.quad(e0, t0, t1, e1, wing, tip, tip, wing, true);
    }
  }
  return b.finish();
}

/** Flattened teardrop fish along +x, ≈ 0.6 u long; white-ish so `instanceColor` tints it. */
export function buildFish(top: string, belly: string, length = 0.6): THREE.BufferGeometry {
  const b = new TriBuilder();
  const ct = hex(top);
  const cb = hex(belly);
  const sides = 4;
  // [x, radius] profile nose → tail (teardrop).
  const prof: [number, number][] = [
    [0.5, 0.0],
    [0.3, 0.16],
    [0.0, 0.2],
    [-0.3, 0.1],
    [-0.5, 0.03],
  ];
  const ring = (i: number): THREE.Vector3[] =>
    Array.from({ length: sides }, (_, s) => {
      const th = (s / sides) * Math.PI * 2 + Math.PI / 4;
      return v3(prof[i][0], Math.cos(th) * prof[i][1] * 1.0, Math.sin(th) * prof[i][1] * 0.7);
    });
  const colorOf = (p: THREE.Vector3): THREE.Color => (p.y >= 0 ? ct : cb);
  const nose = v3(prof[0][0] + 0.12, 0, 0);
  let prev = ring(1);
  for (let s = 0; s < sides; s++) {
    const p1 = prev[(s + 1) % sides];
    const p0 = prev[s];
    b.tri(nose, p0, p1, colorOf(p0), colorOf(p0), colorOf(p1));
  }
  for (let i = 2; i < prof.length; i++) {
    const cur = ring(i);
    for (let s = 0; s < sides; s++) {
      const s1 = (s + 1) % sides;
      b.quad(
        prev[s],
        cur[s],
        cur[s1],
        prev[s1],
        colorOf(prev[s]),
        colorOf(cur[s]),
        colorOf(cur[s1]),
        colorOf(prev[s1]),
      );
    }
    prev = cur;
  }
  const tail = v3(prof[prof.length - 1][0], 0, 0);
  for (let s = 0; s < sides; s++)
    b.tri(
      tail,
      prev[(s + 1) % sides],
      prev[s],
      colorOf(prev[(s + 1) % sides]),
      colorOf(prev[s]),
      colorOf(prev[s]),
    );
  // vertical tail fin
  b.quad(
    v3(-0.45, 0, 0),
    v3(-0.75, 0.2, 0),
    v3(-0.75, -0.2, 0),
    v3(-0.45, 0, 0),
    ct,
    ct,
    cb,
    cb,
    true,
  );
  const g = b.finish();
  g.scale(length / 1.0, length / 1.0, length / 1.0);
  return g;
}

/** Placeholder sailboat (forward = +x, waterline y = 0): hull + mast + sail ≈ 60 tris. Used when PROP_GEO lacks 'sailboat'. */
export function buildBoatPlaceholder(): THREE.BufferGeometry {
  const b = new TriBuilder();
  const hull = hex(C.boatHull);
  const trim = hex(C.boatTrim);
  const sail = hex(C.boatSail);
  const mast = hex(C.boatMast);
  // hull: pointed bow (+x), flat stern; keel at y = -0.3, deck at y = 0.45
  const L = 2.5;
  const W = 0.9;
  const bow = v3(L, 0.35, 0);
  const sternL = v3(-L, 0.45, -W);
  const sternR = v3(-L, 0.45, W);
  const midL = v3(0, 0.45, -W * 1.05);
  const midR = v3(0, 0.45, W * 1.05);
  const keelF = v3(L * 0.6, -0.25, 0);
  const keelB = v3(-L * 0.8, -0.3, 0);
  // deck
  b.tri(bow, midL, midR, trim);
  b.quad(midL, sternL, sternR, midR, trim);
  // sides
  b.tri(bow, keelF, midL, hull);
  b.tri(bow, midR, keelF, hull);
  b.quad(midL, keelF, keelB, sternL, hull);
  b.quad(midR, sternR, keelB, keelF, hull);
  // transom
  b.tri(sternL, keelB, sternR, hull);
  // mast (thin box)
  const m = 0.06;
  const h = 4.8;
  const mp = [
    v3(0.3 - m, 0.45, -m),
    v3(0.3 + m, 0.45, -m),
    v3(0.3 + m, 0.45, m),
    v3(0.3 - m, 0.45, m),
  ];
  for (let i = 0; i < 4; i++) {
    const a = mp[i];
    const c = mp[(i + 1) % 4];
    b.quad(a, c, v3(c.x, h, c.z), v3(a.x, h, a.z), mast);
  }
  // sails: main (triangle, double) + jib
  b.tri(v3(0.3, 0.9, 0), v3(-1.9, 0.9, 0), v3(0.3, h - 0.2, 0), sail);
  b.tri(v3(0.3, 0.9, 0), v3(0.3, h - 0.2, 0), v3(-1.9, 0.9, 0), sail);
  b.tri(v3(0.5, 0.8, 0), v3(0.5, h - 0.8, 0), v3(L - 0.2, 0.7, 0), sail);
  b.tri(v3(0.5, 0.8, 0), v3(L - 0.2, 0.7, 0), v3(0.5, h - 0.8, 0), sail);
  return b.finish();
}
