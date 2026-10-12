/**
 * Marketing "Media Rock" structures (TASK-403): giantScreen (double-sided slideshow screen on the
 * boulevard), antennaTower (red / white lattice with dish platforms), mediaOffice (layered office
 * blocks with a roof terrace), mediaShop (v0 photo studio, v1 print shop; one LOD1), ferrisWheel
 * (the static frame; the rotor is `buildWheelRotor`, turned by render/movers.ts), fairTent (striped
 * marquee) and fairBooth (v0 game booth, v1 café; one LOD1). Sizes and colours:
 * content/themes/marketing.ts MEDIA_ROCK. Defs: content/props-themes/marketing.ts.
 *
 * Night glow rides the window / emissive path (emissive 1 windows and bulbs, emissive 2 screens).
 */
import * as THREE from 'three';
import { OFFICE_COLORS as C, OFFICE_PAL } from '../../content/palette-offices.ts';
import { MEDIA_ROCK as M } from '../../content/themes/marketing.ts';
import { createRng, type Rng } from '../../core/rng.ts';
import { col, qEuler, qFromTo, type Acc } from '../kit.ts';
import { dish, glyph } from '../office-kit.ts';
import { TAU, V, baseBox, cylB, jitterAcc, put, windowAt } from '../parts.ts';
import type { BuildOpts, Lod } from '../types.ts';
import { accVerts } from './coding.ts';
import { addHook, lighten, pennant } from './hq.ts';
import { tagSlides } from './surface-tags.ts';

const K = M.colors;
const PAL = OFFICE_PAL.marketing;
const Y = V(0, 1, 0);
const lit = { emissive: 1, aoAmt: 0, ao: () => 1 } as const;

/**
 * The rng of a 2-variant def whose variants differ in LOD0 detail only: LOD1 ignores the variant
 * (no per-variant jitter or face tint), so the batcher draws one far group for both (D-032).
 */
const sharedLod1 = (rng: Rng, lod: Lod, id: string): Rng =>
  lod === 1 ? createRng(403).fork(id) : rng;

/** Square beam from a to b (thickness `th`). */
function beam(acc: Acc, a: THREE.Vector3, b: THREE.Vector3, th: number, color: string): void {
  const d = b.clone().sub(a);
  put(acc, baseBox(th, d.length(), th), a, color, { q: qFromTo(Y, d), aoAmt: 0 });
}

/** Warm bulb (emissive 1). */
function bulb(acc: Acc, at: THREE.Vector3, r: number, color: string = K.warm): void {
  put(acc, new THREE.IcosahedronGeometry(r, 0), at, color, lit);
}

/** Flat emissive pane facing `yaw` (window band, sign face). */
function pane(
  acc: Acc,
  at: THREE.Vector3,
  yaw: number,
  w: number,
  h: number,
  color: string,
  emissive = 1,
): void {
  put(acc, new THREE.PlaneGeometry(w, h), at, color, {
    q: qEuler(0, yaw, 0),
    emissive,
    aoAmt: 0,
    ao: () => 1,
  });
}

/* --------------------------------- giantScreen --------------------------------- */

/**
 * Double-sided LED screen on two red truss legs: both faces are emissive-2 slideshows (front
 * toward the boulevard, back over the shelves below), a lit marquee strip on top, speakers under.
 */
