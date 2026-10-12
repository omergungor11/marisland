import type * as THREE from 'three';
import { WORKER_COLORS as W } from '../../content/life.ts';
import { hex, TriBuilder, v3 } from './builder.ts';

/**
 * Worker bot (Phase 3, TASK-306), forward = +x, up +y, right +z, origin between the feet, built in
 * final u (≈ 1.0 u + antenna; the instance scale `LAND.size.workers` makes it chunky). Same vertex
 * tags as `geo/land.ts` plus
 *   mode 7  arm: swing / wave (right, pivotZ > 0) / typing   limb = (amp, pivotY, pivotZ, 7)
 *   mode 8  accessory variant `limb.x` (shown when floor(aSeed) matches)   limb = (variant, y, 0, 8)
 * and per-vertex `emissive`: only the eyes carry the screen class (2); everything else stays 0 (TASK-305).
 * White vertices take the instance tint (team colour): body, arms, ear pads.
 */

const WHITE = hex('#FFFFFF');

type Axis = 0 | 1 | 2;

/**
 * Chamfered box: 6 faces, 12 edge strips and 8 corner triangles (44 tris). Half extents h, bevel
 * `bv`; reads as a soft chunky block under flat shading.
 */
function bevelBox(
  b: TriBuilder,
  c: THREE.Vector3,
  hx: number,
  hy: number,
  hz: number,
  bv: number,
  color: THREE.Color,
): void {
  const h = [hx, hy, hz];
  // vertex on the corner (signs s) lying on the full extent of axis `full`
  const P = (s: number[], full: Axis): THREE.Vector3 => {
    const o = [0, 0, 0];
    for (let a = 0; a < 3; a++) o[a] = s[a] * (a === full ? h[a] : h[a] - bv);
    return v3(c.x + o[0], c.y + o[1], c.z + o[2]);
  };
  const signs = [-1, 1];
  // big faces
  for (const full of [0, 1, 2] as Axis[]) {
    for (const sf of signs) {
      const o1 = ((full + 1) % 3) as Axis;
      const o2 = ((full + 2) % 3) as Axis;
      const q = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([a, bb]) => {
        const s = [0, 0, 0];
        s[full] = sf;
        s[o1] = a;
        s[o2] = bb;
        return P(s, full);
      });
      b.triOut(q[0], q[1], q[2], c, color);
      b.triOut(q[0], q[2], q[3], c, color);
    }
  }
  // edge strips between axes a and d (third axis e)
  for (const [a, d, e] of [
    [0, 1, 2],
    [0, 2, 1],
    [1, 2, 0],
  ] as [Axis, Axis, Axis][]) {
    for (const sa of signs)
      for (const sd of signs) {
        const mk = (full: Axis, se: number): THREE.Vector3 => {
          const s = [0, 0, 0];
          s[a] = sa;
          s[d] = sd;
          s[e] = se;
          return P(s, full);
        };
        const q = [mk(a, -1), mk(a, 1), mk(d, 1), mk(d, -1)];
        b.triOut(q[0], q[1], q[2], c, color);
        b.triOut(q[0], q[2], q[3], c, color);
      }
  }
  // corners
  for (const sx of signs)
    for (const sy of signs)
      for (const sz of signs) {
        const s = [sx, sy, sz];
        b.triOut(P(s, 0), P(s, 1), P(s, 2), c, color);
      }
}

/** Flat ring (annulus) in the y-z plane at x, facing +x; double-sided. */
function ringYZ(
  b: TriBuilder,
  x: number,
  y: number,
  z: number,
  r0: number,
  r1: number,
  seg: number,
  color: THREE.Color,
): void {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (a: number, r: number): THREE.Vector3 =>
      v3(x, y + Math.sin(a) * r, z + Math.cos(a) * r);
    b.quad(p(a0, r0), p(a1, r0), p(a1, r1), p(a0, r1), color, color, color, color, true);
  }
}

export const WORKER_HEIGHT = 1.0;

// head geometry (shared by the accessories)
const HEAD_Y = 0.78;
const HEAD_HX = 0.17;
const HEAD_HY = 0.19;
const HEAD_HZ = 0.25;
const HEAD_TOP = HEAD_Y + HEAD_HY;
const SHOULDER_Y = 0.5;

