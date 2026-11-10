/**
 * Deniz Üstü Lunapark gate, stands and furniture (M53 TASK-670).
 *
 *   lunaGate   the neon sign gate at the pier mouth: two candy towers, a lit sign with a wheel, a star
 *              burst and a coaster zigzag, a chasing bulb border (LOD0 marquee tag, as the arches)
 *   lunaStand  v0 ticket booth, v1 cotton candy cart, v2 popcorn cart, v3 ice cream cart, v4 prize stall
 *              with hanging plush prizes
 *   lunaDecor  v0 balloon bunch, v1 bench, v2 queue rail, v3 string-bulb post
 * Frames: pivot on the plank top, x and z centred on the piece, front = +z. Stands and furniture stay
 * under 3 u tall and 3 u in one plan extent (a tier-2 detail, never a T0 structure).
 * Numbers: content/themes/marketing-luna-look.ts.
 */
import * as THREE from 'three';
import { LUNA_LOOK } from '../../content/themes/marketing-luna-look.ts';
import type { Acc } from '../kit.ts';
import { qEuler } from '../kit.ts';
import { TAU, V, baseBox, cylB, jitterAcc, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { addHook } from './hq.ts';
import { P, bulb, candyPole, canopy, cloth, flat, lit, pane, rod } from './marketing-luna-parts.ts';
import { tagMarquee } from './surface-tags.ts';

const G = LUNA_LOOK.gate;
const S = LUNA_LOOK.stand;
const D = LUNA_LOOK.decor;
const BU = LUNA_LOOK.bulbs;

/* -------------------------------------- gate -------------------------------------- */

/** A neon tube between two points in the sign plane (lit). */
function neon(
  acc: Acc,
  a: [number, number],
  b: [number, number],
  z: number,
  w: number,
  color: string,
): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  put(
    acc,
    new THREE.BoxGeometry(Math.hypot(dx, dy) + w * 0.8, w, w),
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z],
    color,
    {
      ...lit,
      q: qEuler(0, 0, Math.atan2(dy, dx)),
    },
  );
}

