import * as THREE from 'three';
import { EMISSIVE, ROCK, ROOFS, WALLS, WATER, WOOD } from '../content/palette.ts';
import { Acc, col, frustum, qEuler } from './kit.ts';
import { gabledRoof } from './buildings.ts';
import {
  TAU,
  jitterAcc,
  TINT,
  V,
  baseBox,
  bevBox,
  cycle,
  cylB,
  lathe,
  put,
  ropePoints,
  tubeAlong,
} from './parts.ts';
import type { BuildOpts } from './types.ts';

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function fence({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('fence');
  const acc = new Acc();
  const c = col(variant % 2 === 0 ? WOOD.planks : WALLS[1]);
  if (lod === 1) {
    put(acc, new THREE.BoxGeometry(1.5, 0.45, 0.08), [0, 0.4, 0], c, { aoAmt: 0.2 });
    return acc.finish(rng, false, true);
  }
  const tilt = (): number => (r.range(-4, 4) * Math.PI) / 180;
  for (const x of [-0.7, 0.7]) {
    const t = tilt();
    put(acc, cylB(0.07, 0.06, 0.7, 6), [x, 0, 0], c, { q: qEuler(0, 0, t), aoAmt: 0.25 });
    put(
      acc,
      new THREE.ConeGeometry(0.075, 0.1, 6),
      [x - Math.sin(t) * 0.7, 0.7 * Math.cos(t) + 0.05, 0],
      c,
      { q: qEuler(0, 0, t), aoAmt: 0 },
    );
  }
  for (const y of [0.3, 0.58]) {
    put(acc, new THREE.BoxGeometry(1.5, 0.1, 0.06), [0, y, 0.02], c, {
      q: qEuler(0, 0, tilt()),
      aoAmt: 0.1,
    });
  }
  return acc.finish(rng, false, true);
}

export function lanternPost({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng);
  const hat = cycle([ROOFS[0], ROOFS[2], ROOFS[4]], variant);
  const ly = 1.75;
  if (lod === 0) {
    put(acc, baseBox(0.34, 0.22, 0.34), [0, 0, 0], col(ROCK[1]), { aoAmt: 0.25 });
    put(acc, cylB(0.07, 0.055, ly - 0.2, 5), [0, 0.2, 0], col(WOOD.dark), { aoAmt: 0.2 });
  } else {
    put(acc, baseBox(0.14, ly, 0.14), [0, 0, 0], col(WOOD.dark), { aoAmt: 0.2 });
  }
  const core = lod === 0 ? 0.24 : 0.34;
  put(acc, new THREE.BoxGeometry(core, core, core), [0, ly + 0.17, 0], col(EMISSIVE.lantern), {
    emissive: 1,
    ao: () => 1,
  });
  if (lod === 0) {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        put(
          acc,
          new THREE.BoxGeometry(0.05, 0.36, 0.05),
          [sx * 0.14, ly + 0.17, sz * 0.14],
          col(WOOD.dark),
          { aoAmt: 0 },
        );
    put(acc, baseBox(0.36, 0.05, 0.36), [0, ly - 0.03, 0], col(WOOD.dark), { aoAmt: 0 });
    put(acc, baseBox(0.38, 0.04, 0.38), [0, ly + 0.35, 0], col(WOOD.dark), { aoAmt: 0 });
  }
  put(acc, new THREE.ConeGeometry(0.3, 0.26, 4), [0, ly + 0.5, 0], col(hat), {
    q: qEuler(0, Math.PI / 4, 0),
    aoAmt: 0,
  });
  return acc.finish(rng, false, true);
}

export function laundryLine({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('laundry');
  const acc = new Acc();
  const px = 1.9;
  const ph = 2.0;
  for (const s of [-1, 1])
    put(acc, cylB(0.07, 0.055, ph, lod === 0 ? 5 : 4, lod === 1), [s * px, 0, 0], col(WOOD.logs), {
      aoAmt: 0.25,
    });
  const a = V(-px, ph - 0.15, 0);
  const b = V(px, ph - 0.15, 0);
  const sag = 0.3;
  if (lod === 0)
    put(acc, tubeAlong(ropePoints(a, b, sag, 6), 0.02, 3), [0, 0, 0], col(TINT.rope), { aoAmt: 0 });
  const n = lod === 0 ? 3 + r.int(0, 2) : 1;
  const ch = 0.6;
  for (let i = 0; i < n; i++) {
    const t = lod === 0 ? (i + 0.7) / (n + 0.4) : 0.5;
    const x = -px + 2 * px * t;
    const yTop = ph - 0.15 - sag * 4 * t * (1 - t) - 0.02;
    const w = lod === 0 ? r.range(0.42, 0.6) : 0.6;
    const g = new THREE.PlaneGeometry(w, ch, 1, lod === 0 ? 2 : 1).translate(0, -ch / 2, 0);
    const color = col(cycle(ROOFS, i * 2 + variant * 3));
    put(acc, g, [x, yTop, 0], color, {
      double: true,
      aoAmt: 0,
      ao: () => 1,
      windAbs: (p) => 0.25 + 0.75 * clamp01((yTop - p.y) / ch),
    });
  }
  return acc.finish(rng, false, true);
}

export function bunting({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('bunting');
  const acc = new Acc();
  const px = 3;
  const ph = 2.6;
  for (const s of [-1, 1])
    put(acc, cylB(0.06, 0.05, ph, 4, lod === 1), [s * px, 0, 0], col(WOOD.logs), { aoAmt: 0.25 });
  const sag = 0.55;
  const a = V(-px, ph - 0.1, 0);
  const b = V(px, ph - 0.1, 0);
  if (lod === 0)
    put(acc, tubeAlong(ropePoints(a, b, sag, 8), 0.022, 3), [0, 0, 0], col(TINT.rope), {
      aoAmt: 0,
    });
  const n = lod === 0 ? 8 + r.int(0, 4) : 3;
  const tl = 0.42;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.6) / (n + 0.2);
    const x = -px + 2 * px * t;
    const y = ph - 0.1 - sag * 4 * t * (1 - t);
    const wTri = lod === 0 ? 0.3 : 0.6;
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-wTri / 2, 0, 0, wTri / 2, 0, 0, 0, -tl, 0], 3),
    );
    put(acc, g, [x, y, 0], col(cycle(ROOFS, i + variant * 2)), {
      double: true,
      aoAmt: 0,
      ao: () => 1,
      windAbs: (p) => 0.2 + 0.8 * clamp01((y - p.y) / tl),
    });
  }
  return acc.finish(rng, false, true);
}

