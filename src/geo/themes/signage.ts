/**
 * Pennant & signage kit (M19 TASK-409, ISLAND_CULTURES §3.3): the shared sign language of the
 * archipelago. Every culture has an accent colour (THEMES[t].accent), a pennant CUT and an emblem
 * glyph (glyphs.ts); the same pairing means the same island everywhere.
 *
 *   pennantLine  7 variants = 7 cuts x accent, tier 2; ONE shared LOD1 (identical geometry)
 *   pierSignpost post with up to 7 arrow boards (accent + glyph); variants are fan presets, the
 *                parametric builder `buildPierSignpost` takes real bearings
 *   cargoCrate   7 variants = origin colour + emblem stamp, tier 2; ONE shared LOD1
 *   sailStripe   helper: accent stripe over the sailboat main sail (geo/coastal.ts surface)
 *
 * Everything is >= 0.12 u thick, built from solid slabs, vertex colour only (palette B6: accents
 * from THEMES, neutrals from palette.ts). Defs: content/props-themes/signage.ts.
 */
import * as THREE from 'three';
import { WOOD, ROCK } from '../../content/palette.ts';
import { THEMES } from '../../content/themes.ts';
import { CULTURES, type PennantCut } from '../../content/cultures/index.ts';
import { THEME_IDS, type ThemeId } from '../../world/types.ts';
import { Acc, qEuler } from '../kit.ts';
import { gridSurface } from '../coastal.ts';
import {
  TAU,
  V,
  V2,
  baseBox,
  bevBox,
  cylB,
  jitterAcc,
  put,
  tubeAlong,
  ropePoints,
} from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { GLYPH_OF_THEME, addGlyph } from './glyphs.ts';

/** Slab thickness of every sign part (kit minimum, u). */
export const SIGN_THICK = 0.12;
const CREAM = '#FAFAF5';
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Cut per culture (content/cultures, the single source), index = THEME_IDS. */
export const CUT_OF_THEME: Readonly<Record<ThemeId, PennantCut>> = Object.fromEntries(
  THEME_IDS.map((t) => [t, CULTURES[t].pennant.cut]),
) as Record<ThemeId, PennantCut>;
export const PENNANT_CUTS: readonly PennantCut[] = THEME_IDS.map((t) => CUT_OF_THEME[t]);
export const ACCENT_OF_THEME = (t: ThemeId): string => THEMES[t].accent;

/** Pennant outline hanging from y = 0 (top edge on the cord), centred on x, w wide, <= h tall. */
export function cutShape(cut: PennantCut, w: number, h: number, hi = true): THREE.Shape {
  const hw = w / 2;
  const pts: [number, number][] = [];
  switch (cut) {
    case 'swallowtail':
      pts.push([-hw, 0], [hw, 0], [hw, -h], [0, -h * 0.62], [-hw, -h]);
      break;
    case 'kite':
      pts.push([0, 0], [hw * 1.15, -h * 0.34], [0, -h * 1.05], [-hw * 1.15, -h * 0.34]);
      break;
    case 'square':
      pts.push([-hw, 0], [hw, 0], [hw, -w], [-hw, -w]);
      break;
    case 'streamer': {
      const s = w * 0.2;
      const L = h * 1.55;
      pts.push([-s, 0], [s, 0], [s, -L * 0.8], [0, -L], [-s, -L * 0.8]);
      break;
    }
    case 'chevron':
      pts.push([-hw, 0], [hw, 0], [hw, -h * 0.55], [0, -h], [-hw, -h * 0.55]);
      break;
    case 'scallop': {
      const bottom = -h * 0.72;
      const n = 3;
      const r = w / (2 * n);
      pts.push([-hw, 0], [hw, 0]);
      const seg = hi ? 4 : 2;
      for (let k = 0; k < n; k++) {
        const cx = hw - r - k * 2 * r;
        for (let j = 0; j <= seg; j++) {
          const a = (j / seg) * Math.PI;
          pts.push([cx + Math.cos(a) * r, bottom - Math.sin(a) * r * 1.15]);
        }
      }
      break;
    }
    case 'star': {
      const R = h * 0.55;
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i / 10) * TAU;
        const r = i % 2 === 0 ? R : R * 0.45;
        pts.push([Math.cos(a) * r, Math.sin(a) * r - R]);
      }
      break;
    }
  }
  return new THREE.Shape(pts.map(([x, y]) => V2(x, y)));
}

