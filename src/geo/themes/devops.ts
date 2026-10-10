/**
 * devops theme structure geometry (M14b, TASK-376); defs: content/props-themes/devops.ts.
 *
 * coolingTower (T0 landmark), pipe, cableSpool, steamVent, warningSign, basaltBoulder, rackRow.
 * LOD1 of every builder uses the SAME palette + silhouette (D-031/D-032), same attribute set as the
 * cottage (+ emissive).
 *
 * Hooks for TASK-384 / worldgen (in `geometry.userData.hooks`; coordinates in the prop's local frame):
 * - coolingTower / steamVent: `emitter` [x, y, z] = steam emitter spot (preset 'vent' of EMITTERS /
 *   settlement-props emitters; scaled by the instance scale).
 * - pipe: `pulse` = { r, segments: [[x0,y,z0,x1,y,z1], ...] }: the tube centre-lines; the body is the
 *   `pipe` colour (DEVOPS_COLORS.pipe) so a shader can lay a data pulse along each segment.
 *   Connection points: straight / valve: (-1, 0.5, 0) <-> (1, 0.5, 0); elbow (variant 1):
 *   (-1, 0.5, 0) <-> (0, 0.5, 1).
 * - rackRow: LED faces carry emissive 2 (screen / LED class), so the blink pattern can key on it.
 */
import * as THREE from 'three';
import {
  COOLING_TOWER_HEIGHTS,
  COOLING_TOWER_RISE,
  DEVOPS_COLORS as K,
} from '../../content/props-themes/devops.ts';
import type { Rng } from '../../core/rng.ts';
import { Acc, blob, col, createNoise, qEuler } from '../kit.ts';
import { TAU, V, V2, baseBox, cylB, jitterAcc, lathe, prism, put, tubeAlong } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { accVerts } from './coding.ts';
import { tagPulse, tagScreens, type VertexRange } from './surface-tags.ts';

const finish = (acc: Acc, rng: Rng): THREE.BufferGeometry => acc.finish(rng, false, true);

