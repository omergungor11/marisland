/**
 * QA "Customs Port" kit geometry (M30 TASK-506, D-082): three defs plus loose builders for the
 * TASK-5xx movers. Sizes / palette: content/themes/qa-customs.ts; defs: content/props-themes/qa-customs.ts.
 * White / mint / yellow toy-factory tone with yellow-rubber hazard stripes, vertex colours only.
 *
 *   scannerArch        T2  Q8: lattice posts + box girder + gable roof + prism lens over the cove channel (z axis);
 *                          a marquee bulb loop on both faces (`marquee` tag, LOD0 only)
 *   customsYard        T2  v0 quay crane with a container on the spreader, v1 the empty rig, v2 / v3 the inspection
 *                          line (green / red lamp lit), v4 a loose stack of QA containers
 *   quarantinePontoon  T2  Q9: floating raft with crates, tent(s) and a red beacon lamp; bobs (FLOAT_BOB), 3 layouts
 *
 * Loose builders (not defs): `buildQaCargoShip(loaded)`, `buildQaContainer(i)`, `buildQuayTrolley()`,
 * `buildQuaySpreader()`, `buildQuayCable()`.
 *
 * Hooks (userData.hooks, geometry local frame, jitter-free anchors):
 *  - scannerArch.pass `{ halfWidth, height, axis }` free channel under the arch; .scan `{ center, width }`
 *    the scan head; .marquee `{ count, y }` bulbs per loop (front L to R, back R to L); .lamp `{ center }`.
 *  - customsYard v0 / v1: .trolley `{ home, z: [min, max], y }`, .spreader `{ home, up, down, size }` (frame
 *    TOP centre; the carried container hangs `frame + gap` below), .cable `{ x: [..], top }`, .container
 *    `{ size, hang }`. v2 / v3: .belt `{ from, to, width }`, .lamps `{ ok, bad, lit }`, .booth `{ door }`.
 *  - quarantinePontoon: .lamp `{ center }`, .deck `{ y, size }`, .crates `{ stacks: [{ center, n }] }`.
 *  - buildQaCargoShip: .slots `{ list: [{ id, col, bay, tier, base, yaw, color }] }` (container base centres, yaw
 *    pi / 2 = length along z), .bridge `{ center }`, .lamp `{ center }`, .bow `{ at }`.
 */
