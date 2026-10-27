/**
 * QA Proving Grounds kit geometry (M24 TASK-499): dropTower (tier 1, the island's second silhouette),
 * testFan (tier 2, the blades turn on the shared `aSpin` tag) and obstacle (tier 2, four variants:
 * hurdle, tyre stack, balance beam, slalom cones). Sizes, palette and placement: content/themes/qa-proving.ts;
 * defs: content/props-themes/qa-proving.ts. White / mint / yellow toy-factory tone, vertex colours only.
 *
 * Hooks (userData.hooks):
 *  - dropTower.crate: `{ top, rest, size }`, the crate centre at the top / landing position on the
 *    tower's x = z = 0 axis (tower local, jitter-free). Variant 0 carries the crate (and its cable) as
 *    static triangles; variant 1 is the empty cradle for the TASK-501 mover, which draws
 *    `buildDropCrate()` (origin = crate centre) between `rest` and `top`.
 *  - dropTower.lamp: the foot check lamp lens `{ center }`.
 *  - testFan.hub: the fan hub `{ center, axis }` (also `userData.hub`, `spinAxis` from finishSpin).
 */
import * as THREE from 'three';
import { createRng, type Rng } from '../../core/rng.ts';
import { PROVING_PAL as P, QA_PROVING as F } from '../../content/themes/qa-proving.ts';
import { Acc, mat, qEuler, qFromTo } from '../kit.ts';
import { Spin, finishSpin } from '../office-kit.ts';
import { V, baseBox, cylB, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { addHook } from './hq.ts';

const Y = V(0, 1, 0);
type Pt = THREE.Vector3;

/** Square beam from a to b (thickness `th`). */
function beam(acc: Acc, a: Pt, b: Pt, th: number, color: string): void {
  const d = b.clone().sub(a);
  put(acc, baseBox(th, d.length(), th), a, color, { q: qFromTo(Y, d), aoAmt: 0 });
}

/** Acc scaled a hair in x / z by the seed (y untouched, so the crate anchors and hooks stay exact). */
function seedAcc(rng: Rng, amt: number): Acc {
  const acc = new Acc();
  const r = rng.fork('jit');
  acc.xf = mat([0, 0, 0], null, [1 + r.range(-amt, amt), 1, 1 + r.range(-amt, amt)]);
  return acc;
}

/* --------------------------------- dropTower --------------------------------- */

/** The crate the drop tower lifts: a banded wooden cube on a yellow yoke, `at` = the cube centre. */
function crateParts(acc: Acc, at: Pt, hi = true): void {
  const K = F.tower.crate;
  const s = K.size;
  const at0 = (x: number, y: number, z: number): Pt => at.clone().add(V(x, y, z));
  put(acc, baseBox(s, s, s), at0(0, -s / 2, 0), K.wood, { aoAmt: 0.1 });
  put(acc, baseBox(s + 0.3, 0.12, 0.2), at0(0, s / 2, 0), P.yellow, { aoAmt: 0 });
  if (!hi) return;
  for (const dy of [-s / 2 + 0.1, s / 2 - 0.18])
    put(acc, baseBox(s + 0.04, 0.08, s + 0.04), at0(0, dy, 0), K.band, { aoAmt: 0 });
  for (const sz of [-1, 1])
    put(
      acc,
      new THREE.PlaneGeometry(s * 0.46, s * 0.34),
      at0(0, 0, sz * (s / 2 + 0.015)),
      K.sticker,
      {
        q: qEuler(0, sz > 0 ? 0 : Math.PI, 0),
        aoAmt: 0,
        ao: () => 1,
      },
    );
  // the drop cable from the yoke up to the head
  put(acc, baseBox(0.07, 0.4, 0.07), at0(0, s / 2 + 0.12, 0), P.steel, { aoAmt: 0 });
}

/** The loose crate mesh for the TASK-501 lift (origin = crate centre, yoke and cable included). */
export function buildDropCrate(): THREE.BufferGeometry {
  const acc = new Acc();
  crateParts(acc, V(0, 0, 0));
  return acc.finish(createRng(499).fork('drop-crate'), false, false);
}

/**
 * Drop tower: a 4-leg white lattice with mint braces on a plinth, steel guide rails, a yellow head
 * housing with a pulley wheel and a red air lamp, a striped landing pad and a green ✓ lamp on a
 * pedestal at the foot (front +z). Variant 0 holds the crate at the top position, variant 1 is empty.
 */
function dropTower({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const T = F.tower;
  const acc = seedAcc(rng, 0.01);
  const hi = lod === 0;
  const y0 = T.plinth;
  const yt = y0 + T.h;
  const corner = (y: number): number => T.base + (T.top - T.base) * ((y - y0) / T.h);
  const leg = (sx: number, sz: number, y: number): Pt => V(sx * corner(y), y, sz * corner(y));
  const cs: [number, number][] = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];
  const pw = T.base * 2 + 0.9;
  put(acc, baseBox(pw, y0, pw), [0, 0, 0], P.white, { aoAmt: 0.2 });
  if (hi) put(acc, baseBox(pw + 0.06, 0.07, pw + 0.06), [0, y0 - 0.1, 0], P.mint, { aoAmt: 0 });
  // landing pad: yellow slab with white stripes inside the legs
  put(acc, baseBox(T.base * 2 - 0.5, 0.1, T.base * 2 - 0.5), [0, y0, 0], T.pad, { aoAmt: 0.05 });
  if (hi)
    for (let i = 0; i < 3; i++)
      put(acc, baseBox(0.28, 0.02, T.base * 2 - 0.5), [-0.7 + i * 0.7, y0 + 0.1, 0], P.white, {
        aoAmt: 0,
      });
  for (const [sx, sz] of cs) beam(acc, leg(sx, sz, y0), leg(sx, sz, yt), hi ? 0.26 : 0.36, T.leg);
  if (hi) {
    for (let k = 1; k <= T.bays; k++) {
      const ya = y0 + (T.h * (k - 1)) / T.bays;
      const yb = y0 + (T.h * k) / T.bays;
      for (let e = 0; e < 4; e++) {
        const [ax, az] = cs[e];
        const [bx, bz] = cs[(e + 1) % 4];
        beam(acc, leg(ax, az, yb), leg(bx, bz, yb), 0.13, T.brace);
        // one diagonal per face and bay, alternating, reads as zig-zag lattice
        if ((k + e) % 2 === 0) beam(acc, leg(ax, az, ya), leg(bx, bz, yb), 0.1, T.brace);
        else beam(acc, leg(bx, bz, ya), leg(ax, az, yb), 0.1, T.brace);
      }
    }
  } else {
    for (let e = 0; e < 4; e++) {
      const [ax, az] = cs[e];
      const [bx, bz] = cs[(e + 1) % 4];
      beam(acc, leg(ax, az, y0), leg(bx, bz, yt), 0.34, T.brace);
    }
  }
  // guide rails the crate rides on (x = ±0.68)
  if (hi)
    for (const sx of [-1, 1])
      put(acc, baseBox(0.08, T.h, 0.12), [sx * 0.68, y0, 0], T.rail, { aoAmt: 0 });
  // head: a platform, the yellow housing, a mint roof, the pulley and the red air lamp
  const hw = T.top * 2 + 0.7;
  put(acc, baseBox(hw, 0.2, hw), [0, yt, 0], P.mintDeep, { aoAmt: 0 });
  put(acc, baseBox(hw - 0.2, T.head, hw - 0.2), [0, yt + 0.2, 0], T.housing, { aoAmt: 0.1 });
  put(acc, baseBox(hw + 0.2, 0.14, hw + 0.2), [0, yt + 0.2 + T.head, 0], T.roof, { aoAmt: 0 });
  if (hi) {
    put(acc, cylB(0.4, 0.4, 0.16, 10), [0, yt + 0.55, hw / 2 - 0.05], P.white, {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0,
    });
    for (let i = 0; i < 4; i++)
      put(
        acc,
        baseBox(hw - 0.2 + 0.04, 0.09, 0.04),
        [0, yt + 0.28 + i * 0.2, 0],
        i % 2 ? P.white : P.mintDeep,
        {
          aoAmt: 0,
        },
      );
  }
  const top = yt + 0.2 + T.head + 0.14;
  if (hi) put(acc, cylB(0.08, 0.08, 0.36, 5), [0, top, 0], P.steel, { aoAmt: 0 });
  put(acc, new THREE.IcosahedronGeometry(0.22, hi ? 1 : 0), [0, top + 0.5, 0], T.lamp, {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
  // the crate at the top position (variant 0), hanging under the head
  if (variant === 0) crateParts(acc, V(0, T.crate.top, 0), hi);
  // foot ✓ lamp: a mint pedestal with a lens and a green check on its face
  const L = T.footLamp;
  put(acc, baseBox(0.62, L.h, 0.62), [L.x, 0, L.z], P.white, { aoAmt: 0.15 });
  put(acc, baseBox(0.7, 0.1, 0.7), [L.x, L.h, L.z], P.mint, { aoAmt: 0 });
  put(acc, new THREE.IcosahedronGeometry(L.r, hi ? 1 : 0), [L.x, L.h + 0.1 + L.r, L.z], T.check, {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
  if (hi)
    for (const [a, b] of [
      [V(-0.16, 0.62, 0), V(-0.04, 0.46, 0)],
      [V(-0.04, 0.46, 0), V(0.18, 0.78, 0)],
    ] as const) {
      const d = b.clone().sub(a);
      put(
        acc,
        new THREE.BoxGeometry(d.length() + 0.07, 0.07, 0.03),
        V(L.x, 0, L.z + 0.32).add(a.clone().add(b).multiplyScalar(0.5)),
        T.check,
        { q: qEuler(0, 0, Math.atan2(d.y, d.x)), emissive: 1, aoAmt: 0, ao: () => 1 },
      );
    }
  const g = acc.finish(rng, false, true);
  addHook(g, 'lamp', { center: [L.x, L.h + 0.1 + L.r, L.z] });
  return addHook(g, 'crate', {
    top: [0, T.crate.top, 0],
    rest: [0, T.crate.rest, 0],
    size: T.crate.size,
  });
}

/* ---------------------------------- testFan ---------------------------------- */

/** `aSpin.w` of the fan's blades (shader: render/materials/factory.ts, QA siren test). */
export const FAN_SPIN_TAG = 1.25;

/**
 * Giant test fan facing +z: a white pedestal on a mint foot, a motor drum, five yellow blades (`aSpin`
 * parts, turn about the hub on the z axis) inside a mint cage of rings and spokes. In front, on a
 * striped pole, a crash dummy and three streamers lying downwind (away from the fan).
 */
function testFan({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const T = F.fan;
  const acc = seedAcc(rng, 0.01);
  const spin = new Spin();
  const hi = lod === 0;
  const hub = V(0, T.hubY, 0);
  const tag = spin.tag(hub);
  // foot, pedestal, motor drum behind the blades
  put(acc, baseBox(2.3, 0.2, 1.7), [0, 0, 0.1], T.foot, { aoAmt: 0.15 });
  put(acc, baseBox(2.4, 0.07, 1.8), [0, 0.2, 0.1], P.yellow, { aoAmt: 0 });
  put(acc, cylB(0.36, 0.26, T.hubY - 0.3, hi ? 8 : 5), [0, 0.2, -0.1], T.body, { aoAmt: 0.15 });
  if (hi)
    put(acc, cylB(0.7, 0.62, 0.8, 10), [0, T.hubY, -0.75], T.body, {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0.05,
    });
  // the cage: back ring, front rings, struts and spokes
  const ring = (r: number, z: number, th: number): void =>
    put(acc, new THREE.TorusGeometry(r, th, 3, hi ? 18 : 10), [0, T.hubY, z], T.cage, { aoAmt: 0 });
  ring(T.cageR, -0.4, 0.07);
  ring(T.cageR, 0.5, 0.07);
  if (hi) {
    ring(1.55, 0.5, 0.045);
  }
  const spokes = hi ? 8 : 2;
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * Math.PI * 2 + 0.2;
    const c = V(Math.cos(a), Math.sin(a), 0);
    const q = qFromTo(Y, c);
    put(acc, baseBox(0.06, T.cageR - 0.35, 0.06), V(c.x * 0.35, T.hubY + c.y * 0.35, 0.5), T.cage, {
      q,
      aoAmt: 0,
    });
    if (hi)
      put(acc, baseBox(0.07, 0.07, 0.9), V(c.x * T.cageR, T.hubY + c.y * T.cageR, 0.05), T.cage, {
        aoAmt: 0,
      });
  }
  // blades (spin about the hub) and the nose cone
  const n = hi ? T.blades : 3;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const dir = V(Math.cos(a), Math.sin(a), 0);
    const q = new THREE.Quaternion()
      .setFromAxisAngle(V(0, 0, 1), a - Math.PI / 2)
      .multiply(qEuler(0, 0.35, 0));
    put(
      acc,
      new THREE.BoxGeometry(T.bladeW, T.bladeR - 0.3, 0.07),
      hub
        .clone()
        .add(dir.multiplyScalar(0.3 + (T.bladeR - 0.3) / 2))
        .add(V(0, 0, 0.1)),
      T.blade,
      { q, windAbs: tag, aoAmt: 0 },
    );
  }
  put(
    acc,
    new THREE.ConeGeometry(0.34, 0.45, hi ? 8 : 5).rotateX(Math.PI / 2),
    hub.clone().add(V(0, 0, 0.3)),
    P.white,
    {
      windAbs: tag,
      aoAmt: 0,
    },
  );
  // streamer pole in front: striped, a foot, three ribbons at the top lying downwind (+z)
  const pz = T.poleZ;
  const seg = T.poleH / 3;
  if (hi)
    for (let i = 0; i < 3; i++)
      put(acc, cylB(0.075, 0.075, seg, 5), [0, i * seg, pz], i % 2 ? P.white : P.yellow, {
        aoAmt: 0,
      });
  else put(acc, cylB(0.09, 0.09, T.poleH, 4), [0, 0, pz], P.yellow, { aoAmt: 0 });
  put(acc, baseBox(0.8, 0.1, 0.8), [0, 0, pz], P.mint, { aoAmt: 0.1 });
  if (hi)
    for (let i = 0; i < T.streamers.length; i++) {
      const len = 4;
      for (let j = 0; j < len; j++) {
        const w = 0.4;
        const y = T.poleH - 0.12 - i * 0.2 - j * 0.09 + Math.sin(j * 1.3 + i) * 0.05;
        put(
          acc,
          baseBox(0.03, 0.15, w),
          [(i - 1) * 0.07, y, pz + 0.04 + (j + 0.5) * w],
          T.streamers[i],
          { q: qEuler(0.18 + j * 0.05, 0, 0), windAbs: 0.8, aoAmt: 0 },
        );
      }
    }
  // crash dummy standing by the pole, one arm up to the pole (fan-test volunteer)
  const dx = 0.55;
  const dz = pz + 0.1;
  if (hi) {
    put(acc, baseBox(0.17, 0.62, 0.2), [dx - 0.1, 0.0, dz], T.dummy, { aoAmt: 0.1 });
    put(acc, baseBox(0.17, 0.62, 0.2), [dx + 0.1, 0.0, dz], T.dummy, { aoAmt: 0.1 });
  }
  put(acc, baseBox(0.52, 0.7, 0.3), [dx, 0.62, dz], T.dummy, { aoAmt: 0.1 });
  put(acc, new THREE.IcosahedronGeometry(0.22, hi ? 1 : 0), [dx, 1.62, dz], T.dummy, { aoAmt: 0 });
  if (hi) {
    // test-target quadrants on the chest and the head
    for (const [ox, oy, c] of [
      [-0.1, 0.1, P.rubber],
      [0.1, 0.1, P.white],
      [-0.1, -0.1, P.white],
      [0.1, -0.1, P.rubber],
    ] as const)
      put(acc, baseBox(0.18, 0.18, 0.02), [dx + ox, 0.97 + oy, dz + 0.16], c, { aoAmt: 0 });
    put(acc, baseBox(0.13, 0.13, 0.03), [dx - 0.1, 1.66, dz + 0.18], P.rubber, { aoAmt: 0 });
    put(acc, baseBox(0.13, 0.13, 0.03), [dx + 0.1, 1.66, dz + 0.18], P.white, { aoAmt: 0 });
    // arms: one up to the pole, one hanging
    put(acc, baseBox(0.12, 0.62, 0.14), [dx + 0.35, 0.78, dz], T.dummy, { aoAmt: 0 });
    put(acc, baseBox(0.12, 0.7, 0.14), [dx - 0.28, 1.24, dz], T.dummy, {
      q: qEuler(0, 0, 1.15),
      aoAmt: 0,
    });
  }
  const g = finishSpin(acc.finish(rng, false, true), acc, spin);
  // spin tag 1.25 = the test fan: the siren test adds turns on top of the wind-driven spin (uFanSpin)
  const tag4 = g.getAttribute('aSpin') as THREE.BufferAttribute;
  for (let i = 0; i < tag4.count; i++) if (tag4.getW(i) === 1) tag4.setW(i, FAN_SPIN_TAG);
  return addHook(g, 'hub', { center: [hub.x, hub.y, hub.z], axis: [0, 0, 1] });
}

/* --------------------------------- obstacle --------------------------------- */

/** Two stripes-and-cap posts with two striped bars between them. */
function hurdle(acc: Acc, hi: boolean): void {
  const w = 2.4;
  if (!hi) {
    for (const sx of [-1, 1])
      put(acc, baseBox(0.3, 1.1, 0.3), [sx * (w / 2), 0, 0], P.white, { aoAmt: 0.1 });
    put(acc, baseBox(w, 0.3, 0.12), [0, 0.62, 0], P.yellow, { aoAmt: 0 });
    return;
  }
  for (const sx of [-1, 1]) {
    put(acc, baseBox(0.5, 0.08, 0.7), [sx * (w / 2), 0, 0], P.mint, { aoAmt: 0.1 });
    put(acc, baseBox(0.2, 1.02, 0.2), [sx * (w / 2), 0.08, 0], P.white, { aoAmt: 0.1 });
    put(acc, baseBox(0.26, 0.1, 0.26), [sx * (w / 2), 1.1, 0], P.yellow, { aoAmt: 0 });
  }
  const n = 6;
  for (const y of [0.55, 0.9]) {
    for (let i = 0; i < n; i++) {
      const sw = (w - 0.2) / n;
      put(
        acc,
        baseBox(sw, 0.16, 0.1),
        [-w / 2 + 0.1 + (i + 0.5) * sw, y - 0.08, 0],
        i % 2 ? P.white : P.yellow,
        {
          aoAmt: 0,
        },
      );
    }
  }
}

/** 3 + 2 + 1 tyres stacked like a pyramid, painted in mint / white / yellow rings. */
function tyreStack(acc: Acc, hi: boolean): void {
  if (!hi) {
    put(acc, cylB(1.0, 0.4, 1.15, 5), [0, 0, 0], P.rubber, { aoAmt: 0.1, s: [1.3, 1, 0.48] });
    return;
  }
  const R = 0.4;
  const t = 0.19;
  const rows = [3, 2, 1];
  const cols = [P.rubber, P.rubber, P.rubber];
  rows.forEach((n, row) => {
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (R * 2 + 0.02);
      const y = row * (t * 2 + 0.01) + t;
      put(
        acc,
        new THREE.TorusGeometry(R - t * 0.5, t, 4, 10).rotateX(Math.PI / 2),
        [x, y, 0],
        cols[row],
        {
          aoAmt: 0.1,
        },
      );
      // a painted disc on top of each tyre
      put(
        acc,
        new THREE.CylinderGeometry(R - t * 0.5, R - t * 0.5, 0.025, 8),
        [x, y + t - 0.005, 0],
        [P.yellow, P.white, P.mint][(i + row) % 3],
        { aoAmt: 0 },
      );
    }
  });
}

/** A mint plank on three yellow trestles with a white end cap at each side, ramps at both ends. */
function balanceBeam(acc: Acc, hi: boolean): void {
  const L = 3.6;
  const hgt = 0.5;
  put(acc, baseBox(L, 0.14, 0.42), [0, hgt, 0], P.mint, { aoAmt: 0.05 });
  if (!hi) {
    put(acc, baseBox(L * 0.8, hgt, 0.3), [0, 0, 0], P.yellow, { aoAmt: 0.1 });
    return;
  }
  put(acc, baseBox(L + 0.04, 0.03, 0.2), [0, hgt + 0.14, 0], P.white, { aoAmt: 0 });
  for (const x of [-1.5, 0, 1.5]) {
    put(acc, baseBox(0.16, hgt, 0.5), [x, 0, 0], P.yellow, { aoAmt: 0.1 });
    put(acc, baseBox(0.16, 0.06, 0.8), [x, 0, 0], P.yellow, { aoAmt: 0 });
  }
  for (const sx of [-1, 1]) {
    put(acc, baseBox(0.5, 0.1, 0.6), [sx * (L / 2 + 0.15), 0.12, 0], P.mintDeep, {
      q: qEuler(0, 0, sx * -0.55),
      aoAmt: 0.05,
    });
  }
}

/** Five slalom cones in a zig-zag, yellow and mint with a white band. */
function slalom(acc: Acc, hi: boolean): void {
  const n = 5;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.95;
    const z = i % 2 ? 0.4 : -0.4;
    const c = i % 2 ? P.mint : P.yellow;
    if (hi) put(acc, baseBox(0.38, 0.05, 0.38), [x, 0, z], P.white, { aoAmt: 0 });
    put(
      acc,
      new THREE.ConeGeometry(0.17, 0.62, hi ? 8 : 4).translate(0, 0.31, 0),
      [x, hi ? 0.05 : 0, z],
      c,
      {
        aoAmt: 0.1,
      },
    );
    if (hi) put(acc, cylB(0.115, 0.1, 0.1, 8), [x, 0.3, z], P.white, { aoAmt: 0 });
  }
}

const OBSTACLES: readonly ((acc: Acc, hi: boolean) => void)[] = [
  hurdle,
  tyreStack,
  balanceBeam,
  slalom,
];

function obstacle({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = seedAcc(rng, 0.02);
  OBSTACLES[Math.min(OBSTACLES.length - 1, variant)](acc, lod === 0);
  return acc.finish(rng, false, true);
}

export const QA_PROVING_GEO: readonly PropGeoDef[] = [
  // v0 = the crate parked at the top, v1 = the empty cradle for the TASK-501 mover
  {
    id: 'dropTower',
    variants: 2,
    build: dropTower,
    footprint: 1.9,
    height: 10,
    windy: false,
  },
  { id: 'testFan', variants: 1, build: testFan, footprint: 1.6, height: 5.2, windy: true },
  {
    id: 'obstacle',
    variants: 4,
    build: obstacle,
    footprint: 1.4,
    height: 1.0,
    heights: F.course.heights,
    windy: false,
  },
];
