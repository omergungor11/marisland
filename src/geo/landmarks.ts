import * as THREE from 'three';
import {
  EMISSIVE,
  FOLIAGE,
  GRASS,
  HOT_SPRING,
  ROCK,
  ROOFS,
  WALLS,
  WOOD,
} from '../content/palette.ts';
import { Acc, blob, col, createNoise, frustum, mat, qEuler } from './kit.ts';
import { house } from './buildings.ts';
import { gridSurface } from './coastal.ts';
import {
  TAU,
  jitterAcc,
  TINT,
  V,
  V2,
  baseBox,
  bevBox,
  compose,
  cycle,
  cylB,
  lathe,
  prism,
  put,
} from './parts.ts';
import type { BuildOpts } from './types.ts';

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function lighthouse({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng);
  const seg = lod === 0 ? 12 : 6;
  const H = 9.4;
  const rOf = (y: number): number => 1.95 - 0.7 * (y / H);
  const red = col(variant % 2 === 0 ? ROOFS[0] : ROOFS[5]);
  const white = col(WALLS[1]);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 5; i++) pts.push([rOf((i * H) / 5), (i * H) / 5]);
  const body = lathe(pts, seg).rotateY(-Math.PI / seg);
  put(acc, body, [0, 0, 0], (p) => (Math.floor((p.y / H) * 5) % 2 === 0 ? red : white), {
    aoAmt: 0.2,
  });
  if (lod === 0) put(acc, cylB(2.35, 2.2, 0.5, seg), [0, 0, 0], col(ROCK[1]), { aoAmt: 0.25 });
  put(acc, cylB(2.0, 2.0, 0.24, seg), [0, H, 0], col(ROCK[2]), { aoAmt: 0.1 });
  const gy = H + 0.24;
  // lamp room: floor ring, mullions, glowing core, ceiling ring, dome
  const lampH = 1.35;
  if (lod === 0) put(acc, cylB(1.0, 1.0, 0.12, 8), [0, gy, 0], col(ROCK[2]), { aoAmt: 0 });
  put(
    acc,
    new THREE.IcosahedronGeometry(0.62, lod === 0 ? 0 : 0),
    [0, gy + 0.75, 0],
    col(EMISSIVE.lantern),
    { emissive: 1, ao: () => 1 },
  );
  if (lod === 0) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      put(
        acc,
        cylB(0.055, 0.055, lampH, 4, true),
        [Math.cos(a) * 0.92, gy + 0.1, Math.sin(a) * 0.92],
        red,
        { aoAmt: 0 },
      );
    }
    // glass panes lit softly
    put(
      acc,
      new THREE.CylinderGeometry(0.9, 0.9, lampH - 0.1, 8, 1, true),
      [0, gy + 0.78, 0],
      col(TINT.glass),
      {
        emissive: 0.5,
        ao: () => 1,
        aoAmt: 0,
        double: true,
      },
    );
  } else {
    put(acc, cylB(0.95, 0.95, lampH, 6, true), [0, gy + 0.1, 0], col(TINT.glass), {
      emissive: 0.5,
      ao: () => 1,
    });
  }
  const ceil = gy + lampH + 0.1;
  put(acc, cylB(1.12, 1.12, 0.14, lod === 0 ? 8 : 6), [0, ceil - 0.14, 0], red, { aoAmt: 0 });
  put(
    acc,
    new THREE.SphereGeometry(1.1, lod === 0 ? 8 : 6, lod === 0 ? 3 : 2, 0, TAU, 0, Math.PI / 2),
    [0, ceil, 0],
    red,
    { aoAmt: 0 },
  );
  put(acc, new THREE.IcosahedronGeometry(0.2, 0), [0, ceil + 1.15, 0], col(TINT.gold), {
    aoAmt: 0,
  });
  if (lod === 0) {
    put(acc, cylB(0.035, 0.012, 0.9, 3, true), [0, ceil + 1.2, 0], col(TINT.iron), { aoAmt: 0 });
    // railing
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      put(
        acc,
        cylB(0.04, 0.04, 0.55, 4, true),
        [Math.cos(a) * 1.9, H + 0.24, Math.sin(a) * 1.9],
        col(WALLS[1]),
        { aoAmt: 0.1 },
      );
    }
    put(acc, cylB(1.9, 1.9, 0.07, 12, true), [0, H + 0.24 + 0.55, 0], col(WALLS[1]), {
      double: true,
      aoAmt: 0,
    });
    // door + windows on the +z facet
    const ap = (y: number): number => rOf(y) * Math.cos(Math.PI / seg);
    const doorZ = ap(0.5) - 0.08;
    const f = new THREE.BoxGeometry(1.12, 1.74, 0.16).translate(0, 0.87, 0);
    put(acc, f, [0, 0.45, doorZ + 0.04], col(WOOD.planks), { aoAmt: 0 });
    put(
      acc,
      new THREE.BoxGeometry(0.9, 1.6, 0.1).translate(0, 0.8, 0),
      [0, 0.45, doorZ + 0.13],
      col(WOOD.dark),
      { aoAmt: 0 },
    );
    for (const y of [4.2, 6.9]) {
      const w = ap(y);
      put(acc, new THREE.BoxGeometry(0.64, 0.84, 0.1), [0, y, w - 0.02], col(WALLS[1]), {
        aoAmt: 0,
      });
      put(acc, new THREE.PlaneGeometry(0.44, 0.64), [0, y, w + 0.04], col(EMISSIVE.window), {
        emissive: 1,
        ao: () => 1,
      });
    }
  }
  return acc.finish(rng, false, true);
}

