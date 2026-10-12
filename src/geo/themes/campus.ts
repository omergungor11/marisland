/**
 * Observatory University campus structures (TASK-402a), Research island: observatory (the summit
 * landmark), facultyHall, libraryRotunda, campusTower, terrarium. Colours: CAMPUS_PALETTE
 * (content/themes/research.ts); glass = the biodome technique (tinted opaque panes that glow at
 * night, BIODOME_PALETTE). Defs: content/props-themes/research.ts.
 *
 * Conventions: pivot at the ground centre, door on local +z, 1 u = 1 m. Lit windows are
 * `windowAt` panes (emissive 1, the same night-glow class as every other building).
 *
 * Hooks (userData.hooks): every def has `door` `{ center, normal }` (the door on +z);
 * observatory also `slit` `{ center, normal }` (the open shutter, rotated by the variant).
 */
import * as THREE from 'three';
import { BIODOME_PALETTE as P, CAMPUS_PALETTE as K } from '../../content/themes/research.ts';
import { hashInts } from '../../core/hash.ts';
import type { Rng } from '../../core/rng.ts';
import { col, qEuler, qFromTo, type Acc } from '../kit.ts';
import {
  TAU,
  V,
  V2,
  baseBox,
  cylB,
  doorAt,
  gableRoof,
  jitterAcc,
  lathe,
  prism,
  put,
  windowAt,
} from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { addHook } from './hq.ts';

const Y = V(0, 1, 0);
const Z = V(0, 0, 1);
const PI = Math.PI;

/** Point at azimuth `a` (0 = +z, towards +x) and radius `r`, height `y`. */
const az = (r: number, a: number, y: number): THREE.Vector3 =>
  V(Math.sin(a) * r, y, Math.cos(a) * r);

/** Stable per-face pick from a list by the face centroid (no rng consumed). */
const pickAt = <T>(list: readonly T[], p: THREE.Vector3, salt: number): T =>
  list[
    hashInts(Math.round(p.x * 97), Math.round(p.y * 97), Math.round(p.z * 97), salt) % list.length
  ];

/** Face colour fn: tinted glass panes picked from `list` by position. */
const paneFn =
  (list: readonly string[], salt: number) =>
  (p: THREE.Vector3): THREE.Color =>
    col(pickAt(list, p, salt));

/** Hexagonal prism / frustum with a flat face towards +z (vertices at ±30°). */
const hexB = (rb: number, rt: number, h: number, open = false): THREE.BufferGeometry =>
  cylB(rb, rt, h, 6, open).rotateY(PI / 6);

/** Lit window on a wall at azimuth `a`, radius `r` (cylindrical or hexagonal walls). */
function ringWindow(acc: Acc, r: number, a: number, y: number, w: number, h: number): void {
  windowAt(acc, { at: az(r, a, y), yaw: a, frame: K.trim, glow: K.window, w, h });
}

/** Steps up to a door: `n` boxes from the door outwards (width shrinks, height rises to the door). */
function steps(
  acc: Acc,
  zWall: number,
  width: number,
  top: number,
  n: number,
  color: string,
): void {
  for (let k = 0; k < n; k++) {
    const h = top * ((n - k) / n);
    put(acc, baseBox(width + 0.35 * (n - 1 - k), h, 0.45), [0, 0, zWall + 0.22 + k * 0.45], color, {
      aoAmt: 0.2,
    });
  }
}

/* -------------------------------- observatory -------------------------------- */

/**
 * Summit observatory: stone drum with pilasters, lit windows and a balcony ring, a white dome with
 * a wide open shutter slit and a chunky silver telescope tube pointing out of it. v0: slit and tube
 * face +z (door side) at 63 deg; v1: slit turned 40 deg to the right, tube lower (54 deg).
 */