function lunaGate({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.006);
  const T = G.tower;
  const hs = G.span / 2;
  for (const s of [-1, 1]) {
    candyPole(
      acc,
      [s * hs, 0, 0],
      T.r + 0.08,
      T.r,
      T.h,
      hi ? T.bands : 3,
      [P.coral, P.cream],
      hi ? 8 : 5,
      'metal',
    );
    put(acc, cylB(T.r + 0.35, T.r + 0.35, 0.25, hi ? 8 : 5), [s * hs, 0, 0], P.gold, {
      aoAmt: 0.2,
    });
    put(acc, cylB(T.r + 0.18, T.r + 0.1, 0.22, hi ? 8 : 5), [s * hs, T.h, 0], P.gold, {
      aoAmt: 0,
      cls: 'metal',
    });
    put(
      acc,
      new THREE.ConeGeometry(T.r + 0.25, T.cap, hi ? 8 : 5).translate(0, T.cap / 2, 0),
      [s * hs, T.h + 0.22, 0],
      P.gold,
      { aoAmt: 0.1 },
    );
    put(
      acc,
      new THREE.OctahedronGeometry(0.16, 0),
      [s * hs, T.h + 0.22 + T.cap + 0.1, 0],
      P.coral,
      lit,
    );
  }
  // the lintel and the sign board
  put(acc, baseBox(G.span, G.beam.h, 0.5), [0, G.beam.y, -0.05], P.coral, {
    aoAmt: 0.1,
    cls: 'metal',
  });
  const sg = G.sign;
  const zf = sg.d / 2 + 0.005;
  put(acc, baseBox(sg.w + 0.3, sg.h + 0.3, sg.d), [0, sg.y - 0.15, 0], P.cream, { aoAmt: 0.1 });
  put(acc, new THREE.PlaneGeometry(sg.w, sg.h), [0, sg.y + sg.h / 2 - 0.15, zf], P.ink, {
    ...flat,
    noJitter: true,
  });
  const cy = sg.y + sg.h / 2 - 0.15;
  const chase: THREE.Vector3[] = [];
  if (hi) {
    // wheel (left): ring + 6 spokes + hub, sky
    const cx = -1.7;
    const r = 0.62;
    const nr = 14;
    for (let k = 0; k < nr; k++) {
      const a0 = (k / nr) * TAU;
      const a1 = ((k + 1) / nr) * TAU;
      neon(
        acc,
        [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r],
        [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r],
        zf + 0.03,
        0.07,
        P.sky,
      );
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI;
      neon(
        acc,
        [cx + Math.cos(a) * r, cy + Math.sin(a) * r],
        [cx - Math.cos(a) * r, cy - Math.sin(a) * r],
        zf + 0.03,
        0.05,
        P.sky,
      );
    }
    // star burst (centre): 8 rays + a core, gold
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const r0 = 0.2;
      const r1 = k % 2 ? 0.55 : 0.78;
      neon(
        acc,
        [Math.cos(a) * r0, cy + Math.sin(a) * r0],
        [Math.cos(a) * r1, cy + Math.sin(a) * r1],
        zf + 0.03,
        0.09,
        P.gold,
      );
    }
    put(acc, new THREE.OctahedronGeometry(0.17, 0), [0, cy, zf + 0.04], P.warm, lit);
    // the back of the sign (seen from the sea / the island): an ink panel with its own star burst
    put(acc, new THREE.PlaneGeometry(sg.w, sg.h), [0, cy, -zf], P.ink, {
      ...flat,
      noJitter: true,
      q: qEuler(0, Math.PI, 0),
    });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const r1 = k % 2 ? 0.55 : 0.78;
      neon(
        acc,
        [Math.cos(a) * 0.2, cy + Math.sin(a) * 0.2],
        [Math.cos(a) * r1, cy + Math.sin(a) * r1],
        -zf - 0.03,
        0.09,
        P.gold,
      );
    }
    for (const x of [-1.7, 1.7])
      put(acc, new THREE.OctahedronGeometry(0.22, 0), [x, cy, -zf - 0.04], P.pink, lit);
    // coaster zigzag (right): pink
    const zz: Array<[number, number]> = [
      [1.0, cy - 0.45],
      [1.35, cy + 0.45],
      [1.7, cy - 0.1],
      [2.05, cy + 0.5],
      [2.4, cy - 0.45],
    ];
    for (let i = 0; i + 1 < zz.length; i++) neon(acc, zz[i], zz[i + 1], zf + 0.03, 0.08, P.pink);
    // the bulb border, chasing round the frame
    const hw = sg.w / 2 + 0.15;
    const top = sg.y + sg.h + 0.0;
    const bot = sg.y - 0.3;
    const n = G.bulbs;
    for (let i = 0; i < n; i++) {
      const x = -hw + ((i + 0.5) / n) * (2 * hw);
      for (const y of [top, bot]) {
        const p = V(x, y, sg.d / 2 + 0.03);
        bulb(acc, p, G.bulbR, BU[i % 3]);
        chase.push(p);
      }
    }
    for (const s of [-1, 1])
      for (let j = 1; j < 4; j++) {
        const p = V(s * hw, bot + (j / 4) * (top - bot), sg.d / 2 + 0.03);
        bulb(acc, p, G.bulbR, BU[j % 3]);
        chase.push(p);
      }
  } else {
    put(acc, new THREE.PlaneGeometry(sg.w * 0.9, sg.h * 0.7), [0, cy, zf + 0.02], P.gold, lit);
    for (const s of [-1, 1])
      bulb(acc, V(s * (sg.w / 2 + 0.15), sg.y + sg.h, sg.d / 2 + 0.03), G.bulbR * 1.6, P.warm);
  }
  const g = acc.finish(rng, false, true);
  if (hi) tagMarquee(g, chase, G.bulbR * 1.4);
  return g;
}

