import * as THREE from 'three';
import { FOLIAGE, MUSHROOM_CAP, WALLS, WOOD } from '../content/palette.ts';
import { Acc, blob, col, createNoise, frustum, gradY, mat, qEuler, qFromTo } from './kit.ts';
import type { BuildOpts } from './types.ts';

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const pick3 = <T>(v: number, a: readonly T[]): T => a[v % a.length];

interface LeafOpts {
  origin: THREE.Vector3;
  az: number;
  pitch0: number;
  len: number;
  segs: number;
  droop: number;
  base: string;
  tip: string;
}

/** One drooping palm leaf: folded (V) strip, top + bottom skin so it is lit from both sides. */
function leaf(acc: Acc, o: LeafOpts): void {
  const stations: THREE.Vector3[] = [o.origin.clone()];
  const dirs: THREE.Vector3[] = [];
  for (let k = 0; k < o.segs; k++) {
    const pitch = o.pitch0 - k * o.droop;
    const d = new THREE.Vector3(
      Math.cos(o.az) * Math.cos(pitch),
      Math.sin(pitch),
      Math.sin(o.az) * Math.cos(pitch),
    );
    dirs.push(d);
    stations.push(stations[k].clone().addScaledVector(d, o.len / o.segs));
  }
  const widths = o.segs === 1 ? [0.2, 0] : [0.1, 0.34, 0.27, 0];
  const L: THREE.Vector3[] = [];
  const R: THREE.Vector3[] = [];
  stations.forEach((m, j) => {
    const d = dirs[Math.min(j, o.segs - 1)];
    const side = new THREE.Vector3().crossVectors(d, UP).normalize();
    const w = widths[j];
    L.push(
      m
        .clone()
        .addScaledVector(side, w)
        .addScaledVector(UP, -0.35 * w),
    );
    R.push(
      m
        .clone()
        .addScaledVector(side, -w)
        .addScaledVector(UP, -0.35 * w),
    );
  });
  const cb = col(o.base);
  const ct = col(o.tip);
  const topFn = (p: THREE.Vector3): THREE.Color =>
    cb.clone().lerp(ct, Math.min(1, p.distanceTo(o.origin) / o.len));
  const botFn = (p: THREE.Vector3): THREE.Color => topFn(p).multiplyScalar(0.8);
  const aoFn = (p: THREE.Vector3): number =>
    0.85 + 0.15 * Math.min(1, p.distanceTo(o.origin) / 0.9);
  const down = UP.clone().negate();
  for (let j = 0; j < o.segs; j++) {
    for (const [a, b] of [
      [L, stations],
      [stations, R],
    ] as const) {
      const quad = [a[j], b[j], b[j + 1], a[j + 1]];
      acc.addPoly(quad, UP, { color: topFn, windMul: 1, ao: aoFn });
      acc.addPoly(quad, down, { color: botFn, windMul: 1, ao: aoFn });
    }
  }
}

export function palm({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('palm');
  const acc = new Acc();
  const H = pick3(variant, [5.4, 6.1, 6.8]) * r.range(0.96, 1.04);
  const lean = r.range(8, 25) * (Math.PI / 180);
  const az = r.range(0, TAU);
  const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const k = Math.tan(lean) / 2;
  const N = lod === 0 ? 6 : 2;
  const radial = lod === 0 ? 8 : 5;
  const pts: THREE.Vector3[] = [];
  const rad: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(
      dir
        .clone()
        .multiplyScalar(k * H * t * t)
        .setY(H * 0.97 * t),
    );
    rad.push(0.23 - 0.12 * t);
  }
  for (let i = 0; i < N; i++) {
    const { geo, m } = frustum(pts[i], pts[i + 1], rad[i] * 1.06, rad[i + 1] * 0.94, radial);
    acc.add(geo, {
      m,
      color: col(i % 2 === 0 ? WOOD.logs : WOOD.dark),
      windMul: 0.8,
      aoAmt: 0.22,
    });
  }
  const top = pts[N];
  const leaves = 7;
  const segs = lod === 0 ? 3 : 1;
  const phase = r.range(0, TAU);
  for (let i = 0; i < leaves; i++) {
    leaf(acc, {
      origin: top.clone().add(new THREE.Vector3(0, 0.05, 0)),
      az: phase + (i / leaves) * TAU + r.range(-0.2, 0.2),
      pitch0: lod === 0 ? r.range(0.3, 0.6) : r.range(0.0, 0.2),
      len: r.range(2.1, 2.6),
      segs,
      droop: lod === 0 ? r.range(0.5, 0.65) : 0,
      base: FOLIAGE.palm[1],
      tip: FOLIAGE.palm[0],
    });
  }
  if (lod === 0) {
    const nc = 2 + (variant % 2);
    const noise = createNoise(r.fork('nut'));
    for (let i = 0; i < nc; i++) {
      const a = phase + (i / nc) * TAU + r.range(-0.4, 0.4);
      const p = top.clone().add(new THREE.Vector3(Math.cos(a) * 0.17, -0.12, Math.sin(a) * 0.17));
      acc.add(blob(0.13, 1, noise, 0.06, 2, i), {
        m: mat(p),
        color: col(WOOD.dark),
        windMul: 0.9,
        aoAmt: 0.2,
      });
    }
  }
  return acc.finish(rng, true);
}

