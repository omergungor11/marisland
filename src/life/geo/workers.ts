import type * as THREE from 'three';
import type { BotChassis } from '../../content/bot-look.ts';
import { FLEET_BOTS } from '../../content/fleet.ts';
import { BOT_FRAMES, WORKER_COLORS as W } from '../../content/life.ts';
import { hex, TriBuilder, v3 } from './builder.ts';

/**
 * Worker bot (Phase 3, TASK-306), forward = +x, up +y, right +z, origin between the feet, built in
 * final u (≈ 1.0 u + antenna; the instance scale `LAND.size.workers` makes it chunky). Same vertex
 * tags as `geo/land.ts` plus
 *   mode 7  arm: swing / wave (right, pivotZ > 0) / typing   limb = (amp, pivotY, pivotZ, 7)
 *   mode 8  accessory variant `limb.x` (shown when floor(aSeed) matches)   limb = (variant, y, 0, 8)
 * Mode 8 variants (TASK-590; decode in life-material.ts, packing in life/bot-code.ts):
 *   0..6 department accessory, 7..21 carried item, 30..32 head (monitor / visor / cam),
 *   40 + 5 * head + eye state (idle, working, gate, error, done) = the eye glyphs of that head
 *   (emissive 2); limb.z = 1..3 on the working dots (they hop in turn on uTime).
 * One geometry per chassis (`buildWorker(chassis)`): scout (today's bot), hauler (wide, treads), spire (slim,
 * tall, ringed antenna); each bakes the 3 heads, the 7 accessories and the items. Bottom faces are dropped.
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
  double = true,
): void {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (a: number, r: number): THREE.Vector3 =>
      v3(x, y + Math.sin(a) * r, z + Math.cos(a) * r);
    b.quad(p(a0, r0), p(a1, r0), p(a1, r1), p(a0, r1), color, color, color, color, double);
  }
}

export const WORKER_HEIGHT = 1.0;

// head box (shared by every chassis and head variant, so the accessories fit all of them)
const HEAD_HX = 0.17;
const HEAD_HY = 0.19;
const HEAD_HZ = 0.25;
/** The scout's head top: the fleet beacon floats over it whatever the chassis. */
const HEAD_TOP = BOT_FRAMES.scout.headY + HEAD_HY;

/** Where things sit on one chassis (content `BOT_FRAMES`) plus the offsets items take from the scout. */
interface Frame {
  chassis: BotChassis;
  headY: number;
  headTop: number;
  bodyY: number;
  hx: number;
  hy: number;
  hz: number;
  shoulderY: number;
  armZ: number;
  /** Scout → this chassis: front of the body (x), hands (z outward, y), chest (y). */
  dx: number;
  dzH: number;
  dyH: number;
  dyC: number;
  /** Body depth / width relative to the scout (accessory plates scale with it). */
  sz: number;
}

function frameOf(chassis: BotChassis): Frame {
  const f = BOT_FRAMES[chassis];
  const s = BOT_FRAMES.scout;
  return {
    chassis,
    headY: f.headY,
    headTop: f.headY + HEAD_HY,
    bodyY: f.bodyY,
    hx: f.bodyHx,
    hy: f.bodyHy,
    hz: f.bodyHz,
    shoulderY: f.shoulderY,
    armZ: f.armZ,
    dx: f.bodyHx - s.bodyHx,
    dzH: f.armZ - s.armZ,
    dyH: f.shoulderY - s.shoulderY,
    dyC: f.bodyY - s.bodyY,
    sz: f.bodyHz / s.bodyHz,
  };
}

/** Flat quad in the y-z plane facing +x (`dir` 1) or -x (-1); half extents hz (width) and hy (height). */
function plate(
  b: TriBuilder,
  x: number,
  y: number,
  z: number,
  hz: number,
  hy: number,
  color: THREE.Color,
  dir: 1 | -1 = 1,
): void {
  // seen from +x the viewer's right is -z: counter-clockwise = (z+,y-) (z-,y-) (z-,y+) (z+,y+)
  const s = dir;
  b.quad(
    v3(x, y - hy, z + hz * s),
    v3(x, y - hy, z - hz * s),
    v3(x, y + hy, z - hz * s),
    v3(x, y + hy, z + hz * s),
    color,
  );
}