export function clocktower({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng);
  const roof = cycle([ROOFS[1], ROOFS[5]], variant);
  const wall = cycle([WALLS[0], WALLS[3]], variant);
  const shaftTop = 6.5;
  const stageTop = 8.5;
  if (lod === 0) {
    put(acc, baseBox(3.1, 0.5, 3.1), [0, 0, 0], col(ROCK[1]), { aoAmt: 0.25 });
    put(acc, bevBox(2.4, shaftTop - 0.5, 2.4, 0.12), [0, 0.5 + (shaftTop - 0.5) / 2, 0], wall, {
      aoAmt: 0.2,
    });
    put(acc, baseBox(3.1, 0.2, 3.1), [0, shaftTop - 0.1, 0], col(WOOD.planks), { aoAmt: 0 });
    put(
      acc,
      bevBox(2.9, stageTop - shaftTop - 0.1, 2.9, 0.12),
      [0, shaftTop + 0.1 + (stageTop - shaftTop - 0.1) / 2, 0],
      wall,
      { aoAmt: 0.1 },
    );
  } else {
    put(acc, baseBox(2.4, shaftTop, 2.4), [0, 0, 0], wall, { aoAmt: 0.2 });
    put(acc, baseBox(2.9, stageTop - shaftTop, 2.9), [0, shaftTop, 0], wall, { aoAmt: 0.1 });
  }
  put(
    acc,
    new THREE.ConeGeometry(2.35, 2.3, 4),
    [0, stageTop + 1.15 - 0.05, 0],
    (p) => col(roof).multiplyScalar(0.9 + 0.2 * clamp01((p.y - stageTop) / 2.2)),
    {
      q: qEuler(0, Math.PI / 4, 0),
      aoAmt: 0.05,
    },
  );
  put(acc, cylB(0.05, 0.04, 0.95, 4, true), [0, stageTop + 2.2, 0], col(WOOD.dark), { aoAmt: 0 });
  const fy = stageTop + 2.2 + 0.95;
  const flag = gridSurface(2, 1, (u, v) => V(0.0 + u * 0.7, fy - 0.38 + v * 0.34 - u * 0.04, 0));
  put(acc, flag, [0, 0, 0], col(ROOFS[0]), {
    double: true,
    aoAmt: 0,
    ao: () => 1,
    windAbs: (p) => clamp01(p.x / 0.7),
  });
  if (lod === 1) return acc.finish(rng, false, true);
  // door + windows + clock faces
  const glow = col(EMISSIVE.window);
  const dz = 1.2;
  put(
    acc,
    new THREE.BoxGeometry(1.12, 1.74, 0.1).translate(0, 0.87, 0),
    [0, 0.5, dz + 0.02],
    col(WOOD.planks),
    { aoAmt: 0 },
  );
  put(
    acc,
    new THREE.BoxGeometry(0.9, 1.6, 0.08).translate(0, 0.8, 0),
    [0, 0.5, dz + 0.07],
    col(WOOD.dark),
    { aoAmt: 0 },
  );
  const slit = (x: number, y: number, z: number, yaw: number): void => {
    const q = qEuler(0, yaw, 0);
    put(acc, new THREE.BoxGeometry(0.54, 0.94, 0.07), [x, y, z], col(WOOD.planks), { q, aoAmt: 0 });
    const off = V(0, 0, 0.045).applyQuaternion(q);
    put(acc, new THREE.PlaneGeometry(0.34, 0.74), [x + off.x, y + off.y, z + off.z], glow, {
      q,
      emissive: 1,
      ao: () => 1,
    });
  };
  slit(0, 3.4, dz, 0);
  slit(0, 5.2, dz, 0);
  slit(dz, 4.2, 0, Math.PI / 2);
  slit(-dz, 4.2, 0, -Math.PI / 2);
  slit(0, 4.2, -dz, Math.PI);
  const cy = 7.5;
  const hrs = [10.1, 1.6, 4.4][variant % 3];
  for (let k = 0; k < 4; k++) {
    const yaw = (k * Math.PI) / 2;
    const q = qEuler(0, yaw, 0);
    const at = (x: number, y: number, z: number): THREE.Vector3 =>
      V(x, y, z)
        .applyQuaternion(q)
        .add(V(0, cy, 0));
    put(acc, new THREE.CircleGeometry(0.82, 10), at(0, 0, 1.46), col(WALLS[1]), {
      q,
      emissive: 0.35,
      ao: () => 1,
    });
    put(
      acc,
      new THREE.CylinderGeometry(0.88, 0.88, 0.1, 10, 1, true),
      at(0, 0, 1.46),
      col(WOOD.dark),
      { q: q.clone().multiply(qEuler(Math.PI / 2, 0, 0)), aoAmt: 0, double: true },
    );
    const hand = (len: number, w: number, ang: number, z: number): void => {
      const qq = q.clone().multiply(qEuler(0, 0, -ang));
      const base = at(0, 0, 1.5 + z);
      const tip = V(0, len / 2, 0).applyQuaternion(qq);
      put(acc, new THREE.BoxGeometry(w, len, 0.04), base.add(tip), col(WOOD.dark), {
        q: qq,
        aoAmt: 0,
      });
    };
    hand(0.6, 0.08, 0.6, 0.02);
    hand(0.42, 0.1, (hrs / 12) * TAU, 0.05);
  }
  return acc.finish(rng, false, true);
}