/** Worker bot ≈ 1.0 u + antenna: chunky legs, tinted body and arms, monitor head with glowing eyes. */
export function buildWorker(): THREE.BufferGeometry {
  const b = new TriBuilder();
  const metal = hex(W.metal);
  const dark = hex(W.screen);
  const foot = hex(W.foot);

  // legs: swing about the hip, stubby feet stick forward
  for (const side of [1, -1]) {
    b.setLimb(1.5 * side, 0.22, 0, 0);
    b.box(v3(0, 0.12, 0.1 * side), 0.06, 0.1, 0.06, metal);
    b.box(v3(0.04, 0.035, 0.1 * side), 0.1, 0.035, 0.075, foot);
  }
  b.clearLimb();
  // body (tint)
  bevelBox(b, v3(0, 0.39, 0), 0.15, 0.17, 0.19, 0.05, WHITE);
  // belly plate + status light
  b.box(v3(0.152, 0.38, 0), 0.006, 0.07, 0.1, hex(W.plate));
  b.setEmissive(0);
  b.box(v3(0.157, 0.43, 0.06), 0.006, 0.018, 0.018, hex(W.light));
  b.setEmissive(0);
  // arms: pivot at the shoulder; left swings opposite the right
  for (const side of [1, -1]) {
    b.setLimb(-1.3 * side, SHOULDER_Y, 0.26 * side, 7);
    b.box(v3(0, 0.37, 0.255 * side), 0.045, 0.13, 0.045, WHITE);
    b.box(v3(0, 0.25, 0.255 * side), 0.055, 0.045, 0.055, hex(W.hand));
  }
  b.clearLimb();
  // head: monitor with a dark face, glowing eyes, blush
  bevelBox(b, v3(0, HEAD_Y, 0), HEAD_HX, HEAD_HY, HEAD_HZ, 0.06, hex(W.shell));
  b.box(v3(HEAD_HX + 0.004, HEAD_Y - 0.005, 0), 0.01, 0.145, 0.2, dark);
  b.setEmissive(2);
  for (const side of [1, -1])
    b.box(v3(HEAD_HX + 0.016, HEAD_Y + 0.025, 0.085 * side), 0.012, 0.05, 0.034, hex(W.eye));
  b.setEmissive(0);
  for (const side of [1, -1])
    b.ellipsoid(v3(HEAD_HX + 0.016, HEAD_Y - 0.055, 0.15 * side), 0.008, 0.025, 0.04, 4, 2, () =>
      hex(W.blush),
    );
  // ear pads (tint)
  for (const side of [1, -1])
    b.box(v3(0, HEAD_Y - 0.01, (HEAD_HZ + 0.035) * side), 0.05, 0.075, 0.03, WHITE);
  // antenna: stalk + glowing ball, bobbing sideways about the head top
  b.setLimb(1.4, HEAD_TOP, 0, 2);
  b.box(v3(-0.03, HEAD_TOP + 0.07, 0), 0.014, 0.075, 0.014, metal);
  b.setEmissive(0);
  b.ellipsoid(v3(-0.03, HEAD_TOP + 0.17, 0), 0.05, 0.05, 0.05, 6, 3, () => hex(W.antenna));
  b.setEmissive(0);
  b.clearLimb();

  accessories(b);
  items(b);
  return b.finish();
}

/**
 * The 7 department accessories (content/themes `accessory` = index), tagged mode 8. Slots 7..10 are
 * the carried items (`items`, content/themes CARRIED_ITEM_SLOT).
 */
