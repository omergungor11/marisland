/**
 * Shared ferry-harbour kit geometry (M31 TASK-533, D-112 / D-114). Numbers / palettes:
 * content/themes/harbours.ts. Five pieces, each a PAIR of variants of an existing def (neutral warm
 * cream + harbour red, then the Research white + teal livery), appended after the old variants so
 * every older variant keeps its builder and its seeded bytes:
 *
 *   lighthouse   3 / 4   harbour light, 6.2 u banded tower for a breakwater tip
 *   marketStall  3 / 4   waiting shelter (bench + gable roof, open to +z)
 *   dock         2 / 3   ticket booth (counter window + awning on +z, door on +x)
 *   pierSignpost 3 / 4   timetable board on two posts (ferry glyph header + glyph rows)
 *   barrel       2 / 3   bollard, 0.5 u
 *
 * Local frames (scale 1, +y up, front = +z, pivot on the ground / quay):
 *  - harbour light: hooks lamp { at, r } (the single emissive 1 gem: the island's lamp set; the
 *    `lighthouse` geo is in NIGHT.alwaysOn), beam { at, dir, length, secondsPerRev, tiltDeg } (the
 *    rotating beam hook; the cone itself is a render system), top { y }.
 *  - shelter: hooks bench { at, size, face }, lamp { at, r }, roof { y }.
 *  - booth: hooks window { at, size, dir }, door { at, dir }, lamp { at, r }.
 *  - board: hooks board { center, size, rows: [{ y }] }.
 *  - bollard: hook top { y }.
 *
 * Tier note (D-096): every added variant stays under STRUCTURE_MIN_SIZE (3 u) in height and in at
 * least one plan extent, so the batcher never promotes marketStall / dock / pierSignpost / barrel to
 * T0 because of it (lighthouse is T0 already). A test pins it.
 */
import * as THREE from 'three';
import {
  HARBOUR as F,
  HARBOUR_PAL,
  HARBOUR_VARIANTS as HV,
  type HarbourLivery,
} from '../../content/themes/harbours.ts';
import { col, qEuler, type Acc } from '../kit.ts';
import { TAU, V2, baseBox, cylB, gableRoof, lathe, put } from '../parts.ts';
import type { BuildOpts, PropBuilder, PropGeoDef } from '../types.ts';
import { cultureAcc } from './culture-devops.ts';
import { addHook } from './hq.ts';

const PI = Math.PI;
const lit = { emissive: 1, ao: () => 1, aoAmt: 0, noJitter: true } as const;
const glow = { emissive: 0.75, ao: () => 1, aoAmt: 0, noJitter: true } as const;

/* ================================ harbour light ================================ */

