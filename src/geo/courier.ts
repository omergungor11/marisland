import * as THREE from 'three';
import { EMISSIVE } from '../content/palette.ts';
import { REPORT_SCROLL, courierSpec, type CourierShipSpec } from '../content/fleet-ships.ts';
import { THEMES } from '../content/themes.ts';
import { THEME_IDS } from '../world/types.ts';
import { gridSurface } from './coastal.ts';
import type { Acc } from './kit.ts';
import { col, qEuler } from './kit.ts';
import {
  V2,
  cylB,
  gableRoof,
  jitterAcc,
  lathe,
  prism,
  put,
  tubeAlong,
  V,
  type PutOpts,
} from './parts.ts';
import type { BuildOpts } from './types.ts';

/**
 * M51 courier ships (TASK-620): the seven department ships, a banded crate and a report scroll.
 * Every number and colour is read from content/fleet-ships.ts. Bow +z, keel at y = 0, deck at
 * `spec.hullH` (the sailboat contract), vertex colours only. Lamps use emissive class 1 (the boats'
 * night glow). `userData.hooks.lantern.pivot` marks the mast lantern, `userData.crates` the deck spots.
 */

type P3 = [number, number, number];
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Box standing on `at` (base at y = at.y). */
function bx(acc: Acc, w: number, h: number, d: number, at: P3, c: string, o: PutOpts = {}): void {
  put(acc, new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), at, c, { aoAmt: 0.12, ...o });
}