function accessories(b: TriBuilder): void {
  const A = W.acc;
  const tag = (i: number): void => b.setLimb(i, HEAD_Y, 0, 8);

  // 0 HQ (Harbour Guild): headset with a mic boom under a white captain's cap (coral brim, blue band)
  tag(0);
  b.ellipsoid(v3(-0.02, HEAD_TOP + 0.045, 0), 0.18, 0.11, 0.23, 7, 3, () => hex(A.capCrown));
  b.ellipsoid(v3(-0.02, HEAD_TOP + 0.01, 0), 0.2, 0.035, 0.25, 8, 2, () => hex(A.capBand));
  b.frustum(v3(0.13, HEAD_TOP + 0.02, 0), 0.2, 0.17, 0.016, 8, hex(A.capPeak));
  b.ellipsoid(v3(0.19, HEAD_TOP + 0.075, 0), 0.012, 0.03, 0.045, 4, 2, () => hex(A.capBadge));
  for (const side of [1, -1]) {
    b.box(v3(-0.02, HEAD_TOP - 0.03, 0.262 * side), 0.025, 0.05, 0.012, hex(A.headsetBand));
    b.box(v3(-0.01, HEAD_Y, 0.31 * side), 0.07, 0.085, 0.02, hex(A.headsetCup));
  }
  b.box(v3(0.08, HEAD_Y - 0.1, 0.33), 0.012, 0.012, 0.012, hex(A.headsetBand));
  b.box(v3(0.09, HEAD_Y - 0.11, 0.3), 0.1, 0.012, 0.012, hex(A.headsetBand));
  b.ellipsoid(v3(0.2, HEAD_Y - 0.11, 0.29), 0.03, 0.03, 0.03, 4, 2, () => hex(A.headsetCup));

  // 1 Coding (Wind Gardens): teal hoodie, chunky duck-yellow headphones, clear round glasses
  tag(1);
  b.ellipsoid(v3(-0.06, HEAD_Y + 0.08, 0), 0.22, 0.25, 0.3, 7, 4, () => hex(A.hood));
  b.box(v3(-0.02, HEAD_TOP + 0.075, 0), 0.03, 0.012, 0.25, hex(A.phoneBand));
  for (const side of [1, -1])
    b.ellipsoid(v3(0, HEAD_Y, 0.31 * side), 0.085, 0.085, 0.035, 6, 3, () => hex(A.phoneCup));
  for (const side of [1, -1])
    ringYZ(b, HEAD_HX + 0.034, HEAD_Y + 0.025, 0.085 * side, 0.05, 0.068, 8, hex(A.glasses));
  b.box(v3(HEAD_HX + 0.034, HEAD_Y + 0.03, 0), 0.006, 0.01, 0.03, hex(A.glasses));

  // 2 Marketing (Carnival): red-visor cap, cream stripes round the body, megaphone badge on the chest
  tag(2);
  for (const y of [0.28, 0.36, 0.44]) b.box(v3(0, y, 0), 0.156, 0.014, 0.196, hex(A.stripe));
  b.ellipsoid(v3(-0.01, HEAD_TOP - 0.01, 0), 0.19, 0.12, 0.25, 6, 3, () => hex(A.cap));
  b.frustum(v3(0.15, HEAD_TOP - 0.01, 0), 0.19, 0.17, 0.02, 8, hex(A.capBrim));
  b.ellipsoid(v3(-0.01, HEAD_TOP + 0.11, 0), 0.03, 0.025, 0.03, 4, 2, () => hex(A.capBrim));
  b.ellipsoid(v3(0.158, 0.31, -0.07), 0.012, 0.055, 0.055, 6, 3, () => hex(A.badge));
  b.box(v3(0.17, 0.31, -0.07), 0.012, 0.015, 0.02, hex(A.badgeIcon));
  b.box(v3(0.175, 0.31, -0.07), 0.012, 0.03, 0.035, hex(A.badgeIcon));

  // 3 QA: visor + monocle
  tag(3);
  b.box(v3(0.04, HEAD_TOP - 0.02, 0), 0.13, 0.014, 0.23, hex(A.visor));
  b.box(v3(0.17, HEAD_TOP - 0.035, 0), 0.01, 0.03, 0.23, hex(A.visor));
  // safety glasses: hazard-yellow square frames round both eyes + bridge and a head strap
  for (const side of [1, -1]) {
    const z = 0.085 * side;
    const y = HEAD_Y + 0.025;
    const x = HEAD_HX + 0.034;
    b.box(v3(x, y + 0.06, z), 0.008, 0.012, 0.05, hex(A.safety));
    b.box(v3(x, y - 0.06, z), 0.008, 0.012, 0.05, hex(A.safety));
    b.box(v3(x, y, z + 0.045 * side), 0.008, 0.06, 0.012, hex(A.safety));
    b.box(v3(x, y, z - 0.045 * side), 0.008, 0.06, 0.012, hex(A.safety));
    b.box(v3(0, y, 0.262 * side), 0.17, 0.018, 0.01, hex(A.safety));
  }
  b.box(v3(HEAD_HX + 0.034, HEAD_Y + 0.03, 0), 0.008, 0.012, 0.04, hex(A.safety));

  // 4 Design (Glass & Light): beret to one side, amber goggles pushed up on the forehead, leather apron
  tag(4);
  b.ellipsoid(v3(-0.01, HEAD_TOP + 0.01, 0.045), 0.21, 0.075, 0.25, 6, 3, () => hex(A.beret));
  b.box(v3(-0.01, HEAD_TOP + 0.085, 0.045), 0.012, 0.025, 0.012, hex(A.beretNub));
  for (const side of [1, -1]) {
    b.box(v3(0, HEAD_TOP - 0.075, 0.262 * side), 0.18, 0.024, 0.012, hex(A.gogStrap));
    b.ellipsoid(v3(HEAD_HX + 0.02, HEAD_TOP - 0.075, 0.1 * side), 0.035, 0.07, 0.07, 6, 3, () =>
      hex(A.gogRim),
    );
    b.ellipsoid(v3(HEAD_HX + 0.05, HEAD_TOP - 0.075, 0.1 * side), 0.012, 0.052, 0.052, 6, 3, () =>
      hex(A.amber),
    );
  }
  b.box(v3(-HEAD_HX - 0.01, HEAD_TOP - 0.075, 0), 0.012, 0.024, 0.262, hex(A.gogStrap));
  b.box(v3(0.158, 0.31, 0), 0.006, 0.1, 0.125, hex(A.apron));
  b.box(v3(0.158, 0.41, 0), 0.006, 0.014, 0.16, hex(A.apronBelt));

  // 5 DevOps: hard hat
  tag(5);
  b.ellipsoid(v3(-0.01, HEAD_TOP - 0.01, 0), 0.2, 0.16, 0.27, 7, 3, () => hex(A.hat));
  b.frustum(v3(0.02, HEAD_TOP - 0.015, 0), 0.3, 0.27, 0.025, 8, hex(A.hat));
  b.box(v3(-0.01, HEAD_TOP + 0.15, 0), 0.17, 0.018, 0.03, hex(A.hatRidge));
  // hi-vis vest: two reflective bands round the body and shoulder straps
  for (const y of [0.31, 0.46]) b.box(v3(0, y, 0), 0.157, 0.016, 0.197, hex(A.reflect));
  for (const side of [1, -1]) {
    b.box(v3(0.157, 0.4, 0.09 * side), 0.005, 0.17, 0.02, hex(A.reflect));
    b.box(v3(-0.157, 0.4, 0.09 * side), 0.005, 0.17, 0.02, hex(A.reflect));
  }

  // 6 Research (Stargazer Academy): mortarboard with a gold tassel, academic gown, monocle
  tag(6);
  b.box(v3(-0.01, HEAD_TOP + 0.03, 0), 0.17, 0.05, 0.2, hex(A.capBase));
  b.box(v3(-0.01, HEAD_TOP + 0.085, 0), 0.26, 0.012, 0.29, hex(A.board));
  b.box(v3(-0.01, HEAD_TOP + 0.1, 0), 0.02, 0.012, 0.02, hex(A.tassel));
  b.box(v3(-0.01, HEAD_TOP + 0.075, 0.29), 0.012, 0.012, 0.012, hex(A.tassel));
  b.box(v3(-0.01, HEAD_TOP + 0.03, 0.29), 0.014, 0.05, 0.014, hex(A.tassel));
  b.box(v3(-0.01, HEAD_TOP - 0.015, 0.29), 0.022, 0.02, 0.022, hex(A.tassel));
  b.box(v3(-0.168, 0.34, 0), 0.016, 0.24, 0.215, hex(A.gown));
  b.box(v3(0, 0.55, 0), 0.172, 0.02, 0.215, hex(A.gown));
  b.box(v3(0.16, 0.5, 0), 0.01, 0.07, 0.015, hex(A.gownTrim));
  ringYZ(b, HEAD_HX + 0.03, HEAD_Y + 0.025, -0.085, 0.052, 0.072, 6, hex(A.monocle));
  b.box(v3(HEAD_HX + 0.03, HEAD_Y - 0.075, -0.17), 0.006, 0.07, 0.006, hex(A.monocle));
  b.clearLimb();
}

