/**
 * Research island garden kit (TASK-402a): fountain, hedgeParterre, topiary, pergola. Small and
 * instancing-cheap (the placement fills gardens with them). The existing `bench` and `flowerBed`
 * defs cover seating and flower beds. Colours: SCIENCE_PALETTE (content/themes/research.ts).
 * Water is a flat pale-blue disc / cone (plain vertex colour, a little night glow); no new shader.
 */
import * as THREE from 'three';
import { SCIENCE_PALETTE as S } from '../../content/themes/research.ts';
import { gradY, qEuler } from '../kit.ts';
import { TAU, baseBox, cylB, jitterAcc, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';

const PI = Math.PI;

/* ---------------------------------- fountain ---------------------------------- */

/** Tiered round stone fountain with a water jet and falling arcs. */
function fountain({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const seg = hi ? 14 : 8;
  put(acc, cylB(1.75, 1.7, 0.55, seg), [0, 0, 0], S.plinthDark, { aoAmt: 0.25 });
  put(acc, cylB(1.78, 1.78, 0.1, seg), [0, 0.55, 0], S.plinth, { aoAmt: 0 });
  put(acc, cylB(1.55, 1.55, 0.04, seg), [0, 0.5, 0], S.water, {
    emissive: 0.25,
    aoAmt: 0,
    ao: () => 1,
  });
  put(acc, cylB(0.34, 0.26, 1.0, hi ? 8 : 5), [0, 0.5, 0], S.plinth, { aoAmt: 0.15 });
  put(acc, cylB(0.95, 0.4, 0.3, seg), [0, 1.2, 0], S.plinth, { aoAmt: 0.1 });
  put(acc, cylB(0.8, 0.8, 0.04, seg), [0, 1.52, 0], S.water, {
    emissive: 0.25,
    aoAmt: 0,
    ao: () => 1,
  });
  put(acc, cylB(0.18, 0.14, 0.7, hi ? 6 : 4), [0, 1.5, 0], S.plinth, { aoAmt: 0.1 });
  put(acc, cylB(0.5, 0.2, 0.22, hi ? 10 : 6), [0, 2.1, 0], S.plinth, { aoAmt: 0.1 });
  put(acc, cylB(0.4, 0.4, 0.04, hi ? 10 : 6), [0, 2.3, 0], S.water, {
    emissive: 0.25,
    aoAmt: 0,
    ao: () => 1,
  });
  // jet
  put(acc, new THREE.ConeGeometry(0.1, 0.7, hi ? 6 : 4), [0, 2.65, 0], S.water, {
    emissive: 0.3,
    aoAmt: 0,
    ao: () => 1,
  });
  put(acc, new THREE.IcosahedronGeometry(0.1, 0), [0, 3.05, 0], S.waterDeep, {
    emissive: 0.3,
    aoAmt: 0,
    ao: () => 1,
  });
  if (hi) {
    // falling arcs into the mid bowl and the basin
    for (let k = 0; k < 4; k++) {
      const a = (k * TAU) / 4 + 0.4;
      put(
        acc,
        new THREE.TorusGeometry(0.3, 0.025, 3, 8, PI),
        [Math.sin(a) * 0.3, 2.35, Math.cos(a) * 0.3],
        S.waterDeep,
        {
          q: qEuler(0, a - PI / 2, 0),
          emissive: 0.3,
          aoAmt: 0,
          ao: () => 1,
        },
      );
      put(
        acc,
        new THREE.TorusGeometry(0.45, 0.025, 3, 8, PI),
        [Math.sin(a + 0.8) * 0.85, 1.62, Math.cos(a + 0.8) * 0.85],
        S.waterDeep,
        {
          q: qEuler(0, a + 0.8 - PI / 2, 0),
          emissive: 0.3,
          aoAmt: 0,
          ao: () => 1,
        },
      );
    }
    // basin rim studs
    for (let k = 0; k < 8; k++) {
      const a = (k * TAU) / 8;
      put(
        acc,
        new THREE.IcosahedronGeometry(0.12, 0),
        [Math.sin(a) * 1.72, 0.7, Math.cos(a) * 1.72],
        S.plinth,
        { aoAmt: 0 },
      );
    }
  }
  return acc.finish(rng, false, true);
}

/* -------------------------------- hedgeParterre -------------------------------- */

/**
 * Low clipped box-hedge parterre tile (~4 x 4 u) on a gravel pad with flower fill. v0: a square
 * frame with a cross; v1: a frame with a circular knot ring.
 */
function hedgeParterre({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const hi = lod === 0;
  const hc = gradY([S.hedge, S.hedgeTop], 0.06, 0.5);
  const bar = (x: number, z: number, w: number, d: number, h = 0.46): void =>
    put(acc, baseBox(w, h, d), [x, 0.06, z], hc, { aoAmt: 0.1 });
  put(acc, baseBox(4.0, 0.06, 4.0), [0, 0, 0], S.gravel, { aoAmt: 0.1 });
  // frame
  bar(0, 1.8, 3.8, 0.34);
  bar(0, -1.8, 3.8, 0.34);
  bar(1.8, 0, 0.34, 3.3);
  bar(-1.8, 0, 0.34, 3.3);
  const bloom = (x: number, z: number, i: number): void => {
    put(acc, new THREE.IcosahedronGeometry(0.34, hi ? 1 : 0), [x, 0.2, z], S.vine[i % 3], {
      s: [1, 0.55, 1],
      aoAmt: 0.1,
    });
    if (hi)
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + i;
        put(
          acc,
          new THREE.IcosahedronGeometry(0.08, 0),
          [x + Math.cos(a) * 0.18, 0.42, z + Math.sin(a) * 0.18],
          S.blooms[(i + k) % 5],
          { aoAmt: 0 },
        );
      }
  };
  if (variant % 2 === 0) {
    bar(0, 0, 0.34, 3.3);
    bar(0, 0, 3.3, 0.34);
    [-0.9, 0.9].forEach((x, i) => [-0.9, 0.9].forEach((z, j) => bloom(x, z, i * 2 + j)));
  } else {
    // circular knot: 10 clipped segments around a flower centre, four corner blooms
    const n = hi ? 10 : 8;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      put(acc, baseBox(0.34, 0.46, 1.0), [Math.sin(a) * 1.1, 0.06, Math.cos(a) * 1.1], hc, {
        q: qEuler(0, a, 0),
        aoAmt: 0.1,
      });
    }
    bloom(0, 0, 1);
    for (const [x, z] of [
      [-1.3, -1.3],
      [1.3, -1.3],
      [-1.3, 1.3],
      [1.3, 1.3],
    ] as const)
      bloom(x, z, x + z > 0 ? 2 : 3);
  }
  return acc.finish(rng, false, true);
}

/* ----------------------------------- topiary ----------------------------------- */

/** Clipped topiary in a terracotta pot. v0: ball, v1: cone, v2: spiral (cone with a bulb spiral). */
function topiary({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.02);
  const hi = lod === 0;
  put(acc, cylB(0.34, 0.26, 0.42, hi ? 8 : 4), [0, 0, 0], S.terracotta, { aoAmt: 0.2 });
  if (hi) put(acc, cylB(0.37, 0.37, 0.07, 8), [0, 0.42, 0], S.terracotta, { aoAmt: 0 });
  const hc = gradY([S.hedge, S.hedgeTop], 0.4, 2.2);
  const v = variant % 3;
  if (v === 0) {
    if (hi) put(acc, cylB(0.05, 0.05, 0.6, 4), [0, 0.45, 0], S.wood, { aoAmt: 0 });
    put(acc, new THREE.IcosahedronGeometry(0.62, hi ? 1 : 0), [0, 1.35, 0], hc, { aoAmt: 0.12 });
  } else if (v === 1) {
    if (hi) {
      // three clipped tiers
      put(acc, cylB(0.62, 0.34, 0.62, 10), [0, 0.5, 0], hc, { aoAmt: 0.12 });
      put(acc, cylB(0.5, 0.26, 0.55, 10), [0, 1.0, 0], hc, { aoAmt: 0.12 });
      put(acc, new THREE.ConeGeometry(0.4, 0.8, 10), [0, 1.8, 0], hc, { aoAmt: 0.12 });
    } else put(acc, new THREE.ConeGeometry(0.58, 1.7, 4), [0, 1.35, 0], hc, { aoAmt: 0.12 });
  } else {
    put(acc, new THREE.ConeGeometry(0.5, 1.8, hi ? 8 : 4), [0, 1.4, 0], hc, { aoAmt: 0.12 });
    const n = hi ? 8 : 0;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const a = t * TAU * 2.2;
      const r = 0.5 * (1 - t) + 0.06;
      put(
        acc,
        new THREE.IcosahedronGeometry(0.17 - t * 0.05, 0),
        [Math.sin(a) * r, 0.5 + t * 1.5, Math.cos(a) * r],
        S.hedgeTop,
        { aoAmt: 0 },
      );
    }
    if (hi) put(acc, new THREE.IcosahedronGeometry(0.12, 0), [0, 2.3, 0], S.hedgeTop, { aoAmt: 0 });
  }
  return acc.finish(rng, false, true);
}

