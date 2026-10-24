/**
 * Research M22 quick-win geometry (TASK-483; numbers in content/props-themes/research.ts RESEARCH_M22
 * and research-maze.ts). Builders that the stock Research defs call for their new variants, so no
 * existing look changes:
 *  - `mazeTile`: hedgeParterre v2-v5 (R12), a 4 x 4 cell hedge maze inside the parterre frame.
 *  - `weatherHead`: labPod v2 (R20), a yawing anemometer head (cup wheel, vane tail, red arrow) on the
 *    pod roof. The head is `aSpin` tagged: the cups spin, the whole head yaws into the wind.
 *  - `launchGantry`: rocketMonument v1 (R13), a red lattice tower with swing arm, hoses and floodlights
 *    beside the stock rocket, and the steam trench under it.
 *  - `specimenPlate`: chalkboard v3 (R9), a brass plate with a leaf on an oak post.
 * Local frame: ground at y = 0, front on +z, 1 u = 1 m.
 */
import * as THREE from 'three';
import {
  RESEARCH_CULTURE_KIT as K,
  RESEARCH_M22 as M,
} from '../../content/props-themes/research.ts';
import {
  MAZE,
  mazeCentre,
  mazeOf,
  type MazeSide,
} from '../../content/props-themes/research-maze.ts';
import { SCIENCE_PALETTE as S } from '../../content/themes/research.ts';
import { gradY, qEuler, qFromTo, type Acc } from '../kit.ts';
import type { Spin } from '../office-kit.ts';
import { TAU, V, baseBox, cylB, put, ropePoints, tubeAlong } from '../parts.ts';
import { accVerts } from './coding.ts';

const PI = Math.PI;
const Y = V(0, 1, 0);
const lit = { emissive: 1, ao: () => 1, aoAmt: 0 } as const;

/* ------------------------------------ hedge maze ------------------------------------ */

/** True when the frame cell `at` of `side` is open in the pattern. */
const isOpen = (open: readonly { side: MazeSide; at: number }[], side: MazeSide, at: number) =>
  open.some((o) => o.side === side && o.at === at);

/**
 * The maze tile on its gravel pad: frame hedge with the two openings, inner walls, and flowering
 * dead ends (LOD0). At LOD1 the hedges are flat tops only (what the top view shows).
 */
export function mazeTile(acc: Acc, variant: number, hi: boolean): void {
  const P = mazeOf(variant);
  const N = MAZE.cells;
  const hc = gradY([S.hedge, S.hedgeTop], 0.06, 0.5);
  const y0 = 0.06;
  const h = MAZE.height;
  const bar = (x: number, z: number, w: number, d: number): void => {
    if (hi) {
      put(acc, baseBox(w, h, d), [x, y0, z], hc, { aoAmt: 0.1 });
      return;
    }
    // LOD1: a top and the two long sides only (6 tris instead of 12; the colour keeps its weight)
    const o = { aoAmt: 0.05 };
    put(acc, new THREE.PlaneGeometry(w, d).rotateX(-PI / 2), [x, y0 + h, z], hc, o);
    const yc = y0 + h / 2;
    if (w >= d)
      for (const s of [-1, 1])
        put(
          acc,
          new THREE.PlaneGeometry(w, h).rotateY(s > 0 ? 0 : PI),
          [x, yc, z + (s * d) / 2],
          hc,
          o,
        );
    else
      for (const s of [-1, 1])
        put(
          acc,
          new THREE.PlaneGeometry(d, h).rotateY((s * PI) / 2),
          [x + (s * w) / 2, yc, z],
          hc,
          o,
        );
  };
  put(acc, baseBox(MAZE.half * 2 + 0.2, 0.06, MAZE.half * 2 + 0.2), [0, 0, 0], S.gravel, {
    aoAmt: 0.1,
  });
  const F = MAZE.frame;
  const H = MAZE.half;
  const seg = MAZE.pitch;
  // corner posts + frame cells (openings skipped)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(sx * H, sz * H, F, F);
  for (let i = 0; i < N; i++) {
    const c = mazeCentre(i);
    if (!isOpen(P.open, 'S', i)) bar(c, H, seg - F * 0.2, F);
    if (!isOpen(P.open, 'N', i)) bar(c, -H, seg - F * 0.2, F);
    if (!isOpen(P.open, 'E', i)) bar(H, c, F, seg - F * 0.2);
    if (!isOpen(P.open, 'W', i)) bar(-H, c, F, seg - F * 0.2);
  }
  // inner walls (a little longer than a cell so they meet at the junctions)
  const L = seg + MAZE.wall * 0.5;
  for (const [c, r] of P.vWalls) bar(-H + seg * (c + 1), mazeCentre(r), MAZE.wall, L);
  for (const [c, r] of P.hWalls) bar(mazeCentre(c), -H + seg * (r + 1), L, MAZE.wall);
  if (!hi) return;
  // flowering dead ends: a bloom in each cell closed on three sides (not the pace corridor)
  const wallAt = (c: number, r: number, side: MazeSide): boolean => {
    if (side === 'E')
      return c === N - 1 ? !isOpen(P.open, 'E', r) : P.vWalls.some(([a, b]) => a === c && b === r);
    if (side === 'W')
      return c === 0 ? !isOpen(P.open, 'W', r) : P.vWalls.some(([a, b]) => a === c - 1 && b === r);
    if (side === 'S')
      return r === N - 1 ? !isOpen(P.open, 'S', c) : P.hWalls.some(([a, b]) => a === c && b === r);
    return r === 0 ? !isOpen(P.open, 'N', c) : P.hWalls.some(([a, b]) => a === c && b === r - 1);
  };
  let k = 0;
  for (let r = 0; r < N && k < 3; r++)
    for (let c = 0; c < N && k < 3; c++) {
      const walls = (['E', 'W', 'S', 'N'] as const).filter((s) => wallAt(c, r, s)).length;
      if (walls < 3) continue;
      const x = mazeCentre(c);
      const z = mazeCentre(r);
      // not under the pacing bot's corridor
      if (Math.abs(x - P.pace.x) < 0.2 && Math.abs(z - P.pace.z) < 1.0) continue;
      put(acc, new THREE.IcosahedronGeometry(0.2, 1), [x, 0.14, z], S.vine[k % 3], {
        s: [1, 0.6, 1],
        aoAmt: 0.1,
      });
      for (let j = 0; j < 3; j++) {
        const a = j * 2.1 + k;
        put(
          acc,
          new THREE.IcosahedronGeometry(0.06, 0),
          [x + Math.cos(a) * 0.12, 0.3, z + Math.sin(a) * 0.12],
          S.blooms[(k + j) % 5],
          { aoAmt: 0 },
        );
      }
      k++;
    }
}