function harbourLight({ rng, lod }: BuildOpts, liv: HarbourLivery): THREE.BufferGeometry {
  const P = HARBOUR_PAL[liv];
  const L = F.light;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const seg = hi ? 10 : 6;
  put(acc, cylB(L.plinth.r, L.plinth.r * 0.9, L.plinth.h, seg), [0, 0, 0], P.stoneDark, {
    aoAmt: 0.25,
  });
  // banded tower: bands alternate accent / wall / accent, each a frustum
  const T = L.tower;
  const radiusAt = (y: number): number =>
    T.rBase + ((y - T.y0) / (T.y1 - T.y0)) * (T.rTop - T.rBase);
  for (let i = 0; i < T.bands; i++) {
    const ya = T.y0 + ((T.y1 - T.y0) * i) / T.bands;
    const yb = T.y0 + ((T.y1 - T.y0) * (i + 1)) / T.bands;
    put(
      acc,
      cylB(radiusAt(ya) + 0.005, radiusAt(yb) + 0.005, yb - ya, seg, !hi),
      [0, ya, 0],
      i % 2 === 0 ? P.accent : P.wall,
      { aoAmt: i === 0 ? 0.2 : 0.05 },
    );
  }
  // door on +z, two slit windows
  put(acc, baseBox(L.door.w, L.door.h, 0.1), [0, T.y0, radiusAt(T.y0 + 0.3) - 0.03], P.accentDeep, {
    aoAmt: 0,
  });
  if (hi)
    for (const y of [2.05, 3.2])
      put(acc, baseBox(0.11, 0.3, 0.08), [0, y, radiusAt(y) - 0.01], P.glass, glow);
  // gallery ring with rail posts + a rail ring
  const G = L.gallery;
  put(acc, cylB(G.r, G.r * 0.8, G.thick, seg), [0, G.y, 0], P.accentDeep, { aoAmt: 0.1 });
  if (hi) {
    for (let k = 0; k < G.posts; k++) {
      const a = (k / G.posts) * TAU;
      put(
        acc,
        cylB(0.025, 0.025, G.rail, 3),
        [Math.cos(a) * (G.r - 0.06), G.y + G.thick, Math.sin(a) * (G.r - 0.06)],
        P.steel,
        { aoAmt: 0 },
      );
    }
    put(
      acc,
      new THREE.TorusGeometry(G.r - 0.06, 0.022, 3, 14),
      [0, G.y + G.thick + G.rail, 0],
      P.steel,
      { q: qEuler(PI / 2, 0, 0), aoAmt: 0 },
    );
  }
  // lamp room: a glowing lens in a four-bar cage under a cone cap
  const M = L.lamp;
  put(
    acc,
    hi ? new THREE.IcosahedronGeometry(M.r, 0) : new THREE.OctahedronGeometry(M.r, 0),
    [0, M.y, 0],
    P.lamp,
    lit,
  );
  put(acc, cylB(0.4, 0.4, 0.06, seg), [0, G.y + G.thick, 0], P.accentDeep, { aoAmt: 0 });
  const roomLo = G.y + G.thick + 0.06;
  const roomH = L.cap.y - roomLo;
  for (const sx of hi ? [-1, 1] : [-1])
    for (const sz of [-1, 1])
      put(
        acc,
        baseBox(hi ? 0.05 : 0.08, roomH, hi ? 0.05 : 0.08),
        [sx * 0.33, roomLo, sz * 0.33],
        P.steel,
        {
          aoAmt: 0,
        },
      );
  if (hi) put(acc, cylB(0.4, 0.4, 0.04, 8), [0, M.y + 0.3, 0], P.accentDeep, { aoAmt: 0 });
  put(
    acc,
    new THREE.ConeGeometry(L.cap.r, L.cap.h, hi ? 10 : 6).translate(0, L.cap.h / 2, 0),
    [0, L.cap.y, 0],
    P.roof,
    { aoAmt: 0 },
  );
  if (hi)
    put(acc, new THREE.IcosahedronGeometry(0.06, 0), [0, L.cap.y + L.cap.h + 0.04, 0], P.brass, {
      aoAmt: 0,
    });
  const geo = acc.finish(rng, false, true);
  addHook(geo, 'lamp', { at: [0, M.y, 0], r: M.r });
  addHook(geo, 'beam', {
    at: [0, M.y, 0],
    dir: [0, 0, 1],
    length: L.beam.length,
    secondsPerRev: L.beam.secondsPerRev,
    tiltDeg: L.beam.tiltDeg,
  });
  return addHook(geo, 'top', { y: L.cap.y + L.cap.h + 0.1 });
}

/* ================================ waiting shelter ================================ */