/* -------------------------------------- stands -------------------------------------- */

/** A cart's chassis: body, two wheels, a handle. */
function cartBody(acc: Acc, body: string, trim: string, hi: boolean): void {
  const C = S.cart;
  // far: the body reaches the ground (no wheels)
  const y0 = hi ? C.wheelR * 0.8 : 0;
  put(acc, baseBox(C.w, C.bodyH + C.wheelR * 0.8 - y0, C.d), [0, y0, 0], body, { aoAmt: 0.15 });
  put(acc, baseBox(C.w + 0.1, 0.08, C.d + 0.1), [0, C.wheelR * 0.8 + C.bodyH, 0], trim, {
    aoAmt: 0,
  });
  if (!hi) return;
  for (const s of [-1, 1])
    put(
      acc,
      new THREE.CylinderGeometry(C.wheelR, C.wheelR, 0.1, 10).rotateZ(Math.PI / 2),
      [s * (C.w / 2 + 0.05), C.wheelR, 0],
      P.ink,
      { aoAmt: 0.1 },
    );
  {
    rod(acc, V(0, 0.45, C.d / 2), V(0, 0.4, C.d / 2 + 0.6), 0.03, P.ink, 3);
    put(acc, baseBox(0.5, 0.05, 0.05), [0, 0.42, C.d / 2 + 0.6], P.ink, { aoAmt: 0 });
  }
}

function booth(acc: Acc, hi: boolean): void {
  const B = S.booth;
  put(acc, baseBox(B.w, B.h, B.d), [0, 0, 0], P.cream, { aoAmt: 0.15 });
  put(acc, baseBox(B.w + 0.1, 0.25, B.d + 0.1), [0, 0, 0], P.coral, { aoAmt: 0.1 });
  // the ticket window: a lit pane in a gold frame and a counter ledge
  put(acc, baseBox(1.1, 0.7, 0.06), [0, 1.0, B.d / 2 + 0.02], P.gold, { aoAmt: 0 });
  put(acc, new THREE.PlaneGeometry(0.9, 0.5), [0, 1.35, B.d / 2 + 0.06], P.warm, {
    ...lit,
    cls: 'glass',
  });
  put(acc, baseBox(1.3, 0.07, 0.35), [0, 0.95, B.d / 2 + 0.18], P.coral, { aoAmt: 0, cls: 'wood' });
  // roof: striped scalloped pyramid and a lit ticket sign
  canopy(acc, [0, B.h, 0], B.w * 0.7, B.roof, hi ? 8 : 4, [P.coral, P.cream], 0.02, hi);
  put(acc, baseBox(1.2, 0.34, 0.08), [0, B.h + 0.05, B.d / 2 + 0.2], P.gold, { aoAmt: 0 });
  put(acc, new THREE.PlaneGeometry(1.0, 0.2), [0, B.h + 0.22, B.d / 2 + 0.25], P.coral, { ...lit });
  if (hi) {
    for (let k = 0; k < 5; k++)
      bulb(acc, V(-0.8 + k * 0.4, B.h - 0.02, B.d / 2 + 0.08), 0.06, BU[k % 3]);
    put(acc, baseBox(0.42, 0.9, 0.06), [B.w / 2 - 0.4, 0, B.d / 2 + 0.02], P.coral, {
      aoAmt: 0.1,
      cls: 'wood',
    });
    // a striped awning over the window, a ticket stub pair on the wall, side windows, a coin tray
    for (let k = 0; k < 6; k++)
      put(
        acc,
        new THREE.BoxGeometry(1.4 / 6, 0.05, 0.4),
        [-0.7 + (k + 0.5) * (1.4 / 6), 1.82, B.d / 2 + 0.2],
        k % 2 ? P.cream : P.coral,
        { ...cloth, q: qEuler(0.35, 0, 0) },
      );
    for (const s of [-1, 1]) {
      pane(acc, [s * (B.w / 2 + 0.01), 1.2, 0.1], 0.5, 0.45, P.warm, (s * Math.PI) / 2);
      put(acc, baseBox(0.04, 0.5, 0.55), [s * (B.w / 2 + 0.02), 0.95, 0.1], P.gold, { aoAmt: 0 });
    }
    put(acc, baseBox(0.34, 0.1, 0.22), [0.2, 0.95 + 0.07, B.d / 2 + 0.22], P.gold, {
      aoAmt: 0,
      cls: 'metal',
    });
    put(acc, cylB(0.05, 0.05, 0.5, 4, true), [-B.w / 2 + 0.15, B.h, -B.d / 2 + 0.15], P.ink, {
      aoAmt: 0,
    });
    bulb(acc, V(-B.w / 2 + 0.15, B.h + 0.55, -B.d / 2 + 0.15), 0.09, P.warm);
  }
  put(acc, new THREE.OctahedronGeometry(0.14, 0), [0, B.h + B.roof + 0.1, 0], P.gold, lit);
}