/** Solid pennant slab, hanging from y = 0, front face +z, SIGN_THICK deep (centred on z = 0). */
function pennantSlab(cut: PennantCut, w: number, h: number, hi: boolean): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(cutShape(cut, w, h, hi), {
    depth: SIGN_THICK,
    bevelEnabled: false,
    curveSegments: 1,
  }).translate(0, 0, -SIGN_THICK / 2);
}

/* ------------------------------- pennantLine ------------------------------- */

const LINE_HALF = 3;
const LINE_TOP = 3.1;
const PENNANTS = 7;

/**
 * Cord between two poles with 7 pennants of the variant's culture cut, alternating accent / cream
 * (cream ones carry the culture glyph at LOD0). Poles at x = +-3, line along x, flags face +-z.
 * LOD1 is culture-neutral on purpose (poles + one slab) so all 7 variants share it.
 */
function pennantLine({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const theme = THEME_IDS[variant % THEME_IDS.length];
  const accent = ACCENT_OF_THEME(theme);
  if (lod === 1) {
    const acc = new Acc();
    for (const s of [-1, 1])
      put(acc, cylB(0.17, 0.13, LINE_TOP + 0.3, 4), [s * LINE_HALF, 0, 0], WOOD.dark, {
        noJitter: true,
        aoAmt: 0.2,
      });
    put(
      acc,
      new THREE.BoxGeometry(LINE_HALF * 2 - 0.4, 0.8, SIGN_THICK),
      [0, LINE_TOP - 1.0, 0],
      '#F2B8A4',
      {
        noJitter: true,
        aoAmt: 0,
      },
    );
    return acc.finish(rng, false, true);
  }
  const acc = jitterAcc(rng, 0.015);
  for (const s of [-1, 1]) {
    put(acc, cylB(0.2, 0.15, 0.3, 6), [s * LINE_HALF, 0, 0], ROCK[0], { aoAmt: 0.3 });
    put(acc, cylB(0.14, 0.1, LINE_TOP + 0.15, 6), [s * LINE_HALF, 0.25, 0], WOOD.dark, {
      aoAmt: 0.2,
    });
    put(acc, new THREE.IcosahedronGeometry(0.17, 0), [s * LINE_HALF, LINE_TOP + 0.55, 0], accent, {
      aoAmt: 0,
    });
  }
  const sag = 0.38;
  const a = V(-LINE_HALF, LINE_TOP + 0.35, 0);
  const b = V(LINE_HALF, LINE_TOP + 0.35, 0);
  put(acc, tubeAlong(ropePoints(a, b, sag, 8), 0.035, 3), [0, 0, 0], WOOD.planks, { aoAmt: 0 });
  const cut = PENNANT_CUTS[THEME_IDS.indexOf(theme)];
  const glyph = GLYPH_OF_THEME[theme];
  for (let i = 0; i < PENNANTS; i++) {
    const t = (i + 0.5) / PENNANTS;
    const x = -LINE_HALF + 0.35 + (LINE_HALF * 2 - 0.7) * t;
    const tt = (x + LINE_HALF) / (LINE_HALF * 2);
    const y = a.y - sag * 4 * tt * (1 - tt) - 0.02;
    const light = i % 2 === 1;
    const h = 0.95;
    const hang =
      cut === 'streamer' ? h * 1.55 : cut === 'kite' ? h * 1.05 : cut === 'square' ? 0.7 : h;
    put(acc, pennantSlab(cut, 0.7, h, true), [x, y, 0], light ? CREAM : accent, {
      aoAmt: 0,
      ao: () => 1,
      windAbs: (p) => 0.12 + 0.88 * clamp01((y - p.y) / hang),
    });
    if (light && cut !== 'streamer')
      addGlyph(acc, glyph, V(x, y - hang * (cut === 'star' ? 0.55 : 0.4), SIGN_THICK / 2), {
        size: 0.34,
        color: accent,
        depth: 0.03,
      });
  }
  return acc.finish(rng, true, true);
}

/* ------------------------------- pierSignpost ------------------------------- */

export interface SignBoard {
  culture: ThemeId;
  /** Yaw in radians about +y applied to a +x-pointing arrow (world dir = (cos b, 0, -sin b)). */
  bearing: number;
}

const BOARD_LEN = 1.5;
const BOARD_H = 0.42;
const BOARD_STEP = 0.47;
const POST_H = 3.5;

function arrowShape(len: number, h: number, tip: number): THREE.Shape {
  const hh = h / 2;
  return new THREE.Shape([
    V2(-0.15, -hh),
    V2(len - tip, -hh),
    V2(len, 0),
    V2(len - tip, hh),
    V2(-0.15, hh),
  ]);
}

/**
 * Pier signpost: a post with one arrow board per destination (at most 7), stacked top-down.
 * Board colour = destination accent, emblem glyph on the tail of both faces. LOD1: post + one
 * flat box per board.
 */
export function buildPierSignpost(
  o: Pick<BuildOpts, 'rng' | 'lod'>,
  boards: readonly SignBoard[],
): THREE.BufferGeometry {
  const hi = o.lod === 0;
  const acc = hi ? jitterAcc(o.rng, 0.012) : new Acc();
  const list = boards.slice(0, 7);
  put(
    acc,
    hi ? bevBox(0.6, 0.3, 0.6, 0.05).translate(0, 0.15, 0) : baseBox(0.5, 0.3, 0.5),
    [0, 0, 0],
    ROCK[1],
    {
      aoAmt: 0.3,
    },
  );
  put(acc, cylB(0.13, 0.1, POST_H, hi ? 6 : 4), [0, 0.2, 0], WOOD.dark, { aoAmt: 0.2 });
  if (hi)
    put(acc, new THREE.ConeGeometry(0.17, 0.3, 6), [0, POST_H + 0.35, 0], WOOD.logs, { aoAmt: 0 });
  list.forEach((b, i) => {
    const y = POST_H - 0.1 - i * BOARD_STEP;
    const q = qEuler(0, b.bearing, 0);
    const accent = ACCENT_OF_THEME(b.culture);
    const slab = hi
      ? new THREE.ExtrudeGeometry(arrowShape(BOARD_LEN, BOARD_H, 0.3), {
          depth: SIGN_THICK,
          bevelEnabled: false,
        }).translate(0, 0, -SIGN_THICK / 2)
      : new THREE.BoxGeometry(BOARD_LEN, BOARD_H, SIGN_THICK).translate(BOARD_LEN / 2 - 0.15, 0, 0);
    put(acc, slab, [0, y, 0], accent, { q, aoAmt: 0, ...(hi ? {} : { noJitter: true }) });
    if (!hi) return;
    for (const side of [1, -1]) {
      const gq = q.clone().multiply(qEuler(0, side === 1 ? 0 : Math.PI, 0));
      const at = V(0.3, 0, side * (SIGN_THICK / 2)).applyQuaternion(q);
      addGlyph(acc, GLYPH_OF_THEME[b.culture], at.add(V(0, y, 0)), {
        q: gq,
        size: 0.3,
        color: CREAM,
        depth: 0.03,
      });
    }
  });
  return acc.finish(o.rng, false, true);
}

/** Fan presets (variants): even spread starting at +x; the same cultures every pier shows. */
function fan(n: number, first: number): SignBoard[] {
  return THEME_IDS.slice(first, first + n).map((culture, i) => ({
    culture,
    bearing: (i / n) * TAU + 0.3,
  }));
}
const SIGNPOST_VARIANTS: readonly (readonly SignBoard[])[] = [fan(7, 0), fan(4, 0), fan(2, 2)];

function pierSignpost({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  return buildPierSignpost({ rng, lod }, SIGNPOST_VARIANTS[variant % SIGNPOST_VARIANTS.length]);
}

/* -------------------------------- cargoCrate -------------------------------- */

const CRATE = 0.72;

/**
 * Origin-coloured cargo crate (variant = culture): accent body, cream corner straps, emblem
 * stamp on the lid and the front. LOD1 is a neutral wood box shared by all 7 variants.
 */
function cargoCrate({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const theme = THEME_IDS[variant % THEME_IDS.length];
  const accent = ACCENT_OF_THEME(theme);
  if (lod === 1) {
    const acc = new Acc();
    put(acc, baseBox(CRATE, CRATE, CRATE), [0, 0, 0], WOOD.planks, { noJitter: true, aoAmt: 0.2 });
    return acc.finish(rng, false, true);
  }
  const acc = new Acc();
  const yaw = rng.range(-0.08, 0.08);
  const q = qEuler(0, yaw, 0);
  const s = CRATE;
  put(acc, bevBox(s, s, s, 0.06), [0, s / 2, 0], accent, { q, aoAmt: 0.2 });
  for (const sx of [-1, 1])
    put(
      acc,
      new THREE.BoxGeometry(0.1, s + 0.04, s + 0.04),
      [sx * (s / 2 - 0.12), s / 2, 0],
      WOOD.planks,
      {
        q,
        aoAmt: 0,
      },
    );
  const glyph = GLYPH_OF_THEME[theme];
  addGlyph(acc, glyph, V(0, s + 0.005, 0).applyQuaternion(q), {
    q: q.clone().multiply(qEuler(-Math.PI / 2, 0, 0)),
    size: 0.4,
    color: CREAM,
    depth: 0.04,
  });
  addGlyph(acc, glyph, V(0, s / 2, s / 2 + 0.005).applyQuaternion(q), {
    q,
    size: 0.3,
    color: CREAM,
    depth: 0.03,
  });
  return acc.finish(rng, false, true);
}

/* -------------------------------- sailStripe -------------------------------- */

export interface SailStripeOpts {
  /** The sailboat main sail's frame (geo/coastal.ts sailboat): mast z, foot y, height, boom length. */
  mastZ: number;
  y0: number;
  H: number;
  Ls: number;
  /** Belly direction, as `variant % 2 ? -1 : 1` in the sailboat builder. */
  flip: 1 | -1;
  /** Stripe band in the sail's v range [0, 1]. */
  v0: number;
  v1: number;
  hi: boolean;
}

/**
 * Accent stripe lying 0.03 u off the main sail on its belly side: same parametric surface as the
 * sailboat's `main` sail, restricted to v0..v1, so it follows the belly exactly. Add it with
 * `double: true` and the sail's windAbs; destination island accent = the stripe colour.
 */
export function sailStripe(o: SailStripeOpts): THREE.BufferGeometry {
  const nu = o.hi ? 4 : 1;
  const nv = o.hi ? 2 : 1;
  return gridSurface(nu, nv, (u, vv) => {
    const v = o.v0 + vv * (o.v1 - o.v0);
    return V(
      0.4 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * o.flip + 0.04 + 0.03 * o.flip,
      o.y0 + v * o.H * (1 - 0.92 * u),
      o.mastZ - 0.06 - u * o.Ls,
    );
  });
}

export const SIGNAGE_GEO: readonly PropGeoDef[] = [
  { id: 'pennantLine', variants: 7, build: pennantLine, footprint: 3.2, height: 4, windy: true },
  { id: 'pierSignpost', variants: 3, build: pierSignpost, footprint: 1.0, height: 4, windy: false },
  { id: 'cargoCrate', variants: 7, build: cargoCrate, footprint: 0.5, height: 0.72, windy: false },
];
