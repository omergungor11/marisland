/**
 * M20 HQ "Seven Gates Crossroads" kit (TASK-465, D-057): the props worldgen (466) and life (469)
 * need to rebuild Hearthholm as the archipelago crossroads. Geometry only, nothing is placed here.
 * Defs and dimensions: content/props-themes/m20.ts; ledger: content/cultures/hq.ts (entries 9-12).
 *
 *   cultureGate     T2  walkable street gate, 7 variants = THEME_IDS order: the culture's accent,
 *                       pennant cut and glyph plaque; `hooks.lamp` = the emissive hanging lantern
 *   goodsStall      T2  market stall under an accent awning, 7 goods variants (parcels, ducks,
 *                       ingots, popcorn, bug jars, glass vases, star charts)
 *   semaphoreTower  T2  white lattice tower, two signal arms (`hooks.arms`, separate vertex ranges),
 *                       night lamp (`hooks.lamp`)
 *   mailLine        T2  cable pylon (v0 high end, v1 low end) + `buildMailCable` between two points
 *
 * Colours: palette tables only (THEMES accents, WALLS / ROCK / WOOD / HAY / FLOWERS / ROOFS,
 * OFFICE_COLORS, OFFICE_PAL, the Design glass kit for the vases). Local frame: ground at y = 0.
 */
import * as THREE from 'three';
import {
  CULTURE_GATE as GATE,
  GOODS_STALL as STALL,
  MAIL_LINE as MAIL,
  SEMAPHORE as SEMA,
  mailCablePoint,
  mailCableSag,
  type Vec3Like,
} from '../../content/props-themes/m20.ts';
import { DESIGN_CULTURE_KIT as DK } from '../../content/props-themes/design.ts';
import { EMISSIVE, FLOWERS, HAY, ROCK, ROOFS, WALLS, WOOD } from '../../content/palette.ts';
import { OFFICE_COLORS as C, OFFICE_PAL } from '../../content/palette-offices.ts';
import { THEMES } from '../../content/themes.ts';
import type { Rng } from '../../core/rng.ts';
import { THEME_IDS, type ThemeId } from '../../world/types.ts';
import { Acc, qEuler } from '../kit.ts';
import { V, baseBox, bevBox, cylB, lathe, put, tubeAlong } from '../parts.ts';
import type { BuildOpts, Lod, PropGeoDef } from '../types.ts';
import { accVerts } from './coding.ts';
import { cultureAcc } from './culture-devops.ts';
import { awning, beam, cutSlab, hangingFlag } from './culture-hq.ts';
import { GLYPH_OF_THEME, addGlyph } from './glyphs.ts';
import { ACCENT_OF_THEME, CUT_OF_THEME } from './signage.ts';

const CORAL = THEMES.hq.accent;
const CREAM = WALLS[0];
const WHITE = WALLS[1];
const BRASS = C.gold;
const ball = (r: number): THREE.BufferGeometry => new THREE.IcosahedronGeometry(r, 0);
const lamp = { emissive: 1, ao: () => 1, aoAmt: 0 } as const;

/** A point through the acc's group transform (jitter), for hooks. */
const through = (acc: Acc, p: THREE.Vector3): number[] => {
  const q = acc.xf ? p.clone().applyMatrix4(acc.xf) : p;
  return [q.x, q.y, q.z];
};

/* -------------------------------- cultureGate -------------------------------- */

/**
 * Street gate of one culture (variant = THEME_IDS index): two cream posts on stone footings, an
 * accent lintel carrying the culture glyph on a cream plaque (both faces), a bracket and a pennant
 * of the culture's cut on each side, a hanging lantern in the passage. Passage along z, clear
 * `CULTURE_GATE.clearWidth` x `clearHeight`. Under 3 u (no T0 promotion). LOD1 keeps the accent.
 */