import * as THREE from 'three';
import { createRng } from '../../core/rng.ts';
import type { Rng } from '../../core/rng.ts';
import {
  CUSTOMS_PAL as P,
  CUSTOMS_VARIANT,
  HAZARD,
  QA_CUSTOMS as K,
} from '../../content/themes/qa-customs.ts';
import { Acc, col, mat, qEuler } from '../kit.ts';
import { V, V2, baseBox, cylB, lathe, prism, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { accVerts } from './coding.ts';
import { addHook } from './hq.ts';
import { beam, seedAcc } from './qa-proving.ts';
import { tagBeacon, tagBob, tagMarquee } from './surface-tags.ts';

type Pt = THREE.Vector3;
const lit = { emissive: 1, aoAmt: 0, ao: () => 1 } as const;
const lighten = (hex: string, t: number): THREE.Color => col(hex).lerp(col('#FFFFFF'), t);
const tup = (v: Pt): [number, number, number] => [v.x, v.y, v.z];

/**
 * Hazard band: `n` alternating yellow / rubber boxes over `len` along `axis`. `at` = the band centre
 * (x / z) with y at the band base; `t1` × `t2` is the cross-section (y: x × z, x: height × depth, z: width × height).
 */
function stripes(
  acc: Acc,
  at: Pt,
  axis: 'x' | 'y' | 'z',
  len: number,
  t1: number,
  t2: number,
  n: number,
): void {
  const seg = len / n;
  for (let i = 0; i < n; i++) {
    const c = HAZARD[i % 2];
    const o = -len / 2 + (i + 0.5) * seg;
    if (axis === 'y') put(acc, baseBox(t1, seg, t2), [at.x, at.y + i * seg, at.z], c, { aoAmt: 0 });
    else if (axis === 'x') put(acc, baseBox(seg, t1, t2), [at.x + o, at.y, at.z], c, { aoAmt: 0 });
    else put(acc, baseBox(t1, t2, seg), [at.x, at.y, at.z + o], c, { aoAmt: 0 });
  }
}

/* -------------------------------- containers -------------------------------- */

/**
 * One QA container (length along x) with its base centre at `at`: body, two ribs per side, a top rail, the
 * door end (+x) with a lock bar, and a yellow stencil plate with a check on both long sides. LOD1: the body.
 */
function container(acc: Acc, at: Pt, color: string, lod: 0 | 1): void {
  const C = K.container;
  put(acc, baseBox(C.l, C.h, C.w), at, color, { aoAmt: 0.12 });
  if (lod === 1) return;
  const rib = lighten(color, 0.2);
  for (const sz of [-1, 1]) {
    for (const k of [-1, 1])
      put(
        acc,
        baseBox(0.12, C.h - 0.16, 0.05),
        [at.x + k * (C.l / 2 - 0.5), at.y + 0.08, at.z + sz * (C.w / 2 + 0.02)],
        rib,
        { aoAmt: 0 },
      );
    put(
      acc,
      baseBox(0.8, 0.46, 0.03),
      [at.x, at.y + C.h / 2 - 0.23, at.z + sz * (C.w / 2 + 0.03)],
      C.plate,
      { aoAmt: 0 },
    );
    for (const [a, b, rot] of [
      [-0.07, -0.02, -0.7],
      [0.07, 0.04, 0.9],
    ] as const)
      put(
        acc,
        baseBox(0.07, 0.2, 0.02),
        [at.x + a, at.y + C.h / 2 - 0.2 + b * 0.5, at.z + sz * (C.w / 2 + 0.05)],
        C.check,
        {
          q: qEuler(0, 0, rot),
          aoAmt: 0,
        },
      );
  }
  put(acc, baseBox(C.l + 0.04, 0.08, C.w + 0.04), [at.x, at.y + C.h - 0.08, at.z], rib, {
    aoAmt: 0,
  });
  put(acc, baseBox(0.05, C.h - 0.12, C.w - 0.2), [at.x + C.l / 2 + 0.02, at.y + 0.06, at.z], rib, {
    aoAmt: 0,
  });
  put(acc, baseBox(0.05, C.h - 0.3, 0.06), [at.x + C.l / 2 + 0.05, at.y + 0.15, at.z], C.door, {
    aoAmt: 0,
  });
}

/** Loose QA container (origin = base centre, length along x) for the movers; colour index `i`. */
export function buildQaContainer(i = 0): THREE.BufferGeometry {
  const acc = new Acc();
  container(acc, V(0, 0, 0), K.container.colors[((i % 5) + 5) % 5], 0);
  const g = acc.finish(createRng(506).fork('qa-container', i), false, true);
  return addHook(g, 'container', { size: [K.container.l, K.container.h, K.container.w] });
}

/** Loose stack at (x, z0): columns along z, `tiers` containers each, colours picked by `r`. */
function stack(acc: Acc, x: number, z0: number, r: Rng, lod: 0 | 1, T: readonly number[]): void {
  const C = K.container;
  const pitch = C.w + K.stack.gap;
  T.forEach((tiers, c) => {
    const z = z0 + (c - (T.length - 1) / 2) * pitch;
    for (let k = 0; k < tiers; k++) {
      const color = C.colors[(c * 2 + k + r.int(0, C.colors.length - 1)) % C.colors.length];
      container(acc, V(x + (k % 2) * 0.08, k * (C.h + 0.04), z), color, lod);
    }
  });
}

/* ------------------------------- scannerArch ------------------------------- */

/**
 * Q8 scanner arch. The ship passes along z. Posts are 4-chord lattices (white chords, mint braces) on
 * hazard-striped plinths; the white box girder carries a yellow-rubber stripe band, a dark LED rail with
 * `bulbs` chasing bulbs on each face, a mint gable roof and a faceted prism lens with a green ✓ lamp;
 * the scan head hangs under it with a steady green scan strip.
 */
function scannerArch({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const A = K.arch;
  const hi = lod === 0;
  const acc = seedAcc(rng, 0.008);
  const y0 = A.plinth;
  const yg = A.girderY;
  const ph = yg - y0;
  const corner = (y: number): number => A.chordBase + (A.chordTop - A.chordBase) * ((y - y0) / ph);
  const cs: [number, number][] = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];
  for (const px of [-A.postX, A.postX]) {
    const leg = (sx: number, sz: number, y: number): Pt =>
      V(px + sx * corner(y), y, sz * corner(y));
    put(acc, baseBox(1.9, y0, 1.9), [px, 0, 0], P.white, { aoAmt: 0.2 });
    if (hi)
      for (const sz of [-1, 1]) stripes(acc, V(px, 0.06, sz * 0.96), 'x', 1.6, y0 - 0.12, 0.05, 4);
    for (const [sx, sz] of cs)
      beam(acc, leg(sx, sz, y0), leg(sx, sz, yg), hi ? 0.2 : 0.34, P.white);
    if (!hi) continue;
    for (let k = 1; k <= A.bays; k++) {
      const ya = y0 + (ph * (k - 1)) / A.bays;
      const yb = y0 + (ph * k) / A.bays;
      for (let e = 0; e < 4; e++) {
        const [ax, az] = cs[e];
        const [bx, bz] = cs[(e + 1) % 4];
        beam(acc, leg(ax, az, yb), leg(bx, bz, yb), 0.11, P.mint);
        if ((k + e) % 2 === 0) beam(acc, leg(ax, az, ya), leg(bx, bz, yb), 0.09, P.mint);
        else beam(acc, leg(bx, bz, ya), leg(ax, az, yb), 0.09, P.mint);
      }
    }
  }
  const gl = 2 * A.postX + 1.6;
  put(acc, baseBox(gl, A.girderH, A.girderD), [0, yg, 0], P.white, { aoAmt: 0.1 });
  // mint gable roof along x
  const rh = A.roofH;
  put(
    acc,
    prism([V2(-0.95, 0), V2(0.95, 0), V2(0, rh)], gl + 0.3).rotateY(Math.PI / 2),
    [0, yg + A.girderH, 0],
    P.mint,
    { aoAmt: 0 },
  );
  // scan head under the girder + steady scan strips
  put(acc, baseBox(3.4, 0.4, 1.2), [0, yg - 0.4, 0], P.mint, { aoAmt: 0.1 });
  put(acc, baseBox(2 * A.halfClear - 0.6, 0.05, 0.26), [0, yg - 0.04, 0], P.lampGreen, lit);
  put(acc, baseBox(3.0, 0.05, 0.9), [0, yg - 0.44, 0], P.lampGreen, lit);
  // crown: prism lens (six facets in mint / white / yellow) + green check lamp
  const by = yg + A.girderH + rh;
  const facets = (p: Pt): THREE.Color =>
    col(
      [P.mint, P.white, P.yellow][
        Math.floor(((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2)) * 6) % 3
      ],
    );
  put(acc, cylB(0.2, 0.2, 0.08, 6), [0, by, 0], P.steel, { aoAmt: 0 });
  put(
    acc,
    lathe(
      [
        [0, 0],
        [0.32, 0.18],
        [0.32, A.prismH - 0.22],
        [0, A.prismH],
      ],
      6,
    ),
    [0, by + 0.08, 0],
    facets,
    { ...lit },
  );
  put(
    acc,
    new THREE.IcosahedronGeometry(0.17, hi ? 1 : 0),
    [0, by + A.prismH + 0.3, 0],
    P.lampGreen,
    lit,
  );
  if (!hi) {
    const g = acc.finish(rng, false, true);
    return g;
  }
  // girder faces: hazard band along the lower edge, dark LED rail with the chasing bulbs
  const zf = A.girderD / 2 + 0.02;
  for (const sz of [-1, 1]) {
    stripes(acc, V(0, yg + 0.1, sz * zf), 'x', gl - 0.2, 0.22, 0.04, 10);
    put(acc, baseBox(gl - 0.4, 0.36, 0.05), [0, yg + 0.5, sz * zf], P.rubber, { aoAmt: 0 });
  }
  const chase: Pt[] = [];
  const xs = (i: number): number => -A.postX - 0.2 + ((2 * A.postX + 0.4) * (i + 0.5)) / A.bulbs;
  const faces: [number, number][] = [];
  for (let i = 0; i < A.bulbs; i++) faces.push([xs(i), 1]);
  for (let i = A.bulbs - 1; i >= 0; i--) faces.push([xs(i), -1]);
  for (const [x, sz] of faces) {
    const p = V(x, A.bulbY - 0.1, sz * (zf + 0.06));
    put(
      acc,
      new THREE.OctahedronGeometry(A.bulbR, 0),
      p,
      chase.length % 3 === 1 ? P.white : P.yellow,
      lit,
    );
    chase.push(p);
  }
  const g = acc.finish(rng, false, true);
  tagMarquee(g, chase, A.bulbR * 1.5);
  addHook(g, 'pass', { halfWidth: A.halfClear, height: A.clear, axis: [0, 0, 1] });
  addHook(g, 'scan', { center: [0, yg - 0.44, 0], width: 2 * A.halfClear });
  addHook(g, 'marquee', { count: chase.length, y: A.bulbY - 0.1 });
  return addHook(g, 'lamp', { center: [0, by + A.prismH + 0.3, 0] });
}

/* ---------------------------------- quay crane --------------------------------- */

/** Crane trolley carriage (origin = its base centre; rides the girders). */
function trolleyInto(acc: Acc, at: Pt): void {
  const G = K.crane;
  put(acc, baseBox(2 * G.legX - 0.4, 0.5, 1.5), at, G.bodyDark, { aoAmt: 0.05 });
  put(acc, baseBox(1.2, 0.5, 0.9), [at.x, at.y + 0.5, at.z], G.cab, { aoAmt: 0.05 });
}

/** Spreader frame with its top centre at `at`: hazard-striped frame bar. */
function spreaderInto(acc: Acc, at: Pt): void {
  const G = K.crane;
  stripes(acc, V(at.x, at.y - 0.22, at.z), 'x', G.spreaderLen, 0.22, G.spreaderW, 8);
}

export function buildQuayTrolley(): THREE.BufferGeometry {
  const acc = new Acc();
  trolleyInto(acc, V(0, 0, 0));
  return acc.finish(createRng(506).fork('qa-trolley'), false, true);
}

/** Spreader (origin = frame top centre, frame hangs below). */
export function buildQuaySpreader(): THREE.BufferGeometry {
  const acc = new Acc();
  spreaderInto(acc, V(0, 0, 0));
  const g = acc.finish(createRng(506).fork('qa-spreader'), false, true);
  return addHook(g, 'spreader', { size: [K.crane.spreaderLen, 0.22, K.crane.spreaderW] });
}

/** Unit cable (y from 0 to 1, base at the origin): scale y to the hang length. */
export function buildQuayCable(): THREE.BufferGeometry {
  const acc = new Acc();
  put(acc, baseBox(0.05, 1, 0.05), [0, 0, 0], K.crane.cable, { aoAmt: 0 });
  return acc.finish(createRng(506).fork('qa-cable'), false, true);
}

function craneInto(acc: Acc, lod: 0 | 1, loaded: boolean, withRig: boolean): void {
  const G = K.crane;
  const hi = lod === 0;
  const top = G.top;
  const th = G.leg;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      put(acc, baseBox(th, top, th), [sx * G.legX, 0, sz * G.legZ], G.body, { aoAmt: 0.15 });
      if (hi) {
        put(acc, baseBox(0.7, 0.45, 1.1), [sx * G.legX, 0, sz * G.legZ], G.steel, { aoAmt: 0.2 });
        stripes(acc, V(sx * G.legX, 0.45, sz * G.legZ), 'y', 1.2, th + 0.04, th + 0.04, 4);
      }
    }
  for (const sx of hi ? [-1, 1] : []) {
    const x = sx * G.legX;
    put(acc, baseBox(th * 0.8, th * 0.8, 2 * G.legZ), [x, top * 0.42, 0], G.bodyDark, { aoAmt: 0 });
    beam(acc, V(x, 0.5, -G.legZ), V(x, top * 0.42, G.legZ), th * 0.55, G.bodyDark);
    beam(acc, V(x, 0.5, G.legZ), V(x, top * 0.42, -G.legZ), th * 0.55, G.bodyDark);
  }
  const len = G.boomZ - G.backZ;
  const mid = (G.boomZ + G.backZ) / 2;
  for (const sx of [-1, 1]) {
    put(acc, baseBox(th * 1.2, 0.7, len), [sx * G.legX, top, mid], G.body, { aoAmt: 0.05 });
    if (hi)
      stripes(
        acc,
        V(sx * (G.legX + th * 0.6 + 0.02), top + 0.2, mid),
        'z',
        len - 0.4,
        0.04,
        0.3,
        10,
      );
  }
  for (const z of hi ? [-G.legZ, G.legZ, G.boomZ - 0.3, G.backZ + 0.3] : [-G.legZ, G.legZ])
    put(acc, baseBox(2 * G.legX + th, 0.5, th), [0, top + 0.1, z], G.bodyDark, { aoAmt: 0 });
  // machine house on the back end, mint
  put(acc, baseBox(2 * G.legX - 0.6, 1.2, 2.2), [0, top + 0.7, G.backZ + 1.4], P.mint, {
    aoAmt: 0.1,
  });
  if (hi) {
    put(acc, baseBox(2 * G.legX - 0.4, 0.14, 2.4), [0, top + 1.9, G.backZ + 1.4], G.bodyDark, {
      aoAmt: 0,
    });
    // driver's cab under the girder at the boom end with a warm window
    put(acc, baseBox(1.1, 1, 1.2), [G.legX - 0.9, top - 1.05, G.trolleyHome], G.cab, {
      aoAmt: 0.05,
    });
    put(
      acc,
      new THREE.PlaneGeometry(0.8, 0.5),
      [G.legX - 0.9, top - 0.5, G.trolleyHome + 0.61],
      P.window,
      { emissive: 1, aoAmt: 0, ao: () => 1 },
    );
    for (const at of [V(0, top + 0.45, G.boomZ - 0.1), V(0, top + 2.05, G.backZ + 1.4)])
      put(acc, new THREE.IcosahedronGeometry(0.14, 0), at, P.lampRed, lit);
  }
  if (!withRig) return;
  const tz = G.trolleyHome;
  trolleyInto(acc, V(0, top + 0.7, tz));
  for (const dx of hi ? [-0.5, 0.5] : [0])
    put(acc, baseBox(0.05, top - G.spreaderHome, 0.05), [dx, G.spreaderHome, tz], G.cable, {
      aoAmt: 0,
    });
  spreaderInto(acc, V(0, G.spreaderHome, tz));
  if (loaded)
    container(
      acc,
      V(0, G.spreaderHome - 0.22 - 0.02 - K.container.h, tz),
      K.container.colors[1],
      lod,
    );
}