function observatory({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.01);
  const hi = lod === 0;
  const R = 3.3;
  const seg = hi ? 20 : 10;
  const psi = variant === 1 ? 0.7 : 0;
  const elev = variant === 1 ? 0.95 : 1.1;
  const y0 = 0.5;
  const drumH = 3.9;
  const rd = R + 0.1;
  const dy = y0 + drumH + 0.3;

  // plinth, drum, bands, cornice
  put(acc, cylB(R + 0.65, R + 0.5, 0.3, seg), [0, 0, 0], K.stoneDark, { aoAmt: 0.25 });
  put(acc, cylB(R + 0.3, R + 0.3, 0.2, seg), [0, 0.3, 0], K.stone, { aoAmt: 0.2 });
  put(acc, cylB(R, R, drumH, seg, true), [0, y0, 0], K.stone, { aoAmt: 0.18 });
  put(acc, cylB(R + 0.08, R + 0.08, 0.28, seg), [0, y0 + 2.45, 0], K.stoneDark, { aoAmt: 0 });
  put(acc, cylB(R + 0.3, R + 0.3, 0.3, seg), [0, y0 + drumH, 0], K.trim, { aoAmt: 0.1 });

  // dome with an open shutter slit (a wedge missing at azimuth psi), dark inner shell behind it
  const g = 0.5;
  const q = qEuler(0, psi, 0);
  put(
    acc,
    new THREE.SphereGeometry(rd, hi ? 20 : 12, hi ? 9 : 4, PI / 2 + g, TAU - 2 * g, 0, PI / 2),
    [0, dy, 0],
    K.dome,
    { q, aoAmt: 0.08 },
  );
  put(
    acc,
    new THREE.SphereGeometry(rd - 0.12, hi ? 12 : 8, hi ? 5 : 3, 0, TAU, 0, PI / 2),
    [0, dy, 0],
    K.shutterInside,
    {
      aoAmt: 0,
    },
  );
  put(acc, cylB(rd + 0.1, rd + 0.1, 0.16, seg), [0, dy - 0.06, 0], K.domeRib, { aoAmt: 0 });
  const arc = (a: number, r: number, tube: number, color: string): void =>
    put(acc, new THREE.TorusGeometry(r, tube, 3, 10, PI / 2), [0, dy, 0], color, {
      q: qEuler(0, a - PI / 2, 0),
      aoAmt: 0,
    });
  if (hi) {
    for (const s of [-1, 1]) arc(psi + s * g, rd + 0.03, 0.07, K.tubeBand);
    for (let k = 0; k < 6; k++) arc(psi + g + 0.55 + k * 0.82, rd + 0.03, 0.045, K.domeRib);
  }

  // telescope tube: from inside the dome out through the slit
  const piv = V(0, dy + 0.9, 0);
  const d = V(Math.sin(psi) * Math.cos(elev), Math.sin(elev), Math.cos(psi) * Math.cos(elev));
  const up = V(-Math.sin(psi) * Math.sin(elev), Math.cos(elev), -Math.cos(psi) * Math.sin(elev));
  const qd = qFromTo(Y, d);
  const at = (t: number, off = 0): THREE.Vector3 =>
    piv.clone().addScaledVector(d, t).addScaledVector(up, off);
  const t0 = 1.0;
  const t1 = 5.4;
  const tseg = hi ? 9 : 6;
  put(acc, new THREE.CylinderGeometry(0.58, 0.46, t1 - t0, tseg), at((t0 + t1) / 2), K.tube, {
    q: qd,
    aoAmt: 0.05,
  });
  put(acc, new THREE.CylinderGeometry(0.72, 0.62, 0.45, tseg, 1, true), at(t1 - 0.05), K.silver, {
    q: qd,
    aoAmt: 0,
    double: true,
  });
  put(acc, new THREE.CircleGeometry(0.58, tseg), at(t1 - 0.02), K.lens, {
    q: qFromTo(Z, d),
    aoAmt: 0,
  });
  for (const [t, c] of [
    [2.7, K.tubeBand],
    [4.4, K.gold],
  ] as const)
    put(acc, new THREE.CylinderGeometry(0.56, 0.56, 0.26, tseg), at(t), c, { q: qd, aoAmt: 0 });
  if (hi) {
    // finder scope + brackets, rear counterweight
    put(acc, new THREE.CylinderGeometry(0.13, 0.11, 1.7, 6), at(3.3, 0.85), K.silver, {
      q: qd,
      aoAmt: 0,
    });
    for (const t of [2.7, 3.9])
      put(acc, new THREE.BoxGeometry(0.1, 0.5, 0.1), at(t, 0.55), K.silver, { q: qd, aoAmt: 0 });
    put(acc, new THREE.SphereGeometry(0.3, 6, 4), at(0.6, -0.35), K.tubeBand, { aoAmt: 0 });
  }

  // balcony ring + rail
  const by = y0 + 2.6;
  put(acc, cylB(R + 0.8, R + 0.7, 0.15, seg), [0, by, 0], K.stoneDark, { aoAmt: 0.1 });
  if (hi) {
    put(acc, new THREE.TorusGeometry(R + 0.72, 0.045, 4, 28), [0, by + 0.62, 0], K.silver, {
      q: qEuler(PI / 2, 0, 0),
      aoAmt: 0,
    });
    for (let k = 0; k < 20; k++)
      put(
        acc,
        cylB(0.035, 0.035, 0.6, 4, true),
        az(R + 0.72, (k / 20) * TAU, by + 0.15),
        K.silver,
        {
          aoAmt: 0,
        },
      );
    // pilasters between the windows
    for (let k = 0; k < 8; k++) {
      const a = ((k + 0.5) / 8) * TAU;
      put(acc, baseBox(0.34, drumH - 0.1, 0.26), az(R + 0.05, a, y0), K.trim, {
        q: qEuler(0, a, 0),
        aoAmt: 0.1,
      });
    }
    // lit windows: a row under the balcony, a row of tall ones above
    for (const a of [1.0, -1.0, 2.1, -2.1, PI]) ringWindow(acc, R + 0.02, a, y0 + 1.5, 0.5, 0.85);
    for (let k = 0; k < 8; k++)
      ringWindow(acc, R + 0.02, ((k + 0.5) / 8) * TAU + PI / 8, y0 + 3.3, 0.45, 0.75);
    // lamps at the door
    for (const sx of [-1, 1])
      put(acc, new THREE.IcosahedronGeometry(0.11, 0), [sx * 1.15, y0 + 1.85, R + 0.12], K.window, {
        emissive: 1,
        aoAmt: 0,
        ao: () => 1,
      });
  } else {
    put(acc, new THREE.TorusGeometry(R + 0.72, 0.05, 3, 12), [0, by + 0.62, 0], K.silver, {
      q: qEuler(PI / 2, 0, 0),
      aoAmt: 0,
    });
  }
  // door + steps on +z
  doorAt(acc, V(0, y0, R), 0, K.door, K.trim, 1.5, 2.1);
  steps(acc, R - 0.1, 2.6, y0, 2, K.stone);
  const g0 = acc.finish(rng, false, true);
  addHook(g0, 'door', { center: [0, y0 + 1.0, R], normal: [0, 0, 1] });
  const sc = rd * 0.7;
  return addHook(g0, 'slit', {
    center: [Math.sin(psi) * sc, dy + rd * 0.7, Math.cos(psi) * sc],
    normal: [Math.sin(psi) * 0.6, 0.8, Math.cos(psi) * 0.6],
  });
}

/* ---------------------------------- facultyHall ---------------------------------- */