export function giantTree({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('giant');
  const acc = new Acc();
  const noise = createNoise(r.fork('n'));
  const seg = lod === 0 ? 10 : 6;
  const trunkPts: Array<[number, number]> =
    lod === 0
      ? [
          [1.9, 0],
          [1.4, 1.0],
          [1.3, 3],
          [1.15, 6],
          [1.0, 9],
          [0.95, 12.8],
        ]
      : [
          [1.8, 0],
          [1.2, 5],
          [0.95, 12.8],
        ];
  put(
    acc,
    lathe(trunkPts, seg),
    [0, 0, 0],
    (p) =>
      col(p.y < 0.6 ? WOOD.dark : WOOD.logs).lerp(
        col(WOOD.dark),
        clamp01(Math.sin(p.y * 5 + Math.atan2(p.z, p.x) * 2) * 0.3),
      ),
    { aoAmt: 0.25 },
  );
  const flares = lod === 0 ? 3 : 0;
  const ph = r.range(0, TAU);
  for (let i = 0; i < flares; i++) {
    const a = ph + (i / 3) * TAU;
    const d = V(Math.cos(a), 0, Math.sin(a));
    const s = frustum(
      d.clone().multiplyScalar(0.9).setY(2.6),
      d.clone().multiplyScalar(3.2).setY(0.1),
      0.55,
      0.32,
      5,
      false,
    );
    acc.add(s.geo, { m: s.m, color: col(WOOD.dark), windMul: 0, aoAmt: 0.3, groundClamp: true });
  }
  // platform + treehouse + ladder
  const py = 7.0;
  put(acc, cylB(3.35, 3.35, 0.28, lod === 0 ? 8 : 6), [0, py, 0], col(WOOD.planks), {
    aoAmt: 0.15,
  });
  const hy = py + 0.28;
  acc.xf = mat([0, hy, 2.15]);
  house(acc, {
    rng: r,
    lod,
    w: 3.0,
    d: 1.8,
    y0: 0,
    wallH: 1.9,
    rise: 1.0,
    wall: cycle([WALLS[3], WALLS[2]], variant),
    roof: cycle([ROOFS[0], ROOFS[2]], variant),
    trim: WOOD.planks,
    nWin: 2,
    chimney: false,
    foundation: false,
    doorX: 0,
  });
  acc.xf = null;
  if (lod === 0) {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.62 + (i / 8) * (TAU - Math.PI * 0.62 * 2 + 0.0) * 0.88;
      if (Math.abs(Math.sin(a - Math.PI / 2)) < 0.0) continue;
      if (Math.cos(a - Math.PI / 2) > 0.55) continue;
      put(
        acc,
        cylB(0.05, 0.05, 0.6, 4, true),
        [Math.cos(a) * 3.2, hy, Math.sin(a) * 3.2],
        col(WOOD.logs),
        { aoAmt: 0.1 },
      );
    }
    // rope ladder from the back-left edge
    const ea = V(-2.4, py, -2.0);
    const gnd = V(-3.2, 0.05, -2.8);
    for (const dx of [-0.25, 0.25]) {
      const s = frustum(
        ea.clone().add(V(dx, 0.2, 0)),
        gnd.clone().add(V(dx, 0, 0)),
        0.035,
        0.035,
        4,
      );
      acc.add(s.geo, { m: s.m, color: col(TINT.rope), windMul: 0, aoAmt: 0 });
    }
    for (let i = 0; i < 9; i++) {
      const t = (i + 0.5) / 9;
      put(acc, new THREE.BoxGeometry(0.55, 0.06, 0.06), ea.clone().lerp(gnd, t), col(WOOD.planks), {
        aoAmt: 0,
      });
    }
  }
  // canopy
  const cg =
    variant % 2 === 0
      ? [FOLIAGE.deciduous[2], FOLIAGE.deciduous[1], FOLIAGE.deciduous[0]]
      : [FOLIAGE.deciduous[1], FOLIAGE.deciduous[0], GRASS[1]];
  const fn = (p: THREE.Vector3): THREE.Color => {
    const t = clamp01((p.y - 10) / 9) * 2;
    const i = Math.min(1, Math.floor(t));
    return col(cg[i]).lerp(col(cg[i + 1]), t - i);
  };
  const blobs: Array<[number, number, number, number]> = [
    [0, 14.0, 0, 4.2],
    [3.4, 12.4, 0.6, 3.1],
    [-3.2, 12.8, 1.4, 3.1],
    [0.4, 13.0, -3.3, 3.0],
    [1.0, 16.0, 0.6, 2.8],
  ];
  const used = lod === 0 ? blobs : blobs.slice(0, 4);
  used.forEach(([x, y, z, rad], i) => {
    put(acc, blob(rad, lod === 0 ? 1 : 0, noise, 0.1, 1.1, i * 2.7), [x, y, z], fn, {
      windMul: 1,
      aoAmt: 0.2,
      ao: (p) => 0.78 + 0.22 * clamp01((p.y - (y - rad)) / (rad * 1.6)),
    });
  });
  return acc.finish(rng, true, true);
}