/* ------------------------------------ weather roof ------------------------------------ */

/**
 * The anemometer head on top of a lab pod: mast, a streamlined head with a tail fin and a red arrow
 * (the vane), and a four-cup wheel on the nose that spins. Everything from the mast up is one
 * yawing piece about the pod's centre axis (`aSpin` w 2 / 3 via tagYawHead). Returns the head's
 * vertex range for that tag; the caller runs `finishSpin` and `tagYawHead`.
 */
export function weatherHead(
  acc: Acc,
  spin: Spin,
  topY: number,
  lod: 0 | 1,
): { first: number; count: number } {
  const W = M.labPodWeather;
  const hi = lod === 0;
  const k = W.scale;
  const first = accVerts(acc);
  const y = topY + W.mastH;
  put(
    acc,
    new THREE.CylinderGeometry(0.05 * k, 0.065 * k, W.mastH + 0.1, hi ? 6 : 4),
    [0, topY + (W.mastH - 0.1) / 2 + 0.05, 0],
    S.mount,
    { aoAmt: 0.1 },
  );
  // head body along z, tail fin, arrow
  put(
    acc,
    new THREE.CapsuleGeometry(0.075 * k, 0.34 * k, hi ? 2 : 1, hi ? 6 : 4).rotateX(PI / 2),
    [0, y, -0.02 * k],
    S.podBand,
    { aoAmt: 0.05 },
  );
  put(
    acc,
    baseBox(0.035 * k, 0.3 * k, W.tailLen * k),
    [0, y - 0.08 * k, (-W.tailLen / 2 - 0.12) * k],
    S.podBand,
    {
      aoAmt: 0,
    },
  );
  put(
    acc,
    new THREE.ConeGeometry(0.07 * k, 0.24 * k, 4).rotateX(PI / 2),
    [0, y + 0.14 * k, 0.12 * k],
    S.rocketRed,
    {
      aoAmt: 0,
    },
  );
  // cup wheel on the nose: hub just ahead of the body, arms in the xy plane, spins about z
  const hub = V(0, y, 0.34 * k + W.hubZ * 0.2);
  const tag = spin.tag(hub);
  const arms = hi ? 2 : 1;
  for (let j = 0; j < arms; j++)
    put(acc, new THREE.BoxGeometry(W.cupArm * 2 * k, 0.045 * k, 0.045 * k), hub, S.mount, {
      q: qEuler(0, 0, j * (PI / 2) + 0.4),
      windAbs: tag,
      aoAmt: 0,
      ao: () => 0.97,
    });
  const cups = hi ? 4 : 2;
  for (let j = 0; j < cups; j++) {
    const a = (cups === 4 ? j * (PI / 2) : j * PI) + 0.4;
    put(
      acc,
      new THREE.SphereGeometry(0.11 * k, hi ? 6 : 4, hi ? 3 : 2, 0, TAU, 0, PI / 2),
      hub.clone().add(V(Math.cos(a) * W.cupArm * k, Math.sin(a) * W.cupArm * k, 0)),
      j === 0 ? S.rocketRed : S.podBand,
      { q: qEuler(PI / 2, 0, 0), windAbs: tag, aoAmt: 0, double: true },
    );
  }
  put(acc, new THREE.IcosahedronGeometry(0.07 * k, 0), hub, S.brass, { windAbs: tag, aoAmt: 0 });
  return { first, count: accVerts(acc) - first };
}

