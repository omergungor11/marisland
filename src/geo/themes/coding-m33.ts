/**
 * Coding M33 kit geometry (TASK-543, D-117; D-116 directions B + C). Numbers / palette:
 * content/themes/coding-m33.ts; defs: content/props-themes/coding-m33.ts. Vertex colours only, one
 * merged geometry per prop variant, pivot on the ground (exceptions are named), 1 u = 1 m, front =
 * +z unless a frame below says otherwise. Nothing is placed here (TASK-544 / 545).
 *
 * Defs (all new, tier 2 unless noted; ids in content/props-themes/coding-m33.ts):
 *   conveyorLine   v0 straight 4 u segment, v1 the same with a chute ramp at the +x end. Runs along
 *                  local +x centred on the origin. Hooks: belt { from, to, dir, y, width }, ends.
 *   assemblyArm    v0 arm complete, v1 gantry complete, v2 arm base only, v3 arm swing group only
 *                  (yaws about the vertical axis through the origin), v4 gantry frame only, v5 gantry
 *                  pendulum only (ORIGIN = THE PIVOT, hangs below it: the one non-ground pivot).
 *   foundryPart    tier 3. v0-v2 part crates (bodies / heads / antennas), v3-v5 the line's bot stages
 *                  (bare body / body + head / complete), built at the world bot's drawn size
 *                  (LAND.size.workers), forward = +x like life/geo/workers.ts, feet at y 0.
 *   dronePad       H landing pad, painted disc + ring + rim lights; flat, 3.4 u.
 *   chargeMast     v0 tall mast with a charging cradle arm + beacon lamp, v1 low landing post.
 *   droneHangar    small barrel-roof hangar, door on +z.
 *   botCourse      v0 steps, v1 ramp, v2 cone slalom, v3 tiny bridge; all run along local +x.
 *   serverPod      steam-cooled shore unit, lake side = +z.
 *   cloudBalloon   v0 anchor block + tether + cloud, v1 tether + cloud only (no block; origin = the
 *                  anchor point). Both are tall (large structure, T0 by size); the mover tilts the
 *                  instance about its origin (2-3 deg: the anchor block moves ~2 cm) to sway.
 *   quantumPavilion  8-sided glass gazebo with a gold chandelier computer.
 *
 * Tier note (D-096 hazard): the batcher fixes a def's effective tier from the FIRST variant it
 * builds. Every variant of a def sits on the same side of the large-structure rule (>= 3 u tall or
 * >= 3 u in both plan extents): the T2 small defs stay under it in every variant, cloudBalloon,
 * quantumPavilion and dronePad are large in every variant that matters (drawn from T0 by size).
 */
