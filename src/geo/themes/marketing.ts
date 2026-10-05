/**
 * marketing theme structure geometry (M14b TASK-375): billboardV2, stage, bannerPole,
 * megaphoneKiosk, adBuoy. Defs: content/props-themes/marketing.ts.
 *
 * Hooks (userData.hooks, read by M14c TASK-384 / TASK-383):
 *  - billboardV2.screen: the emissive-2 board face (slideshow in the screen-class shader branch);
 *    `{ center, size: [w, h], normal: [0, 0, 1] }` in prop-local space.
 *  - stage.stage: the performance deck (camera crew / presenter spot) `{ center, size, top }`.
 */
import * as THREE from 'three';
import { OFFICE_COLORS as C, OFFICE_PAL } from '../../content/palette-offices.ts';
import { THEMES } from '../../content/themes.ts';
import { qEuler } from '../kit.ts';
import { glyph } from '../office-kit.ts';
import { TAU, V, baseBox, cylB, gableRoof, jitterAcc, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { addHook, cloth, lighten, pennant, stripedBuoy } from './hq.ts';
import { accVerts } from './coding.ts';
import { tagSlides } from './surface-tags.ts';

const MK = THEMES.marketing.accent;
const PAL = OFFICE_PAL.marketing;
const CREAM = PAL[0].wall;
const DECK = '#E9D3B3';
const ROPE = '#D9C3A0';

/** Megaphone: neck + flared horn along +z of `yaw`. Horn mouth radius `r`. */
function horn(
  acc: Parameters<typeof put>[0],
  at: THREE.Vector3,
  yaw: number,
  r: number,
  len: number,
  color: string,
  hi: boolean,
): void {
  const q = qEuler(0, yaw, 0).multiply(qEuler(-0.4, 0, 0));
  const g = new THREE.CylinderGeometry(r, r * 0.3, len, hi ? 10 : 6, 1, true);
  put(acc, g, at.clone().add(V(0, 0, len / 2).applyQuaternion(q)), color, {
    q: q.clone().multiply(qEuler(Math.PI / 2, 0, 0)),
    double: true,
    aoAmt: 0.05,
  });
  put(
    acc,
    new THREE.CylinderGeometry(r * 0.34, r * 0.34, len * 0.22, hi ? 8 : 5),
    at.clone().add(V(0, 0, -len * 0.08).applyQuaternion(q)),
    C.dark,
    { q: q.clone().multiply(qEuler(Math.PI / 2, 0, 0)), aoAmt: 0 },
  );
  if (hi)
    put(
      acc,
      new THREE.TorusGeometry(r, r * 0.07, 3, 12),
      at.clone().add(V(0, 0, len).applyQuaternion(q)),
      lighten(color, 0.5),
      { q, aoAmt: 0 },
    );
}

/* ------------------------------- billboardV2 ------------------------------- */

const BB_W = 5.2;
const BB_H = 2.6;
const BB_Y = 2.45;

/** Roadside-style billboard on two posts, 5.2 x 2.6 u board, readable from far; face = screen (emissive 2). */
function billboardV2({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const cy = BB_Y + BB_H / 2;
  put(acc, baseBox(5.0, 0.16, 1.2), [0, 0, 0], C.plinth, { aoAmt: 0.2 });
  for (const x of [-2.0, 2.0]) {
    put(acc, cylB(0.15, 0.12, BB_Y + 0.4, hi ? 8 : 4, true), [x, 0.16, 0], C.deskDark, {
      aoAmt: 0.2,
    });
    if (hi) put(acc, cylB(0.26, 0.26, 0.2, 8), [x, 0.16, 0], C.steel, { aoAmt: 0.1 });
  }
  // frame (cream trim), then the glowing face
  put(acc, baseBox(BB_W + 0.34, BB_H + 0.34, 0.2), [0, BB_Y - 0.17, -0.03], CREAM, { aoAmt: 0.1 });
  const board0 = accVerts(acc);
  put(acc, new THREE.PlaneGeometry(BB_W, BB_H), [0, cy, 0.085], MK, {
    emissive: 2,
    aoAmt: 0,
    ao: () => 1,
  });
  const art0 = accVerts(acc);
  // face art: megaphone mark + copy bars (emissive 2: they belong to the screen content)
  const art = (g: THREE.BufferGeometry, p: THREE.Vector3): void =>
    put(acc, g, p, '#FFFFFF', { emissive: 2, aoAmt: 0, ao: () => 1 });
  if (hi) glyph(acc, 'marketing', V(-1.5, cy, 0.1), 0, 1.7, '#FFFFFF', 2);
  else art(new THREE.PlaneGeometry(1.5, 1.2), V(-1.5, cy, 0.095));
  const bars: ReadonlyArray<readonly [number, number, number]> =
    variant === 0
      ? [
          [0.9, 1.9, 0.34],
          [0.9, 1.4, 0.22],
          [0.9, 0.9, 0.22],
        ]
      : [
          [0.9, 2.0, 0.34],
          [0.9, 1.5, 0.22],
          [0.9, 1.7, 0.22],
        ];
  if (hi) {
    bars.forEach(([x, w, h], i) =>
      art(new THREE.PlaneGeometry(w, h), V(x + (w - 1.9) / 2 + 0.4, cy + 0.6 - i * 0.55, 0.095)),
    );
  } else {
    art(new THREE.PlaneGeometry(1.7, 0.75), V(1.4, cy + 0.15, 0.095));
  }
  const art1 = accVerts(acc);
  if (hi) {
    // catwalk behind the face with a rail, ladder, 4 lamps on arms, back braces
    put(acc, baseBox(BB_W, 0.07, 0.5), [0, BB_Y - 0.55, -0.4], C.steelLight, { aoAmt: 0.05 });
    put(acc, baseBox(BB_W, 0.05, 0.05), [0, BB_Y - 0.0, -0.62], C.steelLight, { aoAmt: 0 });
    for (const x of [-1.95, 1.95])
      put(acc, cylB(0.04, 0.04, 0.55, 4, true), [x, BB_Y - 0.55, -0.62], C.steelLight, {
        aoAmt: 0,
      });
    for (const x of [-1.9, -0.65, 0.65, 1.9]) {
      put(acc, cylB(0.025, 0.025, 0.5, 3, true), [x, BB_Y + BB_H + 0.12, 0.05], C.steel, {
        q: qEuler(0.9, 0, 0),
        aoAmt: 0,
      });
      put(acc, new THREE.ConeGeometry(0.13, 0.2, 5), [x, BB_Y + BB_H + 0.5, 0.38], C.dark, {
        q: qEuler(Math.PI - 0.3, 0, 0),
        aoAmt: 0,
      });
      put(acc, new THREE.IcosahedronGeometry(0.06, 0), [x, BB_Y + BB_H + 0.4, 0.46], C.screenWarm, {
        emissive: 1,
        aoAmt: 0,
        ao: () => 1,
      });
    }
    for (const x of [-2.0, 2.0])
      put(acc, cylB(0.04, 0.04, 1.9, 4, true), [x, 0.1, -0.2], C.deskDark, {
        q: qEuler(-0.5, 0, 0),
        aoAmt: 0,
      });
    // LOD0-only variation: v0 = paint buckets, v1 = a cable reel and cones
    if (variant === 0)
      for (const [x, c] of [
        [-1.4, MK],
        [-1.0, C.gold],
      ] as const)
        put(acc, cylB(0.13, 0.11, 0.2, 6), [x, 0.16, 0.45], c, { aoAmt: 0.1 });
    else {
      put(acc, cylB(0.22, 0.22, 0.18, 8), [1.2, 0.16, 0.4], C.deskDark, { aoAmt: 0.1 });
      put(acc, cylB(0.1, 0.1, 0.2, 6), [1.2, 0.16, 0.4], C.steel, { aoAmt: 0 });
    }
  }
  const g = acc.finish(rng, false, true);
  // TASK-384: slideshow on the board; the art shows on the brand slide only
  tagSlides(g, { first: board0, count: art0 - board0 }, { first: art0, count: art1 - art0 });
  return addHook(g, 'screen', {
    center: [0, cy, 0.085],
    size: [BB_W, BB_H],
    normal: [0, 0, 1],
  });
}

/* ----------------------------------- stage ----------------------------------- */

/** Clifftop stage: wooden deck + steps, truss arch with spotlights, curtain, speaker stacks, mega-horn. */
function stage({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const W = 5.6;
  const D = 4.0;
  const DH = 0.5;
  put(acc, baseBox(W + 0.2, DH, D + 0.2), [0, 0, 0], C.plinth, { aoAmt: 0.25 });
  put(acc, baseBox(W, 0.12, D), [0, DH, 0], DECK, { aoAmt: 0.05 });
  if (hi)
    for (let i = 1; i < 7; i++)
      put(acc, baseBox(0.025, 0.012, D), [-W / 2 + (i * W) / 7, DH + 0.12, 0], '#CDB08A', {
        aoAmt: 0,
      });
  // front steps
  for (let i = 0; i < 2; i++)
    put(
      acc,
      baseBox(1.6, 0.24 + (1 - i) * 0.0, 0.5),
      [W * 0.28, i * 0.25, D / 2 + 0.25 + (1 - i) * 0.4],
      DECK,
      {
        aoAmt: 0.2,
      },
    );
  // truss posts + arch beam (red), curtain behind
  const bz = -D / 2 + 0.35;
  const PH = 3.2;
  for (const x of [-W / 2 + 0.3, W / 2 - 0.3]) {
    put(acc, cylB(0.13, 0.11, PH, hi ? 8 : 4, true), [x, DH + 0.12, bz], C.steel, { aoAmt: 0.1 });
  }
  put(acc, baseBox(W - 0.1, 0.3, 0.3), [0, DH + 0.12 + PH - 0.15, bz], MK, { aoAmt: 0.1 });
  if (hi)
    for (let i = 0; i < 6; i++)
      put(
        acc,
        baseBox(0.05, 0.3, 0.32),
        [-W / 2 + 0.55 + i * 0.9, DH + 0.12 + PH - 0.15, bz],
        CREAM,
        {
          aoAmt: 0,
        },
      );
  const cw = (W - 0.7) / 2;
  for (const sx of [-1, 1])
    cloth(
      acc,
      V(sx * (cw / 2 + 0.05), DH + 0.12 + PH - 0.3, bz + 0.05),
      cw,
      PH - 0.55,
      sx < 0 ? MK : lighten(MK, 0.18),
      hi ? 5 : 1,
    );
  // spotlights on the beam (glow) + a big mega-horn crown
  for (const x of hi ? [-2.0, -0.7, 0.7, 2.0] : [-2.0, 2.0]) {
    put(
      acc,
      new THREE.ConeGeometry(0.15, 0.26, hi ? 6 : 4),
      [x, DH + 0.12 + PH - 0.05, bz + 0.38],
      C.dark,
      {
        q: qEuler(Math.PI - 0.7, 0, 0),
        aoAmt: 0,
      },
    );
    put(
      acc,
      new THREE.IcosahedronGeometry(0.07, 0),
      [x, DH + 0.12 + PH - 0.12, bz + 0.46],
      C.screenWarm,
      {
        emissive: 1,
        aoAmt: 0,
        ao: () => 1,
      },
    );
  }
  horn(acc, V(0, DH + 0.12 + PH + 0.55, bz + 0.1), 0, 0.55, 0.95, C.gold, hi);
  put(acc, cylB(0.06, 0.06, 0.5, 4, true), [0, DH + 0.12 + PH, bz], C.steel, { aoAmt: 0 });
  // speakers and mic stand on the deck
  for (const x of [-W / 2 + 0.7, W / 2 - 0.7])
    put(acc, baseBox(0.62, 1.0, 0.5), [x, DH + 0.12, 0.2], C.dark, { aoAmt: 0.1 });
  if (hi) {
    for (const x of [-W / 2 + 0.7, W / 2 - 0.7])
      for (const y of [0.3, 0.72])
        put(
          acc,
          new THREE.CylinderGeometry(0.16, 0.16, 0.04, 8),
          [x, DH + 0.12 + y, 0.46],
          C.steelLight,
          {
            q: qEuler(Math.PI / 2, 0, 0),
            aoAmt: 0,
          },
        );
    put(acc, cylB(0.025, 0.025, 1.3, 4, true), [0.0, DH + 0.12, 0.6], C.steelLight, { aoAmt: 0 });
    put(acc, new THREE.IcosahedronGeometry(0.07, 0), [0, DH + 0.12 + 1.35, 0.6], C.dark, {
      aoAmt: 0,
    });
    // banner poles with pennants at the front corners
    for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) {
      put(acc, cylB(0.04, 0.035, 2.3, 4, true), [x, DH + 0.12, D / 2 - 0.2], C.steelLight, {
        aoAmt: 0,
      });
      pennant(acc, V(x, DH + 0.12 + 2.1, D / 2 - 0.2), 0.9, 0.5, x < 0 ? C.gold : CREAM, 0);
    }
    // LOD0-only variation: v0 = camera on tripod, v1 = podium
    if (variant === 0) {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU + 0.4;
        put(
          acc,
          cylB(0.025, 0.02, 0.9, 3, true),
          [1.2 + Math.cos(a) * 0.25, DH + 0.12, 1.1 + Math.sin(a) * 0.25],
          C.deskDark,
          {
            q: qEuler(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3),
            aoAmt: 0,
          },
        );
      }
      put(acc, baseBox(0.5, 0.3, 0.3), [1.2, DH + 0.12 + 0.9, 1.1], C.dark, { aoAmt: 0.05 });
      put(
        acc,
        new THREE.CylinderGeometry(0.1, 0.1, 0.18, 6),
        [1.2, DH + 0.12 + 0.95, 1.3],
        C.glass,
        {
          q: qEuler(Math.PI / 2, 0, 0),
          aoAmt: 0,
        },
      );
    } else {
      put(acc, baseBox(0.7, 1.0, 0.45), [-1.4, DH + 0.12, 1.0], CREAM, { aoAmt: 0.1 });
      put(acc, baseBox(0.78, 0.07, 0.52), [-1.4, DH + 0.12 + 1.0, 1.0], MK, { aoAmt: 0 });
    }
  }
  const g = acc.finish(rng, false, true);
  return addHook(g, 'stage', { center: [0, DH + 0.12, 0.3], size: [W, D], top: DH + 0.12 });
}

/* --------------------------------- bannerPole --------------------------------- */

/** Tall accent pole with a string of pennants and a big streamer flag. */
function bannerPole({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.02);
  const hi = lod === 0;
  const H = 5.0;
  const flip = variant === 1;
  const c = flip ? [CREAM, MK, C.gold] : [MK, CREAM, C.gold];
  put(acc, cylB(0.3, 0.24, 0.3, hi ? 8 : 5), [0, 0, 0], C.plinth, { aoAmt: 0.25 });
  put(acc, cylB(0.075, 0.05, H, hi ? 6 : 4, true), [0, 0.3, 0], C.steelLight, { aoAmt: 0.1 });
  put(acc, new THREE.IcosahedronGeometry(0.14, hi ? 1 : 0), [0, H + 0.38, 0], C.gold, { aoAmt: 0 });
  pennant(acc, V(0.05, H + 0.1, 0), 1.6, 0.75, c[0], 0);
  // string of triangular pennants sloping down to a guy point
  const n = hi ? 7 : 2;
  const anchor = V(1.6, 1.5, 0);
  const top = V(0.05, H - 0.4, 0);
  if (hi) {
    const rope = new THREE.CylinderGeometry(0.012, 0.012, top.distanceTo(anchor), 3);
    put(acc, rope, top.clone().add(anchor).multiplyScalar(0.5), ROPE, {
      q: qEuler(0, 0, -Math.atan2(anchor.x - top.x, top.y - anchor.y)),
      aoAmt: 0,
    });
  }
  for (let i = 0; i < n; i++) {
    const t = (i + 0.7) / (n + 0.4);
    const p = top.clone().lerp(anchor, t);
    const g = new THREE.BufferGeometry();
    const w = hi ? 0.34 : 0.7;
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, -0.5, 0], 3),
    );
    put(acc, g, p, c[i % 3], {
      double: true,
      aoAmt: 0,
      ao: () => 1,
      windAbs: (v) => 0.2 + 0.8 * Math.min(1, Math.max(0, (p.y - v.y) / 0.5)),
    });
  }
  if (hi) put(acc, cylB(0.04, 0.04, 0.12, 4), [1.6, 1.45, 0], C.steel, { aoAmt: 0 });
  if (hi)
    for (const y of [0.9, 1.9, 2.9])
      put(acc, cylB(0.09, 0.09, 0.14, 6), [0, y, 0], c[(y | 0) % 3], { aoAmt: 0 });
  return acc.finish(rng, false, true);
}