/** Window / lamp plate: warm at night (emissive class 1). */
function lit(acc: Acc, w: number, h: number, d: number, at: P3): void {
  put(acc, new THREE.BoxGeometry(w, h, d), at, EMISSIVE.window, {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
}

/** Lantern ball, glows at night. */
function lamp(acc: Acc, at: P3, r: number, c: string = EMISSIVE.lantern): void {
  put(acc, new THREE.IcosahedronGeometry(r, 0), at, c, { emissive: 1, aoAmt: 0, ao: () => 1 });
}

/** Hull outline in the shape plane (x = beam, y = along the ship; extruded, y becomes +z). */
function outline(kind: CourierShipSpec['kind'], L: number, W: number): THREE.Shape {
  const h = L / 2;
  const w = W / 2;
  const pts: Array<[number, number]> =
    kind === 'feeder'
      ? [
          [-w * 0.9, -h],
          [w * 0.9, -h],
          [w, -h + 0.35],
          [w, h * 0.45],
          [0, h],
          [-w, h * 0.45],
          [-w, -h + 0.35],
        ]
      : kind === 'barge'
        ? [
            [-w * 0.92, -h],
            [w * 0.92, -h],
            [w, -h + 0.3],
            [w, h * 0.62],
            [w * 0.66, h],
            [-w * 0.66, h],
            [-w, h * 0.62],
            [-w, -h + 0.3],
          ]
        : [
            [-w * 0.7, -h],
            [w * 0.7, -h],
            [w, -h * 0.4],
            [w * 0.94, h * 0.35],
            [0, h],
            [-w * 0.94, h * 0.35],
            [-w, -h * 0.4],
          ];
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

/** Half-width of the standard hull outline at z (rails, fenders, deck-edge parts). */
function halfAt(L: number, W: number, z: number): number {
  const h = L / 2;
  const w = W / 2;
  if (z < -h * 0.4) return w * (0.7 + 0.3 * ((z + h) / (0.6 * h)));
  if (z < h * 0.35) return w * (1 - 0.06 * ((z + h * 0.4) / (0.75 * h)));
  return Math.max(0, w * 0.94 * (1 - (z - h * 0.35) / (0.65 * h)));
}

/**
 * Stacked hull bands (flat side faces; a colour fn on the big side triangles would split
 * diagonally). `offX` shifts a twin hull. `bands`: fractions of hullH, bottom to top.
 */
function hullStack(
  acc: Acc,
  s: CourierShipSpec,
  shape: THREE.Shape,
  hi: boolean,
  offX = 0,
  oneBand = false,
): void {
  const H = s.hullH;
  const [t0, t1] = s.trimBand;
  const bands: ReadonlyArray<readonly [number, number, string]> = oneBand
    ? [[0, H, s.hull]]
    : hi
      ? [
          [0, 0.3, s.hullLow],
          [0.3, t0, s.hull],
          [t0, t1, s.trim],
          [t1, 1, s.hull],
        ]
      : [
          [0, 0.45, s.hullLow],
          [0.45, 1, s.hull],
        ];
  for (const [f0, f1, c] of bands) {
    const y0 = Math.min(f0, f1) * H;
    const y1 = f1 * H;
    if (y1 - y0 < 0.01) continue;
    const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false }).rotateX(
      Math.PI / 2,
    );
    put(acc, g, [offX, y1, 0], (p) => (f1 === 1 && p.y > H - 0.01 ? col(s.deck) : col(c)), {
      aoAmt: 0.2,
      noJitter: true,
    });
  }
}

/** Pennant: a triangle streaming aft from a mast (`wave` = windAbs-driven). */
function pennant(acc: Acc, at: P3, len: number, hgt: number, c: string, hi: boolean): void {
  const g = new THREE.ShapeGeometry(
    new THREE.Shape([V2(0, hgt / 2), V2(len, 0), V2(0, -hgt / 2)]),
    hi ? 1 : 1,
  );
  put(acc, g, at, c, {
    q: qEuler(0, Math.PI / 2, 0),
    double: true,
    aoAmt: 0,
    ao: () => 1,
    windAbs: (p) => clamp01((at[2] - p.z) / len) * 0.9 + 0.1,
  });
}

/** Mast: thin open frustum from `at` upward. */
function mast(acc: Acc, at: P3, h: number, r: number, c: string, hi: boolean): void {
  put(acc, cylB(r, r * 0.7, h, hi ? 5 : 3, true), at, c, { aoAmt: 0 });
}

// ---- 0 hq: steam yacht ------------------------------------------------------------------------
function yacht(acc: Acc, s: CourierShipSpec, hi: boolean): P3 {
  const D = s.hullH;
  hullStack(acc, s, outline(s.kind, s.length, s.beam), hi);
  bx(acc, 1.3, 0.72, 2.0, [0, D, -0.35], s.superColor);
  bx(acc, 1.46, 0.07, 2.16, [0, D + 0.72, -0.35], s.roof, { aoAmt: 0.04 });
  // tall buff funnel, gold band, dark cap
  const fy = D + 0.79;
  const fh = s.mastH - fy;
  put(acc, cylB(0.44, 0.34, fh, 8), [0, fy, -0.2], s.rig, { aoAmt: 0.1 });
  if (hi) {
    put(acc, cylB(0.46, 0.46, 0.2, 8), [0, fy + 0.12, -0.2], s.trim, { aoAmt: 0 });
    put(acc, cylB(0.36, 0.36, 0.26, 8), [0, fy + fh - 0.22, -0.2], '#4F4A5E', { aoAmt: 0 });
    // bridge deck and wing, lit windows
    bx(acc, 0.95, 0.5, 0.8, [0, D + 0.79, 0.75], s.superColor);
    bx(acc, 1.1, 0.06, 0.95, [0, D + 1.29, 0.75], s.roof, { aoAmt: 0.04 });
    lit(acc, 0.8, 0.22, 0.05, [0, D + 1.05, 1.17]);
    for (const sx of [-1, 1]) {
      lit(acc, 0.05, 0.22, 0.5, [sx * 0.49, D + 1.05, 0.75]);
      for (const z of [-1.0, -0.35, 0.3]) lit(acc, 0.05, 0.26, 0.38, [sx * 0.66, D + 0.4, z]);
    }
    // rail posts and deck chairs on the afterdeck, bow lantern
    for (const sx of [-1, 1])
      for (const z of [-3.0, -2.5, -2.0]) {
        const hx = halfAt(s.length, s.beam, z) * 0.93;
        bx(acc, 0.05, 0.3, 0.05, [sx * hx, D, z], s.trim, { aoAmt: 0 });
      }
    lamp(acc, [0, D + 0.28, 2.55], 0.09);
  }
  // aft mast with the pennant
  mast(acc, [0, D, -2.9], 1.9, 0.045, s.trim, hi);
  pennant(acc, [0, D + 1.7, -2.9], 0.9, 0.34, s.flag.color, hi);
  return [0, D + 1.55, 0.75];
}

// ---- 1 coding: container feeder ---------------------------------------------------------------
function feeder(acc: Acc, s: CourierShipSpec, hi: boolean): P3 {
  const D = s.hullH;
  hullStack(acc, s, outline(s.kind, s.length, s.beam), hi);
  // aft bridge tower
  bx(acc, 1.5, 1.7, 1.3, [0, D, -2.5], s.superColor);
  bx(acc, 1.7, 0.1, 1.5, [0, D + 1.7, -2.5], s.roof, { aoAmt: 0.04 });
  // container bays: stack heights per column
  const cols = [-0.5, 0.5];
  const bayZ = [-1.05, 0, 1.05];
  const stacks = [
    [3, 2, 1],
    [2, 3, 2],
  ];
  let k = 0;
  if (hi) {
    for (let c = 0; c < 2; c++)
      for (let b = 0; b < 3; b++)
        for (let h = 0; h < stacks[c][b]; h++)
          bx(
            acc,
            0.9,
            0.5,
            1.02,
            [cols[c], D + h * 0.5, bayZ[b]],
            s.patches[k++ % s.patches.length],
            {
              aoAmt: 0.1,
            },
          );
  } else {
    bx(acc, 0.9, 1.5, 1.02, [-0.5, D, -1.05], s.patches[0]);
    bx(acc, 0.9, 1.5, 1.02, [0.5, D, 0], s.patches[3]);
  }
  const top = D + 1.7;
  if (hi) {
    lit(acc, 1.3, 0.28, 0.05, [0, D + 1.2, -1.83]);
    for (const sx of [-1, 1]) lit(acc, 0.05, 0.28, 0.9, [sx * 0.76, D + 1.2, -2.5]);
    bx(acc, 0.4, 0.5, 0.4, [-0.4, top + 0.1, -2.8], '#4F4A5E');
    // antenna: mast, two crossbars, small dish, red aviation light
    put(
      acc,
      new THREE.BoxGeometry(0.1, s.mastH - top, 0.1).translate(0, (s.mastH - top) / 2, 0),
      [0.35, top + 0.1, -2.3],
      s.trim,
      { aoAmt: 0 },
    );
    bx(acc, 0.8, 0.05, 0.05, [0.35, top + 1.4, -2.3], s.trim, { aoAmt: 0 });
    bx(acc, 0.5, 0.05, 0.05, [0.35, top + 1.9, -2.3], s.trim, { aoAmt: 0 });
    put(acc, cylB(0.22, 0.02, 0.14, 6), [0.75, top + 1.4, -2.3], '#FAFAF5', {
      q: qEuler(-Math.PI / 2.6, 0, 0),
      aoAmt: 0,
    });
    lamp(acc, [0.35, s.mastH + 0.05, -2.3], 0.1, '#FF6A3D');
  } else {
    bx(acc, 0.1, s.mastH - top, 0.1, [0.35, top + 0.1, -2.3], s.trim, { aoAmt: 0 });
  }
  if (hi) lamp(acc, [0, D + 0.28, 3.05], 0.09);
  return [0.35, s.mastH + 0.05, -2.3];
}

// ---- 4 design: lantern barge ------------------------------------------------------------------
function barge(acc: Acc, s: CourierShipSpec, hi: boolean): P3 {
  const D = s.hullH;
  hullStack(acc, s, outline(s.kind, s.length, s.beam), hi);
  // aft cabin under a gable roof
  bx(acc, 1.2, 0.6, 1.0, [0, D, -2.0], s.superColor);
  put(acc, gableRoof(0.78, 0.36, 1.2), [0, D + 0.6, -2.0], s.roof, { aoAmt: 0.05 });
  if (hi) {
    lit(acc, 0.05, 0.26, 0.4, [0.61, D + 0.3, -2.0]);
    lit(acc, 0.05, 0.26, 0.4, [-0.61, D + 0.3, -2.0]);
  }
  // patchwork sail: 3 x 3 panels on a mast with yard and boom, bulging to starboard
  const mz = 0.45;
  const mastTop = s.mastH;
  mast(acc, [0, D - 0.1, mz], mastTop - D + 0.1, 0.085, '#8A5A3B', hi);
  const yb = D + 0.55;
  const hS = mastTop - 0.3 - yb;
  const lS = 2.5;
  const cols = hi ? 3 : 1;
  const rows = hi ? 3 : 3;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const f = (u: number, v: number): THREE.Vector3 => {
        const U = (i + u) / cols;
        const Vv = (j + v) / rows;
        return V(
          0.42 * Math.sin(Math.PI * U) * Math.sin(Math.PI * Vv) + 0.04,
          yb + Vv * hS,
          mz - 0.08 - U * lS * (1 - 0.18 * Vv),
        );
      };
      put(
        acc,
        gridSurface(1, 1, f),
        [0, 0, 0],
        s.patches[(j * 3 + i + (hi ? 0 : j)) % s.patches.length],
        {
          double: true,
          aoAmt: 0,
          ao: () => 1,
          windAbs: (p) => clamp01((mz - p.z) / lS) * 0.6,
        },
      );
    }
  if (hi) {
    put(acc, new THREE.BoxGeometry(0.07, 0.07, lS + 0.2), [0, yb, mz - lS / 2 - 0.05], '#8A5A3B', {
      aoAmt: 0,
    });
    // lantern strings from the mast top to a bow and a stern post
    const top = V(0, mastTop - 0.1, mz);
    const posts: Array<[number, number, number]> = [
      [0, 2.3, 1.0],
      [0, -2.6, 1.0],
    ];
    let li = 0;
    for (const [px, pz, ph] of posts) {
      mast(acc, [px, D, pz], ph, 0.05, '#8A5A3B', hi);
      const end = V(px, D + ph, pz);
      const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => {
        const p = top.clone().lerp(end, t);
        p.y -= 0.35 * 4 * t * (1 - t);
        return p;
      });
      put(acc, tubeAlong(pts, 0.018, 3), [0, 0, 0], '#8A5A3B', { aoAmt: 0 });
      for (const t of [0.35, 0.55, 0.78]) {
        const p = top.clone().lerp(end, t);
        p.y -= 0.35 * 4 * t * (1 - t) + 0.14;
        lamp(acc, [p.x, p.y, p.z], 0.1, s.patches[(li++ * 2 + 1) % s.patches.length]);
      }
    }
    // gunwale lanterns on the corners
    for (const sx of [-1, 1]) lamp(acc, [sx * 1.1, D + 0.3, 2.0], 0.09, s.patches[2]);
  }
  return [0, D + 0.3, 2.3];
}