function cottonCart(acc: Acc, hi: boolean): void {
  const C = S.cart;
  cartBody(acc, P.pink, P.cream, hi);
  const y0 = C.wheelR * 0.8 + C.bodyH + 0.08;
  // a drum and three cones of cotton candy on poles
  if (hi) put(acc, cylB(0.4, 0.4, 0.18, 10), [0, y0, 0], P.steel, { aoAmt: 0.1, cls: 'metal' });
  const cs = [P.pink, P.cream, P.sky];
  const spots: Array<[number, number, number]> = [
    [-0.5, 0.55, 0.05],
    [0, 0.85, -0.1],
    [0.5, 0.6, 0.05],
  ];
  spots.forEach(([x, h, z], i) => {
    if (hi) put(acc, cylB(0.03, 0.03, h, 3, true), [x, y0 + 0.1, z], P.cream, { aoAmt: 0 });
    put(acc, new THREE.IcosahedronGeometry(0.34, hi ? 1 : 0), [x, y0 + 0.1 + h + 0.25, z], cs[i], {
      aoAmt: 0,
      noJitter: true,
      cls: 'fabric',
    });
  });
  if (hi) {
    // striped canopy on two poles, a lit sign
    for (const s of [-1, 1])
      rod(acc, V(s * 0.7, y0, -0.4), V(s * 0.7, y0 + 1.15, -0.4), 0.035, P.cream, 4);
    canopy(acc, [0, y0 + 1.1, -0.4], 1.1, 0.35, 8, [P.pink, P.cream]);
    for (let k = 0; k < 5; k++) bulb(acc, V(-0.6 + k * 0.3, y0 + 1.08, 0.2), 0.05, BU[k % 3]);
  }
}

function popcornCart(acc: Acc, hi: boolean): void {
  const C = S.cart;
  cartBody(acc, P.coral, P.cream, hi);
  const y0 = C.wheelR * 0.8 + C.bodyH + 0.08;
  // glass popcorn box with a heap of popcorn rising over its rim
  put(acc, baseBox(1.2, 0.5, 0.8), [0, y0, 0], P.warm, {
    aoAmt: 0,
    cls: 'glass',
    noJitter: true,
    emissive: 0.5,
  });
  put(acc, new THREE.BoxGeometry(1.26, 0.07, 0.86), [0, y0 + 0.5, 0], P.coral, { aoAmt: 0 });
  const n = hi ? 16 : 3;
  for (let k = 0; k < n; k++) {
    const a = k * 2.399;
    const rr = 0.1 + 0.34 * Math.sqrt((k + 0.5) / n);
    put(
      acc,
      new THREE.IcosahedronGeometry(hi ? 0.13 : 0.2, 0),
      [Math.cos(a) * rr * 1.5, y0 + 0.62 + 0.22 * (1 - rr / 0.44), Math.sin(a) * rr * 1.0],
      k % 3 ? P.white : P.gold,
      { aoAmt: 0, noJitter: true },
    );
  }
  if (hi) {
    for (const s of [-1, 1])
      rod(acc, V(s * 0.62, y0 + 0.5, -0.3), V(s * 0.62, y0 + 1.2, -0.3), 0.035, P.cream, 4);
    canopy(acc, [0, y0 + 1.15, -0.1], 1.15, 0.4, 8, [P.coral, P.cream]);
    put(acc, new THREE.PlaneGeometry(0.9, 0.18), [0, y0 + 0.3, 0.45], P.gold, { ...lit });
    for (let k = 0; k < 5; k++) bulb(acc, V(-0.6 + k * 0.3, y0 + 1.12, 0.45), 0.05, BU[k % 3]);
  }
}