export function bench({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng);
  const c = col(variant % 2 === 0 ? WOOD.planks : WALLS[1]);
  const leg = col(WOOD.dark);
  if (lod === 1) {
    put(acc, new THREE.BoxGeometry(1.4, 0.08, 0.42), [0, 0.42, 0], c, { aoAmt: 0.15 });
    put(acc, new THREE.BoxGeometry(1.4, 0.3, 0.06), [0, 0.7, -0.22], c, { aoAmt: 0.15 });
    return acc.finish(rng, false, true);
  }
  for (const z of [-0.12, 0, 0.12])
    put(acc, new THREE.BoxGeometry(1.4, 0.07, 0.12), [0, 0.42, z], c, { aoAmt: 0.1 });
  for (const s of [-1, 1]) put(acc, baseBox(0.08, 0.4, 0.4), [s * 0.58, 0, 0], leg, { aoAmt: 0.3 });
  for (const y of [0.62, 0.8])
    put(acc, new THREE.BoxGeometry(1.4, 0.1, 0.05), [0, y, -0.22], c, {
      q: qEuler(-0.12, 0, 0),
      aoAmt: 0.1,
    });
  return acc.finish(rng, false, true);
}

export function barrel({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng);
  if (lod === 1) {
    put(acc, cylB(0.25, 0.22, 0.6, 5), [0, 0, 0], col(WOOD.logs), { aoAmt: 0.2 });
    return acc.finish(rng, false, true);
  }
  const prof: Array<[number, number]> = [
    [0, 0],
    [0.2, 0],
    [0.235, 0.1],
    [0.245, 0.15],
    [0.265, 0.3],
    [0.245, 0.45],
    [0.235, 0.5],
    [0.2, 0.6],
    [0, 0.6],
  ];
  const wood = col(variant % 2 === 0 ? WOOD.logs : WOOD.dark);
  const hoop = col(TINT.iron);
  put(
    acc,
    lathe(prof, 8),
    [0, 0, 0],
    (p) => {
      if (p.y > 0.595) return col(WOOD.planks);
      return (p.y > 0.09 && p.y < 0.155) || (p.y > 0.445 && p.y < 0.51) ? hoop : wood;
    },
    { aoAmt: 0.22 },
  );
  return acc.finish(rng, false, true);
}