// ---- 2 marketing: catamaran ------------------------------------------------------------------
function catamaran(acc: Acc, s: CourierShipSpec, hi: boolean): P3 {
  const D = s.hullH;
  const hull = outline('yacht', s.length, 0.85);
  for (const sx of [-1, 1]) hullStack(acc, s, hull, hi, sx * 0.95, !hi);
  // trampoline deck between the hulls (top 3 cm over the hull decks: no coplanar faces)
  bx(acc, 2.55, 0.1, 2.7, [0, D - 0.07, -0.1], s.deck, { aoAmt: 0.05 });
  for (const z of [-1.5, 1.3]) bx(acc, 2.2, 0.08, 0.1, [0, D - 0.04, z], s.trim, { aoAmt: 0 });
  // billboard: a tall banner panel along the ship on a mast, stripes + frame
  const bz = 0.0;
  const by = D + 0.75;
  put(acc, cylB(0.08, 0.06, s.mastH - D, hi ? 5 : 3, true), [0, D, bz - 1.1], s.trim, { aoAmt: 0 });
  put(acc, cylB(0.08, 0.06, s.mastH - D - 0.9, hi ? 5 : 3, true), [0, D, bz + 1.1], s.trim, {
    aoAmt: 0,
  });
  bx(acc, 0.08, 1.6, 2.7, [0, by, bz], s.rig, { aoAmt: 0 });
  if (hi) {
    bx(acc, 0.14, 0.34, 2.7, [0, by + 0.28, bz], s.flag.color, { aoAmt: 0 });
    bx(acc, 0.14, 0.34, 2.7, [0, by + 0.95, bz], s.flag.color, { aoAmt: 0 });
    bx(acc, 0.14, 0.12, 2.8, [0, by + 1.6, bz], s.roof, { aoAmt: 0 });
    bx(acc, 0.14, 0.12, 2.8, [0, by - 0.06, bz], s.roof, { aoAmt: 0 });
    // megaphone-ish accent block and star
    bx(acc, 0.16, 0.5, 0.5, [0, by + 0.5, bz - 0.7], s.roof, { aoAmt: 0 });
    // streamers from the mast head, trailing aft
    const top = s.mastH;
    s.patches.forEach((c, i) => {
      const z0 = bz - 1.1;
      const y0 = top - 0.1 - i * 0.12;
      const g = gridSurface(3, 1, (u, v) =>
        V(
          (i - 1.5) * 0.12 + 0.06 * Math.sin(u * 6 + i),
          y0 + v * 0.1 - 0.1 * u,
          z0 - 0.05 - u * (1.1 + 0.15 * i),
        ),
      );
      put(acc, g, [0, 0, 0], c, {
        double: true,
        aoAmt: 0,
        ao: () => 1,
        windAbs: (p) => clamp01((z0 - p.z) / 1.4) * 0.95 + 0.05,
      });
    });
    lamp(acc, [0, D + 0.28, 2.7], 0.09);
    for (const sx of [-1, 1]) lamp(acc, [sx * 0.95, D + 0.25, 2.1], 0.08, s.flag.color);
  } else {
    bx(acc, 0.14, 0.4, 2.7, [0, by + 0.4, bz], s.flag.color, { aoAmt: 0 });
  }
  return [0, s.mastH + 0.05, bz - 1.1];
}