function iceCart(acc: Acc, hi: boolean): void {
  const C = S.cart;
  cartBody(acc, P.mint, P.cream, hi);
  const y0 = C.wheelR * 0.8 + C.bodyH + 0.08;
  put(acc, baseBox(1.1, 0.14, 0.7), [0, y0 - 0.08, 0.05], P.white, { aoAmt: 0.1 });
  // the big cone on a pole, two scoops and a cherry
  if (hi) put(acc, cylB(0.03, 0.03, 0.5, 4, true), [0, y0, -0.25], P.cream, { aoAmt: 0 });
  put(
    acc,
    new THREE.ConeGeometry(0.3, 0.6, hi ? 8 : 5).rotateX(Math.PI).translate(0, 0.3, 0),
    [0, y0 + 0.4, -0.25],
    '#E6B873',
    { aoAmt: 0.1 },
  );
  put(acc, new THREE.IcosahedronGeometry(0.28, hi ? 1 : 0), [0, y0 + 1.1, -0.25], P.pink, {
    aoAmt: 0,
    noJitter: true,
  });
  put(acc, new THREE.IcosahedronGeometry(0.23, hi ? 1 : 0), [0, y0 + 1.38, -0.25], P.cream, {
    aoAmt: 0,
    noJitter: true,
  });
  if (hi) put(acc, new THREE.IcosahedronGeometry(0.08, 0), [0, y0 + 1.62, -0.25], P.coral, lit);
  if (hi) {
    canopy(acc, [0, y0 + 0.65, 0.3], 0.9, 0.3, 8, [P.mint, P.cream]);
    for (const s of [-1, 1])
      rod(acc, V(s * 0.65, y0 + 0.06, 0.3), V(s * 0.65, y0 + 0.7, 0.3), 0.03, P.cream, 4);
    for (let k = 0; k < 4; k++) bulb(acc, V(-0.45 + k * 0.3, y0 + 0.62, 0.7), 0.05, BU[k % 3]);
  }
}

/** A plush prize: body, head, two ears (bear / bunny by `kind`). Sitting or hanging at `at`. */
function plush(
  acc: Acc,
  at: THREE.Vector3,
  r: number,
  color: string,
  kind: number,
  hi: boolean,
): void {
  put(acc, new THREE.IcosahedronGeometry(r, 0), at, color, {
    aoAmt: 0.1,
    noJitter: true,
    cls: 'fabric',
  });
  const head = at.clone().add(V(0, r * 1.15, r * 0.1));
  put(acc, new THREE.IcosahedronGeometry(r * 0.75, 0), head, color, {
    aoAmt: 0.1,
    noJitter: true,
    cls: 'fabric',
  });
  if (!hi) return;
  for (const s of [-1, 1]) {
    if (kind % 2)
      put(
        acc,
        new THREE.OctahedronGeometry(r * 0.28, 0).scale(0.6, 2.2, 0.6),
        head.clone().add(V(s * r * 0.35, r * 0.85, 0)),
        color,
        { aoAmt: 0, noJitter: true },
      );
    else
      put(
        acc,
        new THREE.IcosahedronGeometry(r * 0.28, 0),
        head.clone().add(V(s * r * 0.55, r * 0.55, 0)),
        color,
        { aoAmt: 0, noJitter: true },
      );
    put(
      acc,
      new THREE.OctahedronGeometry(r * 0.1, 0),
      head.clone().add(V(s * r * 0.25, r * 0.1, r * 0.7)),
      P.ink,
      { aoAmt: 0, noJitter: true },
    );
  }
}

