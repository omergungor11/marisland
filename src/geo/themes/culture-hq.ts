/**
 * HQ "Liman Loncası / Harbour Guild" kit (M19 TASK-410, ISLAND_CULTURES §2.1): the ferry-harbour
 * and post-office props of Hearthholm. Defs: content/props-themes/hq.ts (appended), ledger:
 * content/cultures/hq.ts (priority order). Geometry only; the placer (wave 2) puts them down.
 *
 *   ferryAwning       pier shelter: striped awning, bench, lifebuoy, lantern, flag      tier 2
 *   guildNoticeBoard  notice board under seven culture pennants (7 cuts x 7 accents)    tier 2
 *   timetableBoard    slate with seven coloured route rows, glows at night              tier 2
 *   bellPost          timber bell post (v0 post + arm, v1 two-post arch)                 tier 2
 *   harbourCrane      small hand crane with winch, hook and a coral crate / sack         tier 2
 *   coffeeCart        push cart: umbrella, espresso machine, urn, chalk menu             tier 2
 *   gullPerch         three lashed mooring stakes, the gull landing spot                 tier 3 noShadow
 *   mailbag           post-office sacks, satchel and letters                             tier 3 noShadow
 *   guildHall         `hqAnnex` variant 2 (`withGuildHall`): bell cote + six side flags
 *
 * Budget rules (ISLAND_CULTURES §4): every def stays under STRUCTURE_MIN_SIZE (3 u) in height and
 * in one plan extent, otherwise the batcher promotes it to tier 0 (`isLargeStructure`) and it
 * costs W11 draw calls. Colours come from the palette tables only (WALLS/ROOFS/WOOD/ROCK/FLOWERS,
 * OFFICE_COLORS, THEMES accents). Everything LOD0 is a solid slab, no bound thinner than 0.12 u.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EMISSIVE, FLOWERS, HAY, ROCK, ROOFS, WALLS, WOOD } from '../../content/palette.ts';
import { OFFICE_COLORS as C, OFFICE_PAL } from '../../content/palette-offices.ts';
import { THEMES } from '../../content/themes.ts';
import { THEME_IDS } from '../../world/types.ts';
import type { PennantCut } from '../../content/cultures/index.ts';
import type { Acc } from '../kit.ts';
import { col, qEuler, qFromTo, type ColorFn } from '../kit.ts';
import {
  V,
  baseBox,
  bevBox,
  cylB,
  jitterAcc,
  lathe,
  put,
  ropePoints,
  tubeAlong,
} from '../parts.ts';
import type { BuildOpts, PropBuilder, PropGeoDef } from '../types.ts';
import { GLYPH_OF_THEME, addGlyph } from './glyphs.ts';
import { addHook, clamp01 } from './hq.ts';
import { ACCENT_OF_THEME, CUT_OF_THEME, cutShape } from './signage.ts';

const CORAL = THEMES.hq.accent;
const CORAL_L = OFFICE_PAL.hq[1].roof;
const CREAM = WALLS[0];
const WHITE = WALLS[1];
const BLUE = ROOFS[5];
const BRASS = C.gold;
const HQ_CUT = CUT_OF_THEME.hq;
const HQ_GLYPH = GLYPH_OF_THEME.hq;

/** The hqAnnex variant index of the guild hall (content HQ_CULTURE_SITE.guildHallVariant pins it). */
export const GUILD_HALL_VARIANT = 2;

/* --------------------------------- helpers --------------------------------- */

/** Straight timber/steel member between two points (square section `w` x `d`). */
export function beam(
  acc: Acc,
  a: THREE.Vector3,
  b: THREE.Vector3,
  w: number,
  color: string | ColorFn,
  d = w,
  aoAmt = 0.1,
): void {
  const dir = b.clone().sub(a);
  put(acc, new THREE.BoxGeometry(w, dir.length(), d), a.clone().add(b).multiplyScalar(0.5), color, {
    q: qFromTo(V(0, 1, 0), dir),
    aoAmt,
  });
}

/** Round rod between two points. */
export function rod(
  acc: Acc,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  color: string,
  seg: number,
): void {
  const dir = b.clone().sub(a);
  put(
    acc,
    new THREE.CylinderGeometry(r, r, dir.length(), seg, 1, false),
    a.clone().add(b).multiplyScalar(0.5),
    color,
    { q: qFromTo(V(0, 1, 0), dir), aoAmt: 0.05 },
  );
}

/** Pennant slab in `cut`, hanging from y = 0, `w` wide and `h` long, 0.08 u thick. */
export function cutSlab(cut: PennantCut, w: number, h: number, hi: boolean): THREE.BufferGeometry {
  const d =
    cut === 'streamer' ? h / 1.55 : cut === 'kite' ? h / 1.05 : cut === 'star' ? h * 0.5 : h;
  return new THREE.ExtrudeGeometry(cutShape(cut, cut === 'streamer' ? w * 1.7 : w, d, hi), {
    depth: 0.08,
    bevelEnabled: false,
    curveSegments: 1,
  }).translate(0, 0, -0.04);
}

/** Pennant hanging from a cord/bar at `at` (top edge on the bar), front face +z, sways from the tip. */
export function hangingFlag(
  acc: Acc,
  at: THREE.Vector3,
  cut: PennantCut,
  color: string,
  w: number,
  h: number,
  hi: boolean,
): void {
  put(acc, cutSlab(cut, w, h, hi), at, color, {
    aoAmt: 0,
    ao: () => 1,
    windAbs: (p) => 0.12 + 0.88 * clamp01((at.y - p.y) / h),
  });
}