// ---- 3 qa: patrol cutter ----------------------------------------------------------------------
function cutter(acc: Acc, s: CourierShipSpec, hi: boolean): P3 {
  const D = s.hullH;
  hullStack(acc, s, outline(s.kind, s.length, s.beam), hi);
  // raked wheelhouse (side profile: sloped windscreen forward), green roof bar
  put(
    acc,
    prism([V2(-0.95, 0), V2(0.95, 0), V2(0.35, 0.85), V2(-0.95, 0.85)], 1.3).rotateY(-Math.PI / 2),
    [0, D, -1.15],
    s.superColor,
    { aoAmt: 0.12 },
  );
  bx(acc, 1.5, 0.08, 1.45, [0, D + 0.85, -1.4], s.roof, { aoAmt: 0.04 });
  // mast on the roof with crossbar, checklist board, light
  const my = D + 0.93;
  const mz = -1.55;
  mast(acc, [0, my, mz], s.mastH - my, 0.05, s.trim, hi);
  bx(acc, 0.9, 0.05, 0.05, [0, my + 1.5, mz], s.trim, { aoAmt: 0 });
  // checklist board hung aft of the mast: cream board with three ticked rows
  bx(acc, 0.05, 0.78, 0.95, [0, my + 0.55, mz - 0.55], WHITE, { aoAmt: 0 });
  if (hi) {
    for (const r of [0, 1, 2]) {
      bx(acc, 0.09, 0.07, 0.5, [0, my + 0.7 + r * 0.2, mz - 0.4], s.flag.color, { aoAmt: 0 });
      bx(acc, 0.09, 0.07, 0.1, [0, my + 0.7 + r * 0.2, mz - 0.77], s.flag.color, { aoAmt: 0 });
    }
    lamp(acc, [0, s.mastH + 0.08, mz], 0.14);
    for (const sx of [-1, 1]) {
      lit(acc, 0.05, 0.3, 0.55, [sx * 0.7, D + 0.45, -1.35]);
      lit(acc, 0.05, 0.3, 0.55, [sx * 0.7, D + 0.45, -0.65]);
      for (const z of [-0.5, 0.7, 1.5])
        put(
          acc,
          new THREE.IcosahedronGeometry(0.09, 0),
          [sx * (halfAt(s.length, s.beam, z) + 0.02), D - 0.15, z],
          '#666C7A',
          { aoAmt: 0 },
        );
    }
    // radar bar on the roof, bow lantern
    bx(acc, 0.7, 0.06, 0.12, [0.3, D + 0.95, -1.0], s.trim, { aoAmt: 0 });
    lamp(acc, [0, D + 0.28, 2.4], 0.08);
  }
  return [0, s.mastH + 0.08, mz];
}
const WHITE = '#FAFAF5';