/* ------------------------------- inspection line ------------------------------- */

/** Lamp head (housing + lens + ✓ / ✗ glyph) centred at `c`: lit = glowing lens, else a dim lens. */
function lampHead(acc: Acc, c: Pt, ok: boolean, on: boolean, hi: boolean): void {
  const L = K.line.lamp;
  put(acc, baseBox(0.7, 0.9, 0.5), [c.x, c.y - 0.6, c.z], P.mintDeep, { aoAmt: 0.1 });
  const color = ok ? (on ? P.lampGreen : P.lampGreenDim) : on ? P.lampRed : P.lampRedDim;
  const o = on ? lit : { aoAmt: 0 };
  put(acc, new THREE.IcosahedronGeometry(L.r, hi ? 1 : 0), [c.x, c.y, c.z + 0.12], color, o);
  if (!hi) return;
  const glyph = (rot: number, dx: number, dy: number, w: number): void =>
    put(acc, baseBox(w, 0.07, 0.03), [c.x + dx, c.y + dy, c.z + 0.3], color, {
      q: qEuler(0, 0, rot),
      ...o,
    });
  if (ok) {
    glyph(-0.8, -0.08, -0.34, 0.17);
    glyph(0.9, 0.06, -0.34, 0.3);
  } else {
    glyph(0.78, 0, -0.34, 0.36);
    glyph(-0.78, 0, -0.34, 0.36);
  }
}

