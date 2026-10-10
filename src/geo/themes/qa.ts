/**
 * qa theme structure geometry (M14b TASK-377): barrierGate, trafficCone, checklistBoard,
 * inspectionBuoy; the M17b Test Factory structures (testHangar, conveyor, testTrack, qaTower)
 * live in qa-factory.ts. Defs: content/props-themes/qa.ts.
 *
 * Hooks (userData.hooks):
 *  - checklistBoard.board: the board face `{ center, normal, size }` (M14c inspectors stand in
 *    front of it, `clipboard` carried-item slot).
 *  - barrierGate.gate: the gate opening `{ center, axis }` (checkpoint: bots queue along +z).
 */
import * as THREE from 'three';
import { OFFICE_COLORS as C, OFFICE_PAL } from '../../content/palette-offices.ts';
import { THEMES } from '../../content/themes.ts';
import { qEuler } from '../kit.ts';
import { glyph } from '../office-kit.ts';
import { TAU, V, baseBox, cylB, jitterAcc, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { addHook, stripedBuoy } from './hq.ts';
import { conveyor, qaTower, testHangar, testTrack } from './qa-factory.ts';
import { tagScreens } from './surface-tags.ts';

const QA = THEMES.qa.accent;
const PAL = OFFICE_PAL.qa;

/* -------------------------------- barrierGate -------------------------------- */

/** Checkpoint boom barrier: control post with stop sign and lamp, striped arm, rest post. */
function barrierGate({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const hi = lod === 0;
  const L = 2.7;
  const x0 = -1.5;
  const x1 = x0 + 0.1 + L;
  // control post: hazard-striped footing, body, lamp, stop sign
  put(acc, baseBox(0.7, 0.14, 0.7), [x0, 0, 0], C.plinth, { aoAmt: 0.25 });
  put(acc, baseBox(0.42, 1.15, 0.42), [x0, 0.14, 0], PAL[0].wall, { aoAmt: 0.15 });
  put(acc, baseBox(0.46, 0.16, 0.46), [x0, 1.1, 0], PAL[0].roof, { aoAmt: 0 });
  put(acc, new THREE.IcosahedronGeometry(0.12, hi ? 1 : 0), [x0, 1.4, 0], C.red, {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
  // striped arm (raised a bit), pivot at the post
  const n = hi ? 8 : 2;
  const seg = L / n;
  const tilt = 0.14;
  for (let i = 0; i < n; i++) {
    const cx = seg * (i + 0.5) * Math.cos(tilt);
    const cyy = 0.9 + seg * (i + 0.5) * Math.sin(tilt);
    put(acc, baseBox(seg, 0.12, 0.09), [x0 + 0.21 + cx, cyy, 0.0], i % 2 === 0 ? C.red : C.white, {
      q: qEuler(0, 0, tilt),
      aoAmt: 0,
    });
  }
  // counterweight stub behind the pivot
  put(acc, baseBox(0.38, 0.16, 0.1), [x0 - 0.35, 0.8, 0], C.dark, {
    q: qEuler(0, 0, tilt),
    aoAmt: 0,
  });
  // rest post with a cradle
  put(acc, baseBox(0.2, 0.7, 0.2), [x1 + 0.1, 0, 0], C.steel, { aoAmt: 0.15 });
  put(acc, baseBox(0.26, 0.08, 0.26), [x1 + 0.1, 0.7, 0], PAL[0].roof, { aoAmt: 0 });
  if (hi) {
    // stop sign (octagon disc on a pole) in front of the control post
    put(acc, cylB(0.03, 0.03, 1.1, 4, true), [x0 + 0.5, 0, 0.4], C.steelLight, { aoAmt: 0 });
    put(acc, new THREE.CylinderGeometry(0.2, 0.2, 0.04, 8), [x0 + 0.5, 1.2, 0.4], C.red, {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0,
    });
    put(acc, new THREE.PlaneGeometry(0.22, 0.06), [x0 + 0.5, 1.2, 0.425], C.white, {
      aoAmt: 0,
      ao: () => 1,
    });
    // control box window (glow) + hazard footing stripes
    put(acc, new THREE.PlaneGeometry(0.22, 0.2), [x0, 0.75, 0.215], C.screen, {
      emissive: 2,
      aoAmt: 0,
      ao: () => 1,
    });
    for (let i = 0; i < 4; i++)
      put(
        acc,
        baseBox(0.12, 0.02, 0.7),
        [x0 - 0.27 + i * 0.18, 0.14, 0],
        i % 2 ? C.white : C.cone,
        {
          aoAmt: 0,
        },
      );
    // reflectors on the arm
    for (const x of [0.5, 1.3, 2.1])
      put(
        acc,
        new THREE.CylinderGeometry(0.045, 0.045, 0.02, 6),
        [x0 + 0.21 + x, 0.9 + x * Math.sin(tilt) + 0.0, 0.055],
        C.gold,
        {
          q: qEuler(Math.PI / 2, 0, 0),
          aoAmt: 0,
        },
      );
    // LOD0-only variation: v0 = pair of cones, v1 = clipboard stand
    if (variant === 0) {
      for (const z of [0.6, 1.0]) coneBit(acc, V(x1 - 0.4, 0, z), 0.8);
    } else {
      put(acc, baseBox(0.05, 0.9, 0.05), [x1 - 0.4, 0, 0.7], C.deskDark, { aoAmt: 0.1 });
      put(acc, baseBox(0.4, 0.55, 0.04), [x1 - 0.4, 0.9, 0.7], C.white, { aoAmt: 0 });
      put(acc, baseBox(0.34, 0.06, 0.05), [x1 - 0.4, 1.35, 0.72], QA, { aoAmt: 0 });
    }
  }
  const g = acc.finish(rng, false, true);
  tagScreens(g, 'checklist'); // TASK-384: control-box screen
  return addHook(g, 'gate', { center: [(x0 + x1) / 2, 0.9, 0], axis: [1, 0, 0] });
}

/** Small cone used inside other props (LOD0 detail only). */
function coneBit(acc: Parameters<typeof put>[0], at: THREE.Vector3, s: number): void {
  put(acc, baseBox(0.28 * s, 0.03 * s, 0.28 * s), at, C.dark, { aoAmt: 0 });
  put(
    acc,
    new THREE.ConeGeometry(0.11 * s, 0.4 * s, 6).translate(0, 0.2 * s, 0),
    at.clone().add(V(0, 0.03 * s, 0)),
    C.cone,
    { aoAmt: 0.1 },
  );
}

/* -------------------------------- trafficCone -------------------------------- */

/** Traffic cone: weighted square base, orange cone, two reflective bands (v0), or a stacked pair (v1). */
function trafficCone({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.04);
  const hi = lod === 0;
  const s = 1.35;
  const one = (at: THREE.Vector3, sc: number): void => {
    put(acc, baseBox(0.3 * sc, 0.035 * sc, 0.3 * sc), at, C.dark, { aoAmt: 0 });
    put(
      acc,
      new THREE.ConeGeometry(0.115 * sc, 0.46 * sc, hi ? 10 : 4).translate(0, 0.23 * sc, 0),
      at.clone().add(V(0, 0.035 * sc, 0)),
      C.cone,
      { aoAmt: 0.1 },
    );
    if (!hi)
      put(
        acc,
        cylB(0.075 * sc, 0.06 * sc, 0.16 * sc, 4),
        at.clone().add(V(0, 0.2 * sc, 0)),
        C.white,
        {
          aoAmt: 0,
        },
      );
    if (hi) {
      put(
        acc,
        cylB(0.082 * sc, 0.066 * sc, 0.07 * sc, 10),
        at.clone().add(V(0, 0.2 * sc, 0)),
        C.white,
        {
          aoAmt: 0,
        },
      );
      put(
        acc,
        cylB(0.056 * sc, 0.046 * sc, 0.045 * sc, 10),
        at.clone().add(V(0, 0.33 * sc, 0)),
        C.white,
        {
          aoAmt: 0,
        },
      );
      put(
        acc,
        new THREE.IcosahedronGeometry(0.02 * sc, 0),
        at.clone().add(V(0, 0.5 * sc, 0)),
        C.cone,
        {
          aoAmt: 0,
        },
      );
    }
  };
  if (variant === 0) one(V(0, 0, 0), s);
  else {
    // two cones joined by a hazard tape: both read as one prop
    one(V(-0.2, 0, 0), s);
    one(V(0.2, 0, 0.04), s);
    if (hi) put(acc, baseBox(0.4, 0.025, 0.02), [0, 0.38, 0.02], C.white, { aoAmt: 0 });
  }
  return acc.finish(rng, false, true);
}

/* ------------------------------- checklistBoard ------------------------------- */

/** Ground-standing checklist board: two legs, framed board with 3 rows (check, check, cross), pen. */
function checklistBoard({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const hi = lod === 0;
  const W = 1.9;
  const H = 1.35;
  const y0 = 0.7;
  for (const x of [-W * 0.38, W * 0.38])
    put(acc, cylB(0.06, 0.05, y0 + 0.3, hi ? 5 : 4, true), [x, 0, 0], C.deskDark, { aoAmt: 0.15 });
  for (const x of [-W * 0.38, W * 0.38])
    put(acc, baseBox(0.34, 0.06, 0.5), [x, 0, 0.05], C.plinth, { aoAmt: 0.2 });
  put(acc, baseBox(W + 0.2, H + 0.2, 0.12), [0, y0 - 0.1, 0], PAL[0].trim, { aoAmt: 0.08 });
  put(acc, new THREE.PlaneGeometry(W, H), [0, y0 + H / 2, 0.065], C.white, {
    aoAmt: 0,
    ao: () => 1,
  });
  // header strip in the QA accent
  put(acc, new THREE.PlaneGeometry(W, 0.24), [0, y0 + H - 0.12, 0.07], QA, {
    aoAmt: 0,
    ao: () => 1,
  });
  // rows: tick + text bar; the bad row index differs per variant (same colour mass)
  const bad = variant === 0 ? 2 : 1;
  for (let i = 0; i < 3; i++) {
    const y = y0 + H - 0.55 - i * 0.34;
    const isBad = i === bad;
    if (hi) {
      glyph(acc, 'qa', V(-W * 0.36, y, 0.08), 0, 0.27, isBad ? C.red : QA);
    } else {
      put(acc, new THREE.PlaneGeometry(0.26, 0.2), [-W * 0.36, y, 0.075], isBad ? C.red : QA, {
        aoAmt: 0,
        ao: () => 1,
      });
    }
    put(
      acc,
      new THREE.PlaneGeometry(W * (hi ? 0.62 : 0.6), hi ? 0.1 : 0.12),
      [W * 0.1, y, 0.07],
      C.chair,
      {
        aoAmt: 0,
        ao: () => 1,
      },
    );
  }
  if (hi) {
    // corner bolts
    for (const sx of [-1, 1])
      for (const sy of [0, 1])
        put(
          acc,
          new THREE.IcosahedronGeometry(0.04, 0),
          [sx * (W / 2 + 0.02), y0 - 0.02 + sy * (H + 0.04), 0.07],
          C.steelLight,
          { aoAmt: 0 },
        );
    // hanging pen + top clip + a bug sticker on the frame
    put(acc, cylB(0.012, 0.012, 0.2, 3, true), [W * 0.42, y0 + 0.2, 0.09], C.steelLight, {
      aoAmt: 0,
    });
    put(acc, cylB(0.02, 0.02, 0.06, 4), [W * 0.42, y0 + 0.2, 0.09], QA, { aoAmt: 0 });
    put(acc, baseBox(0.3, 0.07, 0.1), [0, y0 + H + 0.12, 0], C.steel, { aoAmt: 0 });
    put(acc, new THREE.IcosahedronGeometry(0.06, 0), [W / 2 + 0.05, y0 + 0.25, 0.08], C.red, {
      aoAmt: 0,
    });
    for (const k of [-1, 1])
      put(acc, cylB(0.015, 0.015, 0.7, 3, true), [k * W * 0.38, 0.1, -0.28], C.deskDark, {
        q: qEuler(-0.5, 0, 0),
        aoAmt: 0,
      });
  }
  const g = acc.finish(rng, false, true);
  return addHook(g, 'board', { center: [0, y0 + H / 2, 0.065], normal: [0, 0, 1], size: [W, H] });
}

/* ------------------------------- inspectionBuoy ------------------------------- */

/** Red/white inspection buoy: banded float, lamp mast with a small magnifier ring. Pivot = water level. */
function inspectionBuoy({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.03);
  const hi = lod === 0;
  stripedBuoy(acc, V(0, 0, 0), 0.4, 0.4, C.red, C.white, lod, 5);
  put(acc, cylB(0.04, 0.03, 0.65, hi ? 5 : 4, true), [0, 0.95, 0], C.steel, { aoAmt: 0 });
  put(acc, new THREE.IcosahedronGeometry(0.1, hi ? 1 : 0), [0, 1.65, 0], C.screenWarm, {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
  put(acc, new THREE.TorusGeometry(0.18, 0.035, 4, hi ? 12 : 6), [0, 1.35, 0], PAL[0].roof, {
    aoAmt: 0,
  });
  if (hi) {
    put(acc, new THREE.TorusGeometry(0.43, 0.04, 4, 14), [0, 0.5, 0], C.steelLight, {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0,
    });
    put(acc, cylB(0.015, 0.015, 0.22, 3, true), [0.17, 1.15, 0], C.steelLight, {
      q: qEuler(0, 0, -0.6),
      aoAmt: 0,
    });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.5;
      put(
        acc,
        new THREE.IcosahedronGeometry(0.04, 0),
        [Math.cos(a) * 0.4, 0.8, Math.sin(a) * 0.4],
        C.gold,
        {
          aoAmt: 0,
        },
      );
    }
  }
  return acc.finish(rng, false, true);
}

export const QA_GEO: readonly PropGeoDef[] = [
  { id: 'barrierGate', variants: 2, build: barrierGate, footprint: 2.2, height: 1.5, windy: false },
  {
    id: 'trafficCone',
    variants: 2,
    build: trafficCone,
    footprint: 0.35,
    height: 0.7,
    windy: false,
  },
  {
    id: 'checklistBoard',
    variants: 2,
    build: checklistBoard,
    footprint: 1.2,
    height: 2.25,
    windy: false,
  },
  {
    id: 'inspectionBuoy',
    variants: 2,
    build: inspectionBuoy,
    footprint: 0.5,
    height: 1.8,
    windy: false,
  },
  // M17b TASK-401: the Test Factory
  { id: 'testHangar', variants: 2, build: testHangar, footprint: 5.6, height: 6.9, windy: false },
  { id: 'conveyor', variants: 1, build: conveyor, footprint: 1.0, height: 2.8, windy: false },
  { id: 'testTrack', variants: 1, build: testTrack, footprint: 7, height: 3.6, windy: false },
  { id: 'qaTower', variants: 1, build: qaTower, footprint: 3, height: 20, windy: false },
];