function shelter({ rng, lod }: BuildOpts, liv: HarbourLivery): THREE.BufferGeometry {
  const P = HARBOUR_PAL[liv];
  const S = F.shelter;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const hw = S.w / 2;
  const hd = S.d / 2;
  const floor = 0.1;
  put(acc, baseBox(S.w + 0.12, floor, S.d + 0.12), [0, 0, 0], P.stone, { aoAmt: 0.2 });
  // back wall (planks) and side half-walls
  put(acc, baseBox(S.w - 0.1, S.wallH - 0.3, 0.09), [0, floor, -hd + 0.05], P.wall, {
    aoAmt: 0.12,
  });
  if (hi)
    for (let i = 0; i < 6; i++)
      put(
        acc,
        baseBox(0.05, S.wallH - 0.5, 0.03),
        [-hw + 0.45 + (i * (S.w - 0.9)) / 5, floor + 0.1, -hd + 0.11],
        P.wood,
        { aoAmt: 0 },
      );
  if (hi)
    for (const sx of [-1, 1])
      put(acc, baseBox(0.08, 0.85, S.d - 0.1), [sx * (hw - 0.06), floor, 0], P.wall, {
        aoAmt: 0.12,
      });
  // corner posts (LOD1: the two front ones)
  for (const sx of [-1, 1])
    for (const sz of hi ? [-1, 1] : [1])
      put(
        acc,
        baseBox(0.13, S.wallH, 0.13),
        [sx * (hw - 0.06), floor, sz * (hd - 0.07)],
        P.accentDeep,
        { aoAmt: 0.1 },
      );
  if (hi) {
    // route plate on the back wall above the bench (livery board, three chalk dashes) + a lifebuoy
    put(acc, baseBox(0.9, 0.5, 0.04), [-0.6, floor + 1.05, -hd + 0.1], P.accentDeep, { aoAmt: 0 });
    for (let i = 0; i < 3; i++)
      put(
        acc,
        baseBox(0.6 - 0.1 * i, 0.06, 0.03),
        [-0.6 - 0.05 * i, floor + 1.37 - i * 0.12, -hd + 0.125],
        P.chalk,
        {
          aoAmt: 0,
          noJitter: true,
        },
      );
    put(
      acc,
      new THREE.TorusGeometry(0.19, 0.06, 4, 10),
      [0.75, floor + 1.25, -hd + 0.14],
      P.accent,
      {
        aoAmt: 0,
      },
    );
    for (const a of [0, PI / 2, PI, -PI / 2])
      put(
        acc,
        baseBox(0.08, 0.08, 0.04),
        [0.75 + Math.cos(a) * 0.19, floor + 1.25 + Math.sin(a) * 0.19, -hd + 0.14],
        P.chalk,
        {
          aoAmt: 0,
          noJitter: true,
        },
      );
  }
  // bench: seat, two legs, backrest slat (LOD0)
  const B = S.bench;
  const bz = -hd + B.deep / 2 + 0.12;
  put(acc, baseBox(S.w - 0.5, 0.07, B.deep), [0, floor + B.h - 0.07, bz], P.wood, { aoAmt: 0.1 });
  if (hi)
    for (const sx of [-1, 1])
      put(acc, baseBox(0.07, B.h - 0.07, B.deep - 0.1), [sx * (hw - 0.4), floor, bz], P.woodDark, {
        aoAmt: 0.15,
      });
  if (hi)
    put(acc, baseBox(S.w - 0.5, 0.2, 0.05), [0, floor + B.h + 0.14, -hd + 0.15], P.wood, {
      aoAmt: 0,
    });
  // gable roof along x (ridge along x): a gableRoof built along z, turned a quarter
  const rh = S.roofRise;
  put(acc, gableRoof(hd + 0.3, rh, S.w + 0.5), [0, floor + S.wallH, 0], P.roof, {
    q: qEuler(0, PI / 2, 0),
    aoAmt: 0,
  });
  if (hi)
    put(acc, baseBox(S.w + 0.5, 0.1, 0.07), [0, floor + S.wallH - 0.1, hd + 0.28], P.wall, {
      aoAmt: 0,
    });
  // lamp under the ridge
  put(
    acc,
    hi ? new THREE.IcosahedronGeometry(0.1, 0) : new THREE.OctahedronGeometry(0.1, 0),
    [0, floor + S.lampY - 0.08, -0.1],
    P.lamp,
    lit,
  );
  if (hi) {
    put(acc, cylB(0.012, 0.012, 0.16, 3), [0, floor + S.lampY - 0.02, -0.1], P.iron, { aoAmt: 0 });
    // pennant on the ridge: the livery colour
    put(acc, cylB(0.02, 0.016, 0.45, 3), [hw - 0.1, floor + S.wallH + rh - 0.02, 0], P.steel, {
      aoAmt: 0,
    });
    const tri = new THREE.Shape([V2(0, 0.18), V2(0, -0.04), V2(0.42, 0.07)]);
    put(acc, new THREE.ShapeGeometry(tri), [hw - 0.1, floor + S.wallH + rh + 0.24, 0], P.accent, {
      double: true,
      aoAmt: 0,
      ao: () => 1,
    });
  }
  const geo = acc.finish(rng, false, true);
  addHook(geo, 'bench', {
    at: [0, floor + B.h, bz],
    size: [S.w - 0.5, B.deep],
    face: 0,
  });
  addHook(geo, 'lamp', { at: [0, floor + S.lampY - 0.08, -0.1], r: 0.1 });
  return addHook(geo, 'roof', { y: floor + S.wallH });
}

/* ================================ ticket booth ================================ */

