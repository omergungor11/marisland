import * as THREE from 'three';
import { FLOWERS, FOLIAGE, GRASS, HAY, ROCK, SAND, WOOD } from '../content/palette.ts';
import { Acc, blob, col, createNoise, frustum, gradY, mat, qEuler } from './kit.ts';
import type { BuildOpts } from './types.ts';

const TAU = Math.PI * 2;
const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const deciduousRev = [FOLIAGE.deciduous[2], FOLIAGE.deciduous[1], FOLIAGE.deciduous[0]];

export function bush({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('bush');
  const acc = new Acc();
  const noise = createNoise(r.fork('n'));
  const fn = gradY(deciduousRev, 0, 0.95);
  const blobs: { p: THREE.Vector3; r: number; d: number }[] =
    variant % 2 === 0
      ? [
          { p: V(-0.14, 0.38, 0), r: 0.5, d: 1 },
          { p: V(0.26, 0.33, 0.06), r: 0.4, d: 1 },
        ]
      : [
          { p: V(-0.1, 0.4, -0.05), r: 0.5, d: 1 },
          { p: V(0.3, 0.3, 0.1), r: 0.34, d: 0 },
          { p: V(0.05, 0.3, 0.32), r: 0.3, d: 0 },
        ];
  const used = lod === 0 ? blobs : blobs.slice(0, 1);
  used.forEach((b, i) => {
    const jr = 1 + r.range(-0.06, 0.06);
    acc.add(blob(b.r * jr, lod === 0 ? b.d : 0, noise, 0.1, 1.3, i * 2.3), {
      m: mat(b.p),
      color: fn,
      cullY: 0.04,
      groundClamp: true,
      aoAmt: 0.22,
    });
  });
  if (lod === 0 && variant % 2 === 0) {
    for (let i = 0; i < 3; i++) {
      const b = blobs[i % 2];
      const a = r.range(0, TAU);
      const el = r.range(0.35, 1.0);
      const d = V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
      acc.add(new THREE.TetrahedronGeometry(0.07, 0), {
        m: mat(b.p.clone().addScaledVector(d, b.r * 1.0), qEuler(r.range(0, 3), r.range(0, 3), 0)),
        color: col(
          FLOWERS[(i * 2 + variant) % FLOWERS.length === 1 ? 0 : (i * 2) % FLOWERS.length],
        ),
        aoAmt: 0,
      });
    }
  }
  return acc.finish(rng, true);
}

export function cropRow({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('crop');
  const acc = new Acc();
  const green = variant % 2 === 0;
  const plant = col(green ? GRASS[2] : HAY).lerp(col(GRASS[1]), green ? 0 : 0.25);
  const soil = col(WOOD.dark).lerp(col(SAND.wet), 0.15);
  acc.add(new THREE.BoxGeometry(2, 0.1, 0.5), {
    m: mat([0, 0.05, 0]),
    color: soil,
    windMul: 0,
    aoAmt: 0.2,
  });
  if (lod === 1) {
    acc.add(new THREE.CylinderGeometry(0.15, 0.15, 1.9, 4, 1, true), {
      m: mat([0, 0.2, 0], qEuler(0, 0, Math.PI / 2), [1, 1, 0.8]),
      color: plant,
      aoAmt: 0.2,
    });
    return acc.finish(rng, true);
  }
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x = -0.85 + (i * 1.7) / (n - 1) + r.range(-0.03, 0.03);
    const s = r.range(0.9, 1.1);
    const fn = gradY(
      [GRASS[3], GRASS[0]].map((h, k) => (green ? h : k ? HAY : WOOD.logs)),
      0.08,
      0.42,
    );
    if (green) {
      acc.add(new THREE.IcosahedronGeometry(0.17 * s, 0), {
        m: mat([x, 0.2 * s, 0], qEuler(0, r.range(0, 3), 0), [1, 1.15, 1]),
        color: plant,
        cullY: 0.08,
        groundClamp: true,
        aoAmt: 0.22,
      });
    } else {
      acc.add(new THREE.ConeGeometry(0.1 * s, 0.34 * s, 5, 1, false), {
        m: mat([x, 0.1 + 0.17 * s, 0]),
        color: fn,
        aoAmt: 0.25,
      });
    }
  }
  return acc.finish(rng, true);
}

export function haybale({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = new Acc();
  const hr = rng.fork('hay');
  const L = 1.2 * hr.range(0.95, 1.05);
  const R = 0.5 * hr.range(0.95, 1.05);
  const b = lod === 0 ? 0.1 : 0;
  const pts =
    lod === 0
      ? [
          [0, -L / 2],
          [R - b, -L / 2],
          [R, -L / 2 + b],
          [R, L / 2 - b],
          [R - b, L / 2],
          [0, L / 2],
        ]
      : [
          [0, -L / 2],
          [R, -L / 2],
          [R, L / 2],
          [0, L / 2],
        ];
  const lathe = new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    lod === 0 ? 12 : 6,
  );
  const side = col(HAY);
  const cap = col(HAY).multiplyScalar(0.82);
  const lying = variant % 2 === 0;
  const axisOf = (p: THREE.Vector3): number => (lying ? p.x : p.y - L / 2);
  const m = lying
    ? mat([0, R, 0], qEuler(0, 0, Math.PI / 2))
    : mat([0, L / 2, 0], qEuler(0, hr.range(0, TAU), 0));
  acc.add(lathe, {
    m,
    color: (p) => (Math.abs(axisOf(p)) > L / 2 - 1e-3 ? cap : side),
    windMul: 0,
    aoAmt: 0.18,
  });
  return acc.finish(rng, false);
}

export function reeds({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('reeds');
  const acc = new Acc();
  const n = lod === 0 ? 5 + (variant % 2) : 1;
  const stem = gradY([GRASS[3], GRASS[2], GRASS[1]], 0, 0.8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r.range(-0.5, 0.5);
    const rr = lod === 0 ? r.range(0.03, 0.22) : 0;
    const base = V(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    const h = lod === 0 ? r.range(0.55, 0.78) : 0.7;
    const la = r.range(0, TAU);
    const lean = lod === 0 ? r.range(0.05, 0.25) : 0.1;
    const dir = V(Math.sin(lean) * Math.cos(la), Math.cos(lean), Math.sin(lean) * Math.sin(la));
    const top = base.clone().addScaledVector(dir, h);
    const w = lod === 0 ? 1 : 2.6;
    const s = frustum(base, top, 0.03 * w, 0.02 * w, 3);
    acc.add(s.geo, { m: s.m, color: stem, aoAmt: 0.25 });
    const tipEnd = top.clone().addScaledVector(dir, 0.17);
    const t = frustum(top.clone().addScaledVector(dir, -0.02), tipEnd, 0.05 * w, 0, 3);
    acc.add(t.geo, { m: t.m, color: col(WOOD.dark), aoAmt: 0 });
  }
  return acc.finish(rng, true);
}

/** Petal head; reused by flower + lily pad. */
function flowerHead(
  acc: Acc,
  base: THREE.Vector3,
  scale: number,
  stemH: number,
  petalHex: string,
  lod: number,
  rng: BuildOpts['rng'],
  tilt: number,
): void {
  const top = base.clone().add(V(0, stemH, 0));
  if (stemH > 0) {
    const s = frustum(base, top, 0.012 * scale, 0.008 * scale, 3);
    acc.add(s.geo, { m: s.m, color: col(GRASS[2]), aoAmt: 0.2 });
  }
  const c = top.clone().add(V(0, 0.01 * scale, 0));
  if (lod === 1) {
    acc.add(new THREE.OctahedronGeometry(0.06 * scale, 0), {
      m: mat(c, null, [1, 0.6, 1]),
      color: col(petalHex),
      aoAmt: 0,
    });
    return;
  }
  acc.add(new THREE.OctahedronGeometry(0.032 * scale, 0), {
    m: mat(c),
    color: col(FLOWERS[1]),
    aoAmt: 0,
  });
  const ph = rng.range(0, TAU);
  for (let i = 0; i < 5; i++) {
    const az = ph + (i / 5) * TAU;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -az, tilt));
    const pos = c.clone().add(V(Math.cos(az) * 0.05 * scale, 0, Math.sin(az) * 0.05 * scale));
    acc.add(new THREE.OctahedronGeometry(0.04 * scale, 0), {
      m: mat(pos, q, [1.5, 0.45, 1]),
      color: col(petalHex),
      aoAmt: 0,
    });
  }
}

export function flower({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('flower');
  const acc = new Acc();
  const petals = [FLOWERS[0], FLOWERS[2], FLOWERS[3], FLOWERS[4]];
  const hex = petals[(variant * 2 + r.int(0, 1)) % petals.length];
  flowerHead(acc, V(0, 0, 0), 1, r.range(0.15, 0.18), hex, lod, r, 0.25);
  return acc.finish(rng, true);
}

export function lilyPad({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('lily');
  const acc = new Acc();
  const R = r.range(0.32, 0.4);
  const segs = lod === 0 ? 14 : 4;
  const g = new THREE.CircleGeometry(R, segs, 0, (TAU * 14) / 16);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    if (Math.hypot(p.getX(i), p.getY(i)) > 0.01) p.setZ(i, 0.03);
  }
  g.rotateX(-Math.PI / 2);
  g.rotateY(r.range(0, TAU));
  const fn = (q: THREE.Vector3): THREE.Color =>
    col(FOLIAGE.deciduous[2]).lerp(
      col(FOLIAGE.deciduous[1]),
      Math.min(1, Math.hypot(q.x, q.z) / R),
    );
  acc.add(g, { m: mat([0, 0.01, 0]), color: fn, windMul: 0, ao: () => 1 });
  if (variant % 2 === 1) {
    flowerHead(
      acc,
      V(0.03, 0.03, 0.02),
      2.2,
      0.06,
      FLOWERS[variant % 4 === 1 ? 0 : 2],
      lod,
      r,
      0.7,
    );
  }
  return acc.finish(rng, false);
}

export function grassTuft({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('tuft');
  const acc = new Acc();
  const n = lod === 0 ? 4 + (variant % 2) : 1;
  const fn = gradY([GRASS[3], GRASS[1], GRASS[0]], 0, 0.3);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * TAU + r.range(-0.4, 0.4);
    const h = r.range(0.22, 0.3);
    const tilt = lod === 0 ? r.range(0.15, 0.5) : 0.2;
    const q = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(0, az, 0))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)));
    const off = lod === 0 ? 0.035 : 0;
    const geo = new THREE.ConeGeometry(0.055, h, lod === 0 ? 4 : 3, 1, true);
    const centre = V(Math.cos(az) * off, 0, Math.sin(az) * off).add(
      V(0, h / 2, 0).applyQuaternion(q),
    );
    acc.add(geo, {
      m: mat(centre, q, lod === 0 ? [1.4, 1, 0.4] : [2, 1, 0.6]),
      color: fn,
      groundClamp: true,
      aoAmt: 0.22,
    });
  }
  return acc.finish(rng, true);
}