export function sunkenShip({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('ship');
  const acc = new Acc();
  const L = 11;
  const W = 3.8;
  const outer = (k: number): THREE.Shape => {
    const s = new THREE.Shape();
    const h = L / 2;
    const w = W / 2;
    s.moveTo(-w * 0.75 * k, -h * k);
    s.lineTo(w * 0.75 * k, -h * k);
    s.lineTo(w * k, -h * 0.4 * k);
    s.lineTo(w * 0.96 * k, h * 0.35 * k);
    s.lineTo(0, h * k);
    s.lineTo(-w * 0.96 * k, h * 0.35 * k);
    s.lineTo(-w * k, -h * 0.4 * k);
    s.closePath();
    return s;
  };
  const ring = outer(1);
  const hole = new THREE.Path();
  const inner = outer(0.8).getPoints();
  inner.reverse().forEach((p, i) => (i === 0 ? hole.moveTo(p.x, p.y) : hole.lineTo(p.x, p.y)));
  ring.holes.push(hole);
  const lowerH = 1.0;
  const upperH = 1.5;
  const mk = (s: THREE.Shape, d: number, y: number, sx: number): THREE.BufferGeometry =>
    new THREE.ExtrudeGeometry(s, {
      depth: d,
      bevelEnabled: false,
      steps: lod === 0 ? Math.round(d / 0.33) : 1,
    })
      .rotateX(Math.PI / 2)
      .scale(sx, 1, 1)
      .translate(0, y, 0);
  const lower = mk(outer(1), lowerH, lowerH, 0.78);
  const upper = mk(lod === 0 ? ring : outer(1), upperH, lowerH + upperH, 1);
  // tilt: roll + pitch, then lift so the lowest point is the seabed
  const tilt = qEuler(-0.1, 0.0, variant % 2 === 0 ? 0.3 : -0.3);
  const bb = new THREE.Box3()
    .setFromBufferAttribute(lower.getAttribute('position') as THREE.BufferAttribute)
    .applyMatrix4(mat([0, 0, 0], tilt));
  const M = mat([0, -bb.min.y, 0], tilt);
  const alga = col(TINT.seaweed);
  const inv = M.clone().invert();
  const planks = (pw: THREE.Vector3): THREE.Color => {
    const p = pw.clone().applyMatrix4(inv); // hull-local so rows follow the tilted planking
    const row = Math.floor(p.y / 0.33);
    const base = col(row % 2 === 0 ? WOOD.dark : WOOD.logs);
    return base.lerp(alga, clamp01(0.8 - p.y * 0.35) * 0.7);
  };
  acc.add(lower, { m: M, color: planks, windMul: 0, aoAmt: 0.25 });
  acc.add(upper, {
    m: M,
    color: (p) =>
      p.clone().applyMatrix4(inv).y > lowerH + upperH - 0.03 ? col(WOOD.planks) : planks(p),
    windMul: 0,
    aoAmt: 0.1,
  });
  const local = (
    g: THREE.BufferGeometry,
    p: [number, number, number],
    c: THREE.Color | ((p: THREE.Vector3) => THREE.Color),
    q?: THREE.Quaternion,
  ): void => {
    acc.add(g, { m: compose(M, mat(p, q ?? null)), color: c, windMul: 0, aoAmt: 0.15 });
  };
  // stern cabin
  local(
    lod === 0 ? bevBox(2.5, 1.6, 2.6, 0.1).translate(0, 0.8, 0) : baseBox(2.5, 1.6, 2.6),
    [0, lowerH + 0.1, -3.2],
    col(WOOD.logs),
  );
  // broken mast + yard
  local(
    cylB(0.24, 0.16, lod === 0 ? 3.8 : 3.2, lod === 0 ? 6 : 4),
    [0, lowerH + 0.1, 0.9],
    col(WOOD.dark),
    qEuler(0.12, 0, -0.08),
  );
  if (lod === 0) {
    local(
      new THREE.ConeGeometry(0.17, 0.55, 5),
      [0.0, lowerH + 4.05, 0.82],
      col(WOOD.planks),
      qEuler(0.2, 0, -0.5),
    );
    local(
      new THREE.BoxGeometry(3.4, 0.2, 0.2),
      [0.3, lowerH + 2.5, 0.9],
      col(WOOD.dark),
      qEuler(0.1, 0.2, 0.15),
    );
    // ribs poking out of the broken stern
    for (let i = 0; i < 4; i++) {
      const s = i % 2 === 0 ? 1 : -1;
      local(
        new THREE.BoxGeometry(0.16, 1.5, 0.16),
        [s * 1.55, lowerH + upperH + 0.3, -1.2 - i * 0.9],
        col(WOOD.dark),
        qEuler(r.range(-0.15, 0.15), 0, -s * 0.25),
      );
    }
  }
  // seaweed strips on the seabed around the hull
  const nS = lod === 0 ? 7 : 3;
  for (let i = 0; i < nS; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const z = -4.5 + (i / Math.max(1, nS - 1)) * 9;
    const x = side * (2.6 + r.range(0, 0.5));
    const hgt = r.range(1.4, 2.3);
    const lean = r.range(-0.5, 0.5);
    const g = gridSurface(1, lod === 0 ? 3 : 1, (u, v) =>
      V(x + (u - 0.5) * 0.28 + lean * v * v * 0.8, v * hgt, z + 0.3 * Math.sin(v * 2.5 + i)),
    );
    acc.add(g, {
      m: mat([0, 0, 0]),
      color: col(TINT.seaweed).lerp(col(FOLIAGE.palm[1]), (i % 3) / 4),
      double: true,
      windMul: 0,
      aoAmt: 0.2,
      windAbs: (p) => clamp01(p.y / hgt),
    });
  }
  return acc.finish(rng, false, true);
}

export function hotSpring({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('spring');
  const acc = new Acc();
  const noise = createNoise(r.fork('n'));
  const n = lod === 0 ? 9 : 5;
  const ph = r.range(0, TAU);
  const shades = [ROCK[0], ROCK[1], ROCK[2]];
  for (let i = 0; i < n; i++) {
    const a = ph + (i / n) * TAU + r.range(-0.1, 0.1);
    const rad = r.range(0.62, 0.9) * (lod === 0 ? 1 : 1.2);
    const geo =
      lod === 0 ? blob(rad, 0, noise, 0.2, 1.1, i * 2) : new THREE.OctahedronGeometry(rad, 0);
    put(
      acc,
      geo,
      [Math.cos(a) * 2.55, rad * 0.45, Math.sin(a) * 2.55],
      col(shades[(i + variant) % 3]),
      {
        s: [1.1, 0.8, 1.1],
        q: qEuler(0, r.range(0, TAU), 0),
        cullY: 0,
        groundClamp: true,
        aoAmt: 0.25,
      },
    );
  }
  put(
    acc,
    new THREE.CircleGeometry(2.4, lod === 0 ? 14 : 6).rotateX(-Math.PI / 2),
    [0, 0.18, 0],
    (p) => col(HOT_SPRING).lerp(col(WALLS[1]), clamp01((Math.hypot(p.x, p.z) - 1.6) / 1.2) * 0.5),
    { aoAmt: 0, ao: () => 1 },
  );
  if (lod === 0) {
    for (let i = 0; i < 4; i++) {
      const a = ph + 0.4 + i * 1.6;
      put(
        acc,
        new THREE.TetrahedronGeometry(0.2, 0),
        [Math.cos(a) * 3.5, 0.1, Math.sin(a) * 3.5],
        col(ROCK[0]),
        { groundClamp: true, aoAmt: 0.2 },
      );
    }
  }
  return acc.finish(rng, false, true);
}

export function volcanoCrater({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng);
  const seg = lod === 0 ? 16 : 8;
  const lava = col(EMISSIVE.lava);
  put(
    acc,
    new THREE.CircleGeometry(4.0, seg).rotateX(-Math.PI / 2),
    [0, 0.12, 0],
    (p) => {
      const rr = Math.hypot(p.x, p.z) / 4;
      const a = Math.atan2(p.z, p.x);
      return lava
        .clone()
        .lerp(col('#FFB070'), clamp01(1 - rr * 1.2) * 0.45)
        .multiplyScalar(0.9 + 0.2 * Math.abs(Math.sin(a * 3)));
    },
    // 0.8 → always-on lava glow with the 3 s pulse (factory emissive convention), not night-only
    { emissive: 0.8, ao: () => 1, aoAmt: 0 },
  );
  const prof: Array<[number, number]> =
    lod === 0
      ? [
          [4.0, 0.1],
          [4.1, 0.3],
          [4.7, 0.34],
          [5.4, 0],
        ]
      : [
          [4.1, 0.3],
          [5.4, 0],
        ];
  put(
    acc,
    lathe(prof, seg),
    [0, 0, 0],
    (p) =>
      col(TINT.basalt).lerp(col(ROCK[2]), clamp01(Math.sin(Math.atan2(p.z, p.x) * 5) * 0.5 + 0.2)),
    { aoAmt: 0.1 },
  );
  void V2;
  void prism;
  return acc.finish(rng, false, true);
}