export function roundTree({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('round');
  const acc = new Acc();
  const noise = createNoise(r.fork('n'));
  const H = pick3(variant, [4.4, 5.0, 5.8]) * r.range(0.96, 1.04);
  const lean = new THREE.Vector3(r.range(-0.15, 0.15), 0, r.range(-0.15, 0.15));
  const tTop = new THREE.Vector3(lean.x, H * 0.62, lean.z);
  const t = frustum(new THREE.Vector3(0, 0, 0), tTop, 0.3, 0.17, lod === 0 ? 8 : 5);
  acc.add(t.geo, { m: t.m, color: col(WOOD.logs), windMul: 0.8, aoAmt: 0.25 });
  const n = lod === 0 ? 3 + (variant % 3) : 2;
  const d = lod === 0 ? 1 : 0;
  const R0 = H * 0.29;
  const fn = gradY([FOLIAGE.deciduous[2], FOLIAGE.deciduous[1], FOLIAGE.deciduous[0]], H * 0.36, H);
  for (let i = 0; i < n; i++) {
    const main = i === 0;
    const rr = main ? R0 : R0 * r.range(0.72, 0.9) * (1 + r.range(-0.15, 0.15) * 0.5);
    const a = (i / (n - 1 || 1)) * TAU + r.range(-0.4, 0.4);
    const off = main ? 0 : R0 * r.range(0.6, 0.85);
    const c = new THREE.Vector3(
      Math.cos(a) * off + lean.x,
      H * (main ? 0.66 : 0.56 + r.range(0, 0.09)),
      Math.sin(a) * off + lean.z,
    );
    acc.add(blob(rr, d, noise, 0.1, 1.2, i * 3.1), {
      m: mat(c, null, [1, 0.88, 1]),
      color: fn,
      windMul: 1,
      aoAmt: 0.22,
    });
  }
  return acc.finish(rng, true);
}

/** Cone with a noisy skirt: lower ring radius jittered by position-noise (crack-free). */
function skirtCone(
  r: number,
  h: number,
  radial: number,
  hs: number,
  noise: ReturnType<typeof createNoise>,
  amp: number,
) {
  const g = new THREE.ConeGeometry(r, h, radial, hs, false);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const w = Math.min(1, Math.max(0, 0.5 - p.getY(i) / h));
    const k = 1 + w * amp * noise.n3(p.getX(i) * 1.7, p.getY(i) * 1.7, p.getZ(i) * 1.7);
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  return g;
}

export function pine({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('pine');
  const acc = new Acc();
  const noise = createNoise(r.fork('n'));
  const H = pick3(variant, [6, 7.4, 8.6]) * r.range(0.96, 1.04);
  const trunkTop = H * 0.5;
  const t = frustum(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, trunkTop, 0),
    0.22,
    0.12,
    lod === 0 ? 8 : 5,
  );
  acc.add(t.geo, { m: t.m, color: col(WOOD.dark), windMul: 0.8, aoAmt: 0.25 });
  let h = 0.55 * H;
  let base = 0.17 * H;
  let rad = 0.19 * H;
  const fn = gradY([FOLIAGE.pine[1], FOLIAGE.pine[0]], H * 0.15, H);
  const tiers = lod === 0 ? 3 : 2;
  for (let i = 0; i < tiers; i++) {
    const g = skirtCone(rad, h, lod === 0 ? 10 : 6, lod === 0 ? 2 : 1, noise, lod === 0 ? 0.14 : 0);
    acc.add(g, {
      m: mat([0, base + h / 2, 0], qEuler(0, r.range(0, TAU), 0)),
      color: fn,
      windMul: 1,
      aoAmt: 0.25,
    });
    base += h * 0.55;
    h *= 0.7;
    rad *= 0.7;
  }
  return acc.finish(rng, true);
}

export function treeBlob({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('blob');
  const acc = new Acc();
  const noise = createNoise(r.fork('n'));
  const H = pick3(variant, [4.4, 5.0, 5.8]);
  const fn = gradY([FOLIAGE.deciduous[2], FOLIAGE.deciduous[1], FOLIAGE.deciduous[0]], H * 0.35, H);
  if (lod === 0) {
    const t = frustum(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, H * 0.5, 0), 0.28, 0.18, 3);
    acc.add(t.geo, { m: t.m, color: col(WOOD.logs), windMul: 0.8, aoAmt: 0.2 });
    acc.add(blob(H * 0.3, 0, noise, 0.1), {
      m: mat([0, H * 0.66, 0], null, [1, 0.9, 1]),
      color: fn,
      aoAmt: 0.22,
    });
    const a = r.range(0, TAU);
    acc.add(blob(H * 0.22, 0, noise, 0.1, 1.4, 4), {
      m: mat([Math.cos(a) * H * 0.2, H * 0.55, Math.sin(a) * H * 0.2]),
      color: fn,
      aoAmt: 0.2,
    });
  } else {
    acc.add(new THREE.OctahedronGeometry(H * 0.34, 0), {
      m: mat([0, H * 0.62, 0], null, [1, 1.1, 1]),
      color: fn,
      aoAmt: 0.25,
    });
  }
  return acc.finish(rng, true);
}

export function giantMushroom({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('mush');
  const acc = new Acc();
  const H = pick3(variant, [2.0, 1.85]) * r.range(0.97, 1.03);
  const yc = H * 0.52; // cap ellipsoid centre (rim height)
  const R = pick3(variant, [0.92, 1.05]) * r.range(0.95, 1.05);
  const Hc = H - yc - 0.02;
  const seg = lod === 0 ? 12 : 6;
  const stemPts =
    lod === 0
      ? [
          [0.3, 0],
          [0.24, yc * 0.35],
          [0.2, yc * 0.75],
          [0.2, yc + 0.05],
        ]
      : [
          [0.28, 0],
          [0.2, yc + 0.05],
        ];
  acc.add(
    new THREE.LatheGeometry(
      stemPts.map(([x, y]) => new THREE.Vector2(x, y)),
      seg,
    ),
    {
      color: col(WALLS[0]),
      windMul: 0,
      aoAmt: 0.22,
    },
  );
  const thetas = lod === 0 ? [Math.PI / 2, 1.2, 0.85, 0.5, 0.2, 0] : [Math.PI / 2, 0.8, 0];
  const dome = thetas.map((th) => new THREE.Vector2(R * Math.sin(th), yc + Hc * Math.cos(th)));
  const capTop = col(MUSHROOM_CAP).lerp(col(WALLS[2]), 0.18);
  const capBase = col(MUSHROOM_CAP);
  acc.add(new THREE.LatheGeometry(dome, seg), {
    color: (p) => capBase.clone().lerp(capTop, Math.min(1, Math.max(0, (p.y - yc) / Hc))),
    aoAmt: 0.2,
  });
  if (lod === 0) {
    acc.add(
      new THREE.LatheGeometry(
        [new THREE.Vector2(0.2, yc + 0.06), new THREE.Vector2(R * 0.985, yc - 0.005)],
        seg,
      ),
      { color: col(WALLS[3]), aoAmt: 0.25 },
    );
    const ns = r.int(5, 7);
    for (let i = 0; i < ns; i++) {
      const th = r.range(0.2, 1.0);
      const ph = (i / ns) * TAU + r.range(-0.3, 0.3);
      const p = new THREE.Vector3(
        R * Math.sin(th) * Math.cos(ph),
        Hc * Math.cos(th),
        R * Math.sin(th) * Math.sin(ph),
      );
      const n = new THREE.Vector3(p.x / (R * R), p.y / (Hc * Hc), p.z / (R * R)).normalize();
      const rs = r.range(0.09, 0.15);
      acc.add(new THREE.CircleGeometry(rs, 6), {
        m: mat(
          p
            .clone()
            .add(new THREE.Vector3(0, yc, 0))
            .addScaledVector(n, 0.05),
          qFromTo(new THREE.Vector3(0, 0, 1), n),
        ),
        color: col(WALLS[1]),
        windMul: 0,
        ao: () => 1,
      });
    }
  }
  return acc.finish(rng, false);
}