/* ------------------------------- megaphoneKiosk ------------------------------- */

/** Landing kiosk: counter hut, striped awning, hip-ish roof with a giant megaphone. */
function megaphoneKiosk({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const hi = lod === 0;
  const W = 1.9;
  const D = 1.5;
  const H = 1.7;
  put(acc, baseBox(W + 0.3, 0.16, D + 0.3), [0, 0, 0], C.plinth, { aoAmt: 0.25 });
  put(acc, baseBox(W, H, D), [0, 0.16, 0], PAL[0].wall, { aoAmt: 0.18 });
  put(acc, gableRoof(D / 2 + 0.25, 0.55, W + 0.5, 0.12), [0, 0.16 + H, 0], PAL[0].roof, {
    q: qEuler(0, Math.PI / 2, 0),
    aoAmt: 0.05,
  });
  // serving window (glow) + counter + awning stripes
  put(acc, new THREE.PlaneGeometry(1.1, 0.6), [0, 1.15, D / 2 + 0.01], C.screenWarm, {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
  const n = hi ? 6 : 2;
  for (let i = 0; i < n; i++) {
    const w = (W + 0.3) / n;
    put(
      acc,
      baseBox(w, 0.05, 0.6),
      [-(W + 0.3) / 2 + w * (i + 0.5), 1.62, D / 2 + 0.28],
      i % 2 === 0 ? MK : CREAM,
      {
        q: qEuler(0.35, 0, 0),
        aoAmt: 0,
      },
    );
  }
  put(acc, baseBox(1.3, 0.07, 0.3), [0, 0.76, D / 2 + 0.12], C.deskDark, { aoAmt: 0.1 });
  horn(acc, V(0, 0.16 + H + 0.95, -0.1), 0, 0.5, 0.95, MK, hi);
  put(acc, cylB(0.07, 0.07, 0.8, 4, true), [0, 0.16 + H + 0.2, -0.1], C.steel, { aoAmt: 0 });
  if (hi) {
    put(acc, baseBox(0.42, 0.62, 0.05), [W / 2 - 0.45, 0.5, D / 2 + 0.04], C.dark, { aoAmt: 0.05 });
    // roof ridge cap + eave line
    put(acc, baseBox(W + 0.6, 0.1, 0.16), [0, 0.16 + H + 0.58, 0], CREAM, { aoAmt: 0 });
    for (const z of [-0.5, 0, 0.5])
      put(acc, baseBox(W + 0.52, 0.03, 0.05), [0, 0.16 + H + 0.3, z], PAL[0].trim, { aoAmt: 0 });
    // window frame, side window, lantern, crate
    put(acc, baseBox(1.3, 0.07, 0.07), [0, 1.48, D / 2 + 0.04], CREAM, { aoAmt: 0 });
    for (const x of [-0.62, 0.62])
      put(acc, baseBox(0.07, 0.6, 0.07), [x, 0.85, D / 2 + 0.04], CREAM, { aoAmt: 0 });
    put(acc, new THREE.PlaneGeometry(0.6, 0.5), [W / 2 + 0.01, 1.1, 0.1], C.screenWarm, {
      q: qEuler(0, Math.PI / 2, 0),
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
    put(acc, baseBox(0.4, 0.3, 0.4), [-W / 2 - 0.1, 0.16, 0.2], C.deskDark, { aoAmt: 0.2 });
    put(
      acc,
      new THREE.IcosahedronGeometry(0.09, 0),
      [W / 2 - 0.1, 1.55, D / 2 + 0.05],
      C.screenWarm,
      {
        emissive: 1,
        aoAmt: 0,
        ao: () => 1,
      },
    );
    for (const sx of [-1, 1])
      put(acc, baseBox(0.1, 0.12, D + 0.1), [sx * (W / 2 + 0.02), 0.16 + H - 0.06, 0], CREAM, {
        aoAmt: 0,
      });
    for (const x of [-0.7, 0.7])
      put(acc, cylB(0.04, 0.04, 0.12, 4), [x, 0.78, D / 2 + 0.2], C.gold, { aoAmt: 0 });
    // LOD0-only variation: v0 = leaflet stack, v1 = bunting along the eave
    if (variant === 0)
      put(acc, baseBox(0.3, 0.1, 0.22), [-0.4, 0.83, D / 2 + 0.14], C.white, { aoAmt: 0 });
    else
      for (let i = 0; i < 5; i++)
        put(
          acc,
          new THREE.ConeGeometry(0.1, 0.2, 3),
          [-0.8 + i * 0.4, 1.78, D / 2 + 0.62],
          i % 2 ? C.gold : CREAM,
          {
            q: qEuler(Math.PI, 0, 0),
            aoAmt: 0,
          },
        );
  }
  return acc.finish(rng, false, true);
}

/* ----------------------------------- adBuoy ----------------------------------- */

/** Striped advertising buoy with a little sign plate on a mast. Pivot = water level. */
function adBuoy({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.03);
  const hi = lod === 0;
  const a = variant === 0 ? MK : C.gold;
  const b = variant === 0 ? CREAM : MK;
  stripedBuoy(acc, V(0, 0, 0), 0.32, 0.42, a, b, lod, 5);
  put(acc, cylB(0.035, 0.03, 0.75, 4, true), [0, 1.0, 0], C.steel, { aoAmt: 0 });
  put(acc, baseBox(0.7, 0.42, 0.05), [0, 1.35, 0], a, { aoAmt: 0 });
  if (hi) {
    glyph(acc, 'marketing', V(0, 1.56, 0.04), 0, 0.3, b);
    put(acc, new THREE.TorusGeometry(0.34, 0.05, 4, 12), [0, 0.5, 0], C.steelLight, {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0,
    });
    put(acc, new THREE.IcosahedronGeometry(0.06, 0), [0, 1.62, 0], C.screenWarm, {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
  } else {
    put(acc, baseBox(0.3, 0.2, 0.06), [0, 1.37, 0.03], b, { aoAmt: 0 });
  }
  return acc.finish(rng, false, true);
}

export const MARKETING_GEO: readonly PropGeoDef[] = [
  { id: 'billboardV2', variants: 2, build: billboardV2, footprint: 2.8, height: 5.7, windy: false },
  { id: 'stage', variants: 2, build: stage, footprint: 3.4, height: 5.0, windy: true },
  { id: 'bannerPole', variants: 2, build: bannerPole, footprint: 1.0, height: 5.6, windy: true },
  {
    id: 'megaphoneKiosk',
    variants: 2,
    build: megaphoneKiosk,
    footprint: 1.6,
    height: 3.4,
    windy: false,
  },
  { id: 'adBuoy', variants: 2, build: adBuoy, footprint: 0.5, height: 1.8, windy: false },
];