// ---- 5 devops: tug ----------------------------------------------------------------------------
function tug(acc: Acc, s: CourierShipSpec, hi: boolean): P3 {
  const D = s.hullH;
  hullStack(acc, s, outline(s.kind, s.length, s.beam), hi);
  bx(acc, 1.5, 1.0, 1.4, [0, D, -0.5], s.superColor);
  bx(acc, 1.7, 0.1, 1.6, [0, D + 1.0, -0.5], s.roof, { aoAmt: 0.04 });
  // smokestack with dark cap
  put(acc, cylB(0.3, 0.24, 0.9, 6), [0, D + 1.1, -0.95], s.trim, { aoAmt: 0.1 });
  // crane: base post, tilted boom, hook line
  const cz = 1.05;
  const tilt = 0.9;
  put(acc, cylB(0.22, 0.2, 0.5, 6), [0, D, cz], s.rig, { aoAmt: 0.1 });
  put(acc, new THREE.BoxGeometry(0.13, 0.13, 2.1).translate(0, 0, 1.05), [0, D + 0.5, cz], s.rig, {
    q: qEuler(-tilt, 0, 0),
    aoAmt: 0.05,
  });
  const tipY = D + 0.5 + Math.sin(tilt) * 2.1;
  const tipZ = cz + Math.cos(tilt) * 2.1;
  if (hi) {
    put(
      acc,
      new THREE.BoxGeometry(0.03, 0.9, 0.03).translate(0, -0.45, 0),
      [0, tipY, tipZ],
      s.trim,
      { aoAmt: 0 },
    );
    put(acc, new THREE.IcosahedronGeometry(0.1, 0), [0, tipY - 0.95, tipZ], s.trim, { aoAmt: 0 });
    lit(acc, 1.2, 0.3, 0.05, [0, D + 0.65, 0.21]);
    for (const sx of [-1, 1]) lit(acc, 0.05, 0.3, 0.8, [sx * 0.76, D + 0.65, -0.5]);
    // spare parts deck: barrels, a cog, a pallet and a tool chest
    for (const sx of [-1, 1]) {
      put(acc, cylB(0.2, 0.2, 0.42, 6), [sx * 0.78, D, 0.75], '#8A5A3B', { aoAmt: 0.1 });
    }
    put(acc, cylB(0.34, 0.34, 0.08, 8), [-0.55, D + 0.05, 1.6], s.rig, {
      q: qEuler(Math.PI / 2.2, 0, 0.3),
      aoAmt: 0,
    });
    bx(acc, 0.5, 0.18, 0.4, [0.6, D, 1.7], '#C9A06B', { aoAmt: 0.1 });
    bx(acc, 0.4, 0.22, 0.28, [0.6, D + 0.18, 1.7], s.roof, { aoAmt: 0.1 });
    // tyre fenders on the hull sides
    for (const sx of [-1, 1])
      for (const z of [-1.0, 0.1, 1.2]) {
        const hx = halfAt(s.length, s.beam, z) + 0.05;
        put(acc, new THREE.TorusGeometry(0.16, 0.07, 3, 6), [sx * hx, D - 0.2, z], '#4F4A5E', {
          q: qEuler(0, Math.PI / 2, 0),
          aoAmt: 0,
        });
      }
    lamp(acc, [0, D + 1.2, 0.1], 0.1);
  }
  return [0, D + 1.2, 0.1];
}