/* ------------------------------------ launch gantry ------------------------------------ */

function strut(
  acc: Acc,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  color: string,
  sides = 4,
): void {
  const d = b.clone().sub(a);
  put(
    acc,
    new THREE.CylinderGeometry(r, r, d.length(), sides, 1, true),
    a.clone().add(b).multiplyScalar(0.5),
    color,
    {
      q: qFromTo(Y, d),
      aoAmt: 0,
    },
  );
}

/**
 * The launch gantry beside the rocket (rocket body axis x = 0, nozzle y 1.1, body radius 0.55):
 * four-legged red lattice tower at `towerX`, platform with rail and floodlights on top, a swing arm
 * with a clamp ring reaching the rocket, two sagging hoses, and a steam trench with grates under
 * the nozzle. `by` = the rocket's body base height.
 */
export function launchGantry(acc: Acc, lod: 0 | 1, by: number): void {
  const G = M.gantry;
  const hi = lod === 0;
  const x0 = G.towerX;
  const half = (y: number): number => G.base + (G.top - G.base) * (y / G.height);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      strut(
        acc,
        V(x0 + sx * G.base, 0.5, sz * G.base),
        V(x0 + sx * G.top, G.height, sz * G.top),
        hi ? 0.055 : 0.09,
        G.steel,
        hi ? 4 : 3,
      );
  // LOD0: one ring at mid height and an X brace in each of the two bays on all four faces
  if (hi) {
    const h = half(2.6);
    for (const s of [-1, 1]) {
      put(acc, baseBox(h * 2, 0.06, 0.06), [x0, 2.6, s * h], G.steelDark, { aoAmt: 0 });
      put(acc, baseBox(0.06, 0.06, h * 2), [x0 + s * h, 2.6, 0], G.steelDark, { aoAmt: 0 });
    }
    const levels = [0.5, 2.6, G.height];
    for (let i = 0; i + 1 < levels.length; i++) {
      const h0 = half(levels[i]);
      const h1 = half(levels[i + 1]);
      for (const s of [-1, 1]) {
        strut(
          acc,
          V(x0 - h0, levels[i], s * h0),
          V(x0 + h1, levels[i + 1], s * h1),
          0.022,
          G.steelDark,
          3,
        );
        strut(
          acc,
          V(x0 + s * h0, levels[i], -h0),
          V(x0 + s * h1, levels[i + 1], h1),
          0.022,
          G.steelDark,
          3,
        );
      }
    }
  }
  // top platform, one floodlight pair, beacon
  put(acc, baseBox(1.2, 0.1, 1.2), [x0, G.height, 0], G.steelDark, { aoAmt: 0.1 });
  if (hi) {
    put(acc, baseBox(1.2, 0.04, 0.04), [x0, G.height + 0.5, 0.55], G.steel, { aoAmt: 0 });
    put(acc, baseBox(0.22, 0.18, 0.5), [x0 + 0.42, G.height + 0.1, 0], K.steelDark, { aoAmt: 0 });
    put(acc, baseBox(0.04, 0.14, 0.4), [x0 + 0.54, G.height + 0.12, 0], S.portholeGlow, lit);
  }
  put(acc, new THREE.IcosahedronGeometry(0.1, 0), [x0 - 0.3, G.height + 0.2, 0], S.rocketRed, lit);
  // swing arm from the tower to the rocket body, with a clamp ring on it
  const ax = x0 + half(G.armY) - 0.1;
  const len = -0.5 - ax;
  put(acc, baseBox(len, 0.12, 0.2), [ax + len / 2, G.armY - 0.06, 0], G.steel, { aoAmt: 0.1 });
  if (hi)
    put(acc, new THREE.CylinderGeometry(0.58, 0.58, 0.1, 8, 1, true), [0, G.armY, 0], K.steelDark, {
      aoAmt: 0,
      double: true,
    });
  // hoses: from the tower to the rocket body, sagging
  if (hi) {
    const from = V(ax + 0.1, G.armY - 0.35, 0);
    for (const [k, c] of G.hose.entries()) {
      const zz = (k === 0 ? -1 : 1) * 0.12;
      const a = from.clone().add(V(0, k * -0.5, zz));
      const b = V(-0.5, by + 0.55 + k * 0.5, zz * 3);
      put(acc, tubeAlong(ropePoints(a, b, 0.35, 3), 0.045, 3), [0, 0, 0], c, { aoAmt: 0 });
    }
  }
  // steam trench under the nozzle: a dark slot along z with grates
  put(acc, baseBox(1.05, 0.06, 3.0), [0, 0.5, 0], K.stoneDark, { aoAmt: 0.2 });
  // the rocket stands on three legs from the launch ring (the stock cradle is replaced)
  for (let k = 0; hi && k < 3; k++) {
    const a = (k / 3) * TAU + PI / 6;
    strut(
      acc,
      V(Math.sin(a) * 0.95, 0.5, Math.cos(a) * 0.95),
      V(Math.sin(a) * 0.42, by - 0.1, Math.cos(a) * 0.42),
      0.06,
      K.steelDark,
      4,
    );
  }
  if (hi)
    for (const z of [-0.8, 0.8])
      put(acc, baseBox(0.95, 0.04, 0.1), [0, 0.56, z], K.steel, { aoAmt: 0 });
}