function prizeStall(acc: Acc, hi: boolean): void {
  const Z = S.prize;
  const hw = Z.w / 2;
  const zb = -Z.d / 2 + 0.1;
  // counter, back wall with shelves, corner posts, striped awning on top
  put(acc, baseBox(Z.w, Z.counter, 0.55), [0, 0, Z.d / 2 - 0.3], P.coral, {
    aoAmt: 0.15,
    cls: 'wood',
  });
  put(acc, baseBox(Z.w + 0.1, 0.07, 0.7), [0, Z.counter, Z.d / 2 - 0.3], P.cream, {
    aoAmt: 0,
    cls: 'wood',
  });
  put(acc, baseBox(Z.w, Z.h - 0.35, 0.12), [0, 0, zb], P.blush, { aoAmt: 0.1 });
  // the back of the wall (seen from the sea): coral / cream / gold bands and a lit star
  const bandW = Z.w / 5;
  for (let k = 0; k < (hi ? 5 : 0); k++)
    put(
      acc,
      baseBox(bandW, Z.h - 0.35, 0.04),
      [-Z.w / 2 + (k + 0.5) * bandW, 0, zb - 0.08],
      [P.coral, P.cream][k % 2],
      { aoAmt: 0.05, cls: 'fabric' },
    );
  put(acc, new THREE.OctahedronGeometry(0.34, 0), [0, 1.55, zb - 0.13], P.gold, lit);
  if (hi)
    for (let k = 0; k < 4; k++) bulb(acc, V(-1.2 + k * 0.8, 2.15, zb - 0.12), 0.06, BU[k % 3]);
  for (const s of [-1, 1])
    put(acc, cylB(0.06, 0.06, Z.h - 0.3, 4, true), [s * (hw - 0.06), 0, Z.d / 2 - 0.1], P.cream, {
      aoAmt: 0,
      cls: 'wood',
    });
  for (const y of [1.0, 1.55])
    put(acc, baseBox(Z.w - 0.3, 0.06, 0.4), [0, y, zb + 0.25], P.coral, { aoAmt: 0, cls: 'wood' });
  // awning: a tilted striped slab with a scalloped front
  const n = hi ? 8 : 4;
  for (let k = 0; k < n; k++)
    put(
      acc,
      new THREE.BoxGeometry(Z.w / n, 0.06, Z.d + 0.2),
      [-hw + (k + 0.5) * (Z.w / n), Z.h - 0.18, 0.0],
      k % 2 ? P.cream : P.coral,
      { ...cloth, q: qEuler(0.12, 0, 0) },
    );
  if (hi)
    for (let k = 0; k < n * 2; k++)
      bulb(
        acc,
        V(-hw + 0.1 + k * ((Z.w - 0.2) / (n * 2 - 1)), Z.h - 0.38, Z.d / 2 + 0.12),
        0.05,
        BU[k % 3],
      );
  // plush prizes: sitting on the shelves and hanging from the awning on strings
  const shelf: Array<[number, number, number]> = [
    [-1.1, 1.06, 0],
    [-0.4, 1.06, 1],
    [0.4, 1.06, 2],
    [1.1, 1.06, 3],
    [-0.75, 1.61, 4],
    [0, 1.61, 5],
    [0.75, 1.61, 0],
  ];
  (hi ? shelf : shelf.slice(0, 4)).forEach(([x, y, k]) =>
    plush(acc, V(x, y + 0.2, zb + 0.28), 0.2, S.plush[k % S.plush.length], k, hi),
  );
  const hang = hi ? 6 : 3;
  for (let k = 0; k < (hi ? hang : 0); k++) {
    const x = -hw + 0.35 + k * ((Z.w - 0.7) / (hang - 1));
    const len = 0.45 + (k % 2) * 0.22;
    const yTop = Z.h - 0.22;
    rod(acc, V(x, yTop, Z.d / 2 - 0.1), V(x, yTop - len, Z.d / 2 - 0.1), 0.012, P.ink, 3);
    plush(
      acc,
      V(x, yTop - len - 0.2, Z.d / 2 - 0.1),
      0.17,
      S.plush[(k + 2) % S.plush.length],
      k,
      hi,
    );
  }
  // a ring-toss bottle row on the counter
  if (hi)
    for (let k = 0; k < 5; k++)
      put(
        acc,
        cylB(0.05, 0.05, 0.28, 4, true),
        [-0.6 + k * 0.3, Z.counter + 0.07, Z.d / 2 - 0.3],
        k % 2 ? P.mint : P.sky,
        { aoAmt: 0, cls: 'glass' },
      );
}

