/**
 * design theme structure geometry (M14b TASK-377): sculptureTorus, sculptureStack, sculptureArch,
 * easel, paintPotPlanter, blossomTree. Defs: content/props-themes/design.ts.
 *
 * Hooks (userData.hooks):
 *  - easel.canvas: painting quad `{ center, normal, size }` (M14c painters face it, paint-pot slot).
 *  - sculpture*: `sculpture.ring` = a spot around the plinth where bots can stand and look.
 * The Atelier Tree (giantTree variant 2) is not here: it needs geo/landmarks.ts + the registry
 * variant count (TASK-378).
 */
import * as THREE from 'three';
import { FLOWERS, WOOD } from '../../content/palette.ts';
import { OFFICE_COLORS as C, OFFICE_PAL } from '../../content/palette-offices.ts';
import { BLOSSOM_CANOPY, SCULPTURE_COLORS as S } from '../../content/props-themes/design.ts';
import { Acc, blob, col, createNoise, frustum, gradY, mat, qEuler } from '../kit.ts';
import { TAU, V, baseBox, cylB, jitterAcc, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { addHook } from './hq.ts';

const PAL = OFFICE_PAL.design;

/** Plinth shared by the sculptures: stepped white cylinder (LOD1: one cylinder). */
function plinth(acc: Acc, r: number, h: number, hi: boolean): void {
  put(acc, cylB(r + 0.15, r + 0.15, 0.12, hi ? 12 : 8), [0, 0, 0], C.plinth, { aoAmt: 0.25 });
  put(acc, cylB(r, r * 0.92, h - 0.12, hi ? 12 : 8), [0, 0.12, 0], S.plinth, { aoAmt: 0.2 });
}

/* ------------------------------- sculptureTorus ------------------------------- */

/** Big red ring standing on a plinth with a blue sphere floating in its eye and a yellow cap. */
function sculptureTorus({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const PH = 0.55;
  const R = 1.55;
  const tube = 0.36;
  const cy = PH + 0.2 + R + tube * 0.3;
  plinth(acc, 0.8, PH, hi);
  // yellow base block the ring is seated in
  put(acc, baseBox(1.0, 0.4, 0.55), [0, PH, 0], S.yellow, { aoAmt: 0.15 });
  put(acc, new THREE.TorusGeometry(R, tube, hi ? 10 : 6, hi ? 28 : 14), [0, cy, 0], S.red, {
    q: qEuler(0, 0.35, 0),
    aoAmt: 0.1,
  });
  put(acc, new THREE.IcosahedronGeometry(0.62, hi ? 2 : 1), [0, cy, 0], S.blue, { aoAmt: 0.05 });
  if (hi) {
    // small yellow bead on the ring top and a spinning-ring hint (thin inner ring)
    put(acc, new THREE.IcosahedronGeometry(0.2, 1), [0, cy + R + tube + 0.12, 0], S.yellow, {
      aoAmt: 0,
    });
    put(acc, new THREE.TorusGeometry(0.9, 0.06, 4, 20), [0, cy, 0], S.yellow, {
      q: qEuler(Math.PI / 2, 0.35, 0),
      aoAmt: 0,
    });
    // paint splashes around the plinth
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7 + 0.5;
      put(
        acc,
        new THREE.CylinderGeometry(0.16, 0.16, 0.02, 7),
        [Math.cos(a) * 1.25, 0.01, Math.sin(a) * 1.25],
        [S.red, S.blue, S.yellow, S.red][k],
        {
          aoAmt: 0,
        },
      );
    }
  }
  const g = acc.finish(rng, false, true);
  return addHook(g, 'sculpture', { ring: { center: [0, 0, 0], radius: 1.6 } });
}

/* ------------------------------- sculptureStack ------------------------------- */

/** Stacked primaries: blue sphere, tilted yellow cube, red sphere. */
function sculptureStack({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const PH = 0.5;
  const noise = createNoise(rng.fork('stackn'));
  plinth(acc, 0.7, PH, hi);
  const r1 = 0.95;
  const y1 = PH + r1 * 0.92;
  const sphere = (r: number, d: number): THREE.BufferGeometry =>
    hi ? blob(r, d, noise, 0.04, 1.3, r * 3) : new THREE.IcosahedronGeometry(r, 1);
  put(acc, sphere(r1, 5), [0, y1, 0], S.blue, { aoAmt: 0.1 });
  const cube = 0.95;
  const y2 = y1 + r1 + cube * 0.42;
  put(acc, new THREE.BoxGeometry(cube, cube, cube), [0.05, y2, 0], S.yellow, {
    q: qEuler(0.45, 0.6, 0.35),
    aoAmt: 0.1,
  });
  const r3 = 0.58;
  const y3 = y2 + cube * 0.6 + r3 * 0.8;
  put(acc, sphere(r3, 3), [-0.05, y3, 0.03], S.red, { aoAmt: 0.05 });
  if (hi) {
    put(acc, new THREE.IcosahedronGeometry(0.2, 1), [0.2, y3 + r3 + 0.12, 0], S.yellow, {
      aoAmt: 0,
    });
    for (let k = 0; k < 3; k++) {
      const a = k * 2.2 + 0.3;
      put(
        acc,
        new THREE.CylinderGeometry(0.14, 0.14, 0.02, 7),
        [Math.cos(a) * 1.15, 0.01, Math.sin(a) * 1.15],
        [S.yellow, S.red, S.blue][k],
        {
          aoAmt: 0,
        },
      );
    }
  }
  const g = acc.finish(rng, false, true);
  return addHook(g, 'sculpture', { ring: { center: [0, 0, 0], radius: 1.4 } });
}

/* -------------------------------- sculptureArch -------------------------------- */

/** Yellow arch on red pillars with a hanging blue ball, on a low wide plinth. */
function sculptureArch({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const R = 1.55;
  const tube = 0.3;
  const legH = 1.6;
  const PH = 0.35;
  put(acc, baseBox(4.4, PH, 1.3), [0, 0, 0], C.plinth, { aoAmt: 0.25 });
  put(acc, baseBox(4.2, 0.1, 1.1), [0, PH, 0], S.plinth, { aoAmt: 0.1 });
  for (const x of [-R, R])
    put(acc, baseBox(0.75, legH, 0.75), [x, PH + 0.1, 0], S.red, { aoAmt: 0.15 });
  const cy = PH + 0.1 + legH;
  put(
    acc,
    new THREE.TorusGeometry(R, tube, hi ? 8 : 5, hi ? 22 : 10, Math.PI),
    [0, cy, 0],
    S.yellow,
    {
      aoAmt: 0.1,
    },
  );
  // hanging blue ball: rod + sphere
  const by = cy + R - 0.15 - tube - 0.85;
  put(acc, cylB(0.03, 0.03, 0.9, 3, true), [0, by + 0.5, 0], C.steel, { aoAmt: 0 });
  put(acc, new THREE.IcosahedronGeometry(0.5, hi ? 2 : 1), [0, by, 0], S.blue, { aoAmt: 0.05 });
  if (hi) {
    put(acc, new THREE.IcosahedronGeometry(0.22, 1), [0, cy + R + tube + 0.1, 0], S.red, {
      aoAmt: 0,
    });
    for (const x of [-R, R])
      put(acc, baseBox(0.9, 0.08, 0.9), [x, PH + 0.1 + legH, 0], S.blue, { aoAmt: 0 });
    for (let k = 0; k < 4; k++)
      put(
        acc,
        new THREE.CylinderGeometry(0.15, 0.15, 0.02, 7),
        [-1.6 + k * 1.07, 0.01, 1.05],
        [S.red, S.yellow, S.blue, S.red][k],
        {
          aoAmt: 0,
        },
      );
  }
  const g = acc.finish(rng, false, true);
  return addHook(g, 'sculpture', { ring: { center: [0, 0, 0.9], radius: 1.6 } });
}

/* ------------------------------------ easel ------------------------------------ */

const SKIES = [
  { sky: '#9FD8F5', hill: '#7BC950', sun: '#FFE45C', house: '#E8735A' },
  { sky: '#FFB6A3', hill: '#B07CE0', sun: '#FFF0B8', house: '#3F7FE8' },
] as const;

/** Outdoor easel: three legs, white canvas with a little landscape (sky, hill, sun, house), palette. */
function easel({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.03);
  const hi = lod === 0;
  const p = SKIES[variant % SKIES.length];
  const cw = 0.86;
  const ch = 0.66;
  const cy = 1.0;
  if (hi) {
    for (const x of [-0.36, 0.36])
      put(acc, cylB(0.025, 0.02, 1.55, 4, true), [x, 0, 0.06], C.deskDark, {
        q: qEuler(-0.1, 0, x > 0 ? -0.06 : 0.06),
        aoAmt: 0.1,
      });
    put(acc, cylB(0.03, 0.025, 1.45, 4, true), [0, 0, -0.34], C.deskDark, {
      q: qEuler(0.22, 0, 0),
      aoAmt: 0.1,
    });
    put(acc, baseBox(0.95, 0.05, 0.14), [0, 0.46, 0.04], C.deskDark, { aoAmt: 0.1 });
    put(acc, baseBox(0.94, 0.05, 0.05), [0, cy + ch + 0.08, -0.03], C.deskDark, { aoAmt: 0 });
  } else {
    put(acc, baseBox(0.08, 1.45, 0.08), [-0.38, 0, 0.0], C.deskDark, { aoAmt: 0.1 });
    put(acc, baseBox(0.08, 1.45, 0.08), [0.38, 0, 0.0], C.deskDark, { aoAmt: 0.1 });
  }
  put(acc, baseBox(cw + 0.08, ch + 0.08, 0.05), [0, cy - 0.04, 0.02], C.white, { aoAmt: 0.05 });
  const face = 0.055;
  const quad = (w: number, h: number, x: number, y: number, c: string, dz = 0): void =>
    put(acc, new THREE.PlaneGeometry(w, h), [x, y, face + dz], c, { aoAmt: 0, ao: () => 1 });
  quad(cw, ch, 0, cy + ch / 2, p.sky);
  // hills (two overlapping triangles-as-quads) and sun, house
  if (hi) {
    const tri = (pts: number[], c: string, dz: number): void => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      put(acc, g, [0, cy, face + dz], c, { aoAmt: 0, ao: () => 1 });
    };
    tri([-cw / 2, 0, 0, cw / 2, 0, 0, -0.05, ch * 0.5, 0], p.hill, 0.002);
    tri([-0.1, 0, 0, cw / 2, 0, 0, cw / 2, ch * 0.4, 0], lerpHex(p.hill, '#3E9A52', 0.4), 0.004);
    put(acc, new THREE.CircleGeometry(0.1, 8), [0.22, cy + ch * 0.76, face + 0.004], p.sun, {
      aoAmt: 0,
      ao: () => 1,
    });
    quad(0.16, 0.12, -0.18, cy + 0.2, p.house, 0.006);
    tri([-0.11, 0, 0, 0.11, 0, 0, 0, 0.09, 0], C.red, 0.007);
    // palette + brush on the ledge
    put(acc, new THREE.CylinderGeometry(0.13, 0.13, 0.02, 8), [0.25, 0.5, 0.12], PAL[0].wall, {
      aoAmt: 0,
    });
    for (const [dx, c] of [
      [0.19, FLOWERS[0]],
      [0.25, FLOWERS[1]],
      [0.31, S.blue],
    ] as const)
      put(acc, new THREE.IcosahedronGeometry(0.025, 0), [dx, 0.525, 0.12], c, { aoAmt: 0 });
    put(acc, cylB(0.01, 0.01, 0.2, 3, true), [-0.3, 0.5, 0.1], WOOD.logs, {
      q: qEuler(0, 0, 1.2),
      aoAmt: 0,
    });
  } else {
    // keep the landscape's colour mass at LOD1
    quad(cw, ch * 0.45, 0, cy + ch * 0.225, p.hill, 0.003);
    quad(0.2, 0.2, 0.22, cy + ch * 0.76, p.sun, 0.004);
  }
  const g = acc.finish(rng, false, true);
  return addHook(g, 'canvas', {
    center: [0, cy + ch / 2, face],
    normal: [0, 0, 1],
    size: [cw, ch],
  });
}

function lerpHex(a: string, b: string, t: number): string {
  return `#${col(a).lerp(col(b), t).getHexString()}`;
}

/* ------------------------------- paintPotPlanter ------------------------------- */

const POTS = [S.red, S.yellow, S.blue] as const;

/** Paint bucket planter: coloured pail with a drip, handle, and a cheerful bunch of blooms. */
function paintPotPlanter({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('pot');
  const acc = jitterAcc(rng, 0.04);
  const hi = lod === 0;
  const c = POTS[variant % POTS.length];
  put(acc, cylB(0.3, 0.36, 0.5, hi ? 10 : 6), [0, 0, 0], c, { aoAmt: 0.2 });
  put(acc, cylB(0.37, 0.37, 0.05, hi ? 10 : 6), [0, 0.45, 0], lerpHex(c, '#FFFFFF', 0.25), {
    aoAmt: 0,
  });
  put(acc, cylB(0.29, 0.29, 0.03, hi ? 10 : 6), [0, 0.47, 0], '#5A3A24', { aoAmt: 0 });
  const mix = [FLOWERS[0], FLOWERS[2], FLOWERS[1]];
  const n = hi ? 7 : 3;
  for (let i = 0; i < n; i++) {
    const a = hi ? r.range(0, TAU) : (i / n) * TAU;
    const rr = hi ? r.range(0.02, 0.2) : 0.12;
    const h = hi ? r.range(0.18, 0.4) : 0.32;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    if (hi) {
      put(acc, cylB(0.012, 0.012, h, 3, true), [x, 0.48, z], '#5DBB63', { aoAmt: 0, windAbs: 0.5 });
      put(acc, new THREE.IcosahedronGeometry(0.075, 0), [x, 0.48 + h, z], mix[i % 3], {
        aoAmt: 0.05,
        windAbs: 0.5,
      });
    } else {
      put(acc, new THREE.IcosahedronGeometry(0.15, 0), [x, 0.48 + 0.26, z], mix[i % 3], {
        aoAmt: 0.05,
        windAbs: 0.5,
      });
    }
  }
  if (!hi)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.4;
      put(
        acc,
        new THREE.ConeGeometry(0.1, 0.2, 3).translate(0, 0.1, 0),
        [Math.cos(a) * 0.24, 0.48, Math.sin(a) * 0.24],
        '#5DBB63',
        {
          aoAmt: 0.1,
          windAbs: 0.4,
        },
      );
    }
  if (hi) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      put(
        acc,
        new THREE.ConeGeometry(0.07, 0.2, 4).translate(0, 0.1, 0),
        [Math.cos(a) * 0.24, 0.48, Math.sin(a) * 0.24],
        '#5DBB63',
        {
          q: qEuler(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6),
          aoAmt: 0.1,
          windAbs: 0.4,
        },
      );
    }
    // rim rivets
    for (let i = 0; i < 6; i++) {
      const a2 = (i / 6) * TAU;
      put(
        acc,
        new THREE.IcosahedronGeometry(0.03, 0),
        [Math.cos(a2) * 0.37, 0.44, Math.sin(a2) * 0.37],
        C.steelLight,
        { aoAmt: 0 },
      );
    }
    // white paint drip down the side + bucket handle
    put(acc, baseBox(0.06, 0.28, 0.04), [0.05, 0.2, 0.33], '#FFFFFF', { aoAmt: 0 });
    put(acc, new THREE.IcosahedronGeometry(0.045, 0), [0.05, 0.2, 0.34], '#FFFFFF', { aoAmt: 0 });
    put(acc, new THREE.TorusGeometry(0.34, 0.015, 3, 12, Math.PI), [0, 0.47, 0], C.steelLight, {
      q: qEuler(0, 0.6, 0),
      aoAmt: 0,
    });
  }
  if (!hi) put(acc, baseBox(0.07, 0.28, 0.05), [0.05, 0.2, 0.33], '#FFFFFF', { aoAmt: 0 });
  return acc.finish(rng, false, true);
}