/* ------------------------------------ specimen plate ------------------------------------ */

/** Brass plate on an oak post with a leaf and two label lines (the arboretum labels). */
export function specimenPlate(acc: Acc, hi: boolean): void {
  // built at pole size, scaled up as one group (the plate has to read from a few u away)
  acc.xf = new THREE.Matrix4().makeScale(M.plate.scale, M.plate.scale, M.plate.scale);
  put(acc, cylB(0.05, 0.045, 0.62, hi ? 6 : 4), [0, 0, 0], K.woodDark, { aoAmt: 0.15 });
  put(acc, baseBox(0.2, 0.06, 0.2), [0, 0, 0], K.stoneDark, { aoAmt: 0.2 });
  const tilt = qEuler(-0.55, 0, 0);
  const at = V(0, 0.74, 0.04);
  put(acc, baseBox(0.62, 0.05, 0.4), [0, 0.6, 0], K.woodDark, { q: tilt, aoAmt: 0 });
  put(
    acc,
    baseBox(0.54, 0.03, 0.32),
    at.clone().add(V(0, 0.01, 0).applyQuaternion(tilt)),
    K.board,
    {
      q: tilt,
      aoAmt: 0,
    },
  );
  const onPlate = (x: number, z: number, lift = 0.03): THREE.Vector3 =>
    at.clone().add(V(x, lift, z).applyQuaternion(tilt));
  // leaf: a flat green ellipse with a stem
  put(
    acc,
    new THREE.SphereGeometry(1, hi ? 8 : 4, hi ? 4 : 2),
    onPlate(-0.1, -0.02, 0.05),
    K.fern[0],
    {
      q: tilt.clone().multiply(qEuler(0, 0.6, 0)),
      s: [0.12, 0.012, 0.07],
      aoAmt: 0,
    },
  );
  if (hi) {
    put(acc, baseBox(0.02, 0.02, 0.16), onPlate(-0.18, 0.06, 0.05), K.fern[0], {
      q: tilt,
      aoAmt: 0,
    });
    put(acc, baseBox(0.2, 0.012, 0.025), onPlate(0.12, -0.06, 0.04), K.chalk, {
      q: tilt,
      aoAmt: 0,
    });
    put(acc, baseBox(0.14, 0.012, 0.025), onPlate(0.09, 0.0, 0.04), K.chalk, { q: tilt, aoAmt: 0 });
    put(acc, baseBox(0.18, 0.012, 0.02), onPlate(0.11, 0.07, 0.04), K.chalkTeal, {
      q: tilt,
      aoAmt: 0,
    });
    // brass frame
    for (const [x, z, w, d] of [
      [0, -0.17, 0.58, 0.025],
      [0, 0.17, 0.58, 0.025],
      [-0.28, 0, 0.025, 0.32],
      [0.28, 0, 0.025, 0.32],
    ] as const)
      put(acc, baseBox(w, 0.025, d), onPlate(x, z, 0.03), K.brass, { q: tilt, aoAmt: 0 });
  }
  acc.xf = null;
}