export function crate({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = new Acc();
  const s = variant % 2 === 0 ? 0.6 : 0.48;
  const c = col(variant % 2 === 0 ? WOOD.planks : WOOD.logs);
  if (lod === 1) {
    put(acc, baseBox(s, s, s), [0, 0, 0], c, { aoAmt: 0.2 });
    return acc.finish(rng, false, true);
  }
  put(acc, bevBox(s, s, s, 0.05), [0, s / 2, 0], c, {
    aoAmt: 0.2,
    q: qEuler(0, rng.range(-0.1, 0.1), 0),
  });
  const plank = col(WOOD.dark);
  const L = s * 1.15;
  for (const [nx, nz, yaw] of [
    [0, 1, 0],
    [0, -1, Math.PI],
    [1, 0, Math.PI / 2],
    [-1, 0, -Math.PI / 2],
  ] as const) {
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      put(
        acc,
        new THREE.BoxGeometry(L, 0.06, 0.03),
        [nx * (s / 2 + 0.005), s / 2, nz * (s / 2 + 0.005)],
        plank,
        {
          q: qEuler(0, yaw, 0).multiply(qEuler(0, 0, a)),
          aoAmt: 0,
        },
      );
    }
  }
  return acc.finish(rng, false, true);
}

export function well({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng);
  const roof = cycle([ROOFS[0], ROOFS[5]], variant);
  const n = 5;
  if (lod === 1) {
    put(acc, cylB(0.8, 0.8, 0.5, 5), [0, 0, 0], col(ROCK[0]), { aoAmt: 0.2 });
    gabledRoof(acc, {
      top: 1.35,
      halfW: 0.95,
      wallHalfW: 0.8,
      rise: 0.5,
      length: 1.3,
      wallLen: 1.2,
      roof,
      wall: WALLS[0],
      lod: 1,
    });
    return acc.finish(rng, false, true);
  }
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    put(
      acc,
      new THREE.BoxGeometry(0.62, 0.5, 0.36),
      [Math.cos(a) * 0.6, 0.25, Math.sin(a) * 0.6],
      col(i % 2 ? ROCK[0] : ROCK[1]),
      {
        q: qEuler(0, -a + Math.PI / 2, 0),
        aoAmt: 0.25,
      },
    );
  }
  put(acc, new THREE.CircleGeometry(0.5, 5).rotateX(-Math.PI / 2), [0, 0.32, 0], col(WATER.deep), {
    aoAmt: 0,
    ao: () => 0.85,
  });
  for (const s of [-1, 1])
    put(acc, baseBox(0.1, 1.0, 0.1), [s * 0.62, 0.4, 0], col(WOOD.logs), { aoAmt: 0.1 });
  put(acc, new THREE.CylinderGeometry(0.05, 0.05, 1.3, 4, 1, true), [0, 1.2, 0], col(WOOD.dark), {
    q: qEuler(0, 0, Math.PI / 2),
    aoAmt: 0,
  });
  gabledRoof(acc, {
    top: 1.3,
    halfW: 0.95,
    wallHalfW: 0.8,
    rise: 0.5,
    length: 1.3,
    wallLen: 1.2,
    roof,
    wall: WALLS[0],
    lod: 0,
  });
  const bs = frustum(V(0.05, 0.75, 0), V(0.05, 0.98, 0), 0.08, 0.1, 5);
  acc.add(bs.geo, { m: bs.m, color: col(WOOD.planks), windMul: 0, aoAmt: 0.1 });
  return acc.finish(rng, false, true);
}

export function steppingStone({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = new Acc();
  const c = col([ROCK[0], ROCK[1], ROCK[0]][variant % 3]);
  const R = 0.25 * rng.range(0.92, 1.08);
  const yaw = rng.range(0, TAU);
  if (lod === 1) {
    put(acc, new THREE.CircleGeometry(R, 5).rotateX(-Math.PI / 2), [0, 0.1, 0], c, {
      q: qEuler(0, yaw, 0),
      aoAmt: 0,
    });
    return acc.finish(rng, false, true);
  }
  const g = lathe(
    [
      [R, 0],
      [R, 0.05],
      [R * 0.82, 0.1],
      [0, 0.1],
    ],
    8,
  );
  put(acc, g, [0, 0, 0], (p) => (p.y > 0.09 ? col(ROCK[0]) : c), {
    q: qEuler(0, yaw, 0),
    aoAmt: 0.2,
  });
  return acc.finish(rng, false, true);
}