export function coolingTower({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('cooling');
  // built at the old size, stretched taller at the end (same footprint, steeper hyperboloid)
  const H = COOLING_TOWER_HEIGHTS[variant % COOLING_TOWER_HEIGHTS.length] / COOLING_TOWER_RISE;
  const s = H / 8;
  const yw = 0.68 * H;
  const Rw = 1.6 * s * (variant === 1 ? 0.95 : 1);
  const c = 4.53 * s;
  const rr = (y: number): number => Rw * Math.sqrt(1 + ((y - yw) / c) ** 2);
  const seg = lod === 0 ? 12 : 7;
  const louvre = 0.8 * s;
  const rim = 0.45 * s;
  const ys =
    lod === 0
      ? [0, louvre, 2 * s, 3.4 * s, 4.8 * s, yw, 6.5 * s, H - rim, H]
      : [0, louvre, yw, H - rim, H];
  const acc = jitterAcc(rng, 0.015);
  const dark = col(K.concreteDark);
  const conc = col(K.concrete);
  const accent = col(K.accent);
  const phase = r.range(0, TAU);
  const outer = lathe(
    ys.map((y) => [rr(y), y] as const),
    seg,
  ).rotateY(phase);
  put(
    acc,
    outer,
    [0, 0, 0],
    (p) =>
      p.y < louvre
        ? dark
        : p.y > H - rim
          ? accent
          : conc.clone().lerp(dark, 0.45 * (1 - Math.min(1, (p.y - louvre) / (H * 0.6)))),
    { aoAmt: 0.25 },
  );
  // open top: inner wall + floor, dark so the tower reads hollow from above
  const inner = lathe(
    [
      [rr(H) + 0.02, H],
      [rr(H) - 0.16 * s, H],
      [rr(H) - 0.2 * s, H - 0.6 * s],
      [0, H - 1.1 * s],
    ],
    seg,
  ).rotateY(phase);
  put(acc, inner, [0, 0, 0], (p) => (p.y > H - 0.01 ? accent : col(K.dark)), { aoAmt: 0 });
  // concrete pad
  put(acc, cylB(rr(0) + 0.55, rr(0) + 0.45, 0.14, seg), [0, 0, 0], dark, { aoAmt: 0.2 });
  const arches = lod === 0 ? 8 : 0;
  for (let i = 0; i < arches; i++) {
    const a = phase + (i / arches) * TAU;
    const rad = rr(0.35 * s) + 0.03;
    put(
      acc,
      baseBox(0.5 * s, 0.62 * s, 0.1),
      [Math.sin(a) * rad, 0.14, Math.cos(a) * rad],
      col(K.dark),
      { q: qEuler(0, a, 0), aoAmt: 0 },
    );
  }
  if (lod === 0) {
    // red aviation lamps on the rim (night glow)
    for (const a of [phase + 0.6, phase + 0.6 + Math.PI])
      put(
        acc,
        new THREE.IcosahedronGeometry(0.1 * s, 0),
        [Math.sin(a) * (rr(H) - 0.05), H + 0.08, Math.cos(a) * (rr(H) - 0.05)],
        col(K.lamp),
        { emissive: 1, ao: () => 1, aoAmt: 0 },
      );
  }
  if (variant === 1) {
    // intake pipe out of the foot (+x) with an accent band, then a stub down to the pad
    const R0 = rr(0.5 * s);
    put(
      acc,
      new THREE.CylinderGeometry(0.2, 0.2, 1.4, lod === 0 ? 8 : 5, 1, true).rotateZ(Math.PI / 2),
      [R0 + 0.55, 0.5, 0],
      col(K.pipe),
      { aoAmt: 0.1 },
    );
    put(
      acc,
      new THREE.CylinderGeometry(0.235, 0.235, 0.18, lod === 0 ? 8 : 5, 1, true).rotateZ(
        Math.PI / 2,
      ),
      [R0 + 0.75, 0.5, 0],
      accent,
      { aoAmt: 0 },
    );
  }
  const g = finish(acc, rng).scale(1, COOLING_TOWER_RISE, 1);
  g.userData.hooks = { emitter: [0, (H + 0.2) * COOLING_TOWER_RISE, 0] };
  return g;
}

function tubeX(
  acc: Acc,
  x0: number,
  x1: number,
  z: number,
  rad: number,
  seg: number,
  color: string,
  y = 0.5,
): void {
  put(
    acc,
    new THREE.CylinderGeometry(rad, rad, Math.abs(x1 - x0), seg, 1, true).rotateZ(Math.PI / 2),
    [(x0 + x1) / 2, y, z],
    color,
    { aoAmt: 0.1 },
  );
}

function tubeZ(
  acc: Acc,
  x: number,
  z0: number,
  z1: number,
  rad: number,
  seg: number,
  color: string,
  y = 0.5,
): void {
  put(
    acc,
    new THREE.CylinderGeometry(rad, rad, Math.abs(z1 - z0), seg, 1, true).rotateX(Math.PI / 2),
    [x, y, (z0 + z1) / 2],
    color,
    { aoAmt: 0.1 },
  );
}

export function pipe({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.02);
  const hi = lod === 0;
  const seg = hi ? 8 : 5;
  const rad = 0.17;
  const elbow = variant % 3 === 1;
  const segments: number[][] = elbow
    ? [
        [-1, 0.5, 0, 0, 0.5, 0],
        [0, 0.5, 0, 0, 0.5, 1],
      ]
    : [[-1, 0.5, 0, 1, 0.5, 0]];
  // TASK-384: the pipe-colour tube bodies carry the data-pulse tag (axis in object space)
  const pulses: Array<[VertexRange, 'x' | 'z']> = [];
  const body = (axis: 'x' | 'z', draw: () => void): void => {
    const first = accVerts(acc);
    draw();
    pulses.push([{ first, count: accVerts(acc) - first }, axis]);
  };
  if (elbow) {
    body('x', () => tubeX(acc, -1, 0, 0, rad, seg, K.pipe));
    body('z', () => tubeZ(acc, 0, 0, 1, rad, seg, K.pipe));
    put(acc, new THREE.IcosahedronGeometry(rad * 1.25, 0), [0, 0.5, 0], K.pipe, { aoAmt: 0 });
    tubeX(acc, -0.62, -0.38, 0, rad * 1.14, seg, K.accent);
    tubeZ(acc, 0, 0.5, 0.74, rad * 1.14, seg, K.accent);
    if (hi) {
      put(acc, new THREE.CylinderGeometry(rad * 1.3, rad * 1.3, 0.12, 8), [0, 0.5, 0], K.flange, {
        aoAmt: 0,
      });
      // inspection gauge on the bend: stem + dial
      put(acc, cylB(0.025, 0.025, 0.2, 4, true), [0, 0.62, 0], K.flange, { aoAmt: 0 });
      put(
        acc,
        new THREE.CylinderGeometry(0.09, 0.09, 0.04, 8).rotateX(Math.PI / 2),
        [0, 0.88, 0],
        K.valve,
        {
          aoAmt: 0,
        },
      );
    }
  } else {
    body('x', () => tubeX(acc, -1, 1, 0, rad, seg, K.pipe));
    tubeX(acc, -0.62, -0.38, 0, rad * 1.14, seg, K.accent);
    if (variant !== 2) tubeX(acc, 0.38, 0.62, 0, rad * 1.14, seg, K.accent);
  }
  if (hi) {
    const flangeAt: Array<[number, number, boolean]> = elbow
      ? [
          [-0.96, 0, true],
          [0, 0.96, false],
        ]
      : [
          [-0.96, 0, true],
          [0.96, 0, true],
        ];
    for (const [a, b, alongX] of flangeAt) {
      put(
        acc,
        new THREE.CylinderGeometry(rad * 1.38, rad * 1.38, 0.07, 8),
        [alongX ? a : 0, 0.5, alongX ? 0 : b],
        K.flange,
        {
          q: alongX ? qEuler(0, 0, Math.PI / 2) : qEuler(Math.PI / 2, 0, 0),
          aoAmt: 0,
        },
      );
    }
  }
  // trestle supports
  const supports: Array<[number, number, boolean]> = elbow
    ? [
        [-0.58, 0, true],
        [0, 0.62, false],
      ]
    : [
        [-0.55, 0, true],
        [0.55, 0, true],
      ];
  for (const [a, b, alongX] of supports) {
    const x = alongX ? a : 0;
    const z = alongX ? 0 : b;
    if (hi) {
      put(acc, baseBox(alongX ? 0.14 : 0.42, 0.3, alongX ? 0.42 : 0.14), [x, 0, z], K.support, {
        aoAmt: 0.2,
      });
      put(acc, baseBox(alongX ? 0.16 : 0.34, 0.06, alongX ? 0.34 : 0.16), [x, 0.3, z], K.flange, {
        aoAmt: 0,
      });
    } else {
      put(acc, cylB(0.14, 0.12, 0.34, 3, true), [x, 0, z], K.support, { aoAmt: 0.1 });
    }
  }
  if (variant === 2) {
    // valve: body block, stem, red hand wheel
    put(acc, baseBox(0.28, 0.2, 0.28), [0, 0.4, 0], K.support, { aoAmt: 0.1 });
    if (hi) {
      put(acc, cylB(0.03, 0.03, 0.34, 4, true), [0, 0.6, 0], K.flange, { aoAmt: 0 });
      put(
        acc,
        new THREE.TorusGeometry(0.13, 0.025, 4, 8).rotateX(Math.PI / 2),
        [0, 0.96, 0],
        K.valve,
        {
          aoAmt: 0,
        },
      );
      put(acc, new THREE.BoxGeometry(0.26, 0.025, 0.025), [0, 0.96, 0], K.valve, { aoAmt: 0 });
    } else {
      put(acc, baseBox(0.28, 0.1, 0.28), [0, 0.9, 0], K.valve, { aoAmt: 0 });
    }
  }
  const g = finish(acc, rng);
  g.userData.hooks = { pulse: { r: rad, segments } };
  for (const [r, axis] of pulses) tagPulse(g, r, axis);
  return g;
}

export function cableSpool({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.03);
  const r = rng.fork('spool');
  const hi = lod === 0;
  const seg = hi ? 12 : 5;
  const flat = variant % 2 === 1;
  const R = 0.42;
  const yc = flat ? 0.0 : R;
  // axis: z (standing on its rim) or y (lying flat, y rotation only matters for the cable tail)
  const qAxis = flat ? qEuler(0, 0, 0) : qEuler(Math.PI / 2, 0, 0);
  const cy = (len: number, rad: number): THREE.BufferGeometry =>
    new THREE.CylinderGeometry(rad, rad, len, seg);
  const wd = col(K.spoolWood);
  const wdd = col(K.spoolWoodDark);
  const along = (t: number): THREE.Vector3 => (flat ? V(0, yc + t, 0) : V(0, yc, t));
  for (const t of [-0.17, 0.17])
    put(acc, cy(0.06, R), along(t + (flat ? 0.2 : 0)), wd, { q: qAxis, aoAmt: 0.15 });
  const off = flat ? 0.2 : 0;
  if (hi) put(acc, cy(0.34, 0.12), along(off), wdd, { q: qAxis, aoAmt: 0 });
  put(acc, cy(0.28, 0.31), along(off), col(K.cable), { q: qAxis, aoAmt: 0.05 });
  if (hi) put(acc, cy(0.07, 0.325), along(off), col(K.cableBlack), { q: qAxis, aoAmt: 0 });
  if (flat && hi) {
    // trailing cable tail on the ground
    const a = r.range(0, TAU);
    const pts = [0.3, 0.55, 0.85, 1.15, 1.4].map((d, i) =>
      V(Math.cos(a + i * 0.35) * d, 0.04, Math.sin(a + i * 0.35) * d),
    );
    put(acc, tubeAlong(pts, 0.035, 3), [0, 0, 0], col(K.cable), { aoAmt: 0 });
  }
  return finish(acc, rng);
}

export function steamVent({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = new Acc();
  const r = rng.fork('vent');
  const hi = lod === 0;
  const noise = createNoise(r.fork('n'));
  const basalt = col(K.basalt);
  const light = col(K.basaltLight);
  const mound = blob(0.55, hi ? 1 : 0, noise, 0.18, 1.3, variant * 3.7);
  acc.add(mound, {
    m: new THREE.Matrix4().compose(V(0, 0.08, 0), qEuler(0, r.range(0, TAU), 0), V(1, 0.6, 1)),
    color: (p) => (p.y > 0.2 ? light : basalt),
    windMul: 0,
    cullY: 0.01,
    groundClamp: true,
    aoAmt: 0.2,
  });
  const stubs: Array<[number, number, number]> =
    variant % 2 === 0
      ? [[0, 0, 0.55]]
      : [
          [-0.16, 0.04, 0.5],
          [0.2, -0.1, 0.36],
        ];
  stubs.forEach(([x, z, h], i) => {
    put(acc, cylB(0.1, 0.085, h, hi ? 6 : 4, true), [x, 0.15, z], i === 0 ? K.support : K.flange, {
      aoAmt: 0.1,
    });
    put(
      acc,
      cylB(0.13, 0.13, 0.07, hi ? 6 : 4),
      [x, 0.15 + h - 0.02, z],
      i === 0 ? K.accent : K.hazard,
      { aoAmt: 0 },
    );
  });
  if (hi) {
    for (let i = 0; i < 5; i++) {
      const a = r.range(0, TAU);
      const d = r.range(0.45, 0.65);
      put(
        acc,
        new THREE.IcosahedronGeometry(r.range(0.07, 0.12), 0),
        [Math.cos(a) * d, 0.06, Math.sin(a) * d],
        basalt,
        {
          aoAmt: 0.2,
          groundClamp: true,
        },
      );
    }
  }
  const g = finish(acc, rng);
  g.userData.hooks = { emitter: [stubs[0][0], 0.15 + stubs[0][2] + 0.1, stubs[0][1]] };
  return g;
}

export function warningSign({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.03);
  const hi = lod === 0;
  const yellow = col(K.hazard);
  const black = col(K.hazardBlack);
  if (variant % 2 === 0) {
    put(acc, cylB(0.035, 0.035, 1.25, hi ? 5 : 3, true), [0, 0, 0], K.support, { aoAmt: 0.1 });
    if (hi) put(acc, baseBox(0.3, 0.06, 0.3), [0, 0, 0], K.support, { aoAmt: 0.2 });
    const tri = (w: number, h: number): THREE.Vector2[] => [V2(-w / 2, 0), V2(w / 2, 0), V2(0, h)];
    put(acc, prism(tri(0.95, 0.82), 0.04), [0, 0.78, 0.0], black, { aoAmt: 0 });
    put(
      acc,
      prism([V2(-0.36, 0.07), V2(0.36, 0.07), V2(0, 0.62)], 0.05),
      [0, 0.78, 0.012],
      yellow,
      {
        aoAmt: 0,
      },
    );
    if (hi) {
      put(acc, baseBox(0.07, 0.24, 0.02), [0, 0.93, 0.04], black, { aoAmt: 0 });
      put(acc, baseBox(0.07, 0.07, 0.02), [0, 0.84, 0.04], black, { aoAmt: 0 });
      for (const sx of [-0.2, 0.2])
        put(acc, baseBox(0.03, 0.03, 0.03), [sx, 0.86, 0.03], K.flange, { aoAmt: 0 });
    }
  } else {
    // striped barrier plank on two posts
    const n = 8;
    const w = 1.5;
    const plank = new THREE.BoxGeometry(w, 0.22, 0.06, hi ? n : 2, 1, 1).translate(0, 0.22 / 2, 0);
    put(
      acc,
      plank,
      [0, 0.58, 0],
      (p) => (Math.floor((p.x + w / 2) / (w / (hi ? n : 2))) % 2 === 0 ? yellow : black),
      {
        aoAmt: 0,
      },
    );
    for (const sx of [-0.62, 0.62]) {
      put(acc, cylB(0.04, 0.04, 0.62, hi ? 5 : 3, true), [sx, 0, 0], K.support, { aoAmt: 0.1 });
      if (hi) put(acc, baseBox(0.22, 0.05, 0.3), [sx, 0, 0], K.support, { aoAmt: 0.2 });
    }
    if (hi)
      put(acc, new THREE.IcosahedronGeometry(0.06, 0), [0, 0.87, 0], K.lamp, {
        emissive: 1,
        ao: () => 1,
        aoAmt: 0,
      });
  }
  return finish(acc, rng);
}

export function basaltBoulder({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('basalt');
  const acc = new Acc();
  const hi = lod === 0;
  const basalt = col(K.basalt);
  const light = col(K.basaltLight);
  const cls = variant % 3;
  if (cls < 2) {
    const noise = createNoise(r.fork('n'));
    const R = cls === 0 ? 0.5 : 0.95;
    const n = hi ? (cls === 0 ? 2 : 3) : 1;
    const H = cls === 0 ? 0.7 : 1.3;
    for (let i = 0; i < n; i++) {
      const rad = i === 0 ? R : R * r.range(0.4, 0.55);
      const a = r.range(0, TAU);
      const d = i === 0 ? 0 : R * 0.95;
      acc.add(blob(rad, hi && i === 0 ? 1 : 0, noise, 0.22, 1.1, i * 5.5), {
        m: new THREE.Matrix4().compose(
          V(Math.cos(a) * d, rad * 0.4, Math.sin(a) * d),
          qEuler(0, r.range(0, TAU), 0),
          V(1, 0.85, 1.05),
        ),
        color: (p) => (p.y > H * 0.62 ? light : basalt),
        windMul: 0,
        cullY: 0.01,
        groundClamp: true,
        aoAmt: 0.22,
      });
    }
  } else {
    // hexagonal basalt columns (giant's causeway cluster), tallest in the middle
    const count = hi ? 12 : 3;
    const spots: Array<[number, number, number]> = [[0, 0, 2.2]];
    const ring = hi ? 11 : 2;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * TAU + r.range(-0.2, 0.2);
      const d = (hi ? (i % 2 === 0 ? 0.52 : 0.9) : 0.62) * r.range(0.95, 1.05);
      spots.push([
        Math.cos(a) * d,
        Math.sin(a) * d,
        (hi ? (i % 2 === 0 ? 1.5 : 0.8) : 1.2) * r.range(0.8, 1.15),
      ]);
    }
    for (const [x, z, h] of spots.slice(0, count)) {
      const rad = hi ? r.range(0.2, 0.28) : 0.3;
      put(acc, cylB(rad, rad * 0.96, h, 6, true), [x, 0, z], basalt, { aoAmt: 0.25 });
      put(acc, new THREE.CircleGeometry(rad * 0.96, 6).rotateX(-Math.PI / 2), [x, h, z], light, {
        aoAmt: 0,
      });
    }
  }
  return finish(acc, rng);
}

/** One outdoor server cabinet at (x, z) facing +z. */
function cabinet(acc: Acc, x: number, z: number, h: number, lod: 0 | 1, led: number): void {
  const w = 0.62;
  const d = 0.7;
  put(acc, baseBox(w, h, d), [x, 0.05, z], K.rack, { aoAmt: 0.2 });
  if (lod === 0) {
    put(acc, baseBox(w + 0.06, 0.05, d + 0.06), [x, 0, z], K.rackDark, { aoAmt: 0.1 });
    put(acc, baseBox(w * 0.82, h * 0.82, 0.04), [x, 0.05 + h * 0.09, z + d / 2 + 0.01], K.dark, {
      aoAmt: 0,
    });
    for (let i = 0; i < 3; i++)
      put(acc, baseBox(w * 0.7, 0.05, 0.03), [x, 0.35 + i * 0.28, z + d / 2 + 0.035], K.rackDark, {
        aoAmt: 0,
      });
    for (let i = 0; i < 4; i++)
      put(
        acc,
        new THREE.PlaneGeometry(0.07, 0.04),
        [x - 0.2 + i * 0.13, 0.05 + h * 0.78, z + d / 2 + 0.04],
        K.led[(i + led) % 3],
        {
          emissive: 2,
          aoAmt: 0,
          ao: () => 1,
        },
      );
    put(acc, cylB(0.17, 0.17, 0.06, 6), [x, 0.05 + h, z], K.rackDark, { aoAmt: 0 });
  } else {
    put(
      acc,
      new THREE.PlaneGeometry(0.2, 0.05),
      [x, 0.05 + h * 0.78, z + d / 2 + 0.01],
      K.led[led % 3],
      {
        emissive: 2,
        aoAmt: 0,
        ao: () => 1,
      },
    );
  }
}

export function rackRow({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.03);
  const r = rng.fork('racks');
  const led0 = r.int(0, 2);
  if (variant % 2 === 0) {
    // three cabinets under an accent lean-to canopy
    const n = 3;
    const sp = 0.74;
    for (let i = 0; i < n; i++) cabinet(acc, (i - 1) * sp, 0, 1.5, lod, led0 + i);
    const w = n * sp + 0.4;
    put(acc, baseBox(w, 0.09, 1.3), [0, 1.82, 0.02], K.accent, {
      q: qEuler(-0.08, 0, 0),
      aoAmt: 0.05,
    });
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        put(
          acc,
          cylB(0.03, 0.03, 1.85, lod === 0 ? 4 : 3, true),
          [sx * (w / 2 - 0.06), 0, sz * 0.55],
          K.support,
          {
            aoAmt: 0.1,
          },
        );
  } else {
    // two cabinets + a chiller unit with a fan grille
    for (let i = 0; i < 2; i++) cabinet(acc, -0.9 + i * 0.74, 0, 1.5, lod, led0 + i);
    const cx = 0.7;
    put(acc, baseBox(1.1, 1.0, 0.8), [cx, 0.05, 0], K.concreteDark, { aoAmt: 0.2 });
    put(acc, baseBox(1.16, 0.06, 0.86), [cx, 1.05, 0], K.accent, { aoAmt: 0 });
    if (lod === 0) {
      put(
        acc,
        new THREE.CylinderGeometry(0.32, 0.32, 0.03, 10).rotateX(Math.PI / 2),
        [cx, 0.6, 0.42],
        K.dark,
        { aoAmt: 0 },
      );
      for (let k = 0; k < 2; k++)
        put(acc, new THREE.BoxGeometry(0.62, 0.04, 0.03), [cx, 0.6, 0.44], K.flange, {
          q: qEuler(0, 0, (k * Math.PI) / 2 + 0.3),
          aoAmt: 0,
        });
    } else {
      put(acc, new THREE.PlaneGeometry(0.5, 0.5), [cx, 0.6, 0.42], K.dark, { aoAmt: 0 });
    }
  }
  // TASK-384: LED strips blink (screen-class patches → LED dot grids)
  const g = finish(acc, rng);
  tagScreens(g, 'led');
  return g;
}

export const DEVOPS_GEO: readonly PropGeoDef[] = [
  {
    id: 'coolingTower',
    variants: 2,
    build: coolingTower,
    footprint: 2.6,
    height: 8,
    heights: COOLING_TOWER_HEIGHTS,
    windy: false,
  },
  {
    id: 'pipe',
    variants: 3,
    build: pipe,
    footprint: 1.0,
    height: 1.0,
    heights: [0.7, 0.95, 1.05],
    windy: false,
  },
  {
    id: 'cableSpool',
    variants: 2,
    build: cableSpool,
    footprint: 0.7,
    height: 0.84,
    heights: [0.84, 0.45],
    windy: false,
  },
  {
    id: 'steamVent',
    variants: 2,
    build: steamVent,
    footprint: 0.5,
    height: 0.7,
    heights: [0.7, 0.65],
    windy: false,
  },
  {
    id: 'warningSign',
    variants: 2,
    build: warningSign,
    footprint: 0.4,
    height: 1.3,
    heights: [1.45, 0.9],
    windy: false,
  },
  {
    id: 'basaltBoulder',
    variants: 3,
    build: basaltBoulder,
    footprint: 1.2,
    height: 1.3,
    heights: [0.7, 1.3, 2.2],
    windy: false,
  },
  {
    id: 'rackRow',
    variants: 2,
    build: rackRow,
    footprint: 1.6,
    height: 1.9,
    heights: [1.9, 1.6],
    windy: false,
  },
];