/* ----------------------------------- pergola ----------------------------------- */

/** White pergola ~3 x 2 u with timber slats and climbing vines with blooms (open on +z). */
function pergola({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const W = 3.0;
  const D = 2.0;
  const H = 2.6;
  put(acc, baseBox(W + 0.3, 0.12, D + 0.3), [0, 0, 0], S.plinth, { aoAmt: 0.2 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      put(acc, baseBox(0.2, H, 0.2), [sx * (W / 2 - 0.1), 0.12, sz * (D / 2 - 0.1)], S.white, {
        aoAmt: 0.15,
      });
  for (const sz of [-1, 1])
    put(acc, baseBox(W + 0.3, 0.16, 0.2), [0, H + 0.12, sz * (D / 2 - 0.1)], S.white, { aoAmt: 0 });
  const slats = hi ? 7 : 3;
  for (let k = 0; k < slats; k++)
    put(
      acc,
      baseBox(0.1, 0.1, D + 0.4),
      [-W / 2 + 0.15 + (k * (W - 0.3)) / (slats - 1), H + 0.28, 0],
      S.wood,
      { aoAmt: 0 },
    );
  // vines climbing the posts and spilling over the slats
  const vines: [number, number, number, number][] = hi
    ? [
        [-1.4, 0.5, -0.9, 0.3],
        [-1.4, 1.5, -0.9, 0.34],
        [1.4, 0.7, -0.9, 0.3],
        [1.4, 1.8, -0.9, 0.32],
        [-1.4, 0.9, 0.9, 0.28],
        [1.4, 1.1, 0.9, 0.3],
        [-0.8, H + 0.45, -0.3, 0.38],
        [0.2, H + 0.5, 0.3, 0.42],
        [1.0, H + 0.45, -0.2, 0.36],
        [-0.2, H + 0.4, -0.7, 0.34],
      ]
    : [
        [-1.4, 1.2, -0.9, 0.4],
        [1.4, 1.3, -0.9, 0.4],
        [0, H + 0.45, 0, 0.55],
      ];
  vines.forEach(([x, y, z, r], k) =>
    put(acc, new THREE.IcosahedronGeometry(r, 0), [x, y, z], S.vine[k % 3], { aoAmt: 0.1 }),
  );
  if (hi)
    for (let k = 0; k < 7; k++) {
      const [x, y, z] = vines[(k * 3) % vines.length];
      put(
        acc,
        new THREE.IcosahedronGeometry(0.07, 0),
        [x + 0.14, y + 0.12, z + 0.2],
        S.blooms[k % 5],
        { aoAmt: 0 },
      );
    }
  // little bench inside
  if (hi) put(acc, baseBox(1.8, 0.1, 0.45), [0, 0.55, -0.6], S.wood, { aoAmt: 0.1 });
  for (const sx of hi ? [-1, 1] : [])
    put(acc, baseBox(0.1, 0.43, 0.4), [sx * 0.8, 0.12, -0.6], S.white, { aoAmt: 0.1 });
  if (!hi)
    put(acc, new THREE.PlaneGeometry(W - 0.3, H - 0.6), [0, 1.6, -D / 2 + 0.1], S.wood, {
      aoAmt: 0,
    });
  if (hi) {
    // trellis on the back so the vines have something to climb
    for (let k = 0; k < 6; k++)
      put(acc, baseBox(0.05, H - 0.5, 0.05), [-1.25 + k * 0.5, 0.3, -D / 2 + 0.1], S.wood, {
        aoAmt: 0,
      });
    for (const y of [0.9, 1.7])
      put(acc, baseBox(W - 0.3, 0.05, 0.05), [0, y, -D / 2 + 0.1], S.wood, { aoAmt: 0 });
  }
  return acc.finish(rng, false, true);
}

export const GARDEN_GEO: readonly PropGeoDef[] = [
  { id: 'fountain', variants: 1, build: fountain, footprint: 1.9, height: 3.2, windy: false },
  {
    id: 'hedgeParterre',
    variants: 2,
    build: hedgeParterre,
    footprint: 2.4,
    height: 0.55,
    windy: false,
  },
  {
    id: 'topiary',
    variants: 3,
    build: topiary,
    footprint: 0.5,
    height: 2.1,
    heights: [1.95, 2.15, 2.4],
    windy: false,
  },
  { id: 'pergola', variants: 1, build: pergola, footprint: 2.0, height: 3.5, windy: false },
];