function ticketBooth({ rng, lod }: BuildOpts, liv: HarbourLivery): THREE.BufferGeometry {
  const P = HARBOUR_PAL[liv];
  const B = F.booth;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const hw = B.w / 2;
  const hd = B.d / 2;
  put(acc, baseBox(B.w + 0.18, 0.1, B.d + 0.18), [0, 0, 0], P.stone, { aoAmt: 0.2 });
  put(acc, baseBox(B.w, B.wallH, B.d), [0, 0.1, 0], P.wall, { aoAmt: 0.15 });
  // livery skirt around the foot
  put(acc, baseBox(B.w + 0.05, 0.42, B.d + 0.05), [0, 0.1, 0], P.accent, { aoAmt: 0.1 });
  // counter window on +z: frame, glowing pane, counter ledge
  const W = B.window;
  const wz = hd + 0.01;
  if (hi)
    put(acc, baseBox(W.w + 0.16, W.h + 0.16, 0.05), [0, W.y - 0.08, wz], P.accentDeep, {
      aoAmt: 0,
    });
  put(acc, baseBox(W.w, W.h, 0.06), [0, W.y, wz + 0.005], P.glass, glow);
  if (hi)
    put(acc, baseBox(W.w + 0.3, 0.06, 0.3), [0, W.y - 0.1, hd + 0.15], P.wood, { aoAmt: 0.1 });
  if (hi) put(acc, baseBox(0.04, W.h, 0.07), [0, W.y, wz + 0.01], P.accentDeep, { aoAmt: 0 });
  // striped awning over the window (a tilted slab, stripes alternate livery / wall)
  const A = B.awning;
  const stripes = hi ? 5 : 1;
  const sw = (W.w + 0.4) / stripes;
  for (let i = 0; i < stripes; i++)
    put(
      acc,
      new THREE.BoxGeometry(sw - (hi ? 0.01 : 0), 0.05, A.out),
      [-(W.w + 0.4) / 2 + sw * (i + 0.5), A.y, hd + A.out / 2 - 0.02],
      i % 2 === 0 ? P.accent : P.band,
      { q: qEuler(0.32, 0, 0), aoAmt: 0 },
    );
  // ticket plaque above the awning: a livery plate with a chalk ticket stub (two notch dots)
  if (hi) {
    put(acc, baseBox(0.7, 0.26, 0.05), [0, A.y + 0.12, hd + 0.01], P.accentDeep, { aoAmt: 0 });
    put(acc, baseBox(0.5, 0.14, 0.04), [0, A.y + 0.18, hd + 0.04], P.chalk, {
      aoAmt: 0,
      noJitter: true,
    });
    for (const sx of [-1, 1])
      put(acc, baseBox(0.05, 0.05, 0.045), [sx * 0.23, A.y + 0.23, hd + 0.045], P.accentDeep, {
        aoAmt: 0,
        noJitter: true,
      });
    put(acc, baseBox(0.22, 0.04, 0.045), [0, A.y + 0.2, hd + 0.045], P.accent, {
      aoAmt: 0,
      noJitter: true,
    });
  }
  // door on +x
  if (hi) put(acc, baseBox(0.05, 1.45, 0.62), [hw + 0.005, 0.1, -0.12], P.accentDeep, { aoAmt: 0 });
  if (hi)
    put(acc, new THREE.IcosahedronGeometry(0.035, 0), [hw + 0.04, 0.85, 0.12], P.brass, {
      aoAmt: 0,
    });
  // pyramid roof + finial
  const roofY = 0.1 + B.wallH;
  put(acc, new THREE.ConeGeometry(1.15, 0.55, 4).translate(0, 0.275, 0), [0, roofY, 0], P.roof, {
    q: qEuler(0, PI / 4, 0),
    aoAmt: 0,
  });
  if (hi)
    put(acc, new THREE.IcosahedronGeometry(0.07, 0), [0, roofY + 0.58, 0], P.brass, { aoAmt: 0 });
  // lamp over the awning
  put(
    acc,
    hi ? new THREE.IcosahedronGeometry(0.09, 0) : new THREE.OctahedronGeometry(0.09, 0),
    [hw - 0.12, roofY - 0.14, hd + 0.12],
    P.lamp,
    lit,
  );
  const geo = acc.finish(rng, false, true);
  addHook(geo, 'window', { at: [0, W.y, hd + 0.04], size: [W.w, W.h], dir: [0, 0, 1] });
  addHook(geo, 'door', { at: [hw + 0.03, 0.1, -0.12], dir: [1, 0, 0] });
  return addHook(geo, 'lamp', { at: [hw - 0.12, roofY - 0.14, hd + 0.12], r: 0.09 });
}