/** Flat annulus in the x-z plane at height y (a ring round a stalk); double-sided. */
function ringXZ(
  b: TriBuilder,
  x: number,
  y: number,
  r0: number,
  r1: number,
  seg: number,
  color: THREE.Color,
): void {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (a: number, r: number): THREE.Vector3 => v3(x + Math.cos(a) * r, y, Math.sin(a) * r);
    b.quad(p(a0, r0), p(a0, r1), p(a1, r1), p(a1, r0), color, color, color, color, true);
  }
}

/**
 * Drum along +x (the round camera lens): side wall from x0 to x1 at radius r, a rim cap at x1 and a glass
 * disc of radius rg a hair in front of it. `seg` sides.
 */
function drum(
  b: TriBuilder,
  x0: number,
  x1: number,
  y: number,
  r: number,
  rg: number,
  seg: number,
  side: THREE.Color,
  rim: THREE.Color,
  glass: THREE.Color,
): void {
  const inside = v3(x0 - 0.1, y, 0);
  const ring = (x: number, rr: number): THREE.Vector3[] =>
    Array.from({ length: seg }, (_, i) => {
      const a = ((i + 0.5) / seg) * Math.PI * 2;
      return v3(x, y + Math.sin(a) * rr, Math.cos(a) * rr);
    });
  const a = ring(x0, r);
  const c = ring(x1, r);
  const g = ring(x1 + 0.004, rg);
  const mid = v3((x0 + x1) / 2, y, 0);
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    b.triOut(a[i], a[j], c[j], mid, side);
    b.triOut(a[i], c[j], c[i], mid, side);
    // rim: the annulus between the wall and the glass is two thin triangles per side
    b.triOut(c[i], c[j], g[j], inside, rim);
    b.triOut(c[i], g[j], g[i], inside, rim);
    b.triOut(v3(x1 + 0.004, y, 0), g[i], g[j], inside, glass);
  }
}

// ---------------------------------------------------------------------------------------------
// chassis

/**
 * Worker bot, one geometry per chassis. scout ≈ 1.0 u + antenna (the original), hauler ≈ 0.9 u wide with
 * treads and a stub antenna, spire ≈ 1.15 u slim with a long ringed antenna. Tinted (white) body, arms, ear
 * pads; monitor / visor / camera head, the department accessories and the carried items are baked in.
 */
export function buildWorker(chassis: BotChassis = 'scout'): THREE.BufferGeometry {
  const F = frameOf(chassis);
  const C = BOT_FRAMES[chassis];
  const b = new TriBuilder();
  b.skipBottom = true;
  const metal = hex(W.metal);
  const foot = hex(W.foot);

  // legs: swing about the hip
  if (chassis === 'scout') {
    for (const side of [1, -1]) {
      b.setLimb(C.legSwing * side, C.hip, 0, 0);
      b.box(v3(0, 0.12, C.legZ * side), 0.06, 0.1, 0.06, metal);
      b.box(v3(0.04, 0.035, C.legZ * side), 0.1, 0.035, 0.075, foot);
    }
  } else if (chassis === 'hauler') {
    // tracks: a dark block with a lighter fender, rocking about the hip (a waddle)
    for (const side of [1, -1]) {
      b.setLimb(C.legSwing * side, C.hip, 0, 0);
      b.box(v3(0.02, 0.07, C.legZ * side), 0.19, 0.07, 0.07, hex(W.head.tread));
      b.box(v3(0.03, 0.155, C.legZ * side), 0.165, 0.016, 0.078, hex(W.head.treadRib));
      b.box(v3(0.2, 0.06, C.legZ * side), 0.012, 0.045, 0.05, hex(W.head.treadRib));
    }
  } else {
    // long thin legs, small feet
    for (const side of [1, -1]) {
      b.setLimb(C.legSwing * side, C.hip, 0, 0);
      b.box(v3(0, 0.18, C.legZ * side), 0.032, 0.16, 0.032, metal);
      b.box(v3(0.04, 0.03, C.legZ * side), 0.09, 0.03, 0.06, foot);
    }
  }
  b.clearLimb();
  // body (tint), belly plate and status light on the front
  bevelBox(b, v3(0, F.bodyY, 0), F.hx, F.hy, F.hz, C.bevel, WHITE);
  plate(b, F.hx + 0.003, F.bodyY - 0.01, 0, 0.1 * F.sz, 0.07, hex(W.plate));
  b.setEmissive(0);
  plate(b, F.hx + 0.006, F.bodyY + 0.04, 0.06 * F.sz, 0.018, 0.018, hex(W.light));
  b.setEmissive(0);
  // arms: pivot at the shoulder; left swings opposite the right
  for (const side of [1, -1]) {
    b.setLimb(-1.3 * side, F.shoulderY, F.armZ * side, 7);
    b.box(v3(0, F.shoulderY - C.armHalf, (F.armZ - 0.005) * side), 0.045, C.armHalf, 0.045, WHITE);
    b.box(
      v3(0, F.shoulderY - 2 * C.armHalf + 0.01, (F.armZ - 0.005) * side),
      0.055,
      0.045,
      0.055,
      hex(W.hand),
    );
  }
  b.clearLimb();
  if (chassis === 'spire') b.box(v3(0, 0.735, 0), 0.04, 0.05, 0.04, hex(W.head.neck));

  heads(b, F);
  // ear pads (tint)
  for (const side of [1, -1])
    b.box(v3(0, F.headY - 0.01, (HEAD_HZ + 0.035) * side), 0.05, 0.075, 0.03, WHITE);
  // antenna: stalk (+ ring on the spire) + glowing ball, bobbing sideways about the head top
  const A = C.antenna;
  b.setLimb(1.4, F.headTop, 0, 2);
  b.box(v3(-0.03, F.headTop + A.stalk - 0.005, 0), 0.014, A.stalk, 0.014, metal);
  if (A.ring > 0) ringXZ(b, -0.03, F.headTop + A.stalk * 1.1, 0.03, A.ring, 8, WHITE);
  b.setEmissive(0);
  b.ellipsoid(v3(-0.03, F.headTop + 2 * A.stalk + 0.02, 0), A.ball, A.ball, A.ball, 6, 3, () =>
    hex(W.antenna),
  );
  b.setEmissive(0);
  b.clearLimb();

  accessories(b, F);
  items(b, F);
  return b.finish();
}