export function giantScreen({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const S = M.screen;
  const acc = jitterAcc(rng, 0.01);
  const hi = lod === 0;
  const top = S.y + S.h;
  const legX = S.w / 2 + 0.1;
  for (const sx of [-1, 1]) {
    const x = sx * legX;
    put(acc, baseBox(1.1, 0.3, 1.7), [x, 0, 0], C.plinth, { aoAmt: 0.2 });
    put(acc, baseBox(S.leg, top + 0.5 - 0.3, S.leg), [x, 0.3, 0], K.accent, { aoAmt: 0.15 });
    if (hi) {
      // truss rungs and diagonals on the leg's two faces, feet bolts
      for (let y = 0.9; y < top; y += 0.9)
        for (const sz of [-1, 1])
          put(acc, baseBox(S.leg + 0.08, 0.07, 0.07), [x, y, sz * (S.leg / 2 + 0.02)], K.cream, {
            aoAmt: 0,
          });
      for (let y = 0.9; y + 0.9 < top; y += 0.9)
        for (const sz of [-1, 1])
          beam(
            acc,
            V(x - S.leg / 2, y, sz * (S.leg / 2 + 0.03)),
            V(x + S.leg / 2, y + 0.9, sz * (S.leg / 2 + 0.03)),
            0.05,
            K.cream,
          );
      for (const dx of [-0.4, 0.4])
        for (const dz of [-0.65, 0.65])
          put(acc, cylB(0.07, 0.07, 0.08, 6), [x + dx, 0.3, dz], C.steel, { aoAmt: 0 });
    }
  }
  // cabinet (dark bezel) and the two faces
  put(acc, baseBox(S.w + 0.4, S.h + 0.4, 0.5), [0, S.y - 0.2, 0], K.bezel, { aoAmt: 0.05 });
  const cy = S.y + S.h / 2;
  const faces: [number, number, number, number][] = [];
  for (const side of [1, -1]) {
    const z = side * 0.26;
    const yaw = side > 0 ? 0 : Math.PI;
    const b0 = accVerts(acc);
    pane(acc, V(0, cy, z), yaw, S.w, S.h, K.accent, 2);
    const a0 = accVerts(acc);
    // brand art: the megaphone mark + copy bars (screen class, the slideshow recolours them)
    const sx = side;
    if (hi) glyph(acc, 'marketing', V(-2.2 * sx, cy, z + side * 0.02), yaw, 2.4, '#FFFFFF', 2);
    else pane(acc, V(-2.2 * sx, cy, z + side * 0.01), yaw, 2.0, 1.8, '#FFFFFF', 2);
    for (const [i, w] of [
      [0, 3.2],
      [1, 2.4],
      [2, 2.8],
    ] as const)
      pane(
        acc,
        V(sx * (1.5 - (3.2 - w) / 2), cy + 0.9 - i * 0.8, z + side * 0.015),
        yaw,
        w,
        0.42,
        '#FFFFFF',
        2,
      );
    faces.push([b0, a0 - b0, a0, accVerts(acc) - a0]);
  }
  // lit marquee strip on top, a crown of spot lamps
  put(acc, baseBox(S.w + 0.6, 0.36, 0.7), [0, top + 0.2, 0], K.gold, { aoAmt: 0 });
  for (const side of [1, -1])
    pane(acc, V(0, top + 0.38, side * 0.36), side > 0 ? 0 : Math.PI, S.w, 0.2, K.warm);
  if (hi) {
    for (let k = 0; k < 9; k++)
      bulb(acc, V(-S.w / 2 + 0.1 + (k * (S.w - 0.2)) / 8, top + 0.66, 0), 0.11);
    // speaker cabinets hanging under the screen ends
    for (const sx of [-1, 1]) {
      put(acc, baseBox(0.8, 1.1, 0.7), [sx * (S.w / 2 - 0.7), S.y - 1.4, 0], K.bezel, {
        aoAmt: 0.1,
      });
      for (const side of [1, -1])
        for (const y of [S.y - 1.1, S.y - 0.65])
          put(
            acc,
            new THREE.CylinderGeometry(0.2, 0.2, 0.04, 8),
            [sx * (S.w / 2 - 0.7), y, side * 0.36],
            C.steelLight,
            { q: qEuler(Math.PI / 2, 0, 0), aoAmt: 0 },
          );
    }
    // service ladder on one leg
    for (let y = 0.6; y < S.y; y += 0.45)
      put(acc, baseBox(0.5, 0.04, 0.04), [legX, y, S.leg / 2 + 0.25], C.steelLight, { aoAmt: 0 });
  }
  const g = acc.finish(rng, false, true);
  for (const [b0, bn, a0, an] of faces)
    tagSlides(g, { first: b0, count: bn }, { first: a0, count: an });
  return addHook(g, 'screen', { center: [0, cy, 0.26], size: [S.w, S.h], normal: [0, 0, 1] });
}

/* --------------------------------- antennaTower --------------------------------- */

/** Red / white band colour of the lattice by height. */
const bands =
  (h: number) =>
  (p: THREE.Vector3): THREE.Color =>
    col(Math.floor((p.y / h) * 7) % 2 === 0 ? K.accent : K.cream);

/**
 * Broadcast lattice tower: four tapering legs in red / white bands, X-braces (LOD0), two
 * platforms with dishes and drum antennas, a whip mast with red warning lamps, an equipment hut.
 */
export function antennaTower({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const A = M.antenna;
  const acc = jitterAcc(rng, 0.01);
  const hi = lod === 0;
  const half = (y: number): number => A.foot + (A.top - A.foot) * (y / A.h);
  put(acc, baseBox(3.1, 0.3, 3.1), [0, 0, 0], C.plinth, { aoAmt: 0.2 });
  const color = bands(A.h);
  const corners = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ] as const;
  for (const [sx, sz] of corners) {
    const a = V(sx * A.foot, 0.3, sz * A.foot);
    const b = V(sx * A.top, A.h, sz * A.top);
    const d = b.clone().sub(a);
    put(acc, baseBox(0.16, d.length(), 0.16), a, color, { q: qFromTo(Y, d), aoAmt: 0.05 });
  }
  if (hi) {
    // X-braces on all four faces, eight bays
    const bays = 8;
    for (let k = 0; k < bays; k++) {
      const y0 = 0.3 + (k * (A.h - 0.3)) / bays;
      const y1 = 0.3 + ((k + 1) * (A.h - 0.3)) / bays;
      for (let f = 0; f < 4; f++) {
        const [ax, az] = corners[f];
        const [bx, bz] = corners[(f + 1) % 4];
        const p = (x: number, z: number, y: number): THREE.Vector3 =>
          V(x * half(y), y, z * half(y));
        const c = k % 2 === 0 ? K.cream : K.accent;
        beam(acc, p(ax, az, y0), p(bx, bz, y1), 0.06, c);
        beam(acc, p(bx, bz, y0), p(ax, az, y1), 0.06, c);
      }
    }
  }
  // platforms with railings, dishes and drum antennas
  A.platforms.forEach((y, i) => {
    const w = half(y) * 2 + 1.0;
    put(acc, baseBox(w, 0.14, w), [0, y, 0], C.steel, { aoAmt: 0.05 });
    if (hi)
      for (const s of [-1, 1]) {
        put(acc, baseBox(w, 0.05, 0.05), [0, y + 0.55, (s * w) / 2], C.steelLight, { aoAmt: 0 });
        put(acc, baseBox(0.05, 0.05, w), [(s * w) / 2, y + 0.55, 0], C.steelLight, { aoAmt: 0 });
      }
    const yaws = i === 0 ? [0.4, 0.4 + Math.PI * 0.9] : [-0.9];
    yaws.forEach((yaw, k) => {
      const at = V(Math.sin(yaw) * (w / 2 - 0.3), y + 0.14, Math.cos(yaw) * (w / 2 - 0.3));
      dish(acc, at, {
        r: i === 0 ? 0.75 : 0.6,
        yaw,
        elev: 0.25 + 0.15 * k,
        color: K.cream,
        mast: 0.15,
        lod,
      });
    });
    if (hi)
      for (const s of [-1, 1])
        put(acc, cylB(0.16, 0.16, 0.9, 8), [s * (w / 2 - 0.25), y + 0.14, -s * 0.4], K.cream, {
          aoAmt: 0.05,
        });
  });
  // whip mast, warning lamps
  put(acc, cylB(0.09, 0.05, 2.0, hi ? 6 : 4, true), [0, A.h, 0], C.steelLight, { aoAmt: 0 });
  bulb(acc, V(0, A.h + 2.1, 0), hi ? 0.2 : 0.18, K.redLamp);
  if (hi)
    for (const [sx, sz] of corners) bulb(acc, V(sx * half(9), 9, sz * half(9)), 0.1, K.redLamp);
  // equipment hut at the foot
  put(acc, baseBox(1.5, 1.3, 1.1), [0.55, 0.3, 0.75], PAL[0].wall, { aoAmt: 0.15 });
  put(acc, baseBox(1.7, 0.14, 1.3), [0.55, 1.6, 0.75], K.accent, { aoAmt: 0 });
  pane(acc, V(0.9, 0.95, 1.31), 0, 0.5, 0.4, K.warm);
  if (hi) put(acc, baseBox(0.5, 0.9, 0.05), [0.2, 0.3, 1.31], C.dark, { aoAmt: 0 });
  return acc.finish(rng, false, true);
}

/* --------------------------------- mediaOffice --------------------------------- */

/**
 * Layered media office, door (+z) to the view: a blush ground block with a glass ribbon and a red
 * brand band, a cream upper block set back with a roof terrace in front, a dish and a lit sign.
 */
export function mediaOffice({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const O = M.office;
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const p = PAL[0];
  put(acc, baseBox(O.w + 0.3, 0.2, O.d + 0.3), [0, 0, 0], C.plinth, { aoAmt: 0.2 });
  put(acc, baseBox(O.w, O.h0, O.d), [0, 0.2, 0], p.wall, { aoAmt: 0.18 });
  put(acc, baseBox(O.w + 0.06, 0.34, O.d + 0.06), [0, 0.2 + O.h0 - 0.62, 0], K.accent, {
    aoAmt: 0,
  });
  const y1 = 0.2 + O.h0;
  put(acc, baseBox(O.w + 0.24, 0.18, O.d + 0.24), [0, y1, 0], K.cream, { aoAmt: 0.05 });
  // ground floor: glass ribbon front, windows on the sides and back
  const gy = 0.2 + 1.35;
  if (hi) {
    for (const x of [-2.1, -0.7, 2.1])
      windowAt(acc, {
        at: V(x, gy, O.d / 2),
        yaw: 0,
        w: 1.1,
        h: 1.2,
        frame: K.cream,
        glow: K.warm,
      });
    put(acc, baseBox(1.0, 1.8, 0.08), [0.75, 0.2, O.d / 2 + 0.02], K.bezel, { aoAmt: 0 });
    pane(acc, V(0.75, 1.15, O.d / 2 + 0.07), 0, 0.8, 1.6, K.sky, 0.6);
    for (const sx of [-1, 1])
      for (const z of [-1.1, 1.1])
        windowAt(acc, {
          at: V((sx * O.w) / 2, gy, z),
          yaw: (sx * Math.PI) / 2,
          w: 0.9,
          h: 1.0,
          frame: K.cream,
          glow: K.warm,
        });
    for (const x of [-2, 0, 2])
      windowAt(acc, {
        at: V(x, gy, -O.d / 2),
        yaw: Math.PI,
        w: 1.0,
        h: 1.0,
        frame: K.cream,
        glow: K.warm,
      });
    // striped awning over the door
    for (let i = 0; i < 5; i++)
      put(
        acc,
        baseBox(0.24, 0.05, 0.7),
        [0.27 + i * 0.24, 2.15, O.d / 2 + 0.35],
        i % 2 ? K.cream : K.accent,
        {
          q: qEuler(0.35, 0, 0),
          aoAmt: 0,
        },
      );
  } else {
    pane(acc, V(0, gy, O.d / 2 + 0.01), 0, O.w - 1, 1.2, K.warm);
    pane(acc, V(0, gy, -O.d / 2 - 0.01), Math.PI, O.w - 1.4, 1.0, K.warm);
    for (const sx of [-1, 1])
      pane(acc, V((sx * (O.w + 0.02)) / 2, gy, 0), (sx * Math.PI) / 2, O.d - 1.4, 1.0, K.warm);
  }
  // upper block, set back; roof terrace rail in front of it
  const zb = -(O.d - O.d1) / 2;
  const y2 = y1 + 0.18;
  put(acc, baseBox(O.w1, O.h1, O.d1), [0, y2, zb], K.cream, { aoAmt: 0.12 });
  put(acc, baseBox(O.w1 + 0.3, 0.2, O.d1 + 0.3), [0, y2 + O.h1, zb], K.accent, { aoAmt: 0 });
  const uy = y2 + 1.2;
  pane(acc, V(0, uy, zb + O.d1 / 2 + 0.01), 0, O.w1 - 0.8, 1.0, K.warm);
  pane(acc, V(0, uy, zb - O.d1 / 2 - 0.01), Math.PI, O.w1 - 0.8, 1.0, K.warm);
  if (hi) {
    for (const x of [-1.6, -0.55, 0.5, 1.55])
      put(acc, baseBox(0.07, 1.0, 0.06), [x, uy - 0.5, zb + O.d1 / 2 + 0.03], K.cream, {
        aoAmt: 0,
      });
    const rz = O.d / 2 + 0.05;
    put(acc, baseBox(O.w, 0.05, 0.05), [0, y2 + 0.55, rz], C.steelLight, { aoAmt: 0 });
    for (const x of [-O.w / 2, -1, 1, O.w / 2])
      put(acc, baseBox(0.05, 0.55, 0.05), [x, y2, rz], C.steelLight, { aoAmt: 0 });
    // a parasol and a planter on the terrace
    put(acc, cylB(0.03, 0.03, 1.5, 4, true), [-2.2, y2, 1.4], C.steel, { aoAmt: 0 });
    put(
      acc,
      new THREE.ConeGeometry(0.75, 0.35, 8).translate(0, 0.17, 0),
      [-2.2, y2 + 1.45, 1.4],
      K.gold,
      {
        aoAmt: 0,
      },
    );
    put(acc, baseBox(0.9, 0.35, 0.4), [2.2, y2, 1.5], C.deskDark, { aoAmt: 0.1 });
    put(acc, new THREE.IcosahedronGeometry(0.3, 0), [2.2, y2 + 0.5, 1.5], C.plant, { aoAmt: 0.05 });
  }
  // roof: a dish, a lit brand sign on the upper front, a mast lamp
  const ry = y2 + O.h1 + 0.2;
  dish(acc, V(1.2, ry, zb - 0.2), { r: 0.8, yaw: 0.6, elev: 0.6, color: K.cream, mast: 0.35, lod });
  put(acc, baseBox(1.8, 0.8, 0.12), [-1.0, ry, zb + O.d1 / 2 - 0.2], K.bezel, { aoAmt: 0 });
  if (hi) glyph(acc, 'marketing', V(-1.0, ry + 0.4, zb + O.d1 / 2 - 0.12), 0, 0.6, K.warm, 1);
  else pane(acc, V(-1.0, ry + 0.4, zb + O.d1 / 2 - 0.13), 0, 1.5, 0.6, K.warm);
  put(acc, cylB(0.05, 0.04, 1.2, 4, true), [-2.0, ry, zb - 0.8], C.steel, { aoAmt: 0 });
  bulb(acc, V(-2.0, ry + 1.25, zb - 0.8), 0.13, K.redLamp);
  return acc.finish(rng, false, true);
}

/* ---------------------------------- mediaShop ---------------------------------- */

/**
 * Small shop, door (+z) to the view; LOD1 is shared by both variants. v0 photo studio: roof
 * skylights, a big camera-lens sign, a softbox by the door. v1 print shop: a poster window, a
 * roof extractor, paper rolls by the door, a hanging ink sign.
 */
export function mediaShop({ rng: rng0, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const rng = sharedLod1(rng0, lod, 'mediaShop');
  const S = M.shop;
  const acc = jitterAcc(rng, 0.015);
  const hi = lod === 0;
  put(acc, baseBox(S.w + 0.3, 0.16, S.d + 0.3), [0, 0, 0], C.plinth, { aoAmt: 0.2 });
  put(acc, baseBox(S.w, S.h, S.d), [0, 0.16, 0], K.cream, { aoAmt: 0.18 });
  put(acc, baseBox(S.w + 0.3, 0.2, S.d + 0.3), [0, 0.16 + S.h, 0], PAL[1].roof, { aoAmt: 0.05 });
  const top = 0.36 + S.h;
  // the sign over the door (accent), front window and door
  put(acc, baseBox(1.6, 0.5, 0.1), [-0.7, S.h - 0.55, S.d / 2 + 0.02], K.accent, { aoAmt: 0 });
  if (!hi) {
    pane(acc, V(0.4, 1.25, S.d / 2 + 0.01), 0, 2.4, 1.1, K.warm);
    pane(acc, V(0, 1.4, -S.d / 2 - 0.01), Math.PI, 2.0, 0.9, K.warm);
    // the roof kit (skylights / extractor) as one block
    put(acc, baseBox(1.2, 0.75, 0.9), [0.4, top, -0.4], C.steelLight, { aoAmt: 0.05 });
    return acc.finish(rng, false, true);
  }
  windowAt(acc, {
    at: V(0.85, 1.25, S.d / 2),
    yaw: 0,
    w: 1.3,
    h: 1.1,
    frame: PAL[1].roof,
    glow: K.warm,
  });
  put(acc, baseBox(0.8, 1.7, 0.08), [-0.9, 0.16, S.d / 2 + 0.02], K.bezel, { aoAmt: 0 });
  windowAt(acc, {
    at: V(0, 1.4, -S.d / 2),
    yaw: Math.PI,
    w: 1.6,
    h: 0.9,
    frame: PAL[1].roof,
    glow: K.warm,
  });
  for (const sx of [-1, 1])
    windowAt(acc, {
      at: V((sx * S.w) / 2, 1.4, 0),
      yaw: (sx * Math.PI) / 2,
      w: 0.9,
      h: 0.8,
      frame: PAL[1].roof,
      glow: K.warm,
    });
  if (variant === 0) {
    // photo studio: skylights, lens sign, softbox
    for (const x of [-1.0, 0.2, 1.4])
      put(
        acc,
        new THREE.CylinderGeometry(0.5, 0.5, 0.9, 3, 1).rotateZ(Math.PI / 2).translate(0, 0.25, 0),
        [x - 0.2, top, -0.3],
        C.glass,
        { emissive: 0.6, aoAmt: 0 },
      );
    put(
      acc,
      new THREE.CylinderGeometry(0.42, 0.42, 0.16, 12).rotateX(Math.PI / 2),
      [-0.7, S.h - 0.3, S.d / 2 + 0.16],
      C.dark,
      {
        aoAmt: 0,
      },
    );
    put(
      acc,
      new THREE.TorusGeometry(0.3, 0.06, 4, 12),
      [-0.7, S.h - 0.3, S.d / 2 + 0.25],
      C.steelLight,
      { aoAmt: 0 },
    );
    put(acc, new THREE.CircleGeometry(0.22, 10), [-0.7, S.h - 0.3, S.d / 2 + 0.25], K.sky, {
      emissive: 0.8,
      aoAmt: 0,
      ao: () => 1,
    });
    put(acc, cylB(0.03, 0.03, 1.5, 4, true), [1.75, 0.16, S.d / 2 + 0.7], C.steel, { aoAmt: 0 });
    put(acc, new THREE.BoxGeometry(0.6, 0.6, 0.3), [1.75, 1.85, S.d / 2 + 0.7], K.cream, {
      emissive: 0.7,
      aoAmt: 0,
    });
  } else {
    // print shop: posters, extractor, paper rolls, ink sign
    const inks = [K.sky, K.accent, K.gold, K.mint];
    inks.forEach((c, i) =>
      pane(acc, V(0.4 + (i - 1.5) * 0.32, 1.25, S.d / 2 + 0.06), 0, 0.26, 0.8, c, 0.5),
    );
    put(acc, cylB(0.3, 0.3, 0.6, 8), [1.0, top, -0.6], C.steelLight, { aoAmt: 0.05 });
    put(
      acc,
      new THREE.ConeGeometry(0.4, 0.3, 8).translate(0, 0.15, 0),
      [1.0, top + 0.6, -0.6],
      C.steel,
      { aoAmt: 0 },
    );
    for (const [x, y, c] of [
      [-1.6, 0.16, K.cream],
      [-1.6, 0.48, K.blush],
      [-1.25, 0.16, K.cream],
    ] as const)
      put(
        acc,
        new THREE.CylinderGeometry(0.16, 0.16, 0.8, 8).rotateX(Math.PI / 2).translate(0, 0.16, 0),
        [x, y, S.d / 2 + 0.6],
        c,
        {
          aoAmt: 0.05,
        },
      );
    for (const [i, c] of [K.sky, K.accent, K.gold].entries())
      put(
        acc,
        new THREE.IcosahedronGeometry(0.1, 0),
        [-1.1 + i * 0.4, S.h - 0.55, S.d / 2 + 0.1],
        c,
        { aoAmt: 0 },
      );
  }
  return acc.finish(rng, false, true);
}

/* --------------------------------- ferrisWheel --------------------------------- */

/**
 * The ferris wheel's static frame, wheel plane = local xy (the rotor's axis is +z): a boarding
 * deck, two white A-frames to the hub axle, a ticket booth and string lights. The rotor (rims,
 * spokes, pods) is `buildWheelRotor`, posed by render/movers.ts at (0, wheel.hubY, 0).
 */
export function ferrisWheel({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const W = M.wheel;
  const acc = jitterAcc(rng, 0.008);
  const hi = lod === 0;
  put(acc, baseBox(6.2, 0.35, 3.6), [0, 0, 0], C.plinth, { aoAmt: 0.2 });
  put(acc, baseBox(5.8, 0.1, 3.2), [0, 0.35, 0], '#E9D3B3', { aoAmt: 0.05 });
  const hub = V(0, W.hubY, 0);
  const zl = W.ringZ + 0.45;
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1])
      beam(acc, V(sx * 2.7, 0.45, sz * 1.35), V(0, W.hubY, sz * zl), 0.24, K.cream);
    put(acc, baseBox(3.2, 0.16, 0.16), [0, 2.4, sz * (zl + 0.24)], K.cream, { aoAmt: 0 });
  }
  put(
    acc,
    new THREE.CylinderGeometry(0.2, 0.2, 2 * zl + 0.5, hi ? 10 : 6).rotateX(Math.PI / 2),
    hub,
    C.steel,
    {
      aoAmt: 0,
    },
  );
  for (const sz of [-1, 1])
    put(
      acc,
      new THREE.CylinderGeometry(0.34, 0.34, 0.16, hi ? 10 : 6).rotateX(Math.PI / 2),
      [0, W.hubY, sz * (zl + 0.3)],
      K.accent,
      {
        aoAmt: 0,
      },
    );
  // boarding platform under the lowest pod, ticket booth at the side
  const by = W.hubY - W.r - W.podR - 0.25;
  put(acc, baseBox(2.2, by, 1.6), [0, 0.45, 0], K.cream, { aoAmt: 0.15 });
  put(acc, baseBox(1.1, 1.5, 1.0), [3.2, 0.35, 0.6], K.blush, { aoAmt: 0.15 });
  put(acc, baseBox(1.4, 0.14, 1.3), [3.2, 1.85, 0.6], K.accent, { aoAmt: 0 });
  pane(acc, V(3.2, 1.2, 1.11), 0, 0.6, 0.45, K.warm);
  if (hi) {
    // steps up to the platform, gate arch with bulbs, string lights down the legs
    for (let i = 0; i < 3; i++)
      put(acc, baseBox(1.2, 0.2 * (i + 1), 0.35), [0, 0.45, 0.95 + (2 - i) * 0.35], K.cream, {
        aoAmt: 0.1,
      });
    for (const sx of [-1, 1])
      put(acc, cylB(0.06, 0.06, 1.8, 6, true), [sx * 0.9, 0.45 + by, 0.75], K.accent, { aoAmt: 0 });
    put(acc, baseBox(1.9, 0.3, 0.1), [0, 0.45 + by + 1.8, 0.75], K.gold, { aoAmt: 0 });
    for (let k = 0; k < 4; k++) bulb(acc, V(-0.75 + k * 0.5, 0.45 + by + 2.2, 0.8), 0.07);
    for (const sz of [-1, 1])
      for (const sx of [-1, 1])
        for (let k = 1; k < 7; k++) {
          const t = k / 7;
          bulb(
            acc,
            V(
              sx * 2.7 * (1 - t),
              0.45 + (W.hubY - 0.45) * t,
              sz * (1.35 + (zl - 1.35) * t) + sz * 0.16,
            ),
            0.08,
          );
        }
    // queue rope posts
    for (const x of [-1.6, -2.3])
      put(acc, cylB(0.05, 0.05, 0.8, 4, true), [x, 0.45, 1.3], C.gold, { aoAmt: 0 });
    // a low picket rail round the deck with lamp posts, bunting between the A-frame bars
    for (const sz of [-1, 1]) {
      put(acc, baseBox(5.8, 0.06, 0.06), [0, 0.85, sz * 1.62], K.cream, { aoAmt: 0 });
      for (let k = 0; k < 8; k++)
        put(acc, cylB(0.05, 0.05, 0.42, 6), [-2.8 + k * 0.8, 0.45, sz * 1.62], K.cream, {
          aoAmt: 0,
        });
      for (const x of [-2.9, 2.9]) {
        put(acc, cylB(0.05, 0.04, 1.6, 6, true), [x, 0.45, sz * 1.62], C.steel, { aoAmt: 0 });
        put(acc, new THREE.IcosahedronGeometry(0.13, 1), [x, 2.15, sz * 1.62], K.warm, lit);
      }
      for (let k = 0; k < 10; k++) {
        const x = -1.45 + k * 0.32;
        const g = new THREE.BufferGeometry();
        g.setAttribute(
          'position',
          new THREE.Float32BufferAttribute([-0.13, 0, 0, 0.13, 0, 0, 0, -0.3, 0], 3),
        );
        put(
          acc,
          g,
          V(x, 2.32 - 0.25 * Math.sin((k / 9) * Math.PI), sz * (zl + 0.33)),
          M.podColors[k % 6],
          {
            double: true,
            aoAmt: 0,
            ao: () => 1,
          },
        );
      }
    }
  }
  return acc.finish(rng, false, true);
}

/** The ferris wheel rotor (two rims, spokes, round pods with lit ends, rim bulbs); hub at the origin, axis +z. */
export function buildWheelRotor(lod: Lod = 0): THREE.BufferGeometry {
  const W = M.wheel;
  const rng = createRng(403);
  const acc = jitterAcc(rng, 0);
  const hi = lod === 0;
  for (const z of [-W.ringZ, W.ringZ]) {
    put(acc, new THREE.TorusGeometry(W.r, 0.09, 4, hi ? 40 : 20), [0, 0, z], K.cream, { aoAmt: 0 });
    put(acc, new THREE.TorusGeometry(W.r * 0.42, 0.06, 3, 16), [0, 0, z], K.accent, { aoAmt: 0 });
    for (let k = 0; k < W.spokes; k++) {
      const a = (k / W.spokes) * TAU;
      put(
        acc,
        new THREE.BoxGeometry(W.r, 0.06, 0.06),
        [Math.cos(a) * W.r * 0.5, Math.sin(a) * W.r * 0.5, z],
        K.cream,
        {
          q: qEuler(0, 0, a),
          aoAmt: 0,
        },
      );
    }
  }
  put(
    acc,
    new THREE.CylinderGeometry(0.42, 0.42, 2 * W.ringZ + 0.3, 10).rotateX(Math.PI / 2),
    [0, 0, 0],
    K.accent,
    {
      aoAmt: 0,
    },
  );
  for (let k = 0; k < W.pods; k++) {
    const a = ((k + 0.5) / W.pods) * TAU;
    const p = V(Math.cos(a) * W.r, Math.sin(a) * W.r, 0);
    const c = M.podColors[k % M.podColors.length];
    put(acc, new THREE.CylinderGeometry(W.podR, W.podR, W.podL, 12).rotateX(Math.PI / 2), p, c, {
      aoAmt: 0,
    });
    for (const s of [-1, 1])
      put(
        acc,
        new THREE.CircleGeometry(W.podR * 0.62, 10),
        p.clone().add(V(0, 0, s * (W.podL / 2 + 0.01))),
        K.warm,
        {
          q: qEuler(0, s > 0 ? 0 : Math.PI, 0),
          ...lit,
        },
      );
    put(
      acc,
      new THREE.CylinderGeometry(0.05, 0.05, 2 * W.ringZ, 4).rotateX(Math.PI / 2),
      p,
      C.steel,
      { aoAmt: 0 },
    );
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    for (const z of [-W.ringZ - 0.08, W.ringZ + 0.08])
      bulb(
        acc,
        V(Math.cos(a) * W.r, Math.sin(a) * W.r, z),
        0.09,
        k % 2 ? K.warm : lighten(K.accent, 0.4),
      );
  }
  return acc.finish(rng, false, true);
}

/* ----------------------------------- fairTent ----------------------------------- */

/** Stripe colour round the tent by the face centroid's angle. */
const stripe =
  (n: number) =>
  (p: THREE.Vector3): THREE.Color => {
    const a = (Math.atan2(p.z, p.x) + Math.PI) / TAU;
    return col(M.tentColors[Math.floor(a * n) % M.tentColors.length]);
  };

/** Round marquee tent, entrance (+z): striped wall and roof, scalloped valance, flag on top. */
export function fairTent({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const T = M.tent;
  const acc = jitterAcc(rng, 0.02);
  const hi = lod === 0;
  const seg = hi ? 24 : 12;
  const sc = stripe(T.stripes);
  put(
    acc,
    new THREE.CylinderGeometry(T.r, T.r, T.wall, seg, 1, true).translate(0, T.wall / 2, 0),
    [0, 0, 0],
    sc,
    {
      aoAmt: 0.15,
      double: true,
    },
  );
  put(
    acc,
    new THREE.ConeGeometry(T.roofR, T.rise, seg, 1, true).translate(0, T.rise / 2, 0),
    [0, T.wall, 0],
    sc,
    {
      aoAmt: 0,
      double: true,
    },
  );
  // dark entrance with tied-back flaps
  pane(acc, V(0, 0.75, T.r + 0.02), 0, 1.0, 1.4, '#5A4A5E', 0.25);
  put(acc, cylB(0.05, 0.03, 0.9, 4, true), [0, T.wall + T.rise - 0.05, 0], C.steel, { aoAmt: 0 });
  if (hi) {
    pennant(acc, V(0, T.wall + T.rise + 0.75, 0), 0.8, 0.4, K.accent, 0);
    // scalloped valance under the eave, alternating colours
    for (let k = 0; k < 24; k++) {
      const a = ((k + 0.5) / 24) * TAU;
      const g = new THREE.BufferGeometry();
      const w = (TAU * T.roofR) / 24 / 2;
      g.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, 0, -0.35, 0], 3),
      );
      put(
        acc,
        g,
        V(Math.sin(a) * (T.roofR - 0.02), T.wall, Math.cos(a) * (T.roofR - 0.02)),
        k % 2 ? K.gold : K.cream,
        {
          q: qEuler(0, a, 0),
          double: true,
          aoAmt: 0,
          ao: () => 1,
        },
      );
    }
    for (const s of [-1, 1])
      put(acc, new THREE.ConeGeometry(0.3, 1.3, 3, 1, true), [s * 0.62, 0.7, T.r + 0.05], K.cream, {
        q: qEuler(0, 0, s * 0.2),
        double: true,
        aoAmt: 0,
      });
    // guy ropes to stakes, a lantern by the door
    for (let k = 0; k < 4; k++) {
      const a = ((k + 0.5) / 4) * TAU;
      const top = V(Math.sin(a) * T.roofR, T.wall, Math.cos(a) * T.roofR);
      const foot = V(Math.sin(a) * (T.roofR + 0.8), 0, Math.cos(a) * (T.roofR + 0.8));
      beam(acc, foot, top, 0.025, '#D9C3A0');
      put(acc, baseBox(0.08, 0.2, 0.08), foot, C.deskDark, { aoAmt: 0 });
    }
    put(acc, cylB(0.03, 0.03, 1.4, 4, true), [0.75, 0, T.r + 0.35], C.steel, { aoAmt: 0 });
    bulb(acc, V(0.75, 1.5, T.r + 0.35), 0.12);
  } else {
    bulb(acc, V(0, T.wall + T.rise + 0.8, 0), 0.15, K.accent);
  }
  return acc.finish(rng, true, true);
}

