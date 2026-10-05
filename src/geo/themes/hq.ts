/**
 * hq theme structure geometry (M14b TASK-375): ferryOffice, banner, flowerBed. Defs:
 * content/props-themes/hq.ts. This module also exports the small helpers the other TASK-375 / 377
 * theme modules share (cloth strip, striped buoy body, hook tagging).
 *
 * Rules (D-031 / D-032): LOD1 uses the LOD0 palette and silhouette; variants differ in LOD0 detail
 * only for structures (>= 3 u); small decor may vary colour per variant and LOD1 follows it.
 */
import * as THREE from 'three';
import { FLOWERS, ROCK, WOOD } from '../../content/palette.ts';
import { OFFICE_COLORS as C, OFFICE_PAL } from '../../content/palette-offices.ts';
import { THEMES } from '../../content/themes.ts';
import { col, qEuler, type Acc } from '../kit.ts';
import { glyph } from '../office-kit.ts';
import { V, baseBox, cylB, gableRoof, jitterAcc, put } from '../parts.ts';
import type { BuildOpts, Lod, PropGeoDef } from '../types.ts';

export const lighten = (hex: string, k: number): string =>
  `#${col(hex).lerp(new THREE.Color('#FFFFFF'), k).getHexString()}`;
export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * Hanging cloth strip, top edge at `at`, hanging down `h`, width `w` along local x (yaw about y).
 * Sways from the free end (windAbs ramp). `seg` rows for bending (LOD0), 1 for LOD1.
 */
export function cloth(
  acc: Acc,
  at: THREE.Vector3,
  w: number,
  h: number,
  color: string,
  seg: number,
  yaw = 0,
): void {
  const g = new THREE.PlaneGeometry(w, h, 1, seg).translate(0, -h / 2, 0);
  put(acc, g, at, color, {
    q: qEuler(0, yaw, 0),
    double: true,
    aoAmt: 0,
    ao: () => 1,
    windAbs: (p) => 0.12 + 0.88 * clamp01((at.y - p.y) / h),
  });
}

/** Horizontal pennant pointing +x from a pole at `at` (flies sideways). */
export function pennant(
  acc: Acc,
  at: THREE.Vector3,
  len: number,
  h: number,
  color: string,
  yaw = 0,
): void {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, h / 2, 0, 0, -h / 2, 0, len, 0, 0], 3),
  );
  put(acc, g, at, color, {
    q: qEuler(0, yaw, 0),
    double: true,
    aoAmt: 0,
    ao: () => 1,
    windAbs: (p) => 0.15 + 0.85 * clamp01((p.x - at.x) / len),
  });
}

/** Banded buoy body (capsule) with alternating colours; `bands` stripes up its height. */
export function stripedBuoy(
  acc: Acc,
  at: THREE.Vector3,
  r: number,
  len: number,
  a: string,
  b: string,
  lod: Lod,
  bands = 5,
): void {
  const cap = new THREE.CapsuleGeometry(r, len, lod === 0 ? 3 : 2, lod === 0 ? 10 : 6).translate(
    0,
    r + len / 2,
    0,
  );
  const total = len + 2 * r;
  put(acc, cap, at, (p) => col(Math.floor(((p.y - at.y) / total) * bands) % 2 === 0 ? a : b), {
    aoAmt: 0.15,
    cullY: at.y + 0.02,
  });
}

/** Record a hook (screen face, easel canvas, board...) for later animation systems. */
export function addHook(
  g: THREE.BufferGeometry,
  name: string,
  data: Record<string, unknown>,
): THREE.BufferGeometry {
  const hooks = (g.userData.hooks ??= {}) as Record<string, unknown>;
  hooks[name] = data;
  return g;
}

const HQ = THEMES.hq.accent;
const CREAM = OFFICE_PAL.hq[0].wall;

/* ------------------------------- ferryOffice ------------------------------- */

/**
 * Ferry ticket office on stilts (replaces the stilt hut at the ferry pier). Pivot = water level.
 * Cream cabin, coral roof + striped awning, glowing ticket window, life ring. +z = pier side.
 */