// ---- 6 research: survey vessel ----------------------------------------------------------------
function survey(acc: Acc, s: CourierShipSpec, hi: boolean): P3 {
  const D = s.hullH;
  hullStack(acc, s, outline(s.kind, s.length, s.beam), hi);
  // forward bridge, white roof, mast with dish and cups
  bx(acc, 1.5, 0.9, 1.4, [0, D, 0.9], s.superColor);
  bx(acc, 1.65, 0.08, 1.55, [0, D + 0.9, 0.9], s.roof, { aoAmt: 0.04 });
  const my = D + 0.98;
  mast(acc, [0, my, 0.6], s.mastH - my, 0.055, WHITE, hi);
  put(
    acc,
    lathe(
      [
        [0, 0],
        [0.16, 0.04],
        [0.3, 0.14],
        [0.4, 0.3],
      ],
      hi ? 8 : 5,
    ),
    [0, my + 1.45, 0.6],
    s.flag.color,
    {
      q: qEuler(Math.PI / 2 - 0.5, 0, 0),
      double: true,
      aoAmt: 0,
    },
  );
  if (hi) {
    bx(acc, 0.9, 0.05, 0.05, [0, my + 1.0, 0.6], WHITE, { aoAmt: 0 });
    bx(acc, 0.6, 0.05, 0.05, [0, my + 2.0, 0.6], WHITE, { aoAmt: 0 });
    for (const sx of [-1, 1]) {
      put(acc, new THREE.ConeGeometry(0.06, 0.16, 4), [sx * 0.42, my + 1.08, 0.6], s.trim, {
        q: qEuler(0, 0, (sx * Math.PI) / 2),
        aoAmt: 0,
      });
      lit(acc, 0.05, 0.3, 0.9, [sx * 0.76, D + 0.55, 0.9]);
    }
    lit(acc, 1.3, 0.3, 0.05, [0, D + 0.55, 1.61]);
    lamp(acc, [0, s.mastH + 0.06, 0.6], 0.1);
    // afterdeck: winch drum, two survey buoys, A-frame gantry
    put(acc, cylB(0.26, 0.26, 0.5, 6), [0, D, -0.75], s.trim, { aoAmt: 0.1 });
    for (const sx of [-1, 1]) {
      put(acc, new THREE.IcosahedronGeometry(0.22, 0), [sx * 0.7, D + 0.2, -0.55], s.trim, {
        aoAmt: 0.1,
      });
      bx(acc, 0.1, 1.5, 0.1, [sx * 0.8, D, -3.0], '#FF9F43', { aoAmt: 0 });
      bx(acc, 0.7, 0.35, 0.5, [sx * 0.75, D, -1.4], '#666C7A', { aoAmt: 0.1 });
    }
    bx(acc, 1.7, 0.1, 0.1, [0, D + 1.45, -3.0], '#FF9F43', { aoAmt: 0 });
  }
  return [0, s.mastH + 0.06, 0.6];
}