/**
 * Carried items (CARRIED_ITEM_SLOT, TASK-383), tagged mode 8 slots 7..10 and held in front of the
 * body so they read from the side and the front: a closed laptop hugged to the chest, a clipboard
 * in the right hand, a crate in both arms, a paint pot with a brush in the right hand. They show
 * together with the department accessory (two-slot decode, life-material.ts).
 */
function items(b: TriBuilder): void {
  const I = W.item;
  const tag = (slot: number): void => b.setLimb(slot, HEAD_Y, 0, 8);

  // 7 laptop
  tag(7);
  b.box(v3(0.2, 0.37, 0), 0.016, 0.1, 0.15, hex(I.laptopBase));
  b.box(v3(0.218, 0.37, 0), 0.006, 0.09, 0.14, hex(I.laptopLid));
  b.setEmissive(2);
  b.box(v3(0.226, 0.38, 0), 0.004, 0.025, 0.03, hex(I.laptopLogo));
  b.setEmissive(0);

  // 8 clipboard
  tag(8);
  b.box(v3(0.2, 0.35, 0.13), 0.012, 0.125, 0.095, hex(I.board));
  b.box(v3(0.214, 0.35, 0.13), 0.005, 0.105, 0.078, hex(I.paper));
  b.box(v3(0.216, 0.455, 0.13), 0.012, 0.022, 0.04, hex(I.clip));
  for (const dy of [-0.04, 0.04])
    b.box(v3(0.221, 0.34 + dy, 0.13), 0.003, 0.006, 0.055, hex(I.ink));

  // 9 crate
  tag(9);
  b.box(v3(0.28, 0.3, 0), 0.1, 0.085, 0.16, hex(I.crate), hex(I.parcel));
  for (const dy of [-0.045, 0.045])
    b.box(v3(0.28, 0.3 + dy, 0), 0.103, 0.014, 0.163, hex(I.crateSlat));

  // 10 paint pot + brush
  tag(10);
  b.frustum(v3(0.22, 0.12, 0.2), 0.065, 0.075, 0.115, 8, hex(I.pot), hex(I.paint));
  b.box(v3(0.2, 0.33, 0.2), 0.01, 0.12, 0.01, hex(I.brush));
  b.box(v3(0.2, 0.465, 0.2), 0.016, 0.03, 0.016, hex(I.paint));

  // 11 satchel (HQ post bag): hangs at the left hip on a strap
  tag(11);
  b.box(v3(0.0, 0.27, -0.37), 0.1, 0.085, 0.05, hex(I.bag));
  b.box(v3(0.0, 0.335, -0.37), 0.105, 0.025, 0.055, hex(I.bagFlap));
  b.box(v3(0.0, 0.31, -0.42), 0.02, 0.02, 0.008, hex(I.bagClasp));
  b.box(v3(0.0, 0.47, -0.3), 0.012, 0.15, 0.012, hex(I.bagFlap));

  // 12 megaphone (Marketing): in the right hand, mouth forward
  tag(12);
  b.box(v3(0.2, 0.34, 0.2), 0.045, 0.028, 0.028, hex(I.megaGrip));
  b.box(v3(0.285, 0.34, 0.2), 0.05, 0.05, 0.05, hex(I.mega));
  b.box(v3(0.37, 0.34, 0.2), 0.05, 0.075, 0.075, hex(I.mega));
  b.box(v3(0.425, 0.34, 0.2), 0.01, 0.085, 0.085, hex(I.megaRim));

  // 13 blowpipe (Design): a long pipe held across both hands, a molten drop on its tip
  tag(13);
  b.box(v3(0.3, 0.36, 0.2), 0.28, 0.012, 0.012, hex(I.pipe));
  b.box(v3(0.0, 0.36, 0.2), 0.03, 0.02, 0.02, hex(I.pipeMouth));
  b.setEmissive(2);
  b.ellipsoid(v3(0.62, 0.36, 0.2), 0.06, 0.06, 0.06, 6, 3, () => hex(I.ember));
  b.setEmissive(0);

  // 14 books (Research): a short stack hugged to the chest
  tag(14);
  I.books.forEach((c, k) => {
    b.box(v3(0.2, 0.31 + k * 0.045, 0.02 * (k - 1)), 0.085, 0.021, 0.115, hex(c), hex(I.pages));
  });

  b.clearLimb();
}