// ---------------------------------------------------------------------------------------------
// heads and eye states

/** Where the glyphs of one head sit: plane x, centre y, half spans (viewer-right u, up v), stroke. */
interface Face {
  x: number;
  y: number;
  su: number;
  sv: number;
  t: number;
  dot: number;
}

const FACES: readonly Face[] = [
  { x: 0.19, y: -0.005, su: 0.12, sv: 0.1, t: 0.035, dot: 0.024 },
  { x: 0.19, y: -0.04, su: 0.13, sv: 0.07, t: 0.03, dot: 0.02 },
  { x: 0.19, y: 0, su: 0.085, sv: 0.085, t: 0.024, dot: 0.017 },
];

/** Viewer-space corner (U right, V up) on the face plane; the world z is -U. */
const fv = (f: Face, hy: number, U: number, V: number): THREE.Vector3 => v3(f.x, hy + V, -U);

function bar(
  b: TriBuilder,
  f: Face,
  hy: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  color: THREE.Color,
): void {
  const U0 = u0 * f.su;
  const V0 = v0 * f.sv + f.y;
  const U1 = u1 * f.su;
  const V1 = v1 * f.sv + f.y;
  const dU = U1 - U0;
  const dV = V1 - V0;
  const len = Math.hypot(dU, dV);
  const ex = (dU / len) * (f.t / 2);
  const ey = (dV / len) * (f.t / 2);
  const nx = -ey;
  const ny = ex;
  const p = (U: number, V: number, s: number): THREE.Vector3 => fv(f, hy, U + nx * s, V + ny * s);
  b.quad(
    p(U0 - ex, V0 - ey, -1),
    p(U1 + ex, V1 + ey, -1),
    p(U1 + ex, V1 + ey, 1),
    p(U0 - ex, V0 - ey, 1),
    color,
  );
}

function square(
  b: TriBuilder,
  f: Face,
  hy: number,
  u: number,
  v: number,
  hw: number,
  hh: number,
  color: THREE.Color,
): void {
  const U = u * f.su;
  const V = v * f.sv + f.y;
  b.quad(
    fv(f, hy, U - hw, V - hh),
    fv(f, hy, U + hw, V - hh),
    fv(f, hy, U + hw, V + hh),
    fv(f, hy, U - hw, V + hh),
    color,
  );
}