/** Rows of lit windows on the four faces (front door column left free on the ground floor). */
function hallWindows(
  acc: Acc,
  o: {
    hw: number;
    hd: number;
    y0: number;
    floors: number;
    fh: number;
    colsF: number;
    colsS: number;
  },
): void {
  for (let face = 0; face < 4; face++) {
    const yaw = (face * PI) / 2;
    const front = face % 2 === 0;
    const half = front ? o.hw : o.hd;
    const off = front ? o.hd : o.hw;
    const cols = front ? o.colsF : o.colsS;
    const sp = (2 * half - 1.0) / cols;
    for (let f = 0; f < o.floors; f++)
      for (let c = 0; c < cols; c++) {
        if (face === 0 && f === 0 && cols % 2 === 1 && c === (cols - 1) / 2) continue;
        const t = (c - (cols - 1) / 2) * sp;
        const at = V(t, o.y0 + f * o.fh + o.fh * 0.56, off + 0.01).applyAxisAngle(Y, yaw);
        windowAt(acc, {
          at,
          yaw,
          frame: K.trim,
          glow: K.window,
          w: 0.55,
          h: 0.78,
          sill: face === 0,
        });
      }
  }
}

/** Four-sided frustum (hip / mansard roof) with half extents (hx, hz) at the base. */
function frustum(top: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(Math.SQRT2 * top, Math.SQRT2, 1, 4)
    .rotateY(PI / 4)
    .translate(0, 0.5, 0);
}

/**
 * Academic hall, ~5 x 4 u, door on +z. v0: brick, two storeys, teal gable roof and a columned
 * portico with a pediment. v1: cream stucco, three storeys, slate mansard with dormers and a
 * copper cupola. v2: brick, two storeys, teal cross-gable with a projecting front bay and a chimney.
 */