const BUILDERS: Record<CourierShipSpec['kind'], (a: Acc, s: CourierShipSpec, hi: boolean) => P3> = {
  yacht,
  feeder,
  barge,
  catamaran,
  cutter,
  tug,
  survey,
};

/**
 * `variant` = index into `THEME_IDS` (0 hq ... 6 research). LOD0 <= 900 tris, LOD1 (hull + deckhouse
 * + rig silhouette) <= 250. Hook `lantern` = the mast lantern (emissive class 1).
 */
export function courierShip({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const s = courierSpec(variant);
  const acc = jitterAcc(rng, 0.02);
  const lantern = BUILDERS[s.kind](acc, s, lod === 0);
  const g = acc.finish(rng, true, true);
  g.userData.hooks = { lantern: { pivot: lantern } };
  g.userData.crates = s.crates;
  g.userData.theme = THEME_IDS[variant];
  g.userData.accent = THEMES[THEME_IDS[variant]].accent;
  return g;
}

/** Small banded crate in the theme accent (pivot: base centre). <= 60 tris at LOD0, one box at LOD1. */
export function courierCrate({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const s = courierSpec(variant);
  const acc = jitterAcc(rng, 0.02);
  const body = '#D2A679';
  bx(acc, 0.46, 0.34, 0.42, [0, 0, 0], lod === 0 ? body : s.accent, { aoAmt: 0.12 });
  if (lod === 0) {
    for (const z of [-0.12, 0.12])
      bx(acc, 0.5, 0.38, 0.07, [0, -0.02, z], s.accent, { aoAmt: 0.05 });
    bx(acc, 0.22, 0.04, 0.2, [0, 0.34, 0], '#FAFAF5', { aoAmt: 0 });
  }
  return acc.finish(rng, false, true);
}

/** Report scroll (variant 0 ok cream + gold ribbon, 1 fail red ribbon): a rolled sheet on its side. */
export function reportScroll({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const c = variant === 1 ? REPORT_SCROLL.fail : REPORT_SCROLL.ok;
  const acc = jitterAcc(rng, 0.02);
  const seg = lod === 0 ? 6 : 4;
  const roll = (r: number, len: number, open: boolean): THREE.BufferGeometry =>
    cylB(r, r, len, seg, open)
      .translate(0, -len / 2, 0)
      .rotateZ(Math.PI / 2)
      .translate(0, r, 0);
  put(acc, roll(0.09, 0.42, lod === 1), [0, 0, 0], c.paper, { aoAmt: 0.1 });
  if (lod === 0) put(acc, roll(0.105, 0.1, true), [0, 0, 0], c.ribbon, { aoAmt: 0 });
  return acc.finish(rng, false, true);
}