/** The four non-idle eye states of head `h` (working dots, gate ?, error x_x, done ^^), emissive 2. */
function eyeStates(b: TriBuilder, F: Frame, h: number): void {
  const f = FACES[h];
  const E = W.eyeState;
  const Y = F.headY;
  const tag = (e: number, z = 0): void => b.setLimb(40 + h * 5 + e, Y, z, 8);
  b.setEmissive(2);
  // 1 working: three dots (limb.z = 1..3 makes them hop in turn)
  const wk = hex(E.working);
  [-0.6, 0, 0.6].forEach((u, k) => {
    tag(1, k + 1);
    square(b, f, Y, u, 0, f.dot, f.dot, wk);
  });
  // 2 gate: a question mark
  tag(2);
  const g = hex(E.gate);
  bar(b, f, Y, -0.5, 0.4, -0.3, 0.85, g);
  bar(b, f, Y, -0.3, 0.85, 0.3, 0.85, g);
  bar(b, f, Y, 0.3, 0.85, 0.5, 0.4, g);
  bar(b, f, Y, 0.5, 0.4, 0, -0.1, g);
  bar(b, f, Y, 0, -0.1, 0, -0.3, g);
  square(b, f, Y, 0, -0.78, f.dot * 0.9, f.dot * 0.9, g);
  // 3 error: x_x
  tag(3);
  const er = hex(E.error);
  for (const cx of [-0.6, 0.6]) {
    bar(b, f, Y, cx - 0.3, 0.45, cx + 0.3, -0.15, er);
    bar(b, f, Y, cx - 0.3, -0.15, cx + 0.3, 0.45, er);
  }
  bar(b, f, Y, -0.3, -0.65, 0.3, -0.65, er);
  // 4 done: ^^
  tag(4);
  const dn = hex(E.done);
  for (const cx of [-0.55, 0.55]) {
    bar(b, f, Y, cx - 0.35, -0.1, cx, 0.35, dn);
    bar(b, f, Y, cx, 0.35, cx + 0.35, -0.1, dn);
  }
  b.setEmissive(0);
}

/** The three heads (mode 8 variants 30..32) with their idle eyes (40, 45, 50) and eye states. */
function heads(b: TriBuilder, F: Frame): void {
  const Y = F.headY;
  const dark = hex(W.screen);
  const shell = hex(W.shell);

  // 0 monitor: dark face, two glowing eyes, blush
  b.setLimb(30, Y, 0, 8);
  bevelBox(b, v3(0, Y, 0), HEAD_HX, HEAD_HY, HEAD_HZ, 0.06, shell);
  b.box(v3(HEAD_HX + 0.004, Y - 0.005, 0), 0.01, 0.145, 0.2, dark);
  for (const side of [1, -1])
    b.ellipsoid(v3(HEAD_HX + 0.016, Y - 0.055, 0.15 * side), 0.008, 0.025, 0.04, 4, 2, () =>
      hex(W.blush),
    );
  b.setLimb(40, Y, 0, 8);
  b.setEmissive(2);
  for (const side of [1, -1])
    b.box(v3(HEAD_HX + 0.016, Y + 0.025, 0.085 * side), 0.012, 0.05, 0.034, hex(W.eye));
  b.setEmissive(0);
  eyeStates(b, F, 0);

  // 1 visor: a tinted dome over a lower shell with a dark glass band
  b.setLimb(31, Y, 0, 8);
  bevelBox(b, v3(0, Y - 0.05, 0), HEAD_HX, 0.14, HEAD_HZ, 0.06, shell);
  b.ellipsoid(v3(0, Y + 0.09, 0), HEAD_HX, 0.1, HEAD_HZ, 8, 3, () => WHITE);
  b.box(v3(HEAD_HX + 0.004, Y - 0.04, 0), 0.01, 0.075, 0.215, dark);
  b.setLimb(45, Y, 0, 8);
  b.setEmissive(2);
  for (const side of [1, -1]) plate(b, 0.19, Y - 0.035, 0.07 * side, 0.03, 0.04, hex(W.eye));
  b.setEmissive(0);
  eyeStates(b, F, 1);

  // 2 camera: a round head with one big lens
  b.setLimb(32, Y, 0, 8);
  b.ellipsoid(v3(0, Y, 0), HEAD_HX, HEAD_HY, HEAD_HZ, 8, 4, () => shell);
  drum(b, 0.1, 0.176, Y, 0.125, 0.1, 8, hex(W.head.camRimDark), hex(W.head.camRim), dark);
  b.setLimb(50, Y, 0, 8);
  b.setEmissive(2);
  for (let i = 0; i < 8; i++) {
    const a0 = ((i + 0.5) / 8) * Math.PI * 2;
    const a1 = ((i + 1.5) / 8) * Math.PI * 2;
    const r = 0.05;
    b.triOut(
      v3(0.19, Y, 0),
      v3(0.19, Y + Math.sin(a0) * r, Math.cos(a0) * r),
      v3(0.19, Y + Math.sin(a1) * r, Math.cos(a1) * r),
      v3(0, Y, 0),
      hex(W.eye),
    );
  }
  b.setEmissive(0);
  eyeStates(b, F, 2);
  b.clearLimb();
}

