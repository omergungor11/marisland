/**
 * Horseshoe Harbour quay furniture (M52 TASK-660, D-170): `quayFurnish` variants 0-2 are the café
 * terraces (round tables, chairs, striped parasols, a menu board or planters), variants 3-5 the
 * market stalls (fish on ice, fruit crates, a postcard rack). Numbers: content/themes/marketing-marina-look.ts.
 *
 * Frames: centred on the plan box, pivot on the quay, front = +z. The parasols and canopies use the
 * awning stripe sets of the houses (fabric class).
 */
import * as THREE from 'three';
import { MARINA_LOOK as L } from '../../content/themes/marketing-marina-look.ts';
import type { Acc } from '../kit.ts';
import { col, qEuler } from '../kit.ts';
import { V, baseBox, cylB, jitterAcc, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';

const P = L.pal;
const T = L.terrace;
const S = L.stall;
const flat = { aoAmt: 0, ao: () => 1 } as const;

function parasol(
  acc: Acc,
  hi: boolean,
  x: number,
  z: number,
  r: number,
  set: number,
  baseY = 0,
): void {
  const [a, b] = L.stripes[set % L.stripes.length];
  const n = hi ? 8 : 6;
  put(acc, cylB(T.pole, T.pole, T.parasolH - T.parasolRise, 3, true), [x, baseY, z], P.woodLight, {
    aoAmt: 0,
  });
  put(
    acc,
    new THREE.CylinderGeometry(0.01, r, T.parasolRise, n, 1, true).translate(
      0,
      T.parasolRise / 2,
      0,
    ),
    [x, baseY + T.parasolH - T.parasolRise, z],
    (p) =>
      Math.floor(((Math.atan2(p.z - z, p.x - x) + Math.PI) / (Math.PI * 2)) * n) % 2
        ? col(a)
        : col(b),
    { double: hi, aoAmt: 0, ao: () => 1, noJitter: true, cls: 'fabric' },
  );
}

function terrace({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const t = L.terraces[variant];
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.012);
  const seat = rng.fork('seat');
  t.tables.forEach((tb, k) => {
    const cloth = L.stripes[(variant + k) % L.stripes.length][1];
    if (hi) put(acc, cylB(0.05, 0.05, T.tableH, 3, true), [tb.x, 0, tb.z], P.wood, { aoAmt: 0 });
    if (!hi) return;
    put(acc, cylB(T.tableR, T.tableR, T.tableCloth, 6), [tb.x, T.tableH, tb.z], cloth, {
      aoAmt: 0.1,
      cls: 'fabric',
    });
    tb.chairs.forEach((c, m) => {
      // chairs pushed back a little, none quite square to the table (seeded)
      const a = (c * Math.PI) / 2 + seat.range(-0.28, 0.28);
      const dist = T.chairDist + seat.range(0, 0.1);
      const cx = tb.x + Math.sin(a) * dist;
      const cz = tb.z + Math.cos(a) * dist;
      const colr = T.chairColors[(variant + k + m) % T.chairColors.length];
      const q = qEuler(0, a, 0);
      put(acc, baseBox(T.chairSeat, T.chairH, T.chairSeat), [cx, 0, cz], colr, {
        q,
        aoAmt: 0.2,
        cls: 'wood',
      });
      put(
        acc,
        baseBox(T.chairSeat, T.chairBack, 0.07),
        [
          cx + Math.sin(a) * (T.chairSeat / 2 - 0.03),
          T.chairH,
          cz + Math.cos(a) * (T.chairSeat / 2 - 0.03),
        ],
        colr,
        { q, aoAmt: 0.1, cls: 'wood' },
      );
    });
  });
  for (const p of t.parasols) parasol(acc, hi, p.x, p.z, p.r, p.set);
  if (hi && t.menu) {
    const { x, z } = t.menu;
    for (const s of [-1, 1]) {
      const q = qEuler(s * 0.2, 0, 0);
      put(acc, baseBox(T.menuW, T.menuH, 0.04), [x, 0, z + s * 0.2], P.ink, { q, aoAmt: 0.1 });
      if (s === 1) continue;
      for (const [i, w] of [0.34, 0.24, 0.3].entries())
        put(
          acc,
          new THREE.PlaneGeometry(w, 0.045).translate(0, 0.6 - i * 0.14, 0.025),
          [x, 0, z + s * 0.2],
          P.trim,
          { ...flat, q, noJitter: true },
        );
      put(
        acc,
        new THREE.PlaneGeometry(0.2, 0.06).translate(0, 0.22, 0.025),
        [x, 0, z + s * 0.2],
        P.accent,
        { ...flat, q, noJitter: true },
      );
    }
  }
  if (t.planters.length) {
    const Pl = T.planter;
    const zb = -t.d / 2 + Pl.d / 2 + 0.12;
    t.planters.forEach((px, k) => {
      if (hi) {
        put(acc, baseBox(Pl.w, Pl.h, Pl.d), [px, 0, zb], P.stoneWarm, { aoAmt: 0.2 });
        put(
          acc,
          new THREE.IcosahedronGeometry(Pl.bush, 0),
          [px, Pl.h + Pl.bush * 0.7, zb],
          P.leaf,
          { aoAmt: 0.1 },
        );
        put(
          acc,
          new THREE.OctahedronGeometry(0.08, 0),
          [px + 0.16, Pl.h + Pl.bush * 1.3, zb + 0.1],
          k % 2 ? P.pink : P.yellow,
          { aoAmt: 0, noJitter: true },
        );
      } else {
        put(acc, baseBox(Pl.w, Pl.h + Pl.bush, Pl.d), [px, 0, zb], P.leaf, { aoAmt: 0.2 });
      }
    });
  }
  return acc.finish(rng, false, true);
}

/** Sloped striped canopy of a stall: high at the back, low at the front, with a valance. */
function canopy(acc: Acc, hi: boolean, set: number): void {
  const [a, b] = L.stripes[set % L.stripes.length];
  const hw = S.w / 2 + 0.06;
  const hd = S.d / 2 + 0.05;
  const yb = S.postH + S.canopyRise * 0.7;
  const yf = S.postH - 0.1;
  if (!hi) {
    put(acc, new THREE.BoxGeometry(2 * hw, 0.1, 2 * hd), [0, (yb + yf) / 2, 0], a, {
      aoAmt: 0,
      cls: 'fabric',
    });
    return;
  }
  const n = 4;
  for (let i = 0; i < n; i++) {
    const x0 = -hw + (i * 2 * hw) / n;
    const x1 = x0 + (2 * hw) / n;
    const c = i % 2 ? b : a;
    acc.addPoly([V(x0, yb, -hd), V(x1, yb, -hd), V(x1, yf, hd), V(x0, yf, hd)], V(0, 1, 0.3), {
      color: col(c),
      windMul: 0,
      ao: () => 1,
      double: true,
      cls: 'fabric',
    });
    acc.addPoly(
      [V(x0, yf, hd), V(x1, yf, hd), V(x1, yf - 0.16, hd), V(x0, yf - 0.16, hd)],
      V(0, 0, 1),
      {
        color: col(c),
        windMul: 0,
        ao: () => 0.92,
        cls: 'fabric',
      },
    );
  }
}

function stall({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const k = variant - 3;
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.012);
  const zc = S.d / 2 - S.counterD / 2 - 0.04;
  if (!hi)
    for (const sx of [-1, 1])
      put(
        acc,
        cylB(0.05, 0.05, S.postH + S.canopyRise * 0.7, 3, true),
        [sx * (S.w / 2 - 0.08), 0, -(S.d / 2 - 0.08)],
        P.wood,
        { aoAmt: 0.1 },
      );
  if (hi)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        put(
          acc,
          cylB(0.045, 0.045, sz > 0 ? S.postH - 0.1 : S.postH + S.canopyRise * 0.7, 4, true),
          [sx * (S.w / 2 - 0.08), 0, sz * (S.d / 2 - 0.08)],
          P.wood,
          { aoAmt: 0.1, cls: 'wood' },
        );
  canopy(acc, hi, S.set[k]);
  // counter with a painted front, top slab
  const front = L.stripes[S.set[k] % L.stripes.length][0];
  put(acc, baseBox(S.w - 0.2, S.counterH, S.counterD), [0, 0, zc], hi ? P.woodLight : front, {
    aoAmt: 0.15,
    cls: 'wood',
  });
  if (hi) {
    put(acc, baseBox(S.w - 0.1, 0.06, S.counterD + 0.12), [0, S.counterH, zc], P.trim, {
      aoAmt: 0,
    });
    put(acc, baseBox(S.w - 0.16, 0.34, 0.03), [0, 0.22, zc + S.counterD / 2 + 0.015], front, flat);
  }
  const top = S.counterH + (hi ? 0.06 : 0);
  if (k === 0) {
    put(acc, baseBox(1.3, hi ? 0.1 : 0.14, 0.46), [-0.1, top, zc + 0.02], hi ? S.ice : P.sky, {
      aoAmt: 0.05,
      noJitter: true,
    });
    if (hi) {
      S.fish.forEach((c, i) => {
        const fx = -0.55 + i * 0.32;
        const fz = zc + (i % 2 ? 0.1 : -0.06);
        put(acc, new THREE.OctahedronGeometry(1, 0), [fx, top + 0.12, fz], c, {
          s: [0.15, 0.05, 0.06],
          q: qEuler(0, i % 2 ? 0.15 : -0.1, 0),
          aoAmt: 0,
          noJitter: true,
        });
        const tail = new THREE.BufferGeometry();
        tail.setAttribute(
          'position',
          new THREE.Float32BufferAttribute([0, 0, 0, 0.1, 0, 0.07, 0.1, 0, -0.07], 3),
        );
        put(acc, tail, [fx + 0.15, top + 0.12, fz], c, {
          double: true,
          aoAmt: 0,
          noJitter: true,
          q: qEuler(0, i % 2 ? 0.15 : -0.1, 0),
        });
      });
      put(acc, cylB(0.17, 0.2, 0.34, 6), [0.8, 0, -0.1], P.teal, { aoAmt: 0.2 });
      put(acc, baseBox(0.5, 0.3, 0.4), [-0.7, 0, -0.45], P.dock, { aoAmt: 0.2, cls: 'wood' });
    }
  } else if (k === 1 && !hi) {
    put(acc, baseBox(1.8, 0.24, 0.42), [0, top, zc + 0.02], S.fruit[0], { aoAmt: 0.15 });
  } else if (k === 1) {
    for (const [i, x] of [-0.62, 0, 0.62].entries()) {
      put(acc, baseBox(0.55, hi ? 0.2 : 0.3, 0.42), [x, top, zc + 0.02], S.crates[i % 2], {
        aoAmt: 0.15,
        cls: 'wood',
      });
      const n = hi ? 5 : 2;
      for (let m = 0; m < n; m++)
        put(
          acc,
          new THREE.OctahedronGeometry(0.1, 0),
          [x + ((m % 3) - 1) * 0.15, top + (hi ? 0.24 : 0.34), zc + 0.02 + (m < 3 ? 0.07 : -0.07)],
          S.fruit[(i * 2 + m) % S.fruit.length],
          { aoAmt: 0, noJitter: true },
        );
    }
  } else {
    // a spinner rack of cards and a pinboard behind
    if (!hi) {
      put(acc, baseBox(1.9, 0.9, 0.06), [0, 1.0, -S.d / 2 + 0.05], P.wood, { aoAmt: 0.1 });
      return acc.finish(rng, false, true);
    }
    put(acc, baseBox(1.9, 0.9, 0.06), [0, 1.0, -S.d / 2 + 0.05], P.wood, {
      aoAmt: 0.1,
      cls: 'wood',
    });
    for (let m = 0; m < 6; m++)
      put(
        acc,
        new THREE.PlaneGeometry(0.28, 0.2),
        [-0.7 + (m % 3) * 0.7, 1.28 - Math.floor(m / 3) * 0.4, -S.d / 2 + 0.09],
        S.cards[m],
        { ...flat, noJitter: true },
      );
    put(acc, cylB(0.03, 0.03, 1.1, 4, true), [0.55, top, zc], P.ink, { aoAmt: 0 });
    for (let m = 0; m < 8; m++) {
      const a = (m / 8) * Math.PI * 2;
      put(
        acc,
        new THREE.PlaneGeometry(0.22, 0.3),
        [0.55 + Math.sin(a) * 0.12, top + 0.75, zc + Math.cos(a) * 0.12],
        S.cards[m % S.cards.length],
        { ...flat, q: qEuler(0, a, 0), double: true, noJitter: true },
      );
    }
    put(acc, cylB(0.12, 0.01, 0.12, 6), [0.55, top + 0.95, zc], P.ink, { aoAmt: 0 });
    if (hi) put(acc, baseBox(0.6, 0.12, 0.4), [-0.5, top, zc], S.cards[5], { aoAmt: 0.1 });
  }
  return acc.finish(rng, false, true);
}

function quayFurnish(o: BuildOpts): THREE.BufferGeometry {
  return o.variant < 3 ? terrace(o) : stall(o);
}

export const MARINA_FURNISH_GEO: readonly PropGeoDef[] = [
  {
    id: 'quayFurnish',
    variants: 6,
    build: quayFurnish,
    footprint: 2.2,
    height: 2.4,
    heights: [2.3, 2.3, 2.3, 2.3, 2.3, 2.3],
    windy: false,
  },
];