function lunaStand({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.006);
  [booth, cottonCart, popcornCart, iceCart, prizeStall][variant](acc, hi);
  return acc.finish(rng, false, true);
}

/* -------------------------------------- decor -------------------------------------- */

function lunaDecor({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.006);
  if (variant === 0) {
    // balloon bunch tied to a weight; the balloons stir in the wind
    put(acc, cylB(0.18, 0.2, 0.14, hi ? 8 : 5), [0, 0, 0], P.ink, { aoAmt: 0.1 });
    const spots: Array<[number, number, number, number]> = [
      [0, 2.35, 0, 0],
      [-0.33, 2.1, 0.12, 1],
      [0.34, 2.15, -0.1, 2],
      [-0.12, 1.85, -0.3, 3],
      [0.18, 1.8, 0.3, 4],
      [-0.45, 1.75, -0.15, 5],
      [0.5, 1.7, 0.1, 6],
    ];
    spots.slice(0, hi ? 7 : 4).forEach(([x, y, z, k]) => {
      const c = D.balloons[k % D.balloons.length];
      const sway = (p: THREE.Vector3): number => 0.1 * Math.max(0, (p.y - 1.4) / 1.2);
      put(acc, new THREE.IcosahedronGeometry(0.26, hi ? 1 : 0).scale(1, 1.2, 1), [x, y, z], c, {
        aoAmt: 0,
        noJitter: true,
        windAbs: sway,
      });
      if (hi) rod(acc, V(0, 0.14, 0), V(x * 0.5, y - 0.3, z * 0.5), 0.008, P.ink, 3);
    });
    return acc.finish(rng, false, true);
  }
  if (variant === 1) {
    const B = D.bench;
    // far: a solid block (no legs)
    put(acc, baseBox(B.w, hi ? 0.09 : 0.51, B.d), [0, hi ? 0.42 : 0, 0], P.woodLight, {
      aoAmt: 0.1,
      cls: 'wood',
    });
    put(acc, baseBox(B.w, 0.4, 0.07), [0, 0.5, -B.d / 2 + 0.05], P.coral, {
      aoAmt: 0.1,
      cls: 'wood',
      q: qEuler(-0.12, 0, 0),
    });
    for (const s of hi ? [-1, 1] : []) {
      put(acc, baseBox(0.09, 0.45, B.d), [s * (B.w / 2 - 0.1), 0, 0], P.cream, {
        aoAmt: 0.1,
        cls: 'metal',
      });
      put(
        acc,
        new THREE.IcosahedronGeometry(0.075, 0),
        [s * (B.w / 2 - 0.1), 0.8, -B.d / 2 + 0.1],
        P.gold,
        { aoAmt: 0, noJitter: true },
      );
    }
    return acc.finish(rng, false, true);
  }
  if (variant === 2) {
    const R = D.rail;
    for (const s of [-1, 1]) {
      put(acc, cylB(0.06, 0.05, R.postH, hi ? 6 : 4, true), [(s * R.len) / 2, 0, 0], P.cream, {
        aoAmt: 0,
        cls: 'metal',
      });
      if (hi) {
        put(
          acc,
          new THREE.IcosahedronGeometry(0.1, 1),
          [(s * R.len) / 2, R.postH + 0.06, 0],
          P.gold,
          {
            aoAmt: 0,
            cls: 'metal',
            noJitter: true,
          },
        );
        put(acc, cylB(0.12, 0.12, 0.05, 8), [(s * R.len) / 2, 0, 0], P.coral, { aoAmt: 0 });
      }
    }
    if (!hi) {
      put(acc, baseBox(R.len, 0.05, 0.05), [0, R.postH - 0.2, 0], P.coral, { aoAmt: 0 });
      return acc.finish(rng, false, true);
    }
    const np = hi ? 7 : 3;
    const pts = Array.from({ length: np }, (_, i) => {
      const t = i / (np - 1);
      return V((t - 0.5) * R.len, R.postH - 0.1 - 0.16 * Math.sin(t * Math.PI), 0);
    });
    const curve = new THREE.CatmullRomCurve3(pts);
    put(acc, new THREE.TubeGeometry(curve, pts.length * 2, 0.03, 4, false), [0, 0, 0], P.coral, {
      aoAmt: 0,
      cls: 'fabric',
      noJitter: true,
    });
    return acc.finish(rng, false, true);
  }
  // v3: string-bulb post
  const H = D.post.h;
  if (hi) put(acc, cylB(0.16, 0.2, 0.2, 8), [0, 0, 0], P.coral, { aoAmt: 0.2 });
  put(acc, cylB(0.05, 0.065, H - 0.3 + (hi ? 0 : 0.2), 5, true), [0, hi ? 0.2 : 0, 0], P.cream, {
    aoAmt: 0.1,
    cls: 'metal',
  });
  if (hi)
    put(acc, new THREE.IcosahedronGeometry(0.11, 0), [0, H - 0.1, 0], P.gold, {
      aoAmt: 0,
      noJitter: true,
    });
  const swag = hi ? 5 : 1;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 4;
    for (let i = 1; i <= swag; i++) {
      const t = i / (swag + 0.5);
      const r = t * 1.1;
      bulb(
        acc,
        V(Math.cos(a) * r, H - 0.15 - 0.55 * t + 0.28 * Math.sin(t * Math.PI), Math.sin(a) * r),
        0.06,
        BU[(k + i) % 3],
      );
    }
    if (hi)
      rod(
        acc,
        V(0, H - 0.15, 0),
        V(
          Math.cos(a) * 1.1 * (swag / (swag + 0.5)),
          H - 0.15 - 0.55,
          Math.sin(a) * 1.1 * (swag / (swag + 0.5)),
        ),
        0.01,
        P.dark,
        3,
      );
  }
  bulb(acc, V(0, H + 0.04, 0), 0.1, P.warm);
  const g = acc.finish(rng, false, true);
  return addHook(g, 'bulbs', { reach: 1.1 });
}

export const LUNA_STANDS_GEO: readonly PropGeoDef[] = [
  {
    id: 'lunaGate',
    variants: 1,
    build: lunaGate,
    footprint: 3.2,
    height: G.tower.h + G.tower.cap + 0.6,
    windy: false,
  },
  {
    id: 'lunaStand',
    variants: 5,
    build: lunaStand,
    footprint: 1.3,
    height: 2.8,
    heights: [2.89, 2.71, 2.72, 2.86, 2.67],
    windy: false,
  },
  {
    id: 'lunaDecor',
    variants: 4,
    build: lunaDecor,
    footprint: 0.7,
    height: 2.6,
    heights: [2.66, 0.9, 1.11, 2.74],
    windy: false,
  },
];