/* ------------------------------- blossomTree ------------------------------- */

/** Round-tree variant with pink blossom clusters (`BLOSSOM_CANOPY`); same colour ramp at LOD1. */
function blossomTree({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('blossom');
  const acc = new Acc();
  const noise = createNoise(r.fork('n'));
  const H = [4.4, 5.0, 5.8][variant % 3] * r.range(0.96, 1.04);
  const lean = V(r.range(-0.15, 0.15), 0, r.range(-0.15, 0.15));
  const tTop = V(lean.x, H * 0.62, lean.z);
  const t = frustum(V(0, 0, 0), tTop, 0.3, 0.17, lod === 0 ? 8 : 5);
  acc.add(t.geo, { m: t.m, color: col(WOOD.logs), windMul: 0.8, aoAmt: 0.25 });
  const n = 3 + (variant % 3);
  const d = lod === 0 ? 1 : 0;
  const R0 = H * 0.29;
  const fn = gradY([BLOSSOM_CANOPY[0], BLOSSOM_CANOPY[1], BLOSSOM_CANOPY[2]], H * 0.36, H);
  for (let i = 0; i < n; i++) {
    const main = i === 0;
    const rr = main ? R0 : R0 * r.range(0.72, 0.9) * (1 + r.range(-0.15, 0.15) * 0.5);
    const a = (i / (n - 1 || 1)) * TAU + r.range(-0.4, 0.4);
    const off = main ? 0 : R0 * r.range(0.6, 0.85);
    const c = V(
      Math.cos(a) * off + lean.x,
      H * (main ? 0.66 : 0.56 + r.range(0, 0.09)),
      Math.sin(a) * off + lean.z,
    );
    acc.add(blob(rr, d, noise, 0.1, 1.2, i * 3.1), {
      m: mat(c, null, [1, 0.88, 1]),
      color: fn,
      windMul: 1,
      aoAmt: 0.22,
    });
  }
  if (lod === 0) {
    // white-pink blossom dots on the canopy shell
    const dots = r.fork('dots');
    for (let i = 0; i < 12; i++) {
      const a = dots.range(0, TAU);
      const e = dots.range(0.1, 1.0);
      const rad = R0 * 1.05;
      const p = V(
        Math.cos(a) * Math.cos(e) * rad + lean.x,
        H * 0.66 + Math.sin(e) * rad * 0.85,
        Math.sin(a) * Math.cos(e) * rad + lean.z,
      );
      acc.add(new THREE.IcosahedronGeometry(0.12, 0), {
        m: mat(p),
        color: col(i % 3 === 0 ? '#FFFFFF' : BLOSSOM_CANOPY[2]),
        windMul: 1,
        aoAmt: 0,
      });
    }
  }
  return acc.finish(rng, true, true);
}

export const DESIGN_GEO: readonly PropGeoDef[] = [
  {
    id: 'sculptureTorus',
    variants: 1,
    build: sculptureTorus,
    footprint: 1.7,
    height: 4.7,
    windy: false,
  },
  {
    id: 'sculptureStack',
    variants: 1,
    build: sculptureStack,
    footprint: 1.4,
    height: 4.6,
    windy: false,
  },
  {
    id: 'sculptureArch',
    variants: 1,
    build: sculptureArch,
    footprint: 2.4,
    height: 4.2,
    windy: false,
  },
  { id: 'easel', variants: 2, build: easel, footprint: 0.6, height: 1.8, windy: false },
  {
    id: 'paintPotPlanter',
    variants: 3,
    build: paintPotPlanter,
    footprint: 0.4,
    height: 0.92,
    windy: true,
  },
  {
    id: 'blossomTree',
    variants: 3,
    build: blossomTree,
    footprint: 2,
    height: 5,
    heights: [3.9, 4.6, 5.5],
    windy: true,
  },
];