function inspectionLine(acc: Acc, lod: 0 | 1, rejectLit: boolean): void {
  const N = K.line;
  const hi = lod === 0;
  const hl = N.len / 2;
  const bw = N.width;
  // belt: side rails, legs, rubber belt with end rollers
  for (const sz of [-1, 1]) {
    put(acc, baseBox(N.len, 0.26, 0.14), [0, N.beltY - 0.3, sz * (bw / 2 + 0.07)], P.white, {
      aoAmt: 0.1,
    });
    if (hi)
      stripes(
        acc,
        V(0, N.beltY - 0.3 + 0.26, sz * (bw / 2 + 0.07)),
        'x',
        N.len - 0.4,
        0.05,
        0.16,
        12,
      );
  }
  put(acc, baseBox(N.len - 0.2, 0.12, bw), [0, N.beltY - 0.14, 0], P.rubber, { aoAmt: 0.1 });
  const nLeg = hi ? 5 : 2;
  for (let i = 0; i < nLeg; i++)
    for (const sz of [-1, 1]) {
      const x = -hl + 0.5 + (i * (N.len - 1)) / (nLeg - 1);
      put(acc, baseBox(0.18, N.beltY - 0.3, 0.18), [x, 0, sz * (bw / 2 + 0.07)], P.steel, {
        aoAmt: 0.2,
      });
    }
  if (hi) {
    for (const sx of [-1, 1])
      put(
        acc,
        new THREE.CylinderGeometry(0.17, 0.17, bw, 8).rotateX(Math.PI / 2),
        [sx * (hl - 0.1), N.beltY - 0.08, 0],
        P.steel,
        { aoAmt: 0 },
      );
    // mint chevrons on the belt
    for (let i = 0; i < 8; i++)
      put(
        acc,
        baseBox(0.34, 0.02, bw - 0.5),
        [-hl + 1 + i * ((N.len - 2) / 7), N.beltY - 0.08, 0],
        P.mint,
        { aoAmt: 0 },
      );
  }
  // mini scanner portal over the belt
  const pz = bw / 2 + 0.3;
  for (const sz of [-1, 1]) {
    put(acc, baseBox(0.26, N.portalH, 0.26), [N.portalX, 0, sz * pz], P.white, { aoAmt: 0.15 });
    if (hi) stripes(acc, V(N.portalX, 0.04, sz * pz), 'y', 0.8, 0.3, 0.3, 4);
  }
  put(acc, baseBox(0.6, 0.42, 2 * pz + 0.4), [N.portalX, N.portalH, 0], P.mint, { aoAmt: 0.1 });
  put(acc, baseBox(0.08, 0.04, 2 * pz - 0.5), [N.portalX, N.portalH - 0.03, 0], P.lampGreen, lit);
  // inspector booth behind the belt (-z): window and door face +z toward the belt
  const B = N.booth;
  put(acc, baseBox(B.w + 0.3, 0.2, B.d + 0.3), [B.x, 0, B.z], P.mint, { aoAmt: 0.2 });
  put(acc, baseBox(B.w, B.h, B.d), [B.x, 0.2, B.z], P.white, { aoAmt: 0.12 });
  put(acc, baseBox(B.w + 0.5, 0.14, B.d + 0.5), [B.x, 0.2 + B.h, B.z], P.mintDeep, { aoAmt: 0 });
  put(acc, new THREE.PlaneGeometry(1.3, 0.85), [B.x - 0.3, 1.5, B.z + B.d / 2 + 0.01], P.window, {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
  if (hi) {
    put(acc, baseBox(1.5, 0.08, 0.35), [B.x - 0.3, 0.95, B.z + B.d / 2 + 0.17], P.yellow, {
      aoAmt: 0,
    });
    put(acc, baseBox(0.5, 1.7, 0.04), [B.x + 0.8, 0.2, B.z + B.d / 2 + 0.02], P.mintDeep, {
      aoAmt: 0,
    });
    put(
      acc,
      baseBox(0.9, 0.42, 0.04),
      [B.x - 0.3, 0.2 + B.h - 0.5, B.z + B.d / 2 + 0.02],
      P.yellow,
      { aoAmt: 0 },
    );
    stripes(acc, V(B.x, 0.2 + B.h + 0.14, B.z + B.d / 2 + 0.26), 'x', B.w + 0.4, 0.1, 0.04, 8);
  }
  // lamp pair on a post at the +x end: ✓ on top, ✗ below; v2 lights the check, v3 the cross
  const L = N.lamp;
  put(acc, baseBox(0.55, 0.16, 0.55), [L.x, 0, L.z], P.mint, { aoAmt: 0.15 });
  put(acc, cylB(0.09, 0.09, L.postH, hi ? 6 : 4), [L.x, 0.16, L.z], P.steel, { aoAmt: 0.1 });
  lampHead(acc, V(L.x, L.postH + 0.2, L.z), true, !rejectLit, hi);
  lampHead(acc, V(L.x, L.postH - 0.85, L.z), false, rejectLit, hi);
}

/* --------------------------------- customsYard --------------------------------- */

function customsYard({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const V_ = CUSTOMS_VARIANT;
  const acc = seedAcc(rng, 0.008);
  const G = K.crane;
  const L = K.line;
  let g: THREE.BufferGeometry;
  if (variant === V_.craneLoaded || variant === V_.craneEmpty) {
    const loaded = variant === V_.craneLoaded;
    craneInto(acc, lod, loaded, loaded);
    g = acc.finish(rng, false, true);
    addHook(g, 'spreader', {
      home: [0, G.spreaderHome, G.trolleyHome],
      up: [0, G.spreaderUp, G.trolleyHome],
      down: [0, G.spreaderDown, G.trolleyHome],
      size: [G.spreaderLen, 0.22, G.spreaderW],
    });
    addHook(g, 'trolley', {
      home: [0, G.top + 0.7, G.trolleyHome],
      z: [...G.trolleyZ],
      y: G.top + 0.7,
    });
    addHook(g, 'cable', { x: [-0.5, 0.5], top: G.top });
    addHook(g, 'container', { size: [K.container.l, K.container.h, K.container.w], hang: 0.24 });
  } else if (variant === V_.lineOk || variant === V_.lineReject) {
    inspectionLine(acc, lod, variant === V_.lineReject);
    g = acc.finish(rng, false, true);
    addHook(g, 'belt', {
      from: [-L.len / 2 + 0.6, L.beltY - 0.08, 0],
      to: [L.len / 2 - 0.6, L.beltY - 0.08, 0],
      width: L.width,
    });
    addHook(g, 'lamps', {
      ok: [L.lamp.x, L.lamp.postH + 0.2, L.lamp.z + 0.12],
      bad: [L.lamp.x, L.lamp.postH - 0.85, L.lamp.z + 0.12],
      lit: variant === V_.lineReject ? 'bad' : 'ok',
    });
    addHook(g, 'booth', { door: [L.booth.x + 0.8, 0.2, L.booth.z + L.booth.d / 2 + 0.3] });
  } else {
    stack(acc, 0, 0, rng.fork('colours'), lod, K.stack.tiers);
    g = acc.finish(rng, false, true);
  }
  return g;
}

/* ------------------------------ quarantinePontoon ------------------------------ */

/** The raft's plan outline (x across, z along; bow +z): a chamfered rectangle. */
function outline(w: number, l: number): THREE.Vector2[] {
  const hw = w / 2;
  const hl = l / 2;
  const c = 0.6;
  return [
    V2(-hw, -hl + c),
    V2(-hw, hl - c),
    V2(-hw + c, hl),
    V2(hw - c, hl),
    V2(hw, hl - c),
    V2(hw, -hl + c),
    V2(hw - c, -hl),
    V2(-hw + c, -hl),
  ];
}

/** A crate stack of `n`: wooden cubes, yellow bands and a rubber ✗ stencil on the front. */
function crates(acc: Acc, x: number, y: number, z: number, n: number, hi: boolean): void {
  const s = 0.9;
  for (let i = 0; i < n; i++) {
    const yaw = (i % 2 ? 0.12 : -0.08) + x * 0.03;
    const c = V(x, y + i * (s + 0.01), z);
    const q = qEuler(0, yaw, 0);
    put(acc, baseBox(s, s, s), c, P.wood, { q, aoAmt: 0.1 });
    if (!hi) continue;
    put(acc, baseBox(s + 0.04, 0.12, s + 0.04), c.clone().add(V(0, s - 0.2, 0)), P.yellow, {
      q,
      aoAmt: 0,
    });
    for (const rot of [0.785, -0.785]) {
      const m = new THREE.Vector3(0, 0, s / 2 + 0.015).applyQuaternion(q);
      put(
        acc,
        baseBox(0.55, 0.06, 0.02),
        c
          .clone()
          .add(V(0, s * 0.45, 0))
          .add(m),
        P.rubber,
        {
          q: q.clone().multiply(qEuler(0, 0, rot)),
          aoAmt: 0,
        },
      );
    }
  }
}

/** A-frame quarantine tent: four prism slices alternating yellow / white (one slab at LOD1). */
function tent(acc: Acc, x: number, y: number, z: number, yaw: number, hi: boolean): void {
  const T = K.pontoon.tent;
  const q = qEuler(0, yaw, 0);
  const prof = [V2(-1.0, 0), V2(1.0, 0), V2(0, 1.5)];
  const at = (dz: number): Pt => V(x, y, z).add(V(0, 0, dz).applyQuaternion(q));
  if (!hi) {
    put(acc, prism(prof, 2.2), at(0), T[0], { q, aoAmt: 0.1 });
    return;
  }
  for (let i = 0; i < 4; i++)
    put(acc, prism(prof, 0.55), at(-0.825 + i * 0.55), T[i % 2], { q, aoAmt: 0.1 });
  // door flap on the +z gable and a ridge flag pole
  put(acc, baseBox(0.6, 0.9, 0.03), at(1.12), P.rubber, { q, aoAmt: 0 });
  put(acc, cylB(0.025, 0.025, 0.5, 4), at(0).add(V(0, 1.5, 0)), P.steel, { aoAmt: 0 });
}

function quarantinePontoon({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const P_ = K.pontoon;
  const lay = P_.layouts[Math.min(P_.layouts.length - 1, variant)];
  const hi = lod === 0;
  const acc = seedAcc(rng, 0.01);
  const deck = P_.deck;
  const shape = new THREE.Shape(outline(lay.w, lay.l));
  const ext = (depth: number): THREE.BufferGeometry =>
    new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).rotateX(Math.PI / 2);
  put(acc, ext(0.34), [0, deck, 0], (p) => col(p.y > deck - 0.02 ? P_.plank : P_.hull), {
    aoAmt: 0.1,
  });
  put(acc, ext(0.26), [0, deck - 0.34, 0], P_.waterline, { aoAmt: 0.25 });
  if (hi) {
    // hazard curb on both short edges, yellow bollards at the four corners
    for (const sz of [-1, 1])
      stripes(acc, V(0, deck, sz * (lay.l / 2 - 0.1)), 'x', lay.w - 1.5, 0.1, 0.14, 7);
    for (const [sx, sz] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ] as const)
      put(
        acc,
        cylB(0.09, 0.07, 0.3, 5),
        [sx * (lay.w / 2 - 0.3), deck, sz * (lay.l / 2 - 0.3)],
        P.yellow,
        { aoAmt: 0.1 },
      );
  }
  for (const t of lay.tents) tent(acc, t.x, deck, t.z, t.yaw, hi);
  for (const c of lay.crates) crates(acc, c.x, deck, c.z, c.n, hi);
  // the beacon lamp: steel post, mint hood, red lens
  const LP = lay.lamp;
  put(acc, cylB(0.07, 0.05, P_.lampH, hi ? 5 : 4), [LP.x, deck, LP.z], P.steel, { aoAmt: 0.1 });
  put(
    acc,
    new THREE.ConeGeometry(0.3, 0.22, hi ? 6 : 4),
    [LP.x, deck + P_.lampH + 0.1, LP.z],
    P.mint,
    { aoAmt: 0 },
  );
  const first = accVerts(acc);
  const lampY = deck + P_.lampH - 0.04;
  put(
    acc,
    new THREE.IcosahedronGeometry(P_.lampR, hi ? 1 : 0),
    [LP.x, lampY, LP.z],
    P.lampRed,
    lit,
  );
  const count = accVerts(acc) - first;
  const g = acc.finish(rng, false, true);
  if (hi) {
    tagBeacon(g, { first, count });
    tagBob(g);
  }
  addHook(g, 'lamp', { center: [LP.x, lampY, LP.z] });
  addHook(g, 'deck', { y: deck, size: [lay.w, lay.l] });
  return addHook(g, 'crates', {
    stacks: lay.crates.map((c) => ({ center: [c.x, deck + (c.n * 0.91) / 2, c.z], n: c.n })),
  });
}

/* -------------------------------- cargo ship -------------------------------- */

/**
 * QA cargo ship for the harbour movers: bow +z, waterline y = 0. White hull over a mint waterline band, a
 * yellow trim band, a steel deck, the bridge at the stern (mint roof, warm window band, yellow funnel, a mast
 * with a green lamp). `loaded` bakes the containers on the deck slots; the hook `slots` lists every slot
 * so a crane mover can draw a bare ship (`false`) plus the loose `buildQaContainer`s and lift them.
 */
export function buildQaCargoShip(loaded = true): THREE.BufferGeometry {
  const S = K.ship;
  const C = K.container;
  const acc = new Acc();
  const half = S.beam / 2;
  const L = S.l;
  const plan = [
    V2(-half, -L / 2),
    V2(half, -L / 2),
    V2(half, L / 2 - S.taper),
    V2(0, L / 2),
    V2(-half, L / 2 - S.taper),
  ];
  const band = (y0: number, y1: number, color: string, inset: number): void => {
    const g = prism(
      plan.map((p) => V2(p.x * (1 - inset), p.y * (1 - inset * 0.3))),
      y1 - y0,
    ).rotateX(Math.PI / 2);
    put(acc, g, [0, (y0 + y1) / 2, 0], color, { aoAmt: 0 });
  };
  band(-0.4, 0.35, S.hullLow, 0.06);
  band(0.35, S.deck - 0.3, S.hull, 0);
  band(S.deck - 0.3, S.deck, S.trim, 0.005);
  band(S.deck, S.deck + 0.08, S.deckCol, 0.05);
  const slots: Record<string, unknown>[] = [];
  let n = 0;
  S.bayZ.forEach((z, bay) => {
    S.colX.forEach((x, colIdx) => {
      const tiers = (S.upperBays as readonly number[]).includes(bay) ? 2 : 1;
      for (let tier = 0; tier < tiers; tier++) {
        const base = V(x, S.deck + 0.08 + tier * (C.h + 0.04), z);
        const color = C.colors[(n * 2 + tier) % C.colors.length];
        slots.push({ id: n, col: colIdx, bay, tier, base: tup(base), yaw: Math.PI / 2, color });
        if (loaded) {
          acc.xf = mat([base.x, base.y, base.z], qEuler(0, Math.PI / 2, 0), 1);
          container(acc, V(0, 0, 0), color, 0);
          acc.xf = null;
        }
        n++;
      }
    });
  });
  const bz = -L / 2 + 1.5;
  const dk = S.deck + 0.08;
  put(acc, baseBox(S.beam - 0.5, 1.6, 2.0), [0, dk, bz], S.bridge, { aoAmt: 0.1 });
  put(acc, baseBox(S.beam - 0.4, 0.34, 2.1), [0, dk + 0.95, bz], P.window, {
    emissive: 1,
    ao: () => 1,
    aoAmt: 0,
  });
  put(acc, baseBox(S.beam - 0.2, 0.14, 2.3), [0, dk + 1.6, bz], S.roof, { aoAmt: 0 });
  put(acc, cylB(0.34, 0.3, 1.1, 8), [0, dk + 1.74, bz - 0.55], S.funnel, { aoAmt: 0.05 });
  put(acc, cylB(0.35, 0.35, 0.16, 8), [0, dk + 2.1, bz - 0.55], S.roof, { aoAmt: 0 });
  const mastTop = dk + 3.1;
  put(acc, cylB(0.04, 0.04, 1.3, 4), [0, dk + 1.74, bz + 0.5], P.steel, { aoAmt: 0 });
  put(acc, new THREE.IcosahedronGeometry(0.11, 0), [0, mastTop, bz + 0.5], P.lampGreen, lit);
  // bow rail stripe: hazard blocks on the foredeck edge
  stripes(acc, V(0, dk, L / 2 - S.taper - 0.2), 'x', S.beam - 0.9, 0.1, 0.08, 6);
  const g = acc.finish(createRng(506).fork('qa-ship'), false, true);
  addHook(g, 'slots', { list: slots });
  addHook(g, 'bridge', { center: [0, dk + 0.8, bz] });
  addHook(g, 'lamp', { center: [0, mastTop, bz + 0.5] });
  return addHook(g, 'bow', { at: [0, S.deck, L / 2] });
}

export const QA_CUSTOMS_GEO: readonly PropGeoDef[] = [
  {
    id: 'scannerArch',
    variants: 1,
    build: scannerArch,
    footprint: K.arch.footprint,
    height: 10.8,
    windy: false,
  },
  // v0 loaded crane, v1 empty rig, v2 / v3 inspection line (✓ / ✗ lit), v4 container stack
  {
    id: 'customsYard',
    variants: 5,
    build: customsYard,
    footprint: K.crane.footprint,
    height: 9.8,
    heights: [9.8, 9.8, 3.4, 3.4, 3.0],
    windy: false,
  },
  {
    id: 'quarantinePontoon',
    variants: K.pontoon.layouts.length,
    build: quarantinePontoon,
    footprint: K.pontoon.footprint,
    height: 3.25,
    windy: false,
  },
];