/** Pennant flying sideways from a pole at `at` toward +x turned by `yaw`; `len` long, 0.6 `len` wide. */
export function sideFlag(
  acc: Acc,
  at: THREE.Vector3,
  cut: PennantCut,
  color: string,
  len: number,
  yaw: number,
  hi: boolean,
): void {
  const q = qEuler(0, yaw, 0).multiply(qEuler(0, 0, Math.PI / 2));
  put(acc, cutSlab(cut, len * 0.62, len, hi), at, color, {
    q,
    aoAmt: 0,
    ao: () => 1,
    windAbs: (p) => 0.15 + 0.85 * clamp01(Math.hypot(p.x - at.x, p.z - at.z) / len),
  });
}

/**
 * Striped awning slab centred on `at`: stripes run front to back, the front edge (+z) tilts down by
 * `tilt` rad and carries a chevron valance (LOD0).
 */
export function awning(
  acc: Acc,
  at: THREE.Vector3,
  w: number,
  d: number,
  n: number,
  c1: string,
  c2: string,
  tilt: number,
  hi: boolean,
): void {
  const q = qEuler(tilt, 0, 0);
  const sw = w / n;
  const tooth = new THREE.ExtrudeGeometry(cutShape('chevron', sw * 0.98, 0.3, true), {
    depth: 0.08,
    bevelEnabled: false,
    curveSegments: 1,
  }).translate(0, 0, -0.04);
  for (let i = 0; i < n; i++) {
    const lx = -w / 2 + (i + 0.5) * sw;
    const c = i % 2 === 0 ? c1 : c2;
    put(acc, new THREE.BoxGeometry(sw, 0.1, d), at.clone().add(V(lx, 0, 0).applyQuaternion(q)), c, {
      q,
      aoAmt: 0.05,
    });
    if (hi)
      put(acc, tooth, at.clone().add(V(lx, -0.04, d / 2).applyQuaternion(q)), c, { aoAmt: 0 });
  }
}

const dropBlob = (r: number): THREE.BufferGeometry => new THREE.IcosahedronGeometry(r, 0);

/* ------------------------------- ferryAwning ------------------------------- */

/**
 * Pier waiting shelter (2 variants: coral/cream, blue/cream awning). Plank deck, four posts, tilted
 * striped awning with chevron valance, half-height back wall, bench, lifebuoy, hanging lantern, a
 * short flag pole with the HQ swallowtail. +z = water side. Stays under 3 u (no T0 promotion).
 */
