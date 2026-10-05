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
  return b.finish();
}

/**
 * The 7 department accessories (content/themes `accessory` = index), tagged mode 8. Slots 7.. are
 * reserved for carried items (content/themes CARRIED_ITEM_SLOT, M14c TASK-383).
 */
function accessories(b: TriBuilder): void {
  const A = W.acc;
  const tag = (i: number): void => b.setLimb(i, HEAD_Y, 0, 8);

  // 0 HQ: headset with a mic boom
  tag(0);
  b.box(v3(-0.02, HEAD_TOP + 0.025, 0), 0.025, 0.014, 0.25, hex(A.headsetBand));
  for (const side of [1, -1]) {
    b.box(v3(-0.02, HEAD_TOP - 0.03, 0.262 * side), 0.025, 0.05, 0.012, hex(A.headsetBand));
    b.box(v3(-0.01, HEAD_Y, 0.31 * side), 0.07, 0.085, 0.02, hex(A.headsetCup));
  }
  b.box(v3(0.08, HEAD_Y - 0.1, 0.33), 0.012, 0.012, 0.012, hex(A.headsetBand));
  b.box(v3(0.09, HEAD_Y - 0.11, 0.3), 0.1, 0.012, 0.012, hex(A.headsetBand));
  b.ellipsoid(v3(0.2, HEAD_Y - 0.11, 0.29), 0.03, 0.03, 0.03, 4, 2, () => hex(A.headsetCup));

  // 1 Coding: hood + chunky headphones
  tag(1);
  b.ellipsoid(v3(-0.06, HEAD_Y + 0.08, 0), 0.22, 0.25, 0.3, 7, 4, () => hex(A.hood));
  b.box(v3(-0.02, HEAD_TOP + 0.075, 0), 0.03, 0.012, 0.25, hex(A.phoneBand));
  for (const side of [1, -1])
    b.ellipsoid(v3(0, HEAD_Y, 0.31 * side), 0.085, 0.085, 0.035, 6, 3, () => hex(A.phoneCup));

  // 2 Marketing: cap + megaphone badge on the chest
  tag(2);
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
  ringYZ(b, HEAD_HX + 0.03, HEAD_Y + 0.025, -0.085, 0.052, 0.072, 6, hex(A.monocle));
  b.box(v3(HEAD_HX + 0.03, HEAD_Y - 0.075, -0.17), 0.006, 0.07, 0.006, hex(A.monocle));

  // 4 Design: beret, set a little to one side
  tag(4);
  b.ellipsoid(v3(-0.01, HEAD_TOP + 0.01, 0.045), 0.21, 0.075, 0.25, 6, 3, () => hex(A.beret));
  b.box(v3(-0.01, HEAD_TOP + 0.085, 0.045), 0.012, 0.025, 0.012, hex(A.beretNub));

  // 5 DevOps: hard hat
  tag(5);
  b.ellipsoid(v3(-0.01, HEAD_TOP - 0.01, 0), 0.2, 0.16, 0.27, 7, 3, () => hex(A.hat));
  b.frustum(v3(0.02, HEAD_TOP - 0.015, 0), 0.3, 0.27, 0.025, 8, hex(A.hat));
  b.box(v3(-0.01, HEAD_TOP + 0.15, 0), 0.17, 0.018, 0.03, hex(A.hatRidge));

  // 6 Research: goggles on the forehead + strap
  tag(6);
  for (const side of [1, -1]) {
    b.box(v3(0, HEAD_TOP - 0.06, 0.262 * side), 0.18, 0.026, 0.012, hex(A.strap));
    b.ellipsoid(v3(HEAD_HX + 0.02, HEAD_TOP - 0.06, 0.1 * side), 0.03, 0.07, 0.07, 5, 3, () =>
      hex(A.rim),
    );
    b.setEmissive(0);
    b.ellipsoid(v3(HEAD_HX + 0.045, HEAD_TOP - 0.06, 0.1 * side), 0.012, 0.052, 0.052, 5, 3, () =>
      hex(A.lens),
    );
    b.setEmissive(0);
  }
  b.box(v3(-HEAD_HX - 0.01, HEAD_TOP - 0.06, 0), 0.012, 0.026, 0.262, hex(A.strap));
  b.clearLimb();
}