export function rockCluster({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('rocks');
  const acc = new Acc();
  const noise = createNoise(r.fork('n'));
  const cls = variant % 3;
  const mainR = [0.3, 0.78, 1.7][cls] * r.range(0.95, 1.05);
  const count = [2, 3, 5][cls];
  const H = [0.35, 0.9, 1.95][cls];
  const bands = [ROCK[2], ROCK[1], ROCK[0]];
  const strata = (q: THREE.Vector3) => {
    const t = Math.max(0, q.y) / H;
    // hard bands so the layers read as strata
    const i = Math.min(2, Math.floor(t * 2.2 + 0.2 * Math.sin(q.x * 3 + q.z * 2)));
    return col(bands[Math.max(0, i)]);
  };
  const n = lod === 0 ? count : Math.min(count, 3);
  const ph = r.range(0, TAU);
  for (let i = 0; i < n; i++) {
    const main = i === 0;
    const rr = main ? mainR : mainR * r.range(0.4, 0.62);
    const a = ph + (i / n) * TAU + r.range(-0.3, 0.3);
    const dist = main ? 0 : mainR * r.range(0.85, 1.1);
    const d = lod === 0 && i < 3 ? 1 : 0;
    acc.add(blob(rr, d, noise, 0.22, 1.1, i * 5.5), {
      m: mat(
        [Math.cos(a) * dist, rr * 0.3, Math.sin(a) * dist],
        qEuler(0, r.range(0, TAU), 0),
        [1, 0.8, 1.05],
      ),
      color: strata,
      windMul: 0,
      cullY: 0.01,
      groundClamp: true,
      aoAmt: 0.22,
    });
  }
  return acc.finish(rng, false);
}