// ---------------------------------------------------------------------------------------------
// accessories and carried items

/**
 * The 7 department accessories (content/themes `accessory` = index), tagged mode 8. Slots 7.. are the
 * carried items (`items`, content/themes CARRIED_ITEM_SLOT). Head parts follow `F.headY`, body parts the
 * chassis body.
 */
function accessories(b: TriBuilder, F: Frame): void {
  const A = W.acc;
  const HEAD_Y = F.headY;
  const HEAD_TOP = F.headTop;
  const tag = (i: number): void => b.setLimb(i, HEAD_Y, 0, 8);
  const fx = F.hx + 0.008; // plates on the body front
  const z = (v: number): number => v * F.sz;

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
    ringYZ(b, HEAD_HX + 0.034, HEAD_Y + 0.025, 0.085 * side, 0.05, 0.068, 8, hex(A.glasses), false);
  plate(b, HEAD_HX + 0.034, HEAD_Y + 0.03, 0, 0.03, 0.01, hex(A.glasses));

  // 2 Marketing (Carnival): red-visor cap, cream stripes round the body, megaphone badge on the chest
  tag(2);
  for (const dy of [-0.11, -0.03, 0.05])
    b.box(v3(0, F.bodyY + dy, 0), F.hx + 0.006, 0.014, F.hz + 0.006, hex(A.stripe));
  b.ellipsoid(v3(-0.01, HEAD_TOP - 0.01, 0), 0.19, 0.12, 0.25, 6, 3, () => hex(A.cap));
  b.frustum(v3(0.15, HEAD_TOP - 0.01, 0), 0.19, 0.17, 0.02, 8, hex(A.capBrim));
  b.ellipsoid(v3(-0.01, HEAD_TOP + 0.11, 0), 0.03, 0.025, 0.03, 4, 2, () => hex(A.capBrim));
  b.ellipsoid(v3(fx, F.bodyY - 0.08, z(-0.07)), 0.012, 0.055, 0.055, 6, 3, () => hex(A.badge));
  b.box(v3(fx + 0.012, F.bodyY - 0.08, z(-0.07)), 0.012, 0.015, 0.02, hex(A.badgeIcon));
  b.box(v3(fx + 0.017, F.bodyY - 0.08, z(-0.07)), 0.012, 0.03, 0.035, hex(A.badgeIcon));

  // 3 QA: visor + safety glasses
  tag(3);
  b.box(v3(0.04, HEAD_TOP - 0.02, 0), 0.13, 0.014, 0.23, hex(A.visor));
  b.box(v3(0.17, HEAD_TOP - 0.035, 0), 0.01, 0.03, 0.23, hex(A.visor));
  // hazard-yellow square frames round both eyes + bridge and a head strap
  for (const side of [1, -1]) {
    const zz = 0.085 * side;
    const y = HEAD_Y + 0.025;
    const x = HEAD_HX + 0.034;
    const sf = hex(A.safety);
    plate(b, x, y + 0.06, zz, 0.05, 0.012, sf);
    plate(b, x, y - 0.06, zz, 0.05, 0.012, sf);
    plate(b, x, y, zz + 0.045 * side, 0.012, 0.06, sf);
    plate(b, x, y, zz - 0.045 * side, 0.012, 0.06, sf);
    b.box(v3(0, y, 0.262 * side), 0.17, 0.018, 0.01, sf);
  }
  plate(b, HEAD_HX + 0.034, HEAD_Y + 0.03, 0, 0.04, 0.012, hex(A.safety));

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
  plate(b, fx, F.bodyY - 0.08, 0, z(0.125), 0.1, hex(A.apron));
  plate(b, fx + 0.002, F.bodyY + 0.02, 0, z(0.16), 0.014, hex(A.apronBelt));

  // 5 DevOps: hard hat
  tag(5);
  b.ellipsoid(v3(-0.01, HEAD_TOP - 0.01, 0), 0.2, 0.16, 0.27, 7, 3, () => hex(A.hat));
  b.frustum(v3(0.02, HEAD_TOP - 0.015, 0), 0.3, 0.27, 0.025, 8, hex(A.hat));
  b.box(v3(-0.01, HEAD_TOP + 0.15, 0), 0.17, 0.018, 0.03, hex(A.hatRidge));
  // hi-vis vest: two reflective bands round the body and shoulder straps
  for (const dy of [-0.08, 0.07])
    b.box(v3(0, F.bodyY + dy, 0), F.hx + 0.007, 0.016, F.hz + 0.007, hex(A.reflect));
  for (const side of [1, -1]) {
    plate(b, F.hx + 0.008, F.bodyY + 0.01, z(0.09) * side, 0.02, 0.17, hex(A.reflect));
    plate(b, -F.hx - 0.008, F.bodyY + 0.01, z(0.09) * side, 0.02, 0.17, hex(A.reflect), -1);
  }

  // 6 Research (Stargazer Academy): mortarboard with a gold tassel, academic gown, monocle
  tag(6);
  b.box(v3(-0.01, HEAD_TOP + 0.03, 0), 0.17, 0.05, 0.2, hex(A.capBase));
  b.box(v3(-0.01, HEAD_TOP + 0.085, 0), 0.26, 0.012, 0.29, hex(A.board));
  b.box(v3(-0.01, HEAD_TOP + 0.1, 0), 0.02, 0.012, 0.02, hex(A.tassel));
  b.box(v3(-0.01, HEAD_TOP + 0.075, 0.29), 0.012, 0.012, 0.012, hex(A.tassel));
  b.box(v3(-0.01, HEAD_TOP + 0.03, 0.29), 0.014, 0.05, 0.014, hex(A.tassel));
  b.box(v3(-0.01, HEAD_TOP - 0.015, 0.29), 0.022, 0.02, 0.022, hex(A.tassel));
  b.box(v3(-F.hx - 0.018, F.bodyY - 0.05, 0), 0.016, 0.24, F.hz + 0.025, hex(A.gown));
  b.box(v3(0, F.bodyY + 0.16, 0), F.hx + 0.022, 0.02, F.hz + 0.025, hex(A.gown));
  plate(b, F.hx + 0.01, F.bodyY + 0.11, 0, 0.015, 0.07, hex(A.gownTrim));
  ringYZ(b, HEAD_HX + 0.03, HEAD_Y + 0.025, -0.085, 0.052, 0.072, 6, hex(A.monocle), false);
  b.box(v3(HEAD_HX + 0.03, HEAD_Y - 0.075, -0.17), 0.006, 0.07, 0.006, hex(A.monocle));
  b.clearLimb();
}