function cultureGate({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const theme: ThemeId = THEME_IDS[variant % THEME_IDS.length];
  const accent = ACCENT_OF_THEME(theme);
  const cut = CUT_OF_THEME[theme];
  const glyph = GLYPH_OF_THEME[theme];
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const px = GATE.postX;
  const lintelY = GATE.clearHeight;
  if (!hi) {
    // far proxy: posts, lintel and one plaque (tier 2 never draws it; the budget test needs it)
    for (const s of [-1, 1])
      put(acc, baseBox(0.38, lintelY + 0.35, 0.38), [s * px, 0, 0], WHITE, { aoAmt: 0.2 });
    put(acc, baseBox(px * 2 + 0.7, 0.46, 0.44), [0, lintelY, 0], accent, { aoAmt: 0.05 });
    put(acc, baseBox(0.62, 0.4, 0.07), [0, lintelY + 0.03, 0.22], CREAM, { aoAmt: 0 });
    return acc.finish(rng, true, true);
  }
  for (const s of [-1, 1]) {
    put(acc, baseBox(0.64, 0.28, 0.64), [s * px, 0, 0], ROCK[0], { aoAmt: 0.25 });
    put(acc, baseBox(0.38, lintelY + 0.35 - 0.28, 0.38), [s * px, 0.28, 0], WHITE, { aoAmt: 0.2 });
    put(acc, baseBox(0.44, 0.24, 0.44), [s * px, 0.95, 0], accent, { aoAmt: 0 });
    if (hi) put(acc, ball(0.09), [s * px, lintelY + 0.58, 0], BRASS, { aoAmt: 0 });
    // bracket + pennant on the outer face of the post
    const bx = s * (px + 0.19);
    const tipX = s * (px + 0.78);
    beam(acc, V(bx, lintelY + 0.02, 0), V(tipX, lintelY + 0.02, 0), 0.07, WOOD.logs, 0.07, 0);
    hangingFlag(
      acc,
      V(s * (px + 0.5), lintelY - 0.02, 0.02),
      cut,
      s < 0 ? accent : CREAM,
      0.5,
      0.8,
      hi,
    );
    if (hi && s > 0)
      addGlyph(acc, glyph, V(s * (px + 0.5), lintelY - 0.4, 0.07), {
        size: 0.22,
        color: accent,
        depth: 0.03,
      });
  }
  // lintel (accent) with a cream cap rail, a plaque and the glyph on both faces
  put(acc, baseBox(px * 2 + 0.7, 0.46, 0.44), [0, lintelY, 0], accent, { aoAmt: 0.05 });
  put(acc, baseBox(px * 2 + 0.82, 0.08, 0.56), [0, lintelY + 0.46, 0], CREAM, { aoAmt: 0 });
  for (const f of [1, -1]) {
    const q = qEuler(0, f === 1 ? 0 : Math.PI, 0);
    put(acc, baseBox(0.62, 0.4, 0.07), [0, lintelY + 0.03, f * 0.22], CREAM, { aoAmt: 0 });
    addGlyph(acc, glyph, V(0, lintelY + 0.23, f * 0.26), {
      q,
      size: hi ? 0.4 : 0.36,
      color: accent,
      depth: hi ? 0.05 : 0.08,
    });
  }
  // hanging lantern (hooks.lamp): chain, brass cap, glowing glass, base
  const ly = GATE.lampClear;
  const first = accVerts(acc);
  put(acc, baseBox(0.22, 0.24, 0.22), [0, ly, 0], EMISSIVE.lantern, { ...lamp });
  const count = accVerts(acc) - first;
  put(acc, new THREE.ConeGeometry(0.2, 0.14, 4).translate(0, 0.07, 0), [0, ly + 0.24, 0], BRASS, {
    q: qEuler(0, Math.PI / 4, 0),
    aoAmt: 0,
  });
  put(acc, cylB(0.03, 0.03, lintelY - ly - 0.38, 3, true), [0, ly + 0.38, 0], C.steel, {
    aoAmt: 0,
  });
  const g = acc.finish(rng, true, true);
  g.userData.hooks = { lamp: { at: through(acc, V(0, ly + 0.12, 0)), first, count } };
  return g;
}

/* --------------------------------- goodsStall --------------------------------- */

const lathePts = (...p: [number, number][]): ReadonlyArray<readonly [number, number]> => p;

/** The goods of one culture, standing on the counter top `y` at (cx, cz). */
function goods(acc: Acc, theme: ThemeId, y: number, cx: number, cz: number, hi: boolean): void {
  const seg = hi ? 8 : 5;
  switch (theme) {
    case 'hq': {
      // mail parcels: kraft boxes with cream straps + coral labels, and loose letters
      const boxes: [number, number, number, number, string][] = [
        [-0.7, 0, 0.42, 0.3, HAY],
        [-0.2, 0.04, 0.38, 0.34, WOOD.planks],
        [0.3, -0.02, 0.44, 0.28, HAY],
        [-0.45, 0.02, 0.34, 0.26, WOOD.planks],
        [0.72, 0.05, 0.36, 0.3, WALLS[2]],
      ];
      boxes.forEach(([x, z, w, h, c], i) => {
        const yy = i === 3 ? y + 0.3 : y;
        const bxx = i === 3 ? x + 0.05 : x;
        put(acc, bevBox(w, h, 0.34, 0.03).translate(0, h / 2, 0), [cx + bxx, yy, cz + z], c, {
          aoAmt: 0.15,
        });
        if (hi) {
          put(acc, baseBox(0.07, h + 0.02, 0.36), [cx + bxx, yy, cz + z], CREAM, { aoAmt: 0 });
          put(
            acc,
            baseBox(0.14, 0.1, 0.04),
            [cx + bxx + 0.1, yy + h * 0.55, cz + z + 0.18],
            CORAL,
            {
              aoAmt: 0,
            },
          );
        }
      });
      if (hi)
        for (let i = 0; i < 3; i++)
          put(
            acc,
            new THREE.BoxGeometry(0.3, 0.02, 0.2),
            [cx + 0.2 + i * 0.07, y + 0.02 + i * 0.022, cz + 0.28],
            i === 1 ? WALLS[2] : CREAM,
            {
              q: qEuler(0, -0.4 + i * 0.35, 0),
              aoAmt: 0,
            },
          );
      break;
    }
    case 'coding': {
      // rubber ducks in a row
      for (let i = 0; i < 4; i++) {
        const x = cx - 0.75 + i * 0.5;
        const z = cz + (i % 2 === 0 ? 0 : 0.08);
        put(acc, new THREE.IcosahedronGeometry(0.17, hi ? 1 : 0), [x, y + 0.14, z], FLOWERS[1], {
          s: [1.1, 0.85, 1.25],
          aoAmt: 0.1,
        });
        put(
          acc,
          new THREE.IcosahedronGeometry(0.1, hi ? 1 : 0),
          [x, y + 0.34, z + 0.1],
          FLOWERS[1],
          { aoAmt: 0 },
        );
        put(acc, baseBox(0.1, 0.04, 0.09), [x, y + 0.31, z + 0.21], FLOWERS[4], { aoAmt: 0 });
        if (hi) {
          put(acc, ball(0.025), [x - 0.05, y + 0.37, z + 0.17], C.dark, { aoAmt: 0 });
          put(acc, ball(0.025), [x + 0.05, y + 0.37, z + 0.17], C.dark, { aoAmt: 0 });
        }
      }
      break;
    }
    case 'devops': {
      // ingots stacked 3-2-1, the top one glowing
      const ing = (x: number, h: number, c: string, e?: number): void =>
        put(
          acc,
          new THREE.CylinderGeometry(0.17, 0.24, 0.13, 4).rotateY(Math.PI / 4),
          [cx + x, y + h, cz],
          c,
          { s: [1.35, 1, 0.75], aoAmt: 0.1, ...(e ? { emissive: e, ao: () => 1 } : {}) },
        );
      const orange = OFFICE_PAL.devops[0].roof;
      [-0.6, -0.1, 0.4].forEach((x, i) => ing(x, 0.07, i === 1 ? ROCK[1] : orange));
      [-0.35, 0.15].forEach((x) => ing(x, 0.2, orange));
      ing(-0.1, 0.33, OFFICE_PAL.devops[0].trim, 1);
      put(
        acc,
        new THREE.CylinderGeometry(0.15, 0.2, 0.12, 4).rotateY(Math.PI / 4),
        [cx + 0.75, y + 0.06, cz + 0.05],
        ROCK[0],
        { s: [1.35, 1, 0.75], aoAmt: 0.1 },
      );
      break;
    }
    case 'marketing': {
      // striped popcorn tubs, heaped with popcorn
      for (let i = 0; i < 3; i++) {
        const x = cx - 0.6 + i * 0.6;
        const col = (p: THREE.Vector3): THREE.Color =>
          new THREE.Color(
            Math.floor(((Math.atan2(p.z - cz, p.x - x) + Math.PI) / (Math.PI * 2)) * 6) % 2 === 0
              ? OFFICE_PAL.marketing[0].roof
              : CREAM,
          );
        put(
          acc,
          new THREE.CylinderGeometry(0.22, 0.15, 0.36, 6).translate(0, 0.18, 0),
          [x, y, cz],
          col,
          { aoAmt: 0.1 },
        );
        for (let k = 0; k < (hi ? 5 : 2); k++) {
          const a = (k / 5) * Math.PI * 2;
          put(
            acc,
            ball(0.1),
            [x + Math.cos(a) * 0.11, y + 0.4 + (k % 2) * 0.05, cz + Math.sin(a) * 0.11],
            k % 2 ? HAY : WHITE,
            { aoAmt: 0 },
          );
        }
        put(acc, ball(0.12), [x, y + 0.5, cz], WHITE, { aoAmt: 0 });
      }
      break;
    }
    case 'qa': {
      // bug jars: glass jars with a lid and a green bug on top of the rim
      for (let i = 0; i < 4; i++) {
        const x = cx - 0.75 + i * 0.5;
        put(acc, cylB(0.14, 0.14, 0.26, seg), [x, y, cz + (i % 2) * 0.06], C.glass, { aoAmt: 0.1 });
        put(acc, cylB(0.15, 0.15, 0.05, seg), [x, y + 0.26, cz + (i % 2) * 0.06], BRASS, {
          aoAmt: 0,
        });
        put(
          acc,
          new THREE.IcosahedronGeometry(0.1, 0),
          [x, y + 0.38, cz + (i % 2) * 0.06],
          OFFICE_PAL.qa[0].roof,
          { s: [1, 0.8, 1.3], aoAmt: 0 },
        );
        if (hi)
          put(acc, ball(0.025), [x, y + 0.42, cz + (i % 2) * 0.06 + 0.11], C.red, { aoAmt: 0 });
      }
      break;
    }
    case 'design': {
      // glass vases of different shapes in saturated glass hues
      const hues = [DK.glass.ruby, DK.glass.sky, DK.glass.mint, DK.glass.amber];
      const prof = [
        lathePts([0, 0], [0.1, 0.01], [0.13, 0.12], [0.07, 0.24], [0.09, 0.34], [0.05, 0.34]),
        lathePts([0, 0], [0.12, 0.01], [0.16, 0.14], [0.14, 0.26], [0.07, 0.3], [0.04, 0.3]),
        lathePts([0, 0], [0.08, 0.01], [0.09, 0.2], [0.13, 0.4], [0.06, 0.46], [0.03, 0.46]),
        lathePts([0, 0], [0.13, 0.01], [0.17, 0.1], [0.1, 0.2], [0.11, 0.26], [0.06, 0.26]),
      ];
      hues.forEach((c, i) =>
        put(acc, lathe(prof[i], seg), [cx - 0.75 + i * 0.5, y, cz + (i % 2) * 0.05], c, {
          aoAmt: 0.1,
          emissive: 0.6,
          ao: () => 1,
        }),
      );
      break;
    }
    case 'research': {
      // star charts: a framed chart leaning at the back and rolled scrolls lying in front
      put(acc, baseBox(0.8, 0.6, 0.06), [cx - 0.35, y, cz - 0.15], WOOD.logs, {
        q: qEuler(-0.22, 0, 0),
        aoAmt: 0.1,
      });
      put(acc, baseBox(0.68, 0.48, 0.07), [cx - 0.35, y + 0.05, cz - 0.14], ROOFS[5], {
        q: qEuler(-0.22, 0, 0),
        aoAmt: 0,
      });
      if (hi)
        addGlyph(acc, 'star', V(cx - 0.35, y + 0.3, cz - 0.07), {
          q: qEuler(-0.22, 0, 0),
          size: 0.3,
          color: CREAM,
          depth: 0.03,
        });
      const roll = (x: number, z: number, c: string, yaw: number): void => {
        put(
          acc,
          new THREE.CylinderGeometry(0.07, 0.07, 0.55, 6).rotateZ(Math.PI / 2),
          [cx + x, y + 0.07, cz + z],
          c,
          { q: qEuler(0, yaw, 0), aoAmt: 0.1 },
        );
        put(
          acc,
          new THREE.CylinderGeometry(0.075, 0.075, 0.08, 6).rotateZ(Math.PI / 2),
          [cx + x, y + 0.07, cz + z],
          CORAL,
          { q: qEuler(0, yaw, 0), aoAmt: 0 },
        );
      };
      roll(0.45, 0.1, CREAM, 0.2);
      roll(0.5, 0.28, HAY, -0.15);
      roll(0.35, -0.12, WALLS[3], 0.1);
      put(
        acc,
        new THREE.CylinderGeometry(0.09, 0.09, 0.62, 6),
        [cx + 0.85, y + 0.31, cz - 0.05],
        WOOD.dark,
        { aoAmt: 0.1 },
      );
      break;
    }
  }
}

/**
 * Market stall of one culture's goods (variant = THEME_IDS index): timber frame, plank counter with
 * the goods on it, a cream back wall carrying an accent board with the culture glyph, a striped
 * awning in the accent (chevron valance at LOD0). Customer side = +z. Under 3 u.
 */
function goodsStall({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const theme: ThemeId = THEME_IDS[variant % THEME_IDS.length];
  const accent = ACCENT_OF_THEME(theme);
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const W = STALL.width;
  const D = STALL.depth;
  const postH = 2.3;
  const px = W / 2 - 0.1;
  const pz = D / 2 - 0.1;
  if (!hi) {
    put(acc, baseBox(W, 0.1, D), [0, 0, 0], WOOD.dock, { aoAmt: 0.15 });
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        put(acc, baseBox(0.14, postH, 0.14), [sx * px, 0.1, sz * pz], WOOD.dark, { aoAmt: 0.2 });
    put(acc, baseBox(W - 0.3, 0.84, 0.62), [0, 0.1, 0.32], WOOD.planks, { aoAmt: 0.2 });
    put(acc, baseBox(1.2, 0.5, 0.06), [0, 1.2, -pz + 0.08], accent, { aoAmt: 0 });
    put(acc, baseBox(W + 0.35, 0.1, D + 0.3), [0, 0.1 + postH + 0.02, 0], accent, { aoAmt: 0 });
    return acc.finish(rng, true, true);
  }
  // deck, posts
  put(acc, baseBox(W, 0.1, D), [0, 0, 0], WOOD.dock, { aoAmt: 0.15 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      put(acc, cylB(0.075, 0.065, postH, hi ? 6 : 4), [sx * px, 0.1, sz * pz], WOOD.dark, {
        aoAmt: 0.2,
      });
  // back wall, accent board with glyph
  put(acc, baseBox(W - 0.2, 1.5, 0.1), [0, 0.1, -pz + 0.02], CREAM, { aoAmt: 0.15 });
  put(acc, baseBox(1.2, 0.5, 0.06), [0, 1.2, -pz + 0.08], accent, { aoAmt: 0 });
  addGlyph(acc, GLYPH_OF_THEME[theme], V(0, 1.45, -pz + 0.11), {
    size: hi ? 0.38 : 0.42,
    color: CREAM,
    depth: hi ? 0.04 : 0.08,
  });
  // counter: body + top plank, accent skirt
  put(acc, baseBox(W - 0.3, 0.74, 0.62), [0, 0.1, 0.32], WOOD.planks, { aoAmt: 0.2 });
  put(acc, baseBox(W - 0.3 + 0.04, 0.14, 0.66), [0, 0.28, 0.32], accent, { aoAmt: 0 });
  put(acc, baseBox(W - 0.1, 0.07, 0.8), [0, 0.84, 0.3], WOOD.logs, { aoAmt: 0.05 });
  goods(acc, theme, 0.91, 0, 0.32, hi);
  // awning in the accent over the whole stall, front edge down
  awning(acc, V(0, 0.1 + postH + 0.02, 0), W + 0.35, D + 0.3, hi ? 8 : 2, accent, CREAM, 0.13, hi);
  if (hi)
    for (const sx of [-1, 1])
      put(acc, ball(0.08), [sx * px, 0.1 + postH + 0.12, pz], BRASS, { aoAmt: 0 });
  return acc.finish(rng, true, true);
}

/* ------------------------------- semaphoreTower ------------------------------- */

/** One signal arm along +y from the origin: beam, counterweight tail, coral end panel with a cream bar. */
function armParts(acc: Acc, pivot: THREE.Vector3, angle: number, len: number, hi: boolean): void {
  const q = qEuler(0, 0, angle);
  const at = (x: number, y: number, z = 0): THREE.Vector3 =>
    pivot.clone().add(V(x, y, z).applyQuaternion(q));
  put(acc, baseBox(0.15, len + 0.45, 0.1), at(0, -0.45), WHITE, { q, aoAmt: 0 });
  put(acc, baseBox(0.42, 0.85, 0.09), at(0, len - 0.85), CORAL, { q, aoAmt: 0 });
  if (!hi) return;
  put(acc, baseBox(0.46, 0.14, 0.11), at(0, len - 0.5), CREAM, { q, aoAmt: 0 });
  put(acc, baseBox(0.26, 0.26, 0.16), at(0, -0.62), ROCK[2], { q, aoAmt: 0 });
  put(acc, new THREE.CylinderGeometry(0.13, 0.13, 0.14, 8).rotateX(Math.PI / 2), pivot, BRASS, {
    aoAmt: 0,
  });
}

/** Standalone arm (pivot at the origin, pointing +y, plane facing +z) for a mover that draws it itself. */
export function buildSemaphoreArm(rng: Rng, lod: Lod): THREE.BufferGeometry {
  const acc = cultureAcc(rng, lod);
  armParts(acc, V(0, 0, 0), 0, SEMA.armLength, lod === 0);
  return acc.finish(rng, false, true);
}

/**
 * Coastal semaphore: four white lattice legs with coral bands, horizontal rings and X braces,
 * a platform with rail, a mast and cross bar, pins at the bar ends for the two signal arms (drawn
 * by the culture mover, not part of this mesh), and a night lamp on top. Hooks (local frame):
 * `arms[0|1]` = { pivot, axis: [0,0,1], restAngle (rad from +y), length }, `lamp` = { at, first, count }.
 */
function semaphoreTower({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = new Acc(); // no scale jitter: the hook pivots match content SEMAPHORE exactly
  const jit = rng.fork('jit'); // seed variety: leg thickness only
  const base = 0.8;
  const topHalf = 0.32;
  const topY = 6.8;
  const banded = (p: THREE.Vector3): THREE.Color =>
    new THREE.Color(Math.floor(p.y / 1.7) % 2 === 1 ? CORAL : WHITE);
  const corner = (sx: number, sz: number, y: number): THREE.Vector3 => {
    const k = 1 - y / topY;
    const h = topHalf + (base - topHalf) * k;
    return V(sx * h, y, sz * h);
  };
  put(acc, baseBox(2.0, 0.2, 2.0), [0, 0, 0], ROCK[0], { aoAmt: 0.25 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      beam(
        acc,
        corner(sx, sz, 0.2),
        corner(sx, sz, topY),
        0.15 + jit.range(-0.012, 0.012),
        banded,
        0.15,
        0.1,
      );
    }
  const levels = hi ? [0.2, 1.7, 3.4, 5.1, topY] : [topY];
  for (const y of levels) {
    for (const [a, b] of [
      [
        [-1, -1],
        [1, -1],
      ],
      [
        [1, -1],
        [1, 1],
      ],
      [
        [1, 1],
        [-1, 1],
      ],
      [
        [-1, 1],
        [-1, -1],
      ],
    ] as const)
      if (y > 0.3 || hi)
        beam(acc, corner(a[0], a[1], y), corner(b[0], b[1], y), 0.1, WHITE, 0.1, 0);
  }
  for (let l = 0; hi && l + 1 < levels.length; l++)
    for (const [a, b] of [
      [
        [-1, -1],
        [1, -1],
      ],
      [
        [1, -1],
        [1, 1],
      ],
      [
        [1, 1],
        [-1, 1],
      ],
      [
        [-1, 1],
        [-1, -1],
      ],
    ] as const) {
      beam(
        acc,
        corner(a[0], a[1], levels[l]),
        corner(b[0], b[1], levels[l + 1]),
        0.07,
        WHITE,
        0.07,
        0,
      );
      if (hi)
        beam(
          acc,
          corner(b[0], b[1], levels[l]),
          corner(a[0], a[1], levels[l + 1]),
          0.07,
          WHITE,
          0.07,
          0,
        );
    }
  // platform, rail, mast, cross bar
  put(acc, baseBox(1.15, 0.14, 1.15), [0, topY, 0], WOOD.planks, { aoAmt: 0.15 });
  if (hi)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        put(
          acc,
          cylB(0.04, 0.04, 0.5, 4, true),
          [sx * 0.52, topY + 0.14, sz * 0.52],
          C.steelLight,
          { aoAmt: 0 },
        );
  const barY = SEMA.pivotY;
  put(acc, baseBox(0.2, barY - topY + 0.55, 0.2), [0, topY + 0.14, 0], WOOD.logs, { aoAmt: 0.15 });
  put(acc, baseBox(2.9, 0.16, 0.16), [0, barY - 0.08, 0], WOOD.logs, { aoAmt: 0 });
  for (const sx of hi ? SEMA.pivotX : [])
    put(
      acc,
      new THREE.CylinderGeometry(0.05, 0.05, SEMA.pivotZ, 5).rotateX(Math.PI / 2),
      [sx, barY, SEMA.pivotZ / 2],
      C.steel,
      { aoAmt: 0 },
    );
  // The two signal arms are NOT in this mesh (TASK-469): render/culture-movers.ts draws them
  // (PART.arm, a copy of `armParts`) so they can follow the 21:00 relay; only the hooks remain.
  const arms = SEMA.pivotX.map((sx, i) => ({
    pivot: through(acc, V(sx, barY, SEMA.pivotZ)),
    axis: [0, 0, 1],
    restAngle: (SEMA.restDeg[i] * Math.PI) / 180,
    length: SEMA.armLength,
  }));
  // lamp on the mast top
  const lampY = barY + 0.62;
  if (hi) put(acc, cylB(0.04, 0.04, 0.35, 4, true), [0, barY, 0], C.steel, { aoAmt: 0 });
  const first = accVerts(acc);
  put(acc, baseBox(0.28, 0.3, 0.28), [0, lampY, 0], EMISSIVE.lantern, { ...lamp });
  const count = accVerts(acc) - first;
  put(acc, new THREE.ConeGeometry(0.26, 0.2, 4).translate(0, 0.1, 0), [0, lampY + 0.3, 0], CORAL, {
    q: qEuler(0, Math.PI / 4, 0),
    aoAmt: 0,
  });
  const g = acc.finish(rng, false, true);
  g.userData.hooks = { arms, lamp: { at: through(acc, V(0, lampY + 0.15, 0)), first, count } };
  return g;
}

/* ----------------------------------- mailLine ----------------------------------- */

/**
 * Cable pylon. v0 = high end (sorting yard): four tapering legs, a front cross arm with a brass
 * pulley and the cable anchor, a coral cap, a loading ramp with a sack pile BEHIND it. v1 = low end
 * (pier): lower, with a catch basket of sacks under the anchor in front. Front = +z (toward the
 * other pylon). `hooks.cable.anchor` = the local point the cable ends on; `hooks.sack` = the
 * ground-level load / catch station { at } (sacks leave from / arrive at it).
 */
function mailLine({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = new Acc(); // no scale jitter: the anchor matches content MAIL_LINE exactly
  const jit = rng.fork('jit'); // seed variety: leg thickness only
  const H = MAIL.height[variant % 2];
  const anchor = MAIL.anchor[variant % 2];
  const base = 0.62;
  const top = 0.16;
  const corner = (sx: number, sz: number, y: number): THREE.Vector3 => {
    const h = top + (base - top) * (1 - y / H);
    return V(sx * h, y, sz * h);
  };
  put(acc, baseBox(1.7, 0.22, 1.7), [0, 0, 0], ROCK[0], { aoAmt: 0.25 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      beam(
        acc,
        corner(sx, sz, 0.2),
        corner(sx, sz, H - 0.1),
        0.15 + jit.range(-0.012, 0.012),
        WHITE,
        0.15,
        0.1,
      );
    }
  for (const y of hi ? [0.9, 1.9, 2.9].filter((v) => v < H - 0.6) : []) {
    for (const [a, b] of [
      [
        [-1, -1],
        [1, -1],
      ],
      [
        [1, -1],
        [1, 1],
      ],
      [
        [1, 1],
        [-1, 1],
      ],
      [
        [-1, 1],
        [-1, -1],
      ],
    ] as const)
      beam(acc, corner(a[0], a[1], y), corner(b[0], b[1], y), 0.09, WOOD.logs, 0.09, 0);
  }
  // head, cross arm forward, pulley, anchor
  put(acc, baseBox(0.55, 0.3, 0.55), [0, H - 0.2, 0], CORAL, { aoAmt: 0.05 });
  put(acc, new THREE.ConeGeometry(0.46, 0.3, 4).translate(0, 0.15, 0), [0, H + 0.1, 0], CORAL, {
    q: qEuler(0, Math.PI / 4, 0),
    aoAmt: 0,
  });
  beam(acc, V(0, anchor[1] + 0.02, 0), V(0, anchor[1] + 0.02, anchor[2]), 0.14, WOOD.logs, 0.12, 0);
  if (hi) {
    beam(acc, V(0, H - 0.3, 0.1), V(0, anchor[1], anchor[2] - 0.05), 0.07, WOOD.dark, 0.07, 0);
    put(
      acc,
      new THREE.CylinderGeometry(0.14, 0.14, 0.1, 8).rotateZ(Math.PI / 2),
      [0, anchor[1] + 0.02, anchor[2]],
      BRASS,
      { aoAmt: 0 },
    );
    put(acc, ball(0.07), [0, anchor[1] - 0.12, anchor[2]], BRASS, { aoAmt: 0 });
  }
  // the station at the foot
  const sackPts = lathe(
    hi
      ? lathePts(
          [0, 0],
          [0.22, 0.03],
          [0.28, 0.16],
          [0.24, 0.32],
          [0.12, 0.42],
          [0.08, 0.46],
          [0.14, 0.52],
        )
      : lathePts([0, 0], [0.28, 0.16], [0.1, 0.44], [0.14, 0.52]),
    hi ? 7 : 5,
  );
  let station: number[];
  if (variant === 0) {
    // loading ramp behind the pylon with a sack pile; the load spot is its top
    put(acc, baseBox(1.5, 0.3, 1.3), [0, 0, -1.05], WOOD.dock, { aoAmt: 0.2 });
    if (hi) {
      put(acc, baseBox(1.5, 0.08, 0.1), [0, 0.3, -1.65], WOOD.logs, { aoAmt: 0 });
      put(acc, sackPts, [-0.35, 0.3, -1.0], HAY, { aoAmt: 0.2 });
      put(acc, sackPts, [0.3, 0.3, -1.15], WALLS[3], { aoAmt: 0.2, s: 0.9 });
      put(acc, baseBox(0.5, 0.06, 0.4), [0.1, 0.3, -0.6], WOOD.planks, { aoAmt: 0 });
    }
    station = [0, 0.3, -0.95];
  } else {
    // catch basket in front, under the anchor
    put(
      acc,
      hi ? bevBox(1.05, 0.5, 0.9, 0.04).translate(0, 0.25, 0) : baseBox(1.05, 0.5, 0.9),
      [0, 0, 1.0],
      WOOD.planks,
      { aoAmt: 0.2 },
    );
    if (hi) {
      put(acc, baseBox(1.1, 0.07, 0.95), [0, 0.5, 1.0], WOOD.logs, { aoAmt: 0 });
      put(acc, sackPts, [-0.2, 0.5, 1.0], HAY, { aoAmt: 0.15 });
      put(acc, sackPts, [0.22, 0.5, 0.95], WALLS[3], { aoAmt: 0.15, s: 0.85 });
    }
    station = [0, 0.6, 1.0];
  }
  const g = acc.finish(rng, false, true);
  g.userData.hooks = {
    cable: { anchor: through(acc, V(anchor[0], anchor[1], anchor[2])) },
    sack: { at: through(acc, V(station[0], station[1], station[2])) },
  };
  return g;
}

/**
 * The cable of a mail line between two world points (the pylon `hooks.cable.anchor`s after yaw +
 * position). Positions are ABSOLUTE (add the mesh at the origin); vertex colours and attributes as
 * every prop. A parabola of sag `mailCableSag(len)` (same curve as `mailCablePoint`, which the
 * sliding sacks follow); LOD0 adds small coral / cream flags every `MAIL_LINE.flagEvery` u.
 * Wind: only the flags sway.
 */
export function buildMailCable(rng: Rng, a: Vec3Like, b: Vec3Like, lod: Lod): THREE.BufferGeometry {
  const acc = new Acc();
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const n = Math.max(4, Math.ceil(len / (lod === 0 ? 1.4 : 3)));
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const p = mailCablePoint(a, b, i / n);
    return V(p.x, p.y, p.z);
  });
  put(acc, tubeAlong(pts, MAIL.cableRadius, lod === 0 ? 4 : 3), [0, 0, 0], MAIL.cableColor, {
    aoAmt: 0,
    ao: () => 1,
    noJitter: true,
  });
  if (lod === 0) {
    const yaw = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
    const flags = Math.floor(len / MAIL.flagEvery);
    for (let k = 0; k < flags; k++) {
      const t = (k + 0.5) / flags;
      const p = mailCablePoint(a, b, t);
      put(
        acc,
        cutSlab('swallowtail', 0.32, 0.5, true),
        [p.x, p.y - 0.03, p.z],
        k % 2 ? CREAM : CORAL,
        {
          q: qEuler(0, yaw, 0),
          aoAmt: 0,
          ao: () => 1,
          windAbs: (q) => Math.min(1, Math.max(0.1, (p.y - q.y) / 0.5)),
        },
      );
    }
  }
  const g = acc.finish(rng, true, true);
  g.userData.hooks = {
    cable: { from: [a.x, a.y, a.z], to: [b.x, b.y, b.z], sag: mailCableSag(len) },
  };
  return g;
}

/* ----------------------------------- registry ----------------------------------- */

export const M20_HQ_GEO: readonly PropGeoDef[] = [
  { id: 'cultureGate', variants: 7, build: cultureGate, footprint: 2.3, height: 2.87, windy: true },
  { id: 'goodsStall', variants: 7, build: goodsStall, footprint: 1.3, height: 2.6, windy: true },
  {
    id: 'semaphoreTower',
    variants: 1,
    build: semaphoreTower,
    footprint: 1.0,
    height: 8.8,
    windy: false,
  },
  {
    id: 'mailLine',
    variants: 2,
    build: mailLine,
    footprint: 0.9,
    height: 4.0,
    heights: [4.8, 4.0],
    windy: false,
  },
];