/* ================================ timetable board ================================ */

/** LOD1 board: face, header and four bars on the two posts. */
function timetableFar(
  acc: Acc,
  rng: BuildOpts['rng'],
  P: (typeof HARBOUR_PAL)[HarbourLivery],
  T: typeof F.board,
  hw: number,
  y0: number,
): THREE.BufferGeometry {
  put(acc, baseBox(T.w, T.h, 0.1), [0, y0, 0], P.board, { aoAmt: 0, noJitter: true });
  put(acc, baseBox(T.w - 0.1, 0.26, 0.04), [0, y0 + T.h - 0.33, 0.06], P.wall, {
    aoAmt: 0,
    noJitter: true,
  });
  for (let r = 0; r < T.rows; r++)
    put(
      acc,
      baseBox(0.6, 0.075, 0.03),
      [0.1, y0 + 0.2 + r * 0.19, 0.07],
      r % 2 === 0 ? P.chalk : P.accent,
      { aoAmt: 0, noJitter: true },
    );
  put(acc, baseBox(T.w + 0.2, 0.22, 0.3), [0, T.postH + 0.04, 0.02], P.roof, { aoAmt: 0 });
  void hw;
  return acc.finish(rng, false, true);
}

function timetable({ rng, lod }: BuildOpts, liv: HarbourLivery): THREE.BufferGeometry {
  const P = HARBOUR_PAL[liv];
  const T = F.board;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const hw = T.w / 2;
  const y0 = T.postH - T.h; // board bottom
  for (const sx of [-1, 1]) {
    put(acc, baseBox(0.11, T.postH + 0.2, 0.11), [sx * (hw - 0.1), 0, 0], P.woodDark, {
      aoAmt: 0.2,
    });
    if (hi) put(acc, cylB(0.12, 0.1, 0.1, 5), [sx * (hw - 0.1), 0, 0], P.stoneDark, { aoAmt: 0.2 });
  }
  if (!hi) return timetableFar(acc, rng, P, T, hw, y0);
  // frame + face
  put(acc, baseBox(T.w, T.h, 0.1), [0, y0, 0], P.wood, { aoAmt: 0.1 });
  put(acc, baseBox(T.w - 0.14, T.h - 0.14, 0.04), [0, y0 + 0.07, 0.04], P.board, {
    aoAmt: 0,
    noJitter: true,
  });
  // header band + ferry glyph (hull, cabin, funnel) in chalk
  const hh = 0.26;
  const hy = y0 + T.h - 0.07 - hh;
  put(acc, baseBox(T.w - 0.14, hh, 0.04), [0, hy, 0.05], P.wall, { aoAmt: 0, noJitter: true });
  const gx = -hw + 0.4;
  const gc = P.accentDeep;
  const gl = { aoAmt: 0, noJitter: true } as const;
  put(acc, baseBox(0.36, 0.07, 0.03), [gx, hy + 0.05, 0.075], gc, gl);
  put(acc, baseBox(0.2, 0.07, 0.03), [gx - 0.02, hy + 0.12, 0.075], gc, gl);
  put(acc, baseBox(0.05, 0.07, 0.03), [gx + 0.07, hy + 0.19, 0.075], gc, gl);
  if (hi) put(acc, baseBox(0.46, 0.022, 0.03), [gx, hy + 0.012, 0.075], gc, gl);
  // a title bar next to the glyph
  put(acc, baseBox(0.62, 0.07, 0.03), [gx + 0.78, hy + 0.1, 0.075], gc, gl);
  // glyph rows: time chip + destination bar + status lamp, bar lengths from the seed
  const rowsRng = rng.fork('rows');
  const top = hy - 0.1;
  const step = (top - (y0 + 0.14)) / T.rows;
  const rows: { y: number }[] = [];
  for (let r = 0; r < T.rows; r++) {
    const y = top - (r + 1) * step + 0.03;
    rows.push({ y });
    const len = rowsRng.range(T.barRange[0], T.barRange[1]);
    const dest = r % 2 === 0 ? P.chalk : P.accent;
    put(acc, baseBox(0.3, 0.1, 0.03), [-hw + 0.37, y, 0.065], P.stoneDark, {
      aoAmt: 0,
      noJitter: true,
    });
    if (hi) {
      // two tick marks in the chip (digits)
      for (const dx of [-0.07, 0.07])
        put(acc, baseBox(0.045, 0.06, 0.03), [-hw + 0.37 + dx, y + 0.02, 0.08], P.board, {
          aoAmt: 0,
          noJitter: true,
        });
    }
    put(acc, baseBox(len, 0.075, 0.03), [-hw + 0.62 + len / 2, y + 0.012, 0.065], dest, {
      aoAmt: 0,
      noJitter: true,
    });
    // status lamp: window glow (on time)
    put(acc, baseBox(0.07, 0.07, 0.03), [hw - 0.28, y + 0.015, 0.065], P.glass, glow);
  }
  // little gable cap over the board
  put(acc, gableRoof(T.w / 2 + 0.1, 0.22, 0.3), [0, T.postH + 0.2, 0.02], P.roof, {
    aoAmt: 0,
    q: qEuler(0, 0, 0),
  });
  const geo = acc.finish(rng, false, true);
  addHook(geo, 'board', {
    center: [0, y0 + T.h / 2, 0.06],
    size: [T.w, T.h],
    rows,
  });
  return geo;
}