/**
 * Carried items (CARRIED_ITEM_SLOT, TASK-383 / 590), tagged mode 8 slots 7..21 and held in front of the body
 * so they read from the side and the front: chest items follow the body (`C`), hand items the right arm
 * (`H`). They show together with the department accessory (two-slot decode, life-material.ts).
 */
function items(b: TriBuilder, F: Frame): void {
  const I = W.item;
  const Y = F.headY;
  const tag = (slot: number): void => b.setLimb(slot, Y, 0, 8);
  // outward z moves with the arms; chest height follows the body, hand height the shoulder
  const oz = (zz: number): number => (zz > 0.1 ? zz + F.dzH : zz < -0.1 ? zz - F.dzH : zz);
  const C = (x: number, y: number, zz: number): THREE.Vector3 => v3(x + F.dx, y + F.dyC, oz(zz));
  const H = (x: number, y: number, zz: number): THREE.Vector3 => v3(x + F.dx, y + F.dyH, oz(zz));

  // 7 laptop
  tag(7);
  b.box(C(0.2, 0.37, 0), 0.016, 0.1, 0.15, hex(I.laptopBase));
  b.box(C(0.218, 0.37, 0), 0.006, 0.09, 0.14, hex(I.laptopLid));
  b.setEmissive(2);
  b.box(C(0.226, 0.38, 0), 0.004, 0.025, 0.03, hex(I.laptopLogo));
  b.setEmissive(0);

  // 8 clipboard
  tag(8);
  b.box(C(0.2, 0.35, 0.13), 0.012, 0.125, 0.095, hex(I.board));
  b.box(C(0.214, 0.35, 0.13), 0.005, 0.105, 0.078, hex(I.paper));
  b.box(C(0.216, 0.455, 0.13), 0.012, 0.022, 0.04, hex(I.clip));
  for (const dy of [-0.04, 0.04]) b.box(C(0.221, 0.34 + dy, 0.13), 0.003, 0.006, 0.055, hex(I.ink));

  // 9 crate
  tag(9);
  b.box(C(0.28, 0.3, 0), 0.1, 0.085, 0.16, hex(I.crate), hex(I.parcel));
  for (const dy of [-0.045, 0.045])
    b.box(C(0.28, 0.3 + dy, 0), 0.103, 0.014, 0.163, hex(I.crateSlat));

  // 10 paint pot + brush (the shader agent's brush)
  tag(10);
  b.frustum(H(0.22, 0.12, 0.2), 0.065, 0.075, 0.115, 8, hex(I.pot), hex(I.paint));
  b.box(H(0.2, 0.33, 0.2), 0.01, 0.12, 0.01, hex(I.brush));
  b.box(H(0.2, 0.465, 0.2), 0.016, 0.03, 0.016, hex(I.paint));

  // 11 satchel (HQ post bag): hangs at the left hip on a strap
  tag(11);
  b.box(C(0.0, 0.27, -0.37), 0.1, 0.085, 0.05, hex(I.bag));
  b.box(C(0.0, 0.335, -0.37), 0.105, 0.025, 0.055, hex(I.bagFlap));
  b.box(C(0.0, 0.31, -0.42), 0.02, 0.02, 0.008, hex(I.bagClasp));
  b.box(C(0.0, 0.47, -0.3), 0.012, 0.15, 0.012, hex(I.bagFlap));

  // 12 megaphone (Marketing): in the right hand, mouth forward
  tag(12);
  b.box(H(0.2, 0.34, 0.2), 0.045, 0.028, 0.028, hex(I.megaGrip));
  b.box(H(0.285, 0.34, 0.2), 0.05, 0.05, 0.05, hex(I.mega));
  b.box(H(0.37, 0.34, 0.2), 0.05, 0.075, 0.075, hex(I.mega));
  b.box(H(0.425, 0.34, 0.2), 0.01, 0.085, 0.085, hex(I.megaRim));

  // 13 blowpipe (Design): a long pipe held across both hands, a molten drop on its tip
  tag(13);
  b.box(H(0.3, 0.36, 0.2), 0.28, 0.012, 0.012, hex(I.pipe));
  b.box(H(0.0, 0.36, 0.2), 0.03, 0.02, 0.02, hex(I.pipeMouth));
  b.setEmissive(2);
  b.ellipsoid(H(0.62, 0.36, 0.2), 0.06, 0.06, 0.06, 6, 3, () => hex(I.ember));
  b.setEmissive(0);

  // 14 books (Research, and the docs agent's book): a short stack hugged to the chest
  tag(14);
  I.books.forEach((c, k) => {
    b.box(C(0.2, 0.31 + k * 0.045, 0.02 * (k - 1)), 0.085, 0.021, 0.115, hex(c), hex(I.pages));
  });

  // 15 lantern (QA bug hunt, TASK-480): held out in the right hand, a glowing green glass box
  tag(15);
  b.box(H(0.26, 0.36, 0.2), 0.008, 0.07, 0.008, hex(I.lanternFrame));
  b.box(H(0.26, 0.29, 0.2), 0.05, 0.012, 0.05, hex(I.lanternFrame));
  b.box(H(0.26, 0.15, 0.2), 0.05, 0.012, 0.05, hex(I.lanternFrame));
  b.setEmissive(2);
  b.box(H(0.26, 0.22, 0.2), 0.042, 0.06, 0.042, hex(I.lanternGlow));
  b.setEmissive(0);

  // 16 wrench (engine): upright in the right hand, red grip, open jaw on top
  tag(16);
  b.box(H(0.24, 0.31, 0.2), 0.016, 0.12, 0.016, hex(I.wrench));
  b.box(H(0.24, 0.24, 0.2), 0.02, 0.05, 0.02, hex(I.wrenchGrip));
  b.box(H(0.24, 0.45, 0.2), 0.02, 0.03, 0.05, hex(I.wrench));
  for (const s of [1, -1]) b.box(H(0.24, 0.49, 0.2 + 0.038 * s), 0.02, 0.02, 0.013, hex(I.wrench));

  // 17 map roll (worldgen): a rolled chart with a band, upright in the right hand
  tag(17);
  b.frustum(H(0.24, 0.17, 0.2), 0.036, 0.036, 0.27, 6, hex(I.map), hex(I.mapEnd));
  b.frustum(H(0.24, 0.27, 0.2), 0.042, 0.042, 0.04, 6, hex(I.mapBand));

  // 18 hammer (props): a wooden shaft and a heavy head
  tag(18);
  b.box(H(0.24, 0.31, 0.2), 0.014, 0.12, 0.014, hex(I.hammerShaft));
  b.box(H(0.24, 0.45, 0.2), 0.05, 0.034, 0.034, hex(I.hammerHead));

  // 19 rubber duck (life): held at the right hand
  tag(19);
  b.ellipsoid(H(0.24, 0.33, 0.2), 0.075, 0.055, 0.062, 6, 3, () => hex(I.duck));
  b.ellipsoid(H(0.275, 0.41, 0.2), 0.04, 0.04, 0.04, 5, 2, () => hex(I.duck));
  b.box(H(0.32, 0.405, 0.2), 0.026, 0.01, 0.02, hex(I.duckBeak));
  b.box(H(0.285, 0.425, 0.232), 0.01, 0.01, 0.006, hex(I.duckEye));
  b.box(H(0.285, 0.425, 0.168), 0.01, 0.01, 0.006, hex(I.duckEye));

  // 20 magnifier (qa): a rimmed lens on a handle
  tag(20);
  b.box(H(0.24, 0.27, 0.2), 0.012, 0.075, 0.012, hex(I.brush));
  ringYZ(b, 0.25 + F.dx, 0.43 + F.dyH, oz(0.2), 0.05, 0.07, 6, hex(I.lensRim));
  plate(b, 0.25 + F.dx, 0.43 + F.dyH, oz(0.2), 0.05, 0.05, hex(I.lens));

  // 21 hard hat (devops): carried in the right hand
  tag(21);
  b.ellipsoid(H(0.24, 0.36, 0.2), 0.085, 0.07, 0.095, 6, 3, () => hex(I.hardHat));
  b.frustum(H(0.25, 0.32, 0.2), 0.11, 0.1, 0.016, 6, hex(I.hardHat));

  b.clearLimb();
}