function ferryOffice({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const hi = lod === 0;
  const deckTop = 1.05;
  const wood = WOOD.planks;
  // stilts
  for (const x of [-1.5, 1.5])
    for (const z of [-1.3, 1.3]) {
      put(acc, cylB(0.16, 0.12, deckTop, hi ? 6 : 4, true), [x, 0, z], WOOD.logs, { aoAmt: 0.3 });
      if (hi) put(acc, cylB(0.2, 0.2, 0.1, 6), [x, 0, z], WOOD.dark, { aoAmt: 0.3 });
    }
  if (hi) {
    // cross braces between posts
    for (const z of [-1.3, 1.3])
      put(acc, new THREE.BoxGeometry(3.1, 0.07, 0.07), [0, 0.45, z], WOOD.dark, { aoAmt: 0 });
  }
  // deck
  put(acc, baseBox(3.7, 0.22, 3.2), [0, deckTop - 0.2, 0], wood, { aoAmt: 0.1 });
  if (hi)
    for (let i = 0; i < 6; i++)
      put(acc, baseBox(3.72, 0.02, 0.03), [0, deckTop + 0.02, -1.35 + i * 0.54], WOOD.dock, {
        aoAmt: 0,
      });
  // cabin (cream) with coral gable roof, ridge along x
  const cz = -0.45;
  put(acc, baseBox(2.7, 2.0, 2.0), [0, deckTop + 0.02, cz], CREAM, { aoAmt: 0.18 });
  put(acc, gableRoof(1.25, 1.0, 3.1, 0.16), [0, deckTop + 2.02, cz], HQ, {
    q: qEuler(0, Math.PI / 2, 0),
    aoAmt: 0.05,
  });
  // trim band under the eave
  put(acc, baseBox(2.8, 0.1, 2.1), [0, deckTop + 1.9, cz], OFFICE_PAL.hq[0].trim, { aoAmt: 0 });
  // glowing ticket window + door on the +z face
  const fz = cz + 1.0;
  put(acc, new THREE.PlaneGeometry(1.0, 0.7), [-0.62, deckTop + 1.25, fz + 0.02], C.screenWarm, {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
  put(acc, baseBox(0.75, 1.55, 0.06), [0.78, deckTop + 0.02, fz + 0.03], WOOD.dark, {
    aoAmt: 0.05,
  });
  // striped awning over the window (coral / cream), slanted
  const stripes = hi ? 6 : 2;
  for (let i = 0; i < stripes; i++) {
    const w = 2.4 / stripes;
    put(
      acc,
      baseBox(w, 0.06, 0.8),
      [-1.2 + w * (i + 0.5), deckTop + 1.75, fz + 0.35],
      i % 2 === 0 ? HQ : CREAM,
      { q: qEuler(0.38, 0, 0), aoAmt: 0 },
    );
  }
  // ferry sign on the roof front: coral board with a cream sailboat
  put(acc, baseBox(1.3, 0.55, 0.08), [0, deckTop + 2.7, cz + 0.88], CREAM, {
    q: qEuler(0.45, 0, 0),
    aoAmt: 0,
  });
  put(
    acc,
    new THREE.CylinderGeometry(0.0, 0.2, 0.34, 3).translate(0, 0.17, 0),
    [0.0, deckTop + 2.74, cz + 0.95],
    HQ,
    { aoAmt: 0, q: qEuler(0.45, 0, 0) },
  );
  // life ring on the +x wall
  if (hi) {
    put(acc, new THREE.TorusGeometry(0.26, 0.08, 4, 10), [1.37, deckTop + 1.2, cz], C.red, {
      q: qEuler(0, Math.PI / 2, 0),
      aoAmt: 0,
    });
    // mooring bollards at the +z deck edge
    for (const x of [-1.5, 1.5])
      put(acc, cylB(0.12, 0.1, 0.38, 6), [x, deckTop + 0.02, 1.4], C.steel, { aoAmt: 0.1 });
  }
  // flag pole + pennant (rear-left corner)
  put(acc, cylB(0.05, 0.04, 2.7, 4, true), [-1.55, deckTop + 0.02, -1.35], C.steelLight, {
    aoAmt: 0,
  });
  pennant(acc, V(-1.55, deckTop + 2.55, -1.35), 0.8, 0.45, HQ, 0);
  put(acc, new THREE.IcosahedronGeometry(0.08, 0), [-1.55, deckTop + 2.75, -1.35], C.gold, {
    aoAmt: 0,
  });
  // ladder down to the water at the front-left
  if (hi) {
    for (const dx of [-0.2, 0.2])
      put(acc, cylB(0.04, 0.04, 1.35, 4, true), [-1.15 + dx, 0, 1.75], WOOD.dark, {
        q: qEuler(-0.18, 0, 0),
        aoAmt: 0.1,
      });
    for (let i = 0; i < 4; i++)
      put(
        acc,
        new THREE.BoxGeometry(0.46, 0.05, 0.06),
        [-1.15, 0.2 + i * 0.28, 1.78 - i * 0.05],
        WOOD.planks,
        {
          aoAmt: 0,
        },
      );
    // lamp over the door
    put(
      acc,
      new THREE.IcosahedronGeometry(0.1, 0),
      [0.78, deckTop + 1.75, fz + 0.12],
      C.screenWarm,
      {
        emissive: 1,
        aoAmt: 0,
        ao: () => 1,
      },
    );
    // window frame + counter shelf
    put(acc, baseBox(1.2, 0.08, 0.3), [-0.62, deckTop + 0.85, fz + 0.1], WOOD.logs, { aoAmt: 0.1 });
    // LOD0-only variation: variant 0 = crates + bench, variant 1 = trolley + flower pot
    if (variant === 0) {
      put(acc, baseBox(0.5, 0.4, 0.4), [-1.2, deckTop + 0.02, 1.05], WOOD.logs, { aoAmt: 0.2 });
      put(acc, baseBox(0.4, 0.3, 0.35), [-0.7, deckTop + 0.02, 1.2], WOOD.planks, { aoAmt: 0.2 });
      put(acc, baseBox(1.0, 0.07, 0.34), [1.0, deckTop + 0.36, 1.1], wood, { aoAmt: 0.1 });
      for (const x of [0.6, 1.4])
        put(acc, baseBox(0.07, 0.36, 0.3), [x, deckTop + 0.02, 1.1], WOOD.dark, { aoAmt: 0.1 });
    } else {
      put(acc, baseBox(0.8, 0.07, 0.5), [-1.0, deckTop + 0.3, 1.1], C.steel, { aoAmt: 0 });
      for (const x of [-1.35, -0.65])
        put(acc, new THREE.CylinderGeometry(0.1, 0.1, 0.06, 6), [x, deckTop + 0.12, 1.3], C.dark, {
          q: qEuler(0, 0, Math.PI / 2),
          aoAmt: 0,
        });
      put(acc, cylB(0.17, 0.13, 0.3, 6), [1.0, deckTop + 0.02, 1.15], C.pot, { aoAmt: 0.1 });
      put(acc, new THREE.IcosahedronGeometry(0.2, 0), [1.0, deckTop + 0.5, 1.15], C.plant, {
        aoAmt: 0,
      });
    }
    glyph(acc, 'hq', V(0, deckTop + 1.72, cz - 1.01), Math.PI, 0.4, HQ);
  }
  return acc.finish(rng, false, true);
}

/* ---------------------------------- banner ---------------------------------- */

/** Avenue / harbour street banner: pole, crossbar, hanging coral (v0) or cream (v1) cloth + hub glyph. */
function banner({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.02);
  const hi = lod === 0;
  const bannerC = variant === 0 ? HQ : CREAM;
  const markC = variant === 0 ? CREAM : HQ;
  const H = 3.6;
  put(acc, cylB(0.16, 0.12, 0.18, hi ? 8 : 5), [0, 0, 0], ROCK[0], { aoAmt: 0.2 });
  put(acc, cylB(0.06, 0.045, H, hi ? 6 : 4, true), [0, 0.1, 0], C.steel, { aoAmt: 0.1 });
  put(acc, baseBox(1.15, 0.07, 0.07), [0, H - 0.25, 0], C.steel, { aoAmt: 0 });
  put(acc, new THREE.IcosahedronGeometry(0.1, hi ? 1 : 0), [0, H + 0.12, 0], C.gold, { aoAmt: 0 });
  cloth(acc, V(0, H - 0.28, 0.07), 0.86, 2.1, bannerC, hi ? 6 : 1);
  if (hi) {
    glyph(acc, 'hq', V(0, H - 1.0, 0.1), 0, 0.52, markC);
    for (const x of [-0.35, 0.35])
      put(acc, new THREE.IcosahedronGeometry(0.05, 0), [x, H - 0.24, 0.07], C.gold, { aoAmt: 0 });
    // tassel trim at the bottom
    put(acc, baseBox(0.86, 0.05, 0.02), [0, H - 2.36, 0.1], markC, { aoAmt: 0 });
  } else {
    // keep the hub mark's colour mass at LOD1
    put(acc, new THREE.PlaneGeometry(0.4, 0.4), [0, H - 1.0, 0.09], markC, {
      double: true,
      aoAmt: 0,
      ao: () => 1,
    });
  }
  return acc.finish(rng, false, true);
}

/* --------------------------------- flowerBed --------------------------------- */

const BED_MIX: ReadonlyArray<readonly string[]> = [
  [HQ, '#FFFFFF', '#F09A7E'], // v0 civic: coral / white
  [FLOWERS[0], FLOWERS[1], FLOWERS[3]], // v1 wildflower: pink / yellow / lilac
  [FLOWERS[0], FLOWERS[2], FLOWERS[4], FLOWERS[1]], // v2 mixed
];

/** Low raised flower bed: stone kerb, soil, stemmed blossoms (LOD1: kerb + coloured mounds). */
function flowerBed({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('bed');
  const acc = jitterAcc(rng, 0.03);
  const hi = lod === 0;
  const W = 1.7;
  const D = 0.95;
  const mix = BED_MIX[variant % BED_MIX.length];
  put(acc, baseBox(W, 0.2, D), [0, 0, 0], ROCK[0], { aoAmt: 0.25 });
  put(acc, baseBox(W - 0.22, 0.04, D - 0.22), [0, 0.2, 0], WOOD.dark, { aoAmt: 0.1 });
  const n = hi ? 16 : 5;
  const leaf = col('#5DBB63');
  for (let i = 0; i < n; i++) {
    const x = hi ? r.range(-W / 2 + 0.2, W / 2 - 0.2) : -0.6 + (1.2 * i) / (n - 1);
    const z = hi ? r.range(-D / 2 + 0.2, D / 2 - 0.2) : (i % 2 === 0 ? 1 : -1) * 0.12;
    const h = hi ? r.range(0.18, 0.4) : 0.3;
    const c = mix[i % mix.length];
    if (hi) {
      put(acc, cylB(0.012, 0.012, h, 3, true), [x, 0.22, z], leaf, { aoAmt: 0, windAbs: 0.5 });
      put(acc, new THREE.IcosahedronGeometry(0.075, 0), [x, 0.22 + h, z], c, {
        aoAmt: 0.05,
        windAbs: 0.5,
      });
      put(acc, new THREE.IcosahedronGeometry(0.035, 0), [x, 0.22 + h + 0.03, z], C.gold, {
        aoAmt: 0,
        windAbs: 0.5,
      });
    } else {
      put(acc, new THREE.IcosahedronGeometry(0.17, 0), [x, 0.45, z], c, {
        aoAmt: 0.05,
        windAbs: 0.5,
      });
    }
  }
  if (hi) {
    // foliage tufts
    for (let i = 0; i < 6; i++)
      put(
        acc,
        new THREE.ConeGeometry(0.09, 0.2, 4).translate(0, 0.1, 0),
        [r.range(-W / 2 + 0.15, W / 2 - 0.15), 0.22, r.range(-D / 2 + 0.15, D / 2 - 0.15)],
        leaf,
        { aoAmt: 0.1, windAbs: 0.4 },
      );
  }
  return acc.finish(rng, false, true);
}

export const HQ_GEO: readonly PropGeoDef[] = [
  { id: 'ferryOffice', variants: 2, build: ferryOffice, footprint: 2.4, height: 4.2, windy: true },
  { id: 'banner', variants: 2, build: banner, footprint: 0.6, height: 3.8, windy: true },
  { id: 'flowerBed', variants: 3, build: flowerBed, footprint: 1.0, height: 0.6, windy: true },
];