function facultyHall({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const hw = 2.5;
  const hd = 2.0;
  const v = variant % 3;
  const floors = v === 1 ? 3 : 2;
  const fh = v === 1 ? 2.1 : v === 0 ? 2.5 : 2.4;
  const wall = v === 1 ? K.stucco : v === 0 ? K.brick : K.brickDark;
  const trim = v === 1 ? K.stone : K.trim;
  const y0 = 0.3;
  const wallH = floors * fh;
  const top = y0 + wallH;

  put(acc, baseBox(2 * hw + 0.25, y0, 2 * hd + 0.25), [0, 0, 0], K.stoneDark, { aoAmt: 0.25 });
  // LOD1 has no window frames / quoins: carry their share (the pale trim) in the wall colour
  const wallC = hi ? col(wall) : col(wall).lerp(col(trim), 0.2);
  put(acc, baseBox(2 * hw, wallH, 2 * hd), [0, y0, 0], wallC, { aoAmt: 0.18 });
  put(acc, baseBox(2 * hw + 0.3, 0.2, 2 * hd + 0.3), [0, top - 0.2, 0], trim, { aoAmt: 0.05 });
  if (hi) {
    for (let f = 1; f < floors; f++)
      put(acc, baseBox(2 * hw + 0.1, 0.12, 2 * hd + 0.1), [0, y0 + f * fh - 0.06, 0], trim, {
        aoAmt: 0,
      });
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        put(acc, baseBox(0.3, wallH, 0.3), [sx * (hw - 0.06), y0, sz * (hd - 0.06)], trim, {
          aoAmt: 0.1,
        });
    hallWindows(acc, { hw, hd, y0, floors, fh, colsF: 3, colsS: 2 });
  } else {
    // far read: pale string courses + corner quoins as flat quads, one lit strip per floor
    for (const [yaw, wd, off] of [
      [0, 2 * hw, hd],
      [PI / 2, 2 * hd, hw],
      [-PI / 2, 2 * hd, hw],
    ] as const) {
      for (let f = 1; f < floors; f++)
        put(acc, new THREE.PlaneGeometry(wd + 0.1, 0.14), az(off + 0.06, yaw, y0 + f * fh), trim, {
          q: qEuler(0, yaw, 0),
          aoAmt: 0,
          ao: () => 1,
        });
    }
    for (const sx of [-1, 1])
      put(
        acc,
        new THREE.PlaneGeometry(0.34, wallH),
        V(sx * (hw - 0.06), y0 + wallH / 2, hd + 0.1),
        trim,
        {
          aoAmt: 0,
          ao: () => 1,
        },
      );
    // far read: one lit strip per floor on the front and the sides
    for (let f = 0; f < floors; f++)
      for (const [yaw, wd, off] of [
        [0, 2.1, hd],
        [PI / 2, 1.5, hw],
        [-PI / 2, 1.5, hw],
      ] as const)
        put(
          acc,
          new THREE.PlaneGeometry(wd, 0.78),
          az(off + 0.01, yaw, y0 + f * fh + fh * 0.56),
          K.window,
          { q: qEuler(0, yaw, 0), emissive: 1, aoAmt: 0, ao: () => 1 },
        );
  }
  let doorZ = hd;
  if (v === 0) {
    // gable roof (ridge along x), chimney, portico + pediment
    const rise = 1.6;
    put(acc, gableRoof(hd + 0.4, rise, 2 * hw + 0.5), [0, top, 0], K.roofTeal, {
      q: qEuler(0, PI / 2, 0),
      aoAmt: 0.1,
    });
    put(acc, baseBox(0.45, 2.1, 0.45), [1.6, top - 0.1, -0.7], K.brickDark, { aoAmt: 0.1 });
    const pz = hd + 0.75;
    put(acc, baseBox(4.9, 0.3, 1.5), [0, 0, pz], K.stone, { aoAmt: 0.2 });
    const cols = hi ? [-2.0, -0.67, 0.67, 2.0] : [-2.0, 2.0];
    for (const x of cols)
      put(acc, cylB(0.17, 0.14, wallH - 0.7, hi ? 8 : 5), [x, 0.3, hd + 1.25], K.trim, {
        aoAmt: 0.1,
      });
    put(acc, baseBox(5.0, 0.4, 1.7), [0, top - 0.8, pz + 0.05], K.trim, { aoAmt: 0.1 });
    put(acc, prism([V2(-2.6, 0), V2(2.6, 0), V2(0, 1.0)], 1.7), [0, top - 0.4, pz + 0.05], K.trim, {
      aoAmt: 0.1,
    });
    if (hi)
      put(
        acc,
        new THREE.CylinderGeometry(0.26, 0.26, 0.06, 10),
        [0, top - 0.05, pz + 0.92],
        K.door,
        {
          q: qEuler(PI / 2, 0, 0),
          aoAmt: 0,
        },
      );
    steps(acc, hd + 1.4, 3.4, 0.3, 2, K.stone);
    doorAt(acc, V(0, y0, hd), 0, K.door, K.trim, 1.1, 1.8);
    doorZ = hd + 1.4;
  } else if (v === 1) {
    // mansard (steep frustum) + dormers + cupola
    const mh = 1.3;
    const tp = 0.62;
    put(acc, frustum(tp), [0, top, 0], K.roofSlate, { s: [hw + 0.25, mh, hd + 0.25], aoAmt: 0.1 });
    const zb = hd + 0.25;
    if (hi)
      for (const x of [-1.4, 0, 1.4]) {
        const t = 0.4;
        const zz = zb + (zb * tp - zb) * t;
        const yy = top + mh * t;
        put(acc, baseBox(0.62, 0.55, 0.5), [x, yy - 0.2, zz - 0.05], K.roofSlate, { aoAmt: 0.1 });
        windowAt(acc, {
          at: V(x, yy + 0.05, zz + 0.21),
          yaw: 0,
          frame: K.trim,
          glow: K.window,
          w: 0.3,
          h: 0.34,
        });
        put(acc, gableRoof(0.42, 0.3, 0.7), [x, yy + 0.35, zz - 0.05], K.roofTeal, { aoAmt: 0.05 });
      }
    const cy = top + mh;
    put(acc, cylB(0.55, 0.55, 0.55, 8), [0, cy, 0], K.trim, { aoAmt: 0.1 });
    if (hi) for (let k = 0; k < 4; k++) ringWindow(acc, 0.5, (k * PI) / 2, cy + 0.12, 0.28, 0.32);
    put(acc, new THREE.SphereGeometry(0.62, 8, 3, 0, TAU, 0, PI / 2), [0, cy + 0.55, 0], K.copper, {
      aoAmt: 0.05,
    });
    put(acc, new THREE.ConeGeometry(0.06, 0.4, 4), [0, cy + 1.15, 0], K.gold, { aoAmt: 0 });
    doorAt(acc, V(0, y0, hd), 0, K.door, K.trim, 1.1, 1.7);
    put(acc, baseBox(1.9, 0.14, 0.9), [0, y0 + 1.95, hd + 0.45], K.roofTeal, { aoAmt: 0 });
    steps(acc, hd, 1.8, 0.3, 2, K.stone);
  } else {
    // cross gable: ridge along x + a projecting front bay with its own gable and a big window
    const rise = 1.5;
    put(acc, gableRoof(hd + 0.4, rise, 2 * hw + 0.5), [0, top, 0], K.roofTeal, {
      q: qEuler(0, PI / 2, 0),
      aoAmt: 0.1,
    });
    put(acc, baseBox(2.2, wallH, 0.9), [0, y0, hd + 0.45], wall, { aoAmt: 0.15 });
    put(acc, gableRoof(1.4, rise * 0.95, 1.7), [0, top, hd - 0.35 + 0.3], K.roofTeal, {
      aoAmt: 0.1,
    });
    put(acc, baseBox(2.4, 0.2, 1.1), [0, top - 0.2, hd + 0.4], trim, { aoAmt: 0.05 });
    if (hi) {
      windowAt(acc, {
        at: V(0, y0 + fh * 1.5, hd + 0.91),
        yaw: 0,
        frame: K.trim,
        glow: K.window,
        w: 0.9,
        h: 1.0,
      });
      for (const sx of [-0.7, 0.7])
        windowAt(acc, {
          at: V(sx, y0 + fh * 0.56, hd + 0.91),
          yaw: 0,
          frame: K.trim,
          glow: K.window,
          w: 0.45,
          h: 0.78,
        });
    }
    put(acc, baseBox(0.45, 2.3, 0.45), [-1.7, top - 0.1, -0.6], K.brick, { aoAmt: 0.1 });
    doorAt(acc, V(0, y0, hd + 0.9), 0, K.door, K.trim, 1.0, 1.7);
    doorZ = hd + 0.9;
    steps(acc, hd + 0.9, 1.6, 0.3, 2, K.stone);
  }
  const g = acc.finish(rng, false, true);
  return addHook(g, 'door', {
    center: [0, y0 + 0.9, doorZ],
    normal: [0, 0, 1],
  });
}

/* --------------------------------- libraryRotunda --------------------------------- */

/**
 * Domed round library: stepped stylobate, a 12-sided cella with tall lit windows, a ring of
 * columns (gap on +z for the door and stairs), entablature, green-copper gore dome with a lantern.
 */
function libraryRotunda({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const seg = hi ? 24 : 8;
  const colH = 2.9;
  const y0 = 0.4;
  put(acc, cylB(3.55, 3.45, 0.2, seg), [0, 0, 0], K.stoneDark, { aoAmt: 0.25 });
  put(acc, cylB(3.3, 3.25, 0.2, seg), [0, 0.2, 0], K.stone, { aoAmt: 0.2 });
  // cella: 12 flat faces, a face centred on +z
  const ap = 2.1;
  put(acc, hexCella(ap), [0, y0, 0], K.stucco, { aoAmt: 0.18 });
  // columns (12, none on +z), capitals + bases
  for (let k = 0; k < 12; k += hi ? 1 : 2) {
    const a = ((k + (hi ? 0.5 : 1)) / 12) * TAU;
    put(acc, cylB(0.17, 0.14, colH, hi ? 8 : 4), az(2.75, a, y0), K.trim, { aoAmt: 0.1 });
    if (hi) {
      put(acc, baseBox(0.42, 0.14, 0.42), az(2.75, a, y0 + colH), K.trim, {
        q: qEuler(0, a, 0),
        aoAmt: 0,
      });
      put(acc, baseBox(0.4, 0.12, 0.4), az(2.75, a, y0), K.stone, { q: qEuler(0, a, 0), aoAmt: 0 });
    }
  }
  const ey = y0 + colH + (hi ? 0.14 : 0);
  put(acc, cylB(3.15, 3.15, 0.35, seg), [0, ey, 0], K.trim, { aoAmt: 0.1 });
  put(acc, cylB(3.17, 3.17, 0.1, seg), [0, ey + 0.12, 0], K.roofTeal, { aoAmt: 0 });
  put(acc, cylB(3.3, 3.2, 0.14, seg), [0, ey + 0.35, 0], K.stone, { aoAmt: 0 });
  const dy = ey + 0.49;
  // gore dome, alternating copper tones
  const prof: [number, number][] = [[2.65, 0]];
  const n = hi ? 7 : 3;
  for (let i = 1; i <= n; i++) {
    const t = (i / n) * (PI / 2) * 0.96;
    prof.push([2.65 * Math.cos(t), 2.2 * Math.sin(t)]);
  }
  const gore = TAU / 12;
  put(
    acc,
    lathe(prof, hi ? 24 : 8),
    [0, dy, 0],
    (p) =>
      Math.floor((Math.atan2(p.x, p.z) + PI) / gore) % 2 === 0 ? col(K.copper) : col(K.copperLight),
    { aoAmt: 0.08 },
  );
  // lantern + finial
  const ly = dy + 2.2 * Math.sin((PI / 2) * 0.96) - 0.05;
  put(acc, cylB(0.5, 0.5, 0.5, 8), [0, ly, 0], K.trim, { aoAmt: 0.1 });
  if (hi) for (let k = 0; k < 4; k++) ringWindow(acc, 0.46, (k * PI) / 2, ly + 0.12, 0.26, 0.3);
  put(acc, new THREE.ConeGeometry(0.58, 0.55, 8), [0, ly + 0.5, 0], K.copper, { aoAmt: 0 });
  put(acc, new THREE.SphereGeometry(0.09, 6, 4), [0, ly + 1.1, 0], K.gold, { aoAmt: 0 });
  if (hi) {
    // dome-base windows between gores? tall lit windows on the cella (all faces but the door face)
    for (let k = 1; k < 12; k++) ringWindow(acc, ap + 0.02, (k * TAU) / 12, y0 + 1.5, 0.55, 1.5);
  }
  // door on the +z face + stairs through the column gap
  doorAt(acc, V(0, y0, ap), 0, K.door, K.trim, 1.1, 2.0);
  put(acc, baseBox(2.3, 0.2, 0.8), [0, 0, 3.55], K.stone, { aoAmt: 0.2 });
  put(acc, baseBox(1.9, 0.4, 0.5), [0, 0, 3.15], K.stone, { aoAmt: 0.2 });
  const g = acc.finish(rng, false, true);
  return addHook(g, 'door', { center: [0, y0 + 1.0, ap], normal: [0, 0, 1] });
}

/** 12-sided cella shell, one flat face on +z (apothem `ap`). */
function hexCella(ap: number): THREE.BufferGeometry {
  const r = ap / Math.cos(PI / 12);
  return cylB(r, r, 3.0, 12, true).rotateY(PI / 12);
}

/* ---------------------------------- campusTower ---------------------------------- */

/**
 * Campanile: brick shaft with lit lancet windows, a clock stage (four lit faces), an open belfry
 * with a bell and a copper-teal spire. ~9.3 u tall; shares the faculty brick.
 */
function campusTower({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const y0 = 0.3;
  const shaftTop = 4.3;
  const hrs = [10.1, 1.6, 4.4][variant % 3];
  put(acc, baseBox(2.6, y0, 2.6), [0, 0, 0], K.stoneDark, { aoAmt: 0.25 });
  put(acc, baseBox(1.9, shaftTop - y0, 1.9), [0, y0, 0], K.brick, { aoAmt: 0.2 });
  if (hi) {
    for (const y of [1.9, 3.5])
      put(acc, baseBox(2.06, 0.12, 2.06), [0, y, 0], K.trim, { aoAmt: 0 });
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        put(acc, baseBox(0.26, shaftTop - y0, 0.26), [sx * 0.88, y0, sz * 0.88], K.brickDark, {
          aoAmt: 0.1,
        });
    for (let face = 0; face < 4; face++) {
      const yaw = (face * PI) / 2;
      for (const y of face === 0 ? [2.7, 3.9] : [1.3, 2.7, 3.9]) {
        windowAt(acc, {
          at: V(0, y, 0.96).applyAxisAngle(Y, yaw),
          yaw,
          frame: K.trim,
          glow: K.window,
          w: 0.3,
          h: 0.7,
        });
      }
    }
  }
  doorAt(acc, V(0, y0, 0.95), 0, K.door, K.trim, 0.9, 1.5);
  put(acc, baseBox(1.5, 0.15, 0.5), [0, 0, 1.15], K.stone, { aoAmt: 0.2 });
  // clock stage
  const cs = 1.6;
  put(acc, baseBox(2.15, cs, 2.15), [0, shaftTop, 0], K.stone, { aoAmt: 0.15 });
  const cy = shaftTop + cs / 2;
  for (let k = 0; k < 4; k++) {
    const q = qEuler(0, (k * PI) / 2, 0);
    const at = (x: number, y: number, z: number): THREE.Vector3 => V(x, y, z).applyQuaternion(q);
    put(acc, new THREE.CircleGeometry(0.62, hi ? 12 : 8), at(0, cy, 1.1).add(V(0, 0, 0)), K.trim, {
      q,
      emissive: 0.35,
      ao: () => 1,
    });
    if (hi) {
      put(acc, new THREE.TorusGeometry(0.64, 0.05, 3, 12), at(0, cy, 1.1), K.door, { q, aoAmt: 0 });
      const hand = (len: number, w: number, ang: number, z: number): void => {
        const qq = q.clone().multiply(qEuler(0, 0, -ang));
        const base = at(0, cy, 1.12 + z);
        put(
          acc,
          new THREE.BoxGeometry(w, len, 0.03),
          base.add(V(0, len / 2, 0).applyQuaternion(qq)),
          K.lens,
          {
            q: qq,
            aoAmt: 0,
          },
        );
      };
      hand(0.5, 0.06, 0.6, 0.01);
      hand(0.34, 0.08, (hrs / 12) * TAU, 0.03);
    }
  }
  // belfry: dark open core, four corner piers, a bell, cap slab
  const by = shaftTop + cs;
  put(acc, baseBox(1.5, 1.05, 1.5), [0, by, 0], K.shutterInside, { aoAmt: 0 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      put(acc, baseBox(0.3, 1.05, 0.3), [sx * 0.8, by, sz * 0.8], K.stone, { aoAmt: 0.1 });
  if (hi) {
    put(acc, new THREE.SphereGeometry(0.28, 8, 4, 0, TAU, 0, PI * 0.8), [0, by + 0.35, 0], K.gold, {
      aoAmt: 0,
    });
    put(acc, baseBox(2.0, 0.1, 0.12), [0, by + 0.82, 0], K.stoneDark, { aoAmt: 0 });
  }
  put(acc, baseBox(2.35, 0.16, 2.35), [0, by + 1.05, 0], K.trim, { aoAmt: 0.05 });
  // spire (square pyramid) + finial
  const sy = by + 1.21;
  put(acc, new THREE.ConeGeometry(1.55, 1.9, 4).rotateY(PI / 4), [0, sy + 0.95, 0], K.roofTeal, {
    aoAmt: 0.1,
  });
  put(acc, new THREE.SphereGeometry(0.1, 6, 4), [0, sy + 1.95, 0], K.gold, { aoAmt: 0 });
  put(acc, new THREE.ConeGeometry(0.05, 0.4, 4), [0, sy + 2.2, 0], K.gold, { aoAmt: 0 });
  const g = acc.finish(rng, false, true);
  return addHook(g, 'door', { center: [0, y0 + 0.75, 0.95], normal: [0, 0, 1] });
}

/* ----------------------------------- terrarium ----------------------------------- */

/** Foliage blob (flattened icosahedron). */
function blob(acc: Acc, at: THREE.Vector3, r: number, color: string, hi: boolean, sy = 0.85): void {
  put(acc, new THREE.IcosahedronGeometry(r, hi ? 1 : 0), at, color, { s: [1, sy, 1], aoAmt: 0.1 });
}

/** Stylized palm: leaning trunk + flat drooping fronds + coconuts. */
function palm(acc: Acc, rng: Rng, at: THREE.Vector3, h: number, hi: boolean): void {
  const lean = rng.range(-0.18, 0.18);
  const q = qEuler(lean, 0, -lean * 0.6);
  put(acc, cylB(0.1, 0.06, h, hi ? 6 : 4), at, K.trunk, { q, aoAmt: 0.2 });
  const top = at.clone().add(V(0, h, 0).applyQuaternion(q));
  const nf = hi ? 7 : 4;
  for (let k = 0; k < nf; k++) {
    const a = (k / nf) * TAU + rng.range(-0.2, 0.2);
    const e = rng.range(-0.05, 0.25);
    const d = V(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    put(
      acc,
      new THREE.ConeGeometry(0.13, 1.1, 4),
      top.clone().addScaledVector(d, 0.55),
      K.fern[k % 3],
      {
        q: qFromTo(Y, d),
        s: [2.4, 1, 0.4],
        aoAmt: 0.05,
      },
    );
  }
  if (hi)
    put(
      acc,
      new THREE.IcosahedronGeometry(0.1, 0),
      top.clone().add(V(0.08, -0.12, 0.05)),
      K.trunk,
      { aoAmt: 0 },
    );
}

/** Stalk with a bloom. */
function flower(acc: Acc, at: THREE.Vector3, h: number, color: string): void {
  put(acc, cylB(0.016, 0.016, h, 3, true), at, K.fern[2], { aoAmt: 0 });
  put(acc, new THREE.IcosahedronGeometry(0.075, 0), at.clone().add(V(0, h, 0)), color, {
    aoAmt: 0,
  });
}

/** Outdoor planter box with a flowering bush. */
function planter(acc: Acc, at: THREE.Vector3, rng: Rng, hi: boolean): void {
  put(acc, baseBox(0.6, 0.3, 0.38), at, K.planter, { aoAmt: 0.2 });
  blob(acc, at.clone().add(V(0, 0.42, 0)), 0.26, K.fern[rng.int(0, 2)], hi, 0.8);
  for (let k = 0; k < 3; k++)
    put(
      acc,
      new THREE.IcosahedronGeometry(0.07, 0),
      at.clone().add(V((k - 1) * 0.16, 0.6, 0.05)),
      K.flowers[(k + rng.int(0, 3)) % 4],
      {
        aoAmt: 0,
      },
    );
}

/**
 * Victorian glasshouse. v0: hexagonal pavilion (flat face and open doorway on +z, tinted glass
 * panes, an open clerestory ring showing the foliage, tiered pointed roof with a lantern and a gold
 * finial). v1: long barrel-vault glass house (axis z, open arched gable end on +z, two roof hatches
 * with plants bulging out). Both: thin white frames, palms / ferns / flowers inside.
 */
function terrarium({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const pr = rng.fork('plants');
  const paneL = paneFn(P.paneLow, 11);
  const paneH = paneFn(P.paneHigh, 12);
  const glass = { emissive: P.paneGlow, aoAmt: 0.05 } as const;
  if (variant % 2 === 0) {
    // ---- hexagonal pavilion
    const R = 2.1;
    const ap = R * Math.cos(PI / 6);
    const y0 = 0.3;
    const low = 0.8;
    const wallH = 1.5;
    const clere = 0.65;
    const eave = y0 + wallH + clere;
    put(acc, hexB(R + 0.3, R + 0.22, y0), [0, 0, 0], K.stone, { aoAmt: 0.25 });
    put(acc, hexB(R - 0.1, R - 0.1, 0.1), [0, y0, 0], K.soil, { aoAmt: 0 });
    if (hi) {
      for (let m = 0; m < 6; m++) {
        const a = (m * PI) / 3;
        const c = az(ap, a, y0);
        const q = qEuler(0, a, 0);
        if (m === 0) {
          put(acc, baseBox(R - 0.1, 0.1, 0.1), c.clone().add(V(0, wallH - 0.1, 0)), K.trim, {
            q,
            aoAmt: 0,
          });
          continue;
        }
        put(acc, baseBox(R - 0.14, low, 0.06), c, paneL, { q, ...glass });
        put(acc, baseBox(R - 0.14, wallH - low, 0.06), c.clone().add(V(0, low, 0)), paneH, {
          q,
          ...glass,
        });
        for (const hy of [0, low - 0.04, wallH - 0.08])
          put(acc, baseBox(R + 0.04, 0.08, 0.11), c.clone().add(V(0, hy, 0)), K.trim, {
            q,
            aoAmt: 0,
          });
      }
      for (let k = 0; k < 6; k++)
        put(
          acc,
          cylB(0.07, 0.07, wallH + clere, 5),
          az(R, ((k * 60 + 30) * PI) / 180, y0),
          K.trim,
          { aoAmt: 0.05 },
        );
    } else {
      put(acc, hexB(R, R, low, true), [0, y0, 0], paneL, { ...glass });
      put(acc, hexB(R, R, wallH - low, true), [0, y0 + low, 0], paneH, { ...glass });
      put(acc, hexB(R + 0.02, R + 0.02, 0.1), [0, eave - 0.1, 0], K.trim, { aoAmt: 0 });
    }
    // tiered pointed roof: eave ring, lower frustum, lantern, upper spire, finial
    put(acc, hexB(R + 0.4, R + 0.4, 0.1), [0, eave - 0.05, 0], K.trim, { aoAmt: 0.05 });
    put(acc, hexB(R + 0.3, 0.8, 0.85), [0, eave + 0.05, 0], paneH, { ...glass });
    const ly = eave + 0.9;
    put(acc, hexB(0.85, 0.85, 0.42), [0, ly, 0], paneH, { ...glass });
    put(acc, hexB(1.0, 1.0, 0.08), [0, ly + 0.42, 0], K.trim, { aoAmt: 0 });
    put(acc, hexB(0.95, 0.05, 0.8), [0, ly + 0.5, 0], K.roofTeal, { aoAmt: 0.05 });
    put(acc, new THREE.SphereGeometry(0.11, 6, 4), [0, ly + 1.3, 0], K.gold, { aoAmt: 0 });
    put(acc, new THREE.ConeGeometry(0.05, 0.4, 4), [0, ly + 1.45, 0], K.gold, { aoAmt: 0 });
    if (hi)
      for (let k = 0; k < 6; k++) {
        const a = (k * PI) / 3 + PI / 6;
        const p0 = az(R + 0.3, a, eave + 0.05);
        const p1 = az(0.8, a, eave + 0.9);
        const dd = p1.clone().sub(p0);
        put(acc, baseBox(0.07, dd.length(), 0.07), p0, K.trim, { q: qFromTo(Y, dd), aoAmt: 0 });
      }
    // plants inside: foliage ring above the pane line (seen through the open clerestory), palm, doorway garden
    const fy = y0 + wallH + 0.12;
    for (let k = 0; k < (hi ? 6 : 3); k++) {
      const a = (k / (hi ? 6 : 3)) * TAU + pr.range(-0.2, 0.2) + (hi ? 0.5 : 0);
      blob(acc, az(ap - 0.3, a, fy), pr.range(0.36, 0.46), K.fern[k % 3], hi, 0.9);
    }
    palm(acc, pr, V(0, y0 + 0.1, -0.2), 1.85, hi);
    if (hi) {
      for (const [x, z, c] of [
        [-0.6, 0.9, 0],
        [0.7, 0.8, 1],
        [0.1, 1.25, 2],
        [-0.9, 0.3, 3],
        [0.95, 0.2, 0],
      ] as const)
        flower(acc, V(x + pr.range(-0.08, 0.08), y0 + 0.1, z), pr.range(0.35, 0.65), K.flowers[c]);
      blob(acc, V(-0.7, y0 + 0.3, 0.7), 0.3, K.fern[1], hi);
      blob(acc, V(0.55, y0 + 0.3, 0.2), 0.34, K.fern[0], hi);
      for (const sx of [-1, 1]) planter(acc, V(sx * 1.25, 0, ap + 0.55), pr, hi);
    }
    const g = acc.finish(rng, false, true);
    return addHook(g, 'door', { center: [0, y0 + 0.8, ap], normal: [0, 0, 1] });
  }
  // ---- long barrel-vault glass house (axis z, door end on +z)
  const r = 1.4;
  const L = 5.0;
  const y0 = 0.3;
  const low = 0.75;
  const ay = y0 + low;
  put(acc, baseBox(2 * r + 0.4, y0, L + 0.4), [0, 0, 0], K.stone, { aoAmt: 0.25 });
  put(acc, baseBox(2 * r - 0.1, 0.1, L - 0.1), [0, y0, 0], K.soil, { aoAmt: 0 });
  // dwarf walls (green panes), back wall, back gable pane
  for (const sx of [-1, 1]) put(acc, baseBox(0.06, low, L), [sx * r, y0, 0], paneL, { ...glass });
  put(acc, baseBox(2 * r, low, 0.06), [0, y0, -L / 2], paneL, { ...glass });
  put(acc, new THREE.CircleGeometry(r, hi ? 10 : 6, 0, PI), [0, ay, -L / 2 + 0.01], paneH, {
    q: qEuler(0, PI, 0),
    ...glass,
  });
  // vault bays (5): panes with roof hatches in bays 1 and 3
  const bays = 5;
  const bl = L / bays;
  const qa = qEuler(-PI / 2, 0, 0);
  for (let b = 0; b < bays; b++) {
    const zc = -L / 2 + bl * (b + 0.5);
    const hatch = b === 1 || b === 3;
    const rs = hi ? 8 : 5;
    if (!hatch) {
      put(
        acc,
        new THREE.CylinderGeometry(r, r, bl - (hi ? 0.1 : 0), rs, 1, true, -PI / 2, PI),
        [0, ay, zc],
        paneH,
        {
          q: qa,
          double: true,
          ...glass,
        },
      );
    } else {
      const gap = 0.5;
      for (const s of [-1, 1])
        put(
          acc,
          new THREE.CylinderGeometry(
            r,
            r,
            bl - 0.1,
            hi ? 4 : 2,
            1,
            true,
            s < 0 ? -PI / 2 : gap,
            PI / 2 - gap,
          ),
          [0, ay, zc],
          paneH,
          { q: qa, double: true, ...glass },
        );
      // plants bulging out of the hatch
      blob(acc, V(pr.range(-0.08, 0.08), ay + r - 0.05, zc), 0.5, K.fern[(b + 1) % 3], hi, 0.95);
      if (hi) {
        blob(acc, V(0.2, ay + r + 0.12, zc + 0.15), 0.28, K.fern[0], hi);
        flower(acc, V(-0.2, ay + r + 0.1, zc - 0.1), 0.35, K.flowers[b % 4]);
      }
    }
  }
  // ribs (+ end arch frame), ridge beam, posts
  const ribs = hi ? bays + 1 : 2;
  for (let k = 0; k < ribs; k++) {
    const z = hi ? -L / 2 + (k * L) / bays : k === 0 ? -L / 2 : L / 2;
    put(acc, new THREE.TorusGeometry(r + 0.02, 0.055, 3, hi ? 12 : 6, PI), [0, ay, z], K.trim, {
      aoAmt: 0,
    });
    if (hi)
      for (const sx of [-1, 1])
        put(acc, baseBox(0.09, low, 0.09), [sx * r, y0, z], K.trim, { aoAmt: 0.05 });
  }
  put(acc, cylB(0.05, 0.05, L, 4, true), [0, ay + r + 0.02, -L / 2], K.trim, {
    q: qEuler(PI / 2, 0, 0),
    aoAmt: 0,
  });
  if (hi) {
    put(acc, baseBox(2 * r + 0.1, 0.07, 0.07), [0, y0 + low - 0.04, L / 2], K.trim, { aoAmt: 0 });
    put(acc, baseBox(2 * r + 0.1, 0.07, 0.07), [0, y0 + low - 0.04, -L / 2], K.trim, { aoAmt: 0 });
  }
  put(acc, new THREE.SphereGeometry(0.1, 6, 4), [0, ay + r + 0.12, L / 2], K.gold, { aoAmt: 0 });
  put(acc, new THREE.SphereGeometry(0.1, 6, 4), [0, ay + r + 0.12, -L / 2], K.gold, { aoAmt: 0 });
  // interior garden (seen through the open +z end): palm under hatch 1, ferns, flower rows
  palm(acc, pr, V(0, y0 + 0.1, -L / 2 + bl * 1.5), 1.7, hi);
  blob(acc, V(0.2, y0 + 0.4, L / 2 - bl * 1.5), 0.42, K.fern[1], hi);
  if (hi) {
    for (let k = 0; k < 6; k++) {
      const z = -1.6 + k * 0.62;
      for (const sx of [-1, 1]) {
        flower(
          acc,
          V(sx * 0.95 + pr.range(-0.08, 0.08), y0 + 0.1, z),
          pr.range(0.3, 0.6),
          K.flowers[(k + (sx > 0 ? 1 : 0)) % 4],
        );
        if (k % 2 === 0) blob(acc, V(sx * 0.62, y0 + 0.28, z + 0.3), 0.26, K.fern[(k / 2) % 3], hi);
      }
    }
    for (const sx of [-1, 1])
      for (const z of [0.2, 1.7]) planter(acc, V(sx * (r + 0.55), 0, z), pr, hi);
  }
  // front step
  put(acc, baseBox(2.0, 0.14, 0.5), [0, 0, L / 2 + 0.35], K.stone, { aoAmt: 0.2 });
  const g = acc.finish(rng, false, true);
  return addHook(g, 'door', { center: [0, y0 + 0.9, L / 2], normal: [0, 0, 1] });
}

export const CAMPUS_GEO: readonly PropGeoDef[] = [
  {
    id: 'observatory',
    variants: 2,
    build: observatory,
    footprint: 4.0,
    height: 10.6,
    heights: [10.85, 10.6],
    windy: false,
  },
  {
    id: 'facultyHall',
    variants: 3,
    build: facultyHall,
    footprint: 3.2,
    height: 8,
    heights: [7.25, 9.35, 7.3],
    windy: false,
  },
  {
    id: 'libraryRotunda',
    variants: 1,
    build: libraryRotunda,
    footprint: 3.6,
    height: 7,
    windy: false,
  },
  { id: 'campusTower', variants: 3, build: campusTower, footprint: 1.6, height: 9.3, windy: false },
  {
    id: 'terrarium',
    variants: 2,
    build: terrarium,
    footprint: 2.6,
    height: 4,
    heights: [5.0, 3.0],
    windy: false,
  },
];