/* ================================ bollard ================================ */

function bollard({ rng, lod }: BuildOpts, liv: HarbourLivery): THREE.BufferGeometry {
  const P = HARBOUR_PAL[liv];
  const R = F.bollard.r;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const prof: [number, number][] = hi
    ? [
        [0, 0],
        [R * 1.25, 0],
        [R * 1.1, 0.05],
        [R * 0.85, 0.12],
        [R * 0.82, 0.2],
        [R * 0.8, 0.3],
        [R * 1.05, 0.36],
        [R * 0.95, 0.4],
        [R * 0.95, 0.46],
        [0, 0.5],
      ]
    : [
        [0, 0],
        [R * 1.2, 0],
        [R * 0.85, 0.3],
        [R * 0.95, 0.4],
        [0, 0.5],
      ];
  const body = col(liv === 'neutral' ? '#4B5163' : P.accentDeep);
  const band = col(P.accent);
  const stripe = col(P.chalk);
  put(
    acc,
    lathe(prof, hi ? 8 : 5),
    [0, 0, 0],
    (p) =>
      p.y > 0.12 && p.y < 0.2 ? (liv === 'neutral' ? band : stripe) : p.y > 0.4 ? stripe : body,
    { aoAmt: 0.2 },
  );
  const geo = acc.finish(rng, false, true);
  return addHook(geo, 'top', { y: 0.5 });
}

/* ================================ registry glue ================================ */

interface Added {
  height: number;
  build: (o: BuildOpts, liv: HarbourLivery) => THREE.BufferGeometry;
}
const ADDED: Record<keyof typeof HV, readonly Added[]> = {
  lighthouse: [{ height: F.light.heightNominal, build: harbourLight }],
  marketStall: [{ height: F.shelter.heightNominal, build: shelter }],
  dock: [{ height: F.booth.heightNominal, build: ticketBooth }],
  pierSignpost: [{ height: F.board.heightNominal, build: timetable }],
  barrel: [{ height: F.bollard.heightNominal, build: bollard }],
};

/** Heights of the added variants, [neutral, Research] per def (the geo test checks them). */
export const HARBOUR_HEIGHTS: Record<keyof typeof HV, number> = Object.fromEntries(
  Object.entries(ADDED).map(([k, v]) => [k, v[0].height]),
) as Record<keyof typeof HV, number>;

/**
 * Append the neutral + Research harbour variants to the five old defs (variants +2). Anything else
 * passes through untouched. LOD1 of an added variant is its own (flat) low-poly build.
 */
export function withHarbourKit(def: PropGeoDef): PropGeoDef {
  const add = ADDED[def.id as keyof typeof HV];
  if (!add) return def;
  const first = HV[def.id as keyof typeof HV];
  if (def.variants !== first)
    throw new Error(`harbour kit: ${def.id} has ${def.variants} variants, want ${first}`);
  const own = def.heights ?? Array.from({ length: def.variants }, () => def.height);
  const build: PropBuilder = (o) =>
    o.variant === first
      ? add[0].build(o, 'neutral')
      : o.variant === first + 1
        ? add[0].build(o, 'research')
        : def.build(o);
  return {
    ...def,
    variants: def.variants + 2,
    heights: [...own, add[0].height, add[0].height],
    build,
  };
}