/* ----------------------------------- fairBooth ----------------------------------- */

/**
 * Counter booth (+z = customers) under a striped awning; LOD1 is shared. v0 game booth: prize
 * shelves and ring-toss bottles. v1 café: espresso machine, cups, menu board and two bistro
 * tables with parasols in front.
 */
export function fairBooth({ rng: rng0, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const rng = sharedLod1(rng0, lod, 'fairBooth');
  const B = M.booth;
  const acc = jitterAcc(rng, 0.02);
  const hi = lod === 0;
  put(acc, baseBox(B.w, 0.1, B.d), [0, 0, 0], '#E9D3B3', { aoAmt: 0.15 });
  put(acc, baseBox(B.w, B.h, 0.45), [0, 0.1, B.d / 2 - 0.23], K.cream, { aoAmt: 0.15 });
  put(acc, baseBox(B.w + 0.06, 0.12, 0.55), [0, 0.1 + B.h, B.d / 2 - 0.23], K.accent, { aoAmt: 0 });
  put(acc, baseBox(B.w, 2.0, 0.12), [0, 0.1, -B.d / 2 + 0.06], K.blush, { aoAmt: 0.15 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      put(
        acc,
        baseBox(0.09, B.roof - 0.1, 0.09),
        [sx * (B.w / 2 - 0.05), 0.1, sz * (B.d / 2 - 0.05)],
        K.cream,
        {
          aoAmt: 0,
        },
      );
  // striped awning, sloping to the front and overhanging the counter
  const n = hi ? 6 : 1;
  for (let i = 0; i < n; i++) {
    const w = (B.w + 0.3) / n;
    put(
      acc,
      baseBox(w, 0.06, B.d + 0.8),
      [-(B.w + 0.3) / 2 + w * (i + 0.5), B.roof, 0.3],
      hi && i % 2 ? K.cream : K.accent,
      {
        q: qEuler(0.18, 0, 0),
        aoAmt: 0,
      },
    );
  }
  pane(acc, V(0, 1.6, -B.d / 2 + 0.13), 0, B.w - 0.4, 0.6, K.warm, 0.5);
  if (!hi) {
    // the roof sign (star / menu board) as one slab
    put(acc, baseBox(0.9, 0.6, 0.08), [0, B.roof + 0.25, 0.5], K.gold, { aoAmt: 0 });
    return acc.finish(rng, false, true);
  }
  if (variant === 0) {
    // prize shelves with plush balls, bottles on the counter, a star sign
    for (const y of [1.2, 1.75]) {
      put(acc, baseBox(B.w - 0.3, 0.05, 0.25), [0, y, -B.d / 2 + 0.25], C.deskDark, { aoAmt: 0 });
      for (let k = 0; k < 5; k++)
        put(
          acc,
          new THREE.IcosahedronGeometry(0.13, 1),
          [-0.8 + k * 0.4, y + 0.14, -B.d / 2 + 0.25],
          M.podColors[(k + (y > 1.5 ? 2 : 0)) % 6],
          {
            aoAmt: 0,
          },
        );
    }
    for (let k = 0; k < 6; k++)
      put(
        acc,
        cylB(0.05, 0.03, 0.25, 6),
        [
          -0.6 + (k % 3) * 0.18 + (k > 2 ? 0.09 : 0),
          0.22 + B.h,
          B.d / 2 - 0.2 - (k > 2 ? 0.12 : 0),
        ],
        k % 2 ? K.mint : K.sky,
        {
          aoAmt: 0,
        },
      );
    put(
      acc,
      new THREE.TorusGeometry(0.12, 0.025, 3, 10),
      [0.6, 0.24 + B.h, B.d / 2 - 0.2],
      K.gold,
      {
        q: qEuler(Math.PI / 2, 0, 0),
        aoAmt: 0,
      },
    );
    put(
      acc,
      new THREE.CylinderGeometry(0.35, 0.35, 0.06, 5).rotateX(Math.PI / 2),
      [0, B.roof + 0.55, 0.5],
      K.gold,
      { emissive: 0.5, aoAmt: 0 },
    );
  } else {
    // café: espresso machine, cups, menu board, bistro tables with parasols
    put(acc, baseBox(0.5, 0.45, 0.35), [-0.6, 0.22 + B.h, B.d / 2 - 0.28], C.steelLight, {
      aoAmt: 0.05,
    });
    put(acc, cylB(0.06, 0.06, 0.12, 6), [-0.6, 0.22 + B.h + 0.45, B.d / 2 - 0.28], C.dark, {
      aoAmt: 0,
    });
    for (const x of [0.1, 0.35, 0.6])
      put(acc, cylB(0.06, 0.05, 0.1, 6), [x, 0.22 + B.h, B.d / 2 - 0.15], K.cream, { aoAmt: 0 });
    put(acc, baseBox(1.2, 0.6, 0.06), [0, B.roof + 0.2, B.d / 2 + 0.6], C.dark, {
      q: qEuler(0.18, 0, 0),
      aoAmt: 0,
    });
    for (const [i, w] of [0.9, 0.6, 0.75].entries())
      pane(
        acc,
        V(-0.1 + (w - 0.9) / 2, B.roof + 0.42 - i * 0.15, B.d / 2 + 0.67),
        0,
        w,
        0.06,
        K.warm,
        0.8,
      );
    for (const sx of [-1, 1]) {
      const at = V(sx * 0.75, 0, B.d / 2 + 0.95);
      put(acc, cylB(0.04, 0.04, 0.7, 4, true), at, C.steel, { aoAmt: 0 });
      put(acc, cylB(0.28, 0.28, 0.05, 8), at.clone().add(V(0, 0.7, 0)), K.cream, { aoAmt: 0 });
      put(acc, cylB(0.025, 0.025, 1.5, 4, true), at.clone().add(V(0, 0.75, 0)), C.steel, {
        aoAmt: 0,
      });
      put(
        acc,
        new THREE.ConeGeometry(0.6, 0.3, 8, 1, true).translate(0, 0.15, 0),
        at.clone().add(V(0, 2.2, 0)),
        sx < 0 ? K.mint : K.accent,
        {
          aoAmt: 0,
          double: true,
        },
      );
    }
  }
  return acc.finish(rng, false, true);
}