import * as THREE from 'three';
import {
  BOT_SCALE,
  CODING_M33 as F,
  CODING_M33_PAL as P,
} from '../../content/themes/coding-m33.ts';
import { type Acc, blob, createNoise, gradY, mat, qEuler } from '../kit.ts';
import { TAU, V, V2, baseBox, bevBox, cylB, prism, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { cultureAcc } from './culture-devops.ts';
import { addHook } from './hq.ts';

const PI = Math.PI;
type Pt = [number, number, number];
const lit = { emissive: 1, ao: () => 1, aoAmt: 0 } as const;

/** Base box: size (w, h, d), base centre at (x, y, z). */
function bx(acc: Acc, size: Pt, at: Pt, color: string, aoAmt = 0.1, q?: THREE.Quaternion): void {
  put(acc, baseBox(...size), at, color, { aoAmt, ...(q ? { q } : {}) });
}
/** Cylinder lying along local x or z, centred on `at`. */
function cylAxis(
  acc: Acc,
  axis: 'x' | 'z',
  r: number,
  len: number,
  at: Pt,
  color: string,
  seg: number,
  aoAmt = 0.05,
): void {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  if (axis === 'x') g.rotateZ(PI / 2);
  else g.rotateX(PI / 2);
  put(acc, g, at, color, { aoAmt });
}
/** Flat plate whose TOP surface runs from (x0, y0) to (x1, y1) in the xy plane, `w` wide in z. */
function slope(
  acc: Acc,
  [x0, y0]: [number, number],
  [x1, y1]: [number, number],
  w: number,
  thick: number,
  color: string,
  z = 0,
  aoAmt = 0.05,
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const mx = (x0 + x1) / 2 + (Math.sin(ang) * thick) / 2;
  const my = (y0 + y1) / 2 - (Math.cos(ang) * thick) / 2;
  put(acc, new THREE.BoxGeometry(len, thick, w), [mx, my, z], color, {
    q: qEuler(0, 0, ang),
    aoAmt,
  });
}
/** Square-section bar from a to b. */
function bar(acc: Acc, a: THREE.Vector3, b: THREE.Vector3, w: number, color: string): void {
  const d = b.clone().sub(a);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
  put(acc, baseBox(w, d.length(), w), a, color, { q, aoAmt: 0.05 });
}
const bevOr = (hi: boolean, w: number, h: number, d: number, b: number): THREE.BufferGeometry =>
  hi ? bevBox(w, h, d, b) : new THREE.BoxGeometry(w, h, d);
const ball = (r: number, hi: boolean): THREE.BufferGeometry =>
  new THREE.IcosahedronGeometry(r, hi ? 1 : 0);
const finish = (acc: Acc, rng: BuildOpts['rng']): THREE.BufferGeometry =>
  acc.finish(rng, false, true);

/* ============================== conveyorLine ============================== */

function conveyor({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const K = F.conveyor;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const L = K.length;
  const hl = L / 2;
  const top = K.beltY;
  const hz = K.width / 2;
  // legs under the rails + cross bars, rails (accent channel), belt slab, end drums
  const lx = Array.from({ length: K.legs }, (_, i) => -hl + 0.3 + (i * (L - 0.6)) / (K.legs - 1));
  for (const x of hi ? lx : [lx[0], lx[K.legs - 1]]) {
    for (const s of [-1, 1]) bx(acc, [0.14, 0.44, 0.14], [x, 0, s * (hz - 0.1)], P.steelDark, 0.2);
    if (hi) bx(acc, [0.1, 0.08, K.width - 0.2], [x, 0.3, 0], P.steel, 0.05);
  }
  for (const s of [-1, 1])
    bx(acc, [L, K.rail * 2, 0.14], [0, 0.46, s * (hz - 0.07)], P.accent, 0.1);
  bx(acc, [L - 0.26, top - 0.5, K.beltW], [0, 0.5, 0], P.belt, 0.05);
  for (const s of [-1, 1])
    cylAxis(acc, 'z', 0.13, K.beltW, [s * (hl - 0.13), 0.49, 0], P.steel, hi ? 10 : 6);
  if (hi) {
    // slats across the belt (a hair above it) and return rollers under the frame
    for (let i = 0; i < 9; i++)
      bx(acc, [0.1, 0.014, K.beltW - 0.04], [-hl + 0.45 + i * 0.4, top, 0], P.steelDark, 0);
    for (let i = 0; i < 5; i++)
      cylAxis(acc, 'z', 0.055, K.width + 0.08, [-hl + 0.55 + i * 0.7, 0.36, 0], P.steel, 6);
    for (const s of [-1, 1])
      put(acc, ball(0.07, true), [hl - 0.05, 0.62, s * (hz - 0.07)], P.yellow, { aoAmt: 0 });
  }
  const geoTop = top + 0.014;
  if (variant === 1) {
    // chute: plate sloping from the belt end to the ground, accent guards, a stop lip at the foot
    const x1 = hl + K.ramp;
    slope(acc, [hl - 0.13, top], [x1, 0.07], K.beltW, 0.07, P.belt);
    for (const s of [-1, 1]) {
      const a = V(hl, top + 0.05, s * (hz - 0.07));
      bar(acc, a, a.clone().add(V(0, 0.08, 0)), 0.12, P.accent);
      // sloped guard rail: a flat bar along the chute edge
      const len = Math.hypot(x1 - hl, top - 0.07);
      const ang = Math.atan2(0.07 - top, x1 - hl);
      put(
        acc,
        new THREE.BoxGeometry(len, 0.2, 0.14),
        [(hl + x1) / 2, (top + 0.07) / 2 + 0.08, s * (hz - 0.07)],
        P.accent,
        {
          q: qEuler(0, 0, ang),
          aoAmt: 0.05,
        },
      );
      if (hi)
        put(acc, baseBox(0.14, 0.34, 0.14), [x1 - 0.1, 0, s * (hz - 0.07)], P.steelDark, {
          aoAmt: 0.2,
        });
    }
    if (hi) bx(acc, [0.1, 0.1, K.beltW], [x1 - 0.05, 0, 0], P.yellow, 0.05);
  }
  const g = finish(acc, rng);
  addHook(g, 'belt', {
    from: [-hl, geoTop, 0],
    to: [hl, geoTop, 0],
    dir: [1, 0, 0],
    y: geoTop,
    width: K.beltW,
  });
  addHook(g, 'ends', { tail: [-hl, geoTop, 0], head: [hl, geoTop, 0], length: L });
  if (variant === 1)
    addHook(g, 'ramp', { from: [hl, top, 0], to: [hl + K.ramp, 0.07, 0], width: K.beltW });
  return g;
}

/* ============================== assemblyArm ============================== */

function armBase(acc: Acc, hi: boolean): void {
  bx(acc, [1.0, 0.1, 1.0], [0, 0, 0], P.steelDark, 0.25);
  if (!hi) {
    put(acc, cylB(0.4, 0.3, 0.72, 5), [0, 0.1, 0], P.cream, { aoAmt: 0.2 });
    return;
  }
  put(acc, cylB(0.4, 0.34, 0.52, hi ? 10 : 6), [0, 0.1, 0], P.cream, { aoAmt: 0.2 });
  put(acc, cylB(0.37, 0.37, 0.08, hi ? 10 : 6), [0, 0.38, 0], P.accent, { aoAmt: 0 });
  put(acc, cylB(0.3, 0.3, 0.1, hi ? 10 : 6), [0, 0.62, 0], P.dark, { aoAmt: 0.1 });
  if (hi)
    for (const k of [0, 1, 2, 3])
      put(
        acc,
        ball(0.04, false),
        [Math.cos((k * TAU) / 4 + PI / 4) * 0.42, 0.06, Math.sin((k * TAU) / 4 + PI / 4) * 0.42],
        P.yellow,
        { aoAmt: 0 },
      );
}
function armSwing(acc: Acc, hi: boolean): void {
  const A = F.arm;
  if (!hi) {
    bx(acc, [0.22, A.forearmY - 0.7, 0.22], [0, 0.7, 0], P.cream, 0.1);
    bx(acc, [A.reach + 0.3, 0.17, 0.17], [A.reach / 2, A.forearmY - 0.085, 0], P.accent, 0.1);
    bx(acc, [0.34, 0.8, 0.2], [A.reach, A.gripY, 0], P.dark, 0.05);
    return;
  }
  const seg = hi ? 10 : 6;
  put(acc, cylB(0.26, 0.24, 0.2, seg), [0, 0.72, 0], P.cream, { aoAmt: 0.1 });
  // shoulder post + elbow
  bx(acc, [0.22, A.forearmY - 0.9, 0.22], [0, 0.88, 0], P.cream, 0.15);
  put(acc, ball(0.2, hi), [0, A.forearmY, 0], P.accent, { aoAmt: 0 });
  // forearm out along +x, wrist ball, piston, gripper claw
  bx(acc, [A.reach + 0.1, 0.17, 0.17], [A.reach / 2, A.forearmY - 0.085, 0], P.accent, 0.1);
  put(acc, ball(0.14, hi), [A.reach, A.forearmY, 0], P.steel, { aoAmt: 0 });
  put(
    acc,
    cylB(0.055, 0.055, A.forearmY - A.gripY - 0.12, 6),
    [A.reach, A.gripY + 0.14, 0],
    P.steel,
    { aoAmt: 0 },
  );
  bx(acc, [0.34, 0.06, 0.22], [A.reach, A.gripY + 0.08, 0], P.dark, 0.05);
  for (const s of [-1, 1])
    bx(acc, [0.06, 0.22, 0.16], [A.reach + s * 0.15, A.gripY - 0.14, 0], P.yellow, 0.05);
  // status lamp on the elbow
  put(acc, ball(0.065, hi), [0, A.forearmY + 0.27, 0], P.lamp, lit);
  bx(acc, [0.04, 0.1, 0.04], [0, A.forearmY + 0.14, 0], P.dark, 0);
  if (hi) {
    // counterweight at the back of the elbow
    bx(acc, [0.3, 0.3, 0.24], [-0.26, A.forearmY - 0.25, 0], P.steelDark, 0.15);
  }
}
function gantryFrame(acc: Acc, hi: boolean): void {
  const G = F.gantry;
  const hs = G.span / 2;
  if (!hi) {
    for (const s of [-1, 1]) bx(acc, [0.2, G.beamY + 0.1, 0.2], [0, 0, s * hs], P.cream, 0.15);
    bx(acc, [0.24, 0.24, G.span + 0.5], [0, G.beamY - 0.02, 0], P.accent, 0.1);
    return;
  }
  for (const s of [-1, 1]) {
    bx(acc, [0.7, 0.08, 0.7], [0, 0, s * hs], P.steelDark, 0.25);
    bx(acc, [0.18, G.beamY + 0.1, 0.18], [0, 0.08, s * hs], P.cream, 0.15);
    bx(acc, [0.2, 0.2, 0.2], [0, 0.4, s * hs], P.accent, 0);
    if (hi) bar(acc, V(0, 0.2, s * hs), V(0.32, 0.04, s * (hs + 0.28)), 0.07, P.steel);
  }
  // beam along z, a gusset at each end, the pivot housing under the middle
  bx(acc, [0.24, 0.24, G.span + 0.5], [0, G.beamY - 0.02, 0], P.accent, 0.1);
  bx(acc, [0.34, 0.2, 0.34], [0, G.pivotY - 0.02, 0], P.dark, 0.1);
  if (hi) {
    for (const s of [-1, 1]) {
      bar(
        acc,
        V(0, G.beamY - 0.1, s * (hs - 0.1)),
        V(0, G.beamY - 0.5, s * (hs - 0.1)),
        0.07,
        P.steel,
      );
      put(acc, ball(0.07, false), [0, G.beamY + 0.2, s * hs], P.lamp, lit);
    }
  }
}
function gantryPendulum(acc: Acc, y0: number, hi: boolean): void {
  const G = F.gantry;
  if (!hi) {
    bx(acc, [0.1, G.pendulum - 0.2, 0.1], [0, y0 - G.pendulum + 0.2, 0], P.cream, 0.05);
    bx(acc, [0.5, 0.36, 0.44], [0, y0 - G.pendulum - 0.24, 0], P.dark, 0.05);
    return;
  }
  const seg = hi ? 8 : 5;
  put(acc, new THREE.CylinderGeometry(0.1, 0.1, 0.36, seg).rotateX(PI / 2), [0, y0, 0], P.steel, {
    aoAmt: 0,
  });
  put(acc, baseBox(0.1, G.pendulum - 0.2, 0.1), [0, y0 - G.pendulum + 0.2, 0], P.cream, {
    aoAmt: 0.05,
  });
  bx(acc, [0.5, 0.16, 0.44], [0, y0 - G.pendulum - 0.04, 0], P.dark, 0.05);
  for (const s of [-1, 1])
    bx(acc, [0.08, 0.2, 0.36], [s * 0.2, y0 - G.pendulum - 0.24, 0], P.yellow, 0.05);
}

function assemblyArm({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const A = F.arm;
  const G = F.gantry;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  if (variant === 0 || variant === 2) armBase(acc, hi);
  if (variant === 0 || variant === 3) armSwing(acc, hi);
  if (variant === 1 || variant === 4) gantryFrame(acc, hi);
  if (variant === 1) gantryPendulum(acc, G.pivotY - 0.1, hi);
  if (variant === 5) gantryPendulum(acc, G.pivotY - 0.1, hi);
  const g = finish(acc, rng);
  if (variant === 0 || variant === 3)
    addHook(g, 'joint', {
      kind: 'yaw',
      at: [0, A.shoulderY, 0],
      axis: [0, 1, 0],
      restDir: [1, 0, 0],
      reach: A.reach,
      grip: [A.reach, A.gripY, 0],
    });
  if (variant === 0 || variant === 2) addHook(g, 'base', { top: 0.67, radius: 0.4 });
  if (variant === 1 || variant === 4 || variant === 5)
    addHook(g, 'joint', {
      kind: 'pendulum',
      at: [0, G.pivotY - 0.1, 0],
      axis: [0, 0, 1],
      restDir: [0, -1, 0],
      length: G.pendulum,
      span: G.span,
    });
  return g;
}

/* ============================== foundryPart ============================== */

/** Crate walls + frame; contents are added by the caller. Returns the rim y. */
function crate(acc: Acc, hi: boolean, w: number, d: number, h: number): void {
  if (!hi) {
    bx(acc, [w, h, d], [0, 0.06, 0], P.wood, 0.1);
    return;
  }
  const t = 0.07;
  bx(acc, [w, 0.08, d], [0, 0.06, 0], P.woodDark, 0.2);
  bx(acc, [w, h - 0.06, t], [0, 0.06, d / 2 - t / 2], P.wood, 0.1);
  bx(acc, [w, h - 0.06, t], [0, 0.06, -d / 2 + t / 2], P.wood, 0.1);
  bx(acc, [t, h - 0.06, d - 2 * t], [w / 2 - t / 2, 0.06, 0], P.wood, 0.1);
  bx(acc, [t, h - 0.06, d - 2 * t], [-w / 2 + t / 2, 0.06, 0], P.wood, 0.1);
  for (const s of [-1, 1])
    bx(acc, [0.16, 0.06, d + 0.02], [s * (w / 2 - 0.16), h * 0.5, 0], P.accent, 0, undefined);
  if (hi) {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        bx(acc, [0.1, 0.06, 0.1], [sx * (w / 2 - 0.02), 0, sz * (d / 2 - 0.02)], P.steelDark, 0);
  }
}

const S = BOT_SCALE;
const botAcc = (rng: BuildOpts['rng'], lod: BuildOpts['lod']): Acc => {
  const acc = cultureAcc(rng, lod);
  acc.xf = (acc.xf ?? new THREE.Matrix4()).clone().multiply(mat([0, 0, 0], null, S));
  return acc;
};
const cbx = (
  acc: Acc,
  size: Pt,
  at: Pt,
  color: string,
  o: { emissive?: number; aoAmt?: number } = {},
): void => put(acc, new THREE.BoxGeometry(...size), at, color, { aoAmt: 0.06, ...o });

/** Torso (bevelled, tinted) at the world bot's proportions, before the S scale. */
function botTorso(acc: Acc, hi: boolean): void {
  const B = P.bot;
  if (!hi) {
    bx(acc, [0.3, 0.2, 0.32], [0, 0, 0], B.metal, 0.1);
    put(acc, new THREE.BoxGeometry(0.3, 0.34, 0.38), [0, 0.39, 0], B.tint, { aoAmt: 0.1 });
    return;
  }
  for (const s of [-1, 1]) {
    bx(acc, [0.12, 0.2, 0.12], [0, 0.02, 0.1 * s], B.metal, 0.1);
    bx(acc, [0.2, 0.07, 0.15], [0.04, 0, 0.1 * s], B.foot, 0.05);
    cbx(acc, [0.09, 0.26, 0.09], [0, 0.37, 0.255 * s], B.tint);
    if (hi) cbx(acc, [0.11, 0.09, 0.11], [0, 0.25, 0.255 * s], B.hand);
  }
  put(acc, bevOr(hi, 0.3, 0.34, 0.38, 0.05), [0, 0.39, 0], B.tint, { aoAmt: 0.1 });
  if (hi) {
    cbx(acc, [0.012, 0.14, 0.2], [0.152, 0.38, 0], B.plate);
    cbx(acc, [0.012, 0.036, 0.036], [0.157, 0.43, 0.06], B.light, lit);
  }
}
function botHead(acc: Acc, hi: boolean, eyes: boolean): void {
  const B = P.bot;
  if (!hi) {
    put(acc, new THREE.BoxGeometry(0.34, 0.38, 0.5), [0, 0.78, 0], B.shell, { aoAmt: 0.05 });
    return;
  }
  put(acc, bevOr(hi, 0.34, 0.38, 0.5, 0.06), [0, 0.78, 0], B.shell, { aoAmt: 0.05 });
  cbx(acc, [0.02, 0.29, 0.4], [0.174, 0.775, 0], B.screen);
  for (const s of [-1, 1]) cbx(acc, [0.06, 0.15, 0.06], [0, 0.77, (0.25 + 0.035) * s], B.tint);
  if (eyes) {
    for (const s of [-1, 1]) cbx(acc, [0.024, 0.1, 0.068], [0.186, 0.805, 0.085 * s], B.eye, lit);
    if (hi)
      for (const s of [-1, 1])
        cbx(acc, [0.016, 0.05, 0.08], [0.182, 0.725, 0.15 * s], B.blush, { aoAmt: 0 });
  }
}

function foundryPart({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const B = P.bot;
  if (variant < 3) {
    // part crates: 1.4 x 1.0 u, rim 0.5 u; parts stand in them
    const acc = cultureAcc(rng, lod);
    const w = 1.4;
    const d = 1.0;
    const h = 0.5;
    crate(acc, hi, w, d, h);
    const base = 0.14;
    if (variant === 0) {
      for (const x of [-0.36, 0.36]) {
        put(
          acc,
          bevOr(hi, 0.3 * S, 0.34 * S, 0.38 * S, 0.05 * S),
          [x, base + 0.17 * S, 0],
          B.tint,
          { aoAmt: 0.1, q: qEuler(0, x < 0 ? -PI / 2 : 0.2, 0) },
        );
      }
    } else if (variant === 1) {
      for (const x of [-0.36, 0.36])
        put(
          acc,
          bevOr(hi, 0.34 * S, 0.38 * S, 0.5 * S, 0.06 * S),
          [x, base + 0.19 * S, 0],
          B.shell,
          { aoAmt: 0.05, q: qEuler(0, -PI / 2, 0) },
        );
      if (hi)
        for (const x of [-0.36, 0.36])
          cbx(acc, [0.4 * S, 0.29 * S, 0.02], [x, base + 0.19 * S, 0.174 * S], B.screen, {
            aoAmt: 0,
          });
    } else {
      const rows: [number, number, number, number][] = [
        [-0.45, -0.25, 0.9, 0.05],
        [-0.15, 0.2, 1.15, -0.04],
        [0.2, -0.2, 1.0, 0.06],
        [0.48, 0.25, 1.2, -0.05],
        [0.0, 0.0, 1.35, 0.0],
      ];
      for (const [x, z, hgt, lean] of rows) {
        if (!hi) {
          bx(acc, [0.06, hgt, 0.06], [x, base, z], B.metal, 0, qEuler(lean, 0, -lean));
          continue;
        }
        put(acc, cylB(0.025, 0.025, hgt, 4), [x, base, z], B.metal, {
          aoAmt: 0,
          q: qEuler(lean, 0, -lean),
        });
        put(
          acc,
          ball(0.085, hi),
          [x - lean * hgt, base + hgt + 0.04, z + lean * hgt],
          B.antenna,
          lit,
        );
      }
    }
    const g = finish(acc, rng);
    return addHook(g, 'slot', {
      at: [0, h, 0],
      size: [w, d],
      kind: ['bodies', 'heads', 'antennas'][variant],
    });
  }
  const acc = botAcc(rng, lod);
  botTorso(acc, hi);
  if (variant === 3) {
    // neck socket where the head goes
    if (hi) put(acc, cylB(0.09, 0.09, 0.02, 8), [0, 0.56, 0], B.screen, { aoAmt: 0 });
  } else {
    botHead(acc, hi, variant === 5);
  }
  if (variant === 5) {
    cbx(acc, [0.028, 0.15, 0.028], [-0.03, 0.97 + 0.07, 0], B.metal);
    if (hi) put(acc, ball(0.05, hi), [-0.03, 0.97 + 0.17, 0], B.antenna, lit);
  }
  const g = finish(acc, rng);
  const topY = (variant === 3 ? 0.56 : variant === 4 ? 0.97 : 1.19) * S;
  addHook(g, 'bot', {
    forward: [1, 0, 0],
    scale: S,
    stage: variant - 3,
    height: topY,
    headSocket: [0, 0.56 * S, 0],
    antennaSocket: [-0.03 * S, 0.97 * S, 0],
  });
  return g;
}

/* ============================== dronePad ============================== */

function dronePad({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const K = F.pad;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const seg = hi ? 28 : 8;
  put(acc, cylB(K.radius + 0.2, K.radius + 0.2, 0.08, seg), [0, 0, 0], P.concrete, { aoAmt: 0.2 });
  put(acc, cylB(K.radius, K.radius, K.top, seg), [0, 0, 0], P.asphalt, { aoAmt: 0.1 });
  put(acc, cylB(K.ringR + 0.07, K.ringR + 0.07, K.top + 0.012, seg), [0, 0, 0], P.yellow, {
    aoAmt: 0,
  });
  put(acc, cylB(K.ringR - 0.07, K.ringR - 0.07, K.top + 0.024, seg), [0, 0, 0], P.asphalt, {
    aoAmt: 0,
  });
  // the H: two verticals along z and the crossbar
  const t = K.top + 0.024;
  const hz = 0.55;
  for (const s of [-1, 1]) bx(acc, [0.17, 0.014, hz * 2], [s * 0.36, t, 0], P.white, 0);
  bx(acc, [0.55, 0.014, 0.17], [0, t, 0], P.white, 0);
  const lamps: Pt[] = [];
  const n = K.lights;
  for (let i = 0; i < n; i++) {
    const a = (i * TAU) / n;
    const at: Pt = [Math.cos(a) * K.lightR, K.top, Math.sin(a) * K.lightR];
    if (hi) put(acc, cylB(0.09, 0.07, 0.1, 6), at, P.lamp, lit);
    lamps.push([at[0], K.top + 0.1, at[2]]);
  }
  const g = finish(acc, rng);
  addHook(g, 'pad', { center: [0, K.top, 0], radius: K.radius, y: t, ringR: K.ringR });
  addHook(g, 'landing', {
    at: [0, K.restY, 0],
    note: 'drone body centre at rest (packet 0.54 below)',
  });
  return addHook(g, 'lights', { list: lamps, y: K.top + 0.1, r: 0.075 });
}

/* ============================== chargeMast ============================== */

function chargeMast({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const seg = hi ? 8 : 5;
  put(acc, cylB(0.3, 0.26, 0.16, seg), [0, 0, 0], P.concrete, { aoAmt: 0.25 });
  if (!hi) {
    if (variant === 0) {
      put(acc, cylB(0.1, 0.075, 2.4, 5), [0, 0.16, 0], P.cream, { aoAmt: 0.15 });
      bx(acc, [0.9, 0.09, 0.09], [0.5, 1.5, 0], P.steel, 0.05);
      bx(acc, [0.42, 0.14, 0.42], [0.95, 1.4, 0], P.dark, 0.05);
      bx(acc, [0.3, 0.3, 0.3], [0, 2.58, 0], P.lamp, 0, undefined);
    } else {
      put(acc, cylB(0.08, 0.07, 0.62, 5), [0, 0.16, 0], P.cream, { aoAmt: 0.15 });
      put(acc, cylB(0.34, 0.34, 0.08, 5), [0, 0.78, 0], P.dark, { aoAmt: 0.05 });
    }
  } else if (variant === 0) {
    put(acc, cylB(0.1, 0.075, 2.4, seg), [0, 0.16, 0], P.cream, { aoAmt: 0.15 });
    put(acc, cylB(0.12, 0.12, 0.1, seg), [0, 0.7, 0], P.accent, { aoAmt: 0 });
    // charging arm out to +x with a flat cradle the drone hovers at, blue charge ring
    bx(acc, [0.9, 0.09, 0.09], [0.5, 1.5, 0], P.steel, 0.05);
    bx(acc, [0.42, 0.06, 0.42], [0.95, 1.44, 0], P.dark, 0.05);
    put(acc, cylB(0.13, 0.13, 0.014, seg), [0.95, 1.5, 0], P.led, lit);
    if (hi) bar(acc, V(0.12, 1.2, 0), V(0.62, 1.48, 0), 0.05, P.steel);
    // beacon at the top
    put(acc, cylB(0.12, 0.08, 0.16, seg), [0, 2.56, 0], P.steelDark, { aoAmt: 0 });
    put(acc, ball(0.15, hi), [0, 2.72, 0], P.lamp, lit);
  } else {
    put(acc, cylB(0.08, 0.07, 0.62, seg), [0, 0.16, 0], P.cream, { aoAmt: 0.15 });
    put(acc, cylB(0.34, 0.34, 0.08, hi ? 12 : 6), [0, 0.78, 0], P.dark, { aoAmt: 0.05 });
    put(acc, cylB(0.22, 0.22, 0.014, hi ? 12 : 6), [0, 0.86, 0], P.led, lit);
    put(acc, ball(0.07, hi), [0.28, 0.8, 0], P.lamp, lit);
  }
  const g = finish(acc, rng);
  if (variant === 0) {
    addHook(g, 'lamp', { at: [0, 2.72, 0], r: 0.15 });
    return addHook(g, 'cradle', { at: [0.95, 1.5, 0], r: 0.21 });
  }
  addHook(g, 'lamp', { at: [0.28, 0.8, 0], r: 0.07 });
  return addHook(g, 'cradle', { at: [0, 0.87, 0], r: 0.34 });
}

/* ============================== droneHangar ============================== */

function droneHangar({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const K = F.hangar;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const hw = K.w / 2;
  bx(acc, [K.w + 0.3, 0.07, K.d + 0.3], [0, 0, 0], P.concrete, 0.2);
  bx(acc, [K.w, K.wallH, K.d], [0, 0.07, 0], P.cream, 0.2);
  // barrel roof over the walls: half-ellipse section extruded along z, with a small overhang
  const n = hi ? 10 : 2;
  const pts: THREE.Vector2[] = [V2(-hw - 0.12, 0)];
  for (let i = 0; i <= n; i++) {
    const a = PI - (i * PI) / n;
    pts.push(V2(Math.cos(a) * (hw + 0.12), Math.sin(a) * K.roofH));
  }
  pts.push(V2(hw + 0.12, 0));
  put(acc, prism(pts, K.d + 0.24), [0, 0.07 + K.wallH, 0], P.accent, { aoAmt: 0.05 });
  const dz = K.d / 2;
  // door opening (dark), the roll shutter half up, yellow frame, ground apron strip
  const dw = K.w * 0.7;
  const dh = K.wallH * 0.82;
  bx(acc, [dw, dh, 0.05], [0, 0.07, dz + 0.02], P.dark, 0);
  if (hi) {
    bx(acc, [dw + 0.2, dh + 0.1, 0.03], [0, 0.07, dz + 0.005], P.yellow, 0);
    bx(acc, [dw, dh * 0.36, 0.07], [0, 0.07 + dh * 0.64, dz + 0.04], P.cream, 0.05);
    for (let i = 0; i < 3; i++)
      bx(acc, [dw, 0.012, 0.075], [0, 0.07 + dh * 0.64 + 0.08 + i * 0.1, dz + 0.04], P.steel, 0);
    // roof vent ribs and side lamps
    for (const s of [-1, 1]) {
      put(acc, ball(0.06, false), [s * (dw / 2 + 0.2), 0.07 + dh * 0.9, dz + 0.04], P.lamp, lit);
    }
  }
  if (hi) put(acc, ball(0.1, hi), [0, 0.07 + K.wallH + K.roofH + 0.06, dz - 0.2], P.lamp, lit);
  const g = finish(acc, rng);
  addHook(g, 'door', { at: [0, 0.07, dz + 0.04], size: [dw, dh], dir: [0, 0, 1] });
  addHook(g, 'apron', { at: [0, 0.07, dz + 1.2], dir: [0, 0, 1] });
  return addHook(g, 'lamp', { at: [0, 0.07 + K.wallH + K.roofH + 0.06, dz - 0.2], r: 0.1 });
}

/* ============================== botCourse ============================== */

function cone(acc: Acc, x: number, z: number, hi: boolean): void {
  if (hi) put(acc, baseBox(0.34, 0.03, 0.34), [x, 0, z], P.steelDark, { aoAmt: 0 });
  put(
    acc,
    new THREE.ConeGeometry(0.17, 0.5, hi ? 10 : 5).translate(0, 0.25, 0),
    [x, 0.03, z],
    P.orange,
    { aoAmt: 0.1 },
  );
  if (hi)
    put(
      acc,
      new THREE.CylinderGeometry(0.098, 0.12, 0.08, 10).translate(0, 0.26, 0),
      [x, 0.03, z],
      P.white,
      { aoAmt: 0 },
    );
}

function botCourse({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const hz = 0.8;
  let topY = 0.6;
  const path: { from: Pt; to: Pt } = { from: [-1.2, 0, 0], to: [1.2, 0, 0] };
  if (variant === 0) {
    // three steps going up along +x, yellow nosing
    if (!hi) bx(acc, [2.1, 0.55, hz * 2], [0, 0, 0], P.teal, 0.15);
    for (let i = 0; i < (hi ? 3 : 0); i++) {
      const h = 0.2 * (i + 1);
      bx(acc, [0.7, h, hz * 2], [-0.7 + i * 0.7, 0, 0], i % 2 ? P.cream : P.teal, 0.15);
      bx(acc, [0.1, 0.02, hz * 2 + 0.02], [-0.7 + i * 0.7 - 0.3, h, 0], P.yellow, 0);
    }
    path.from = [-1.5, 0, 0];
    path.to = [0.7, 0.6, 0];
  } else if (variant === 1) {
    // wedge ramp, 2.4 long x 0.6 high, chevron bars across, stop block
    const wedge = new THREE.Shape([V2(0, 0), V2(2.4, 0), V2(2.4, 0.6)]);
    const geo = new THREE.ExtrudeGeometry(wedge, { depth: hz * 2, bevelEnabled: false });
    geo.translate(-1.2, 0, -hz);
    put(acc, geo, [0, 0, 0], P.teal, { aoAmt: 0.15 });
    if (hi)
      for (let i = 0; i < 5; i++) {
        const x = -0.85 + i * 0.4;
        const y = ((x + 1.2) / 2.4) * 0.6;
        slope(
          acc,
          [x - 0.07, y - 0.0175],
          [x + 0.07, y + 0.0175],
          hz * 2 - 0.1,
          0.02,
          P.yellow,
          0,
          0,
        );
      }
    bx(acc, [0.12, 0.7, hz * 2], [1.28, 0, 0], P.steelDark, 0.1);
    path.from = [-1.6, 0, 0];
    path.to = [1.2, 0.6, 0];
  } else if (variant === 2) {
    const xs = [-1.5, -0.75, 0, 0.75, 1.5];
    xs.forEach((x, i) => cone(acc, x, i % 2 ? -0.32 : 0.32, hi));
    topY = 0.53;
    path.from = [-2, 0, 0];
    path.to = [2, 0, 0];
  } else {
    // tiny bridge: two abutments, an arched plank deck, rail posts + rope
    const L = 2.4;
    for (const s of [-1, 1]) bx(acc, [0.7, 0.3, hz * 2], [s * (L / 2 + 0.2), 0, 0], P.teal, 0.2);
    if (!hi) {
      bx(acc, [L, 0.12, hz * 2 - 0.1], [0, 0.26, 0], P.wood, 0.05);
      for (const s of [-1, 1]) bx(acc, [L, 0.05, 0.05], [0, 0.78, s * (hz - 0.07)], P.yellow, 0);
    }
    const planks = hi ? 8 : 0;
    for (let i = 0; i < planks; i++) {
      const u = (i + 0.5) / planks;
      const x = -L / 2 + u * L;
      const y = 0.3 + Math.sin(u * PI) * 0.16;
      bx(
        acc,
        [L / planks - (hi ? 0.03 : 0), 0.06, hz * 2 - 0.1],
        [x, y - 0.06, 0],
        i % 2 ? P.wood : P.woodDark,
        0.05,
        qEuler(0, 0, Math.cos(u * PI) * 0.21),
      );
    }
    for (const s of hi ? [-1, 1] : []) {
      for (const u of [0.0, 0.25, 0.5, 0.75, 1.0]) {
        const x = -L / 2 + u * L;
        const y = 0.3 + Math.sin(u * PI) * 0.16;
        bx(acc, [0.07, 0.34, 0.07], [x, y - 0.02, s * (hz - 0.07)], P.woodDark, 0.1);
      }
      bar(acc, V(-L / 2, 0.62, s * (hz - 0.07)), V(0, 0.8, s * (hz - 0.07)), 0.04, P.yellow);
      bar(acc, V(0, 0.8, s * (hz - 0.07)), V(L / 2, 0.62, s * (hz - 0.07)), 0.04, P.yellow);
    }
    topY = 0.82;
    path.from = [-L / 2 - 0.5, 0.3, 0];
    path.to = [L / 2 + 0.5, 0.3, 0];
  }
  const g = finish(acc, rng);
  addHook(g, 'path', { from: path.from, to: path.to, dir: [1, 0, 0], width: hz * 2 });
  return addHook(g, 'top', { y: topY });
}

/* ============================== serverPod ============================== */

function serverPod({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const K = F.pod;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const hw = K.w / 2;
  const hd = K.d / 2;
  bx(acc, [K.w + 0.2, 0.16, K.d + 0.2], [0, 0, 0], P.concrete, 0.25);
  put(acc, bevOr(hi, K.w, K.h - 0.16, K.d, 0.08), [0, 0.16 + (K.h - 0.16) / 2, 0], P.navy, {
    aoAmt: 0.15,
  });
  // cream cap, front grille panel, blue LED strip + a row of status dots
  bx(acc, [K.w + 0.08, 0.12, K.d + 0.08], [0, K.h, 0], P.cream, 0.05);
  if (hi) bx(acc, [K.w - 0.5, K.h - 0.7, 0.04], [-0.12, 0.38, hd + 0.01], P.navyDeep, 0);
  if (hi)
    for (let i = 0; i < 6; i++)
      bx(acc, [K.w - 0.56, 0.035, 0.05], [-0.12, 0.5 + i * 0.2, hd + 0.03], P.steelDark, 0);
  const ledX = hw - 0.26;
  put(acc, baseBox(0.12, K.h - 0.66, 0.05), [ledX, 0.34, hd + 0.02], P.led, { ...lit });
  // chimney with a steam cap, side pipes into the lake
  put(acc, cylB(0.2, 0.2, 0.42, hi ? 10 : 5), [-0.45, K.h + 0.12, -0.1], P.steel, { aoAmt: 0.1 });
  if (hi)
    put(acc, cylB(0.26, 0.2, 0.08, 10), [-0.45, K.h + 0.54, -0.1], P.steelDark, {
      aoAmt: 0,
    });
  for (const s of hi ? [-1, 1] : []) {
    cylAxis(acc, 'z', 0.1, 1.4, [s * (hw - 0.4), 0.3, hd + 0.5], P.teal, hi ? 8 : 5);
    if (hi) put(acc, ball(0.14, false), [s * (hw - 0.4), 0.3, hd + 1.2], P.steel, { aoAmt: 0 });
  }
  if (hi) {
    for (let i = 0; i < 5; i++)
      bx(
        acc,
        [0.04, K.h - 0.9, K.d * 0.7],
        [hw + 0.01 + (i % 2) * 0.0, 0.5, 0],
        P.steelDark,
        0.05,
        undefined,
      );
    cylAxis(acc, 'x', 0.07, K.w - 0.4, [0, 0.12 + K.h * 0.0 + 0.0, hd + 0.18], P.steel, 6);
  }
  const g = finish(acc, rng);
  addHook(g, 'led', {
    at: [ledX, 0.34 + (K.h - 0.66) / 2, hd + 0.045],
    size: [0.12, K.h - 0.66],
    dir: [0, 0, 1],
  });
  addHook(g, 'steam', { at: [-0.45, K.h + 0.62, -0.1], dir: [0, 1, 0], r: 0.2 });
  return addHook(g, 'intake', { at: [0, 0.3, hd + 1.2], dir: [0, 0, 1] });
}

/* ============================== cloudBalloon ============================== */

function cloudBalloon({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const K = F.cloud;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const noise = createNoise(rng.fork('cloud'));
  if (variant !== 1) {
    bx(acc, [K.anchor, 0.42, K.anchor], [0, 0, 0], P.concrete, 0.25);
    bx(acc, [K.anchor - 0.2, 0.06, K.anchor - 0.2], [0, 0.42, 0], P.steelDark, 0.05);
    if (hi)
      put(acc, new THREE.TorusGeometry(0.12, 0.035, 5, 10).rotateX(PI / 2), [0, 0.54, 0], P.steel, {
        aoAmt: 0,
      });
  }
  {
    // tether
    const t0 = variant === 1 ? 0 : 0.5;
    if (hi) put(acc, cylB(0.03, 0.026, K.tetherH - t0, 4), [0, t0, 0], P.cream, { aoAmt: 0 });
    else bx(acc, [0.08, K.tetherH - t0, 0.08], [0, t0, 0], P.cream, 0);
    // cloud: seven lumpy puffs, white on top, lavender underneath
    const puffs: [number, number, number, number][] = [
      [0, 0, 0, 1.2],
      [-1.0, -0.15, 0.2, 0.85],
      [1.0, -0.2, -0.1, 0.9],
      [0.3, 0.4, 0.5, 0.75],
      [-0.4, 0.3, -0.5, 0.7],
      [0.05, -0.3, 0.7, 0.7],
      [0.2, -0.2, -0.7, 0.65],
    ];
    const col = gradY([P.cloudLow, P.cloudShade, P.cloud, P.cloud], K.bodyY - 1.6, K.bodyY + 1.5);
    puffs.forEach(([x, y, z, r], i) => {
      const geo = hi ? blob(r, 1, noise, 0.1, 1.5, i * 3.1) : blob(r, 0, noise, 0.06, 1.5, i * 3.1);
      put(acc, geo, [x, K.bodyY + y, z], col, { aoAmt: 0, ao: () => 1, noJitter: false });
    });
    // bridle: three lines from the tether top up into the cloud belly
    const tt = V(0, K.tetherH, 0);
    if (hi)
      for (const [x, z] of [
        [0.45, 0],
        [-0.25, 0.4],
        [-0.25, -0.4],
      ])
        bar(acc, tt, V(x, K.bodyY - 0.75, z), 0.02, P.cream);
    if (hi) put(acc, ball(0.07, false), [0, K.tetherH, 0], P.steel, { aoAmt: 0 });
  }
  const g = finish(acc, rng);
  {
    addHook(g, 'tether', {
      base: [0, variant === 1 ? 0 : 0.54, 0],
      top: [0, K.tetherH, 0],
      length: K.tetherH - (variant === 1 ? 0 : 0.54),
    });
    addHook(g, 'body', {
      center: [0, K.bodyY, 0],
      radius: K.bodyR,
      pivot: [0, variant === 1 ? 0 : 0.54, 0],
    });
  }
  if (variant !== 1) addHook(g, 'anchor', { at: [0, 0.54, 0], size: K.anchor });
  return g;
}

/* ============================== quantumPavilion ============================== */

function quantumPavilion({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const K = F.pavilion;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const n = K.sides;
  const R = K.radius;
  const yFloor = K.plinth + 0.02;
  const seg = n;
  // plinth: two octagonal steps, inner floor
  put(acc, cylB(R + 0.5, R + 0.4, K.plinth * 0.55, seg), [0, 0, 0], P.concrete, {
    q: qEuler(0, PI / n, 0),
    aoAmt: 0.25,
  });
  put(acc, cylB(R + 0.3, R + 0.25, K.plinth, seg), [0, 0, 0], P.cream, {
    q: qEuler(0, PI / n, 0),
    aoAmt: 0.1,
  });
  put(acc, cylB(R - 0.1, R - 0.1, yFloor, hi ? 16 : 8), [0, 0, 0], P.glassFrame, { aoAmt: 0 });
  // corner posts, a base rail band + glass half panels, eave ring
  const corner = (i: number): THREE.Vector3 =>
    V(Math.cos(((i + 0.5) * TAU) / n) * R, 0, Math.sin(((i + 0.5) * TAU) / n) * R);
  const panelLen = 2 * R * Math.sin(PI / n);
  for (let i = 0; i < n; i++) {
    const c = corner(i);
    const m = corner(i)
      .add(corner(i + 1))
      .multiplyScalar(0.5);
    const ang = -Math.atan2(corner(i + 1).z - c.z, corner(i + 1).x - c.x);
    bx(acc, [0.1, K.postH - yFloor, 0.1], [c.x, yFloor, c.z], P.glassFrame, 0.05);
    // glass half panel (opaque pale slab, upper half stays open so the chandelier shows)
    const doorway = i === 1; // the panel centred on +z is the entrance: no glass, no low rail
    if (!doorway) {
      put(acc, baseBox(panelLen - 0.1, 0.55, 0.04), [m.x, yFloor + 0.12, m.z], P.glass, {
        q: qEuler(0, ang, 0),
        aoAmt: 0,
      });
      if (hi)
        put(acc, baseBox(panelLen, 0.09, 0.09), [m.x, yFloor + 0.67, m.z], P.glassFrame, {
          q: qEuler(0, ang, 0),
          aoAmt: 0,
        });
    }
    if (hi)
      put(acc, baseBox(panelLen, 0.09, 0.09), [m.x, K.postH - 0.09, m.z], P.glassFrame, {
        q: qEuler(0, ang, 0),
        aoAmt: 0,
      });
    if (hi)
      put(acc, baseBox(panelLen - 0.1, 0.05, 0.05), [m.x, yFloor + 1.55, m.z], P.glassFrame, {
        q: qEuler(0, ang, 0),
        aoAmt: 0,
      });
  }
  // entrance gap on +z is the panel facing +z: lower it (a doorway) by skipping nothing: marked by steps
  bx(acc, [0.9, 0.12, 0.5], [0, 0, R + 0.42], P.cream, 0.1);
  // glass roof: pyramid of 8 pale slabs on a gold ring, gold finial
  put(
    acc,
    new THREE.ConeGeometry(R + 0.22, K.apex - K.postH + 0.02, n).translate(
      0,
      (K.apex - K.postH) / 2,
      0,
    ),
    [0, K.postH, 0],
    P.glass,
    { q: qEuler(0, PI / n, 0), aoAmt: 0 },
  );
  put(acc, cylB(0.12, 0.05, 0.12, 8), [0, K.apex - 0.08, 0], P.gold, { aoAmt: 0 });
  // the chandelier computer: gold tiers on a central stem, rods between, a glowing core at the foot
  const stemTop = K.apex - 0.12;
  const tiers: [number, number][] = [
    [0.5, 2.52],
    [0.42, 2.22],
    [0.34, 1.92],
    [0.26, 1.62],
    [0.18, 1.36],
  ];
  put(acc, cylB(0.05, 0.05, stemTop - 1.1, 6), [0, 1.1, 0], P.goldDeep, { aoAmt: 0 });
  for (const [r, y] of hi ? tiers : [tiers[0], tiers[4]]) {
    put(acc, cylB(r, r, 0.05, hi ? 14 : 6), [0, y, 0], P.gold, { aoAmt: 0 });
    if (hi) {
      put(acc, cylB(r - 0.05, r - 0.05, 0.02, 12), [0, y + 0.05, 0], P.goldDeep, { aoAmt: 0 });
      for (let k = 0; k < 4; k++) {
        const a = (k * TAU) / 4 + PI / 4;
        put(
          acc,
          cylB(0.016, 0.016, 0.34, 4),
          [Math.cos(a) * (r - 0.04), y - 0.34, Math.sin(a) * (r - 0.04)],
          P.goldDeep,
          { aoAmt: 0 },
        );
      }
    }
  }
  put(acc, ball(0.17, hi), [0, 1.08, 0], P.led, lit);
  const g = finish(acc, rng);
  addHook(g, 'glow', { at: [0, 1.08, 0], r: 0.17 });
  addHook(g, 'chandelier', {
    top: [0, K.apex - 0.1, 0],
    bottom: [0, 0.91, 0],
    tiers: tiers.length,
  });
  return addHook(g, 'door', { at: [0, K.plinth, R + 0.2], dir: [0, 0, 1] });
}

/* ============================== registry glue ============================== */

const hs = (...h: number[]): readonly number[] => h;

export const CODING_M33_GEO: readonly PropGeoDef[] = [
  {
    id: 'conveyorLine',
    variants: 2,
    build: conveyor,
    footprint: F.conveyor.footprint,
    height: 0.7,
    heights: F.conveyor.heights,
    windy: false,
  },
  {
    id: 'assemblyArm',
    variants: 6,
    build: assemblyArm,
    footprint: F.gantry.footprint,
    height: 2.1,
    heights: hs(2.1, 2.76, 0.72, 2.1, 2.77, 2.38),
    windy: false,
  },
  {
    id: 'foundryPart',
    variants: 6,
    build: foundryPart,
    footprint: F.footprintPart,
    height: 0.72,
    heights: hs(0.72, 0.78, 1.61, 0.99, 1.64, 2.04),
    windy: false,
  },
  {
    id: 'dronePad',
    variants: 1,
    build: dronePad,
    footprint: F.pad.footprint,
    height: 0.22,
    windy: false,
  },
  {
    id: 'chargeMast',
    variants: 2,
    build: chargeMast,
    footprint: F.mast.footprint,
    height: 2.88,
    heights: hs(2.88, 0.88),
    windy: false,
  },
  {
    id: 'droneHangar',
    variants: 1,
    build: droneHangar,
    footprint: F.hangar.footprint,
    height: 2.7,
    windy: false,
  },
  {
    id: 'botCourse',
    variants: 4,
    build: botCourse,
    footprint: F.track.footprint,
    height: 0.63,
    heights: hs(0.63, 0.7, 0.53, 0.82),
    windy: false,
  },
  {
    id: 'serverPod',
    variants: 1,
    build: serverPod,
    footprint: F.pod.footprint,
    height: 2.52,
    windy: false,
  },
  {
    id: 'cloudBalloon',
    variants: 2,
    build: cloudBalloon,
    footprint: F.cloud.footprint,
    height: 8.47,
    heights: hs(8.47, 8.44),
    windy: false,
  },
  {
    id: 'quantumPavilion',
    variants: 1,
    build: quantumPavilion,
    footprint: F.pavilion.footprint,
    height: 3.05,
    windy: false,
  },
];