function ferryAwning({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const c1 = variant === 0 ? CORAL : BLUE;
  const c2 = CREAM;
  const W = 3.8;
  const D = 2.2;
  const deck = 0.14;
  const postH = 2.3;
  put(acc, baseBox(W, deck, D), [0, 0, 0], WOOD.dock, { aoAmt: 0.15 });
  if (hi)
    for (const z of [-0.55, 0.15, 0.85])
      put(acc, baseBox(W - 0.04, 0.03, 0.05), [0, deck, z], WOOD.dark, { aoAmt: 0 });
  const px = W / 2 - 0.18;
  const pz = D / 2 - 0.18;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      put(acc, cylB(0.1, 0.085, postH, hi ? 6 : 4), [sx * px, deck, sz * pz], WOOD.dark, {
        aoAmt: 0.2,
      });
      if (hi)
        put(
          acc,
          new THREE.IcosahedronGeometry(0.09, 0),
          [sx * px, deck + postH + 0.06, sz * pz],
          BRASS,
          {
            aoAmt: 0,
          },
        );
    }
  awning(acc, V(0, deck + postH + 0.04, 0), W + 0.35, D + 0.3, hi ? 8 : 2, c1, c2, 0.1, hi);
  // half-height back wall with a coral cap rail
  put(acc, baseBox(W - 0.36, 1.05, 0.12), [0, deck, -pz], CREAM, { aoAmt: 0.15 });
  put(acc, baseBox(W - 0.2, 0.1, 0.2), [0, deck + 1.05, -pz], c1, { aoAmt: 0 });
  // bench in front of the wall
  const bz = -pz + 0.4;
  put(acc, baseBox(2.3, 0.08, 0.42), [0, deck + 0.42, bz], WOOD.planks, { aoAmt: 0.1 });
  if (hi) {
    for (const sx of [-1, 1])
      put(acc, baseBox(0.08, 0.42, 0.36), [sx * 1.05, deck, bz], WOOD.dark, { aoAmt: 0.15 });
    put(acc, baseBox(2.3, 0.3, 0.06), [0, deck + 0.7, bz - 0.2], WOOD.planks, {
      q: qEuler(-0.14, 0, 0),
      aoAmt: 0.05,
    });
    // lifebuoy on the front-right post
    put(acc, new THREE.TorusGeometry(0.24, 0.075, 4, 10), [px, deck + 1.5, pz + 0.12], C.red, {
      aoAmt: 0,
    });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      put(
        acc,
        new THREE.BoxGeometry(0.17, 0.09, 0.1),
        [px + Math.cos(a) * 0.24, deck + 1.5 + Math.sin(a) * 0.24, pz + 0.12],
        WHITE,
        { q: qEuler(0, 0, a + Math.PI / 2), aoAmt: 0 },
      );
    }
    // hanging lantern (warm at night)
    const ly = deck + postH - 0.35;
    put(acc, cylB(0.015, 0.015, 0.3, 3, true), [0, ly + 0.05, 0.3], C.steel, { aoAmt: 0 });
    put(acc, dropBlob(0.14), [0, ly - 0.08, 0.3], EMISSIVE.lantern, {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
    // luggage + a sack beside the bench
    put(acc, bevBox(0.5, 0.36, 0.34, 0.04).translate(0, 0.18, 0), [1.45, deck, 0.1], WOOD.logs, {
      aoAmt: 0.2,
    });
    put(acc, baseBox(0.52, 0.06, 0.07), [1.45, deck + 0.18, 0.1], BRASS, { aoAmt: 0 });
    put(
      acc,
      lathe(
        [
          [0, 0],
          [0.22, 0.03],
          [0.26, 0.2],
          [0.18, 0.4],
          [0.07, 0.5],
        ],
        7,
      ),
      [-1.5, deck, 0.3],
      HAY,
      {
        aoAmt: 0.2,
      },
    );
    // coral plaque with the guild bell above the front valance
    put(acc, baseBox(0.6, 0.42, 0.1), [0, deck + postH + 0.12, D / 2 + 0.02], CREAM, { aoAmt: 0 });
    addGlyph(acc, HQ_GLYPH, V(0, deck + postH + 0.33, D / 2 + 0.1), {
      size: 0.34,
      color: CORAL,
      depth: 0.05,
    });
  }
  // flag pole on the back-right post, HQ swallowtail flying outward
  const top = deck + postH + 0.45;
  put(
    acc,
    cylB(0.035, 0.03, top - (deck + postH), 4, true),
    [px, deck + postH, -pz],
    C.steelLight,
    {
      aoAmt: 0,
    },
  );
  sideFlag(acc, V(px, top - 0.2, -pz), HQ_CUT, CORAL, 0.62, 0, hi);
  return acc.finish(rng, true, true);
}

/* ----------------------------- guildNoticeBoard ----------------------------- */

const PAPER = [WALLS[0], HAY, FLOWERS[0], FLOWERS[1], WALLS[2], WALLS[3]] as const;

/**
 * Guild notice board: two posts, cork-brown panel with pinned notes and a blue chart, coral lintel
 * with the bell glyph, and SEVEN pennants on the cross bar - one per culture, each in its own cut and
 * accent (the pennant system of ISLAND_CULTURES §3.3).
 */
function guildNoticeBoard({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const r = rng.fork('notes');
  const px = 1.45;
  const lint = variant === 0 ? CORAL : BLUE;
  for (const s of [-1, 1]) {
    put(acc, baseBox(0.2, 2.5, 0.2), [s * px, 0, 0], WOOD.dark, { aoAmt: 0.2 });
    if (hi) {
      put(acc, baseBox(0.34, 0.12, 0.34), [s * px, 0, 0], ROCK[0], { aoAmt: 0.2 });
      put(acc, new THREE.IcosahedronGeometry(0.12, 0), [s * px, 2.6, 0], BRASS, { aoAmt: 0 });
    }
  }
  // panel + frame
  put(acc, baseBox(2.5, 1.0, 0.12), [0, 0.55, 0], WOOD.planks, { aoAmt: 0.1 });
  if (hi) {
    put(acc, baseBox(2.62, 0.09, 0.2), [0, 0.5, 0], WOOD.logs, { aoAmt: 0.05 });
    put(acc, baseBox(2.62, 0.09, 0.2), [0, 1.5, 0], WOOD.logs, { aoAmt: 0.05 });
  }
  // lintel
  put(acc, baseBox(2.9, 0.26, 0.24), [0, 1.52, 0], lint, { aoAmt: 0.05 });
  if (hi) {
    addGlyph(acc, HQ_GLYPH, V(0, 1.65, 0.12), { size: 0.24, color: CREAM, depth: 0.04 });
    // notes: 3 columns x 2 rows, slightly rotated; pins on top
    let k = variant * 2;
    for (let row = 0; row < 2; row++)
      for (let c = 0; c < 4; c++) {
        if (row === 1 && c === 1 + variant) continue; // gap where the chart hangs
        const x = -0.95 + c * 0.63 + r.range(-0.04, 0.04);
        const y = 0.78 + row * 0.5 + r.range(-0.03, 0.03);
        const colr = PAPER[k++ % PAPER.length];
        put(acc, new THREE.BoxGeometry(0.34, 0.36, 0.03), [x, y, 0.07], colr, {
          q: qEuler(0, 0, r.range(-0.1, 0.1)),
          aoAmt: 0,
        });
        put(acc, new THREE.IcosahedronGeometry(0.035, 0), [x, y + 0.14, 0.1], C.red, { aoAmt: 0 });
      }
    // route chart (blue sheet with a cream compass tick)
    const cx = -0.32 + (1 + variant) * 0.63 - 0.63 + 0.0;
    put(acc, new THREE.BoxGeometry(0.58, 0.4, 0.03), [cx, 1.03, 0.07], BLUE, { aoAmt: 0 });
    put(acc, new THREE.BoxGeometry(0.34, 0.04, 0.03), [cx, 1.03, 0.1], WHITE, { aoAmt: 0 });
    put(acc, new THREE.BoxGeometry(0.04, 0.26, 0.03), [cx, 1.03, 0.1], WHITE, { aoAmt: 0 });
  }
  // cross bar with seven pennants
  const barY = 2.42;
  put(acc, baseBox(3.3, 0.1, 0.1), [0, barY - 0.05, 0], WOOD.logs, { aoAmt: 0 });
  if (hi) {
    const a = V(-1.55, barY + 0.05, 0);
    const b = V(1.55, barY + 0.05, 0);
    put(acc, tubeAlong(ropePoints(a, b, 0.06, 6), 0.02, 3), [0, 0, 0], WOOD.planks, { aoAmt: 0 });
  }
  THEME_IDS.forEach((t, i) => {
    const x = -1.2 + i * 0.4;
    if (hi)
      hangingFlag(
        acc,
        V(x, barY - 0.08, 0.02),
        CUT_OF_THEME[t],
        ACCENT_OF_THEME(t),
        0.34,
        0.66,
        true,
      );
    else
      put(acc, new THREE.BoxGeometry(0.32, 0.5, 0.08), [x, barY - 0.4, 0.02], ACCENT_OF_THEME(t), {
        aoAmt: 0,
      });
  });
  return acc.finish(rng, true, true);
}

/* ------------------------------ timetableBoard ------------------------------ */

/**
 * Timetable slate: two posts, dark slate with a coral header (bell glyph) and seven route rows -
 * a wide accent bar per island (glows at night) with cream time chips. Small pent roof on top
 * (v0 coral, v1 blue; the flat ridge doubles as the sleeping-cat ledge of story spot 1).
 */
function timetableBoard({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const roof = variant === 0 ? CORAL : BLUE;
  const bw = 1.7;
  for (const s of [-1, 1]) {
    put(acc, baseBox(0.14, 1.95, 0.14), [s * (bw / 2 + 0.07), 0, 0], WOOD.dark, { aoAmt: 0.2 });
    if (hi) put(acc, baseBox(0.3, 0.1, 0.3), [s * (bw / 2 + 0.07), 0, 0], ROCK[0], { aoAmt: 0.2 });
  }
  put(acc, baseBox(bw, 1.45, 0.14), [0, 0.42, 0], C.dark, { aoAmt: 0.1 });
  // header band
  put(acc, baseBox(bw, 0.3, 0.2), [0, 1.57, 0], variant === 0 ? CORAL : CREAM, { aoAmt: 0.05 });
  // pent roof / ledge
  put(acc, baseBox(bw + 0.5, 0.1, 0.6), [0, 1.9, 0], roof, { aoAmt: 0.05, q: qEuler(-0.06, 0, 0) });
  if (hi) {
    addGlyph(acc, HQ_GLYPH, V(-0.62, 1.72, 0.1), {
      size: 0.24,
      color: variant === 0 ? CREAM : CORAL,
      depth: 0.04,
    });
    for (let k = 0; k < 3; k++)
      put(
        acc,
        baseBox(0.28, 0.05, 0.05),
        [0.0 + k * 0.34, 1.65, 0.1],
        variant === 0 ? CREAM : CORAL,
        {
          aoAmt: 0,
        },
      );
  }
  // seven rows
  const order = variant === 0 ? THEME_IDS : [...THEME_IDS].reverse();
  order.forEach((t, i) => {
    const y = 1.26 - i * 0.145;
    put(
      acc,
      new THREE.BoxGeometry(0.62, 0.095, 0.05),
      [-0.4, y + 0.035, 0.08],
      ACCENT_OF_THEME(t),
      {
        emissive: 0.8,
        aoAmt: 0,
        ao: () => 1,
      },
    );
    if (hi)
      for (let k = 0; k < 3; k++)
        put(
          acc,
          new THREE.BoxGeometry(0.16, 0.07, 0.04),
          [0.12 + k * 0.23, y + 0.035, 0.08],
          CREAM,
          {
            emissive: 0.5,
            aoAmt: 0,
            ao: () => 1,
          },
        );
  });
  return acc.finish(rng, false, true);
}

/* --------------------------------- bellPost --------------------------------- */

function bell(acc: Acc, at: THREE.Vector3, s: number, hi: boolean): void {
  const prof: ReadonlyArray<readonly [number, number]> = hi
    ? [
        [0.3, 0],
        [0.27, 0.05],
        [0.21, 0.15],
        [0.16, 0.3],
        [0.1, 0.4],
        [0.05, 0.45],
        [0, 0.47],
      ]
    : [
        [0.3, 0],
        [0.16, 0.3],
        [0, 0.47],
      ];
  put(acc, lathe(prof, hi ? 8 : 5).translate(0, -0.47, 0), at, BRASS, { aoAmt: 0.1, s });
  if (hi) {
    put(acc, new THREE.TorusGeometry(0.3, 0.035, 3, 8), at.clone().add(V(0, -0.47 * s, 0)), BRASS, {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0,
      s,
    });
    put(acc, dropBlob(0.07), at.clone().add(V(0, -0.5 * s, 0)), C.dark, { aoAmt: 0 });
  }
}

/**
 * Harbour bell. v0: a single timber post with a bracket arm, the bell under a coral pyramid cap and
 * a pull rope; v1: a two-post arch with the bell on the cross bar under a blue cap. Plaque with the
 * guild bell glyph. `userData.hooks.bell` = swing pivot for the 06:00 Morning Bell mover.
 */
function bellPost({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const cap = variant === 0 ? CORAL : BLUE;
  put(acc, bevBox(0.8, 0.2, 0.8, 0.04).translate(0, 0.1, 0), [0, 0, 0], ROCK[0], { aoAmt: 0.25 });
  let pivot: THREE.Vector3;
  if (variant === 0) {
    put(acc, cylB(0.13, 0.1, 2.15, hi ? 6 : 4), [0, 0.2, 0], WOOD.dark, { aoAmt: 0.2 });
    beam(acc, V(0, 2.3, 0), V(0.8, 2.3, 0), 0.12, WOOD.logs);
    if (hi) beam(acc, V(0.08, 1.7, 0), V(0.62, 2.28, 0), 0.08, WOOD.logs, 0.08, 0);
    pivot = V(0.7, 2.3, 0);
    put(acc, new THREE.ConeGeometry(0.98, 0.42, 4).translate(0, 0.21, 0), [0.38, 2.34, 0], cap, {
      q: qEuler(0, Math.PI / 4, 0),
      aoAmt: 0.05,
    });
  } else {
    for (const s of [-1, 1]) {
      put(acc, cylB(0.12, 0.1, 2.15, hi ? 6 : 4), [s * 0.62, 0.2, 0], WOOD.dark, { aoAmt: 0.2 });
      if (hi) beam(acc, V(s * 0.62, 1.8, 0), V(s * 0.2, 2.3, 0), 0.08, WOOD.logs, 0.08, 0);
    }
    beam(acc, V(-0.72, 2.3, 0), V(0.72, 2.3, 0), 0.13, WOOD.logs);
    pivot = V(0, 2.3, 0);
    put(acc, new THREE.ConeGeometry(1.0, 0.4, 4).translate(0, 0.2, 0), [0, 2.34, 0], cap, {
      q: qEuler(0, Math.PI / 4, 0),
      aoAmt: 0.05,
    });
  }
  bell(acc, pivot.clone().add(V(0, -0.06, 0)), 1, hi);
  if (hi) {
    // pull rope with a knob
    const rx = pivot.x + 0.38;
    put(acc, cylB(0.018, 0.018, 0.8, 3, true), [rx, 1.5, 0.0], CREAM, { aoAmt: 0 });
    put(acc, dropBlob(0.06), [rx, 1.5, 0], CORAL, { aoAmt: 0 });
    // plaque on the front of the (left) post
    const plx = variant === 0 ? 0 : -0.62;
    put(acc, baseBox(0.46, 0.46, 0.08), [plx, 0.85, 0.13], CREAM, { aoAmt: 0 });
    addGlyph(acc, HQ_GLYPH, V(plx, 1.08, 0.21), { size: 0.32, color: CORAL, depth: 0.04 });
  }
  const g = acc.finish(rng, false, true);
  return addHook(g, 'bell', { pivot: [pivot.x, pivot.y - 0.06, pivot.z] });
}

/* ------------------------------- harbourCrane ------------------------------- */

/**
 * Small timber hand crane: stone plinth, mast, lattice jib raised 30 degrees, counterweight, winch
 * with crank, rope to a hook with a coral crate (v0) or a tied sack (v1). Jib points +x.
 */
function harbourCrane({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  put(acc, cylB(0.78, 0.7, 0.34, hi ? 8 : 5), [0, 0, 0], ROCK[0], { aoAmt: 0.25 });
  put(acc, cylB(0.26, 0.2, 1.4, hi ? 8 : 5), [0, 0.34, 0], WOOD.logs, { aoAmt: 0.2 });
  put(acc, cylB(0.3, 0.3, 0.12, hi ? 8 : 5), [0, 1.7, 0], C.steel, { aoAmt: 0.1 });
  const piv = V(0, 1.82, 0);
  const a = (26 * Math.PI) / 180;
  const tip = piv.clone().add(V(Math.cos(a) * 2.25, Math.sin(a) * 2.25, 0));
  // jib: two rails + cross struts (LOD0), single beam (LOD1)
  if (hi) {
    for (const z of [-0.1, 0.1]) {
      beam(
        acc,
        piv.clone().add(V(0, 0, z)),
        tip.clone().add(V(0, 0, z)),
        0.1,
        WOOD.planks,
        0.08,
        0.05,
      );
    }
    for (let i = 1; i <= 4; i++) {
      const p = piv.clone().lerp(tip, i / 5);
      put(acc, new THREE.BoxGeometry(0.06, 0.06, 0.28), p, WOOD.dark, { aoAmt: 0 });
    }
  } else {
    beam(acc, piv, tip, 0.18, WOOD.planks, 0.2, 0.05);
  }
  // counterweight + back stay
  const cw = V(-0.85, 1.74, 0);
  put(
    acc,
    (hi ? bevBox(0.5, 0.42, 0.5, 0.05) : baseBox(0.5, 0.42, 0.5)).translate(0, 0.21, 0),
    cw.clone().add(V(0, -0.4, 0)),
    ROCK[2],
    {
      aoAmt: 0.2,
    },
  );
  beam(acc, piv, cw.clone().add(V(0, 0.02, 0)), 0.1, WOOD.dark, 0.1, 0.05);
  // pulley + rope + hook
  const hookY = 1.22;
  if (hi) {
    put(acc, new THREE.CylinderGeometry(0.11, 0.11, 0.16, 8).rotateX(Math.PI / 2), tip, BRASS, {
      aoAmt: 0,
    });
    put(
      acc,
      tubeAlong(ropePoints(tip.clone().add(V(0.0, -0.1, 0)), V(tip.x, hookY, 0), 0, 2), 0.025, 3),
      [0, 0, 0],
      CREAM,
      { aoAmt: 0 },
    );
  } else {
    put(acc, baseBox(0.07, tip.y - 0.1 - hookY, 0.07), [tip.x, hookY, 0], CREAM, { aoAmt: 0 });
  }
  if (hi)
    put(acc, new THREE.TorusGeometry(0.09, 0.03, 3, 6), [tip.x, hookY - 0.09, 0], C.steel, {
      aoAmt: 0,
    });
  // load
  if (variant === 0) {
    const cy = hookY - 0.12 - 0.27;
    put(
      acc,
      hi ? bevBox(0.54, 0.54, 0.54, 0.05) : new THREE.BoxGeometry(0.54, 0.54, 0.54),
      [tip.x, cy, 0],
      CORAL,
      { aoAmt: 0.15 },
    );
    if (hi) {
      for (const s of [-1, 1])
        put(acc, new THREE.BoxGeometry(0.09, 0.58, 0.58), [tip.x + s * 0.17, cy, 0], WOOD.planks, {
          aoAmt: 0,
        });
      addGlyph(acc, HQ_GLYPH, V(tip.x, cy, 0.28), { size: 0.26, color: CREAM, depth: 0.03 });
    }
  } else {
    put(
      acc,
      lathe(
        [
          [0, 0],
          [0.22, 0.04],
          [0.27, 0.22],
          [0.2, 0.42],
          [0.08, 0.55],
          [0.1, 0.62],
        ],
        hi ? 7 : 5,
      ),
      [tip.x, hookY - 0.12 - 0.62, 0],
      HAY,
      { aoAmt: 0.2 },
    );
  }
  // winch drum + crank on the mast
  const drumC = V(0.0, 0.95, 0.36);
  if (hi) {
    put(
      acc,
      new THREE.CylinderGeometry(0.17, 0.17, 0.5, 8).rotateZ(Math.PI / 2),
      drumC,
      WOOD.dark,
      { aoAmt: 0.1 },
    );
    for (const s of [-1, 1])
      put(
        acc,
        new THREE.CylinderGeometry(0.24, 0.24, 0.05, 8).rotateZ(Math.PI / 2),
        drumC.clone().add(V(s * 0.28, 0, 0)),
        WOOD.logs,
        {
          aoAmt: 0,
        },
      );
    rod(
      acc,
      drumC.clone().add(V(0.3, 0, 0)),
      drumC.clone().add(V(0.3, 0.3, 0.12)),
      0.025,
      C.steel,
      4,
    );
    put(acc, dropBlob(0.06), drumC.clone().add(V(0.3, 0.32, 0.12)), CORAL, { aoAmt: 0 });
    beam(acc, V(0, 0.34, 0.1), drumC.clone().add(V(0, -0.12, -0.05)), 0.1, WOOD.dark, 0.1, 0.1);
  }
  return acc.finish(rng, false, true);
}

/* -------------------------------- coffeeCart -------------------------------- */

/**
 * Push coffee cart: cream body with coral (v0) / blue (v1) panel, two spoked wheels, push handle,
 * counter with espresso machine, urn and cups, chalk menu on the front, striped umbrella over it.
 * +z = serving side. Under 3 u.
 */
function coffeeCart({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const c1 = variant === 0 ? CORAL : BLUE;
  const yB = 0.4;
  put(
    acc,
    hi ? bevBox(1.5, 0.78, 0.95, 0.04).translate(0, 0.39, 0) : baseBox(1.5, 0.78, 0.95),
    [0, yB, 0],
    CREAM,
    { aoAmt: 0.2 },
  );
  put(acc, baseBox(1.54, 0.26, 0.99), [0, yB, 0], c1, { aoAmt: 0.1 });
  const top = yB + 0.78;
  put(acc, baseBox(1.72, 0.08, 1.12), [0, top, 0], WOOD.planks, { aoAmt: 0.05 });
  // wheels (axis x)
  for (const s of [-1, 1]) {
    put(
      acc,
      new THREE.CylinderGeometry(0.4, 0.4, 0.12, hi ? 10 : 5).rotateZ(Math.PI / 2),
      [s * 0.82, 0.4, 0.05],
      WOOD.dark,
      {
        aoAmt: 0.15,
      },
    );
    if (hi)
      put(
        acc,
        new THREE.CylinderGeometry(0.11, 0.11, 0.2, 6).rotateZ(Math.PI / 2),
        [s * 0.82, 0.4, 0.05],
        BRASS,
        { aoAmt: 0 },
      );
  }
  const tb = top + 0.08;
  // umbrella: pole + striped canopy
  put(acc, cylB(0.04, 0.035, 1.25, 4, true), [0.0, tb, -0.3], C.steelLight, { aoAmt: 0 });
  const uc = V(0, tb + 1.2, -0.3);
  const seg = hi ? 8 : 4;
  put(
    acc,
    new THREE.ConeGeometry(1.28, 0.4, seg).translate(0, 0.2, 0),
    uc,
    (p) => {
      const k = Math.floor(((Math.atan2(p.z - uc.z, p.x - uc.x) + Math.PI) / (Math.PI * 2)) * seg);
      return col(k % 2 === 0 ? c1 : CREAM);
    },
    { aoAmt: 0 },
  );
  if (hi) put(acc, dropBlob(0.08), uc.clone().add(V(0, 0.41, 0)), BRASS, { aoAmt: 0 });
  // espresso machine, urn, cups
  put(
    acc,
    (hi
      ? bevBox(0.6, 0.38, 0.34, 0.04)
      : baseBox(0.6, 0.38, 0.34).translate(0, -0.19, 0)
    ).translate(0, 0.19, 0),
    [-0.4, tb, 0.05],
    C.steel,
    { aoAmt: 0.15 },
  );
  put(acc, baseBox(0.64, 0.06, 0.38), [-0.4, tb + 0.38, 0.05], BRASS, { aoAmt: 0 });
  if (hi) {
    for (const x of [-0.55, -0.25])
      put(acc, cylB(0.04, 0.04, 0.12, 4), [x, tb + 0.16, 0.26], C.dark, { aoAmt: 0 });
    put(
      acc,
      lathe(
        [
          [0, 0],
          [0.17, 0.02],
          [0.2, 0.18],
          [0.16, 0.36],
          [0.09, 0.44],
          [0, 0.46],
        ],
        8,
      ),
      [0.38, tb, 0.0],
      BRASS,
      { aoAmt: 0.1 },
    );
    put(acc, cylB(0.025, 0.02, 0.06, 4), [0.38, tb + 0.46, 0], C.dark, { aoAmt: 0 });
    for (const x of [0.0, 0.14, 0.28])
      put(acc, cylB(0.055, 0.07, 0.09, 6), [x, tb, 0.36], WHITE, { aoAmt: 0.1 });
    // chalk menu on the front, chimney pipe at the back
    put(acc, baseBox(0.78, 0.5, 0.06), [0.2, yB + 0.14, 0.51], C.dark, { aoAmt: 0 });
    for (let i = 0; i < 3; i++)
      put(
        acc,
        baseBox(0.5 - i * 0.08, 0.04, 0.03),
        [0.2 - i * 0.04, yB + 0.24 + i * 0.12, 0.55],
        CREAM,
        {
          aoAmt: 0,
        },
      );
    put(acc, cylB(0.06, 0.06, 0.7, 5, true), [0.65, tb, -0.4], C.steel, { aoAmt: 0 });
    put(acc, cylB(0.1, 0.07, 0.06, 5), [0.65, tb + 0.7, -0.4], C.dark, { aoAmt: 0 });
    // push handle + prop leg
    for (const s of [-1, 1]) {
      rod(acc, V(s * 0.55, yB + 0.5, -0.46), V(s * 0.55, yB + 0.62, -1.15), 0.03, WOOD.dark, 4);
    }
    rod(acc, V(-0.55, yB + 0.62, -1.15), V(0.55, yB + 0.62, -1.15), 0.035, WOOD.dark, 4);
    rod(acc, V(0.5, yB + 0.1, 0.4), V(0.5, 0, 0.75), 0.03, WOOD.dark, 4);
  }
  return acc.finish(rng, false, true);
}

/* ---------------------------------- gullPerch ---------------------------------- */

/**
 * Three lashed mooring stakes of different heights, white caps (the gulls' landing spots,
 * `userData.hooks.perches`), a coral paint band and a few guano spots. Tier 3, no shadow.
 */
function gullPerch({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.02);
  const hi = lod === 0;
  const r = rng.fork('guano');
  const stakes: ReadonlyArray<readonly [number, number, number]> =
    variant === 0
      ? [
          [0, 0, 1.05],
          [0.34, 0.12, 1.5],
          [-0.28, 0.2, 1.25],
        ]
      : [
          [0, 0, 1.4],
          [0.36, 0.05, 0.95],
          [-0.32, 0.12, 1.1],
        ];
  const perches: number[][] = [];
  put(acc, new THREE.CylinderGeometry(0.62, 0.7, 0.14, hi ? 8 : 5), [0, 0.07, 0.08], ROCK[0], {
    aoAmt: 0.3,
  });
  for (const [x, z, h] of stakes) {
    put(acc, cylB(0.12, 0.1, h, hi ? 6 : 4), [x, 0.12, z], WOOD.dark, { aoAmt: 0.2 });
    put(acc, cylB(0.17, 0.17, 0.07, hi ? 6 : 4), [x, 0.12 + h, z], WHITE, { aoAmt: 0.05 });
    perches.push([x, 0.12 + h + 0.07, z]);
    if (hi) {
      put(acc, cylB(0.125, 0.125, 0.1, 6), [x, 0.12 + h - 0.22, z], CORAL, { aoAmt: 0 });
      for (let i = 0; i < 2; i++)
        put(
          acc,
          dropBlob(0.035),
          [x + r.range(-0.1, 0.1), 0.12 + h - r.range(0.05, 0.4), z + 0.115],
          WHITE,
          {
            s: [1, 1.8, 0.5],
            aoAmt: 0,
          },
        );
    }
  }
  if (hi) {
    // rope lashing round all three stakes + a coil on the stone
    put(acc, new THREE.TorusGeometry(0.34, 0.03, 3, 10), [0.02, 0.5, 0.1], CREAM, {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0,
    });
    put(acc, new THREE.TorusGeometry(0.15, 0.04, 3, 8), [0.38, 0.17, -0.36], WOOD.planks, {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0,
    });
  }
  return addHook(acc.finish(rng, false, true), 'perches', { points: perches });
}

/* ----------------------------------- mailbag ----------------------------------- */

function sack(
  acc: Acc,
  at: THREE.Vector3,
  s: number,
  color: string,
  tie: string,
  hi: boolean,
  q?: THREE.Quaternion,
): void {
  const prof: ReadonlyArray<readonly [number, number]> = hi
    ? [
        [0, 0],
        [0.26, 0.03],
        [0.34, 0.18],
        [0.3, 0.38],
        [0.17, 0.5],
        [0.08, 0.56],
        [0.12, 0.62],
        [0.2, 0.7],
      ]
    : [
        [0, 0],
        [0.34, 0.18],
        [0.1, 0.55],
        [0.2, 0.7],
      ];
  put(acc, lathe(prof, hi ? 8 : 5), at, color, { aoAmt: 0.2, s, q });
  if (hi)
    put(
      acc,
      cylB(0.115, 0.115, 0.07, 6),
      at.clone().add(V(0, 0.52 * s, 0).applyQuaternion(q ?? new THREE.Quaternion())),
      tie,
      {
        aoAmt: 0,
        s,
        q,
      },
    );
}

/**
 * Post-office pile: three canvas sacks with coral ties (one lying on top), a coral satchel and a
 * fan of letters. v1 swaps the stacking and the sack hues. Tier 3, no shadow.
 */
function mailbag({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.03);
  const hi = lod === 0;
  const r = rng.fork('pile');
  const sacks = variant === 0 ? [HAY, WALLS[3], WALLS[0]] : [WALLS[0], HAY, WALLS[3]];
  const tie = variant === 0 ? CORAL : BLUE;
  sack(acc, V(-0.3, 0, 0.0), 1, sacks[0], tie, hi);
  sack(acc, V(0.32, 0, 0.1), 0.9, sacks[1], tie, hi);
  sack(acc, V(0.0, 0, -0.34), 1.0, sacks[2], tie, hi);
  // sack lying across the top
  sack(
    acc,
    V(0.05, 0.62, 0.0),
    0.8,
    sacks[(1 + variant) % 3],
    tie,
    hi,
    qEuler(0, 0, Math.PI / 2 + r.range(-0.15, 0.15)),
  );
  // satchel at the front
  put(acc, bevBox(0.46, 0.3, 0.16, 0.035).translate(0, 0.15, 0), [0.1, 0, 0.55], CORAL, {
    q: qEuler(0, r.range(-0.3, 0.3), 0),
    aoAmt: 0.15,
  });
  if (hi) {
    put(acc, baseBox(0.48, 0.1, 0.18), [0.1, 0.2, 0.55], CORAL_L, { q: qEuler(0, 0, 0), aoAmt: 0 });
    put(acc, dropBlob(0.04), [0.1, 0.27, 0.65], BRASS, { aoAmt: 0 });
    // letters
    for (let i = 0; i < 3; i++)
      put(
        acc,
        new THREE.BoxGeometry(0.3, 0.02, 0.2),
        [-0.45 + i * 0.07, 0.025 + i * 0.022, 0.56 + i * 0.04],
        i === 1 ? WALLS[2] : CREAM,
        {
          q: qEuler(0, -0.4 + i * 0.35, 0),
          aoAmt: 0,
        },
      );
    addGlyph(acc, HQ_GLYPH, V(-0.3, 0.3, 0.3), { size: 0.2, color: CORAL, depth: 0.03 });
  }
  return acc.finish(rng, false, true);
}

/* ------------------------------- guildHall (hqAnnex v2) ------------------------------- */

const SIDE_CULTURES = THEME_IDS.filter((t) => t !== 'hq');

/**
 * `hqAnnex` variant 2 = the Guild Hall. LOD1 is the existing hqAnnex v1 (the registry maps it
 * through `PropGeoDef.lod1Of`, so the far silhouette is bit-identical, B2). LOD0 = hqAnnex v1 plus
 * a roof-corner bell cote (open arch, bell, coral cap, mast with the HQ swallowtail) and six flag
 * poles on the side plinth, one per other culture (cut + accent each).
 */
function guildHall(base: PropBuilder, { rng, lod }: BuildOpts): THREE.BufferGeometry {
  const g = base({ rng, lod, variant: 1 });
  if (lod === 1) return g;
  const acc = jitterAcc(rng, 0.015);
  const roofY = 5.6;
  const cx = -0.9;
  const cz = -0.9;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      put(acc, cylB(0.06, 0.06, 0.95, 5), [cx + sx * 0.4, roofY, cz + sz * 0.4], WOOD.dark, {
        aoAmt: 0.1,
      });
  put(acc, baseBox(0.96, 0.1, 0.96), [cx, roofY + 0.9, cz], OFFICE_PAL.hq[1].trim, { aoAmt: 0.05 });
  bell(acc, V(cx, roofY + 0.9, cz), 0.7, true);
  put(
    acc,
    new THREE.ConeGeometry(0.78, 0.4, 4).translate(0, 0.2, 0),
    [cx, roofY + 1.0, cz],
    CORAL,
    {
      q: qEuler(0, Math.PI / 4, 0),
      aoAmt: 0.05,
    },
  );
  put(acc, cylB(0.035, 0.03, 1.25, 4, true), [cx, roofY + 1.4, cz], C.steelLight, { aoAmt: 0 });
  put(acc, dropBlob(0.06), [cx, roofY + 2.67, cz], BRASS, { aoAmt: 0 });
  sideFlag(acc, V(cx, roofY + 2.5, cz), HQ_CUT, CORAL, 0.85, 0, true);
  // six side poles, staggered heights so the flags never overlap
  SIDE_CULTURES.forEach((t, i) => {
    const side = i < 3 ? -1 : 1;
    const k = i % 3;
    const z = 0.95 - k * 0.95;
    const h = k === 1 ? 3.15 : 2.45;
    put(acc, cylB(0.05, 0.04, h, 5, true), [side * 1.5, 0.2, z], C.steelLight, { aoAmt: 0.05 });
    put(acc, dropBlob(0.06), [side * 1.5, 0.2 + h + 0.04, z], BRASS, { aoAmt: 0 });
    sideFlag(
      acc,
      V(side * 1.5, 0.2 + h - 0.1, z),
      CUT_OF_THEME[t],
      ACCENT_OF_THEME(t),
      0.75,
      side === 1 ? 0 : Math.PI,
      true,
    );
  });
  const extra = acc.finish(rng, true, true);
  const merged = mergeGeometries([g, extra], false);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  merged.userData = { ...g.userData, tris: merged.getAttribute('position').count / 3 };
  return addHook(merged, 'bell', { pivot: [cx, roofY + 0.9, cz] });
}

/** Wraps the hqAnnex builder so variant `GUILD_HALL_VARIANT` builds the Guild Hall. */
export function withGuildHall(base: PropBuilder): PropBuilder {
  return (o) => (o.variant === GUILD_HALL_VARIANT ? guildHall(base, o) : base(o));
}

export const CULTURE_HQ_GEO: readonly PropGeoDef[] = [
  { id: 'ferryAwning', variants: 2, build: ferryAwning, footprint: 2.1, height: 2.9, windy: true },
  {
    id: 'guildNoticeBoard',
    variants: 2,
    build: guildNoticeBoard,
    footprint: 1.7,
    height: 2.7,
    windy: true,
  },
  {
    id: 'timetableBoard',
    variants: 2,
    build: timetableBoard,
    footprint: 1.1,
    height: 2.0,
    windy: false,
  },
  { id: 'bellPost', variants: 2, build: bellPost, footprint: 0.9, height: 2.75, windy: false },
  {
    id: 'harbourCrane',
    variants: 2,
    build: harbourCrane,
    footprint: 1.5,
    height: 2.8,
    windy: false,
  },
  { id: 'coffeeCart', variants: 2, build: coffeeCart, footprint: 1.2, height: 2.8, windy: false },
  { id: 'gullPerch', variants: 2, build: gullPerch, footprint: 0.6, height: 1.7, windy: false },
  { id: 'mailbag', variants: 2, build: mailbag, footprint: 0.8, height: 0.95, windy: false },
];