/**
 * Fleet beacon (TASK-564 / 571): a diamond on a stalk over a cream saucer, built in bot space (origin between the
 * feet) for its own small InstancedMesh. Accent parts are pure white: the instance colour tints them (department
 * accent), the saucer stays cream. Emissive class 1, so it glows at night only.
 */
export function buildFleetBeacon(): THREE.BufferGeometry {
  const b = new TriBuilder();
  const B = FLEET_BOTS.beacon;
  // mode 0 amp 0 = static; the tag makes the `limb` attribute exist (its default would be a gull wing)
  b.setLimb(0, 0, 0, 0);
  b.setEmissive(1);
  b.ellipsoid(v3(-0.03, HEAD_TOP + B.lift, 0), B.rx, B.ry, B.rx, 4, 2, () => WHITE);
  b.ellipsoid(
    v3(-0.03, HEAD_TOP + B.lift - B.ry * 0.85, 0),
    B.rx * B.ring,
    0.025,
    B.rx * B.ring,
    8,
    2,
    () => hex(B.shine),
  );
  const y0 = HEAD_TOP + B.stalkFrom;
  const y1 = HEAD_TOP + B.lift - B.ry;
  b.box(v3(-0.03, (y0 + y1) / 2, 0), B.stalk, (y1 - y0) / 2, B.stalk, WHITE);
  b.setEmissive(0);
  return b.finish();
}
